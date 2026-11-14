// El almacén de Aula: guarda y lee aula.json y tus archivos a través de un «adaptador»
// (modo demo en el navegador, o tu Google Drive). La interfaz le habla igual que antes hablaba
// con el servidor de Sites: con acciones como {action:'save', ...}.
import {createContext,useContext} from 'react';
import * as D from './doc';
import type {AulaDoc} from './doc';
import type {Item} from './types';
import type {Settings} from './settings';

export type User={name:string;email?:string;picture?:string};
export type UploadOptions={onProgress:(loaded:number)=>void;signal:AbortSignal;resume?:{get:()=>unknown;set:(v:unknown)=>void}};
export interface Adapter{
  kind:'demo'|'drive';
  user:User;
  // Lo último guardado (null si aún no hay nada) y guardar una versión nueva.
  read():Promise<AulaDoc|null>;
  write(doc:AulaDoc):Promise<void>;
  // Archivos: subir (devuelve su id), borrar y leer (este último solo hace falta sin service worker).
  upload(file:Blob,meta:{name:string;type:string},o:UploadOptions):Promise<string>;
  remove(id:string):Promise<void>;
  blob(id:string):Promise<Blob>;
  signOut():Promise<void>;
}

export class Store{
  doc:AulaDoc=D.emptyDoc();private chain:Promise<unknown>=Promise.resolve();
  constructor(public adapter:Adapter){}
  async load(){this.doc=(await this.adapter.read())??D.emptyDoc();return this.doc}
  // Los cambios van de uno en uno: se lee lo último (por si lo cambiaste en otro dispositivo),
  // se aplica el cambio y se guarda.
  private mutate<T>(fn:(d:AulaDoc)=>{doc:AulaDoc}&T):Promise<T>{
    const run=this.chain.then(async()=>{const latest=(await this.adapter.read())??this.doc;const r=fn(latest);await this.adapter.write(r.doc);this.doc=r.doc;return r});
    this.chain=run.catch(()=>{});return run;
  }
  get data(){return {lessons:this.doc.lessons,files:this.doc.files}}

  // ---------- Clases y archivos (antes /api/archive) ----------
  async archive(b:any):Promise<any>{
    switch(b.action){
      case 'save':return {id:(await this.mutate(d=>D.saveLesson(d,b))).id};
      case 'renameFile':await this.mutate(d=>({doc:D.renameFile(d,b.id,String(b.name??''))}));return {ok:true};
      case 'deleteFile':{const {item}=await this.mutate(d=>D.deleteFile(d,b.id));await this.adapter.remove(item.id).catch(()=>{});return {ok:true}}
      case 'deleteLesson':{const {removed}=await this.mutate(d=>D.deleteLesson(d,b.id));await Promise.all(removed.map(f=>this.adapter.remove(f.id).catch(()=>{})));return {ok:true}}
    }
    throw new D.UserError('Operación no válida.');
  }
  // Sube un archivo a una clase. Si la clase se borra mientras tanto, el archivo subido se quita.
  async upload(file:File,lesson:string,type:string,o:UploadOptions):Promise<Item>{
    if(!this.doc.lessons.some(l=>l.id===lesson))throw new D.UserError('Clase no encontrada.');
    const id=await this.adapter.upload(file,{name:file.name,type},o);
    const item:Item={id,lesson,name:file.name,type,size:file.size};
    try{await this.mutate(d=>({doc:D.addFile(d,item)}))}catch(e){await this.adapter.remove(id).catch(()=>{});throw e}
    return item;
  }

  // ---------- Calendario (antes /api/calendar) ----------
  calendarState(){return {events:this.doc.events,feed:this.doc.moodle.importedAt?{importedAt:this.doc.moodle.importedAt}:null}}
  async calendar(b:any):Promise<any>{
    switch(b.action){
      case 'import':{const {count}=await this.mutate(d=>D.importICS(d,String(b.ics??'')));return {...this.calendarState(),imported:count}}
      case 'save':await this.mutate(d=>({doc:D.saveEvent(d,b)}));return this.calendarState();
      case 'mark':await this.mutate(d=>({doc:D.markEvent(d,b)}));return {ok:true};
      case 'delete':await this.mutate(d=>({doc:D.deleteEvent(d,b.id)}));return this.calendarState();
    }
    throw new D.UserError('Operación no válida.');
  }

  // ---------- Ajustes (antes /api/settings) ----------
  async settings(b:any):Promise<any>{
    if(b.action==='save'){const r=await this.mutate(d=>D.saveSettings(d,b.settings));return {settings:this.doc.settings as Settings,remapped:r.remapped}}
    if(b.action==='moveLessons'){const r=await this.mutate(d=>D.moveLessons(d,String(b.from??''),String(b.to??'')));return {ok:true,moved:r.moved}}
    throw new D.UserError('Operación no válida.');
  }
  // Reemplaza todo (lo usa la importación desde Sites, antes de subir los archivos).
  async replace(fn:(d:AulaDoc)=>AulaDoc){return this.mutate(d=>({doc:fn(d)}))}
}

export const StoreContext=createContext<Store|null>(null);
export function useStore(){const s=useContext(StoreContext);if(!s)throw Error('Falta el almacén de Aula.');return s}

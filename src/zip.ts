// Descarga de una clase como ZIP sin compresión: conserva íntegros los originales.
// Primero intenta el modo inmediato (service worker que arma el ZIP mientras baja).
// Si el navegador no lo admite, lo construye en memoria como antes.
import {fileURL,type Item,type Lesson} from './types';
import {DEFAULT_SETTINGS,type Settings} from './settings';

export type ZipProgress={loaded:number;total:number;mode:'stream'|'memory'};
// file: id del archivo (el service worker lo saca de Drive o del navegador); url: para el modo en memoria.
type Entry={name:string;size:number;url?:string;file?:string;data?:Uint8Array};
const MEMORY_LIMIT=750*1024**2,ZIP_LIMIT=3.9e9;

function entriesFor(files:Item[],title:string,notes:string):Entry[]{
  const notesData=new TextEncoder().encode(title+'\n\n'+notes);
  return [...files.map((f,i)=>({name:String(i+1).padStart(2,'0')+'-'+f.name.replace(/[\\/]/g,'_'),size:f.size,url:fileURL(f,true),file:f.id})),{name:'notas.txt',size:notesData.length,data:notesData}];
}

const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const withTimeout=<T,>(p:Promise<T>,ms:number)=>Promise.race([p,new Promise<never>((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]);

async function zipWorker(){
  // iOS no gestiona bien descargas generadas por service workers.
  if(!('serviceWorker' in navigator)||!('ReadableStream' in window)||isIOS())return null;
  // Es el mismo service worker que sirve los archivos (se registra al abrir Aula, en main.tsx).
  const reg=await navigator.serviceWorker.ready;
  return reg.active;
}

async function streamZip(entries:Entry[],filename:string,onProgress:(p:ZipProgress)=>void){
  const sw=await withTimeout(zipWorker(),5000).catch(()=>null);if(!sw)return false;
  const token=crypto.randomUUID(),ch=new MessageChannel(),total=entries.reduce((s,e)=>s+e.size,0);
  let settle:{ok:()=>void;fail:(e:Error)=>void}|undefined;
  const ready=new Promise<void>(r=>{ch.port1.onmessage=e=>{const d=e.data;
    if(d.type==='ready')r();
    else if(d.type==='started')started();
    else if(d.type==='progress')onProgress({loaded:d.loaded,total,mode:'stream'});
    else if(d.type==='done'){onProgress({loaded:total,total,mode:'stream'});settle?.ok()}
    else if(d.type==='error')settle?.fail(new Error(d.message));
    else if(d.type==='cancel')settle?.ok();
  }});
  let started=()=>{};
  sw.postMessage({type:'zip',token,filename,entries},[ch.port2]);
  if(!await withTimeout(ready,3000).then(()=>true,()=>false))return false;
  const frame=document.createElement('iframe');frame.hidden=true;frame.src=`./__aula-zip/${token}/${encodeURIComponent(filename)}`;
  // Si el service worker no recibe la petición en unos segundos, se usa el modo en memoria.
  const begun=await withTimeout(new Promise<void>(r=>{started=r;document.body.appendChild(frame)}),6000).then(()=>true,()=>false);
  if(!begun){frame.remove();return false}
  onProgress({loaded:0,total,mode:'stream'});
  // Mensajes periódicos para que el navegador no detenga el service worker a mitad.
  const ping=setInterval(()=>sw.postMessage({type:'ping'}),10000);
  try{await new Promise<void>((ok,fail)=>{settle={ok,fail}})}finally{clearInterval(ping);setTimeout(()=>frame.remove(),60000)}
  return true;
}

const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc(a:Uint8Array){let c=0xffffffff;for(let i=0;i<a.length;i++)c=table[(c^a[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
function header(n:number){const a=new Uint8Array(n);return {a,v:new DataView(a.buffer)}}

async function memoryZip(entries:Entry[],filename:string,onProgress:(p:ZipProgress)=>void){
  const total=entries.reduce((s,e)=>s+e.size,0);
  if(total>MEMORY_LIMIT)throw Error('En este navegador la clase no puede pasar de 750 MB en un ZIP. Descarga sus archivos por separado.');
  let loaded=0;onProgress({loaded,total,mode:'memory'});
  // Tres descargas a la vez, leyendo por trozos para mostrar el avance real.
  const datas:Uint8Array[]=new Array(entries.length);let next=0;
  const worker=async()=>{while(next<entries.length){const i=next++,e=entries[i];if(e.data){datas[i]=e.data;continue}
    const r=await fetch(e.url!);if(!r.ok||!r.body)throw Error('No se pudo descargar '+e.name);
    const buf=new Uint8Array(e.size),reader=r.body.getReader();let off=0;
    for(;;){const {value,done}=await reader.read();if(done)break;if(off+value.length>buf.length)throw Error(e.name+' no coincide con su tamaño.');buf.set(value,off);off+=value.length;loaded+=value.length;onProgress({loaded,total,mode:'memory'})}
    if(off!==e.size)throw Error(e.name+' no ha llegado completo.');datas[i]=buf}};
  await Promise.all(Array.from({length:3},worker));
  const pieces:BlobPart[]=[],central:BlobPart[]=[],enc=new TextEncoder();let offset=0,cdLen=0;
  entries.forEach((e,i)=>{const data=datas[i],name=enc.encode(e.name),c=crc(data);
    const {a,v}=header(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,c,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);pieces.push(a,name,data as BlobPart);
    const h=header(46);h.v.setUint32(0,0x02014b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,20,true);h.v.setUint16(8,0x800,true);h.v.setUint32(16,c,true);h.v.setUint32(20,data.length,true);h.v.setUint32(24,data.length,true);h.v.setUint16(28,name.length,true);h.v.setUint32(42,offset,true);central.push(h.a,name);
    cdLen+=46+name.length;offset+=30+name.length+data.length});
  const end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,entries.length,true);end.v.setUint16(10,entries.length,true);end.v.setUint32(12,cdLen,true);end.v.setUint32(16,offset,true);
  const url=URL.createObjectURL(new Blob([...pieces,...central,end.a],{type:'application/zip'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}

export async function downloadZip(files:Item[],title:string,notes:string,onProgress:(p:ZipProgress)=>void=()=>{}){
  const entries=entriesFor(files,title,notes),filename=title.replace(/[\\/:*?"<>|]/g,'_')+'.zip';
  if(entries.reduce((s,e)=>s+e.size,0)>ZIP_LIMIT)throw Error('La clase ocupa demasiado para un solo ZIP. Descarga sus archivos por separado.');
  if(await streamZip(entries,filename,onProgress))return;
  await memoryZip(entries,filename,onProgress);
}

// ZIP de varias clases: una carpeta por asignatura y clase, con sus notas.
// Con manifest=true añade aula.json (el formato que importa Aula 2) en lugar de las notas sueltas.
// Las carpetas llevan la abreviatura de la asignatura; aula.json guarda también tus ajustes.
async function downloadLessons(lessons:Lesson[],files:Item[],filename:string,manifest:boolean,settings:Settings,onProgress:(p:ZipProgress)=>void){
  const short=(id:string)=>settings.subjects.find(s=>s.id===id)?.short??id;
  const safe=(s:string)=>s.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').trim().slice(0,120)||'archivo';
  const used=new Set<string>(),unique=(p:string)=>{let out=p,i=2;const dot=p.lastIndexOf('.'),cut=dot>p.lastIndexOf('/')?dot:p.length;while(used.has(out.toLowerCase()))out=`${p.slice(0,cut)} (${i++})${p.slice(cut)}`;used.add(out.toLowerCase());return out};
  type ManifestLesson={subject:string;title:string;date:string;topic:string;notes:string;files:{name:string;type:string;size:number;path:string}[]};
  const data={format:'aula',version:2,exportedAt:new Date().toISOString(),subjects:settings.subjects.map(s=>({code:s.id,short:s.short,name:s.name,color:s.color})),settings,lessons:[] as ManifestLesson[]};
  const entries:Entry[]=[],enc=new TextEncoder();
  const folders=new Set<string>();
  for(const l of [...lessons].sort((a,b)=>a.date.localeCompare(b.date))){
    // Cada clase en su propia carpeta, aunque dos se llamen igual el mismo día.
    const base=`${safe(short(l.subject))}/${l.date} ${safe(l.title)}`;let folder=base;for(let k=2;folders.has(folder.toLowerCase());k++)folder=`${base} (${k})`;folders.add(folder.toLowerCase());
    const item:ManifestLesson={subject:l.subject,title:l.title,date:l.date,topic:l.topic,notes:l.notes,files:[]};
    for(const f of files.filter(f=>f.lesson===l.id)){const path=unique(`${folder}/${safe(f.name)}`);item.files.push({name:f.name,type:f.type,size:f.size,path});entries.push({name:path,size:f.size,url:fileURL(f,true),file:f.id})}
    if(!manifest&&(l.notes||l.topic)){const notes=enc.encode(`${l.title}\n${l.date}${l.topic?` · ${l.topic}`:''}\n\n${l.notes}`);entries.push({name:unique(`${folder}/notas.txt`),size:notes.length,data:notes})}
    data.lessons.push(item);
  }
  if(manifest){const json=enc.encode(JSON.stringify(data,null,2));entries.unshift({name:'aula.json',size:json.length,data:json})}
  const total=entries.reduce((s,e)=>s+e.size,0);
  if(total>ZIP_LIMIT)throw Error('Ocupa demasiado para un solo ZIP. Descarga las clases por separado.');
  // Si cabe, se arma en memoria, que es el método más predecible con muchos archivos.
  if(total<=MEMORY_LIMIT)return memoryZip(entries,filename,onProgress);
  if(await streamZip(entries,filename,onProgress))return;
  throw Error('Pasa de 750 MB y este navegador no permite armar el ZIP mientras se descarga. Prueba con Chrome o Edge en el ordenador.');
}

// Exportación completa en el formato que importa Aula 2.
export const downloadEverything=(lessons:Lesson[],files:Item[],settings:Settings=DEFAULT_SETTINGS,onProgress:(p:ZipProgress)=>void=()=>{})=>downloadLessons(lessons,files,`Aula ${new Date().toISOString().slice(0,10)}.zip`,true,settings,onProgress);
// Selección del asistente: solo las clases y archivos que ha encontrado.
export const downloadSelection=(lessons:Lesson[],files:Item[],name:string,settings:Settings=DEFAULT_SETTINGS,onProgress:(p:ZipProgress)=>void=()=>{})=>downloadLessons(lessons,files,name.replace(/[\\/:*?"<>|]/g,'_').slice(0,80)+'.zip',false,settings,onProgress);

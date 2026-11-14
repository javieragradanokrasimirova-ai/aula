// Modo demo: todo se guarda en este navegador (IndexedDB). Sirve para probar Aula sin cuenta;
// si borras los datos del navegador, se pierde.
import {kv,session} from './idb';
import {normalizeDoc,type AulaDoc} from './doc';
import type {Adapter} from './store';

const db=kv('aula-demo',['doc','blobs']);

export async function demoAdapter():Promise<Adapter>{
  await session().set('session','current',{kind:'demo'});
  return {
    kind:'demo',user:{name:'Modo demo'},
    read:async()=>{const d=await db.get<AulaDoc>('doc','aula');return d?normalizeDoc(d):null},
    write:async doc=>{await db.set('doc','aula',doc)},
    async upload(file,meta,o){
      // Se guarda en el navegador; el avance se simula para que se vea igual que una subida real.
      const id='demo-'+crypto.randomUUID(),steps=8;
      for(let i=1;i<=steps;i++){if(o.signal.aborted)throw new DOMException('Cancelada','AbortError');await new Promise(r=>setTimeout(r,60));o.onProgress(Math.round(file.size*i/steps))}
      await db.set('blobs',id,new Blob([file],{type:meta.type}));return id;
    },
    remove:id=>db.del('blobs',id),
    async blob(id){const b=await db.get<Blob>('blobs',id);if(!b)throw Error('Archivo no disponible.');return b},
    async signOut(){await session().del('session','current')},
  };
}
// Borra todo lo del modo demo.
export async function resetDemo(){await db.clear('doc');await db.clear('blobs')}

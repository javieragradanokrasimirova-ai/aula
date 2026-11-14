// IndexedDB mínimo (clave → valor). Lo usan el modo demo y la sesión que lee el service worker.
// public/aula-sw.js tiene una copia en JS de estas mismas funciones: si cambias nombres, cámbialos allí.
const open=(name:string,stores:string[])=>new Promise<IDBDatabase>((ok,fail)=>{
  const r=indexedDB.open(name,1);
  r.onupgradeneeded=()=>{for(const s of stores)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s)};
  r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);
});
function tx<T>(db:IDBDatabase,store:string,mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>|void){
  return new Promise<T>((ok,fail)=>{const t=db.transaction(store,mode),req=fn(t.objectStore(store));
    t.oncomplete=()=>ok(req?req.result:undefined as T);t.onerror=()=>fail(t.error);t.onabort=()=>fail(t.error)});
}
export function kv(name:string,stores:string[]){
  const db=open(name,stores);
  return {
    get:async<T,>(store:string,key:string)=>tx<T>(await db,store,'readonly',s=>s.get(key)),
    set:async(store:string,key:string,value:unknown)=>{await tx(await db,store,'readwrite',s=>{s.put(value,key)})},
    del:async(store:string,key:string)=>{await tx(await db,store,'readwrite',s=>{s.delete(key)})},
    clear:async(store:string)=>{await tx(await db,store,'readwrite',s=>{s.clear()})},
  };
}
// Lo que el service worker necesita saber para servir tus archivos: de dónde salen y con qué permiso.
export const SESSION_DB='aula-session';
export const session=()=>kv(SESSION_DB,['session']);
export type SwSession={kind:'demo'}|{kind:'drive';token:string;expires:number};

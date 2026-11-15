// Subida reanudable a Google Drive con un «Drive de mentira» (sin red): trozos de 8 MB, conexión que se
// corta, sesión de subida que caduca, reanudar con «Reintentar» y sesión de Google caducada.
import ts from 'typescript';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
mkdirSync('.test-runtime',{recursive:true});
const fix=t=>t.replace(/from '\.\/(config|doc|idb|store|moodle|settings|ics|types)'/g,"from './$1.mjs'").replace(/^import \{createContext,useContext\} from 'react';$/m,'const createContext=()=>null,useContext=()=>null;');
for(const m of ['config','doc','idb','store','moodle','settings','ics','types','drive'])writeFileSync(`.test-runtime/${m}.mjs`,ts.transpile(fix(readFileSync(`src/${m}.ts`,'utf8')),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}));

// Navegador mínimo: sesión guardada, IndexedDB que no hace nada, fetch para abrir la subida y XHR para los trozos.
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.indexedDB={open(){const r={};setTimeout(()=>r.onerror?.());return r}};
const setToken=ms=>store.set('aula-google-token',JSON.stringify({value:'tok',expires:Date.now()+ms}));
setToken(3600e3);

let sessions=[],opens=0,plan={};
globalThis.fetch=async(url,init)=>{assert.match(url,/uploadType=resumable/);assert.equal(init.headers.Authorization,'Bearer tok');opens++;
  const s={uri:'https://up.test/s'+sessions.length,received:0,total:Number(init.headers['X-Upload-Content-Length']),alive:true,chunks:0};sessions.push(s);
  return new Response(null,{status:200,headers:{Location:s.uri}})};
class FakeXHR{
  constructor(){this.headers={};this.upload={};this.status=0;this.res={}}
  open(m,u){this.uri=u}setRequestHeader(k,v){this.headers[k]=v}getResponseHeader(k){return this.res[k]??null}abort(){this.onabort?.()}
  send(body){setTimeout(()=>{
    const s=sessions.find(x=>x.uri===this.uri),cr=this.headers['Content-Range'];
    const reply=(status,extra={},text='')=>{this.status=status;this.res=extra;this.responseText=text;this.onload()};
    if(!s||!s.alive)return reply(404);
    const range=()=>s.received?{'X-Http-Status-Code-Override':'308','Range':`bytes=0-${s.received-1}`}:{'X-Http-Status-Code-Override':'308'};
    if(cr.startsWith('bytes */'))return s.received===s.total?reply(200,{},JSON.stringify({id:'id-'+s.uri})):reply(200,range());
    s.chunks++;
    if(plan.cutAt===s.chunks&&!plan.cutDone){plan.cutDone=true;s.received+=Math.floor(body.size/2);return this.onerror()} // llega la mitad y se corta
    if(plan.expireAt===s.chunks&&!plan.expireDone){plan.expireDone=true;s.alive=false;return reply(404)}
    const [a,b]=cr.match(/bytes (\d+)-(\d+)\//).slice(1).map(Number);
    if(a!==s.received)return reply(200,range()); // Drive solo acepta lo que sigue a lo que ya tiene
    this.upload.onprogress?.({loaded:body.size});s.received=b+1;
    if(s.received===s.total)return reply(200,{},JSON.stringify({id:'id-'+s.uri}));
    reply(200,range());
  },1)}
}
globalThis.XMLHttpRequest=FakeXHR;
const {resumable}=await import('../.test-runtime/drive.mjs');
const file=new Blob([new Uint8Array(20*1024*1024+123)]),MB8=8*1024*1024;
const opts=(extra={})=>{let last=0,state;const o={signal:new AbortController().signal,onProgress:n=>{last=Math.max(last,n)},resume:{get:()=>state,set:v=>{state=v}},...extra};return {o,last:()=>last,state:()=>state}};
const reset=p=>{sessions=[];opens=0;plan=p};

// 1. Normal: tres trozos (8 + 8 + 4 MB).
reset({});let t=opts();let id=await resumable(file,{name:'a.m4a',type:'audio/mp4'},'carpeta',t.o);
assert.equal(id,'id-https://up.test/s0');assert.equal(sessions[0].chunks,3);assert.equal(t.last(),file.size);assert.equal(opens,1);
// 2. La conexión se corta a mitad del segundo trozo: se pregunta a Drive cuánto tiene y se sigue desde ahí.
reset({cutAt:2});t=opts();id=await resumable(file,{name:'a',type:''},'c',t.o);
assert.equal(id,'id-https://up.test/s0');assert.equal(opens,1,'no se abre otra subida');assert.equal(sessions[0].received,file.size);
// 3. La sesión de subida caduca: se abre otra y se empieza de nuevo.
reset({expireAt:2});t=opts();id=await resumable(file,{name:'a',type:''},'c',t.o);
assert.equal(opens,2);assert.equal(id,'id-https://up.test/s1');
// 4. «Reintentar» después de un fallo: se reanuda la misma subida sin volver a enviar lo que ya llegó.
reset({});const s0={uri:'https://up.test/s0',received:MB8,total:file.size,alive:true,chunks:1};sessions.push(s0);
t=opts();t.o.resume.set({uri:s0.uri,offset:0});id=await resumable(file,{name:'a',type:''},'c',t.o);
assert.equal(opens,0,'se reutiliza la subida guardada');assert.equal(s0.chunks,3,'solo se envían los dos trozos que faltaban');assert.equal(id,'id-https://up.test/s0');
// 5. Si ya estaba entera (se cortó justo al terminar), no se envía nada más.
reset({});const s1={uri:'https://up.test/s9',received:file.size,total:file.size,alive:true,chunks:3};sessions.push(s1);
t=opts();t.o.resume.set({uri:s1.uri,offset:MB8});assert.equal(await resumable(file,{name:'a',type:''},'c',t.o),'id-https://up.test/s9');assert.equal(s1.chunks,3);
// 6. Cancelar.
reset({});const ac=new AbortController();ac.abort();t=opts({signal:ac.signal});await assert.rejects(resumable(file,{name:'a',type:''},'c',t.o),/Cancelada/);
// 7. Sesión de Google caducada: se avisa al momento (sin reintentos) con un mensaje claro.
// Google responde 401 al abrir la subida: se olvida el permiso y lo siguiente falla al momento, sin red.
reset({});const realFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:401})};
const {onTokenChange,hasToken}=await import('../.test-runtime/drive.mjs');let notified=null;onTokenChange(ok=>notified=ok);
t=opts();await assert.rejects(resumable(file,{name:'a',type:''},'c',t.o),/sesión de Google ha caducado/);
assert.equal(hasToken(),false);assert.equal(notified,false,'la web se entera (y enseña «Renovar sesión»)');
await assert.rejects(resumable(file,{name:'a',type:''},'c',opts().o),/sesión de Google ha caducado/);assert.equal(calls,1,'sin permiso ya no se intenta');
globalThis.fetch=realFetch;
console.log('PASS Drive: subida en trozos, corte a mitad, sesión de subida caducada, reanudar, ya completa, sesión de Google caducada y cancelar');
process.exit(0);

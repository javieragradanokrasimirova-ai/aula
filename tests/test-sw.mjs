// Prueba del service worker (public/aula-sw.js) sin navegador: se carga en un contexto simulado y se
// sustituye la lectura del archivo por una respuesta «como la de Drive», que no deja leer Content-Range.
import {readFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const listeners={};
const ctx={self:{addEventListener:(t,f)=>listeners[t]=f,location:{origin:'https://x.test'},clients:{claim(){}},skipWaiting(){}},
  Response,Headers,URL,ReadableStream,TextEncoder,Uint8Array,DataView,ArrayBuffer,Uint32Array,Map,Date,Number,String,encodeURIComponent,decodeURIComponent,setTimeout,console,fetch:()=>{throw Error('sin red')},indexedDB:{}};
vm.createContext(ctx);vm.runInContext(readFileSync('public/aula-sw.js','utf8'),ctx);
const data=new Uint8Array(1000).map((_,i)=>i%256);
// «Drive»: devuelve los bytes pedidos, pero sin Content-Range ni Content-Length legibles.
ctx.getFile=async(id,range)=>{const m=/bytes=(\d+)-(\d+)/.exec(range||'');return m?new Response(data.slice(+m[1],+m[2]+1),{status:206}):new Response(data,{status:200})};
const serve=async(url,headers={})=>{let p;listeners.fetch({request:new Request('https://x.test'+url,{headers}),respondWith:r=>p=r});return p};
let r=await serve('/aula/__aula-file/abc?name=gr%C3%A1b.m4a&type=audio%2Fmp4&size=1000',{range:'bytes=100-199'});
assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 100-199/1000');assert.equal(r.headers.get('content-length'),'100');
assert.equal(r.headers.get('content-type'),'audio/mp4');assert.equal(r.headers.get('accept-ranges'),'bytes');
assert.equal((await r.arrayBuffer()).byteLength,100);
r=await serve('/aula/__aula-file/abc?name=x&size=1000&download=1');
assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),'1000');assert.match(r.headers.get('content-disposition'),/^attachment/);
r=await serve('/aula/__aula-file/abc?name=x',{range:'bytes=0-9'});assert.equal(r.headers.get('content-range'),null,'sin tamaño no se inventa nada');
assert.equal(await serve('/aula/otra-cosa'),undefined,'otras rutas siguen su camino');
console.log('PASS service worker: rehace Content-Range y Content-Length cuando Drive no los deja leer');

// Prueba en un navegador real (Edge sin ventana) con la web ya en marcha (npm run dev, puerto 5174):
// modo demo, service worker sirviendo archivos (entero y por «Range») y ZIP en streaming.
// Uso: node tests/test-browser.mjs   (opcional: EDGE=ruta\msedge.exe)
import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const EDGE=process.env.EDGE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',URL0=process.env.URL||'http://127.0.0.1:5174/',PORT=9339;
const profile=mkdtempSync(join(tmpdir(),'aula-edge-'));
const edge=spawn(EDGE,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'--no-first-run','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map();
try{
  let target;for(let i=0;i<50&&!target;i++){await sleep(200);try{target=(await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t=>t.type==='page')}catch{}}
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
  const send=(method,params={})=>new Promise(r=>{const id=++seq;pending.set(id,r);ws.send(JSON.stringify({id,method,params}))});
  const run=async expr=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{${expr}})()`,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails).slice(0,600));return r.result.result.value};
  await send('Page.navigate',{url:URL0});await sleep(3500);
  assert.equal(await run(`return !!navigator.serviceWorker.controller`),true,'el service worker controla la página');
  // Un evento suelto en el modo demo: así no sale la bienvenida de la primera vez y se va directo a Aula.
  await run(`await new Promise((ok,fail)=>{const r=indexedDB.open('aula-demo',1);r.onupgradeneeded=()=>{r.result.createObjectStore('doc');r.result.createObjectStore('blobs')};r.onerror=fail;
    r.onsuccess=()=>{const t=r.result.transaction('doc','readwrite');t.objectStore('doc').put({format:'aula',version:1,lessons:[],files:[],moodle:{importedAt:null},
      events:[{id:'e1',uid:null,title:'Evento de prueba',description:'',start:'2030-01-01',end:null,allDay:1,kind:'event',subject:'',priority:1,done:0}]},'aula');t.oncomplete=()=>{r.result.close();ok()}}})`);
  await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Probar sin cuenta')).click()`);await sleep(1500);
  // Crea una clase con un archivo binario usando la propia interfaz.
  const out=await run(`
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
    [...document.querySelectorAll('.navitem')].find(b=>b.textContent.includes('Ajustes')).click();await sleep(500);
    document.querySelector('.set-add').click();await sleep(200);
    set(document.querySelector('input[placeholder="Ej. PSP"]'),'PSP');set(document.querySelector('input[placeholder^="Ej. Programación"]'),'Procesos');await sleep(100);
    [...document.querySelectorAll('.set-savebar button')].find(b=>b.textContent.includes('Guardar')).click();await sleep(800);
    [...document.querySelectorAll('.navitem')].find(b=>b.textContent.includes('Todas las clases')).click();await sleep(500);
    [...document.querySelectorAll('button.primary')].find(b=>b.textContent.includes('Nueva clase')).click();await sleep(400);
    set(document.querySelector('.modal input[name=title]'),'Prueba SW');
    const bytes=new Uint8Array(300000).map((_,i)=>(i*7)%256),dt=new DataTransfer();dt.items.add(new File([bytes],'grabación ñ.m4a',{type:'audio/mp4'}));
    const inp=document.querySelector('.modal .pick-files input[type=file]');inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));await sleep(200);
    document.querySelector('.modal button[type=submit]').click();await sleep(2500);
    const href=document.querySelector('.filerow a.iconbtn').getAttribute('href');
    const full=await fetch(href);const buf=new Uint8Array(await full.arrayBuffer());
    const part=await fetch(href.replace('&download=1',''),{headers:{Range:'bytes=1000-1999'}});const pbuf=new Uint8Array(await part.arrayBuffer());
    let same=buf.length===bytes.length;for(let i=0;same&&i<buf.length;i++)same=buf[i]===bytes[i];
    return {href,status:full.status,len:buf.length,same,disp:full.headers.get('content-disposition'),type:full.headers.get('content-type'),pstatus:part.status,plen:pbuf.length,pfirst:pbuf[0],prange:part.headers.get('content-range')};`);
  assert.equal(out.status,200);assert.equal(out.len,300000);assert.ok(out.same,'el archivo llega idéntico');
  assert.match(out.disp,/attachment; .*filename\*=UTF-8''grabaci%C3%B3n%20%C3%B1\.m4a/);assert.equal(out.type,'audio/mp4');
  assert.equal(out.pstatus,206);assert.equal(out.plen,1000);assert.equal(out.pfirst,(1000*7)%256);assert.equal(out.prange,'bytes 1000-1999/300000');
  // ZIP en streaming a través del service worker (se intercepta la descarga para leerla).
  const zip=await run(`
    const reg=await navigator.serviceWorker.ready,sw=reg.active,ch=new MessageChannel(),token=crypto.randomUUID();
    const href=document.querySelector('.filerow a.iconbtn').getAttribute('href'),id=decodeURIComponent(href.match(/__aula-file\\/([^?]+)/)[1]);
    const ready=new Promise(r=>ch.port1.onmessage=e=>{if(e.data.type==='ready')r()});
    sw.postMessage({type:'zip',token,filename:'x.zip',entries:[{name:'a.m4a',size:300000,file:id},{name:'n.txt',size:2,data:new Uint8Array([104,105])}]},[ch.port2]);await ready;
    const r=await fetch('./__aula-zip/'+token+'/x.zip');const b=new Uint8Array(await r.arrayBuffer());
    return {status:r.status,len:b.length,declared:Number(r.headers.get('content-length')),sig:b[0]===0x50&&b[1]===0x4b};`);
  assert.equal(zip.status,200);assert.ok(zip.sig);assert.equal(zip.len,zip.declared,'el tamaño anunciado es exacto');
  // Lo que se ve tras guardar es lo guardado: el tema se recorta a 200 caracteres también en pantalla.
  const topic=await run(`
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
    [...document.querySelectorAll('.detail-tools button')].find(b=>b.textContent.includes('Editar')).click();await sleep(400);
    set(document.querySelector('.modal input[name=topic]'),'t'.repeat(250));
    document.querySelector('.modal button[type=submit]').click();await sleep(1200);
    return document.querySelector('.page-heading p').textContent.length;`);
  assert.equal(topic,200,'el tema en pantalla coincide con el guardado');
  console.log('PASS navegador: service worker activo, archivo íntegro con nombre UTF-8, Range (206), ZIP en streaming y pantalla igual a lo guardado');
}finally{try{ws?.close()}catch{};edge.kill();await sleep(500);try{rmSync(profile,{recursive:true,force:true})}catch{}}

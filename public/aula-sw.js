// Service worker de Aula. Hace dos cosas, solo en sus propias rutas (lo demás sigue su camino):
//  · …/__aula-file/<id>?name=…&type=…[&download=1] → sirve un archivo tuyo. Lo saca de este
//    navegador (modo demo) o de tu Google Drive, añadiendo tu permiso. Admite «Range», así el audio
//    y el vídeo se pueden adelantar sin descargarlos enteros.
//  · …/__aula-zip/<token>/<nombre> → arma un ZIP mientras se descarga, sin cargarlo en memoria.
//    ZIP sin compresión: los originales quedan intactos.

// ---------- IndexedDB (igual que src/idb.ts) ----------
function idbGet(name,store,key){return new Promise((ok,fail)=>{const r=indexedDB.open(name,1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(store))r.result.createObjectStore(store)};
  r.onerror=()=>fail(r.error);
  r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains(store)){db.close();return ok(undefined)}
    const q=db.transaction(store,'readonly').objectStore(store).get(key);q.onsuccess=()=>{ok(q.result);db.close()};q.onerror=()=>fail(q.error)}})}
const session=()=>idbGet('aula-session','session','current');

// ---------- Archivos ----------
function parseRange(h,size){const m=/^bytes=(\d*)-(\d*)$/.exec(h||'');if(!m||(!m[1]&&!m[2]))return null;
  let a=m[1]?+m[1]:size-+m[2],b=m[2]&&m[1]?+m[2]:size-1;if(a<0)a=0;if(b>=size)b=size-1;return a<=b?[a,b]:null}
// Devuelve la respuesta con el contenido del archivo (o un error ya preparado para mostrar).
async function getFile(id,range){
  const s=await session();
  if(!s)return new Response('Vuelve a abrir Aula para ver este archivo.',{status:401,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  if(s.kind==='demo'){
    const blob=await idbGet('aula-demo','blobs',id);if(!blob)return new Response('Archivo no disponible.',{status:404});
    const r=parseRange(range,blob.size);
    if(r)return new Response(blob.slice(r[0],r[1]+1),{status:206,headers:{'Content-Range':`bytes ${r[0]}-${r[1]}/${blob.size}`,'Content-Length':String(r[1]-r[0]+1)}});
    return new Response(blob,{headers:{'Content-Length':String(blob.size)}});
  }
  if(!s.token||s.expires<Date.now())return new Response('Tu sesión de Google ha caducado. Vuelve a Aula y entra de nuevo.',{status:401,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  const headers={Authorization:'Bearer '+s.token};if(range)headers.Range=range;
  return fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers});
}
async function serveFile(req,id,q){
  const r=await getFile(id,req.headers.get('range'));
  if(!r.ok&&r.status!==206)return r;
  const h=new Headers();for(const k of ['Content-Length','Content-Range'])if(r.headers.get(k))h.set(k,r.headers.get(k));
  // Desde Drive el navegador no deja leer «Content-Range» (ni a veces «Content-Length»): se rehacen
  // con el tamaño del archivo, que Aula conoce. Sin ellas, el reproductor no podría adelantar el audio.
  const size=Number(q.get('size'))||0;
  if(size){
    const rg=r.status===206?parseRange(req.headers.get('range'),size):null;
    if(rg&&!h.get('Content-Range'))h.set('Content-Range',`bytes ${rg[0]}-${rg[1]}/${size}`);
    if(!h.get('Content-Length'))h.set('Content-Length',String(rg?rg[1]-rg[0]+1:size));
  }
  h.set('Content-Type',q.get('type')||r.headers.get('Content-Type')||'application/octet-stream');
  h.set('Accept-Ranges','bytes');h.set('Cache-Control','private, no-store');h.set('X-Content-Type-Options','nosniff');
  // Un archivo subido (un .html o .svg, por ejemplo) nunca puede ejecutar código dentro de Aula: se abre
  // «aislado». Los PDF quedan fuera porque el visor de PDF del navegador no funciona aislado; un PDF no
  // ejecuta código de la página.
  const type=(h.get('Content-Type')||'').toLowerCase();
  if(!type.startsWith('application/pdf'))h.set('Content-Security-Policy',"sandbox; default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'unsafe-inline'");
  const name=q.get('name')||'archivo';
  h.set('Content-Disposition',`${q.has('download')?'attachment':'inline'}; filename="archivo"; filename*=UTF-8''${encodeURIComponent(name)}`);
  return new Response(r.body,{status:r.status,headers:h});
}

// ---------- ZIP en streaming ----------
const jobs=new Map();
const table=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crcUpdate(c,a){for(let i=0;i<a.length;i++)c=table[(c^a[i])&255]^(c>>>8);return c}
const enc=new TextEncoder();
function dosDateTime(d=new Date()){return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()}}
// Tamaño exacto del ZIP: permite que el navegador muestre el total desde el principio.
function zipSize(entries){let n=22;for(const e of entries){const l=enc.encode(e.name).length;n+=30+l+e.size+16+46+l}return n}
// Los archivos de una entrada se piden por su id (e.file); sin pasar por la red de la página.
async function fetchEntry(e){if(e.file){const r=await getFile(e.file,null);return r}return fetch(e.url)}

function zipStream(entries,report=()=>{}){
  const {time,date}=dosDateTime(),total=entries.reduce((s,e)=>s+e.size,0);
  async function* parts(){
    let offset=0,loaded=0,last=0;const central=[];
    for(const e of entries){
      const name=enc.encode(e.name),h=new DataView(new ArrayBuffer(30));
      // Bit 3: CRC y tamaños van después de los datos. Bit 11: nombre en UTF-8.
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0808,true);h.setUint16(10,time,true);h.setUint16(12,date,true);h.setUint16(26,name.length,true);
      yield new Uint8Array(h.buffer);yield name;
      let crc=0xffffffff,size=0;
      if(e.data){crc=crcUpdate(crc,e.data);size=e.data.length;yield e.data}
      else{
        const r=await fetchEntry(e);
        if(!r.ok||!r.body)throw new Error('No se pudo descargar «'+e.name+'».');
        const reader=r.body.getReader();
        for(;;){const {value,done}=await reader.read();if(done)break;crc=crcUpdate(crc,value);size+=value.length;loaded+=value.length;
          const now=Date.now();if(now-last>250){last=now;report({type:'progress',loaded,total})}yield value}
      }
      if(size!==e.size)throw new Error('«'+e.name+'» no ha llegado completo.');
      crc=(crc^0xffffffff)>>>0;
      const d=new DataView(new ArrayBuffer(16));d.setUint32(0,0x08074b50,true);d.setUint32(4,crc,true);d.setUint32(8,size,true);d.setUint32(12,size,true);
      yield new Uint8Array(d.buffer);
      central.push({name,crc,size,offset});offset+=30+name.length+size+16;
    }
    let cd=0;
    for(const c of central){
      const h=new DataView(new ArrayBuffer(46));
      h.setUint32(0,0x02014b50,true);h.setUint16(4,20,true);h.setUint16(6,20,true);h.setUint16(8,0x0808,true);h.setUint16(12,time,true);h.setUint16(14,date,true);
      h.setUint32(16,c.crc,true);h.setUint32(20,c.size,true);h.setUint32(24,c.size,true);h.setUint16(28,c.name.length,true);h.setUint32(42,c.offset,true);
      yield new Uint8Array(h.buffer);yield c.name;cd+=46+c.name.length;
    }
    const end=new DataView(new ArrayBuffer(22));
    end.setUint32(0,0x06054b50,true);end.setUint16(8,central.length,true);end.setUint16(10,central.length,true);end.setUint32(12,cd,true);end.setUint32(16,offset,true);
    yield new Uint8Array(end.buffer);
  }
  const it=parts();
  return new ReadableStream({
    async pull(ctrl){try{const {value,done}=await it.next();if(done){ctrl.close();report({type:'done',loaded:total,total})}else ctrl.enqueue(value)}
      catch(err){report({type:'error',message:err&&err.message||'La descarga se ha interrumpido.'});ctrl.error(err)}},
    cancel(){it.return();report({type:'cancel'})}
  });
}

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
  const d=e.data;if(!d||d.type!=='zip')return;
  // La página espera la confirmación antes de pedir la descarga.
  jobs.set(d.token,{...d,port:e.ports[0]});setTimeout(()=>jobs.delete(d.token),60000);
  e.ports[0].postMessage({type:'ready'});
});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);if(url.origin!==self.location.origin)return;
  const f=url.pathname.match(/\/__aula-file\/([^/]+)$/);
  if(f)return e.respondWith(serveFile(e.request,decodeURIComponent(f[1]),url.searchParams));
  const m=url.pathname.match(/\/__aula-zip\/([\w-]+)\//);if(!m)return;
  const job=jobs.get(m[1]);jobs.delete(m[1]);
  if(!job)return e.respondWith(new Response('La descarga ha caducado. Vuelve a pulsar «Descargar».',{status:410,headers:{'Content-Type':'text/plain; charset=utf-8'}}));
  const report=msg=>{try{job.port.postMessage(msg)}catch{}};
  report({type:'started'});
  e.respondWith(new Response(zipStream(job.entries,report),{headers:{
    'Content-Type':'application/zip','Content-Length':String(zipSize(job.entries)),'Cache-Control':'no-store',
    'Content-Disposition':`attachment; filename="aula.zip"; filename*=UTF-8''${encodeURIComponent(job.filename)}`}}));
});

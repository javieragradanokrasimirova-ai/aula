// Adaptador de Google Drive. Tus datos viven en TU Drive, en una carpeta «Aula»:
//   Aula/aula.json      → ajustes, clases, eventos y la lista de archivos
//   Aula/Archivos/…     → los audios, fotos y documentos que subes
// Permiso que se pide: drive.file. Con él, Aula solo puede ver lo que ella misma ha creado;
// el resto de tu Drive le es invisible.
import {GOOGLE_CLIENT_ID} from './config';
import {normalizeDoc,type AulaDoc} from './doc';
import {session} from './idb';
import type {Adapter,UploadOptions,User} from './store';
import {UserError} from './doc';

const SCOPES='https://www.googleapis.com/auth/drive.file openid email profile';
const API='https://www.googleapis.com/drive/v3',UPLOAD='https://www.googleapis.com/upload/drive/v3';
const CHUNK=8*1024**2; // múltiplo de 256 KB, como pide Drive
const KEY='aula-google-token';
declare const google:any;

// ---------- Inicio de sesión (Google Identity Services) ----------
type Token={value:string;expires:number};
// Se guarda en este dispositivo (no solo en la pestaña): si cierras Aula y vuelves antes de la hora, entras directo.
let token:Token|null=(()=>{try{sessionStorage.removeItem(KEY);const t=JSON.parse(localStorage.getItem(KEY)||'null');return t&&t.expires>Date.now()+60000?t:null}catch{return null}})();
const listeners=new Set<(ok:boolean)=>void>();
export const onTokenChange=(fn:(ok:boolean)=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}};
export const hasToken=()=>!!token&&token.expires>Date.now()+30000;

let gis:Promise<void>|null=null;
function loadGis(){
  return gis??=new Promise<void>((ok,fail)=>{if((window as any).google?.accounts?.oauth2)return ok();
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>ok();s.onerror=()=>{gis=null;fail(new UserError('No se ha podido cargar el inicio de sesión de Google. Revisa la conexión.'))};document.head.appendChild(s)});
}
// Abre la ventana de Google (hay que llamarlo desde un clic). Si ya diste permiso, se cierra sola.
export async function signIn(hint?:string):Promise<void>{
  if(!GOOGLE_CLIENT_ID)throw new UserError('Esta copia de Aula aún no tiene configurado el inicio de sesión con Google.');
  await loadGis();
  await new Promise<void>((ok,fail)=>{
    const client=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:SCOPES,hint,
      callback:(r:any)=>{if(r.error||!r.access_token)return fail(new UserError('No se ha podido entrar con Google.'));
        if(!google.accounts.oauth2.hasGrantedAllScopes(r,'https://www.googleapis.com/auth/drive.file'))return fail(new UserError('Para guardar tus clases, Aula necesita el permiso de Google Drive. Vuelve a intentarlo y marca esa casilla.'));
        setToken({value:r.access_token,expires:Date.now()+(Number(r.expires_in)||3600)*1000});ok()},
      error_callback:(e:any)=>fail(new UserError(e?.type==='popup_closed'?'Has cerrado la ventana de Google.':e?.type==='popup_failed_to_open'?'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes para esta web.':'No se ha podido entrar con Google.'))});
    client.requestAccessToken({prompt:''});
  });
}
function setToken(t:Token|null){
  token=t;
  try{if(t)localStorage.setItem(KEY,JSON.stringify(t));else localStorage.removeItem(KEY)}catch{}
  // El service worker necesita el permiso para servirte los archivos.
  (t?session().set('session','current',{kind:'drive',token:t.value,expires:t.expires}):session().del('session','current')).catch(()=>{});
  for(const fn of listeners)fn(!!t);
}
// Caduca a la hora: se avisa para que la renueves.
setInterval(()=>{if(token&&!hasToken())setToken(null)},30000);

// ---------- Llamadas a Drive ----------
async function call(url:string,init:RequestInit={},raw=false):Promise<any>{
  if(!hasToken())throw new UserError('Tu sesión de Google ha caducado: vuelve a entrar y repítelo.');
  const r=await fetch(url,{...init,headers:{...init.headers,Authorization:'Bearer '+token!.value}});
  if(r.status===401){setToken(null);throw new UserError('Tu sesión de Google ha caducado: vuelve a entrar y repítelo.')}
  if(r.status===403||r.status===429){const d=await r.json().catch(()=>({}));const reason=d?.error?.errors?.[0]?.reason;
    if(reason==='storageQuotaExceeded')throw new UserError('Tu Google Drive está lleno. Libera espacio y vuelve a intentarlo.');
    throw new Error('Google Drive está ocupado ahora mismo. Inténtalo en un momento.')}
  if(!r.ok)throw new Error(`Google Drive ha respondido con un error (${r.status}).`);
  return raw?r:r.status===204?null:r.json();
}
const q=(s:string)=>encodeURIComponent(s);
async function find(query:string):Promise<{id:string;version?:string}|null>{
  const d=await call(`${API}/files?q=${q(query+' and trashed=false')}&spaces=drive&fields=files(id,version)&pageSize=1`);
  return d.files?.[0]??null;
}
async function folder(role:string,name:string,parent?:string){
  const found=await find(`appProperties has { key='aula' and value='${role}' } and mimeType='application/vnd.google-apps.folder'`);
  if(found)return found.id;
  const d=await call(`${API}/files?fields=id`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',appProperties:{aula:role},parents:parent?[parent]:undefined})});
  return d.id as string;
}
async function me():Promise<User>{
  try{const r=await call('https://www.googleapis.com/oauth2/v3/userinfo');return {name:r.name||r.email||'Tu cuenta',email:r.email,picture:r.picture}}catch{return {name:'Tu cuenta de Google'}}
}

export async function driveAdapter():Promise<Adapter>{
  const [user,root]=await Promise.all([me(),folder('root','Aula')]);
  const files=await folder('files','Archivos',root);
  let data=(await find(`appProperties has { key='aula' and value='data' } and '${root}' in parents`));
  let cache:{version:string;doc:AulaDoc}|null=null;
  await session().set('session','current',{kind:'drive',token:token!.value,expires:token!.expires});

  return {
    kind:'drive',user,
    async read(){
      if(!data)return null;
      // Si nadie lo ha cambiado desde la última vez (Drive lleva un número de versión), no se descarga otra vez.
      const meta=await call(`${API}/files/${data.id}?fields=version`);
      if(cache&&cache.version===meta.version)return cache.doc;
      const doc=normalizeDoc(await call(`${API}/files/${data.id}?alt=media`));
      cache={version:meta.version,doc};return doc;
    },
    async write(doc){
      const body=JSON.stringify(doc);
      if(!data){
        // Primera vez: se crea aula.json (subida «multipart»: datos + contenido en una sola petición).
        const boundary='aula'+crypto.randomUUID(),meta={name:'aula.json',mimeType:'application/json',parents:[root],appProperties:{aula:'data'}};
        const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        data=await call(`${UPLOAD}/files?uploadType=multipart&fields=id,version`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:multipart});
      }else data={...data,...await call(`${UPLOAD}/files/${data!.id}?uploadType=media&fields=id,version`,{method:'PATCH',headers:{'Content-Type':'application/json'},body})};
      cache={version:data!.version!,doc};
    },
    upload:(file,meta,o)=>resumable(file,meta,files,o),
    // Borrar = mandar a la papelera de Drive: se puede recuperar durante 30 días.
    async rename(id,name){await call(`${API}/files/${id}?fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})})},
    async remove(id){await call(`${API}/files/${id}?fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})})},
    async blob(id){return (await call(`${API}/files/${id}?alt=media`,{},true)).blob()},
    async signOut(){setToken(null)},
  };
}

// ---------- Subida reanudable ----------
// Se abre una «sesión de subida» y se envía por trozos de 8 MB. Si se corta, se pregunta a Drive
// cuánto le llegó y se sigue desde ahí (también al pulsar «Reintentar»).
type Resume={uri:string;offset:number};
export async function resumable(file:Blob,meta:{name:string;type:string},parent:string,o:UploadOptions):Promise<string>{
  let st=o.resume?.get() as Resume|undefined;
  const open=async()=>{const r:Response=await call(`${UPLOAD}/files?uploadType=resumable&fields=id`,{method:'POST',
      headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':meta.type||'application/octet-stream','X-Upload-Content-Length':String(file.size)},
      body:JSON.stringify({name:meta.name,parents:[parent],appProperties:{aula:'file'}})},true);
    const uri=r.headers.get('Location');if(!uri)throw new Error('Google Drive no ha abierto la subida.');
    st={uri,offset:0};o.resume?.set(st)};
  if(!st)await open();
  else{const s=await status(st,file.size);if(s.id)return s.id;if(s.offset<0)await open();else st!.offset=s.offset}
  for(let attempt=0;;){
    if(o.signal.aborted)throw new DOMException('Cancelada','AbortError');
    const a=st!.offset,b=Math.min(file.size,a+CHUNK);
    try{
      const r=await sendChunk(st!.uri,file.slice(a,b),a,file.size,n=>o.onProgress(a+n),o.signal);
      if(r.id)return r.id;
      st!.offset=r.offset??b;o.resume?.set(st);attempt=0;
    }catch(e){
      if(o.signal.aborted||e instanceof UserError)throw e;
      if(++attempt>6)throw new Error('Se ha perdido la conexión. Pulsa «Reintentar» para seguir desde donde se quedó.');
      await new Promise(r=>setTimeout(r,Math.min(8000,800*2**attempt)));
      const s=await status(st!,file.size).catch(()=>({offset:st!.offset} as {offset:number;id?:string}));
      if(s.id)return s.id;if(s.offset<0)await open();else st!.offset=s.offset;
    }
  }
}
// Envía un trozo. Drive responde «308» (sigue) con lo recibido, o 200/201 con el archivo ya creado.
function sendChunk(uri:string,blob:Blob,start:number,total:number,onProgress:(n:number)=>void,signal:AbortSignal){
  return new Promise<{id?:string;offset?:number}>((ok,fail)=>{
    if(!hasToken())return fail(new UserError('Tu sesión de Google ha caducado: pulsa «Renovar sesión» y luego «Reintentar».'));
    const x=new XMLHttpRequest();x.open('PUT',uri);
    x.setRequestHeader('Content-Range',`bytes ${start}-${start+blob.size-1}/${total}`);
    x.setRequestHeader('X-Guploader-No-308','yes'); // así el «308» llega como 200 con una cabecera y el navegador no lo trata como redirección
    x.upload.onprogress=e=>onProgress(e.loaded);
    const abort=()=>x.abort();signal.addEventListener('abort',abort,{once:true});
    x.onload=()=>{signal.removeEventListener('abort',abort);
      const override=x.getResponseHeader('X-Http-Status-Code-Override');
      if(x.status===308||override==='308'){const m=/bytes=0-(\d+)/.exec(x.getResponseHeader('Range')||'');return ok({offset:m?Number(m[1])+1:start+blob.size})}
      if(x.status===200||x.status===201){try{return ok({id:JSON.parse(x.responseText).id})}catch{return fail(new Error('Respuesta rara de Google Drive.'))}}
      if(x.status===401)return fail(new UserError('Tu sesión de Google ha caducado: pulsa «Renovar sesión» y luego «Reintentar».'));
      if(x.status===404||x.status===410)return fail(Object.assign(new Error('La subida ha caducado.'),{expired:true}));
      fail(new Error('Error de conexión ('+x.status+').'))};
    x.onerror=()=>{signal.removeEventListener('abort',abort);fail(new Error('Se ha perdido la conexión.'))};
    x.onabort=()=>fail(new DOMException('Cancelada','AbortError'));
    x.send(blob);
  });
}
// ¿Cuánto tiene ya Drive de esta subida? offset -1 = la sesión caducó y hay que empezar otra.
function status(st:Resume,total:number){
  return new Promise<{offset:number;id?:string}>((ok,fail)=>{
    const x=new XMLHttpRequest();x.open('PUT',st.uri);x.setRequestHeader('Content-Range',`bytes */${total}`);x.setRequestHeader('X-Guploader-No-308','yes');
    x.onload=()=>{const override=x.getResponseHeader('X-Http-Status-Code-Override');
      if(x.status===308||override==='308'){const m=/bytes=0-(\d+)/.exec(x.getResponseHeader('Range')||'');return ok({offset:m?Number(m[1])+1:0})}
      if(x.status===200||x.status===201){try{return ok({offset:total,id:JSON.parse(x.responseText).id})}catch{}}
      if(x.status===404||x.status===410)return ok({offset:-1});
      fail(new Error('No se ha podido comprobar la subida.'))};
    x.onerror=()=>fail(new Error('Se ha perdido la conexión.'));x.send();
  });
}

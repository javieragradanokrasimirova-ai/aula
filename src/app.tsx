// Entrada de Aula: eliges dónde guardar (tu Google Drive o, para probar, este navegador),
// se cargan tus datos y aparece la web de siempre.
import {useEffect,useState} from 'react';
import {AlertCircle,BookOpen,FlaskConical,HardDrive,Loader2,Lock,LogIn} from 'lucide-react';
import Archive from './archive';
import {Store,StoreContext} from './store';
import {demoAdapter,resetDemo} from './demo';
import {driveAdapter,hasToken,onTokenChange,signIn} from './drive';
import {GOOGLE_CLIENT_ID} from './config';
import {session} from './idb';

type Mode='drive'|'demo';
const MODE_KEY='aula-modo';
const savedMode=():Mode|null=>{try{const m=localStorage.getItem(MODE_KEY);return m==='drive'||m==='demo'?m:null}catch{return null}};
const saveMode=(m:Mode|null)=>{try{if(m)localStorage.setItem(MODE_KEY,m);else localStorage.removeItem(MODE_KEY)}catch{}};

export default function App(){
  const [store,setStore]=useState<Store|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [expired,setExpired]=useState(false),[ready,setReady]=useState(false);

  async function open(mode:Mode,interactive:boolean){
    setBusy(true);setError('');
    try{
      if(mode==='drive'&&!hasToken()){if(!interactive)return;await signIn()}
      const s=new Store(mode==='drive'?await driveAdapter():await demoAdapter());
      await s.load();saveMode(mode);setStore(s);
    }catch(e){setError((e as Error).message)}finally{setBusy(false);setReady(true)}
  }
  // Al volver: si la última vez entraste con Google y la sesión sigue viva (dura una hora), entras directo.
  useEffect(()=>{const m=savedMode();if(m==='demo'||m==='drive'&&hasToken())open(m,false);else setReady(true)},[]);
  useEffect(()=>onTokenChange(ok=>setExpired(!ok&&store?.adapter.kind==='drive')),[store]);

  async function signOut(){if(!store)return;await store.adapter.signOut();saveMode(null);setStore(null);setExpired(false)}

  if(store)return <StoreContext.Provider value={store}>
    {expired&&<div className="session-bar" role="alert"><AlertCircle size={16}/><span>Tu sesión de Google ha caducado (dura una hora). Para seguir guardando, vuelve a entrar.</span>
      <button className="primary" onClick={async()=>{try{await signIn(store.adapter.user.email);setExpired(false)}catch(e){alert((e as Error).message)}}}><LogIn size={15}/>Continuar con Google</button></div>}
    <Archive initial={store.data} settings={store.doc.settings} onSignOut={signOut}/>
  </StoreContext.Provider>;

  return <div className="welcome">
    <div className="welcome-card">
      <span className="brand welcome-brand"><span className="brandmark"><BookOpen size={21}/></span>aula<span className="brand-dot">.</span></span>
      <h1>Tus clases, tu horario y tus entregas, en un solo sitio.</h1>
      <p>Guarda audios, fotos y apuntes por asignatura y fecha, mira qué clase toca ahora y no se te pase ninguna entrega.</p>
      {!ready?<div className="welcome-loading"><Loader2 className="spin" size={20}/>Abriendo…</div>:<>
        <button className="primary welcome-main" disabled={busy||!GOOGLE_CLIENT_ID} onClick={()=>open('drive',true)}>{busy?<Loader2 className="spin" size={18}/>:<GoogleMark/>}Entrar con Google</button>
        {!GOOGLE_CLIENT_ID&&<p className="welcome-note">El inicio de sesión con Google aún no está configurado en esta copia.</p>}
        <button className="ghost welcome-demo" disabled={busy} onClick={()=>open('demo',true)}><FlaskConical size={17}/>Probar sin cuenta</button>
        {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
      </>}
      <ul className="welcome-facts">
        <li><HardDrive size={16}/><span><b>Tus archivos, en tu Google Drive.</b> En una carpeta «Aula». Aula solo puede ver lo que ella misma crea, no el resto de tu Drive.</span></li>
        <li><Lock size={16}/><span><b>Nadie más guarda tus datos.</b> No hay servidor de Aula: la web habla directamente con tu Drive.</span></li>
        <li><FlaskConical size={16}/><span><b>Sin cuenta</b>, todo se queda solo en este navegador. Ideal para probar.</span></li>
      </ul>
    </div>
    {savedMode()===null&&<button className="welcome-reset" onClick={async()=>{if(confirm('¿Borrar todo lo guardado en el modo demo de este navegador?')){await resetDemo();await session().del('session','current')}}}>Borrar datos del modo demo</button>}
  </div>;
}

const GoogleMark=()=><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;

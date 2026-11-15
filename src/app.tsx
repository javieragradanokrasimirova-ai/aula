// Entrada de Aula: eliges dónde guardar (tu Google Drive o, para probar, este navegador),
// se cargan tus datos y aparece la web de siempre.
import {useEffect,useState} from 'react';
import {AlertCircle,ArrowRight,BookOpen,Check,FlaskConical,HardDrive,Loader2,Lock,RotateCw} from 'lucide-react';
import Archive from './archive';
import Onboarding from './onboarding';
import UpdateBanner from './update-banner';
import {InstallBanner} from './install';
import {Store,StoreContext,type User} from './store';
import {demoAdapter,resetDemo} from './demo';
import {driveAdapter,hasToken,onTokenChange,signIn} from './drive';
import {GOOGLE_CLIENT_ID} from './config';
import {session} from './idb';
import {readPref,writePref} from './prefs';
import Avatar from './avatar';

type Mode='drive'|'demo';
const MODE_KEY='aula-modo',ACCOUNT_KEY='aula-cuenta';
const savedMode=():Mode|null=>{const m=readPref(MODE_KEY);return m==='drive'||m==='demo'?m:null};
const saveMode=(m:Mode|null)=>writePref(MODE_KEY,m);
// La última cuenta con la que entraste en este dispositivo: la bienvenida dice «Continuar como …» y
// Google no vuelve a preguntar qué cuenta usar. Se olvida al cerrar sesión.
const savedAccount=():User|null=>{try{const u=JSON.parse(readPref(ACCOUNT_KEY)||'null');return u&&typeof u.name==='string'?u:null}catch{return null}};
const saveAccount=(u:User|null)=>writePref(ACCOUNT_KEY,u?JSON.stringify({name:u.name,email:u.email,picture:u.picture}):null);

// Pasos al entrar con Google, para enseñar qué está pasando mientras tanto.
type Stage='google'|'drive'|'data';

export default function App(){
  const [store,setStore]=useState<Store|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [stage,setStage]=useState<Stage|null>(null),[renewing,setRenewing]=useState(false);
  const [expired,setExpired]=useState(false),[ready,setReady]=useState(false),[account,setAccount]=useState(savedAccount);
  // Bienvenida: la primera vez (sin asignaturas ni clases). «Ya tenía Aula» abre la importación.
  const [welcome,setWelcome]=useState(false),[startImport,setStartImport]=useState(false);

  async function open(mode:Mode,interactive:boolean,hint?:string){
    setBusy(true);setError('');
    try{
      if(mode==='drive'){
        if(!hasToken()){if(!interactive)return;setStage('google');await signIn(hint)}
        setStage('drive');
      }
      const adapter=mode==='drive'?await driveAdapter():await demoAdapter();
      if(mode==='drive'){setStage('data');saveAccount(adapter.user);setAccount(adapter.user)}
      const s=new Store(adapter);
      const d=await s.load();saveMode(mode);
      setWelcome(!d.settings.subjects.length&&!d.lessons.length&&!d.events.length);setStore(s);
    }catch(e){setError((e as Error).message)}finally{setBusy(false);setStage(null);setReady(true)}
  }
  // Al volver: si la última vez entraste con Google y la sesión sigue viva (dura una hora), entras directo.
  useEffect(()=>{const m=savedMode();if(m==='demo'||m==='drive'&&hasToken())open(m,false);else setReady(true)},[]);
  useEffect(()=>onTokenChange(ok=>setExpired(!ok&&store?.adapter.kind==='drive')),[store]);

  async function signOut(){
    if(!store)return;await store.adapter.signOut();saveMode(null);
    if(store.adapter.kind==='drive'){saveAccount(null);setAccount(null)}
    setStore(null);setExpired(false);
  }
  async function renew(){
    if(!store)return;setRenewing(true);
    try{await signIn(store.adapter.user.email);setExpired(false)}catch(e){alert((e as Error).message)}finally{setRenewing(false)}
  }

  if(store)return <StoreContext.Provider value={store}>
    <UpdateBanner/>
    <InstallBanner/>
    {expired&&<div className="session-bar" role="alert"><AlertCircle size={16}/><span>Tu sesión de Google ha caducado (dura una hora). Para seguir guardando, renuévala: es un momento.</span>
      <button className="primary" disabled={renewing} onClick={renew}>{renewing?<Loader2 className="spin" size={15}/>:<RotateCw size={15}/>}Renovar sesión</button></div>}
    {renewing&&<Connecting stage="google" renew email={store.adapter.user.email}/>}
    {welcome?<Onboarding onDone={({importCopy})=>{setStartImport(!!importCopy);setWelcome(false)}}/>
    :<Archive initial={store.data} settings={store.doc.settings} onSignOut={signOut} startImport={startImport}/>}
  </StoreContext.Provider>;

  return <div className="welcome">
    {stage&&<Connecting stage={stage} email={account?.email}/>}
    <div className="welcome-card">
      <span className="brand welcome-brand"><span className="brandmark"><BookOpen size={21}/></span>aula<span className="brand-dot">.</span></span>
      {account?<><h1>Hola de nuevo, {account.name.split(' ')[0]}.</h1>
        <p>Por seguridad, Google cierra la sesión de Aula al cabo de una hora. Pulsa para seguir donde lo dejaste.</p></>
      :<><h1>Tus clases, tu horario y tus entregas, en un solo sitio.</h1>
        <p>Guarda audios, fotos y apuntes por asignatura y fecha, mira qué clase toca ahora y no se te pase ninguna entrega.</p></>}
      {!ready?<div className="welcome-loading"><Loader2 className="spin" size={20}/>Abriendo…</div>:<>
        {account?<>
          <button className="primary welcome-main welcome-account" disabled={busy||!GOOGLE_CLIENT_ID} onClick={()=>open('drive',true,account.email)}>
            <Avatar user={account} className="welcome-avatar"/><span><b>Continuar como {account.name.split(" ")[0]}</b>{account.email&&<small>{account.email}</small>}</span><ArrowRight size={18}/></button>
          <button className="ghost welcome-other" disabled={busy} onClick={()=>{saveAccount(null);setAccount(null);open('drive',true)}}><GoogleMark/>Usar otra cuenta de Google</button>
        </>:<button className="primary welcome-main" disabled={busy||!GOOGLE_CLIENT_ID} onClick={()=>open('drive',true)}><GoogleMark/>Entrar con Google</button>}
        {!GOOGLE_CLIENT_ID&&<p className="welcome-note">El inicio de sesión con Google aún no está configurado en esta copia.</p>}
        {!account&&<button className="ghost welcome-demo" disabled={busy} onClick={()=>open('demo',true)}><FlaskConical size={17}/>Probar sin cuenta</button>}
        {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
      </>}
      {!account&&<ul className="welcome-facts">
        <li><HardDrive size={16}/><span><b>Tus archivos, en tu Google Drive.</b> En una carpeta «Aula». Aula solo puede ver lo que ella misma crea, no el resto de tu Drive.</span></li>
        <li><Lock size={16}/><span><b>Nadie más guarda tus datos.</b> No hay servidor de Aula: la web habla directamente con tu Drive.</span></li>
        <li><FlaskConical size={16}/><span><b>Sin cuenta</b>, todo se queda solo en este navegador. Ideal para probar.</span></li>
      </ul>}
    </div>
    <nav className="welcome-links"><a href="./privacidad.html">Privacidad</a><a href="https://github.com/javieragradanokrasimirova-ai/aula" rel="noopener">Código fuente</a></nav>
    {savedMode()===null&&!account&&<button className="welcome-reset" onClick={async()=>{if(confirm('¿Borrar todo lo guardado en el modo demo de este navegador?')){await resetDemo();await session().del('session','current')}}}>Borrar datos del modo demo</button>}
  </div>;
}

// Pantalla mientras se conecta con Google: dice en qué paso va, en vez de quedarse todo quieto.
const STEPS:{id:Stage;label:string;wait:string}[]=[
  {id:'google',label:'Confirmar tu cuenta de Google',wait:'Se ha abierto una ventana de Google: elige tu cuenta allí. Si ya la elegiste antes, se cierra sola.'},
  {id:'drive',label:'Buscar tu carpeta «Aula» en Drive',wait:'Comprobando tu carpeta en Google Drive…'},
  {id:'data',label:'Cargar tus clases y tu calendario',wait:'Descargando tus datos…'},
];
function Connecting({stage,renew,email}:{stage:Stage;renew?:boolean;email?:string}){
  const at=STEPS.findIndex(s=>s.id===stage);
  return <div className="connecting" role="dialog" aria-modal="true" aria-label={renew?'Renovando la sesión':'Conectando con Google'}>
    <div className="connecting-card">
      <span className="connecting-mark"><BookOpen size={22}/></span>
      <h2>{renew?'Renovando tu sesión':'Conectando con tu Google Drive'}</h2>
      <p className="connecting-now" aria-live="polite">{renew?'Se abre un momento una ventana de Google y se cierra sola. No tienes que hacer nada más.':STEPS[at].wait}</p>
      {!renew&&<ol className="connecting-steps">{STEPS.map((s,i)=><li key={s.id} className={i<at?'done':i===at?'now':''}>
        <span className="connecting-dot">{i<at?<Check size={13}/>:i===at?<Loader2 className="spin" size={14}/>:i+1}</span>{s.label}</li>)}</ol>}
      {renew&&<Loader2 className="spin connecting-spin" size={22}/>}
      {email&&<small className="connecting-who">Cuenta: {email}</small>}
    </div>
  </div>;
}

const GoogleMark=()=><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;

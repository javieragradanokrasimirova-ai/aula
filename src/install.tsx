// Instalar Aula como app (en el móvil queda un icono en la pantalla de inicio y se abre sin barra del
// navegador). Chrome, Edge, Brave y Samsung Internet avisan con «beforeinstallprompt»: se guarda ese aviso
// y se usa cuando pulsas «Instalar». En el iPhone no existe: allí se explica cómo hacerlo desde Safari.
import {useEffect,useState} from 'react';
import {Download,Share,X} from 'lucide-react';

type Prompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
let deferred:Prompt|null=null;
const subs=new Set<()=>void>();
const ping=()=>{for(const f of subs)f()};
// Se escucha desde el principio (main.tsx importa este archivo antes de pintar nada): el aviso llega pronto.
if(typeof window!=='undefined'){
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e as Prompt;ping()});
  addEventListener('appinstalled',()=>{deferred=null;ping()});
}

export const isInstalled=()=>matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

export function useInstall(){
  const [,tick]=useState(0);
  useEffect(()=>{const f=()=>tick(n=>n+1);subs.add(f);return()=>{subs.delete(f)}},[]);
  const installed=isInstalled();
  return {
    // «prompt»: el navegador sabe instalarla. «ios»: hay que hacerlo a mano desde Safari.
    how:installed?null:deferred?'prompt' as const:isIOS()?'ios' as const:null,
    async install(){if(!deferred)return false;const p=deferred;await p.prompt();const {outcome}=await p.userChoice;deferred=null;ping();return outcome==='accepted'},
  };
}

export const IOS_STEPS='En Safari, pulsa Compartir (el cuadrado con la flecha) y luego «Añadir a pantalla de inicio».';

// Aviso que sale una vez abajo (sobre todo pensado para el móvil). Si lo cierras, no vuelve; la opción
// sigue en Ajustes → Tus datos.
const SEEN='aula-instalar-visto';
export function InstallBanner(){
  const {how,install}=useInstall();
  const [hidden,setHidden]=useState(()=>{try{return !!localStorage.getItem(SEEN)}catch{return true}});
  const [ios,setIos]=useState(false);
  if(!how||hidden)return null;
  const close=()=>{setHidden(true);try{localStorage.setItem(SEEN,'1')}catch{}};
  return <div className="install-bar" role="status">
    <img src="./icons/icon-192.png" alt="" width={34} height={34}/>
    <span>{ios?IOS_STEPS:<><b>Instala Aula</b> y ábrela desde tu pantalla de inicio, como una app.</>}</span>
    {!ios&&<button className="primary" onClick={async()=>{if(how==='ios')setIos(true);else if(await install())close()}}>{how==='ios'?<Share size={15}/>:<Download size={15}/>}{how==='ios'?'Cómo':'Instalar'}</button>}
    <button className="iconbtn" aria-label="No, gracias" onClick={close}><X size={16}/></button>
  </div>;
}

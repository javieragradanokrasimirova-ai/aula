// Aviso de versión nueva: GitHub Pages deja la página guardada en el navegador unos minutos, así que
// tras publicar algo puedes seguir con la versión anterior. Cada rato (y al volver a la pestaña) se mira
// si la web publicada usa otro archivo de código; si es así, se ofrece recargar (nunca a la fuerza).
import {useEffect,useState} from 'react';
import {RotateCw,Sparkles} from 'lucide-react';

const current=()=>[...document.scripts].map(s=>s.src).find(s=>/assets\/index-[\w-]+\.js/.test(s))?.match(/index-[\w-]+\.js/)?.[0];
async function published(){
  const r=await fetch('./index.html?comprobar='+Date.now(),{cache:'no-store'});if(!r.ok)return null;
  return (await r.text()).match(/assets\/(index-[\w-]+\.js)/)?.[1]??null;
}
export default function UpdateBanner(){
  const [fresh,setFresh]=useState(false);
  useEffect(()=>{
    const mine=current();if(!mine)return; // en desarrollo no hay archivo con nombre de versión
    let stop=false;
    const check=async()=>{if(stop||document.visibilityState!=='visible')return;try{const p=await published();if(p&&p!==mine)setFresh(true)}catch{}};
    const t=setInterval(check,10*60000);document.addEventListener('visibilitychange',check);const first=setTimeout(check,15000);
    return()=>{stop=true;clearInterval(t);clearTimeout(first);document.removeEventListener('visibilitychange',check)};
  },[]);
  if(!fresh)return null;
  // Se recarga con una dirección distinta para que el navegador no use la página guardada.
  return <div className="update-bar" role="status"><Sparkles size={16}/><span>Hay una versión nueva de Aula.</span>
    <button className="primary" onClick={()=>{location.href=location.pathname+'?v='+Date.now()+location.hash}}><RotateCw size={15}/>Recargar</button></div>;
}

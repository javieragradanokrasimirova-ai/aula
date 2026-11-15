import {createRoot} from 'react-dom/client';
import App from './app';
import './globals.css';
import './install'; // escucha desde ya el aviso de «se puede instalar»

// El service worker sirve tus archivos (Drive o modo demo) y arma los ZIP. Se espera un momento a
// que tome el control de la página antes de mostrar nada, para que los archivos se vean a la primera.
async function boot(){
  if('serviceWorker' in navigator){
    try{
      await navigator.serviceWorker.register('./aula-sw.js',{scope:'./'});
      if(!navigator.serviceWorker.controller)await Promise.race([new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true})),new Promise(r=>setTimeout(r,3000))]);
    }catch{}
  }
  createRoot(document.getElementById('root')!).render(<App/>);
}
boot();

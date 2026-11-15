// Ventana modal con animación de entrada y salida, cierre con Esc o tocando fuera.
import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

export function Modal({label,className='',onClose,children}:{label:string;className?:string;onClose:()=>void;children:(close:()=>void)=>React.ReactNode}){
  const [closing,setClosing]=useState(false),closed=useRef(false);
  const close=useCallback(()=>{if(closed.current)return;closed.current=true;setClosing(true);setTimeout(onClose,150)},[onClose]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')close()};addEventListener('keydown',k);const o=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{removeEventListener('keydown',k);document.body.style.overflow=o}},[close]);
  // Se pinta directamente en <body>: así cubre toda la pantalla (barra de arriba incluida)
  // aunque se abra desde una parte de la página que esté animándose.
  return createPortal(<div className={'overlay'+(closing?' closing':'')} onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section role="dialog" aria-modal="true" aria-label={label} className={'modal '+className}>{children(close)}</section></div>,document.body);
}

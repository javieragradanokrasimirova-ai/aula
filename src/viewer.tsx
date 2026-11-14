
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Download,ExternalLink,FileAudio,FileText,Loader2,X,ZoomIn,ZoomOut} from 'lucide-react';
import {bytes,fileURL,guessType,kindOf,viewableImage,type Item} from './types';
import {useStore} from './store';

type Pt={x:number;y:number};
const MAX=5;

// Sin service worker (p. ej. ventana privada de Firefox) los archivos no se pueden abrir aquí: se descargan.
function NoWorker({f}:{f:Item}){
  const store=useStore(),[busy,setBusy]=useState(false);
  const save=async()=>{setBusy(true);try{const b=await store.adapter.blob(f.id),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000)}finally{setBusy(false)}};
  return <div className="viewer-card"><span className="viewer-card-icon"><FileText size={40}/></span><b>{f.name}</b><p>Este navegador no permite ver archivos dentro de Aula (pasa en algunas ventanas privadas). Puedes descargarlo.</p>
    <button className="primary" disabled={busy} onClick={save}>{busy?<Loader2 className="spin" size={17}/>:<Download size={17}/>}Descargar · {bytes(f.size)}</button></div>;
}

// Visor a pantalla completa. Con varias fotos permite pasar de una a otra con
// flechas, teclado o deslizando, y ampliar con doble toque, pellizco o rueda.
export default function Viewer({items,start,onClose}:{items:Item[];start:number;onClose:()=>void}){
  const [index,setIndex]=useState(start),[dir,setDir]=useState(0),[closing,setClosing]=useState(false);
  const f=items[index],many=items.length>1;
  const go=(d:number)=>{if(!many)return;setDir(d);setIndex(i=>(i+d+items.length)%items.length)};
  const close=()=>{setClosing(true);setTimeout(onClose,160)};
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')close();else if(e.key==='ArrowRight')go(1);else if(e.key==='ArrowLeft')go(-1)};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)});
  useEffect(()=>{const o=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=o}},[]);
  // Precarga las fotos vecinas para que el cambio sea instantáneo.
  useEffect(()=>{if(!many)return;for(const d of [1,-1]){const n=items[(index+d+items.length)%items.length];if(viewableImage(n))new Image().src=fileURL(n)}},[index,items,many]);
  return <div className={'viewer'+(closing?' closing':'')} role="dialog" aria-modal="true" aria-label={f.name}>
    <header className="viewer-bar">
      <div className="viewer-title"><b>{f.name}</b><small>{many&&`${index+1} de ${items.length} · `}{bytes(f.size)}</small></div>
      <a className="viewer-btn" href={fileURL(f,true)} title="Descargar original" aria-label="Descargar original"><Download size={19}/></a>
      <button className="viewer-btn" onClick={close} aria-label="Cerrar visor" autoFocus><X size={21}/></button>
    </header>
    <div className="viewer-stage" key={f.id} data-dir={dir}>
      {!navigator.serviceWorker?.controller?<NoWorker f={f}/>:viewableImage(f)?<Zoomable f={f} onSwipe={go} many={many}/>:kindOf(f)==='audio'?<div className="viewer-card"><span className="viewer-card-icon"><FileAudio size={40}/></span><b>{f.name}</b><audio controls autoPlay preload="metadata" src={fileURL(f)}/></div>
        :guessType(f.name,f.type)==='application/pdf'?<div className="viewer-pdf"><iframe title={f.name} src={fileURL(f)}/><a className="viewer-link" href={fileURL(f)} target="_blank" rel="noopener"><ExternalLink size={15}/>Abrir en otra pestaña</a></div>
        :<div className="viewer-card"><span className="viewer-card-icon"><FileText size={40}/></span><b>{f.name}</b><p>Este formato no se puede mostrar aquí. Descarga el original para abrirlo con tu aplicación.</p><a className="primary" href={fileURL(f,true)}><Download size={17}/>Descargar · {bytes(f.size)}</a></div>}
    </div>
    {many&&<><button className="viewer-nav prev" onClick={()=>go(-1)} aria-label="Foto anterior"><ChevronLeft size={26}/></button><button className="viewer-nav next" onClick={()=>go(1)} aria-label="Foto siguiente"><ChevronRight size={26}/></button></>}
  </div>;
}

function Zoomable({f,onSwipe,many}:{f:Item;onSwipe:(d:number)=>void;many:boolean}){
  const [loaded,setLoaded]=useState(false),[t,setT]=useState({s:1,x:0,y:0}),[drag,setDrag]=useState(0),[live,setLive]=useState(false);
  const box=useRef<HTMLDivElement>(null),pts=useRef(new Map<number,Pt>()),g=useRef<{start:Pt;t:typeof t;dist?:number;mid?:Pt;moved:boolean}|null>(null),lastTap=useRef(0);
  const clamp=(n:{s:number;x:number;y:number})=>{const s=Math.min(MAX,Math.max(1,n.s));if(s===1)return {s,x:0,y:0};const r=box.current!.getBoundingClientRect(),mx=r.width*(s-1)/2,my=r.height*(s-1)/2;return {s,x:Math.min(mx,Math.max(-mx,n.x)),y:Math.min(my,Math.max(-my,n.y))}};
  // Amplía manteniendo fijo el punto que se toca o señala.
  const zoomAt=(s:number,p:Pt,from=t)=>{const r=box.current!.getBoundingClientRect(),cx=p.x-r.left-r.width/2,cy=p.y-r.top-r.height/2,k=s/from.s;return clamp({s,x:cx-(cx-from.x)*k,y:cy-(cy-from.y)*k})};
  const down=(e:React.PointerEvent)=>{(e.target as Element).setPointerCapture?.(e.pointerId);pts.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=[...pts.current.values()];setLive(true);
    if(p.length===2){const [a,b]=p;g.current={start:a,t,dist:Math.hypot(a.x-b.x,a.y-b.y),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},moved:true}}else g.current={start:{x:e.clientX,y:e.clientY},t,moved:false}};
  const move=(e:React.PointerEvent)=>{if(!pts.current.has(e.pointerId)||!g.current)return;pts.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=[...pts.current.values()],G=g.current;
    if(p.length===2&&G.dist){const [a,b]=p;setT(zoomAt(G.t.s*Math.hypot(a.x-b.x,a.y-b.y)/G.dist,G.mid!,G.t));return}
    const dx=e.clientX-G.start.x,dy=e.clientY-G.start.y;if(Math.hypot(dx,dy)>6)G.moved=true;
    if(G.t.s>1)setT(clamp({s:G.t.s,x:G.t.x+dx,y:G.t.y+dy}));else if(many)setDrag(dx)};
  const up=(e:React.PointerEvent)=>{pts.current.delete(e.pointerId);const G=g.current;if(pts.current.size)return;g.current=null;setLive(false);
    if(!G)return;if(G.t.s===1&&Math.abs(drag)>70){onSwipe(drag<0?1:-1);setDrag(0);return}setDrag(0);
    if(!G.moved){const now=Date.now();if(now-lastTap.current<300){setT(t.s>1?{s:1,x:0,y:0}:zoomAt(2.5,{x:e.clientX,y:e.clientY}));lastTap.current=0}else lastTap.current=now}};
  useEffect(()=>{const el=box.current!;const wheel=(e:WheelEvent)=>{e.preventDefault();setT(c=>zoomAt(c.s*Math.exp(-e.deltaY*0.0018),{x:e.clientX,y:e.clientY},c))};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)});
  const step=(k:number)=>{const r=box.current!.getBoundingClientRect();setT(zoomAt(t.s*k,{x:r.left+r.width/2,y:r.top+r.height/2}))};
  return <div className={'zoom'+(live?' live':'')} ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{cursor:t.s>1?'grab':'zoom-in'}}>
    {!loaded&&<Loader2 className="spin viewer-spinner" size={30}/>}
    <img src={fileURL(f)} alt={f.name} draggable={false} onLoad={()=>setLoaded(true)} className={loaded?'ready':''} style={{transform:`translate(${t.x+drag}px,${t.y}px) scale(${t.s})`}}/>
    <div className="zoom-tools" onPointerDown={e=>e.stopPropagation()}><button onClick={()=>step(1/1.6)} disabled={t.s<=1} aria-label="Reducir"><ZoomOut size={18}/></button><span>{Math.round(t.s*100)}%</span><button onClick={()=>step(1.6)} disabled={t.s>=MAX} aria-label="Ampliar"><ZoomIn size={18}/></button></div>
  </div>;
}

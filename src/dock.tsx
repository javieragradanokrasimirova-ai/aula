// Paneles flotantes de abajo: subidas en curso, descarga del ZIP y la fila de subida dentro de una clase.
import {useEffect,useState} from 'react';
import {AlertCircle,Check,ChevronDown,FileArchive,Loader2,RotateCw,Upload,X} from 'lucide-react';
import {bytes,plural} from './types';
import type {Upload as UploadJob} from './uploads';
import type {ZipProgress} from './zip';

export type Zip={lesson:string;title:string;loaded:number;total:number;mode?:ZipProgress['mode'];status:'preparing'|'running'|'done'|'error';error?:string};

const eta=(u:UploadJob)=>{if(u.rate<1)return '';const s=(u.file.size-u.loaded)/u.rate;return s<60?`${Math.max(1,Math.round(s))} s`:`${Math.round(s/60)} min`};
function uploadText(u:UploadJob){
  if(u.status==='queued')return 'En cola';
  if(u.status==='finishing')return 'Guardando…';
  if(u.status==='done')return 'Guardado';
  if(u.status==='cancelled')return 'Cancelado';
  if(u.status==='error')return u.error||'Error';
  if(!u.loaded)return 'Empezando…';const left=eta(u);return `${bytes(u.loaded)} de ${bytes(u.file.size)}${u.rate>1?` · ${bytes(u.rate)}/s`:''}${left?` · quedan ${left}`:''}`;
}

export function UploadRow({u,i,onCancel,onRetry}:{u:UploadJob;i:number;onCancel:()=>void;onRetry:()=>void}){
  const pct=u.file.size?u.loaded/u.file.size:0;
  return <div className={'filerow uploading '+u.status} style={{'--i':i} as React.CSSProperties}>
    <span className="fileicon upload"><Upload size={18}/></span>
    <div className="filename"><b>{u.file.name}</b><small>{uploadText(u)}</small><span className="bar"><i style={{transform:`scaleX(${pct})`}}/></span></div>
    <div className="file-actions">{u.status==='error'?<button className="iconbtn" onClick={onRetry} title="Reintentar" aria-label={'Reintentar '+u.file.name}><RotateCw size={16}/></button>:null}
      {u.status==='queued'||u.status==='uploading'?<button className="iconbtn" onClick={onCancel} title="Cancelar" aria-label={'Cancelar '+u.file.name}><X size={17}/></button>:null}</div>
  </div>;
}

export function UploadPanel({uploads,onCancel,onRetry,onClear,onOpen}:{uploads:UploadJob[];onCancel:(k:string)=>void;onRetry:(k:string)=>void;onClear:()=>void;onOpen:(lesson:string)=>void}){
  // En el móvil empieza contraído para no tapar la clase.
  const [open,setOpen]=useState(()=>!matchMedia('(max-width:760px)').matches);
  const running=uploads.filter(u=>u.status==='queued'||u.status==='uploading'||u.status==='finishing'),failed=uploads.filter(u=>u.status==='error').length;
  // Al terminar sin errores se contrae y, poco después, desaparece.
  useEffect(()=>{if(running.length||failed)return;setOpen(false);const t=setTimeout(onClear,6000);return()=>clearTimeout(t)},[running.length,failed,onClear]);
  const size=running.reduce((s,u)=>s+u.file.size,0),loaded=running.reduce((s,u)=>s+u.loaded,0),pct=size?Math.round(loaded/size*100):100;
  const title=running.length?`Subiendo ${plural(running.length,'archivo','archivos')} · ${pct}%`:failed?`${plural(failed,'subida con error','subidas con error')}`:'Subidas completadas';
  return <section className={'panel uploads-panel'+(open?' open':'')} aria-label="Subidas">
    <header><span className={'panel-icon'+(running.length?' busy':failed?' warn':' ok')}>{running.length?<Loader2 className="spin" size={17}/>:failed?<AlertCircle size={17}/>:<Check size={17}/>}</span>
      <div><b>{title}</b><small>{running.length?'Puedes seguir usando Aula mientras tanto':'Tus archivos ya están en su clase'}</small></div>
      <button className="iconbtn" onClick={()=>setOpen(o=>!o)} aria-expanded={open} aria-label={open?'Contraer':'Desplegar'}><ChevronDown size={18} className="chev"/></button>
      {!running.length&&<button className="iconbtn" onClick={onClear} aria-label="Cerrar panel de subidas"><X size={17}/></button>}
    </header>
    {running.length>0&&<span className="bar total"><i style={{transform:`scaleX(${pct/100})`}}/></span>}
    {open&&<ul>{uploads.map(u=><li key={u.key} className={u.status}>
      <button className="panel-file" onClick={()=>onOpen(u.lesson)}><b>{u.file.name}</b><small>{u.lessonTitle} · {uploadText(u)}</small>
        {u.status!=='done'&&u.status!=='cancelled'&&<span className="bar"><i style={{transform:`scaleX(${u.file.size?u.loaded/u.file.size:0})`}}/></span>}</button>
      {u.status==='done'?<Check size={16} className="done-icon"/>:u.status==='error'?<button className="iconbtn" onClick={()=>onRetry(u.key)} aria-label="Reintentar"><RotateCw size={15}/></button>:u.status==='queued'||u.status==='uploading'?<button className="iconbtn" onClick={()=>onCancel(u.key)} aria-label="Cancelar"><X size={16}/></button>:null}
    </li>)}</ul>}
  </section>;
}

export function ZipCard({zip,onClose}:{zip:Zip;onClose:()=>void}){
  const pct=zip.total?Math.min(100,Math.round(zip.loaded/zip.total*100)):0;
  const text=zip.status==='preparing'?'Preparando la descarga…':zip.status==='error'?zip.error:zip.status==='done'?(zip.mode==='stream'?'Descarga completada':'ZIP listo · revisa tus descargas')
    :zip.mode==='stream'?`Descargando · ${bytes(zip.loaded)} de ${bytes(zip.total)}`:`Reuniendo archivos · ${bytes(zip.loaded)} de ${bytes(zip.total)}`;
  return <section className={'panel zip-panel '+zip.status} aria-live="polite">
    <header><span className={'panel-icon'+(zip.status==='error'?' warn':zip.status==='done'?' ok':' busy')}>{zip.status==='error'?<AlertCircle size={17}/>:zip.status==='done'?<Check size={17}/>:<FileArchive size={17}/>}</span>
      <div><b>{zip.title}.zip</b><small>{text}</small></div>
      {(zip.status==='done'||zip.status==='error')&&<button className="iconbtn" onClick={onClose} aria-label="Cerrar"><X size={17}/></button>}</header>
    {(zip.status==='running'||zip.status==='preparing')&&<span className={'bar total'+(zip.status==='preparing'?' indeterminate':'')}><i style={{transform:`scaleX(${pct/100})`}}/></span>}
  </section>;
}


// Una clase abierta: datos, herramientas (editar, descargar ZIP, eliminar), zona para soltar archivos y su lista.
import {useRef,useState} from 'react';
import {ChevronLeft,Download,Loader2,Pencil,Plus,Trash2,Upload} from 'lucide-react';
import {usePlan} from './plan';
import {bytes,fileURL,kindOf,viewableImage,type Item,type Lesson} from './types';
import {UploadRow,type Zip} from './dock';
import {Kind,dateLabel,kindLabel} from './lesson-bits';
import type {Upload as UploadJob} from './uploads';

type Props={active:Lesson;activeFiles:Item[];activeUploads:UploadJob[];zip:Zip|null;backToList:()=>void;setForm:(f:{edit?:Lesson})=>void;downloadClass:()=>void;removeLesson:()=>void;
  addFiles:(list:File[])=>void;cancel:(key:string)=>void;retry:(key:string)=>void;openViewer:(items:Item[],start:number)=>void;rename:(f:Item)=>void;removeFile:(f:Item)=>void};
export default function LessonDetail({active,activeFiles,activeUploads,zip,backToList,setForm,downloadClass,removeLesson,addFiles,cancel,retry,openViewer,rename,removeFile}:Props){
  const plan=usePlan(),colorOf=plan.color;
  const input=useRef<HTMLInputElement>(null),[drag,setDrag]=useState(false);
  return <>
    <button className="back" onClick={backToList}><ChevronLeft size={17}/>Volver a las clases</button>
    <div className="page-heading">
      <div><span className="eyebrow"><span className="subject-dot" style={{background:colorOf(active.subject)}}/>{plan.name(active.subject)} · {dateLabel(active.date)}</span><h1>{active.title}</h1><p>{active.topic||'Material de clase'}</p></div>
      <button className="primary" onClick={()=>input.current?.click()}><Plus size={18}/>Añadir archivos</button>
    </div>
    <div className="detail-tools">
      <button onClick={()=>setForm({edit:active})}><Pencil size={15}/>Editar clase / mover</button>
      <button disabled={!activeFiles.length||(zip?.lesson===active.id&&(zip.status==='preparing'||zip.status==='running'))} onClick={downloadClass}>{zip?.lesson===active.id&&(zip.status==='preparing'||zip.status==='running')?<Loader2 className="spin" size={15}/>:<Download size={15}/>}Descargar clase (.zip)</button>
      <button className="danger" onClick={removeLesson}><Trash2 size={15}/>Eliminar clase</button>
    </div>
    {active.notes&&<div className="notes"><h3>Mis anotaciones</h3><p>{active.notes}</p></div>}
    <input ref={input} type="file" multiple hidden onChange={e=>{if(e.target.files)addFiles(Array.from(e.target.files));e.target.value=''}}/>
    <div className={'dropzone '+(drag?'drag':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);addFiles(Array.from(e.dataTransfer.files))}}>
      <span className="dropzone-icon"><Upload size={21}/></span><b>Añade el material de esta clase</b>
      <span>Arrastra tus archivos aquí o <button onClick={()=>input.current?.click()}>selecciónalos</button></span>
      <small>Audio, fotos, PDF, documentos y ZIP · Hasta 2 GB por archivo · Puedes seguir navegando mientras se suben</small>
    </div>
    <h2 className="section-title">Archivos <span>{activeFiles.length}</span></h2>
    <div className="filelist">
      {activeUploads.map((u,i)=><UploadRow key={u.key} u={u} i={i} onCancel={()=>cancel(u.key)} onRetry={()=>retry(u.key)}/>)}
      {activeFiles.map((f,i)=>{const k=kindOf(f),open=()=>{if(viewableImage(f)){const imgs=activeFiles.filter(viewableImage);openViewer(imgs,imgs.indexOf(f))}else openViewer([f],0)};
        return <div className="filerow" key={f.id} style={{'--i':Math.min(i+activeUploads.length,12)} as React.CSSProperties}>
          <button className={'fileicon '+k} onClick={open} aria-label={'Abrir '+f.name}><Kind f={f}/></button>
          <button className="filename" onClick={open}><b>{f.name}</b><small>{bytes(f.size)} · {kindLabel[k]}</small></button>
          <div className="file-actions">
            <button className="iconbtn" title="Renombrar" aria-label={'Renombrar '+f.name} onClick={()=>rename(f)}><Pencil size={16}/></button>
            <a className="iconbtn" title="Descargar original" aria-label={'Descargar '+f.name} href={fileURL(f,true)}><Download size={17}/></a>
            <button className="iconbtn danger" title="Eliminar archivo" aria-label={'Eliminar '+f.name} onClick={()=>removeFile(f)}><Trash2 size={16}/></button>
          </div>
        </div>})}
      {!activeFiles.length&&!activeUploads.length&&<p className="filelist-empty">Todavía no hay archivos en esta clase.</p>}
    </div>
  </>;
}

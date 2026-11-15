// Ventana para crear o editar una clase (al crearla se pueden elegir ya sus archivos).
import {useState} from 'react';
import {AlertCircle,ArrowUpRight,Check,Loader2,Upload,X} from 'lucide-react';
import {Modal} from './modal';
import {usePlan} from './plan';
import {bytes,kindOf,plural,type Lesson} from './types';
import {Kind,today} from './lesson-bits';

export default function LessonForm({edit,defaultSubject,onClose,onSave}:{edit?:Lesson;defaultSubject:string;onClose:()=>void;onSave:(v:Omit<Lesson,'id'>,pending:File[],edit?:Lesson)=>Promise<void>}){
  const [pending,setPending]=useState<File[]>([]),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const subjects=usePlan().archiveSubjects;
  return <Modal label={edit?'Editar clase':'Nueva clase'} onClose={onClose}>{close=><>
    <div className="modal-head"><div><span className="eyebrow">TU ARCHIVO PERSONAL</span><h2>{edit?'Editar clase':'Una nueva clase'}</h2></div><button className="iconbtn" aria-label="Cerrar" onClick={close}><X size={20}/></button></div>
    <form onSubmit={async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;setSaving(true);setError('');
      try{await onSave({subject:v.subject,title:v.title.trim(),date:v.date,topic:v.topic||'',notes:v.notes||''},pending,edit);close()}catch(err){setError((err as Error).message);setSaving(false)}}}>
      <label>Asignatura<select name="subject" required defaultValue={edit?.subject||defaultSubject||subjects[0]?.id}>{subjects.map(s=><option value={s.id} key={s.id}>{s.name} ({s.short})</option>)}</select></label>
      {!subjects.length&&<p className="error" role="alert"><AlertCircle size={17}/>Primero añade alguna asignatura en Ajustes.</p>}
      <div className="form-grid"><label>Título<input name="title" required maxLength={200} autoFocus placeholder="Ej. Herencia y clases abstractas" defaultValue={edit?.title}/></label><label>Fecha<input name="date" type="date" required defaultValue={edit?.date||today()}/></label></div>
      <label>Tema <small>opcional</small><input name="topic" placeholder="Ej. Programación orientada a objetos" defaultValue={edit?.topic}/></label>
      <label>Anotaciones <small>opcional</small><textarea name="notes" rows={3} placeholder="Algo que quieras recordar de esta clase…" defaultValue={edit?.notes}/></label>
      {!edit&&<label className={'pick-files'+(pending.length?' has-files':'')}><span className="dropzone-icon">{pending.length?<Check size={20}/>:<Upload size={20}/>}</span><b>{pending.length?plural(pending.length,'archivo listo','archivos listos'):'Añadir audio, fotos o documentos'}</b><small>{pending.length?`${bytes(pending.reduce((a,f)=>a+f.size,0))} · Toca para añadir más`:'Puedes elegir fotos y luego el audio: se van sumando'}</small><input type="file" multiple onChange={e=>{
        // Cada selección se suma a las anteriores (sin repetir el mismo archivo).
        const picked=Array.from(e.target.files||[]);e.target.value='';
        setPending(prev=>[...prev,...picked.filter(f=>!prev.some(p=>p.name===f.name&&p.size===f.size&&p.lastModified===f.lastModified))]);
      }}/></label>}
      {!edit&&pending.length>0&&<ul className="pending-files">{pending.map((f,i)=><li key={f.name+f.size+f.lastModified}>
        <span className={'fileicon '+kindOf(f)}><Kind f={f} size={16}/></span><span><b>{f.name}</b><small>{bytes(f.size)}</small></span>
        <button type="button" className="iconbtn" aria-label={'Quitar '+f.name} onClick={()=>setPending(p=>p.filter((_,j)=>j!==i))}><X size={16}/></button></li>)}</ul>}
      {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
      <div className="form-footer"><button type="button" className="ghost" onClick={close}>Cancelar</button><button className="primary" disabled={saving} type="submit">{saving?<><Loader2 className="spin" size={16}/>Guardando…</>:<>{edit?'Guardar cambios':'Crear clase'}<ArrowUpRight size={17}/></>}</button></div>
    </form></>}</Modal>;
}

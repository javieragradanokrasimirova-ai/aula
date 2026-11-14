// Cola de subidas: varios archivos, de dos en dos, con progreso, cancelar y reintentar.
// Cómo se sube cada archivo (y cómo se reanuda) lo decide el adaptador: Drive o modo demo.
import {useCallback,useEffect,useRef,useState} from 'react';
import {guessType,type Item} from './types';
import {useStore} from './store';

const FILES_AT_ONCE=2;
export type UploadStatus='queued'|'uploading'|'finishing'|'done'|'error'|'cancelled';
export type Upload={key:string;file:File;lesson:string;lessonTitle:string;status:UploadStatus;loaded:number;rate:number;error?:string};
type Job=Upload&{ctrl?:AbortController;started:number;base:number;resume?:unknown};

export function useUploads(onSaved:(item:Item)=>void){
  const store=useStore();
  const jobs=useRef<Job[]>([]),[list,setList]=useState<Upload[]>([]),timer=useRef<ReturnType<typeof setTimeout>|null>(null),saved=useRef(onSaved);saved.current=onSaved;
  // Las barras se actualizan como mucho diez veces por segundo (también con la pestaña en segundo plano).
  const tick=useCallback(()=>{if(timer.current)return;timer.current=setTimeout(()=>{timer.current=null;setList(jobs.current.map(j=>({...j})))},100)},[]);
  const pump=useCallback(()=>{
    const active=jobs.current.filter(j=>j.status==='uploading'||j.status==='finishing').length;
    for(const job of jobs.current.filter(j=>j.status==='queued').slice(0,Math.max(0,FILES_AT_ONCE-active))){
      job.status='uploading';job.ctrl=new AbortController();job.started=performance.now();job.base=job.loaded;tick();
      const type=guessType(job.file.name,job.file.type);
      store.upload(job.file,job.lesson,type,{signal:job.ctrl.signal,
        // Lo ya subido se aprovecha al reintentar (si el adaptador sabe reanudar).
        resume:{get:()=>job.resume,set:v=>{job.resume=v}},
        onProgress:n=>{job.loaded=Math.min(n,job.file.size);if(job.loaded>=job.file.size)job.status='finishing';const s=(performance.now()-job.started)/1000;if(s>1)job.rate=(job.loaded-job.base)/s;tick()}})
        .then(item=>{job.status='done';job.loaded=job.file.size;job.resume=undefined;saved.current(item)})
        .catch(e=>{const cancelled=job.ctrl?.signal.aborted;job.status=cancelled?'cancelled':'error';job.error=cancelled?undefined:(e as Error).message||'No se ha podido subir.'})
        .finally(()=>{tick();pump()});
    }
    tick();
  },[tick,store]);
  const add=useCallback((files:File[],lesson:string,lessonTitle:string)=>{
    for(const file of files)jobs.current.push({key:crypto.randomUUID(),file,lesson,lessonTitle,status:'queued',loaded:0,rate:0,started:0,base:0});
    pump();
  },[pump]);
  const cancel=useCallback((key?:string,lesson?:string)=>{for(const j of jobs.current)if((key?j.key===key:lesson?j.lesson===lesson:true)&&(j.status==='queued'||j.status==='uploading')){if(j.status==='queued')j.status='cancelled';j.ctrl?.abort()}tick()},[tick]);
  const retry=useCallback((key:string)=>{const j=jobs.current.find(j=>j.key===key);if(!j)return;Object.assign(j,{status:'queued',rate:0,error:undefined});pump()},[pump]);
  const clear=useCallback(()=>{jobs.current=jobs.current.filter(j=>!['done','cancelled','error'].includes(j.status));tick()},[tick]);
  const busy=list.some(u=>u.status==='queued'||u.status==='uploading'||u.status==='finishing');
  useEffect(()=>{if(!busy)return;const fn=(e:BeforeUnloadEvent)=>{e.preventDefault()};addEventListener('beforeunload',fn);return()=>removeEventListener('beforeunload',fn)},[busy]);
  // Mientras sube, la pantalla no se apaga sola (el móvil pausaría la subida).
  useEffect(()=>{
    if(!busy||!('wakeLock' in navigator))return;
    let lock:WakeLockSentinel|null=null,alive=true;
    const get=()=>{if(document.visibilityState==='visible')navigator.wakeLock.request('screen').then(l=>{if(alive)lock=l;else l.release()}).catch(()=>{})};
    get();document.addEventListener('visibilitychange',get);
    return()=>{alive=false;document.removeEventListener('visibilitychange',get);lock?.release().catch(()=>{})};
  },[busy]);
  return {uploads:list,busy,add,cancel,retry,clear};
}

// El «documento» de Aula: todo lo tuyo (ajustes, clases, archivos y eventos) en un solo JSON,
// aula.json. Aquí están las operaciones que antes hacía el servidor de Sites, ahora como
// funciones puras: reciben el documento y devuelven uno nuevo (o lanzan un error para ti).
import {EMPTY_SETTINGS,makePlan,parseSettings,validate,type Settings} from './settings';
import {parseICS,type CalEvent,type Kind} from './ics';
import type {Item,Lesson} from './types';

// moodle.url: el enlace de «Exportar calendario» de Moodle, si lo conectaste para que se actualice solo.
export type AulaDoc={format:'aula';version:1;settings:Settings;lessons:Lesson[];files:Item[];events:CalEvent[];moodle:{importedAt:string|null;url:string|null}};
export class UserError extends Error{}

const uuid=()=>crypto.randomUUID();
const str=(v:unknown,max:number)=>typeof v==='string'?v.slice(0,max):'';
const KINDS:Kind[]=['task','exam','event','holiday'];

export const emptyDoc=(settings:Settings=EMPTY_SETTINGS):AulaDoc=>({format:'aula',version:1,settings,lessons:[],files:[],events:[],moodle:{importedAt:null,url:null}});

// Lee un aula.json tolerando huecos o datos raros (mejor perder una línea que toda la web).
export function normalizeDoc(raw:any):AulaDoc{
  if(!raw||typeof raw!=='object')return emptyDoc();
  const lessons:Lesson[]=(Array.isArray(raw.lessons)?raw.lessons:[]).filter((l:any)=>l&&typeof l.id==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(l.date))
    .map((l:any)=>({id:l.id,subject:str(l.subject,20),title:str(l.title,200)||'Sin título',date:l.date,topic:str(l.topic,200),notes:str(l.notes,20000)}));
  const ids=new Set(lessons.map(l=>l.id));
  const files:Item[]=(Array.isArray(raw.files)?raw.files:[]).filter((f:any)=>f&&typeof f.id==='string'&&ids.has(f.lesson))
    .map((f:any)=>({id:f.id,lesson:f.lesson,name:str(f.name,255)||'archivo',type:str(f.type,120)||'application/octet-stream',size:Number(f.size)||0}));
  const events:CalEvent[]=(Array.isArray(raw.events)?raw.events:[]).filter((e:any)=>e&&typeof e.id==='string'&&typeof e.start==='string'&&KINDS.includes(e.kind))
    .map((e:any)=>({id:e.id,uid:typeof e.uid==='string'?e.uid:null,title:str(e.title,300)||'Sin título',description:str(e.description,8000),start:e.start,end:typeof e.end==='string'?e.end:null,
      allDay:e.allDay?1:0,kind:e.kind,subject:str(e.subject,20),priority:[0,1,2].includes(e.priority)?e.priority:1,done:e.done?1:0}));
  const settings=raw.settings?parseSettings(JSON.stringify(raw.settings),EMPTY_SETTINGS):EMPTY_SETTINGS;
  let url:string|null=null;try{url=raw.moodle?.url?moodleURL(raw.moodle.url):null}catch{}
  return {format:'aula',version:1,settings,lessons,files,events,moodle:{importedAt:typeof raw.moodle?.importedAt==='string'?raw.moodle.importedAt:null,url}};
}
// Comprueba que es el enlace de exportar el calendario de Moodle (y lo devuelve limpio).
export function moodleURL(v:unknown):string{
  let u:URL;try{u=new URL(String(v??'').trim())}catch{throw new UserError('Pega el enlace completo (empieza por https://).')}
  if(u.protocol!=='https:'||!/\/calendar\/export_execute\.php$/.test(u.pathname))throw new UserError('Ese no parece el enlace del calendario. En Moodle, tras «Obtener URL del calendario», copia el enlace que acaba en export_execute.php?…');
  if(!u.searchParams.get('authtoken'))throw new UserError('Al enlace le falta una parte (authtoken). Cópialo entero desde Moodle.');
  return u.toString();
}
export function setMoodleURL(doc:AulaDoc,url:string|null):AulaDoc{return {...doc,moodle:{...doc.moodle,url:url===null?null:moodleURL(url)}}}

// ---------- Clases y archivos ----------
export function saveLesson(doc:AulaDoc,b:any):{doc:AulaDoc;id:string}{
  const title=str(b.title,200).trim(),subject=str(b.subject,20),date=String(b.date??'');
  if(!title||!subject||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new UserError('Revisa el título, la asignatura y la fecha.');
  if(b.id&&!doc.lessons.some(l=>l.id===b.id))throw new UserError('Clase no encontrada.');
  const id=b.id||uuid(),l:Lesson={id,subject,title,date,topic:str(b.topic,200),notes:str(b.notes,20000)};
  const lessons=b.id?doc.lessons.map(x=>x.id===id?l:x):[l,...doc.lessons];
  return {doc:{...doc,lessons},id};
}
export function deleteLesson(doc:AulaDoc,id:string):{doc:AulaDoc;removed:Item[]}{
  if(!doc.lessons.some(l=>l.id===id))throw new UserError('Clase no encontrada.');
  return {doc:{...doc,lessons:doc.lessons.filter(l=>l.id!==id),files:doc.files.filter(f=>f.lesson!==id)},removed:doc.files.filter(f=>f.lesson===id)};
}
export function addFile(doc:AulaDoc,item:Item):AulaDoc{
  if(!doc.lessons.some(l=>l.id===item.lesson))throw new UserError('La clase se ha eliminado.');
  return {...doc,files:[...doc.files.filter(f=>f.id!==item.id),item]};
}
export function deleteFile(doc:AulaDoc,id:string):{doc:AulaDoc;item:Item}{
  const item=doc.files.find(f=>f.id===id);if(!item)throw new UserError('Archivo no encontrado.');
  return {doc:{...doc,files:doc.files.filter(f=>f.id!==id)},item};
}
export function renameFile(doc:AulaDoc,id:string,name:string):AulaDoc{
  name=name.trim().slice(0,255);if(!name)throw new UserError('Introduce un nombre.');
  if(!doc.files.some(f=>f.id===id))throw new UserError('Archivo no encontrado.');
  return {...doc,files:doc.files.map(f=>f.id===id?{...f,name}:f)};
}

// ---------- Calendario ----------
// Importar el .ics de Moodle. Lo tuyo (importancia, hecha) se conserva. Lo que Moodle ya no trae
// y aún no ha pasado se ha anulado: se quita (por eso conviene exportar «Todos los eventos»).
export function importICS(doc:AulaDoc,text:string,now=new Date()):{doc:AulaDoc;count:number}{
  if(!text.includes('BEGIN:VCALENDAR')||text.length>4e6)throw new UserError('Ese archivo no es un calendario .ics válido.');
  const items=parseICS(text,makePlan(doc.settings).subjectOf),byUid=new Map(doc.events.filter(e=>e.uid).map(e=>[e.uid!,e]));
  const seen=new Set(items.map(e=>e.uid)),nowISO=now.toISOString();
  const past=(e:CalEvent)=>/^\d{4}-\d{2}-\d{2}$/.test(e.start)?e.start<nowISO.slice(0,10):e.start<=nowISO;
  const kept=doc.events.filter(e=>!e.uid||seen.has(e.uid)||past(e));
  const fresh=new Map(kept.map(e=>[e.id,e]));
  for(const p of items){const old=byUid.get(p.uid);
    const e:CalEvent={id:old?.id??uuid(),uid:p.uid,title:p.title,description:p.description,start:p.start,end:p.end,allDay:p.allDay,kind:p.kind,subject:p.subject,priority:old?.priority??(p.kind==='exam'?2:1),done:old?.done??0};
    fresh.set(e.id,e)}
  const events=[...fresh.values()].sort((a,b)=>a.start.localeCompare(b.start));
  return {doc:{...doc,events,moodle:{...doc.moodle,importedAt:nowISO}},count:items.length};
}
export function saveEvent(doc:AulaDoc,b:any):AulaDoc{
  const title=str(b.title,300).trim(),start=String(b.start??''),allDay=b.allDay?1:0;
  if(!title)throw new UserError('Escribe un título.');
  if(!(allDay?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/).test(start))throw new UserError('Revisa la fecha.');
  if(!['task','exam','event'].includes(b.kind))throw new UserError('Tipo no válido.');
  const base={title,description:str(b.description,8000),start,allDay,kind:b.kind as Kind,subject:str(b.subject,20),priority:[0,1,2].includes(b.priority)?b.priority:1};
  if(b.id){const own=doc.events.find(e=>e.id===b.id&&!e.uid);if(!own)throw new UserError('Evento no encontrado.');
    return {...doc,events:doc.events.map(e=>e.id===b.id?{...e,...base}:e)}}
  return {...doc,events:[...doc.events,{id:uuid(),uid:null,end:null,done:0,...base}].sort((a,c)=>a.start.localeCompare(c.start))};
}
export function markEvent(doc:AulaDoc,b:any):AulaDoc{
  const patch:Partial<CalEvent>={};
  if([0,1,2].includes(b.priority))patch.priority=b.priority;
  if(typeof b.done==='boolean')patch.done=b.done?1:0;
  if(!Object.keys(patch).length)throw new UserError('Nada que cambiar.');
  return {...doc,events:doc.events.map(e=>e.id===b.id?{...e,...patch}:e)};
}
export function deleteEvent(doc:AulaDoc,id:string):AulaDoc{
  if(!doc.events.some(e=>e.id===id&&!e.uid))throw new UserError('Solo puedes borrar los eventos que has añadido tú.');
  return {...doc,events:doc.events.filter(e=>e.id!==id)};
}

// ---------- Ajustes ----------
export function saveSettings(doc:AulaDoc,raw:any):{doc:AulaDoc;remapped:number}{
  const r=validate(raw);if('error' in r)throw new UserError(r.error);
  const s=r.settings,count=new Map<string,number>();for(const l of doc.lessons)count.set(l.subject,(count.get(l.subject)??0)+1);
  for(const [subject,n] of count){const sub=s.subjects.find(t=>t.id===subject);
    if(!sub)throw new UserError(`Hay ${n} ${n===1?'clase guardada':'clases guardadas'} de una asignatura que has quitado. Muévelas a otra antes de quitarla.`);
    if(!sub.archive)throw new UserError(`${sub.short} tiene ${n} ${n===1?'clase guardada':'clases guardadas'}: tiene que seguir en «Mis asignaturas».`)}
  // Tareas de Moodle sin asignatura cuya categoría ahora tiene dueña: se recolocan.
  const plan=makePlan(s),ids=new Set(s.subjects.map(x=>x.id)),moved=new Set<string>();
  const events=doc.events.map(e=>{if(!e.uid||!e.subject||ids.has(e.subject))return e;const to=plan.subjectOf(e.subject.toLowerCase());if(!ids.has(to))return e;moved.add(e.subject);return {...e,subject:to}});
  return {doc:{...doc,settings:s,events},remapped:moved.size};
}
export function moveLessons(doc:AulaDoc,from:string,to:string):{doc:AulaDoc;moved:number}{
  if(from===to||!doc.settings.subjects.some(x=>x.id===to&&x.archive))throw new UserError('Elige otra asignatura de «Mis asignaturas».');
  let moved=0;const lessons=doc.lessons.map(l=>{if(l.subject!==from)return l;moved++;return {...l,subject:to}});
  return {doc:{...doc,lessons},moved};
}

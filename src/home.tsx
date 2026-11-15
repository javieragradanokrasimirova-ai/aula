// Portada: horario, próxima entrega, resumen, tus asignaturas y la lista de clases con buscador y filtros.
import {ArrowUpRight,BookOpen,CalendarDays,ChevronDown,Download,FileAudio,FileText,Folder,FolderOpen,HardDrive,Image as ImageIcon,Loader2,Lock,Plus,Search,Settings2,X} from 'lucide-react';
import {memo,useCallback,useRef} from 'react';
import {usePlan} from './plan';
import Schedule from './schedule';
import {due,type CalEvent} from './ics';
import {bytes,kindOf,plural,type Item,type Lesson} from './types';
import {dateLabel} from './lesson-bits';
import type {Subject} from './settings';
import type {Upload as UploadJob} from './uploads';

type Setter<T>=React.Dispatch<React.SetStateAction<T>>;
type Props={lessons:Lesson[];files:Item[];total:number;subjects:Subject[];listed:Lesson[];byLesson:Map<string,Item[]>;uploads:UploadJob[];loading:boolean;nextTodo?:CalEvent;pendingTodos:number;
  filter:string;setFilter:Setter<string>;search:string;setSearch:Setter<string>;sort:string;setSort:Setter<string>;type:string;setType:Setter<string>;
  setForm:(f:{edit?:Lesson})=>void;openCalendar:()=>void;openSettings:()=>void;openLesson:(id:string)=>void;exportAll:()=>void};
export default function Home({lessons,files,total,subjects,listed,byLesson,uploads,loading,nextTodo,pendingTodos,filter,setFilter,search,setSearch,sort,setSort,type,setType,setForm,openCalendar,openSettings,openLesson,exportAll}:Props){
  const plan=usePlan(),colorOf=plan.color;
  // Siempre la misma función para abrir una clase: así las filas memorizadas no se repintan por ella.
  const open=useRef(openLesson);open.current=openLesson;
  const onOpen=useCallback((id:string)=>open.current(id),[]);
  return <>
    <div className="page-heading">
      <div><div className="eyebrow">TU CURSO, EN UN SOLO LUGAR</div><h1>{filter?plan.name(filter):'Todo lo que aprendes, aquí.'}</h1><p>Guarda tus clases. Encuentra lo que necesitas. A tu ritmo.</p></div>
      <button className="primary" onClick={()=>setForm({})}><Plus size={18}/>Nueva clase</button>
    </div>
    <Schedule onPick={id=>setFilter(f=>f===id?'':id)} onSetup={openSettings}/>
    {nextTodo&&(()=>{const d=due(nextTodo);return <button className="next-due" onClick={openCalendar}>
      <span className="next-due-icon"><CalendarDays size={19}/></span>
      <span className="next-due-text"><small>Próxima entrega{pendingTodos>1?` · ${pendingTodos} pendientes`:''}</small><b>{nextTodo.title}</b></span>
      <span className={'due '+d.level}>{d.text}</span><ArrowUpRight className="next-due-arrow" size={16}/></button>})()}
    <section className="overview">
      <div><span className="overview-icon"><FolderOpen size={21}/></span><div><b>{lessons.length}</b><span>{lessons.length===1?'Clase guardada':'Clases guardadas'}</span></div></div>
      <div><span className="overview-icon lavender"><FileText size={21}/></span><div><b>{files.length}</b><span>{files.length===1?'Archivo en tu espacio':'Archivos en tu espacio'}</span></div></div>
      <div><span className="overview-icon peach"><HardDrive size={21}/></span><div><b>{bytes(total)}</b><span>Material almacenado</span></div></div>
    </section>
    <div className="section-heading"><h2>Tus asignaturas <span>{subjects.length}</span></h2>{filter&&<button onClick={()=>{setFilter('');setSearch('')}}>Ver todas <ArrowUpRight size={15}/></button>}</div>
    {subjects.length?<section className="subjects">{subjects.map(({id,short,name,color},i)=>{const n=lessons.filter(l=>l.subject===id).length;
      return <button className={'subject-card '+(filter===id?'selected':'')} key={id} style={{'--i':i,'--tint':color} as React.CSSProperties} onClick={()=>setFilter(filter===id?'':id)} aria-pressed={filter===id}>
        <span className="subject-icon"><Folder size={21}/></span><ArrowUpRight className="card-arrow" size={16}/><h3>{name}</h3><div>{short}<span>·</span>{plural(n,'clase','clases')}</div></button>})}</section>
    :<button className="feed-bar connect subjects-empty" onClick={openSettings}><span className="feed-icon"><Settings2 size={16}/></span><div><b>Añade tus asignaturas</b><small>En Ajustes eliges sus nombres, colores y tu horario.</small></div><ArrowUpRight size={17}/></button>}
    <div className="section-heading recent"><h2>{filter?'Clases de '+plan.short(filter):'Todas las clases'} <span>{listed.length}</span></h2>
      <label className="sort"><select aria-label="Orden de las clases" value={sort} onChange={e=>setSort(e.target.value)}><option value="new">Más recientes primero</option><option value="old">Más antiguas primero</option></select><ChevronDown size={14}/></label></div>
    <div className="filters">
      <label className="search"><Search size={18}/><input placeholder="Buscar por tema, fecha o archivo…" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Escape'&&setSearch('')}/>{search&&<button aria-label="Limpiar búsqueda" onClick={()=>setSearch('')}><X size={15}/></button>}</label>
      <div className="pills" role="group" aria-label="Tipo de archivo">{[['all','Todo'],['audio','Audios'],['image','Fotos'],['doc','Documentos']].map(([id,label])=><button key={id} className={type===id?'active':''} aria-pressed={type===id} onClick={()=>setType(id)}>{label}</button>)}</div>
    </div>
    {loading?<div className="lessons">{[0,1,2].map(i=><div className="lesson skeleton" key={i}><span/><div><i/><i/><i/></div></div>)}</div>
    :listed.length?<div className="lessons">{listed.map((l,i)=><LessonRow key={l.id} l={l} i={i} fs={byLesson.get(l.id)??NONE} color={colorOf(l.subject)} short={plan.short(l.subject)} onOpen={onOpen}
      up={uploads.some(u=>u.lesson===l.id&&(u.status==='uploading'||u.status==='queued'||u.status==='finishing'))}/>)}</div>
    :<div className="empty"><span className="empty-icon"><FolderOpen size={28}/></span><h3>{search||type!=='all'?'No hay clases que coincidan':'Tu próxima clase empieza aquí'}</h3><p>{search||type!=='all'?'Prueba con otra búsqueda o cambia los filtros.':'Crea una clase y reúne su audio, fotos y documentos.'}</p>
      {search||type!=='all'?<button className="ghost" onClick={()=>{setSearch('');setType('all')}}>Quitar filtros</button>:<button className="primary" onClick={()=>setForm({})}><Plus size={17}/>Crear mi primera clase</button>}<small>Disponible desde tu móvil y tu ordenador</small></div>}
    {lessons.length>0&&<div className="export-all"><div><b>Copia de todo tu archivo</b><small>Un ZIP con todas tus clases, sus originales y tus ajustes. Se puede volver a importar en Aula.</small></div><button onClick={exportAll}><Download size={15}/>Exportar todo · {bytes(total)}</button></div>}
    <footer><BookOpen size={15}/> Menos buscar archivos. Más tiempo para aprender.<span><Lock size={12}/>Solo tú puedes ver tu material</span></footer>
  </>;
}

// Una clase de la lista. Va aparte y memorizada: mientras subes algo, la web se refresca diez veces por
// segundo y así solo se repinta la fila que cambia, no las cientos de la lista.
const NONE:Item[]=[];
const LessonRow=memo(function LessonRow({l,i,fs,up,color,short,onOpen}:{l:Lesson;i:number;fs:Item[];up:boolean;color?:string;short:string;onOpen:(id:string)=>void}){
  const count=(k:string)=>fs.filter(f=>kindOf(f)===k).length,a=count('audio'),p=count('image'),d=count('doc');
  return <button className="lesson" style={{'--i':Math.min(i,10)} as React.CSSProperties} onClick={()=>onOpen(l.id)}>
    <span className="lesson-folder" style={{background:color}}><Folder size={22}/></span>
    <div className="lesson-body"><span className="lesson-meta">{short}<i>·</i>{dateLabel(l.date)}</span><h3>{l.title}</h3>
      <small>{l.topic&&<span className="lesson-topic">{l.topic}</span>}{a>0&&<span><FileAudio size={13}/>{a}</span>}{p>0&&<span><ImageIcon size={13}/>{p}</span>}{d>0&&<span><FileText size={13}/>{d}</span>}{fs.length?<span>{bytes(fs.reduce((s,f)=>s+f.size,0))}</span>:<span>Sin archivos</span>}{up&&<span className="lesson-uploading"><Loader2 className="spin" size={12}/>Subiendo</span>}</small></div>
    <ArrowUpRight className="lesson-arrow" size={19}/></button>;
});

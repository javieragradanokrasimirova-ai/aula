import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {BookOpen,LayoutGrid,Folder,Plus,Search,ArrowUpRight,Upload,FileAudio,FileText,Image as ImageIcon,Download,X,ChevronLeft,ChevronDown,Lock,HardDrive,Trash2,Pencil,Loader2,Check,FolderOpen,RotateCw,AlertCircle,FileArchive,CalendarDays,Settings2,LogOut,FolderInput} from 'lucide-react';
import {useStore} from './store';
import ImportView from './import-view';
import {entryBlob,type ImportPlan} from './import';
import {saveLesson as newLesson} from './doc';
import {bytes,fileURL,kindOf,plural,viewableImage,type Item,type Lesson} from './types';
import {DEFAULT_SETTINGS,makePlan,type Settings} from './settings';
import {PlanContext,usePlan} from './plan';
import SettingsView from './settings-view';
import {useUploads,type Upload as UploadJob} from './uploads';
import Viewer from './viewer';
import Schedule from './schedule';
import CalendarView,{useCalendar,isTodo,due} from './calendar';
import {AssistantBar,AssistantFab,AssistantPanel,useAssistant} from './assistant-panel';
import type {Mood} from './dino';
import type {ZipProgress} from './zip';

type Ask={title:string;text?:string;confirm:string;danger?:boolean;input?:string;run:(value:string)=>Promise<void>|void};
type Zip={lesson:string;title:string;loaded:number;total:number;mode?:ZipProgress['mode'];status:'preparing'|'running'|'done'|'error';error?:string};

const today=()=>new Date().toLocaleDateString('en-CA');
const dateLabel=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});


function Kind({f,size=20}:{f:{type:string;name:string};size?:number}){const k=kindOf(f);return k==='audio'?<FileAudio size={size}/>:k==='image'?<ImageIcon size={size}/>:<FileText size={size}/>}
const kindLabel={audio:'Audio',image:'Imagen',doc:'Documento'};

export default function Archive({initial,settings:initialSettings,onSignOut,startImport}:{initial?:{lessons:Lesson[];files:Item[]};settings?:Settings;onSignOut:()=>void;startImport?:boolean}){
  const store=useStore(),api=(b:object)=>store.archive(b);
  // Con Drive, lo borrado va a la papelera de Drive; en el modo demo se borra del todo.
  const trashNote=(many:boolean)=>store.adapter.kind==='drive'?`${many?'Los archivos van':'El archivo va'} a la papelera de tu Google Drive: puedes recuperarlos allí durante 30 días.`:'En el modo demo no se puede deshacer.';
  const [importing,setImporting]=useState(!!startImport),onImport=()=>setImporting(true);
  // Tus ajustes (asignaturas, horario…) y lo que se calcula con ellos, para toda la web.
  const [settings,setSettings]=useState<Settings>(initialSettings??DEFAULT_SETTINGS);
  const plan=useMemo(()=>makePlan(settings),[settings]),subjects=plan.archiveSubjects,colorOf=plan.color;
  const [lessons,setLessons]=useState<Lesson[]>(initial?.lessons??[]),[files,setFiles]=useState<Item[]>(initial?.files??[]),[loading,setLoading]=useState(!initial);
  const [error,setError]=useState(''),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[sort,setSort]=useState('new'),[type,setType]=useState('all');
  const [selected,setSelected]=useState<string|null>(null),[dir,setDir]=useState(0),[form,setForm]=useState<{edit?:Lesson}|null>(null),[ask,setAsk]=useState<Ask|null>(null);
  const [viewer,setViewer]=useState<{items:Item[];start:number}|null>(null),[notice,setNotice]=useState<{text:string;id:number}|null>(null),[zip,setZip]=useState<Zip|null>(null),[drag,setDrag]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const {uploads,busy,add,cancel,retry,clear}=useUploads(useCallback((item:Item)=>setFiles(fs=>[...fs,item]),[]));
  const toast=(text:string)=>setNotice({text,id:Date.now()});
  // Calendario: sección propia (#calendario) con los datos cargados desde el principio para la portada.
  const cal=useCalendar(),[section,setSection]=useState<'archive'|'calendar'|'settings'>('archive');
  // La mascota se alegra cuando termina una subida.
  const [dinoMood,setDinoMood]=useState<Mood>('idle'),doneCount=uploads.filter(u=>u.status==='done').length,lastDone=useRef(0);
  useEffect(()=>{if(doneCount>lastDone.current){setDinoMood('happy');const t=setTimeout(()=>setDinoMood('idle'),2500);lastDone.current=doneCount;return()=>clearTimeout(t)}lastDone.current=doneCount},[doneCount]);

  async function refresh(){try{const d=await store.load();setLessons(d.lessons);setFiles(d.files);setSettings(d.settings);setError('')}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
  useEffect(()=>{if(!initial)refresh()},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(null),3800);return()=>clearTimeout(t)},[notice]);

  // Cada clase abierta es una entrada del historial: el botón «atrás» del móvil vuelve a la lista.
  useEffect(()=>{
    const sync=()=>{const s=history.state as {lesson?:string;viewer?:boolean;calendar?:boolean;settings?:boolean}|null;setDir(-1);setSelected(s?.lesson??null);setSection(s?.calendar?'calendar':s?.settings?'settings':'archive');if(!s?.viewer)setViewer(null)};
    addEventListener('popstate',sync);
    const id=decodeURIComponent(location.hash.slice(1));
    if(id==='calendario'){history.replaceState(null,'',location.pathname);history.pushState({calendar:true},'','#calendario');setSection('calendar')}
    else if(id==='ajustes'){history.replaceState(null,'',location.pathname);history.pushState({settings:true},'','#ajustes');setSection('settings')}
    else if(id&&lessons.some(l=>l.id===id)){history.replaceState(null,'',location.pathname);history.pushState({lesson:id},'','#'+id);setSelected(id)}
    return()=>removeEventListener('popstate',sync);
  },[]);
  const openLesson=(id:string)=>{history.pushState({lesson:id},'','#'+id);setDir(1);setSelected(id);setSection('archive');scrollTo({top:0})};
  const openCalendar=()=>{if(section==='calendar'&&!selected)return;history.pushState({calendar:true},'','#calendario');setDir(1);setSelected(null);setSection('calendar');scrollTo({top:0})};
  const openSettings=()=>{if(section==='settings'&&!selected)return;history.pushState({settings:true},'','#ajustes');setDir(1);setSelected(null);setSection('settings');scrollTo({top:0})};
  const leaveCalendar=()=>{setDir(-1);if(history.state?.calendar||history.state?.settings)history.back();else setSection('archive')};
  const backToList=()=>{setDir(-1);if(history.state?.lesson)history.back();else setSelected(null)};
  const openViewer=(items:Item[],start:number)=>{history.pushState({lesson:selected,viewer:true},'');setViewer({items,start})};
  const closeViewer=()=>{if(history.state?.viewer)history.back();else setViewer(null)};
  // Ir a la lista de clases desde cualquier sitio. No se usa «atrás»: si antes estuviste en otra sección,
  // el historial te devolvería allí (p. ej. de Ajustes al Calendario).
  const goHome=()=>{history.pushState(null,'',location.pathname+location.search);setDir(-1);setSelected(null);setSection('archive');scrollTo({top:0})};
  const chooseSubject=(id:string)=>{setFilter(id);if(selected||section!=='archive')goHome()};

  const active=lessons.find(l=>l.id===selected);
  const byLesson=useMemo(()=>{const m=new Map<string,Item[]>();for(const f of files){const a=m.get(f.lesson);if(a)a.push(f);else m.set(f.lesson,[f])}return m},[files]);
  const total=useMemo(()=>files.reduce((a,f)=>a+f.size,0),[files]);
  const listed=useMemo(()=>{const fold=(t:string)=>t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''),q=fold(search.trim());return lessons.filter(l=>{const fs=byLesson.get(l.id)??[];
    return (!filter||l.subject===filter)&&(!q||fold([l.title,l.topic,l.notes,l.date,dateLabel(l.date),l.subject,plan.short(l.subject),plan.name(l.subject),...fs.map(f=>f.name)].join(' ')).includes(q))&&(type==='all'||fs.some(f=>kindOf(f)===type))})
    .sort((a,b)=>sort==='old'?a.date.localeCompare(b.date):b.date.localeCompare(a.date))},[lessons,byLesson,filter,search,type,sort,plan]);
  const activeFiles=active?byLesson.get(active.id)??[]:[];
  const activeUploads=active?uploads.filter(u=>u.lesson===active.id&&u.status!=='done'&&u.status!=='cancelled'):[];

  // Importar una copia: ajustes (si se quiere) y clases de golpe; los archivos, a la cola de subidas.
  // Si la copia ya se importó (entera o a medias), no se duplica nada: las clases que ya están se
  // reconocen por asignatura, título y fecha, y de sus archivos solo se suben los que falten.
  async function runImport(plan:ImportPlan,zip:File,withSettings:boolean){
    const key=(l:{subject:string;title:string;date:string})=>`${l.subject}|${l.title}|${l.date}`;
    const targets:{id:string;l:ImportPlan['lessons'][number]}[]=[];let created=0;
    await store.replace(d=>{let doc=withSettings&&plan.settings?{...d,settings:plan.settings}:d;targets.length=0;created=0;
      const have=new Map(doc.lessons.map(l=>[key(l),l.id]));
      for(const l of plan.lessons){let id=have.get(key(l));
        if(!id){const r=newLesson(doc,{subject:l.subject,title:l.title,date:l.date,topic:l.topic,notes:l.notes});doc=r.doc;id=r.id;have.set(key(l),id);created++}
        targets.push({id,l})}
      return doc});
    setLessons(store.doc.lessons);setFiles(store.doc.files);setSettings(store.doc.settings);
    const stored=new Set(store.doc.files.map(f=>`${f.lesson}|${f.name}|${f.size}`));
    const queued=new Set(uploads.filter(u=>u.status==='queued'||u.status==='uploading'||u.status==='finishing').map(u=>`${u.lesson}|${u.file.name}|${u.file.size}`));
    let missing=0;
    for(const {id,l} of targets){
      const todo=l.files.filter(f=>!stored.has(`${id}|${f.name}|${f.size}`)&&!queued.has(`${id}|${f.name}|${f.size}`));
      const fs=await Promise.all(todo.map(async f=>new File([await entryBlob(zip,plan.entries.get(f.path)!,f.type)],f.name,{type:f.type})));
      if(fs.length){add(fs,id,l.title);missing+=fs.length}
    }
    toast(!created&&!missing?'Ya estaba todo importado.':[created?plural(created,'clase nueva','clases nuevas'):'',missing?`subiendo ${plural(missing,'archivo','archivos')}`:''].filter(Boolean).join(' · ')+'.');
  }
  async function saveLesson(v:Omit<Lesson,'id'>,pending:File[],edit?:Lesson){
    const {id}=await api({action:'save',...v,id:edit?.id});const l={...v,id};
    setLessons(ls=>edit?ls.map(x=>x.id===id?l:x):[l,...ls]);
    if(!edit){openLesson(id);if(pending.length)add(pending,id,l.title)}
    toast(edit?'Cambios guardados.':'Clase creada.');
  }
  function addFiles(list:File[]){if(active&&list.length)add(list,active.id,active.title)}
  function removeLesson(){if(!active)return;const id=active.id,n=activeFiles.length;
    setAsk({title:'¿Eliminar esta clase?',text:`Se borrarán «${active.title}» y ${plural(n,'archivo','archivos')}. ${trashNote(n!==1)}`,confirm:'Eliminar clase',danger:true,run:async()=>{
      cancel(undefined,id);await api({action:'deleteLesson',id});setLessons(ls=>ls.filter(l=>l.id!==id));setFiles(fs=>fs.filter(f=>f.lesson!==id));backToList();toast('Clase eliminada.')}})}
  function removeFile(f:Item){setAsk({title:'¿Eliminar este archivo?',text:`Se borrará «${f.name}». ${trashNote(false)}`,confirm:'Eliminar',danger:true,run:async()=>{await api({action:'deleteFile',id:f.id});setFiles(fs=>fs.filter(x=>x.id!==f.id));toast('Archivo eliminado.')}})}
  function rename(f:Item){setAsk({title:'Renombrar archivo',confirm:'Guardar nombre',input:f.name,run:async name=>{name=name.trim();if(!name||name===f.name)return;await api({action:'renameFile',id:f.id,name});setFiles(fs=>fs.map(x=>x.id===f.id?{...x,name}:x))}})}
  async function downloadClass(){
    if(!active||(zip&&zip.status!=='done'&&zip.status!=='error'))return;
    const l=active,fs=activeFiles,size=fs.reduce((a,f)=>a+f.size,0);
    setZip({lesson:l.id,title:l.title,loaded:0,total:size,status:'preparing'});
    let timer:ReturnType<typeof setTimeout>|undefined,last:ZipProgress|null=null;
    try{
      const {downloadZip}=await import('./zip');
      await downloadZip(fs,l.title,l.notes,p=>{last=p;if(!timer)timer=setTimeout(()=>{timer=undefined;const q=last!;setZip(z=>z&&{...z,loaded:q.loaded,total:q.total,mode:q.mode,status:'running'})},120)});
      clearTimeout(timer);setZip(z=>z&&{...z,loaded:z.total,status:'done'});celebrate();setTimeout(()=>setZip(z=>z?.status==='done'?null:z),4500);
    }catch(e){clearTimeout(timer);setZip(z=>z&&{...z,status:'error',error:(e as Error).message})}
  }

  // ZIP de varias clases: «Exportar todo» o lo que ha encontrado el asistente.
  async function zipMany(title:string,size:number,run:(mod:typeof import('./zip'),onProgress:(p:ZipProgress)=>void)=>Promise<void>){
    if(zip&&(zip.status==='preparing'||zip.status==='running'))return;
    setZip({lesson:'*',title,loaded:0,total:size,status:'preparing'});
    let timer:ReturnType<typeof setTimeout>|undefined,last:ZipProgress|null=null;
    try{const mod=await import('./zip');
      await run(mod,p=>{last=p;if(!timer)timer=setTimeout(()=>{timer=undefined;const q=last!;setZip(z=>z&&{...z,loaded:q.loaded,total:q.total,mode:q.mode,status:'running'})},120)});
      clearTimeout(timer);setZip(z=>z&&{...z,loaded:z.total,status:'done'});celebrate();
    }catch(e){clearTimeout(timer);setZip(z=>z&&{...z,status:'error',error:(e as Error).message})}
  }
  const exportAll=()=>zipMany('Aula completa',total,(m,p)=>m.downloadEverything(lessons,files,settings,p));
  const downloadFound=(ls:Lesson[],fs:Item[],label:string,size:number)=>zipMany(label,size,(m,p)=>m.downloadSelection(ls,fs,label,settings,p));

  // Ánimo del dinosaurio según lo que pasa: celebra, se concentra mientras subes, se preocupa si
  // entregas algo hoy y se duerme de madrugada. La hora se lee en el navegador (no en el servidor).
  const [hour,setHour]=useState(-1);
  useEffect(()=>{const t=()=>setHour(new Date().getHours());t();const i=setInterval(t,5*60000);return()=>clearInterval(i)},[]);
  const celebrate=()=>{setDinoMood('celebrate');setTimeout(()=>setDinoMood(m=>m==='celebrate'?'idle':m),2800)};
  const dueToday=hour>=0&&cal.events.some(e=>isTodo(e)&&!e.done&&due(e).text.startsWith('Hoy'));
  const ambient:Mood=dinoMood!=='idle'?dinoMood:busy?'think':dueToday?'worried':hour>=0&&hour<7?'sleep':'idle';
  const assistant=useAssistant({lessons,files,events:cal.events,plan,mood:ambient,onOpen:id=>{if(id!==selected)openLesson(id)},onDownload:downloadFound,onOpenCalendar:openCalendar,
    onAddEvent:async p=>{await cal.run({action:'save',title:p.title,description:'',start:p.start,allDay:p.allDay,kind:p.kind,subject:p.subject,priority:p.kind==='exam'?2:1});toast('Añadido al calendario.')}});
  const fabHint=dueToday?'¡Ojo! Hoy tienes una entrega 👀':hour>=0&&hour<7?'Zzz… ¿estudiando tan tarde?':undefined;
  const inCalendar=section==='calendar'&&!active,inSettings=section==='settings'&&!active;
  const nextTodo=useMemo(()=>cal.events.filter(e=>isTodo(e)&&!e.done&&due(e).level!=='late').sort((a,b)=>a.start.localeCompare(b.start))[0],[cal.events]);
  const pendingTodos=cal.events.filter(e=>isTodo(e)&&!e.done&&due(e).level!=='late').length;
  const crumb=active?active.title:inCalendar?'Calendario':inSettings?'Ajustes':filter?plan.name(filter):'Todas las clases';
  // Si el filtro apunta a una asignatura que ya no está en «Mis asignaturas», se quita.
  useEffect(()=>{if(filter&&!subjects.some(s=>s.id===filter))setFilter('')},[subjects,filter]);
  return <PlanContext.Provider value={plan}><div className="shell">
    <aside className="sidebar">
      <a className="brand" href="./" aria-label="Aula inicio" onClick={e=>{e.preventDefault();chooseSubject('');scrollTo({top:0,behavior:'smooth'})}}><span className="brandmark"><BookOpen size={21}/></span>aula<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-avatar">D</span><div><b>Mi espacio de clases</b>{settings.course&&<small>{settings.course}</small>}</div></div>
      <div className="navlabel">BIBLIOTECA</div>
      <button className={'navitem '+(!filter&&!active&&!inCalendar&&!inSettings?'chosen':'')} onClick={()=>chooseSubject('')}><LayoutGrid size={17}/>Todas las clases<span>{lessons.length}</span></button>
      <button className={'navitem '+(inCalendar?'chosen':'')} onClick={openCalendar}><CalendarDays size={17}/>Calendario<span>{pendingTodos||''}</span></button>
      <button className={'navitem '+(inSettings?'chosen':'')} onClick={openSettings}><Settings2 size={17}/>Ajustes<span/></button>
      <div className="navlabel subject-label">MIS ASIGNATURAS <span>{String(subjects.length).padStart(2,'0')}</span></div>
      <nav aria-label="Asignaturas">
        <button className={'navitem all-chip '+(!filter&&!inCalendar&&!inSettings?'chosen':'')} onClick={()=>chooseSubject('')}><LayoutGrid size={14}/>Todas</button>
        <button className={'navitem all-chip '+(inCalendar?'chosen':'')} onClick={openCalendar}><CalendarDays size={14}/>Calendario</button>
        <button className={'navitem all-chip '+(inSettings?'chosen':'')} onClick={openSettings}><Settings2 size={14}/>Ajustes</button>
        {subjects.map(s=><button key={s.id} className={'navitem '+(filter===s.id&&!inCalendar&&!inSettings?'chosen':'')} onClick={()=>chooseSubject(s.id)}><span className="subject-dot" style={{background:s.color}}/>{s.short}<span>{lessons.filter(l=>l.subject===s.id).length}</span></button>)}
      </nav>
      <div className="side-bottom">
        <div className="storage"><span className="storage-icon"><HardDrive size={16}/></span><div><b>{bytes(total)}</b><small>en {plural(files.length,'archivo','archivos')}</small></div></div>
        <div className="private"><Lock size={13}/> Espacio privado · Solo tú</div>
        <div className="profile">{store.adapter.user.picture?<img src={store.adapter.user.picture} alt="" referrerPolicy="no-referrer"/>:<span>{(store.adapter.user.name[0]??'A').toUpperCase()}</span>}
          <div title={[store.adapter.user.name,store.adapter.user.email].filter(Boolean).join(" · ")}><b>{store.adapter.user.name}</b><small>{store.adapter.kind==='drive'?'Guardado en tu Google Drive':'Solo en este navegador'}</small></div>
          <button className="iconbtn" title={store.adapter.kind==='drive'?'Cerrar sesión':'Salir del modo demo'} aria-label="Cerrar sesión" onClick={onSignOut}><LogOut size={16}/></button></div>
      </div>
    </aside>
    <main>
      <header className="topbar"><div className="crumbs"><span>Mi espacio</span><i>/</i><b>{crumb}</b></div><div className="topbar-end"><AssistantBar a={assistant}/><span className="secure"><Lock size={12}/>Privado</span></div></header>
      <div className="content">
        {error&&<div className="error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={()=>{setError('');refresh()}}>Reintentar</button></div>}
        <div className="view" key={active?.id??(inCalendar?'calendar':inSettings?'settings':'list')} data-dir={dir}>
        {active?<>
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
        </>:inCalendar?<CalendarView cal={cal} toast={toast} onDone={celebrate}/>
        :inSettings?<SettingsView settings={settings} lessons={lessons} events={cal.events} onImport={onImport} onSignOut={onSignOut} onSaved={s=>{setSettings(s);cal.reload();toast('Ajustes guardados.')}}
          onMoved={(from,to)=>{const n=lessons.filter(l=>l.subject===from).length;setLessons(ls=>ls.map(l=>l.subject===from?{...l,subject:to}:l));toast(`${plural(n,'clase movida','clases movidas')} a ${plan.short(to)}.`)}}/>:<>
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
          :listed.length?<div className="lessons">{listed.map((l,i)=>{const fs=byLesson.get(l.id)??[],count=(k:string)=>fs.filter(f=>kindOf(f)===k).length,a=count('audio'),p=count('image'),d=count('doc'),up=uploads.some(u=>u.lesson===l.id&&(u.status==='uploading'||u.status==='queued'||u.status==='finishing'));
            return <button className="lesson" key={l.id} style={{'--i':Math.min(i,10)} as React.CSSProperties} onClick={()=>openLesson(l.id)}>
              <span className="lesson-folder" style={{background:colorOf(l.subject)}}><Folder size={22}/></span>
              <div className="lesson-body"><span className="lesson-meta">{plan.short(l.subject)}<i>·</i>{dateLabel(l.date)}</span><h3>{l.title}</h3>
                <small>{l.topic&&<span className="lesson-topic">{l.topic}</span>}{a>0&&<span><FileAudio size={13}/>{a}</span>}{p>0&&<span><ImageIcon size={13}/>{p}</span>}{d>0&&<span><FileText size={13}/>{d}</span>}{fs.length?<span>{bytes(fs.reduce((s,f)=>s+f.size,0))}</span>:<span>Sin archivos</span>}{up&&<span className="lesson-uploading"><Loader2 className="spin" size={12}/>Subiendo</span>}</small></div>
              <ArrowUpRight className="lesson-arrow" size={19}/></button>})}</div>
          :<div className="empty"><span className="empty-icon"><FolderOpen size={28}/></span><h3>{search||type!=='all'?'No hay clases que coincidan':'Tu próxima clase empieza aquí'}</h3><p>{search||type!=='all'?'Prueba con otra búsqueda o cambia los filtros.':'Crea una clase y reúne su audio, fotos y documentos.'}</p>
            {search||type!=='all'?<button className="ghost" onClick={()=>{setSearch('');setType('all')}}>Quitar filtros</button>:<button className="primary" onClick={()=>setForm({})}><Plus size={17}/>Crear mi primera clase</button>}<small>Disponible desde tu móvil y tu ordenador</small></div>}
          {lessons.length>0&&<div className="export-all"><div><b>Copia de todo tu archivo</b><small>Un ZIP con todas tus clases, sus originales y tus ajustes. Se puede volver a importar en Aula.</small></div><button onClick={exportAll}><Download size={15}/>Exportar todo · {bytes(total)}</button></div>}
          <footer><BookOpen size={15}/> Menos buscar archivos. Más tiempo para aprender.<span><Lock size={12}/>Solo tú puedes ver tu material</span></footer>
        </>}
        </div>
      </div>
    </main>
    <div className="dock">
      {zip&&<ZipCard zip={zip} onClose={()=>setZip(null)}/>}
      {uploads.length>0&&<UploadPanel uploads={uploads} onCancel={k=>cancel(k)} onRetry={retry} onClear={clear} onOpen={id=>{if(id!==selected)openLesson(id)}}/>}
      {notice&&<div className="toast" role="status" key={notice.id}><Check size={17}/>{notice.text}</div>}
      <div className="assistant-wrap"><AssistantPanel a={assistant}/><AssistantFab a={assistant} hint={fabHint}/></div>
    </div>
    {form&&<LessonForm edit={form.edit} defaultSubject={filter} onClose={()=>setForm(null)} onSave={saveLesson}/>}
    {ask&&<AskDialog ask={ask} onClose={()=>setAsk(null)} onError={setError}/>}
    {viewer&&<Viewer items={viewer.items} start={viewer.start} onClose={closeViewer}/>}
    {importing&&<ImportView onClose={()=>setImporting(false)} onImport={runImport}/>}
  </div></PlanContext.Provider>;
}

// Ventana modal con animación de entrada y salida, cierre con Esc o tocando fuera.
export function Modal({label,className='',onClose,children}:{label:string;className?:string;onClose:()=>void;children:(close:()=>void)=>React.ReactNode}){
  const [closing,setClosing]=useState(false),closed=useRef(false);
  const close=useCallback(()=>{if(closed.current)return;closed.current=true;setClosing(true);setTimeout(onClose,150)},[onClose]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')close()};addEventListener('keydown',k);const o=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{removeEventListener('keydown',k);document.body.style.overflow=o}},[close]);
  // Se pinta directamente en <body>: así cubre toda la pantalla (barra de arriba incluida)
  // aunque se abra desde una parte de la página que esté animándose.
  return createPortal(<div className={'overlay'+(closing?' closing':'')} onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section role="dialog" aria-modal="true" aria-label={label} className={'modal '+className}>{children(close)}</section></div>,document.body);
}

function LessonForm({edit,defaultSubject,onClose,onSave}:{edit?:Lesson;defaultSubject:string;onClose:()=>void;onSave:(v:Omit<Lesson,'id'>,pending:File[],edit?:Lesson)=>Promise<void>}){
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

function AskDialog({ask,onClose,onError}:{ask:Ask;onClose:()=>void;onError:(m:string)=>void}){
  const [busy,setBusy]=useState(false),[value,setValue]=useState(ask.input??'');
  return <Modal label={ask.title} className="ask" onClose={onClose}>{close=><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await ask.run(value);close()}catch(err){onError((err as Error).message);close()}}}>
    <h2>{ask.title}</h2>{ask.text&&<p>{ask.text}</p>}
    {ask.input!==undefined&&<input value={value} onChange={e=>setValue(e.target.value)} autoFocus onFocus={e=>{const dot=e.target.value.lastIndexOf('.');e.target.setSelectionRange(0,dot>0?dot:e.target.value.length)}} aria-label="Nombre"/>}
    <div className="form-footer"><button type="button" className="ghost" onClick={close}>Cancelar</button><button className={ask.danger?'primary destructive':'primary'} disabled={busy} autoFocus={ask.input===undefined}>{busy&&<Loader2 className="spin" size={16}/>}{ask.confirm}</button></div>
  </form>}</Modal>;
}

const eta=(u:UploadJob)=>{if(u.rate<1)return '';const s=(u.file.size-u.loaded)/u.rate;return s<60?`${Math.max(1,Math.round(s))} s`:`${Math.round(s/60)} min`};
function uploadText(u:UploadJob){
  if(u.status==='queued')return 'En cola';
  if(u.status==='finishing')return 'Guardando…';
  if(u.status==='done')return 'Guardado';
  if(u.status==='cancelled')return 'Cancelado';
  if(u.status==='error')return u.error||'Error';
  if(!u.loaded)return 'Empezando…';const left=eta(u);return `${bytes(u.loaded)} de ${bytes(u.file.size)}${u.rate>1?` · ${bytes(u.rate)}/s`:''}${left?` · quedan ${left}`:''}`;
}

function UploadRow({u,i,onCancel,onRetry}:{u:UploadJob;i:number;onCancel:()=>void;onRetry:()=>void}){
  const pct=u.file.size?u.loaded/u.file.size:0;
  return <div className={'filerow uploading '+u.status} style={{'--i':i} as React.CSSProperties}>
    <span className="fileicon upload"><Upload size={18}/></span>
    <div className="filename"><b>{u.file.name}</b><small>{uploadText(u)}</small><span className="bar"><i style={{transform:`scaleX(${pct})`}}/></span></div>
    <div className="file-actions">{u.status==='error'?<button className="iconbtn" onClick={onRetry} title="Reintentar" aria-label={'Reintentar '+u.file.name}><RotateCw size={16}/></button>:null}
      {u.status==='queued'||u.status==='uploading'?<button className="iconbtn" onClick={onCancel} title="Cancelar" aria-label={'Cancelar '+u.file.name}><X size={17}/></button>:null}</div>
  </div>;
}

function UploadPanel({uploads,onCancel,onRetry,onClear,onOpen}:{uploads:UploadJob[];onCancel:(k:string)=>void;onRetry:(k:string)=>void;onClear:()=>void;onOpen:(lesson:string)=>void}){
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

function ZipCard({zip,onClose}:{zip:Zip;onClose:()=>void}){
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

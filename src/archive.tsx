// Aula una vez dentro: guarda el estado de la web (clases, archivos, ajustes, sección abierta, ZIP, avisos
// y el ánimo del dinosaurio) y monta la barra lateral, la sección que toca y los paneles flotantes.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,Check,Lock} from 'lucide-react';
import {useStore} from './store';
import ImportView from './import-view';
import Sidebar from './sidebar';
import {entryBlob,type ImportPlan} from './import';
import {saveLesson as newLesson} from './doc';
import {kindOf,plural,type Item,type Lesson} from './types';
import {DEFAULT_SETTINGS,makePlan,norm,type Settings} from './settings';
import {PlanContext} from './plan';
import SettingsView from './settings-view';
import {useUploads} from './uploads';
import LessonForm from './lesson-form';
import AskDialog,{type Ask} from './ask-dialog';
import {UploadPanel,ZipCard,type Zip} from './dock';
import {dateLabel} from './lesson-bits';
import LessonDetail from './lesson-detail';
import Home from './home';
import Viewer from './viewer';
import {useNavigation} from './use-navigation';
import CalendarView from './calendar';
import {useCalendar} from './calendar-data';
import {isTodo,due} from './ics';
import {AssistantBar,AssistantFab,AssistantPanel,useAssistant} from './assistant-panel';
import type {Mood} from './dino';
import type {ZipProgress} from './zip';

export default function Archive({initial,settings:initialSettings,onSignOut,startImport}:{initial?:{lessons:Lesson[];files:Item[]};settings?:Settings;onSignOut:()=>void;startImport?:boolean}){
  const store=useStore();
  // Con Drive, lo borrado va a la papelera de Drive; en el modo demo se borra del todo.
  const trashNote=(many:boolean)=>store.adapter.kind==='drive'?`${many?'Los archivos van':'El archivo va'} a la papelera de tu Google Drive: puedes recuperarlos allí durante 30 días.`:'En el modo demo no se puede deshacer.';
  const [importing,setImporting]=useState(!!startImport),onImport=()=>setImporting(true);
  // Tus ajustes (asignaturas, horario…) y lo que se calcula con ellos, para toda la web.
  const [settings,setSettings]=useState<Settings>(initialSettings??DEFAULT_SETTINGS);
  const plan=useMemo(()=>makePlan(settings),[settings]),subjects=plan.archiveSubjects;
  const [lessons,setLessons]=useState<Lesson[]>(initial?.lessons??[]),[files,setFiles]=useState<Item[]>(initial?.files??[]),[loading,setLoading]=useState(!initial);
  const [error,setError]=useState(''),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[sort,setSort]=useState('new'),[type,setType]=useState('all');
  const [form,setForm]=useState<{edit?:Lesson}|null>(null),[ask,setAsk]=useState<Ask|null>(null);
  const [notice,setNotice]=useState<{text:string;id:number}|null>(null),[zip,setZip]=useState<Zip|null>(null);
  // Tras cada cambio, la pantalla toma las clases y los archivos de lo guardado (store.doc): así enseña
  // exactamente lo que hay en aula.json, recortes incluidos, y lo que llegue de otro dispositivo.
  const synced=()=>{setLessons(store.doc.lessons);setFiles(store.doc.files)};
  const {uploads,busy,add,cancel,retry,clear}=useUploads(useCallback(()=>{setLessons(store.doc.lessons);setFiles(store.doc.files)},[store]));
  const toast=(text:string)=>setNotice({text,id:Date.now()});
  // Calendario: sección propia (#calendario) con los datos cargados desde el principio para la portada.
  const cal=useCalendar();
  // La mascota se alegra cuando termina una subida.
  const [dinoMood,setDinoMood]=useState<Mood>('idle'),doneCount=uploads.filter(u=>u.status==='done').length,lastDone=useRef(0);
  useEffect(()=>{if(doneCount>lastDone.current){setDinoMood('happy');const t=setTimeout(()=>setDinoMood('idle'),2500);lastDone.current=doneCount;return()=>clearTimeout(t)}lastDone.current=doneCount},[doneCount]);

  async function refresh(){try{const d=await store.load();setLessons(d.lessons);setFiles(d.files);setSettings(d.settings);setError('')}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
  useEffect(()=>{if(!initial)refresh()},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(null),3800);return()=>clearTimeout(t)},[notice]);

  // Navegación con el historial del navegador (clases, calendario, Ajustes y visor).
  const {selected,dir,section,viewer,openLesson,openCalendar,openSettings,backToList,openViewer,closeViewer,goHome}=useNavigation(id=>lessons.some(l=>l.id===id));
  const chooseSubject=(id:string)=>{setFilter(id);if(selected||section!=='archive')goHome()};

  const active=lessons.find(l=>l.id===selected);
  const byLesson=useMemo(()=>{const m=new Map<string,Item[]>();for(const f of files){const a=m.get(f.lesson);if(a)a.push(f);else m.set(f.lesson,[f])}return m},[files]);
  const total=useMemo(()=>files.reduce((a,f)=>a+f.size,0),[files]);
  const listed=useMemo(()=>{const q=norm(search.trim());return lessons.filter(l=>{const fs=byLesson.get(l.id)??[];
    return (!filter||l.subject===filter)&&(!q||norm([l.title,l.topic,l.notes,l.date,dateLabel(l.date),l.subject,plan.short(l.subject),plan.name(l.subject),...fs.map(f=>f.name)].join(' ')).includes(q))&&(type==='all'||fs.some(f=>kindOf(f)===type))})
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
    synced();setSettings(store.doc.settings);
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
    const {id}=await store.archive({action:'save',...v,id:edit?.id});synced();
    if(!edit){openLesson(id);if(pending.length)add(pending,id,store.doc.lessons.find(x=>x.id===id)?.title??v.title)}
    toast(edit?'Cambios guardados.':'Clase creada.');
  }
  function addFiles(list:File[]){if(active&&list.length)add(list,active.id,active.title)}
  function removeLesson(){if(!active)return;const id=active.id,n=activeFiles.length;
    setAsk({title:'¿Eliminar esta clase?',text:`Se borrarán «${active.title}» y ${plural(n,'archivo','archivos')}. ${trashNote(n!==1)}`,confirm:'Eliminar clase',danger:true,run:async()=>{
      cancel(undefined,id);await store.archive({action:'deleteLesson',id});synced();backToList();toast('Clase eliminada.')}})}
  function removeFile(f:Item){setAsk({title:'¿Eliminar este archivo?',text:`Se borrará «${f.name}». ${trashNote(false)}`,confirm:'Eliminar',danger:true,run:async()=>{await store.archive({action:'deleteFile',id:f.id});synced();toast('Archivo eliminado.')}})}
  function rename(f:Item){setAsk({title:'Renombrar archivo',confirm:'Guardar nombre',input:f.name,run:async name=>{name=name.trim();if(!name||name===f.name)return;await store.archive({action:'renameFile',id:f.id,name});synced()}})}
  // Un ZIP con su tarjeta de progreso (que se refresca como mucho cada 120 ms). Solo uno a la vez.
  // lesson: la clase que se descarga ('*' si son varias); hide: la tarjeta se quita sola al acabar.
  async function runZip(lesson:string,title:string,size:number,run:(mod:typeof import('./zip'),onProgress:(p:ZipProgress)=>void)=>Promise<void>,hide=false){
    if(zip&&(zip.status==='preparing'||zip.status==='running'))return;
    setZip({lesson,title,loaded:0,total:size,status:'preparing'});
    let timer:ReturnType<typeof setTimeout>|undefined,last:ZipProgress|null=null;
    try{const mod=await import('./zip');
      await run(mod,p=>{last=p;if(!timer)timer=setTimeout(()=>{timer=undefined;const q=last!;setZip(z=>z&&{...z,loaded:q.loaded,total:q.total,mode:q.mode,status:'running'})},120)});
      clearTimeout(timer);setZip(z=>z&&{...z,loaded:z.total,status:'done'});celebrate();
      if(hide)setTimeout(()=>setZip(z=>z?.status==='done'?null:z),4500);
    }catch(e){clearTimeout(timer);setZip(z=>z&&{...z,status:'error',error:(e as Error).message})}
  }
  const downloadClass=()=>{if(!active)return;const l=active,fs=activeFiles;runZip(l.id,l.title,fs.reduce((a,f)=>a+f.size,0),(m,p)=>m.downloadZip(fs,l.title,l.notes,p),true)};
  // ZIP de varias clases: «Exportar todo» o lo que ha encontrado el asistente.
  const exportAll=()=>runZip('*','Aula completa',total,(m,p)=>m.downloadEverything(lessons,files,settings,p));
  const downloadFound=(ls:Lesson[],fs:Item[],label:string,size:number)=>runZip('*',label,size,(m,p)=>m.downloadSelection(ls,fs,label,settings,p));

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
    <Sidebar settings={settings} lessons={lessons} files={files} total={total} subjects={subjects} filter={filter} active={!!active} inCalendar={inCalendar} inSettings={inSettings} pendingTodos={pendingTodos}
      chooseSubject={chooseSubject} openCalendar={openCalendar} openSettings={openSettings} onSignOut={onSignOut}/>
    <main>
      <header className="topbar"><div className="crumbs"><span>Mi espacio</span><i>/</i><b>{crumb}</b></div><div className="topbar-end"><AssistantBar a={assistant}/><span className="secure"><Lock size={12}/>Privado</span></div></header>
      <div className="content">
        {error&&<div className="error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={()=>{setError('');refresh()}}>Reintentar</button></div>}
        <div className="view" key={active?.id??(inCalendar?'calendar':inSettings?'settings':'list')} data-dir={dir}>
        {active?<LessonDetail active={active} activeFiles={activeFiles} activeUploads={activeUploads} zip={zip} backToList={backToList} setForm={setForm} downloadClass={downloadClass} removeLesson={removeLesson}
          addFiles={addFiles} cancel={k=>cancel(k)} retry={retry} openViewer={openViewer} rename={rename} removeFile={removeFile}/>
        :inCalendar?<CalendarView cal={cal} toast={toast} onDone={celebrate}/>
        :inSettings?<SettingsView settings={settings} lessons={lessons} events={cal.events} onImport={onImport} onSignOut={onSignOut} onSaved={s=>{setSettings(s);cal.reload();toast('Ajustes guardados.')}}
          onMoved={(from,to)=>{const n=lessons.filter(l=>l.subject===from).length;synced();toast(`${plural(n,'clase movida','clases movidas')} a ${plan.short(to)}.`)}}/>
        :<Home lessons={lessons} files={files} total={total} subjects={subjects} listed={listed} byLesson={byLesson} uploads={uploads} loading={loading} nextTodo={nextTodo} pendingTodos={pendingTodos}
          filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} sort={sort} setSort={setSort} type={type} setType={setType}
          setForm={setForm} openCalendar={openCalendar} openSettings={openSettings} openLesson={openLesson} exportAll={exportAll}/>}
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


import {useCallback,useEffect,useMemo,useState} from 'react';
import {AlertCircle,ArrowUpRight,Check,ChevronDown,ChevronLeft,ChevronRight,Link2,Loader2,Pencil,Plus,RotateCw,Settings2,Trash2,Unlink,Upload,X,Zap} from 'lucide-react';
import {MOODLE_PROXY,SYNC_EVERY} from './moodle';
import {Modal} from './archive';
import {usePlan} from './plan';
import {useStore} from './store';
import {readPref,writePref} from './prefs';
import {keyOf,dayOf,fromKey,timeOf,isTodo,due,type CalEvent,type Kind} from './ics';
export {keyOf,dayOf,isTodo,due} from './ics';

// feed: cuándo importaste por última vez el calendario de Moodle (null si nunca) y si se actualiza solo.
export type Feed={importedAt:string;auto:boolean}|null;
type State={events:CalEvent[];feed:Feed};

// Datos del calendario (salen del mismo aula.json que lo demás).
export function useCalendar(){
  const store=useStore(),call=(b:object)=>store.calendar(b);
  const [state,setState]=useState<State|null>(()=>store.calendarState()),[syncing,setSyncing]=useState(false);
  const run=useCallback(async(body:object)=>{const d=await call(body);if(d.events)setState({events:d.events,feed:d.feed});return d},[store]);
  // Cambio al instante en pantalla; si falla, se deshace.
  const mark=useCallback(async(id:string,patch:{priority?:number;done?:boolean})=>{
    let before:State|null=null;
    setState(s=>{before=s;return s&&{...s,events:s.events.map(e=>e.id===id?{...e,...('priority' in patch?{priority:patch.priority!}:{}),...('done' in patch?{done:patch.done?1:0}:{})}:e)}});
    try{await call({action:'mark',id,...patch})}catch(e){setState(before);throw e}
  },[]);
  const reload=useCallback(async()=>{setState(store.calendarState())},[store]);
  // Moodle conectado: se trae solo al abrir Aula (si hace más de 3 h) y cada 3 h mientras está abierta.
  const [syncError,setSyncError]=useState('');
  const sync=useCallback(async(quiet=false)=>{
    setSyncing(true);if(!quiet)setSyncError('');
    try{const d=await run({action:'sync'});setSyncError('');return d}catch(e){setSyncError((e as Error).message);if(!quiet)throw e}finally{setSyncing(false)}
  },[run]);
  useEffect(()=>{
    let busy=false;
    const check=()=>{const m=store.doc.moodle;if(busy||!m.url||!MOODLE_PROXY||document.visibilityState!=='visible')return;
      if(m.importedAt&&Date.now()-Date.parse(m.importedAt)<SYNC_EVERY)return;
      busy=true;sync(true).finally(()=>{busy=false})};
    const first=setTimeout(check,2500),t=setInterval(check,10*60e3);document.addEventListener('visibilitychange',check);
    return()=>{clearTimeout(first);clearInterval(t);document.removeEventListener('visibilitychange',check)};
  },[store,sync]);
  return {events:state?.events??[],feed:state?.feed??null,loaded:!!state,syncing,syncError,sync,run,mark,reload};
}
export type Calendar=ReturnType<typeof useCalendar>;

// ---------- Fechas ----------
const WEEKDAYS=['L','M','X','J','V','S','D'];
const longDay=(k:string)=>{const s=fromKey(k).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});return s.charAt(0).toUpperCase()+s.slice(1)};

const PRIORITY=['Baja','Normal','Alta'];
const KIND:Record<Kind,string>={task:'Entrega',exam:'Examen',event:'Evento',holiday:'Festivo'};

const sinceText=(iso:string|null)=>{if(!iso)return 'aún no';const m=Math.round((Date.now()-Date.parse(iso))/6e4);return m<1?'ahora mismo':m<60?`hace ${m} min`:m<1440?`hace ${Math.round(m/60)} h`:`hace ${Math.round(m/1440)} días`};

// ---------- Vista ----------
export default function CalendarView({cal,toast,onDone}:{cal:Calendar;toast:(t:string)=>void;onDone?:()=>void}){
  const {events,feed,loaded,syncing,syncError,sync,run,mark}=cal;
  const plan=usePlan(),tint=(s:string)=>plan.color(s)??'#e9ece5';
  const today=keyOf(new Date());
  const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
  const [selected,setSelected]=useState(today);
  const [form,setForm]=useState<{edit?:CalEvent;date?:string}|null>(null),[connect,setConnect]=useState(false);
  const [order,setOrder]=useState<'date'|'priority'>(()=>readPref('aula-pendientes')==='priority'?'priority':'date');
  const [showDone,setShowDone]=useState(false),[open,setOpen]=useState<string|null>(null),[error,setError]=useState('');

  const byDay=useMemo(()=>{const m=new Map<string,CalEvent[]>();for(const e of events){const k=dayOf(e);const a=m.get(k);if(a)a.push(e);else m.set(k,[e])}
    for(const a of m.values())a.sort((x,y)=>(x.kind==='holiday'?-1:0)-(y.kind==='holiday'?-1:0)||x.start.localeCompare(y.start));return m},[events]);
  const cells=useMemo(()=>{const first=new Date(month),offset=(first.getDay()+6)%7,start=new Date(first.getFullYear(),first.getMonth(),1-offset);
    const weeks=Math.ceil((offset+new Date(first.getFullYear(),first.getMonth()+1,0).getDate())/7);
    return Array.from({length:weeks*7},(_,i)=>{const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);return {key:keyOf(d),day:d.getDate(),out:d.getMonth()!==first.getMonth()}})},[month]);
  // Lo que viene, arriba. Lo vencido sin marcar (de las dos últimas semanas) va aparte, plegado al final.
  const [todos,late]=useMemo(()=>{
    const list=events.filter(e=>isTodo(e)&&(showDone?e.done:!e.done)&&(showDone||dayOf(e)>=keyOf(new Date(Date.now()-14*864e5))));
    list.sort((a,b)=>order==='priority'&&!showDone?b.priority-a.priority||a.start.localeCompare(b.start):showDone?b.start.localeCompare(a.start):a.start.localeCompare(b.start));
    return showDone?[list,[]]:[list.filter(e=>due(e).level!=='late'),list.filter(e=>due(e).level==='late')];
  },[events,order,showDone]);
  const [showLate,setShowLate]=useState(false);
  const doneCount=events.filter(e=>isTodo(e)&&e.done).length,pendingCount=todos.length;

  const go=(delta:number)=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+delta,1));
  const goToday=()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1));setSelected(today)};
  const pickDay=(k:string)=>{setSelected(k);const d=fromKey(k);if(d.getMonth()!==month.getMonth())setMonth(new Date(d.getFullYear(),d.getMonth(),1))};
  const setOrderSaved=(o:'date'|'priority')=>{setOrder(o);writePref('aula-pendientes',o)};
  const safe=async(fn:()=>Promise<unknown>)=>{setError('');try{await fn()}catch(e){setError((e as Error).message)}};
  // Un toque: Normal → Alta → Baja → Normal.
  const cycle=(e:CalEvent)=>safe(()=>mark(e.id,{priority:[1,2,0][e.priority]??1}));
  const toggle=(e:CalEvent)=>safe(async()=>{await mark(e.id,{done:!e.done});toast(e.done?'Tarea pendiente otra vez.':'Tarea hecha. ¡Bien!');if(!e.done)onDone?.()});

  const remove=(e:CalEvent)=>safe(async()=>{await run({action:'delete',id:e.id});setOpen(null);toast('Evento eliminado.')});
  const dayEvents=byDay.get(selected)??[];

  const row=(e:CalEvent)=>{const d=due(e),info=plan.info(e.subject),expanded=open===e.id;
    return <li key={e.id} className={'todo p'+e.priority+(e.done?' done':'')+(expanded?' open':'')}>
      <button className="todo-check" role="checkbox" aria-checked={!!e.done} aria-label={(e.done?'Marcar pendiente: ':'Marcar hecha: ')+e.title} onClick={()=>toggle(e)}><Check size={14}/></button>
      <button className="todo-main" aria-expanded={expanded} onClick={()=>setOpen(expanded?null:e.id)}>
        <b>{e.title}</b>
        <span className="todo-meta">{e.subject&&<span className="todo-subject"><i style={{background:tint(e.subject)}}/>{plan.short(e.subject)}</span>}{e.kind==='exam'&&<span className="todo-kind">Examen</span>}<span className={'due '+d.level}>{d.text}</span></span>
      </button>
      <button className={'prio p'+e.priority} title="Cambiar importancia" aria-label={`Importancia ${PRIORITY[e.priority]}. Cambiar`} onClick={()=>cycle(e)}><span className="prio-bars"><i/><i/><i/></span>{PRIORITY[e.priority]}</button>
      {expanded&&<div className="todo-more">
        <p className="todo-when">{KIND[e.kind]} · {longDay(dayOf(e))}{timeOf(e)&&' · '+timeOf(e)}{info&&' · '+info.name}</p>
        {e.description?<p className="todo-desc">{e.description}</p>:<p className="todo-desc empty">Sin descripción.</p>}
        <div className="todo-actions">
          <button onClick={()=>pickDay(dayOf(e))}>Ver en el calendario</button>
          {e.uid?<span className="from">De Moodle</span>:<><button onClick={()=>setForm({edit:e})}><Pencil size={14}/>Editar</button><button className="danger" onClick={()=>remove(e)}><Trash2 size={14}/>Eliminar</button></>}
        </div>
      </div>}
    </li>};

  return <div className="calendar-page">
    <div className="page-heading">
      <div><div className="eyebrow">ENTREGAS Y EXÁMENES</div><h1>Calendario</h1><p>Lo de Moodle y lo que añadas tú, en un mismo sitio.</p></div>
      <button className="primary" onClick={()=>setForm({date:selected>=today?selected:today})}><Plus size={18}/>Nuevo evento</button>
    </div>

    {feed?.auto?<div className={'feed-bar'+(syncError?' warn':'')}>
      <span className="feed-icon">{syncing?<Loader2 className="spin" size={16}/>:syncError?<AlertCircle size={16}/>:<Link2 size={16}/>}</span>
      <div><b>Moodle conectado · se actualiza solo</b><small>{syncing?'Actualizando…':syncError?'No se ha podido actualizar: '+syncError:'Última vez '+sinceText(feed.importedAt)}</small></div>
      <button className="ghost" disabled={syncing} onClick={async()=>{try{const d=await sync();toast(d.imported===1?'Moodle al día: 1 evento.':`Moodle al día: ${d.imported} eventos.`)}catch{}}}><RotateCw size={15}/>Ahora</button>
      <button className="iconbtn" aria-label="Opciones de Moodle" onClick={()=>setConnect(true)}><Settings2 size={16}/></button>
    </div>
    :feed?<div className={'feed-bar'+(Date.now()-Date.parse(feed.importedAt)>7*864e5?' warn':'')}>
      <span className="feed-icon"><Link2 size={16}/></span>
      <div><b>Calendario de Moodle</b><small>Importado {sinceText(feed.importedAt)}{MOODLE_PROXY?' · puedes hacer que se actualice solo':Date.now()-Date.parse(feed.importedAt)>7*864e5?' · conviene actualizarlo':''}</small></div>
      <button className="ghost" onClick={()=>setConnect(true)}>{MOODLE_PROXY?<><Zap size={15}/>Automático</>:<><RotateCw size={15}/>Actualizar</>}</button>
    </div>
    :loaded&&<button className="feed-bar connect" onClick={()=>setConnect(true)}>
      <span className="feed-icon"><Link2 size={16}/></span>
      <div><b>Trae tu calendario de Moodle</b><small>{MOODLE_PROXY?'Pega el enlace de tu calendario de Moodle y tus entregas y exámenes aparecerán aquí solos.':'Exporta el calendario desde Moodle y súbelo aquí: verás tus entregas y exámenes.'}</small></div>
      <ArrowUpRight size={17}/>
    </button>}
    {error&&<div className="error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Cerrar aviso"><X size={15}/></button></div>}

    <div className="cal-layout">
      <section className="month" aria-label="Calendario del mes">
        <header>
          <h2>{month.toLocaleDateString('es-ES',{month:'long'}).replace(/^./,c=>c.toUpperCase())} <span>{month.getFullYear()}</span></h2>
          <div className="month-nav">
            <button className="ghost today-btn" onClick={goToday}>Hoy</button>
            <button className="iconbtn" aria-label="Mes anterior" onClick={()=>go(-1)}><ChevronLeft size={18}/></button>
            <button className="iconbtn" aria-label="Mes siguiente" onClick={()=>go(1)}><ChevronRight size={18}/></button>
          </div>
        </header>
        <div className="month-grid" key={keyOf(month)}>
          {WEEKDAYS.map(w=><div key={w} className="wd">{w}</div>)}
          {cells.map((c,i)=>{const list=byDay.get(c.key)??[],holiday=list.some(e=>e.kind==='holiday'),shown=list.filter(e=>e.kind!=='holiday');
            return <button key={c.key} style={{'--i':i} as React.CSSProperties} className={'day'+(c.out?' out':'')+(c.key===today?' today':'')+(c.key===selected?' selected':'')+(holiday?' holiday':'')+(i%7>4?' weekend':'')+(c.key<today?' past':'')}
              onClick={()=>pickDay(c.key)} aria-label={longDay(c.key)+(list.length?`, ${list.length} ${list.length===1?'evento':'eventos'}`:'')} aria-pressed={c.key===selected}>
              <span className="num">{c.day}</span>
              {holiday&&<span className="holiday-tag">Festivo</span>}
              <span className="chips">{shown.slice(0,3).map(e=><span key={e.id} className={'chip k-'+e.kind+(e.done?' done':'')+(e.priority===2&&isTodo(e)&&!e.done?' hot':'')} style={{'--tint':tint(e.subject)} as React.CSSProperties}>{e.title}</span>)}
                {shown.length>3&&<span className="more">+{shown.length-3}</span>}</span>
              <span className="dots">{shown.slice(0,4).map(e=><i key={e.id} className={'k-'+e.kind+(e.done?' done':'')} style={{'--tint':tint(e.subject)} as React.CSSProperties}/>)}</span>
            </button>})}
        </div>
        <div className="day-detail">
          <div className="day-head"><h3>{selected===today?'Hoy · ':''}{longDay(selected)}</h3><button className="ghost" onClick={()=>setForm({date:selected})}><Plus size={15}/>Añadir</button></div>
          {dayEvents.length?<ul>{dayEvents.map(e=><li key={e.id} className={'k-'+e.kind+(e.done?' done':'')}>
            <span className="bar" style={{background:e.kind==='holiday'?'var(--line-2)':tint(e.subject)}}/>
            <span className="time">{e.kind==='holiday'?'Todo el día':timeOf(e)||'Todo el día'}</span>
            <span className="what"><b>{e.title}</b><small>{KIND[e.kind]}{e.subject?' · '+plan.name(e.subject):''}</small></span>
            {isTodo(e)?<button className="mini-check" role="checkbox" aria-checked={!!e.done} aria-label={'Hecha: '+e.title} onClick={()=>toggle(e)}><Check size={13}/></button>
            :!e.uid&&<button className="iconbtn" aria-label={'Editar '+e.title} onClick={()=>setForm({edit:e})}><Pencil size={14}/></button>}
          </li>)}</ul>:<p className="day-empty">Nada para este día.</p>}
        </div>
      </section>

      <section className="todos" aria-label="Tareas pendientes">
        <header>
          <h2>{showDone?'Hechas':'Pendientes'} <span>{showDone?doneCount:pendingCount}</span></h2>
          {!showDone&&<div className="sched-switch" role="group" aria-label="Ordenar pendientes">
            <button aria-pressed={order==='date'} onClick={()=>setOrderSaved('date')}>Fecha</button>
            <button aria-pressed={order==='priority'} onClick={()=>setOrderSaved('priority')}>Importancia</button>
          </div>}
        </header>
        {!loaded?<div className="todo-skeleton"><i/><i/><i/></div>
        :todos.length?<ul className="todo-list">{todos.map(row)}</ul>
        :<p className="todos-empty">{showDone?'Todavía no has marcado nada como hecho.':'No tienes nada pendiente. 🎉'}</p>}
        {late.length>0&&<div className="late-group">
          <button className="late-toggle" aria-expanded={showLate} onClick={()=>setShowLate(v=>!v)}><AlertCircle size={15}/>Vencidas sin marcar <span>{late.length}</span><ChevronDown size={15} className={showLate?'flip':''}/></button>
          {showLate&&<ul className="todo-list">{late.map(row)}</ul>}
        </div>}
        <button className="show-done" onClick={()=>{setShowDone(v=>!v);setOpen(null)}}>{showDone?<><ChevronLeft size={15}/>Volver a pendientes</>:<>Ver hechas ({doneCount})<ChevronDown size={15}/></>}</button>
      </section>
    </div>

    {form&&<EventForm edit={form.edit} date={form.date??today} onClose={()=>setForm(null)} onSave={async body=>{await run({action:'save',...body,id:form.edit?.id});toast(form.edit?'Cambios guardados.':'Evento añadido.')}}/>}
    {connect&&<ConnectForm feed={feed} run={run} onClose={()=>setConnect(false)} toast={toast}/>}
  </div>;
}

// ---------- Formularios ----------
type SaveBody={title:string;description:string;start:string;allDay:boolean;kind:Kind;subject:string;priority:number};
function EventForm({edit,date,onClose,onSave}:{edit?:CalEvent;date:string;onClose:()=>void;onSave:(b:SaveBody)=>Promise<void>}){
  const plan=usePlan();
  const [kind,setKind]=useState<Kind>(edit?.kind??'task'),[subject,setSubject]=useState(edit?.subject??''),[priority,setPriority]=useState(edit?.priority??1);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const d0=edit?dayOf(edit):date,t0=edit&&!edit.allDay?timeOf(edit):'';
  return <Modal label={edit?'Editar evento':'Nuevo evento'} onClose={onClose}>{close=><>
    <div className="modal-head"><div><span className="eyebrow">TU CALENDARIO</span><h2>{edit?'Editar evento':'Nuevo evento'}</h2></div><button className="iconbtn" aria-label="Cerrar" onClick={close}><X size={20}/></button></div>
    <form className="event-form" onSubmit={async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;setSaving(true);setError('');
      try{const allDay=!v.time;const start=allDay?v.date:new Date(`${v.date}T${v.time}`).toISOString();
        await onSave({title:v.title.trim(),description:v.notes??'',start,allDay,kind,subject,priority});close()}catch(err){setError((err as Error).message);setSaving(false)}}}>
      <label>Título<input name="title" required maxLength={300} autoFocus placeholder="Ej. Repasar hilos para el examen" defaultValue={edit?.title}/></label>
      <div className="field"><span>Tipo</span><div className="pills" role="radiogroup" aria-label="Tipo">{(['task','exam','event'] as Kind[]).map(k=><button type="button" key={k} role="radio" aria-checked={kind===k} className={kind===k?'active':''} onClick={()=>{setKind(k);if(!edit)setPriority(k==='exam'?2:1)}}>{k==='task'?'Tarea':KIND[k]}</button>)}</div>
        <small>{kind==='event'?'Solo se verá en el calendario.':'Aparecerá también en «Pendientes».'}</small></div>
      <div className="field"><span>Asignatura <small>opcional</small></span><div className="subject-pick" role="radiogroup" aria-label="Asignatura">
        <button type="button" role="radio" aria-checked={!subject} className={!subject?'active':''} onClick={()=>setSubject('')}>Ninguna</button>
        {plan.subjects.map(s=><button type="button" key={s.id} role="radio" aria-checked={subject===s.id} className={subject===s.id?'active':''} title={s.name} onClick={()=>setSubject(s.id)}><i style={{background:s.color}}/>{s.short}</button>)}
      </div></div>
      <div className="form-grid"><label>Fecha<input name="date" type="date" required defaultValue={d0}/></label><label><span>Hora <small>opcional</small></span><input name="time" type="time" defaultValue={t0}/></label></div>
      {kind!=='event'&&<div className="field"><span>Importancia</span><div className="pills prio-pick" role="radiogroup" aria-label="Importancia">{[2,1,0].map(p=><button type="button" key={p} role="radio" aria-checked={priority===p} className={(priority===p?'active ':'')+'p'+p} onClick={()=>setPriority(p)}><span className="prio-bars"><i/><i/><i/></span>{PRIORITY[p]}</button>)}</div></div>}
      <label><span>Notas <small>opcional</small></span><textarea name="notes" rows={3} maxLength={8000} placeholder="Lo que tengas que recordar…" defaultValue={edit?.description}/></label>
      {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
      <div className="form-footer"><button type="button" className="ghost" onClick={close}>Cancelar</button><button className="primary" disabled={saving} type="submit">{saving?<><Loader2 className="spin" size={16}/>Guardando…</>:<>{edit?'Guardar cambios':'Añadir al calendario'}<ArrowUpRight size={17}/></>}</button></div>
    </form></>}</Modal>;
}

// Traer el calendario de Moodle. Dos formas:
//  · Automática: pegas una vez el enlace de «Obtener URL del calendario» y Aula lo vuelve a mirar sola
//    (a través del intermediario de moodle.ts, porque Moodle no deja leerlo directamente).
//  · A mano: exportas el archivo .ics y lo subes.
// En las dos, lo tuyo (importancia, hechas) se conserva.
function ConnectForm({feed,run,onClose,toast}:{feed:Feed;run:(b:object)=>Promise<any>;onClose:()=>void;toast:(t:string)=>void}){
  const [busy,setBusy]=useState<''|'link'|'file'|'unlink'>(''),[error,setError]=useState(''),[manual,setManual]=useState(!MOODLE_PROXY);
  const go=async(kind:'link'|'file'|'unlink',body:()=>Promise<object>,msg:(d:any)=>string)=>{
    setBusy(kind);setError('');
    try{const d=await run(await body());toast(msg(d));onClose()}catch(e){setError((e as Error).message)}finally{setBusy('')}};
  const count=(n:number)=>n===1?'1 evento':`${n} eventos`;
  return <Modal label="Calendario de Moodle" onClose={onClose}>{close=><>
    <div className="modal-head"><div><span className="eyebrow">MOODLE</span><h2>{feed?.auto?'Moodle conectado':manual?'Subir el calendario de Moodle':'Conectar tu calendario de Moodle'}</h2></div><button className="iconbtn" aria-label="Cerrar" onClick={close}><X size={20}/></button></div>

    {feed?.auto?<>
      <p className="connect-state"><Zap size={15}/><span>Aula mira tu Moodle al abrirse y cada 3 horas. Última vez: <b>{sinceText(feed.importedAt)}</b>.</span></p>
      <p className="connect-note">Si cambias el enlace en Moodle (o deja de funcionar), desconéctalo y pega el nuevo.</p>
      {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
      <div className="form-footer connect-footer">
        <button type="button" className="ghost danger-text" disabled={!!busy} onClick={()=>go('unlink',async()=>({action:'unlink'}),()=>'Moodle desconectado. Tus eventos se quedan.')}>{busy==='unlink'?<Loader2 className="spin" size={16}/>:<Unlink size={16}/>}Desconectar</button>
        <button type="button" className="primary" onClick={close}>Listo</button>
      </div>
    </>:!manual?<form onSubmit={e=>{e.preventDefault();const url=String(new FormData(e.currentTarget).get('url')??'');go('link',async()=>({action:'link',url}),d=>`Moodle conectado: ${count(d.imported)}. A partir de ahora se actualiza solo.`)}}>
      <ol className="connect-steps">
        <li>En Moodle, abre <b>Calendario → Importar o exportar calendarios → Exportar calendario</b>.</li>
        <li>Elige <b>Todos los eventos</b> y <b>Eventos recientes y próximos</b>, y pulsa <b>Obtener URL del calendario</b>.</li>
        <li>Copia el enlace que aparece y pégalo aquí.</li>
      </ol>
      <label className="connect-url">Enlace del calendario<input name="url" type="url" required autoComplete="off" spellCheck={false} placeholder="https://…/calendar/export_execute.php?…"/></label>
      <p className="connect-note">El enlace solo sirve para leer tu calendario de Moodle. Se guarda en tu Drive y, para descargarlo, pasa por un pequeño intermediario de Aula que no guarda nada (<a href="./privacidad.html" target="_blank" rel="noopener">privacidad</a>).</p>
      {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
      <div className="form-footer connect-footer">
        <button type="button" className="ghost" onClick={()=>{setManual(true);setError('')}}><Upload size={16}/>Prefiero subir el archivo</button>
        <button className="primary" disabled={!!busy} type="submit">{busy==='link'?<><Loader2 className="spin" size={16}/>Conectando…</>:<><Link2 size={16}/>Conectar</>}</button>
      </div>
    </form>:<>
      {feed&&<p className="connect-state"><Link2 size={15}/>Última importación: <b>{sinceText(feed.importedAt)}</b>. Repítelo de vez en cuando para ver las tareas nuevas.</p>}
      <ol className="connect-steps">
        <li>En Moodle, abre <b>Calendario → Importar o exportar calendarios → Exportar calendario</b>.</li>
        <li>Elige <b>Todos los eventos</b> y <b>Eventos recientes y próximos</b> (o un intervalo que cubra el curso), y pulsa <b>Exportar</b>. Se descarga un archivo <b>.ics</b>.</li>
        <li>Súbelo aquí. Las tareas que ya tenías conservan su importancia y si están hechas.</li>
      </ol>
      {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
      <div className="form-footer connect-footer">
        {MOODLE_PROXY?<button type="button" className="ghost" onClick={()=>{setManual(false);setError('')}}><Zap size={16}/>Mejor que se actualice solo</button>:<button type="button" className="ghost" onClick={close}>Cancelar</button>}
        <label className="primary import-btn">{busy==='file'?<Loader2 className="spin" size={16}/>:<Upload size={16}/>}Elegir archivo .ics<input type="file" accept=".ics,text/calendar" hidden disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)go('file',async()=>({action:'import',ics:await f.text()}),d=>`${count(d.imported)} de Moodle ${d.imported===1?'importado':'importados'}.`)}}/></label>
      </div>
    </>}
  </>}</Modal>;
}

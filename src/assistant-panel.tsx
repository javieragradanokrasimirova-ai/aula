
import {useEffect,useRef,useState} from 'react';
import {ArrowUp,CalendarDays,CalendarPlus,Check,Download,Folder,X} from 'lucide-react';
import Dino,{type Mood} from './dino';
import {answer,examplesFor,greeting,type Answer,type Proposal} from './assistant';
import {due,type CalEvent} from './ics';
import {bytes,type Item,type Lesson} from './types';
import {usePlan} from './plan';
import {readPref,writePref} from './prefs';
import type {Plan} from './settings';

type Msg={id:number;from:'me'|'dino';text:string;answer?:Answer;added?:boolean};
// plan: los ajustes. Se pasa a mano porque este gancho se usa en Archive, por encima de PlanContext.
type Props={lessons:Lesson[];files:Item[];events?:CalEvent[];plan:Plan;mood?:Mood;onOpen:(id:string)=>void;onDownload:(lessons:Lesson[],files:Item[],label:string,bytes:number)=>void;
  onOpenCalendar?:()=>void;onAddEvent?:(p:Proposal)=>Promise<void>};
const dateLabel=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short'});

const isMobile=()=>matchMedia('(max-width:760px)').matches;

// Estado del asistente, compartido por la barra de la cabecera (escritorio) y el botón de la esquina (móvil).
export function useAssistant({lessons,files,events=[],plan,mood:outer='idle',onOpen,onDownload,onOpenCalendar,onAddEvent}:Props){
  const [open,setOpenRaw]=useState(false),[msgs,setMsgs]=useState<Msg[]>([]),[mood,setMood]=useState<Mood|null>(null);
  const timers=useRef<ReturnType<typeof setTimeout>[]>([]),ctx=useRef<Answer|null>(null),greeted=useRef(false);
  const later=(fn:()=>void,ms:number)=>{timers.current.push(setTimeout(fn,ms))};
  const flash=(m:Mood,ms=2400)=>{setMood(m);later(()=>setMood(x=>x===m?null:x),ms)};
  useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
  // Al abrirlo por primera vez, saluda con la mano.
  const setOpen=(v:boolean)=>{setOpenRaw(v);if(v&&!greeted.current){greeted.current=true;flash('wave',2200)}};
  useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpenRaw(false)};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[open]);
  function send(q:string){
    q=q.trim();if(!q)return;setOpenRaw(true);greeted.current=true;
    setMsgs(m=>[...m,{id:Date.now(),from:'me',text:q}]);setMood('think');
    // Una pausa corta para que se vea que «piensa»; la búsqueda en sí es instantánea.
    later(()=>{
      const a=answer(q,{lessons,files,events,plan},ctx.current);
      if(['search','download','open','stats'].includes(a.query.action)&&a.lessons.length&&!a.similar)ctx.current=a;
      setMsgs(m=>[...m,{id:Date.now()+1,from:'dino',text:a.text,answer:a}]);
      const m:Mood=a.mood==='sad'?'sad':a.mood==='worried'?'worried':a.mood==='celebrate'?'celebrate':a.query.action==='greet'?'wave':a.similar?'think':a.mood==='happy'?'happy':'idle';
      setMood(null);if(m!=='idle')flash(m,m==='sad'?2000:2400);
      if(a.query.action==='open'&&a.lessons.length===1){onOpen(a.lessons[0].id);if(isMobile())later(()=>setOpenRaw(false),700)}
    },450);
  }
  async function add(msg:Msg){
    const p=msg.answer?.add;if(!p||!onAddEvent)return;
    try{await onAddEvent(p);setMsgs(m=>[...m.map(x=>x.id===msg.id?{...x,added:true}:x),{id:Date.now(),from:'dino',text:`¡Apuntado! «${p.title}» ya está en tu calendario.`}]);flash('celebrate',2600)}
    catch(e){setMsgs(m=>[...m,{id:Date.now(),from:'dino',text:`No he podido apuntarlo: ${(e as Error).message}`}]);flash('sad')}
  }
  return {open,setOpen,msgs,send,add,mood:(mood??outer) as Mood,thinking:mood==='think'&&msgs[msgs.length-1]?.from==='me',onOpen,onDownload,onOpenCalendar,later};
}
type A=ReturnType<typeof useAssistant>;

// Panel de conversación. En escritorio cuelga de la barra de la cabecera; en el móvil sale encima del botón.
export function AssistantPanel({a}:{a:A}){
  const plan=usePlan(),{color:colorOf,short}=plan;
  const [text,setText]=useState(''),list=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  useEffect(()=>{list.current?.scrollTo({top:list.current.scrollHeight,behavior:'smooth'})},[a.msgs,a.thinking]);
  useEffect(()=>{if(a.open&&isMobile())setTimeout(()=>input.current?.focus(),180)},[a.open]);
  if(!a.open)return null;
  const openLesson=(id:string)=>{a.onOpen(id);if(isMobile())a.setOpen(false)};
  const openCalendar=()=>{a.onOpenCalendar?.();if(isMobile())a.setOpen(false)};
  const chips=(list:string[])=><div className="assistant-examples">{list.map(e=><button key={e} onClick={()=>a.send(e)}>{e}</button>)}</div>;
  return <section className="assistant" role="dialog" aria-label="Asistente de Aula" data-assistant>
    <header><Dino mood={a.mood} size={38} follow/><div><b>Asistente de Aula</b><small>Tus clases, tu calendario y tu horario</small></div><button className="iconbtn" onClick={()=>a.setOpen(false)} aria-label="Cerrar asistente"><X size={18}/></button></header>
    <div className="assistant-msgs" ref={list} aria-live="polite">
      <div className="bubble dino">{greeting()} Pregúntame lo que quieras sobre tus clases, tus entregas o tu horario, como te salga. Te entiendo aunque escribas rápido o con faltas.</div>
      {!a.msgs.length&&chips(examplesFor(plan))}
      {a.msgs.map(m=>m.from==='me'?<div className="bubble me" key={m.id}>{m.text}</div>:<div className="bubble dino" key={m.id}>
        {m.text}
        {m.answer&&m.answer.lessons.length>0&&m.answer.query.action!=='stats'&&<div className="found">{m.answer.lessons.slice(0,8).map(l=>
          <button key={l.id} onClick={()=>openLesson(l.id)}><span className="found-dot" style={{background:colorOf(l.subject)}}><Folder size={13}/></span><span><small>{short(l.subject)} · {dateLabel(l.date)}</small>{l.title}</span></button>)}
          {m.answer.lessons.length>8&&<small className="found-more">y {m.answer.lessons.length-8} más</small>}</div>}
        {m.answer?.tasks&&m.answer.tasks.length>0&&<div className="found">{m.answer.tasks.map(t=>{const d=due(t);
          return <button key={t.id} onClick={openCalendar}><span className="found-dot" style={{background:colorOf(t.subject)}}><CalendarDays size={13}/></span><span><small>{t.subject?short(t.subject)+' · ':''}{t.kind==='exam'?'Examen · ':''}<em className={'due '+d.level}>{d.text}</em></small>{t.title}</span></button>})}</div>}
        {m.answer&&m.answer.query.action==='download'&&m.answer.files.length>0&&<button className="primary small" onClick={()=>a.onDownload(m.answer!.lessons,m.answer!.files,'Clases '+(m.answer!.label||'seleccionadas'),m.answer!.bytes)}><Download size={15}/>Descargar ZIP · {bytes(m.answer.bytes)}</button>}
        {m.answer?.add&&(m.added?<span className="added"><Check size={14}/>Añadido</span>:<button className="primary small" onClick={()=>a.add(m)}><CalendarPlus size={15}/>Añadir al calendario</button>)}
        {m.answer?.suggestions&&m===a.msgs[a.msgs.length-1]&&chips(m.answer.suggestions)}
      </div>)}
      {a.thinking&&<div className="bubble dino typing" aria-label="Pensando"><i/><i/><i/></div>}
    </div>
    <form className="assistant-input" onSubmit={e=>{e.preventDefault();a.send(text);setText('')}}>
      <input ref={input} value={text} onChange={e=>setText(e.target.value)} placeholder="Ej.: ¿qué tengo mañana?" aria-label="Escribe tu pregunta" maxLength={200}/>
      <button className="primary" aria-label="Enviar" disabled={!text.trim()}><ArrowUp size={17}/></button>
    </form>
  </section>;
}

// Móvil: el dinosaurio en la esquina, con un saludo breve la primera vez en cada sesión.
export function AssistantFab({a,hint:custom}:{a:A;hint?:string}){
  const [hint,setHint]=useState(false);
  useEffect(()=>{if(!isMobile())return;if(readPref('aula-dino','session'))return;a.later(()=>setHint(true),1800);a.later(()=>setHint(false),7500);writePref('aula-dino','1','session')},[]);
  useEffect(()=>{if(a.open)setHint(false)},[a.open]);
  return <>
    {hint&&!a.open&&<button className="dino-hint" onClick={()=>a.setOpen(true)}>{custom??'¿Te busco alguna clase?'}</button>}
    <button className={'assistant-fab'+(a.open?' open':'')} onClick={()=>a.setOpen(!a.open)} aria-label={a.open?'Cerrar asistente':'Abrir asistente'} aria-expanded={a.open}><Dino mood={a.mood} size={68}/></button>
  </>;
}

// Escritorio: barra «Pregúntame algo…» en la cabecera, con el dinosaurio asomándose por encima.
// Al pasar el ratón se asoma un poco más y saluda; sus ojos siguen al ratón por la página.
export function AssistantBar({a}:{a:A}){
  const [text,setText]=useState(''),input=useRef<HTMLInputElement>(null),bar=useRef<HTMLFormElement>(null);
  // «/» lleva directamente a la barra, como en muchos buscadores.
  useEffect(()=>{const k=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(t.tagName)&&!t.isContentEditable){e.preventDefault();input.current?.focus()}};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[]);
  // El panel se alinea con el borde derecho de la barra y justo debajo de ella.
  useEffect(()=>{if(!a.open)return;const place=()=>{const r=bar.current?.getBoundingClientRect();if(!r)return;const s=document.documentElement.style;s.setProperty('--ask-right',`${Math.max(12,document.documentElement.clientWidth-r.right)}px`);s.setProperty('--ask-top',`${r.bottom+10}px`)};
    place();addEventListener('resize',place);return()=>removeEventListener('resize',place)},[a.open]);
  // Un clic fuera de la barra y del panel cierra el panel.
  useEffect(()=>{if(!a.open)return;const f=(e:PointerEvent)=>{const t=e.target as Node;if(bar.current?.contains(t)||(t as Element).closest?.('[data-assistant]'))return;if(!isMobile())a.setOpen(false)};addEventListener('pointerdown',f);return()=>removeEventListener('pointerdown',f)},[a.open]);
  return <form ref={bar} className={'ask-bar'+(a.open?' open':'')} onSubmit={e=>{e.preventDefault();if(text.trim()){a.send(text);setText('')}else a.setOpen(true)}}>
    <button type="button" className="ask-dino" onClick={()=>{a.setOpen(!a.open);input.current?.focus()}} aria-label={a.open?'Cerrar asistente':'Abrir asistente'} aria-expanded={a.open}><Dino mood={a.mood} size={42} follow/></button>
    <input ref={input} value={text} onChange={e=>setText(e.target.value)} placeholder="Pregúntame algo…" aria-label="Pregunta al asistente" maxLength={200}/>
    {text.trim()?<button className="ask-send" aria-label="Enviar"><ArrowUp size={15}/></button>:<kbd aria-hidden="true">/</kbd>}
  </form>;
}

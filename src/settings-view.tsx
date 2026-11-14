
// Pantalla de Ajustes: curso, asignaturas (con Moodle y el dinosaurio) y horario.
// Se edita una copia; nada se guarda hasta pulsar «Guardar cambios» (salvo «mover sus clases», que es inmediato).
import {useEffect,useMemo,useRef,useState} from 'react';
import {FolderInput,AlertCircle,ArrowDown,ArrowRightLeft,ArrowUp,ArrowUpRight,Check,ChevronDown,Coffee,Eraser,Link2,Loader2,Plus,Trash2,X} from 'lucide-react';
import {DAYS,PALETTE,hhmm,newId,validate,type Period,type Settings,type Subject} from './settings';
import type {Lesson} from './types';
import WeekPainter from './week-painter';
import type {CalEvent} from './ics';
import {useStore} from './store';

const toInput=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const fromInput=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})$/);return m?Math.min(1440,+m[1]*60+ +m[2]):null};
const words=(v:string)=>v.split(/[,;\n]/).map(w=>w.trim().toLowerCase()).filter(Boolean);
const DAY_OPTIONS:[number,string][]=[[5,'Lunes a viernes'],[6,'Hasta el sábado'],[7,'Toda la semana']];

type Props={settings:Settings;lessons:Lesson[];events:CalEvent[];onSaved:(s:Settings)=>void;onMoved:(from:string,to:string)=>void;onImport:()=>void};
export default function SettingsView({settings,lessons,events,onSaved,onMoved,onImport}:Props){
  const store=useStore();
  const [draft,setDraft]=useState<Settings>(settings),[version,setVersion]=useState(0);
  const [open,setOpen]=useState<string|null>(null),[fresh,setFresh]=useState<string[]>([]);
  const [brush,setBrush]=useState<string>(()=>settings.subjects[0]?.id??'');
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const dirty=JSON.stringify(draft)!==JSON.stringify(settings);
  const check=useMemo(()=>validate(draft),[draft]),problem='error' in check?check.error:'';
  const used=useMemo(()=>{const m=new Map<string,number>();for(const l of lessons)m.set(l.subject,(m.get(l.subject)??0)+1);return m},[lessons]);
  // Categorías de Moodle que no pertenecen a ninguna asignatura (las tareas llegan con esa clave suelta).
  const orphans=useMemo(()=>{const ids=new Set(settings.subjects.map(s=>s.id)),m=new Map<string,CalEvent[]>();
    for(const e of events)if(e.uid&&e.subject&&!ids.has(e.subject)){const a=m.get(e.subject);if(a)a.push(e);else m.set(e.subject,[e])}
    return [...m].sort((a,b)=>b[1].length-a[1].length)},[events,settings]);
  // Al salir de la web con cambios sin guardar, el navegador avisa.
  useEffect(()=>{if(!dirty)return;const f=(e:BeforeUnloadEvent)=>{e.preventDefault()};addEventListener('beforeunload',f);return()=>removeEventListener('beforeunload',f)},[dirty]);

  const set=(patch:Partial<Settings>)=>setDraft(d=>({...d,...patch}));
  const setSubject=(id:string,patch:Partial<Subject>)=>setDraft(d=>({...d,subjects:d.subjects.map(s=>s.id===id?{...s,...patch}:s)}));
  function addSubject(){
    const taken=draft.subjects.map(s=>s.id),id=newId('ASIG',taken),used=new Set(draft.subjects.map(s=>s.color));
    const color=PALETTE.find(c=>!used.has(c))??PALETTE[draft.subjects.length%PALETTE.length];
    setDraft(d=>({...d,subjects:[...d.subjects,{id,short:'',name:'',color,teacher:'',archive:true,moodle:[],words:[]}]}));
    setFresh(f=>[...f,id]);setOpen(id);if(!brush)setBrush(id);
  }
  function removeSubject(id:string){
    setDraft(d=>({...d,subjects:d.subjects.filter(s=>s.id!==id),week:d.week.map(day=>day.map(c=>c===id?'':c))}));
    if(brush===id)setBrush('');if(open===id)setOpen(null);
  }
  // Subir o bajar una asignatura: es el orden de la barra lateral, las tarjetas y los botones.
  const moveSubject=(id:string,delta:number)=>setDraft(d=>{const i=d.subjects.findIndex(s=>s.id===id),j=i+delta;if(i<0||j<0||j>=d.subjects.length)return d;
    const list=[...d.subjects];[list[i],list[j]]=[list[j],list[i]];return {...d,subjects:list}});
  // Una categoría huérfana («XYZ») se añade a la lista de Moodle de una asignatura (o se quita de todas).
  const assignOrphan=(code:string,to:string)=>{const c=code.toLowerCase();
    setDraft(d=>({...d,subjects:d.subjects.map(s=>({...s,moodle:s.id===to?[...new Set([...s.moodle,c])]:s.moodle.filter(m=>m!==c)}))}))};
  const orphanTarget=(code:string)=>draft.subjects.find(s=>s.moodle.includes(code.toLowerCase()))?.id??'';

  function setPeriod(i:number,patch:Partial<Period>){setDraft(d=>({...d,periods:d.periods.map((p,j)=>j===i?{...p,...patch}:p),week:patch.break?d.week.map(day=>day.map((c,j)=>j===i?'':c)):d.week}))}
  function addPeriod(isBreak:boolean){
    setDraft(d=>{const last=d.periods[d.periods.length-1],start=last?last.end:480,end=Math.min(1440,start+(isBreak?30:60));
      return {...d,periods:[...d.periods,isBreak?{start,end,break:true}:{start,end}],week:d.week.map(day=>[...day,''])}});
  }
  const removePeriod=(i:number)=>setDraft(d=>({...d,periods:d.periods.filter((_,j)=>j!==i),week:d.week.map(day=>day.filter((_,j)=>j!==i))}));
  const setDays=(n:number)=>setDraft(d=>({...d,days:n,week:Array.from({length:n},(_,k)=>d.week[k]??d.periods.map(()=>''))}));

  const discard=()=>{setDraft(settings);setFresh([]);setError('');setVersion(v=>v+1)};

  async function save(){
    if(problem)return;setSaving(true);setError('');
    // Las asignaturas nuevas reciben su clave definitiva a partir de la abreviatura.
    let out=draft;
    for(const id of fresh){const s=out.subjects.find(x=>x.id===id);if(!s)continue;
      const key=newId(s.short,out.subjects.filter(x=>x.id!==id).map(x=>x.id));
      out={...out,subjects:out.subjects.map(x=>x.id===id?{...x,id:key}:x),week:out.week.map(day=>day.map(c=>c===id?key:c))}}
    try{
      const d=await store.settings({action:'save',settings:out});
      setFresh([]);setDraft(d.settings);setVersion(v=>v+1);onSaved(d.settings);
      if(brush&&!d.settings.subjects.some((s:Subject)=>s.id===brush))setBrush(d.settings.subjects[0]?.id??'');
    }catch(e){setError((e as Error).message)}finally{setSaving(false)}
  }

  return <div className="settings-page" key={version}>
    <div className="page-heading">
      <div><div className="eyebrow">TU ESPACIO, A TU MANERA</div><h1>Ajustes</h1><p>Tus asignaturas, tu horario y cómo los reconocen Moodle y el dinosaurio.</p></div>
    </div>

    <section className="set-card" aria-labelledby="set-course">
      <header><h2 id="set-course">Tu curso</h2><p>Aparece debajo de «Mi espacio de clases».</p></header>
      <label className="set-field">Nombre del curso<input value={draft.course} maxLength={60} placeholder="Ej. 2º DAM · 2026–2027" onChange={e=>set({course:e.target.value})}/></label>
    </section>

    <section className="set-card" aria-labelledby="set-data">
      <header><h2 id="set-data">Tus datos</h2><p>{store.adapter.kind==='drive'?'Todo se guarda en tu Google Drive, en la carpeta «Aula». Aula no guarda nada en ningún otro sitio.':'Estás en modo demo: todo se guarda solo en este navegador.'}</p></header>
      <button type="button" className="ghost set-import" onClick={onImport}><FolderInput size={16}/>Importar una copia de Aula (ZIP de «Exportar todo»)</button>
    </section>

    <section className="set-card" aria-labelledby="set-subjects">
      <header><h2 id="set-subjects">Asignaturas <span>{draft.subjects.length}</span></h2><p>Toca una para cambiar su nombre, color, profesor o cómo se llama en Moodle.</p></header>
      {orphans.length>0&&<div className="set-orphans" role="group" aria-label="Categorías de Moodle sin asignatura">
        <p><Link2 size={16}/><span><b>De Moodle llegan tareas que no son de ninguna asignatura.</b> Dime de cuál es cada categoría y, al guardar, se colocan solas.</span></p>
        <ul>{orphans.map(([code,list])=>{const to=orphanTarget(code);
          return <li key={code}>
            <span className="set-orphan-what"><b>{code.toLowerCase()}</b><small>{list.length} {list.length===1?'tarea':'tareas'} · «{list[0].title}»</small></span>
            <select aria-label={`Asignatura para la categoría ${code.toLowerCase()}`} value={to} onChange={e=>assignOrphan(code,e.target.value)}>
              <option value="">Sin asignatura</option>
              {draft.subjects.filter(s=>s.short).map(s=><option key={s.id} value={s.id}>{s.short} · {s.name}</option>)}
            </select>
          </li>})}</ul>
      </div>}
      <ul className="set-subjects">
        {draft.subjects.map((s,idx)=>{const n=used.get(s.id)??0,expanded=open===s.id;
          return <li key={s.id} className={expanded?'open':''}>
            <button className="set-subject-head" aria-expanded={expanded} onClick={()=>setOpen(expanded?null:s.id)}>
              <span className="set-swatch" style={{background:s.color}}/>
              <b>{s.short||'Nueva'}</b><span className="set-subject-name">{s.name||'Sin nombre'}</span>
              <span className="set-tags">{!s.archive&&<em>Solo horario</em>}{n>0&&<em>{n} {n===1?'clase':'clases'}</em>}</span>
              <ChevronDown size={17} className={expanded?'flip':''}/>
            </button>
            {expanded&&<div className="set-subject-body">
              <div className="set-grid">
                <label className="set-field">Abreviatura<input value={s.short} maxLength={8} autoFocus={!s.short} placeholder="Ej. PSP" onChange={e=>setSubject(s.id,{short:e.target.value.replace(/\s/g,'')})}/></label>
                <label className="set-field wide">Nombre<input value={s.name} maxLength={60} placeholder="Ej. Programación de servicios y procesos" onChange={e=>setSubject(s.id,{name:e.target.value})}/></label>
                <label className="set-field wide"><span>Profesor o profesora <small>opcional</small></span><input value={s.teacher} maxLength={80} placeholder="Si son dos: Ana Ruiz y Luis Gil" onChange={e=>setSubject(s.id,{teacher:e.target.value})}/></label>
              </div>
              <div className="set-field"><span>Color</span><div className="set-colors" role="radiogroup" aria-label="Color">
                {PALETTE.map(c=><button key={c} type="button" role="radio" aria-checked={s.color===c} aria-label={'Color '+c} className={s.color===c?'active':''} style={{background:c}} onClick={()=>setSubject(s.id,{color:c})}>{s.color===c&&<Check size={14}/>}</button>)}
                <label className={'set-color-custom'+(PALETTE.includes(s.color)?'':' active')} title="Otro color"><input type="color" value={s.color} onChange={e=>setSubject(s.id,{color:e.target.value})}/><Plus size={14}/></label>
              </div></div>
              <label className={'set-switch'+(n?' locked':'')}>
                <input type="checkbox" checked={s.archive} disabled={n>0&&s.archive} onChange={e=>setSubject(s.id,{archive:e.target.checked})}/>
                <span className="set-switch-ui"/>
                <span><b>Mostrar en «Mis asignaturas»</b><small>{n>0?'Tiene clases guardadas, así que tiene que seguir ahí.':'Si la quitas, solo aparece en el horario y el calendario y no puedes guardar clases suyas.'}</small></span>
              </label>
              <WordsField label="Categorías de Moodle" hint="Como aparecen en Moodle (dam_ps) o solo la parte final (ps). Las tareas de esas categorías se asignan a esta asignatura." value={s.moodle} onChange={v=>setSubject(s.id,{moodle:v})} placeholder="dam_ps, psp"/>
              <WordsField label="Otros nombres para el dinosaurio" hint="Además de la abreviatura y el nombre. Así entiende «clases de odoo» o «lo de móviles»." value={s.words} onChange={v=>setSubject(s.id,{words:v})} placeholder="odoo, gestión empresarial"/>
              {n>0&&!fresh.includes(s.id)&&<MoveLessons from={s} count={n} targets={settings.subjects.filter(t=>t.archive&&t.id!==s.id)} onMoved={onMoved}/>}
              <div className="set-subject-foot">
                <div className="set-order">
                  <button type="button" className="iconbtn" disabled={idx===0} aria-label={`Subir ${s.short||'asignatura'}`} title="Subir" onClick={()=>moveSubject(s.id,-1)}><ArrowUp size={16}/></button>
                  <button type="button" className="iconbtn" disabled={idx===draft.subjects.length-1} aria-label={`Bajar ${s.short||'asignatura'}`} title="Bajar" onClick={()=>moveSubject(s.id,1)}><ArrowDown size={16}/></button>
                </div>
                {n>0?<small>Para quitarla, primero mueve sus clases a otra asignatura.</small>:<button type="button" className="ghost danger-text" onClick={()=>removeSubject(s.id)}><Trash2 size={15}/>Quitar asignatura</button>}
              </div>
            </div>}
          </li>})}
      </ul>
      <button type="button" className="ghost set-add" onClick={addSubject}><Plus size={16}/>Añadir asignatura</button>
    </section>

    <section className="set-card" aria-labelledby="set-week">
      <header><h2 id="set-week">Horario</h2><p>Primero los días y las horas de cada franja; después elige una asignatura y toca o arrastra por las casillas.</p></header>
      <div className="pills set-days" role="radiogroup" aria-label="Días con clase">
        {DAY_OPTIONS.map(([n,label])=><button key={n} type="button" role="radio" aria-checked={draft.days===n} className={draft.days===n?'active':''} onClick={()=>setDays(n)}>{label}</button>)}
      </div>
      <div className="set-periods">
        {draft.periods.map((p,i)=><div key={i} className={'set-period'+(p.break?' is-break':'')}>
          <span className="set-period-n">{p.break?<Coffee size={14}/>:draft.periods.slice(0,i+1).filter(x=>!x.break).length+'ª'}</span>
          <input type="time" aria-label="Empieza" value={toInput(p.start)} onChange={e=>{const v=fromInput(e.target.value);if(v!==null)setPeriod(i,{start:v})}}/>
          <span className="set-dash">–</span>
          <input type="time" aria-label="Acaba" value={toInput(p.end)} onChange={e=>{const v=fromInput(e.target.value);if(v!==null)setPeriod(i,{end:v})}}/>
          <button type="button" className={'set-chip'+(p.break?' active':'')} aria-pressed={!!p.break} onClick={()=>setPeriod(i,{break:!p.break})}>Recreo</button>
          <button type="button" className="iconbtn" aria-label={`Quitar la franja de las ${hhmm(p.start)}`} onClick={()=>removePeriod(i)}><X size={16}/></button>
        </div>)}
        <div className="set-period-add"><button type="button" className="ghost" onClick={()=>addPeriod(false)}><Plus size={15}/>Añadir hora</button><button type="button" className="ghost" onClick={()=>addPeriod(true)}><Coffee size={15}/>Añadir recreo</button></div>
      </div>

      <WeekPainter settings={draft} update={setDraft} brush={brush} setBrush={setBrush}/>
    </section>

    {(dirty||error)&&<div className="set-savebar" role="region" aria-label="Guardar ajustes">
      <span className={problem||error?'warn':''}>{problem||error?<><AlertCircle size={16}/>{problem||error}</>:'Tienes cambios sin guardar.'}</span>
      <button type="button" className="ghost" disabled={saving} onClick={discard}>Descartar</button>
      <button type="button" className="primary" disabled={saving||!!problem||!dirty} onClick={save}>{saving?<><Loader2 className="spin" size={16}/>Guardando…</>:<>Guardar cambios<ArrowUpRight size={17}/></>}</button>
    </div>}
  </div>;
}

// Mover todas las clases guardadas de una asignatura a otra (se hace al momento, con confirmación).
function MoveLessons({from,count,targets,onMoved}:{from:Subject;count:number;targets:Subject[];onMoved:(from:string,to:string)=>void}){
  const [to,setTo]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const target=targets.find(t=>t.id===to);
  const store=useStore();
  async function run(){
    setBusy(true);setError('');
    try{await store.settings({action:'moveLessons',from:from.id,to});
      onMoved(from.id,to);setConfirm(false);setTo('');
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  if(!targets.length)return null;
  return <div className="set-move">
    {confirm&&target?<>
      <span className="set-move-ask"><ArrowRightLeft size={15}/>¿Mover {count} {count===1?'clase':'clases'} de {from.short} a {target.short}?</span>
      <button type="button" className="ghost" disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</button>
      <button type="button" className="primary" disabled={busy} onClick={run}>{busy?<Loader2 className="spin" size={15}/>:<Check size={15}/>}Sí, mover</button>
    </>:<>
      <span className="set-move-label"><ArrowRightLeft size={15}/>Mover sus {count} {count===1?'clase':'clases'} a</span>
      <select aria-label="Asignatura de destino" value={to} onChange={e=>setTo(e.target.value)}><option value="">Elige asignatura…</option>{targets.map(t=><option key={t.id} value={t.id}>{t.short} · {t.name}</option>)}</select>
      <button type="button" className="ghost" disabled={!to} onClick={()=>setConfirm(true)}>Mover</button>
    </>}
    {error&&<p className="error" role="alert"><AlertCircle size={16}/>{error}</p>}
  </div>;
}

// Lista de palabras separadas por comas. Se guarda el texto tal cual mientras escribes; si la lista
// cambia desde fuera (p. ej. al asignar una categoría de Moodle), se actualiza.
function WordsField({label,hint,value,onChange,placeholder}:{label:string;hint:string;value:string[];onChange:(v:string[])=>void;placeholder:string}){
  const [text,setText]=useState(value.join(', '));
  useEffect(()=>{if(words(text).join(',')!==value.join(','))setText(value.join(', '))},[value]);
  return <label className="set-field">{label}<input value={text} placeholder={placeholder} onChange={e=>{setText(e.target.value);onChange(words(e.target.value))}} onBlur={()=>setText(words(text).join(', '))}/><small className="set-hint">{hint}</small></label>;
}

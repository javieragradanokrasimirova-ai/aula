// Asistente de bienvenida: aparece la primera vez (sin asignaturas ni clases) y en cuatro pasos deja
// Aula lista: empezar o importar una copia, curso y asignaturas, horario y calendario de Moodle.
// Todo se puede cambiar después en Ajustes.
import {useState} from 'react';
import {AlertCircle,ArrowLeft,ArrowRight,BookOpen,CalendarDays,Check,FolderInput,Loader2,Plus,Sparkles,Upload,X} from 'lucide-react';
import {DAYS,PALETTE,hhmm,newId,validate,type Period,type Settings} from './settings';
import {useStore} from './store';
import WeekPainter from './week-painter';

const STEPS=['Empezar','Asignaturas','Horario','Moodle'];
const toInput=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const fromInput=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:null};

// Franjas a partir de cuatro datos: hora de entrada, duración, cuántas clases y tras cuál va el recreo.
export function makePeriods(start:number,length:number,count:number,breakAfter:number,breakLength:number):Period[]{
  const out:Period[]=[];let t=start;
  for(let i=0;i<count&&t+length<=1440;i++){out.push({start:t,end:t+length});t+=length;
    if(breakAfter>0&&i+1===breakAfter&&i+1<count&&breakLength>0){out.push({start:t,end:t+breakLength,break:true});t+=breakLength}}
  return out;
}

type Row={id:string;short:string;name:string};
export default function Onboarding({onDone}:{onDone:(next:{settings:Settings;importCopy?:boolean})=>void}){
  const store=useStore();
  const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [course,setCourse]=useState(store.doc.settings.course);
  const [rows,setRows]=useState<Row[]>(()=>[{id:crypto.randomUUID(),short:'',name:''},{id:crypto.randomUUID(),short:'',name:''},{id:crypto.randomUUID(),short:'',name:''}]);
  const [gen,setGen]=useState({days:5,start:480,length:55,count:6,breakAfter:3,breakLength:30});
  const [draft,setDraft]=useState<Settings|null>(null),[brush,setBrush]=useState('');
  const [imported,setImported]=useState<number|null>(null);

  const filled=rows.filter(r=>r.short.trim()||r.name.trim());
  // Pasa de la lista rápida a unos ajustes de verdad (con claves, colores y una semana vacía).
  function buildSettings():Settings{
    const taken:string[]=[],subjects=filled.map((r,i)=>{const short=(r.short.trim()||r.name.trim().slice(0,5)).replace(/\s/g,'').slice(0,8),id=newId(short,taken);taken.push(id);
      return {id,short,name:r.name.trim()||short,color:PALETTE[i%PALETTE.length],teacher:'',archive:true,moodle:[],words:[]}});
    const periods=makePeriods(gen.start,gen.length,gen.count,gen.breakAfter,gen.breakLength);
    const keep=draft&&JSON.stringify(draft.periods)===JSON.stringify(periods)&&draft.days===gen.days?draft.week:null;
    return {version:1,course:course.trim(),days:gen.days,subjects,periods,week:keep??Array.from({length:gen.days},()=>periods.map(()=>''))};
  }
  async function save(s:Settings){const r=validate(s);if('error' in r)throw Error(r.error);const d=await store.settings({action:'save',settings:r.settings});return d.settings as Settings}
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};

  const goSchedule=()=>{if(!filled.length)return setError('Añade al menos una asignatura (o pulsa «Saltar»).');
    const shorts=filled.map(r=>(r.short.trim()||r.name.trim()).toLowerCase());if(new Set(shorts).size!==shorts.length)return setError('Hay dos asignaturas con la misma abreviatura.');
    setError('');const s=buildSettings();setDraft(s);setBrush(s.subjects[0]?.id??'');setStep(2)};
  const regenerate=(patch:Partial<typeof gen>)=>{const g={...gen,...patch};setGen(g);
    setDraft(d=>{if(!d)return d;const periods=makePeriods(g.start,g.length,g.count,g.breakAfter,g.breakLength);return {...d,days:g.days,periods,week:Array.from({length:g.days},()=>periods.map(()=>''))}})};

  return <div className="onboarding">
    <div className="onb-card">
      <header className="onb-head">
        <span className="brand onb-brand"><span className="brandmark"><BookOpen size={19}/></span>aula<span className="brand-dot">.</span></span>
        <ol className="onb-steps" aria-label="Pasos">{STEPS.map((s,i)=><li key={s} className={i===step?'now':i<step?'done':''}><span>{i<step?<Check size={12}/>:i+1}</span>{s}</li>)}</ol>
      </header>

      {step===0&&<section className="onb-body">
        <h1>¡Hola! Vamos a dejar Aula a tu medida.</h1>
        <p>En un par de minutos: tus asignaturas, tu horario y, si quieres, tus entregas de Moodle. Todo se puede cambiar luego en Ajustes.</p>
        <div className="onb-choices">
          <button className="onb-choice" onClick={()=>setStep(1)}><Sparkles size={22}/><b>Empezar de cero</b><small>Te pregunto tus asignaturas y tu horario.</small></button>
          <button className="onb-choice" onClick={()=>onDone({settings:store.doc.settings,importCopy:true})}><FolderInput size={22}/><b>Ya tenía Aula</b><small>Importa el ZIP de «Exportar todo» con tus clases, archivos y ajustes.</small></button>
        </div>
      </section>}

      {step===1&&<section className="onb-body">
        <h1>¿Qué asignaturas tienes?</h1>
        <p>La abreviatura es lo que verás en el horario y en la barra lateral (por ejemplo, PSP). Los colores se ponen solos.</p>
        <label className="set-field onb-course">Tu curso <small>opcional</small><input value={course} maxLength={60} placeholder="Ej. 2º DAM · 2026–2027" onChange={e=>setCourse(e.target.value)}/></label>
        <ul className="onb-rows">{rows.map((r,i)=><li key={r.id}>
          <span className="set-swatch" style={{background:PALETTE[i%PALETTE.length]}}/>
          <input aria-label="Abreviatura" className="onb-short" value={r.short} maxLength={8} placeholder="Abrev." onChange={e=>setRows(rs=>rs.map(x=>x.id===r.id?{...x,short:e.target.value.replace(/\s/g,'')}:x))}/>
          <input aria-label="Nombre" value={r.name} maxLength={60} placeholder={['Ej. Programación','Ej. Bases de datos','Ej. Inglés'][i]??'Nombre'} onChange={e=>setRows(rs=>rs.map(x=>x.id===r.id?{...x,name:e.target.value}:x))}/>
          <button type="button" className="iconbtn" aria-label="Quitar" onClick={()=>setRows(rs=>rs.filter(x=>x.id!==r.id))}><X size={16}/></button>
        </li>)}</ul>
        <button type="button" className="ghost set-add" onClick={()=>setRows(rs=>[...rs,{id:crypto.randomUUID(),short:'',name:''}])}><Plus size={16}/>Otra asignatura</button>
        {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
        <footer className="onb-foot"><button className="ghost" onClick={()=>{setError('');setStep(0)}}><ArrowLeft size={16}/>Atrás</button>
          <button className="ghost" onClick={()=>run(async()=>{const s=await save({...buildSettings(),subjects:[],week:[]});onDone({settings:s})})}>Saltar</button>
          <button className="primary" onClick={goSchedule}>Siguiente<ArrowRight size={16}/></button></footer>
      </section>}

      {step===2&&draft&&<section className="onb-body">
        <h1>Tu horario</h1>
        <p>Dime cómo son tus días y luego pinta la semana: elige una asignatura y toca o arrastra por las casillas.</p>
        <div className="onb-gen">
          <label className="set-field">Días<select value={gen.days} onChange={e=>regenerate({days:+e.target.value})}><option value={5}>Lunes a viernes</option><option value={6}>Hasta el sábado</option><option value={7}>Toda la semana</option></select></label>
          <label className="set-field">Entras a las<input type="time" value={toInput(gen.start)} onChange={e=>{const v=fromInput(e.target.value);if(v!==null)regenerate({start:v})}}/></label>
          <label className="set-field">Cada clase dura<select value={gen.length} onChange={e=>regenerate({length:+e.target.value})}>{[45,50,55,60,90,120].map(n=><option key={n} value={n}>{n} min</option>)}</select></label>
          <label className="set-field">Clases al día<select value={gen.count} onChange={e=>regenerate({count:+e.target.value})}>{[2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label className="set-field">Recreo<select value={gen.breakAfter} onChange={e=>regenerate({breakAfter:+e.target.value})}><option value={0}>Sin recreo</option>{Array.from({length:Math.max(0,gen.count-1)},(_,i)=><option key={i} value={i+1}>Tras la {i+1}ª</option>)}</select></label>
          {gen.breakAfter>0&&<label className="set-field">Dura<select value={gen.breakLength} onChange={e=>regenerate({breakLength:+e.target.value})}>{[15,20,25,30,45].map(n=><option key={n} value={n}>{n} min</option>)}</select></label>}
        </div>
        <p className="onb-range">De {hhmm(draft.periods[0]?.start??0)} a {hhmm(draft.periods[draft.periods.length-1]?.end??0)} · {DAYS.slice(0,gen.days).map(d=>d.slice(0,3)).join(', ')}</p>
        <WeekPainter settings={draft} update={fn=>setDraft(d=>d&&fn(d))} brush={brush} setBrush={setBrush}/>
        {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
        <footer className="onb-foot"><button className="ghost" onClick={()=>setStep(1)}><ArrowLeft size={16}/>Atrás</button>
          <button className="primary" disabled={busy} onClick={()=>run(async()=>{const s=await save(draft);setDraft(s);setStep(3)})}>{busy?<Loader2 className="spin" size={16}/>:null}Guardar y seguir<ArrowRight size={16}/></button></footer>
      </section>}

      {step===3&&<section className="onb-body">
        <h1>¿Usas Moodle?</h1>
        <p>Si importas tu calendario verás tus entregas y exámenes en Aula, y el dinosaurio te avisará de lo que vence.</p>
        <ol className="connect-steps">
          <li>En Moodle: <b>Calendario → Importar o exportar calendarios → Exportar calendario</b>.</li>
          <li>Elige <b>Todos los eventos</b> y <b>Eventos recientes y próximos</b>, y pulsa <b>Exportar</b>.</li>
          <li>Sube aquí el archivo <b>.ics</b> que se descarga.</li>
        </ol>
        {imported!==null?<p className="onb-ok"><Check size={16}/>{imported===1?'1 evento importado.':`${imported} eventos importados.`} Si alguna categoría de Moodle no se reconoce, Ajustes te dirá de qué asignatura es.</p>
        :<label className="ghost import-btn onb-ics">{busy?<Loader2 className="spin" size={16}/>:<Upload size={16}/>}Elegir el archivo .ics<input type="file" accept=".ics,text/calendar" hidden disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)run(async()=>{const d=await store.calendar({action:'import',ics:await f.text()});setImported(d.imported)})}}/></label>}
        {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
        <footer className="onb-foot"><button className="ghost" onClick={()=>setStep(2)}><ArrowLeft size={16}/>Atrás</button>
          <button className="primary" onClick={()=>onDone({settings:store.doc.settings})}><CalendarDays size={16}/>{imported!==null?'Ir a Aula':'Ahora no, ir a Aula'}<ArrowRight size={16}/></button></footer>
      </section>}
    </div>
  </div>;
}

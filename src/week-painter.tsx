// Rejilla para «pintar» el horario: eliges una asignatura (o «Libre») y tocas casillas o arrastras por
// varias. La primera casilla decide: si ya tenía esa asignatura, el gesto la va quitando; si no, la pone.
// La usan Ajustes y el asistente de bienvenida.
import {useEffect,useRef} from 'react';
import {Eraser} from 'lucide-react';
import {DAYS,hhmm,type Settings} from './settings';

type Props={settings:Settings;update:(fn:(s:Settings)=>Settings)=>void;brush:string;setBrush:(id:string)=>void};
export default function WeekPainter({settings,update,brush,setBrush}:Props){
  const stroke=useRef<string|null>(null);
  const setCell=(day:number,i:number,v:string)=>update(d=>d.week[day]?.[i]===v?d:{...d,week:d.week.map((row,k)=>k!==day?row:row.map((c,j)=>j===i?v:c))});
  const cellAt=(x:number,y:number)=>{const el=(document.elementFromPoint(x,y) as HTMLElement|null)?.closest<HTMLElement>('[data-cell]');return el?el.dataset.cell!.split('-').map(Number):null};
  const start=(e:React.PointerEvent,day:number,i:number)=>{if(e.button>0)return;e.preventDefault();
    const v=settings.week[day]?.[i]===brush?'':brush;stroke.current=v;setCell(day,i,v)};
  useEffect(()=>{
    const move=(e:PointerEvent)=>{if(stroke.current===null)return;const c=cellAt(e.clientX,e.clientY);if(c)setCell(c[0],c[1],stroke.current)};
    const end=()=>{stroke.current=null};
    addEventListener('pointermove',move);addEventListener('pointerup',end);addEventListener('pointercancel',end);
    return()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',end);removeEventListener('pointercancel',end)};
  },[]);
  if(!settings.periods.length)return null;
  const days=DAYS.slice(0,settings.days),current=settings.subjects.find(s=>s.id===brush);
  return <>
    <div className="set-brushes" role="radiogroup" aria-label="Asignatura para pintar">
      {settings.subjects.map(s=><button key={s.id} type="button" role="radio" aria-checked={brush===s.id} className={brush===s.id?'active':''} onClick={()=>setBrush(s.id)}><i style={{background:s.color}}/>{s.short||'Nueva'}</button>)}
      <button type="button" role="radio" aria-checked={brush===''} className={'eraser'+(brush===''?' active':'')} onClick={()=>setBrush('')}><Eraser size={14}/>Libre</button>
    </div>
    <p className="set-brush-hint">{current?<>Tocando o arrastrando pones <b>{current.short||'la nueva asignatura'}</b>. Si ya estaba, se queda libre.</>:<>Tocando o arrastrando dejas las casillas <b>libres</b>.</>}</p>
    <div className="set-week" role="grid" aria-label="Horario semanal" style={{gridTemplateRows:`30px ${settings.periods.map(p=>p.break?'22px':'44px').join(' ')}`,gridTemplateColumns:`var(--st) repeat(${days.length},minmax(0,1fr))`}}>
      <span/>
      {days.map(d=><span key={d} className="set-week-day">{d.slice(0,3)}<em>{d.slice(3)}</em></span>)}
      {settings.periods.map((p,i)=>[
        <span key={'t'+i} className={'set-week-time'+(p.break?' break':'')}>{p.break?'Recreo':hhmm(p.start)}</span>,
        ...days.map((d,day)=>{if(p.break)return <span key={day+'-'+i} className="set-cell break"/>;
          const c=settings.week[day]?.[i]??'',s=settings.subjects.find(x=>x.id===c);
          return <button key={day+'-'+i} type="button" data-cell={day+'-'+i} className={'set-cell'+(s?' filled':'')} style={{'--tint':s?.color} as React.CSSProperties} aria-label={`${d} ${hhmm(p.start)}: ${s?s.short||s.name:'libre'}`}
            onPointerDown={e=>start(e,day,i)} onClick={e=>{if(e.detail===0)setCell(day,i,c===brush?'':brush)}}>{s?s.short||'·':''}</button>})
      ])}
    </div>
  </>;
}

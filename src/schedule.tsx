
import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,Clock} from 'lucide-react';

import {DAYS,hhmm,type Block} from './settings';
import {usePlan} from './plan';

const left=(m:number)=>m<60?m+' min':Math.floor(m/60)+' h'+(m%60?' '+m%60+' min':'');

type Now={day:number;min:number;sec:number};
function readNow():Now{
  const d=new Date(),q=new URLSearchParams(location.search),h=q.get('hora'),dia=q.get('dia');
  let min=d.getHours()*60+d.getMinutes(),day=(d.getDay()+6)%7;
  // Para probar: ?hora=14:12&dia=4 (1 = lunes).
  if(h&&/^\d{1,2}:\d{2}$/.test(h)){const [a,b]=h.split(':').map(Number);min=a*60+b}
  if(dia&&/^[1-7]$/.test(dia))day=Number(dia)-1;
  return {day,min,sec:d.getSeconds()};
}

export default function Schedule({onPick,onSetup}:{onPick:(subject:string)=>void;onSetup?:()=>void}){
  const plan=usePlan(),{blocksOf,info,short}=plan;
  const [now,setNow]=useState<Now|null>(null);
  const [view,setView]=useState<'day'|'week'>('day');
  useEffect(()=>{
    try{if(localStorage.getItem('aula-horario')==='week')setView('week')}catch{}
    const tick=()=>setNow(readNow());tick();
    const t=setInterval(tick,15000),wake=()=>document.visibilityState==='visible'&&tick();
    document.addEventListener('visibilitychange',wake);
    return()=>{clearInterval(t);document.removeEventListener('visibilitychange',wake)};
  },[]);
  const pick=(v:'day'|'week')=>{setView(v);try{localStorage.setItem('aula-horario',v)}catch{}};

  const state=useMemo(()=>{
    if(!now)return null;
    const t=now.min+now.sec/60,school=plan.hasClass(now.day);
    // Si hoy no hay clase o ya ha terminado, se enseña el siguiente día con clase.
    const live=school&&now.min<plan.dayEnd(now.day);
    const show=live?now.day:plan.nextSchoolDay(now.day);
    if(show<0)return null;
    const blocks=blocksOf(show),cur=live?blocks.find(b=>t>=b.start&&t<b.end):undefined;
    const next=live?blocks.find(b=>b.code&&b.start>=(cur?.end??t)):undefined;
    const first=blocks[0],start=plan.dayStart(show),end=plan.dayEnd(show);
    const when=live?'Hoy':show===(now.day+1)%7?'Mañana':'El '+DAYS[show].toLowerCase();
    const withTeacher=(code:string)=>{const i=info(code);return (i?.name??code)+(i?.teacher?' con '+i.teacher:'')};
    let title:string,sub:string,tag:string;
    if(cur?.code){const i=info(cur.code);tag='Ahora';title=i?.name??cur.code;sub=[short(cur.code),i?.teacher,`hasta las ${hhmm(cur.end)}`].filter(Boolean).join(' · ')+(next?.code?` · después, ${short(next.code)}`:' · última del día')}
    else if(cur){tag=cur.free?'Hora libre':'Recreo';title=`${cur.free?'Libre':'Recreo'} hasta las ${hhmm(cur.end)}`;sub=next?.code?`A las ${hhmm(next.start)} vuelves con ${info(next.code)?.name??next.code}`:''}
    else if(live){tag='Antes de clase';title=`Hoy empiezas a las ${hhmm(first.start)}`;sub=withTeacher(first.code!)}
    else{tag=school?'Clases terminadas':now.day>4?'Fin de semana':'Hoy no hay clase';title=`${when} empiezas a las ${hhmm(first.start)}`;sub=withTeacher(first.code!)}
    const remain=cur?Math.ceil(cur.end-t):live&&t<first.start?Math.ceil(first.start-t):0;
    const needle=live&&t>=start?(t-start)/(end-start):null;
    return {t,live,show,blocks,cur,title,sub,tag,remain,needle,start,end,label:live?'Hoy · '+DAYS[show]:when+' · '+DAYS[show]};
  },[now,plan]);

  if(!now)return <section className="schedule placeholder" aria-hidden="true"/>;
  // Sin horario todavía: una invitación a rellenarlo.
  if(!state)return <section className="schedule empty-schedule" aria-label="Horario">
    <div className="sched-now"><span className="sched-tag"><span className="sched-pulse"/>Horario</span><h2>Todavía no has puesto tu horario</h2><p>Rellénalo en Ajustes y aquí verás qué clase toca en cada momento.</p></div>
    {onSetup&&<button className="ghost" onClick={onSetup}>Poner mi horario</button>}
  </section>;
  const {t,live,show,blocks,cur,title,sub,tag,remain,needle,start,end,label}=state;
  const pct=(b:Block)=>Math.max(0,Math.min(1,(t-b.start)/(b.end-b.start)));
  // En la vista del día siguiente no hay nada pasado; en la semana, lo de días anteriores sí.
  const status=(b:Block,day:number,inDay:boolean)=>{
    if(!plan.hasClass(now.day)||(inDay&&!live)||day>now.day)return '';
    if(day<now.day)return ' past';
    return t>=b.end?' past':t>=b.start?' now':'';
  };
  const tip=(b:Block)=>b.code?[info(b.code)?.name??b.code,info(b.code)?.teacher,`${hhmm(b.start)}–${hhmm(b.end)}`].filter(Boolean).join(' · '):`${b.free?'Libre':'Recreo'} · ${hhmm(b.start)}–${hhmm(b.end)}`;
  const cell=(b:Block,day:number,i:number,inDay=false)=>{
    const s=status(b,day,inDay),sub=b.code?info(b.code):undefined,style={'--tint':sub?.color??'transparent','--p':s===' now'?pct(b):0,'--i':i} as React.CSSProperties;
    const inner=<><b>{b.code?short(b.code):b.free?'Libre':'Recreo'}</b><small>{hhmm(b.start)}</small></>;
    return sub?.archive
      ?<button key={i} className={'slot'+s} style={style} title={tip(b)} aria-label={tip(b)} onClick={()=>onPick(sub.id)}>{inner}</button>
      :<div key={i} className={'slot'+s+(b.code?'':b.free?' break free':' break')} style={style} title={tip(b)}>{inner}</div>;
  };
  const rows=plan.periods.map(p=>p.break?'var(--wb)':'var(--wr)').join(' ');

  return <section className={'schedule'+(cur?.code?' in-class':'')} aria-label="Horario">
    <header>
      <div className="sched-now">
        <span className="sched-tag"><span className={'sched-pulse'+(cur?' on':'')}/>{tag}{remain>0&&<em>{cur?'quedan ':'faltan '}{left(remain)}</em>}</span>
        <h2>{title}</h2>
        {sub&&<p>{sub}</p>}
      </div>
      <div className="sched-side">
        <span className="sched-clock" aria-label="Hora actual"><Clock size={14}/>{hhmm(now.min)}</span>
        <div className="sched-switch" role="group" aria-label="Vista del horario">
          <button aria-pressed={view==='day'} onClick={()=>pick('day')}>{live?'Hoy':'Día'}</button>
          <button aria-pressed={view==='week'} onClick={()=>pick('week')}><CalendarDays size={14}/>Semana</button>
        </div>
      </div>
    </header>
    {view==='day'?<div className="sched-day">
      <div className="sched-label">{label}</div>
      <div className="track">
        {blocks.map((b,i)=><div key={i} className="track-cell" style={{flexGrow:b.end-b.start,'--i':i} as React.CSSProperties}>{cell(b,show,i,true)}</div>)}
        {needle!==null&&needle<1&&<span className="needle" style={{'--x':needle} as React.CSSProperties}><i>{hhmm(now.min)}</i></span>}
      </div>
      <div className="track-ends"><span>{hhmm(start)}</span><span>{hhmm(end)}</span></div>
    </div>
    :<div className="week" role="table" aria-label="Horario semanal" style={{gridTemplateRows:`var(--wh) ${rows}`,gridTemplateColumns:`var(--wt) repeat(${plan.days.length},minmax(0,1fr))`}}>
      <div className="week-corner"/>
      {plan.days.map((d,i)=><div key={d} className={'week-day'+(now.day===i?' today':'')} style={{gridColumn:i+2}}>{d.slice(0,3)}<span>{d.slice(3)}</span></div>)}
      {plan.periods.map((p,r)=><div key={r} className={'week-time'+(p.break?' break':'')} style={{gridRow:r+2}}>{p.break?'Recreo':<>{hhmm(p.start)}<small>{hhmm(p.end)}</small></>}</div>)}
      {plan.days.map((_,day)=>blocksOf(day).map((b,i)=>b.free?null:
        <div key={day+'-'+i} className={'week-cell'+(now.day===day?' today':'')} style={{gridColumn:day+2,gridRow:`${b.from+2} / span ${b.to-b.from+1}`,'--i':day*2+i} as React.CSSProperties}>{cell(b,day,i)}</div>))}
    </div>}
  </section>;
}

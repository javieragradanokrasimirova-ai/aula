// Lector de calendarios .ics (el formato que exporta Moodle). Sin dependencias: se usa
// en el servidor (sincronización) y en el navegador (importar un archivo).
import {DEFAULT_PLAN} from './settings';

export type Kind='task'|'exam'|'event'|'holiday';
export type CalEvent={id:string;uid:string|null;title:string;description:string;start:string;end:string|null;allDay:number;kind:Kind;subject:string;priority:number;done:number};
export type Parsed={uid:string;title:string;description:string;start:string;end:string|null;allDay:number;kind:Kind;subject:string};

const unescape=(v:string)=>v.replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1');
// Fecha en España (los festivos de Moodle llegan a una hora rara de la noche anterior/del día).
const madridDate=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);

function toISO(value:string,params:string){
  if(/VALUE=DATE(?!-)/i.test(params)||/^\d{8}$/.test(value))return {iso:`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`,date:true};
  const m=value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if(!m)return null;
  const [,y,mo,d,h,mi,s,z]=m;
  // Sin «Z» es hora local de España; Moodle siempre manda UTC, así que basta con aproximarlo.
  const date=z?new Date(Date.UTC(+y,+mo-1,+d,+h,+mi,+s)):new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  return {iso:date.toISOString().replace(/\.\d{3}Z$/,'Z'),date:false};
}

export function classify(summary:string):{kind:Kind;title:string}{
  let title=summary.trim().replace(/\s+/g,' ');
  const due=/^vencimiento de\s*/i.test(title);
  title=title.replace(/^vencimiento de\s*/i,'');
  if(/^festivo/i.test(title))return {kind:'holiday',title:title.charAt(0)+title.slice(1).toLowerCase()};
  if(/examen/i.test(title))return {kind:'exam',title};
  return {kind:due?'task':'event',title};
}

// subjectOf: categoría de Moodle → asignatura (sale de los ajustes de cada persona).
export function parseICS(text:string,subjectOf:(category:string)=>string=DEFAULT_PLAN.subjectOf):Parsed[]{
  // Las líneas largas se parten en varias que empiezan por espacio o tabulador.
  const lines=text.replace(/\r\n?/g,'\n').replace(/\n[ \t]/g,'').split('\n');
  const out:Parsed[]=[];let cur:Record<string,{value:string;params:string}>|null=null;
  for(const line of lines){
    if(line==='BEGIN:VEVENT'){cur={};continue}
    if(line==='END:VEVENT'){
      if(cur?.UID&&cur.SUMMARY&&cur.DTSTART){
        const s=toISO(cur.DTSTART.value,cur.DTSTART.params),e=cur.DTEND?toISO(cur.DTEND.value,cur.DTEND.params):null;
        if(s){
          const {kind,title}=classify(unescape(cur.SUMMARY.value));
          let start=s.iso,allDay=s.date?1:0,end=e&&e.iso!==s.iso?e.iso:null;
          if(kind==='holiday'){if(!s.date)start=madridDate(new Date(s.iso));allDay=1;end=null}
          out.push({uid:cur.UID.value.slice(0,200),title:title.slice(0,300)||'Sin título',description:unescape(cur.DESCRIPTION?.value??'').trim().slice(0,8000),start,end,allDay,kind,subject:kind==='holiday'?'':subjectOf(cur.CATEGORIES?.value??'')});
        }
      }
      cur=null;continue;
    }
    if(!cur)continue;
    const i=line.indexOf(':');if(i<1)continue;
    const [name,...params]=line.slice(0,i).split(';');
    cur[name.toUpperCase()]={value:line.slice(i+1),params:params.join(';')};
  }
  return out;
}

// ---------- Fechas de los eventos (las usan el calendario y el asistente) ----------
const pad=(n:number)=>String(n).padStart(2,'0');
export const keyOf=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const dayOf=(e:CalEvent)=>e.allDay?e.start.slice(0,10):keyOf(new Date(e.start));
export const fromKey=(k:string)=>new Date(k+'T12:00:00');
export const timeOf=(e:CalEvent)=>e.allDay?'':new Date(e.start).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
export const daysBetween=(a:string,b:string)=>Math.round((fromKey(b).getTime()-fromKey(a).getTime())/864e5);
export const isTodo=(e:CalEvent)=>e.kind==='task'||e.kind==='exam';
// «Hoy, 23:59», «Mañana», «En 3 días», «Venció hace 2 días»… y lo urgente que es.
export function due(e:CalEvent,now=new Date()){
  const today=keyOf(now),d=dayOf(e),n=daysBetween(today,d),t=timeOf(e);
  const past=e.allDay?n<0:new Date(e.start)<now;
  if(past)return {text:n===0?'Venció hoy':n===-1?'Venció ayer':`Venció hace ${-n} días`,level:'late'};
  const when=n===0?'Hoy':n===1?'Mañana':n<7?fromKey(d).toLocaleDateString('es-ES',{weekday:'long'}).replace(/^./,c=>c.toUpperCase()):`En ${n} días`;
  return {text:when+(t?', '+t:''),level:n<=1?'urgent':n<=3?'soon':'calm'};
}

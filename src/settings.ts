// Ajustes de cada persona: asignaturas, horario, categorías de Moodle y palabras del dinosaurio.
// Es un único documento JSON (así se podrá guardar tal cual en un archivo cuando Aula viva en Drive).
// Este módulo es puro: lo usan el servidor (validar, Moodle) y el navegador (pantallas y asistente).

export type Subject={
  id:string;        // clave interna: la llevan las clases y los eventos guardados. No cambia nunca.
  short:string;     // abreviatura que se ve (DINT, PSP…)
  name:string;
  color:string;     // #rrggbb, suave
  teacher:string;
  archive:boolean;  // sale en «Mis asignaturas» y se pueden guardar clases suyas
  moodle:string[];  // categorías de Moodle que le corresponden (dam_ps, ps…)
  words:string[];   // otras formas de llamarla para el dinosaurio (odoo, moviles…)
};
export type Period={start:number;end:number;break?:boolean}; // minutos desde las 0:00
// days: cuántos días tiene la semana de clase (5 = de lunes a viernes, 6 = hasta el sábado, 7 = toda).
export type Settings={version:1;course:string;days:number;subjects:Subject[];periods:Period[];week:string[][]};

export const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export const PALETTE=['#d1e5fa','#e4daf9','#d9e9d4','#fae3c4','#f9dce3','#d3e9e8','#f3ead0','#ece6dc','#e3e6f3','#f6d9c9','#dde8c6','#e8d8ee'];

const S=(id:string,short:string,name:string,color:string,teacher:string,archive:boolean,moodle:string[],words:string[]):Subject=>({id,short,name,color,teacher,archive,moodle,words});
// Ejemplo completo (un 2º de DAM): lo usan las pruebas y el asistente cuando no recibe ajustes.
// Quien empieza de cero recibe EMPTY_SETTINGS.
export const DEFAULT_SETTINGS:Settings={version:1,course:'2º DAM · 2026–2027',days:5,
  subjects:[
    S('DINT','DINT','Desarrollo de interfaces','#d1e5fa','',true,['di','dint'],['deint','interfaces','interfaz','diseno de interfaces']),
    S('PSP','PSP','Programación de servicios y procesos','#e4daf9','',true,['ps','psp'],['servicios y procesos','programacion de servicios','procesos']),
    S('OPTA','OPTA','Backends','#d9e9d4','',true,['opt','opta'],['backend','optativa']),
    S('ACDAT','ACDAT','Acceso a datos','#fae3c4','',true,['ad','acdat'],['ad','acceso datos']),
    S('PMDM','PMDM','Programación multimedia','#f9dce3','',true,['pmdm'],['multimedia','moviles','dispositivos moviles']),
    S('SGEM','SGEM','Sistemas de gestión empresarial','#d3e9e8','',true,['sge','sgem'],['sge','gestion empresarial','sistemas de gestion','odoo']),
    S('ING','ING','Inglés','#f3ead0','',false,['ing'],['english']),
    S('IPE','IPE','Itinerario personal II','#ece6dc','',false,['ipe'],['itinerario','empleabilidad']),
    S('PROY','PROY','Proyecto','#e3e6f3','',false,['pim','proy'],[]),
  ],
  periods:[{start:495,end:555},{start:555,end:615},{start:615,end:675},{start:675,end:705,break:true},{start:705,end:765},{start:765,end:825},{start:825,end:885}],
  week:[
    ['PMDM','PMDM','ACDAT','','IPE','PSP','PSP'],
    ['DINT','DINT','PMDM','','ACDAT','ACDAT','PSP'],
    ['OPTA','OPTA','OPTA','','ING','ACDAT','IPE'],
    ['DINT','DINT','ING','','SGEM','SGEM','IPE'],
    ['DINT','DINT','SGEM','','SGEM','PROY','PROY'],
  ],
};

// Para alguien que empieza de cero: sin asignaturas y con unas franjas típicas que puede cambiar.
export const EMPTY_SETTINGS:Settings={version:1,course:'',days:5,subjects:[],
  periods:[{start:480,end:535},{start:535,end:590},{start:590,end:645},{start:645,end:675,break:true},{start:675,end:730},{start:730,end:785},{start:785,end:840}],
  week:Array.from({length:5},()=>Array(7).fill(''))};

// ---------- Validación (el servidor no guarda nada que no pase por aquí) ----------
const str=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const list=(v:unknown,max:number)=>Array.isArray(v)?[...new Set(v.map(x=>str(x,40).toLowerCase()).filter(Boolean))].slice(0,max):[];
export const isId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,20}$/.test(v);
// Devuelve los ajustes limpios o un mensaje de error pensado para la persona.
export function validate(raw:any):{settings:Settings}|{error:string}{
  if(!raw||typeof raw!=='object')return {error:'Ajustes no válidos.'};
  const subjects:Subject[]=[],ids=new Set<string>();
  if(!Array.isArray(raw.subjects)||raw.subjects.length>30)return {error:'Puedes tener hasta 30 asignaturas.'};
  for(const s of raw.subjects){
    if(!isId(s?.id)||ids.has(s.id))return {error:'Hay una asignatura repetida o sin clave.'};
    const short=str(s.short,8),name=str(s.name,60);
    if(!short||!name)return {error:'Cada asignatura necesita un nombre y una abreviatura.'};
    const color=/^#[0-9a-f]{6}$/i.test(s.color)?s.color.toLowerCase():PALETTE[subjects.length%PALETTE.length];
    ids.add(s.id);subjects.push({id:s.id,short,name,color,teacher:str(s.teacher,80),archive:s.archive!==false,moodle:list(s.moodle,20),words:list(s.words,20)});
  }
  const shorts=subjects.map(s=>s.short.toLowerCase());
  if(new Set(shorts).size!==shorts.length)return {error:'Dos asignaturas tienen la misma abreviatura.'};
  if(!Array.isArray(raw.periods)||raw.periods.length>14)return {error:'El horario puede tener hasta 14 franjas.'};
  const periods:Period[]=[];
  for(const p of raw.periods){
    const start=Number(p?.start),end=Number(p?.end);
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>1440||start>=end)return {error:'Revisa las horas del horario: cada franja tiene que empezar antes de acabar.'};
    if(periods.length&&start<periods[periods.length-1].end)return {error:'Las franjas del horario se pisan o no están en orden.'};
    periods.push(p.break?{start,end,break:true}:{start,end});
  }
  const days=[5,6,7].includes(raw.days)?raw.days:5;
  const week=DAYS.slice(0,days).map((_,d)=>periods.map((p,i)=>{const v=raw.week?.[d]?.[i];return !p.break&&typeof v==='string'&&ids.has(v)?v:''}));
  return {settings:{version:1,course:str(raw.course,60),days,subjects,periods,week}};
}
// Para leer lo guardado: si algo no cuadra, mejor lo de siempre que una pantalla rota.
export function parseSettings(json:string|null|undefined,fallback:Settings=DEFAULT_SETTINGS):Settings{
  if(!json)return fallback;
  try{const r=validate(JSON.parse(json));return 'settings' in r?r.settings:fallback}catch{return fallback}
}
// Clave nueva a partir de la abreviatura (solo al crear la asignatura).
export function newId(short:string,taken:string[]){
  const base=(short.normalize('NFD').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,14))||'ASIG';
  let id=base,n=2;while(taken.includes(id))id=base+n++;return id;
}

// ---------- Lo que se calcula a partir de los ajustes ----------
export const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
export const hhmm=(m:number)=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0');
// Un bloque del día: horas seguidas de la misma asignatura, un recreo o un hueco libre.
export type Block={code?:string;free?:boolean;start:number;end:number;from:number;to:number};
export type Plan=ReturnType<typeof makePlan>;

export function makePlan(settings:Settings){
  const {subjects,periods,week}=settings,days=DAYS.slice(0,settings.days??5);
  const byId=new Map(subjects.map(s=>[s.id,s]));
  const info=(id:string)=>byId.get(id);
  const short=(id:string)=>byId.get(id)?.short??id;
  const name=(id:string)=>byId.get(id)?.name??id;
  const color=(id:string)=>byId.get(id)?.color;

  // Junta las horas seguidas de la misma asignatura (sin saltarse el recreo).
  const blocks=days.map((_,day)=>{
    const out:Block[]=[];
    periods.forEach((p,i)=>{
      const last=out[out.length-1];
      if(p.break){out.push({start:p.start,end:p.end,from:i,to:i});return}
      const code=week[day]?.[i]||'';
      if(last&&!periods[last.to].break&&last.end===p.start&&(code?last.code===code:last.free)){last.end=p.end;last.to=i;return}
      out.push(code?{code,start:p.start,end:p.end,from:i,to:i}:{free:true,start:p.start,end:p.end,from:i,to:i});
    });
    // Lo que se enseña de un día: de la primera clase a la última.
    const a=out.findIndex(b=>b.code),z=out.length-1-[...out].reverse().findIndex(b=>b.code);
    return a<0?[]:out.slice(a,z+1);
  });
  const fullBlocks=(day:number)=>blocks[day]??[];
  const hasClass=(day:number)=>day>=0&&day<days.length&&fullBlocks(day).length>0;
  const dayStart=(day:number)=>fullBlocks(day)[0]?.start??0;
  const dayEnd=(day:number)=>{const b=fullBlocks(day);return b[b.length-1]?.end??0};
  // Siguiente día con clase después de «day» (0 = lunes). -1 si el horario está vacío.
  const nextSchoolDay=(day:number)=>{for(let i=1;i<=7;i++){const d=(day+i)%7;if(hasClass(d))return d}return -1};

  // Para el asistente: formas de nombrar cada asignatura (sin tildes, en minúsculas).
  const esc=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Además, cada palabra distintiva del nombre («multimedia», «interfaces») si no sale en otra asignatura.
  const GENERIC=new Set(['programacion','desarrollo','sistemas','lenguaje','lenguajes','fundamentos','introduccion','tecnologia','tecnologias','aplicaciones','proyecto','modulo','basico','avanzado','personal','general']);
  const nameWords=(s:Subject)=>[...new Set(norm(s.name).split(/[^a-z0-9ñ]+/).filter(w=>w.length>=5&&!GENERIC.has(w)))];
  const wordCount=new Map<string,number>();for(const s of subjects)for(const w of nameWords(s))wordCount.set(w,(wordCount.get(w)??0)+1);
  const aliases:[string,string][]=subjects.map(s=>{
    const forms=[...new Set([s.short,s.name,s.id,...s.words,...nameWords(s).filter(w=>wordCount.get(w)===1)].map(w=>norm(w).replace(/\s+/g,' ').trim()).filter(w=>w.length>=2))].sort((a,b)=>b.length-a.length);
    return [s.id,forms.map(esc).join('|')];
  });
  const vocab=[...new Set(subjects.flatMap(s=>[s.short,s.name,s.id,...s.words]).flatMap(w=>norm(w).split(/[^a-z0-9ñ]+/)).filter(w=>w.length>=4))];

  // Moodle: categoría («dam_ps») → asignatura. Vale la categoría entera o lo que va tras el último «_».
  const cats=new Map<string,string>();for(const s of subjects)for(const c of s.moodle)cats.set(c,s.id);
  const subjectOf=(category:string)=>{const c=category.trim().toLowerCase();if(!c)return '';const tail=c.slice(c.lastIndexOf('_')+1);return cats.get(c)??cats.get(tail)??tail.toUpperCase().slice(0,20)};

  return {settings,days,subjects,archiveSubjects:subjects.filter(s=>s.archive),periods,week,info,short,name,color,
    blocksOf:fullBlocks,hasClass,dayStart,dayEnd,nextSchoolDay,aliases,vocab,subjectOf};
}
export const DEFAULT_PLAN=makePlan(DEFAULT_SETTINGS);

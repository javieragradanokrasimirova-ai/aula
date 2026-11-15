// Asistente de Aula sin IA: entiende frases en español sobre tus clases, tu calendario y tu
// horario, aunque estén escritas a la ligera (faltas, abreviaturas, varias fechas a la vez…).
// Todo ocurre en el navegador; no se envía nada a ningún servicio.
import {kindOf,type Item,type Lesson} from './types';
import {DAYS,DEFAULT_PLAN,hhmm,norm,type Plan} from './settings';
import {dayOf,due,isTodo,keyOf,type CalEvent} from './ics';

export type Kind='audio'|'image'|'doc';
export type Action='search'|'download'|'open'|'stats'|'help'|'greet'|'thanks'|'tasks'|'schedule'|'add';
export type Range={from?:string;to?:string};
export type Query={action:Action;subjects:string[];topic?:string;ranges:Range[];dateLabel?:string;kinds:Kind[];words:string[];groups:string[][];
  pick?:'latest'|'oldest';count?:number;index?:number;mentionsAdded:boolean;followUp:boolean;
  exam?:boolean;done?:boolean;ask?:'now'|'next'|'leave'|'enter'|'day'|'when';time?:string;title?:string};
export type Proposal={title:string;start:string;allDay:boolean;kind:'task'|'exam'|'event';subject:string;when:string};
export type Answer={query:Query;text:string;lessons:Lesson[];files:Item[];bytes:number;label?:string;tasks?:CalEvent[];add?:Proposal;suggestions?:string[];similar?:boolean;mood?:'happy'|'sad'|'worried'|'celebrate'};
// plan: los ajustes de la persona (asignaturas, horario…). Sin él, los de siempre.
export type Data={lessons:Lesson[];files:Item[];events?:CalEvent[];plan?:Plan};

// ---------- Texto ----------
// norm (minúsculas y sin tildes) está en settings.ts.
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MONTH_RE='(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';
const monthIndex=(m:string)=>m==='setiembre'?8:MONTHS.indexOf(m);
const WEEKDAYS=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const WEEKDAY_SHOWN=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const NUMBERS:Record<string,number>={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
const ORDINALS:Record<string,number>={primera:0,primero:0,segunda:1,segundo:1,tercera:2,tercero:2,cuarta:3,cuarto:3,quinta:4,quinto:4,sexta:5,sexto:5};

// Abreviaturas y formas de escribir rápido (ya sin tildes: «mñn» queda «mnn»).
const SHORT:Record<string,string>={q:'que',k:'que',ke:'que',xq:'porque',pq:'porque',tb:'tambien',tmb:'tambien',mnn:'manana',mn:'manana',mna:'manana',mana:'manana',
  finde:'fin de semana',d:'de',dl:'del',xa:'para',pa:'para',sem:'semana',ult:'ultima',ults:'ultimas',clas:'clase',ex:'examen',exam:'examen',examn:'examen',
  xfa:'',porfa:'',pls:'',plis:'',please:'',profe:'profesor',tarde:'tarde',hrs:'horas',hr:'hora',min:'minutos',pdfs:'pdf',fotitos:'fotos',audioss:'audios'};
// Palabras que el asistente conoce: si escribes una parecida (una o dos letras de diferencia), se corrige.
// Las de tus asignaturas se añaden desde los ajustes.
const KEYWORDS=('descarga descargar descargame descargamelas descargalas bajame bajalas abre abrir abreme clase clases audio audios foto fotos imagen imagenes documento documentos apuntes '+
  'grabacion grabaciones pizarra semana pasada pasado ayer anteayer hoy manana mes ultima ultimas ultimo ultimos primera primeras primero primeros dia dias tema sobre entre desde hasta '+
  MONTHS.join(' ')+' '+WEEKDAYS.join(' ')+' examen examenes entrega entregas tarea tareas deberes pendiente pendientes horario recreo ahora despues siguiente '+
  'proxima salgo entro termino acabo empiezo ocupa ocupan cuanto cuantas cuantos ayuda hola gracias apunta apuntame anade anademe recuerdame calendario hechas toca tengo').split(' ');
// Palabras normales que se parecen a alguna de las anteriores y no hay que tocar.
const COMMON=new Set('dino dinosaurio cuando donde como quien anadi subi puse guarde meti subido subida subidas tengan tenga tienes tiene tienen hora horas dia dias mes meses dime dame mira busca buscar esta este esto todo todas todos quiero puedes cosas cosa algo hecho hoja nota notas pasa paso toco tocan semanas proximo proximas vale'.split(' '));
type Keys={list:string[];set:Set<string>};
const keysCache=new WeakMap<Plan,Keys>();
const keysOf=(plan:Plan):Keys=>{let k=keysCache.get(plan);if(!k){const list=[...new Set([...KEYWORDS,...plan.vocab])];k={list,set:new Set(list)};keysCache.set(plan,k)}return k};

// Distancia entre dos palabras (letras cambiadas, de más, de menos o intercambiadas).
export function distance(a:string,b:string){
  if(a===b)return 0;if(Math.abs(a.length-b.length)>2)return 9;
  const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){const c=a[i-1]===b[j-1]?0:1;d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1)}
  return d[a.length][b.length];
}
const tolerance=(w:string)=>w.length>=8?2:w.length>=4?1:0;
function correct(w:string,keys:Keys,vocab?:Set<string>){
  if(w.length<4||keys.set.has(w)||COMMON.has(w)||vocab?.has(w)||/\d/.test(w))return w;
  let best=w,score=9;for(const k of keys.list){const s=distance(w,k);if(s<score&&s<=tolerance(k)){best=k;score=s}}return best;
}
export function clean(input:string,vocab?:Set<string>,plan:Plan=DEFAULT_PLAN){
  const keys=keysOf(plan);
  let q=norm(input).replace(/(\D)\1{2,}/g,'$1').replace(/[¿?¡!;()…]/g,' ').replace(/(?<!\d):|:(?!\d)/g,' ').replace(/\.(\s|$)/g,' ').replace(/,/g,' y ').replace(/\s+/g,' ').trim();
  // Las comillas se respetan (sirven para temas exactos); el resto, palabra a palabra.
  q=q.split(' ').map(t=>{const m=t.match(/^(["«“']?)([a-zñ]+)(["»”']?)$/);if(!m)return t;const s=SHORT[m[2]];const w=s!==undefined?s:correct(m[2],keys,vocab);return m[1]+w+m[3]}).join(' ');
  return ' '+q.replace(/\s+/g,' ').trim()+' ';
}

// ---------- Fechas ----------
const iso=keyOf; // «2026-11-04», fecha local
const day=(y:number,m:number,d:number)=>new Date(y,m,d,12);
const addDays=(d:Date,n:number)=>day(d.getFullYear(),d.getMonth(),d.getDate()+n);
const longDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long'});
const weekdayOf=(s:string)=>WEEKDAY_SHOWN[new Date(s+'T12:00:00').getDay()];

// Sin año: para tus clases, la fecha más reciente que no quede en el futuro (el curso cruza dos años);
// para el calendario, la próxima.
function resolveYear(m:number,d:number,now:Date,future:boolean,year?:string){
  if(year)return day(Number(year.length===2?'20'+year:year),m,d);
  const c=day(now.getFullYear(),m,d);
  if(future)return c<addDays(now,-60)?day(now.getFullYear()+1,m,d):c;
  return c>addDays(now,1)?day(now.getFullYear()-1,m,d):c;
}
type Found={start:number;end:number;dates:Date[];span?:boolean};
function findDates(q:string,now:Date,future:boolean):Found[]{
  const out:Found[]=[];const taken=(i:number)=>out.some(o=>i>=o.start&&i<o.end);
  const add=(m:RegExpMatchArray,dates:Date[],span=false)=>{const d=dates.filter(x=>!isNaN(+x));if(d.length&&!taken(m.index!))out.push({start:m.index!,end:m.index!+m[0].length,dates:d,span})};
  for(const m of q.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g))add(m,[day(+m[1],+m[2]-1,+m[3])]);
  // «3, 5 y 7 de noviembre» (lista) o «del 3 al 7 de noviembre» (intervalo).
  for(const m of q.matchAll(new RegExp(`\\b(\\d{1,2})((?:\\s*(?:y|e|o|al|a|hasta)\\s*(?:el\\s+|del\\s+)?\\d{1,2})*)\\s+de\\s+${MONTH_RE}(?:\\s+(?:de|del)\\s+(\\d{4}))?`,'g'))){
    const nums=[m[1],...(m[2].match(/\d{1,2}/g)??[])].map(Number),mi=monthIndex(m[3]),span=/\b(al|a|hasta)\b/.test(m[2])&&nums.length===2;
    add(m,nums.map(n=>resolveYear(mi,n,now,future,m[4])),span)}
  for(const m of q.matchAll(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/g))add(m,[resolveYear(+m[2]-1,+m[1],now,future,m[3])]);
  return out.sort((a,b)=>a.start-b.start);
}

// ---------- Entender la frase ----------
// Las asignaturas (y sus otros nombres) salen de los ajustes: plan.aliases.
type Opts={vocab?:Set<string>;plan?:Plan};
export function parse(input:string,now=new Date(),opts:Opts={}):Query{
  const plan=opts.plan??DEFAULT_PLAN;
  let q=clean(input,opts.vocab,plan);
  const has=(re:RegExp)=>re.test(q);
  const eat=(re:RegExp)=>{const m=q.match(re);if(m)q=q.replace(re,' ');return m};
  const query:Query={action:'search',subjects:[],ranges:[],kinds:[],words:[],groups:[],mentionsAdded:has(/\b(anadi|subi|puse|guarde|meti)\b/),followUp:false};

  // Saludos y agradecimientos sueltos.
  const bare=q.replace(/\b(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ey|holi|dino|dinosaurio|oye|amigo)\b/g,' ').trim();
  if(!bare&&q.trim())return {...query,action:'greet'};
  if(/^(muchas |mil )?(gracias|thx|thanks|genial|perfecto|vale|ok|okey|guay|top|crack|eres un crack|buenisimo|eres el mejor)( (crack|tio|maquina|majo))?$/.test(bare))return {...query,action:'thanks'};
  q=' '+bare+' ';

  // Seguimiento de la respuesta anterior: «descárgalas», «ábrela», «la segunda», «y las de PSP?», «solo los audios».
  const ord=q.match(/\b(?:abre\s+|abreme\s+)?(?:la|el)\s+(primera|primero|segunda|segundo|tercera|tercero|cuarta|cuarto|quinta|quinto|sexta|sexto)\b(?!\s+clases?\s+de)/);
  if(ord&&q.trim().split(' ').length<=4){query.index=ORDINALS[ord[1]];query.action='open';query.followUp=true;return query}
  if(has(/\b(descarga(la|lo)s?|descargame(la|lo)s?|baja(la|lo)s?|bajame(la|lo)s?|descargalas todas)\b/)){query.action='download';query.followUp=true}
  if(has(/\b(abrela|abrelo|abremela|abremelo)\b/)){query.action='open';query.followUp=true}
  if(has(/^ (y|e|pero|solo|tambien|ahora|y si|y de|y del|y las|y los) /))query.followUp=true;

  // ¿Qué quieres? Tu horario, tu calendario o tus clases guardadas.
  const lessonsTalk=has(/\b(clases? (guardadas?|grabadas?|subidas?)|grabacion|grabaciones|audios?|fotos?|imagen(es)?|pizarras?|documentos?|apuntes|pdf|zip|archivos?)\b/)||has(/\b(descarg|baja(r|me)?\b|abre|abrir|abreme)/);
  if(!query.followUp||query.action==='search'){
    if(has(/\b(ayuda|que (puedes|sabes) hacer|como funcionas|que haces|que entiendes|comandos|ejemplos)\b/)||!q.trim())query.action='help';
    else if(has(/\b(apunta|apuntame|anade|anademe|agrega|agregame|recuerdame|crea(me)?|ponme)\b/)&&!lessonsTalk)query.action='add';
    else if(!lessonsTalk&&has(/\b(horario|recreo|ahora|siguiente clase|proxima clase|(que|cual|cuales)( clases?| asignaturas?) (tengo|toca|tocan|hay)|que (me )?toca|toca despues|que tengo (ahora|despues|luego)|a que hora (salgo|entro|termino|acabo|empiezo|empiezan|terminan|acaban)|cuando (salgo|entro|termino|acabo|empiezo|tengo))\b/)&&!has(/\b(entregas?|tareas?|deberes|examen(es)?|pendientes?)\b/))query.action='schedule';
    else if(!lessonsTalk&&has(/\b(entregas?|entregar|tareas?|deberes|examen(es)?|pendientes?|vence|vencen|calendario|hechas|que tengo|tengo algo|que hay (para|hoy|manana|esta|este|el))\b/)&&!has(/\b(tema|sobre)\b/))query.action='tasks';
    else if(has(/\b(cuanto (ocupa|ocupan|pesa|pesan)|cuanto espacio|cuantas clases|cuantos archivos|tamano)\b/))query.action='stats';
    else if(has(/\b(descarg\w*|bajar\w*|bajame|baja|zip|exporta\w*)\b/))query.action='download';
    else if(has(/\b(abre|abrir|abreme|llevame|ensename la|muestrame la|ir a)\b/))query.action='open';
  }
  const future=query.action==='tasks'||query.action==='add'||query.action==='schedule';
  if(query.action==='tasks'){query.exam=has(/\bexamen(es)?\b/)&&!has(/\b(entregas?|tareas?)\b/);query.done=has(/\bhechas?\b/)}
  if(query.action==='schedule')query.ask=has(/\b(salgo|termino|acabo|terminan|acaban)\b/)?'leave':has(/\b(entro|empiezo|empiezan)\b/)?'enter':has(/\b(siguiente|proxima|despues|luego)\b/)?'next':has(/\bahora\b/)?'now':'day';

  // Cuántas: «las 3 últimas», «la última», «las dos primeras».
  const pick=q.match(/\b(?:las?|los?)?\s*(?:(\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)?(ultim[oa]s?|mas recientes?|primer[oa]s?|mas antigu[oa]s?)(?:\s+(\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez))?\b/);
  if(pick&&!(future&&/primer/.test(pick[2]))&&!/\bultimos \S+ dias\b/.test(q)){const n=pick[1]??pick[3];query.pick=/ultim|reciente/.test(pick[2])?'latest':'oldest';query.count=n?(NUMBERS[n]??Number(n)):/s$/.test(pick[2])?3:1;q=q.replace(pick[0],' ')}

  // Tema: «tema Hilos», «tema "hilos y procesos"», «sobre hilos».
  const quoted=q.match(/\b(?:tema|sobre)\s+(?:de\s+)?["«“']([^"»”']+)["»”']/);
  if(quoted){query.topic=quoted[1].trim();q=q.replace(quoted[0],' ')}
  else{const m=q.match(/\b(?:con\s+(?:el\s+)?)?(?:tema|sobre)\s+(?:de\s+|del\s+)?(.+)$/);
    if(m){const stop=new Set(['de','del','en','y','que','con','desde','hasta','entre','el','la','los','las','esta','este','ayer','hoy','para','por','antes','despues','manana']);
      const words:string[]=[];for(const w of m[1].trim().split(' ')){if(stop.has(w)||/\d/.test(w)||MONTHS.includes(w)||WEEKDAYS.includes(w))break;words.push(w)}
      if(words.length){query.topic=words.join(' ');q=q.replace(m[0],' '+m[1].trim().split(' ').slice(words.length).join(' ')+' ')}}}

  // Asignaturas.
  for(const [code,alias] of plan.aliases){if(!alias)continue;const re=new RegExp(`\\b(${alias})\\b`,'g');if(re.test(q)){if(!query.subjects.includes(code))query.subjects.push(code);q=q.replace(re,' ')}}

  // Tipos de archivo.
  for(const [kind,re] of [['audio',/\b(audios?|grabacion(es)?|grabaciones)\b/g],['image',/\b(fotos?|imagen(es)?|pizarras?)\b/g],['doc',/\b(documentos?|pdfs?|apuntes)\b/g]] as const)
    if(re.test(q)){query.kinds.push(kind);q=q.replace(re,' ')}

  // Hora («a las 10», «a las 10:30») para los eventos que añades.
  const t=q.match(/\ba las (\d{1,2})(?::|h|\.)?(\d{2})?\b/);if(t){query.time=`${t[1].padStart(2,'0')}:${t[2]??'00'}`;q=q.replace(t[0],' ')}

  // Fechas: concretas, listas, intervalos y expresiones como «ayer», «mañana» o «esta semana».
  const labels:string[]=[];const range=(from:Date|undefined,to:Date|undefined,label:string)=>{query.ranges.push({from:from&&iso(from),to:to&&iso(to)});labels.push(label)};
  const found=findDates(q,now,future);
  for(let i=0;i<found.length;i++){
    const f=found[i],next=found[i+1],before=q.slice(Math.max(0,f.start-14),f.start);
    if(f.span){const [a,b]=f.dates;range(a,b,`del ${longDate(iso(a))} al ${longDate(iso(b))}`);continue}
    if(next&&f.dates.length===1&&next.dates.length===1&&/\b(entre|del?|desde)\s*(el\s*)?$/.test(before)&&/^\s*(y el|y|al|a|hasta el|hasta)\s*$/.test(q.slice(f.end,next.start))){
      const [a,b]=f.dates[0]<=next.dates[0]?[f.dates[0],next.dates[0]]:[next.dates[0],f.dates[0]];range(a,b,`entre el ${longDate(iso(a))} y el ${longDate(iso(b))}`);i++;continue}
    if(f.dates.length===1&&/\b(desde|despues|a partir)\b/.test(before)){range(f.dates[0],undefined,`desde el ${longDate(iso(f.dates[0]))}`);continue}
    if(f.dates.length===1&&/\b(hasta|antes)\b/.test(before)){range(undefined,f.dates[0],`hasta el ${longDate(iso(f.dates[0]))}`);continue}
    for(const d of f.dates)range(d,d,`del ${longDate(iso(d))}`);
  }
  for(const f of [...found].reverse())q=q.slice(0,f.start)+' '+q.slice(f.end);
  const today=day(now.getFullYear(),now.getMonth(),now.getDate()),monday=addDays(today,-((today.getDay()+6)%7));
  const rel:[RegExp,()=>void][]=[
    [/\banteayer\b/,()=>range(addDays(today,-2),addDays(today,-2),'de anteayer')],
    [/\bpasado manana\b/,()=>range(addDays(today,2),addDays(today,2),'de pasado mañana')],
    [/\bayer\b/,()=>range(addDays(today,-1),addDays(today,-1),'de ayer')],
    [/\bhoy\b/,()=>range(today,today,'de hoy')],
    [/\bmanana\b/,()=>range(addDays(today,1),addDays(today,1),'de mañana')],
    [/\b(la )?semana pasada\b/,()=>range(addDays(monday,-7),addDays(monday,-1),'de la semana pasada')],
    [/\b(la )?(semana que viene|proxima semana|siguiente semana)\b/,()=>range(addDays(monday,7),addDays(monday,13),'de la semana que viene')],
    [/\b(este )?fin de semana\b/,()=>range(addDays(monday,5),addDays(monday,6),'de este fin de semana')],
    [/\b(esta|de esta|en esta|toda la|toda esta) semana\b/,()=>future?range(today,addDays(monday,6),'de esta semana'):range(monday,today,'de esta semana')],
    [/\b(el )?mes pasado\b/,()=>range(day(today.getFullYear(),today.getMonth()-1,1),day(today.getFullYear(),today.getMonth(),0),'del mes pasado')],
    [/\b(el )?(mes que viene|proximo mes)\b/,()=>range(day(today.getFullYear(),today.getMonth()+1,1),day(today.getFullYear(),today.getMonth()+2,0),'del mes que viene')],
    [/\b(este|de este|en este) mes\b/,()=>future?range(today,day(today.getFullYear(),today.getMonth()+1,0),'de este mes'):range(day(today.getFullYear(),today.getMonth(),1),today,'de este mes')],
  ];
  for(const [re,fn] of rel)if(eat(re))fn();
  const lastDays=q.match(/\b(?:los )?ultimos (\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) dias\b/);
  if(lastDays){const n=NUMBERS[lastDays[1]]??Number(lastDays[1]);range(addDays(today,-n+1),today,`de los últimos ${n} días`);q=q.replace(lastDays[0],' ')}
  for(const m of [...q.matchAll(new RegExp(`\\b${MONTH_RE}(?:\\s+(?:de|del)\\s+(\\d{4}))?\\b`,'g'))]){const mi=monthIndex(m[1]),s=resolveYear(mi,1,now,future,m[2]);range(s,day(s.getFullYear(),mi+1,0),`de ${MONTHS[mi]}`);q=q.replace(m[0],' ')}
  // Días de la semana (uno o varios): para clases, el último que ha pasado; para el calendario, el próximo.
  for(const w of [...q.matchAll(/\b(?:el |este |del )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)( pasado| que viene| proximo)?\b/g)]){
    const target=WEEKDAYS.indexOf(w[1]);let d:Date;
    if(future&&!/pasado/.test(w[2]??'')){const ahead=(target-today.getDay()+7)%7;d=addDays(today,ahead+(/viene|proximo/.test(w[2]??'')&&ahead===0?7:0))}
    else{const back=(today.getDay()-target+7)%7||(w[2]?7:0);d=addDays(today,-back)}
    range(d,d,`del ${WEEKDAY_SHOWN[target]} ${longDate(iso(d))}`);q=q.replace(w[0],' ')}
  if(labels.length)query.dateLabel=labels.length<=3?labels.join(labels.length===2?' y ':', ').replace(/, ([^,]*)$/,' y $1'):`de ${labels.length} fechas`;

  // Lo que queda: palabras sueltas (en grupos separados por «y», «o»).
  const STOP=new Set(('a al algo alguna algun asi cada cual cuales de del donde el ella en es esa ese eso esta este esto estos estas la las le lo los me mi mis muy no o para pero por que se sin su sus te tu tus un una uno unos unas y e ya yo con todo toda todos todas '+
    'hay tengo tengan tenga tienen tiene tenia clase clases archivo archivos material buscame busca buscar busqueda encuentra encuentrame encontrar muestrame ensename dame dime quiero ver lista listar puedes podrias '+
    'favor porfa gracias anadi subi puse guarde meti descargame descarga descargar descargas bajame baja bajar zip abre abrir abreme llevame ir cuanto cuantos cuantas ocupa ocupan espacio pesa pesan solo solamente tambien '+
    'entre desde hasta antes despues partir guardadas guardada grabadas subidas necesito saber cual cuales cuando pasame pasa enviame manda mandame hazme haz quisiera me podrias seria otra vez '+
    'descargala descargalas descargalo descargalos descargamela descargamelas descargamelo descargamelos bajala bajalas bajalos bajamelas bajamelos abrela abrelo abremela abremelo ahora si pero').split(' '));
  const content=(s:string)=>s.split(/[^a-z0-9ñ]+/).filter(w=>w.length>=3&&!STOP.has(w));
  if(query.action==='add'){
    // Lo que queda es el título del evento: «apúntame repasar hilos el viernes» → «Repasar hilos».
    const title=q.replace(/\b(apunta|apuntame|anade|anademe|agrega|agregame|recuerdame|creame|crea|ponme|en el calendario|al calendario|calendario|una|un|la|el|que|tengo que|para|de)\b/g,' ').replace(/\b(tarea|recordatorio|evento|entrega)\b/g,' ').replace(/\s+/g,' ').trim();
    query.exam=has(/\bexamen\b/);query.title=title;
  }
  query.groups=q.split(/\s(?:y|o|e)\s(?:la|el|las|los)?\s*(?:de|del)?\s*/).map(content).filter(g=>g.length);
  query.words=query.groups.flat();
  return query;
}

// ---------- Respuestas ----------
const kindWord:Record<Kind,string>={audio:'audios',image:'fotos',doc:'documentos'};
const fmt=(n:number)=>!n?'0 MB':n>=1e9?(n/1e9).toFixed(2)+' GB':n>=1e6?(n/1e6).toFixed(1)+' MB':Math.max(1,Math.round(n/1000))+' KB';
const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const cap=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
export function describe(q:Query,plan:Plan=DEFAULT_PLAN){
  const subj=q.subjects.map(plan.short);
  return [subj.length?'de '+subj.join(' y '):'',q.topic?`con tema «${q.topic}»`:'',q.dateLabel??'',q.words.length?`que mencionan «${q.words.join(' ')}»`:''].filter(Boolean).join(' ');
}
const tokens=(s:string)=>norm(s).split(/[^a-z0-9ñ]+/).filter(Boolean);
// Una palabra coincide aunque esté a medias («sincro») o con alguna errata («sincronizacon»).
const wordIn=(w:string,toks:string[])=>toks.some(t=>t===w||(w.length>=4&&t.includes(w))||(w.length>=5&&distance(w,t)<=tolerance(w)));

export const EXAMPLES=['¿Qué tengo esta semana?','Descárgame las clases del 27 y 29 de octubre','Las 3 últimas clases de DINT','¿Qué clase tengo ahora?','Audios de PSP de este mes','Apúntame repasar hilos el viernes'];
// Los ejemplos, con tus propias asignaturas.
export function examplesFor(plan:Plan){
  const [a,b]=plan.archiveSubjects.length?plan.archiveSubjects:plan.subjects;
  return EXAMPLES.filter(e=>a||!/DINT|PSP/.test(e)).map(e=>e.replace('DINT',a?.short??'').replace('PSP',(b??a)?.short??''));
}

export function greeting(now=new Date()){const h=now.getHours();return h<6?'¿Estudiando a estas horas? 🌙':h<14?'¡Buenos días!':h<21?'¡Buenas tardes!':'¡Buenas noches!'}

export function answer(input:string,data:Data,ctx?:Answer|null,now=new Date()):Answer{
  const {lessons,files}=data,events=data.events??[],plan=data.plan??DEFAULT_PLAN;
  const byLesson=new Map<string,Item[]>();for(const f of files){const a=byLesson.get(f.lesson);if(a)a.push(f);else byLesson.set(f.lesson,[f])}
  // Las palabras de tus clases y tareas no se «corrigen»: son tuyas.
  const vocab=new Set<string>();for(const l of lessons)for(const w of tokens(`${l.title} ${l.topic} ${l.notes}`))vocab.add(w);for(const f of files)for(const w of tokens(f.name))vocab.add(w);for(const e of events)for(const w of tokens(e.title))vocab.add(w);
  let query=parse(input,now,{vocab,plan});
  const base={lessons:[] as Lesson[],files:[] as Item[],bytes:0};

  // Seguimiento de lo anterior.
  if(ctx&&query.followUp&&['search','download','open','stats'].includes(ctx.query.action)){
    if(query.index!==undefined){const l=ctx.lessons[query.index];if(!l)return {query,...base,text:`Antes solo te enseñé ${plural(ctx.lessons.length,'clase','clases')}.`,mood:'sad'};
      return {query,...base,lessons:[l],files:byLesson.get(l.id)??[],text:`Abriendo «${l.title}».`,mood:'happy'}}
    const p=ctx.query,fresh=(a:unknown[])=>a.length>0;
    query={...p,action:query.action==='search'?p.action:query.action,subjects:fresh(query.subjects)?query.subjects:p.subjects,kinds:fresh(query.kinds)?query.kinds:p.kinds,
      ranges:fresh(query.ranges)?query.ranges:p.ranges,dateLabel:fresh(query.ranges)?query.dateLabel:p.dateLabel,topic:query.topic??p.topic,
      words:fresh(query.words)?query.words:p.words,groups:fresh(query.groups)?query.groups:p.groups,pick:query.pick??p.pick,count:query.count??p.count,followUp:true};
    if(query.action==='open'&&ctx.lessons.length===1)return {query,...base,lessons:ctx.lessons,files:[],text:`Abriendo «${ctx.lessons[0].title}».`,mood:'happy'};
  }else if(query.followUp&&query.index!==undefined)query={...query,action:'search',followUp:false};

  switch(query.action){
    case 'greet':{const pending=events.filter(e=>isTodo(e)&&!e.done&&due(e,now).level==='urgent');
      return {query,...base,text:`${greeting(now)} ${pending.length?`Ojo: ${pending.length===1?`«${pending[0].title}» vence ${due(pending[0],now).text.toLowerCase()}`:`tienes ${pending.length} entregas para hoy o mañana`}. `:''}¿En qué te ayudo?`,suggestions:examplesFor(plan).slice(0,4),mood:pending.length?'worried':'happy'}}
    case 'thanks':return {query,...base,text:['¡De nada! Aquí sigo si necesitas algo más. 🦕','¡A mandar!','¡Para eso estoy!'][input.length%3],mood:'happy'};
    case 'help':return {query,...base,text:'Te ayudo con tus clases guardadas, tu calendario y tu horario. Puedes escribir como te salga, aunque sea con faltas. Por ejemplo:',suggestions:examplesFor(plan)};
    case 'schedule':return schedule(query,now,plan);
    case 'tasks':return tasks(query,events,now,plan);
    case 'add':return addEvent(query,now,plan);
  }

  const lessonSubjects=query.subjects,shown=lessonSubjects.map(plan.short);
  const match=(l:Lesson,topicIn:'topic'|'any',mode:'all'|'any')=>{const fs=byLesson.get(l.id)??[];
    const toks=tokens([l.title,l.topic,l.notes,...fs.map(f=>f.name)].join(' '));
    const words=mode==='all'?[query.words]:query.groups;
    return (!lessonSubjects.length||lessonSubjects.includes(l.subject))
      &&(!query.topic||norm(topicIn==='topic'?l.topic:`${l.topic} ${l.title} ${l.notes}`).includes(norm(query.topic)))
      &&(!query.ranges.length||query.ranges.some(r=>(!r.from||l.date>=r.from)&&(!r.to||l.date<=r.to)))
      &&(!query.kinds.length||fs.some(f=>query.kinds.includes(kindOf(f))))
      &&(!query.words.length||words.some(g=>g.every(w=>wordIn(w,toks))))};
  let found=lessons.filter(l=>match(l,'topic','all')),widened=false;
  // «La de hilos y la de sockets»: si no hay ninguna con todo, vale cualquiera de los grupos.
  if(!found.length&&query.groups.length>1)found=lessons.filter(l=>match(l,'topic','any'));
  // Si nadie tiene ese tema exacto, se busca también en títulos y notas.
  if(!found.length&&query.topic){found=lessons.filter(l=>match(l,'any','all'));widened=found.length>0}
  found.sort((a,b)=>b.date.localeCompare(a.date));
  if(query.pick==='latest')found=found.slice(0,query.count??1);else if(query.pick==='oldest')found=found.slice(-(query.count??1)).reverse();
  const chosen=found.flatMap(l=>(byLesson.get(l.id)??[]).filter(f=>!query.kinds.length||query.kinds.includes(kindOf(f))));
  // El tema se muestra tal como lo escribiste en la clase («Hilos»), no en minúsculas.
  const shownTopic=query.topic&&(found.map(l=>l.topic).find(t=>norm(t)===norm(query.topic!))??cap(query.topic));
  const size=chosen.reduce((s,f)=>s+f.size,0),what=describe({...query,topic:shownTopic||undefined},plan),note=query.mentionsAdded&&query.dateLabel?' (busco por la fecha de la clase)':'';
  const widenedNote=widened?` Ninguna tenía exactamente ese tema; te enseño las que lo mencionan en el título o las notas.`:'';
  if(!found.length){
    // Nada exacto: se ofrecen las clases más parecidas a lo que has escrito.
    if(query.words.length){const scored=lessons.map(l=>{const toks=tokens(`${l.title} ${l.topic}`);let s=0;for(const w of query.words){const best=Math.min(...toks.map(t=>distance(w,t)));if(best<=2)s+=3-best}return {l,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,4).map(x=>x.l);
      if(scored.length)return {query,...base,lessons:scored,similar:true,text:`No he encontrado nada exacto${what?' '+what:''}. ¿Buscabas alguna de estas?`}}
    const hint=query.subjects.length&&lessons.some(l=>lessonSubjects.includes(l.subject))?`Sí tienes clases de ${shown.join(' y ')}: prueba sin la fecha.`:'Prueba con otra fecha o escribe solo la asignatura o una palabra del título.';
    return {query,...base,text:`No he encontrado clases${what?' '+what:''}${note}. ${hint}`,mood:'sad',suggestions:query.subjects.length?[`Clases de ${shown[0]}`]:undefined};
  }
  const head=`${plural(found.length,'clase','clases')}${what?' '+what:''}${note}`;
  if(query.action==='stats'){const all=found.flatMap(l=>byLesson.get(l.id)??[]);
    return {query,lessons:found,files:all,bytes:all.reduce((s,f)=>s+f.size,0),text:`${cap(head)}: ${plural(all.length,'archivo','archivos')} · ${fmt(all.reduce((s,f)=>s+f.size,0))}.`,mood:'happy'}}
  if(query.action==='download'){
    if(!chosen.length)return {query,lessons:found,files:[],bytes:0,text:`He encontrado ${head}, pero no tienen ${query.kinds.map(k=>kindWord[k]).join(' ni ')} que descargar.`,mood:'sad'};
    return {query,lessons:found,files:chosen,bytes:size,label:what,mood:'happy',text:`He encontrado ${head}.${widenedNote} Son ${plural(chosen.length,'archivo','archivos')}${query.kinds.length?` (solo ${query.kinds.map(k=>kindWord[k]).join(' y ')})`:''} · ${fmt(size)}. Pulsa para descargarlos en un ZIP con una carpeta por clase.`};
  }
  if(query.action==='open'&&found.length===1)return {query,lessons:found,files:chosen,bytes:size,text:`Abriendo «${found[0].title}».`,mood:'happy'};
  return {query,lessons:found,files:chosen,bytes:size,mood:'happy',text:`He encontrado ${head}.${widenedNote}${query.action==='open'?' Elige cuál abrir:':found.length>1?' Si quieres, dime «descárgalas» o «abre la primera».':''}`};
}

// ---------- Calendario ----------
function tasks(query:Query,events:CalEvent[],now:Date,plan:Plan):Answer{
  const base={lessons:[] as Lesson[],files:[] as Item[],bytes:0};
  const today=keyOf(now),subs=query.subjects,names=subs.map(plan.short);
  // Las palabras que no aparecen en ninguna tarea («próximo», «algo»…) no filtran.
  const ws=query.words.filter(w=>!/^(entregas?|entregar|tareas?|deberes|examen(es)?|pendientes?|vence|vencen|calendario|hechas?|algo|cosas?|tengo|toca|proxim[oa]s?|siguientes?)$/.test(w)&&events.some(e=>wordIn(w,tokens(e.title))));
  const onlyNext=/\b(proxim[oa]|siguiente)\b/.test(norm(query.words.join(' ')))&&!query.ranges.length;
  const inRange=(e:CalEvent)=>{const d=dayOf(e);return query.ranges.length?query.ranges.some(r=>(!r.from||d>=r.from)&&(!r.to||d<=r.to)):d>=today};
  let list=events.filter(e=>isTodo(e)&&(query.done?!!e.done:!e.done)&&(!query.exam||e.kind==='exam')&&(!subs.length||subs.includes(e.subject))&&inRange(e)&&ws.every(w=>wordIn(w,tokens(e.title))));
  if(!query.ranges.length&&!query.done)list=list.filter(e=>due(e,now).level!=='late');
  list.sort((a,b)=>a.start.localeCompare(b.start));
  if(onlyNext)list=list.slice(0,1);
  const what=query.exam?'exámenes':'entregas y exámenes',subj=subs.length?` de ${names.join(' y ')}`:'',when=query.dateLabel?' '+query.dateLabel.replace(/^de hoy$/,'para hoy').replace(/^de mañana$/,'para mañana'):'';
  if(!events.length)return {query,...base,text:'Todavía no tengo tu calendario. Conecta Moodle en la sección Calendario y te diré qué tienes pendiente.',mood:'sad'};
  // Si preguntas por un día concreto, también te digo qué clases tienes ese día.
  const r=query.ranges[0],single=query.ranges.length===1&&r.from&&r.from===r.to?r.from:null;
  const dayClasses=single?classesOn(single,plan):'';
  if(!list.length){
    const late=events.filter(e=>isTodo(e)&&!e.done&&due(e,now).level==='late'&&dayOf(e)>=keyOf(new Date(now.getTime()-14*864e5))).length;
    return {query,...base,text:`No tienes ${query.done?(query.exam?'exámenes hechos':'tareas hechas'):what}${subj}${when}. 🎉${dayClasses?' '+dayClasses:''}${late&&!query.ranges.length?` Eso sí: tienes ${plural(late,'tarea vencida','tareas vencidas')} sin marcar.`:''}`,mood:'happy'};
  }
  const urgent=list.some(e=>due(e,now).level==='urgent');
  if(list.length===1&&query.exam){const e=list[0],d=dayOf(e),t=e.allDay?'':' a las '+new Date(e.start).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    return {query,...base,tasks:list,text:`${subs.length?`El examen de ${names.join(' y ')}`:'Tu próximo examen'} es el ${weekdayOf(d)} ${longDate(d)}${t}: «${e.title}».`,mood:urgent?'worried':undefined}}
  return {query,...base,tasks:list.slice(0,8),text:`${query.done?'Has hecho':'Tienes'} ${plural(list.length,query.exam?'examen':'entrega',query.exam?'exámenes':'cosas')}${subj}${when}${list.length>8?' (te enseño las 8 primeras)':''}${dayClasses?'. '+dayClasses:':'}`,mood:urgent?'worried':'happy'};
}
function addEvent(query:Query,now:Date,plan:Plan):Answer{
  const base={lessons:[] as Lesson[],files:[] as Item[],bytes:0};
  const raw=query.title?.trim()??'',subject=query.subjects[0]??'',label=subject?plan.short(subject):'';
  const rest=query.exam?raw.replace(/\bexamen(es)?\b/g,' ').replace(/\s+/g,' ').trim():raw;
  const title=query.exam?`Examen${label?' de '+label:''}${rest?': '+rest:''}`:cap(rest);
  if(!title)return {query,...base,text:'¿Qué quieres que apunte? Por ejemplo: «apúntame repasar hilos el viernes» o «añade examen de PSP el 20 de noviembre».',mood:'sad'};
  const date=query.ranges[0]?.from??query.ranges[0]?.to??iso(now);
  const start=query.time?new Date(`${date}T${query.time}`).toISOString():date;
  const when=`el ${weekdayOf(date)} ${longDate(date)}${query.time?' a las '+query.time.replace(/^0/,''):''}`;
  const kind=query.exam?'exam':'task';
  return {query,...base,add:{title,start,allDay:!query.time,kind,subject,when},text:`¿Apunto ${kind==='exam'?'el examen':'la tarea'} «${title}»${label?` (${label})`:''} para ${when}?`};
}

// ---------- Horario ----------
function classesOn(k:string,plan:Plan){
  const d=new Date(k+'T12:00:00'),wd=(d.getDay()+6)%7;
  if(!plan.hasClass(wd))return `El ${weekdayOf(k)} no hay clase.`;
  const list=plan.blocksOf(wd).filter(b=>b.code).map(b=>`${hhmm(b.start)} ${plan.short(b.code!)}`).join(' · ');
  return `Ese día tienes clase de ${hhmm(plan.dayStart(wd))} a ${hhmm(plan.dayEnd(wd))}: ${list}.`;
}
function schedule(query:Query,now:Date,plan:Plan):Answer{
  const base={lessons:[] as Lesson[],files:[] as Item[],bytes:0},{blocksOf,dayStart,dayEnd,short,info}=plan;
  if(plan.nextSchoolDay(0)<0)return {query,...base,text:'Todavía no has puesto tu horario. Puedes rellenarlo en Ajustes.',mood:'sad'};
  const wd=(now.getDay()+6)%7,min=now.getHours()*60+now.getMinutes(),school=plan.hasClass(wd);
  const name=(c:string)=>{const i=info(c);return i&&i.name!==i.short?`${i.short} (${i.name})`:short(c)};
  const teacher=(c:string)=>info(c)?.teacher?` con ${info(c)!.teacher}`:'';
  const r=query.ranges[0],target=r?.from&&r.from===r.to?r.from:null;
  const subs=query.subjects.filter(c=>info(c));
  // «¿Cuándo tengo PSP?»: días y horas de esa asignatura.
  if(subs.length&&!target){const c=subs[0],slots:string[]=[];
    for(let d=0;d<plan.days.length;d++)for(const b of blocksOf(d))if(b.code===c)slots.push(`${DAYS[d].toLowerCase()} de ${hhmm(b.start)} a ${hhmm(b.end)}`);
    return {query,...base,text:slots.length?`${name(c)} la tienes ${slots.join(', ').replace(/, ([^,]*)$/,' y $1')}${teacher(c)&&','+teacher(c)}.`:`${short(c)} no está en tu horario.`}}
  if(target){const d=new Date(target+'T12:00:00'),w=(d.getDay()+6)%7;
    if(!plan.hasClass(w))return {query,...base,text:`El ${weekdayOf(target)} no tienes clase. ¡A descansar! 😴`};
    const list=blocksOf(w).filter(b=>b.code).map(b=>`${hhmm(b.start)}–${hhmm(b.end)} ${short(b.code!)}`).join(' · ');
    return {query,...base,text:query.ask==='leave'?`El ${weekdayOf(target)} sales a las ${hhmm(dayEnd(w))}.`:query.ask==='enter'?`El ${weekdayOf(target)} entras a las ${hhmm(dayStart(w))}, con ${name(blocksOf(w)[0].code!)}.`:`El ${weekdayOf(target)}: ${list}.`}}
  if(!school||min>=dayEnd(wd)){const next=plan.nextSchoolDay(wd),label=next===(wd+1)%7?'mañana':'el '+DAYS[next].toLowerCase();
    const first=blocksOf(next)[0];
    return {query,...base,text:query.ask==='leave'?`${school?'Hoy ya has salido. ':''}${cap(label)} sales a las ${hhmm(dayEnd(next))}.`:`${school?'Por hoy ya no tienes más clases.':'Hoy no hay clase.'} ${cap(label)} empiezas a las ${hhmm(dayStart(next))} con ${name(first.code!)}.`}}
  const start=dayStart(wd),end=dayEnd(wd);
  const blocks=blocksOf(wd),cur=blocks.find(b=>min>=b.start&&min<b.end),next=blocks.find(b=>b.code&&b.start>=(cur?.end??min)&&b!==cur);
  if(query.ask==='leave')return {query,...base,text:`Hoy sales a las ${hhmm(end)}${min>=start?`; te quedan ${Math.floor((end-min)/60)} h ${(end-min)%60} min`:''}.`};
  if(query.ask==='enter')return {query,...base,text:`Hoy entras a las ${hhmm(start)}, con ${name(blocks[0].code!)}.`};
  if(query.ask==='next')return {query,...base,text:next?`Después tienes ${name(next.code!)} a las ${hhmm(next.start)}${teacher(next.code!)&&','+teacher(next.code!)}.`:'Esta es la última clase del día. ¡Ya casi!'};
  if(min<start)return {query,...base,text:`Todavía no has entrado: hoy empiezas a las ${hhmm(start)} con ${name(blocks[0].code!)}.`};
  if(cur&&!cur.code)return {query,...base,text:`Estás ${cur.free?'en una hora libre':'en el recreo'} hasta las ${hhmm(cur.end)}. Luego toca ${next?name(next.code!):'salir'}.`};
  if(cur?.code)return {query,...base,text:`Ahora tienes ${name(cur.code)}${teacher(cur.code)}, hasta las ${hhmm(cur.end)}.${next?` Después, ${short(next.code!)} a las ${hhmm(next.start)}.`:' Es la última del día.'}`};
  return {query,...base,text:classesOn(iso(now),plan)};
}

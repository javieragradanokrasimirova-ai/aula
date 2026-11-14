// Prueba aislada del asistente (sin IA): frases en español → lo que entiende → lo que responde.
// Usa clases y tareas ficticias parecidas a las reales y una fecha fija: miércoles 4 de noviembre de 2026, 10:00.
import ts from 'typescript';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
mkdirSync('.test-runtime',{recursive:true});
const tr=f=>ts.transpile(readFileSync(f,'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}).replace(/from '\.\/(types|settings|ics)'/g,"from './$1.mjs'");
for(const m of ['types','settings','ics','assistant'])writeFileSync(`.test-runtime/${m}.mjs`,tr(`src/${m}.ts`));
const {parse,answer}=await import('../.test-runtime/assistant.mjs');
const now=new Date(2026,10,4,10);
const L=(id,subject,title,date,topic='',notes='')=>({id,subject,title,date,topic,notes});
const lessons=[L('a','PSP','Comenzamos hilos','2026-10-27','Hilos'),L('b','DINT','Remodelación login StarWars','2026-10-27'),L('c','DINT','Continuación de star wars','2026-10-29'),
  L('d','DINT','Star Wars y que caera en examen','2026-10-30','','Entra JavaFX'),L('e','DINT','Metemos mas cosas a StarWars','2026-11-03'),L('f','PSP','Sincronización','2026-11-02','Hilos y procesos'),L('g','ACDAT','Ficheros','2026-03-10','Ficheros')];
const F=(id,lesson,name,type,size)=>({id,lesson,name,type,size});
const files=[F(1,'a','PSP 27_10_2026.m4a','audio/x-m4a',34e6),F(2,'b','DEINT 27_10.m4a','audio/x-m4a',23e6),F(3,'b','20261027_0900.jpg','image/jpeg',3e6),F(4,'d','DEINT 30_10_26.m4a','audio/x-m4a',99e6),
  F(5,'d','20261030_090034.jpg','image/jpeg',2.9e6),F(6,'f','apuntes.pdf','application/pdf',1e6),F(7,'e','DEINT 3_11_26.m4a','audio/x-m4a',84e6)];
const E=(id,subject,title,start,kind='task',done=0)=>({id,uid:null,subject,title,start,end:null,allDay:0,kind,priority:1,done,description:''});
const events=[E('x1','PSP','Tarea 2.2 Banco','2026-11-05T22:41:00Z'),E('x2','DINT','Examen Tema 3: Interfaces','2026-11-19T07:15:00Z','exam'),E('x3','PROY','Entrega anteproyecto','2026-11-13T20:00:00Z'),E('x4','PSP','Tarea vieja','2026-11-01T22:00:00Z')];
const data={lessons,files,events};
let n=0;const ask=(q,ctx)=>answer(q,data,ctx,now);
const check=(q,want,extra,ctx)=>{n++;const a=ask(q,ctx);assert.equal(a.lessons.map(l=>l.id).sort().join(','),want,`«${q}» → ${JSON.stringify(parse(q,now))}`);extra?.(a);return a};
const say=(q,re,extra,ctx)=>{n++;const a=ask(q,ctx);assert.match(a.text,re,`«${q}» → «${a.text}» ${JSON.stringify(a.query)}`);extra?.(a);return a};

// Los dos ejemplos originales
check('me descargas todas las clases que tengan de tema "Hilos"?','a,f',a=>{assert.equal(a.query.action,'download');assert.equal(a.files.length,2)});
check('me puedes buscar todas las clases que añadí el 27 de octubre?','a,b',a=>{assert.equal(a.query.action,'search');assert.match(a.text,/fecha de la clase/)});
// Temas
check('clases con tema hilos','a,f',a=>assert.match(a.text,/tema «Hilos»/));check('tema "hilos y procesos"','f');check('clases sobre ficheros','g');
check('tema examen','d',a=>assert.match(a.text,/título o las notas/));
// Asignaturas
check('clases de PSP','a,f');check('Desarrollo de interfaces','b,c,d,e');check('todo lo de acceso a datos','g');check('backends','');
// Fechas
check('27/10','a,b');check('2026-10-29','c');check('ayer','e');check('anteayer','f');check('esta semana','e,f');check('la semana pasada','a,b,c,d');
check('clases de octubre','a,b,c,d');check('en marzo','g');check('entre el 28 de octubre y el 2 de noviembre','c,d,f');check('desde el 30 de octubre','d,e,f');
check('hasta el 27 de octubre','a,b,g');check('el martes','e');check('el viernes','d');
// Tipos y combinaciones
check('audios de DEINT de esta semana','e');check('fotos del 30 de octubre','d');check('descárgame los audios de DEINT','b,d,e',a=>{assert.equal(a.files.length,3);assert.ok(a.files.every(f=>f.type.startsWith('audio')))});
check('documentos','f');check('pdf de psp','f');
// Palabras sueltas, última y primera
check('star wars','b,c,d,e');check('javafx','d');check('abre la última clase de PSP','f',a=>{assert.equal(a.query.action,'open');assert.match(a.text,/Abriendo/)});
check('la primera clase de DEINT','b');
// Estadísticas, ayuda y nada encontrado
check('¿cuánto ocupa DEINT?','b,c,d,e',a=>{assert.equal(a.query.action,'stats');assert.match(a.text,/211\.9 MB/)});
check('ayuda','',a=>assert.equal(a.query.action,'help'));check('clases de PMDM de mayo','',a=>assert.match(a.text,/No he encontrado/));
// Sin año: una fecha posterior a hoy se entiende del curso pasado (para clases)
assert.equal(parse('el 10 de diciembre',now).ranges[0].from,'2025-12-10');assert.equal(parse('10/03',now).ranges[0].from,'2026-03-10');

// --- Nuevo: varias fechas y varias clases a la vez ---
check('descarga las clases del 27 y del 29 de octubre','a,b,c',a=>assert.equal(a.query.action,'download'));
check('27/10 y 2/11','a,b,f');check('del 27 al 30 de octubre','a,b,c,d');check('clases del lunes y del martes','e,f');
check('las 3 ultimas clases de deint','c,d,e');check('las dos primeras de deint','b,c');
check('la de hilos y la de javafx','a,d,f');check('clases de los ultimos 3 dias','e,f');
// --- Nuevo: faltas, abreviaturas y palabras a medias ---
check('decargame los audos de dient','b,d,e',a=>assert.equal(a.query.action,'download'));check('clases de interfases','b,c,d,e');
check('sincro','f');check('sincronizacon','f');check('audios d psp','a');check('las clasess de ayerr','e');check('DEsArRoLLo dE InTeRfAcEs!!!','b,c,d,e');
// --- Nuevo: seguir la conversación ---
const prev=ask('clases de deint');
check('descargalas','b,c,d,e',a=>{assert.equal(a.query.action,'download');assert.equal(a.files.length,5)},prev);
check('y las de psp?','a,f',undefined,prev);check('solo los audios','b,d,e',undefined,prev);
check('abre la segunda','d',a=>assert.match(a.text,/Abriendo/),prev);
// Si no hay nada exacto, propone lo más parecido
say('clases de sockets',/No he encontrado/);say('remodelasion',/clase/,a=>assert.equal(a.lessons[0].id,'b'));
// --- Nuevo: saludos ---
say('hola',/Buenos días/,a=>{assert.equal(a.query.action,'greet');assert.match(a.text,/Tarea 2\.2/)});say('gracias!!',/nada|mandar|estoy/);
// --- Nuevo: horario (miércoles 10:00 → optativa) ---
say('¿qué clase tengo ahora?',/OPTA/);say('a que hora salgo',/14:45/);say('que toca despues',/ING/);
say('horario del viernes',/8:15–10:15 DINT/);say('cuando tengo psp',/lunes de 12:45 a 14:45/);say('q tengo mñn',/Tarea 2\.2|Ese día tienes clase/);
// --- Nuevo: calendario ---
say('que tengo esta semana',/Tienes 1/,a=>assert.deepEqual(a.tasks.map(t=>t.id),['x1']));
say('cuando es el examen de dint',/jueves 19 de noviembre/);say('entregas de mañana',/Ese día tienes clase/,a=>assert.equal(a.tasks.length,1));
say('que tengo el lunes',/No tienes/);say('tareas de proyecto',/PROY/,a=>assert.deepEqual(a.tasks.map(t=>t.id),['x3']));
say('tengo algo pendiente?',/Tienes 3/);
// --- Nuevo: añadir al calendario ---
say('apuntame repasar hilos el viernes',/Repasar hilos/,a=>{assert.equal(a.add.start,'2026-11-06');assert.equal(a.add.allDay,true);assert.equal(a.add.kind,'task')});
say('añade examen de psp el 20 de noviembre a las 10',/Examen de PSP/,a=>{assert.equal(a.add.kind,'exam');assert.equal(a.add.allDay,false);assert.equal(new Date(a.add.start).getHours(),10)});
console.log(`PASS asistente: ${n} frases entendidas como se esperaba`);

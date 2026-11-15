// Pruebas del núcleo de Aula abierta (sin navegador ni Google): operaciones sobre aula.json,
// el almacén con un adaptador en memoria y la importación del ZIP de «Exportar todo».
import ts from 'typescript';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
mkdirSync('.test-runtime',{recursive:true});
globalThis.__env={VITE_MOODLE_PROXY:'https://proxy.test'};
const fix=t=>t.replace(/\(import\.meta as any\)\.env/g,'globalThis.__env').replace(/from '\.\/(types|settings|ics|doc|store|moodle|import|assistant)'/g,"from './$1.mjs'").replace(/^import \{createContext,useContext\} from 'react';$/m,'const createContext=()=>null,useContext=()=>null;');
for(const m of ['types','settings','ics','doc','store','moodle','import','assistant'])writeFileSync(`.test-runtime/${m}.mjs`,ts.transpile(fix(readFileSync(`src/${m}.ts`,'utf8')),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}));
const D=await import('../.test-runtime/doc.mjs'),{Store}=await import('../.test-runtime/store.mjs'),I=await import('../.test-runtime/import.mjs'),S=await import('../.test-runtime/settings.mjs');

// ---------- Documento ----------
let doc=D.emptyDoc(S.DEFAULT_SETTINGS);
assert.throws(()=>D.saveLesson(doc,{title:'',subject:'PSP',date:'2026-11-02'}),D.UserError);
let r=D.saveLesson(doc,{title:'Hilos',subject:'PSP',date:'2026-11-02',topic:'Concurrencia'});doc=r.doc;const l1=r.id;
r=D.saveLesson(doc,{title:'Ficheros',subject:'ACDAT',date:'2026-11-03'});doc=r.doc;const l2=r.id;
doc=D.saveLesson(doc,{id:l1,title:'Hilos (bien)',subject:'PSP',date:'2026-11-02'}).doc;assert.equal(doc.lessons.find(l=>l.id===l1).title,'Hilos (bien)');
doc=D.addFile(doc,{id:'f1',lesson:l1,name:'a.m4a',type:'audio/mp4',size:10});doc=D.addFile(doc,{id:'f2',lesson:l2,name:'b.pdf',type:'application/pdf',size:5});
assert.throws(()=>D.addFile(doc,{id:'f3',lesson:'nope',name:'x',type:'',size:1}),/eliminado/);
doc=D.renameFile(doc,'f1','grabación.m4a');assert.equal(doc.files.find(f=>f.id==='f1').name,'grabación.m4a');
let del=D.deleteLesson(doc,l2);assert.deepEqual(del.removed.map(f=>f.id),['f2']);doc=del.doc;assert.equal(doc.files.length,1);
// Calendario: importar conserva tus marcas y quita lo futuro que Moodle ya no trae.
const y=new Date().getFullYear()+1;
const ev=(id,s,start,cat)=>`BEGIN:VEVENT\r\nUID:${id}\r\nSUMMARY:${s}\r\nDTSTART:${start}\r\nCATEGORIES:${cat}\r\nEND:VEVENT\r\n`,cal=(...e)=>'BEGIN:VCALENDAR\r\n'+e.join('')+'END:VCALENDAR\r\n';
r=D.importICS(doc,cal(ev('a','Vencimiento de Tarea 1',`${y}0110T220000Z`,'dam_ps'),ev('b','Examen tema 2',`${y}0111T080000Z`,'dam_di'),ev('c','Vencimiento de Vieja','20200101T100000Z','dam_ps'),ev('z','Vencimiento de Rara',`${y}0112T220000Z`,'dam_xyz')));
doc=r.doc;assert.equal(r.count,4);assert.ok(doc.moodle.importedAt);
const ta=doc.events.find(e=>e.uid==='a');assert.deepEqual([ta.kind,ta.subject,ta.priority],['task','PSP',1]);assert.equal(doc.events.find(e=>e.uid==='b').priority,2);
doc=D.markEvent(doc,{id:ta.id,priority:0,done:true});
doc=D.saveEvent(doc,{title:'Repasar',start:`${y}-01-09`,allDay:true,kind:'task',subject:'PSP',priority:2});
r=D.importICS(doc,cal(ev('a','Vencimiento de Tarea 1 (cambiada)',`${y}0110T220000Z`,'dam_ps')));doc=r.doc;
assert.deepEqual(doc.events.map(e=>e.uid??'propio').sort(),['a','c','propio'],'b y z (futuras) se quitan; c (pasada) y la propia se quedan');
const ta2=doc.events.find(e=>e.uid==='a');assert.deepEqual([ta2.id,ta2.title,ta2.priority,ta2.done],[ta.id,'Tarea 1 (cambiada)',0,1]);
assert.throws(()=>D.deleteEvent(doc,ta2.id),/añadido tú/);doc=D.deleteEvent(doc,doc.events.find(e=>!e.uid).id);
assert.throws(()=>D.importICS(doc,'hola'),/no es un calendario/);
// Ajustes: guardas y recolocación de tareas sueltas.
doc=D.importICS(doc,cal(ev('a','Vencimiento de T',`${y}0110T220000Z`,'dam_xyz'))).doc;assert.equal(doc.events.find(e=>e.uid==='a').subject,'XYZ');
const s2=JSON.parse(JSON.stringify(S.DEFAULT_SETTINGS));s2.subjects.find(s=>s.id==='PSP').moodle.push('xyz');
r=D.saveSettings(doc,s2);assert.equal(r.remapped,1);doc=r.doc;assert.equal(doc.events.find(e=>e.uid==='a').subject,'PSP');
const s3=JSON.parse(JSON.stringify(s2));s3.subjects=s3.subjects.filter(s=>s.id!=='PSP');assert.throws(()=>D.saveSettings(doc,s3),/clase guardada/);
assert.throws(()=>D.moveLessons(doc,'PSP','ING'),/Mis asignaturas/);r=D.moveLessons(doc,'PSP','DINT');assert.equal(r.moved,1);
// Un aula.json estropeado no rompe nada.
const n=D.normalizeDoc({lessons:[{id:'x',date:'mal'},{id:'y',date:'2026-01-01',title:5}],files:[{id:'q',lesson:'zz'}],events:[{id:1}],settings:{subjects:'no'}});
assert.deepEqual([n.lessons.length,n.lessons[0].title,n.files.length,n.events.length,n.settings.subjects.length],[1,'Sin título',0,0,0]);
assert.equal(D.normalizeDoc(null).lessons.length,0);

// ---------- Almacén con un adaptador en memoria ----------
let saved=null,writes=0;const blobs=new Map();
const mem={kind:'demo',user:{name:'Prueba'},read:async()=>saved&&structuredClone(saved),write:async d=>{await new Promise(r=>setTimeout(r,5));writes++;saved=structuredClone(d)},
  upload:async(file,meta,o)=>{o.onProgress(file.size);const id='b'+blobs.size;blobs.set(id,file);return id},remove:async id=>{blobs.delete(id)},blob:async id=>blobs.get(id),signOut:async()=>{}};
const st=new Store(mem);await st.load();assert.equal(st.doc.lessons.length,0);
await st.settings({action:'save',settings:S.DEFAULT_SETTINGS});
// Varios cambios a la vez: van en fila y no se pisan.
const ids=await Promise.all([1,2,3,4].map(i=>st.archive({action:'save',title:'C'+i,subject:'PSP',date:'2026-11-0'+i})));
assert.equal(saved.lessons.length,4);assert.equal(new Set(ids.map(x=>x.id)).size,4);
const file=new File(['x'.repeat(100)],'n.txt',{type:'text/plain'});
const item=await st.upload(file,ids[0].id,'text/plain',{signal:new AbortController().signal,onProgress(){}});
assert.equal(saved.files.length,1);assert.equal(blobs.size,1);
// Si la clase desaparece mientras se sube, el archivo subido se quita.
const slow={...mem,upload:async(f,m,o)=>{await st.archive({action:'deleteLesson',id:ids[1].id});return mem.upload(f,m,o)}};st.adapter=slow;
await assert.rejects(st.upload(file,ids[1].id,'text/plain',{signal:new AbortController().signal,onProgress(){}}),/eliminado/);assert.equal(blobs.size,1);st.adapter=mem;
await st.archive({action:'deleteLesson',id:ids[0].id});assert.equal(blobs.size,0,'al borrar la clase se borran sus archivos');
// Lo cambiado «en otro dispositivo» no se pierde: cada cambio parte de lo último guardado.
saved.lessons.push({id:'otro',subject:'PSP',title:'Desde el móvil',date:'2026-11-09',topic:'',notes:''});
await st.archive({action:'save',title:'Desde el PC',subject:'PSP',date:'2026-11-10'});
assert.ok(saved.lessons.some(l=>l.id==='otro')&&saved.lessons.some(l=>l.title==='Desde el PC'));
const c=await st.calendar({action:'import',ics:cal(ev('k','Vencimiento de K',`${y}0101T100000Z`,'dam_ps'))});assert.equal(c.imported,1);assert.ok(c.feed.importedAt);
// Moodle conectado: el enlace se comprueba, se descarga a través del intermediario y queda guardado.
assert.throws(()=>D.moodleURL('https://moodle.x/calendar/view.php'),D.UserError);
assert.throws(()=>D.moodleURL('https://moodle.x/calendar/export_execute.php?userid=1'),/authtoken/);
const LINK='https://moodle.x/calendar/export_execute.php?userid=1&authtoken=abc&preset_what=all';
const asked=[];globalThis.fetch=async(u,o)=>{asked.push([u,JSON.parse(o.body).url]);return new Response(cal(ev('m1','Tarea M1',`${y}0201T100000Z`,'dam_ps')),{status:200})};
const lk=await st.calendar({action:'link',url:LINK});assert.equal(lk.imported,1);assert.equal(lk.feed.auto,true);assert.equal(saved.moodle.url,LINK);assert.deepEqual(asked[0],['https://proxy.test',LINK]);
assert.ok(saved.events.some(e=>e.title==='Tarea M1'));
const sy=await st.calendar({action:'sync'});assert.equal(sy.imported,1);assert.equal(asked.length,2);
globalThis.fetch=async()=>new Response('Moodle no ha devuelto un calendario.',{status:422});
await assert.rejects(st.calendar({action:'sync'}),/no ha devuelto/);
await assert.rejects(st.calendar({action:'link',url:LINK.replace('abc','zzz')}),/no ha devuelto/);assert.equal(saved.moodle.url,LINK,'si el enlace nuevo falla, se queda el anterior');
const ul=await st.calendar({action:'unlink'});assert.equal(ul.feed.auto,false);assert.equal(saved.moodle.url,null);assert.ok(saved.events.some(e=>e.title==='Tarea M1'),'al desconectar, los eventos se quedan');
await assert.rejects(st.calendar({action:'sync'}),/ningún enlace/);
assert.equal(D.normalizeDoc({moodle:{url:'https://otro.x/robar'}}).moodle.url,null,'un enlace raro en aula.json no se conserva');

// ---------- Importar el ZIP de «Exportar todo» ----------
// ZIP sin compresión como los que genera Aula (aquí con el formato «en streaming»: tamaños al final).
function zip(entries){const enc=new TextEncoder(),parts=[],central=[];let off=0;
  for(const [name,data] of entries){const n=enc.encode(name),d=typeof data==='string'?enc.encode(data):data,h=Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0808,6);h.writeUInt16LE(n.length,26);const dd=Buffer.alloc(16);dd.writeUInt32LE(0x08074b50,0);dd.writeUInt32LE(d.length,8);dd.writeUInt32LE(d.length,12);
    parts.push(h,n,d,dd);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x0808,8);c.writeUInt32LE(d.length,20);c.writeUInt32LE(d.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(off,42);central.push(c,n);off+=30+n.length+d.length+16}
  const cd=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(off,16);
  return new Blob([...parts,cd,e])}
const audio=new Uint8Array(3000).map((_,i)=>i%251);
const manifest={format:'aula',version:2,settings:S.DEFAULT_SETTINGS,lessons:[{subject:'PSP',title:'Hilos',date:'2026-10-27',topic:'Hilos',notes:'n',files:[{name:'PSP 27.m4a',type:'audio/mp4',size:3000,path:'PSP/2026-10-27 Hilos/PSP 27.m4a'},{name:'falta.pdf',type:'application/pdf',size:1,path:'no/existe.pdf'}]}]};
const z=zip([['aula.json',JSON.stringify(manifest)],['PSP/2026-10-27 Hilos/PSP 27.m4a',audio]]);
const plan=await I.readExport(z);
assert.equal(plan.lessons.length,1);assert.equal(plan.lessons[0].files.length,1,'los archivos que no están en el ZIP se ignoran');assert.equal(plan.bytes,3000);assert.equal(plan.settings.subjects.length,9);
const b=await I.entryBlob(z,plan.entries.get('PSP/2026-10-27 Hilos/PSP 27.m4a'),'audio/mp4');assert.equal(b.size,3000);assert.deepEqual(new Uint8Array(await b.arrayBuffer()),audio);assert.equal(b.type,'audio/mp4');
await assert.rejects(I.readExport(zip([['otra.txt','x']])),/aula.json/);await assert.rejects(I.readExport(new Blob(['no soy un zip'])),/ZIP válido/);
// Alias: las palabras distintivas del nombre cuentan («multimedia»), las compartidas o genéricas no («programación»).
const A=await import('../.test-runtime/assistant.mjs');
const P2=S.makePlan(S.validate({version:1,course:'',days:5,periods:[],week:[],subjects:[{id:'PMDM',short:'PMDM',name:'Programación multimedia',color:'#d1e5fa',teacher:'',archive:true,moodle:[],words:[]},{id:'PSP',short:'PSP',name:'Programación de servicios',color:'#e4daf9',teacher:'',archive:true,moodle:[],words:[]}]}).settings);
assert.deepEqual(A.parse('examen de multimedia',new Date(2026,10,4),{plan:P2}).subjects,['PMDM']);
assert.deepEqual(A.parse('clases de servicios',new Date(2026,10,4),{plan:P2}).subjects,['PSP']);
assert.deepEqual(A.parse('clases de programacion',new Date(2026,10,4),{plan:P2}).subjects,[]);
console.log('PASS núcleo: documento (clases, archivos, calendario, ajustes), almacén en fila, subidas y borrados, importación del ZIP');

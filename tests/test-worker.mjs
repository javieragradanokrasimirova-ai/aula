// Pruebas del intermediario del calendario de Moodle (worker/moodle-ics.js), con Moodle simulado.
import assert from 'node:assert/strict';
const {default:worker}=await import('../worker/moodle-ics.js');
const AULA='https://javieragradanokrasimirova-ai.github.io',LINK='https://moodle.ejemplo.es/calendar/export_execute.php?userid=1&authtoken=abc';
const ICS='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
let moodle=()=>new Response(ICS),asked=[];
globalThis.fetch=async u=>{asked.push(u);return moodle()};
const call=(body,origin=AULA,method='POST')=>worker.fetch(new Request('https://aula-moodle.x.workers.dev/',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined}));

let r=await call({url:LINK});
assert.equal(r.status,200);assert.equal(await r.text(),ICS);assert.equal(r.headers.get('Access-Control-Allow-Origin'),AULA);assert.deepEqual(asked,[LINK]);
// Preflight del navegador.
r=await worker.fetch(new Request('https://x/',{method:'OPTIONS',headers:{Origin:AULA}}));assert.equal(r.status,204);
// Desde otra web, no.
r=await call({url:LINK},'https://otra-web.com');assert.equal(r.status,403);assert.equal(asked.length,1);
// Desarrollo local, sí.
r=await call({url:LINK},'http://127.0.0.1:5174');assert.equal(r.status,200);
// Solo enlaces de exportar el calendario, por https y a un nombre de servidor (no IPs ni puertos).
for(const bad of ['http://moodle.ejemplo.es/calendar/export_execute.php?a=1','https://moodle.ejemplo.es/admin/index.php','https://10.0.0.1/calendar/export_execute.php','https://localhost/calendar/export_execute.php','https://moodle.ejemplo.es:8080/calendar/export_execute.php','nada'])
  {r=await call({url:bad});assert.equal(r.status,400,bad)}
assert.equal(asked.length,2,'los enlaces malos ni se piden');
// Si Moodle devuelve otra cosa (la página de entrar, por ejemplo), no se reenvía.
moodle=()=>new Response('<html>Entrar</html>');r=await call({url:LINK});assert.equal(r.status,422);assert.match(await r.text(),/no ha devuelto un calendario/);
moodle=()=>new Response('error',{status:500});r=await call({url:LINK});assert.equal(r.status,502);
// Tope de tamaño.
moodle=()=>new Response('BEGIN:VCALENDAR\n'+'x'.repeat(6*1024*1024));r=await call({url:LINK});assert.equal(r.status,413);
console.log('PASS intermediario de Moodle: solo desde Aula, solo enlaces de calendario, solo calendarios, con tope de tamaño');

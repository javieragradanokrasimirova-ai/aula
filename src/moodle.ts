// Calendario de Moodle automático. Moodle no deja que otra web lea su calendario desde el navegador,
// así que se pide a través de un intermediario pequeño (worker/moodle-ics.js, en Cloudflare) que solo
// sabe descargar enlaces de «Exportar calendario» de Moodle y no guarda nada.
import {UserError} from './doc';

export const MOODLE_PROXY:string=(import.meta as any).env?.VITE_MOODLE_PROXY||'';
// Cada cuánto se vuelve a mirar Moodle mientras Aula está abierta (y al abrirla, si ha pasado más).
export const SYNC_EVERY=3*3600e3;

export async function fetchMoodle(url:string):Promise<string>{
  if(!MOODLE_PROXY)throw new UserError('La actualización automática no está configurada en esta copia de Aula. Sube el archivo .ics.');
  let r:Response;
  try{r=await fetch(MOODLE_PROXY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),cache:'no-store'})}
  catch{throw new UserError('No se ha podido conectar para traer tu calendario de Moodle. Revisa la conexión.')}
  const text=await r.text();
  if(!r.ok)throw new UserError(text.length<300&&text?text:'No se ha podido traer tu calendario de Moodle.');
  return text;
}

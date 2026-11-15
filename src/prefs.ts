// Preferencias pequeñas guardadas en este navegador (vista del horario, orden de pendientes…).
// Si el navegador no deja usar el almacenamiento (algunas ventanas privadas), Aula sigue igual.
// (drive.ts guarda el permiso de Google por su cuenta: las pruebas lo cargan sin este archivo.)
type Area='local'|'session';
const area=(a:Area)=>a==='session'?sessionStorage:localStorage;

// null si no hay nada guardado; undefined si el navegador no deja leerlo.
export function readPref(key:string,a:Area='local'):string|null|undefined{try{return area(a).getItem(key)}catch{return undefined}}
// null borra la preferencia.
export function writePref(key:string,value:string|null,a:Area='local'){try{if(value===null)area(a).removeItem(key);else area(a).setItem(key,value)}catch{}}

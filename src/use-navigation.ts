// Navegación de Aula con el historial del navegador: cada clase abierta, el calendario, Ajustes y el visor
// son entradas del historial, así el botón «atrás» del móvil vuelve donde estabas. También abre lo que
// diga la dirección al entrar (#calendario, #ajustes o el id de una clase).
import {useEffect,useState} from 'react';
import type {Item} from './types';

export type Section='archive'|'calendar'|'settings';
// hasLesson: si existe la clase de la dirección (solo se mira al entrar).
export function useNavigation(hasLesson:(id:string)=>boolean){
  const [selected,setSelected]=useState<string|null>(null),[dir,setDir]=useState(0),[section,setSection]=useState<Section>('archive');
  const [viewer,setViewer]=useState<{items:Item[];start:number}|null>(null);
  useEffect(()=>{
    const sync=()=>{const s=history.state as {lesson?:string;viewer?:boolean;calendar?:boolean;settings?:boolean}|null;setDir(-1);setSelected(s?.lesson??null);setSection(s?.calendar?'calendar':s?.settings?'settings':'archive');if(!s?.viewer)setViewer(null)};
    addEventListener('popstate',sync);
    const id=decodeURIComponent(location.hash.slice(1));
    if(id==='calendario'){history.replaceState(null,'',location.pathname);history.pushState({calendar:true},'','#calendario');setSection('calendar')}
    else if(id==='ajustes'){history.replaceState(null,'',location.pathname);history.pushState({settings:true},'','#ajustes');setSection('settings')}
    else if(id&&hasLesson(id)){history.replaceState(null,'',location.pathname);history.pushState({lesson:id},'','#'+id);setSelected(id)}
    return()=>removeEventListener('popstate',sync);
  },[]);
  const openLesson=(id:string)=>{history.pushState({lesson:id},'','#'+id);setDir(1);setSelected(id);setSection('archive');scrollTo({top:0})};
  const openCalendar=()=>{if(section==='calendar'&&!selected)return;history.pushState({calendar:true},'','#calendario');setDir(1);setSelected(null);setSection('calendar');scrollTo({top:0})};
  const openSettings=()=>{if(section==='settings'&&!selected)return;history.pushState({settings:true},'','#ajustes');setDir(1);setSelected(null);setSection('settings');scrollTo({top:0})};
  const backToList=()=>{setDir(-1);if(history.state?.lesson)history.back();else setSelected(null)};
  const openViewer=(items:Item[],start:number)=>{history.pushState({lesson:selected,viewer:true},'');setViewer({items,start})};
  const closeViewer=()=>{if(history.state?.viewer)history.back();else setViewer(null)};
  // Ir a la lista de clases desde cualquier sitio. No se usa «atrás»: si antes estuviste en otra sección,
  // el historial te devolvería allí (p. ej. de Ajustes al Calendario).
  const goHome=()=>{history.pushState(null,'',location.pathname+location.search);setDir(-1);setSelected(null);setSection('archive');scrollTo({top:0})};
  return {selected,dir,section,viewer,openLesson,openCalendar,openSettings,backToList,openViewer,closeViewer,goHome};
}

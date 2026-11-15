// Datos del calendario para toda la web (la portada, el dinosaurio y la vista del calendario): eventos,
// marcar hechas o su importancia al instante y la sincronización automática con Moodle.
import {useCallback,useEffect,useState} from 'react';
import {MOODLE_PROXY,SYNC_EVERY} from './moodle';
import {useStore,type CalendarAction,type CalendarState as State} from './store';

// feed: cuándo importaste por última vez el calendario de Moodle (null si nunca) y si se actualiza solo.
export type Feed=State['feed'];

// Datos del calendario (salen del mismo aula.json que lo demás).
export function useCalendar(){
  const store=useStore(),call=(b:CalendarAction)=>store.calendar(b);
  const [state,setState]=useState<State|null>(()=>store.calendarState()),[syncing,setSyncing]=useState(false);
  const run=useCallback(async(body:CalendarAction)=>{const d=await call(body);if(d.events)setState({events:d.events,feed:d.feed??null});return d},[store]);
  // Cambio al instante en pantalla; si falla, se deshace.
  const mark=useCallback(async(id:string,patch:{priority?:number;done?:boolean})=>{
    let before:State|null=null;
    setState(s=>{before=s;return s&&{...s,events:s.events.map(e=>e.id===id?{...e,...('priority' in patch?{priority:patch.priority!}:{}),...('done' in patch?{done:patch.done?1:0}:{})}:e)}});
    try{await call({action:'mark',id,...patch})}catch(e){setState(before);throw e}
  },[]);
  const reload=useCallback(async()=>{setState(store.calendarState())},[store]);
  // Moodle conectado: se trae solo al abrir Aula (si hace más de 3 h) y cada 3 h mientras está abierta.
  const [syncError,setSyncError]=useState('');
  const sync=useCallback(async(quiet=false)=>{
    setSyncing(true);if(!quiet)setSyncError('');
    try{const d=await run({action:'sync'});setSyncError('');return d}catch(e){setSyncError((e as Error).message);if(!quiet)throw e}finally{setSyncing(false)}
  },[run]);
  useEffect(()=>{
    let busy=false;
    const check=()=>{const m=store.doc.moodle;if(busy||!m.url||!MOODLE_PROXY||document.visibilityState!=='visible')return;
      if(m.importedAt&&Date.now()-Date.parse(m.importedAt)<SYNC_EVERY)return;
      busy=true;sync(true).finally(()=>{busy=false})};
    const first=setTimeout(check,2500),t=setInterval(check,10*60e3);document.addEventListener('visibilitychange',check);
    return()=>{clearTimeout(first);clearInterval(t);document.removeEventListener('visibilitychange',check)};
  },[store,sync]);
  return {events:state?.events??[],feed:state?.feed??null,loaded:!!state,syncing,syncError,sync,run,mark,reload};
}
export type Calendar=ReturnType<typeof useCalendar>;

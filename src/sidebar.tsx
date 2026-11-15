// Barra lateral: secciones, «Mis asignaturas» (con cuántas clases tiene cada una), espacio usado y cuenta.
import {BookOpen,CalendarDays,HardDrive,LayoutGrid,Lock,LogOut,Settings2} from 'lucide-react';
import {useStore} from './store';
import Avatar from './avatar';
import {bytes,plural,type Item,type Lesson} from './types';
import type {Settings,Subject} from './settings';

type Props={settings:Settings;lessons:Lesson[];files:Item[];total:number;subjects:Subject[];filter:string;active:boolean;inCalendar:boolean;inSettings:boolean;pendingTodos:number;
  chooseSubject:(id:string)=>void;openCalendar:()=>void;openSettings:()=>void;onSignOut:()=>void};
export default function Sidebar({settings,lessons,files,total,subjects,filter,active,inCalendar,inSettings,pendingTodos,chooseSubject,openCalendar,openSettings,onSignOut}:Props){
  const store=useStore();
  return <aside className="sidebar">
    <a className="brand" href="./" aria-label="Aula inicio" onClick={e=>{e.preventDefault();chooseSubject('');scrollTo({top:0,behavior:'smooth'})}}><span className="brandmark"><BookOpen size={21}/></span>aula<span className="brand-dot">.</span></a>
    <div className="workspace"><span className="workspace-avatar">D</span><div><b>Mi espacio de clases</b>{settings.course&&<small>{settings.course}</small>}</div></div>
    <div className="navlabel">BIBLIOTECA</div>
    <button className={'navitem '+(!filter&&!active&&!inCalendar&&!inSettings?'chosen':'')} onClick={()=>chooseSubject('')}><LayoutGrid size={17}/>Todas las clases<span>{lessons.length}</span></button>
    <button className={'navitem '+(inCalendar?'chosen':'')} onClick={openCalendar}><CalendarDays size={17}/>Calendario<span>{pendingTodos||''}</span></button>
    <button className={'navitem '+(inSettings?'chosen':'')} onClick={openSettings}><Settings2 size={17}/>Ajustes<span/></button>
    <div className="navlabel subject-label">MIS ASIGNATURAS <span>{String(subjects.length).padStart(2,'0')}</span></div>
    <nav aria-label="Asignaturas">
      <button className={'navitem all-chip '+(!filter&&!inCalendar&&!inSettings?'chosen':'')} onClick={()=>chooseSubject('')}><LayoutGrid size={14}/>Todas</button>
      <button className={'navitem all-chip '+(inCalendar?'chosen':'')} onClick={openCalendar}><CalendarDays size={14}/>Calendario</button>
      <button className={'navitem all-chip '+(inSettings?'chosen':'')} onClick={openSettings}><Settings2 size={14}/>Ajustes</button>
      {subjects.map(s=><button key={s.id} className={'navitem '+(filter===s.id&&!inCalendar&&!inSettings?'chosen':'')} onClick={()=>chooseSubject(s.id)}><span className="subject-dot" style={{background:s.color}}/>{s.short}<span>{lessons.filter(l=>l.subject===s.id).length}</span></button>)}
    </nav>
    <div className="side-bottom">
      <div className="storage"><span className="storage-icon"><HardDrive size={16}/></span><div><b>{bytes(total)}</b><small>en {plural(files.length,'archivo','archivos')}</small></div></div>
      <div className="private"><Lock size={13}/> Espacio privado · Solo tú</div>
      <div className="profile"><Avatar user={store.adapter.user}/>
        <div title={[store.adapter.user.name,store.adapter.user.email].filter(Boolean).join(" · ")}><b>{store.adapter.user.name}</b><small>{store.adapter.kind==='drive'?'Guardado en tu Google Drive':'Solo en este navegador'}</small></div>
        <button className="iconbtn" title={store.adapter.kind==='drive'?'Cerrar sesión':'Salir del modo demo'} aria-label="Cerrar sesión" onClick={onSignOut}><LogOut size={16}/></button></div>
    </div>
  </aside>;
}

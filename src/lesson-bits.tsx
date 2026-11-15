// Piezas pequeñas de las clases: icono y nombre del tipo de archivo, y fechas como se enseñan.
import {FileAudio,FileText,Image as ImageIcon} from 'lucide-react';
import {kindOf} from './types';

export const today=()=>new Date().toLocaleDateString('en-CA');
// «2 de noviembre de 2026». Formatear fechas es lento y la lista lo hace con cada clase en cada repintado
// (y el buscador también): se reutiliza el formateador y se recuerda cada fecha ya escrita.
const LONG=new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'long',year:'numeric'}),labels=new Map<string,string>();
export const dateLabel=(s:string)=>{let t=labels.get(s);if(t===undefined){t=LONG.format(new Date(s+'T12:00:00'));labels.set(s,t)}return t};
export function Kind({f,size=20}:{f:{type:string;name:string};size?:number}){const k=kindOf(f);return k==='audio'?<FileAudio size={size}/>:k==='image'?<ImageIcon size={size}/>:<FileText size={size}/>}
export const kindLabel={audio:'Audio',image:'Imagen',doc:'Documento'};

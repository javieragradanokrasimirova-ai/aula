// Piezas pequeñas de las clases: icono y nombre del tipo de archivo, y fechas como se enseñan.
import {FileAudio,FileText,Image as ImageIcon} from 'lucide-react';
import {kindOf} from './types';

export const today=()=>new Date().toLocaleDateString('en-CA');
export const dateLabel=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});
export function Kind({f,size=20}:{f:{type:string;name:string};size?:number}){const k=kindOf(f);return k==='audio'?<FileAudio size={size}/>:k==='image'?<ImageIcon size={size}/>:<FileText size={size}/>}
export const kindLabel={audio:'Audio',image:'Imagen',doc:'Documento'};

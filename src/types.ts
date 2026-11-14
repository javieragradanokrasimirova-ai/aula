export type Lesson={id:string;subject:string;title:string;date:string;topic:string;notes:string};
export type Item={id:string;lesson:string;name:string;type:string;size:number};

export const bytes=(n:number)=>!n?'0 MB':n>=1e9?(n/1e9).toFixed(2)+' GB':n>=1e6?(n/1e6).toFixed(1)+' MB':Math.max(1,Math.round(n/1000))+' KB';
export const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
// Los archivos los sirve el service worker (public/aula-sw.js), que sabe sacarlos de Drive o del navegador.
// El tamaño va también en la dirección: Drive no deja leer algunas cabeceras y el service worker las rehace con él.
export const fileURL=(f:{id:string;name:string;type:string;size?:number},download=false)=>'./__aula-file/'+encodeURIComponent(f.id)+'?name='+encodeURIComponent(f.name)+'&type='+encodeURIComponent(f.type||'')+(f.size?'&size='+f.size:'')+(download?'&download=1':'');

// Algunos móviles entregan el archivo sin tipo MIME: se deduce por la extensión.
const byExt:Record<string,string>={m4a:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',opus:'audio/ogg',aac:'audio/aac',webm:'audio/webm',amr:'audio/amr',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',pdf:'application/pdf',zip:'application/zip',txt:'text/plain',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',mp4:'video/mp4',mov:'video/quicktime'};
export const guessType=(name:string,type='')=>type||byExt[name.split('.').pop()?.toLowerCase()||'']||'application/octet-stream';
export const kindOf=(f:{type:string;name:string}):'audio'|'image'|'doc'=>{const t=guessType(f.name,f.type);return t.startsWith('audio')?'audio':t.startsWith('image')?'image':'doc'};
// Formatos que el navegador puede mostrar como imagen (HEIC no suele poder).
export const viewableImage=(f:{type:string;name:string})=>kindOf(f)==='image'&&!/hei[cf]/i.test(guessType(f.name,f.type));

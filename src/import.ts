// Leer el ZIP de «Exportar todo» (de Aula en Sites o de esta misma web) sin cargarlo entero:
// se lee el índice del final del ZIP y cada archivo se recorta del original con File.slice().
// Solo hace falta para ZIP sin compresión, que es como los genera Aula.
import {parseSettings,EMPTY_SETTINGS,type Settings} from './settings';

export type ZipEntry={name:string;size:number;method:number;offset:number};
export type ImportLesson={subject:string;title:string;date:string;topic:string;notes:string;files:{name:string;type:string;size:number;path:string}[]};
export type ImportPlan={settings:Settings|null;lessons:ImportLesson[];entries:Map<string,ZipEntry>;bytes:number};

const u16=(v:DataView,o:number)=>v.getUint16(o,true),u32=(v:DataView,o:number)=>v.getUint32(o,true);
const view=async(b:Blob)=>new DataView(await b.arrayBuffer());

export async function readZipIndex(file:Blob):Promise<ZipEntry[]>{
  // El «final del directorio» está en los últimos 22 bytes (más un comentario opcional de hasta 64 KB).
  const tailStart=Math.max(0,file.size-22-65535),tail=await view(file.slice(tailStart));
  let eocd=-1;for(let i=tail.byteLength-22;i>=0;i--)if(u32(tail,i)===0x06054b50){eocd=i;break}
  if(eocd<0)throw new Error('Ese archivo no es un ZIP válido.');
  const count=u16(tail,eocd+10),cdSize=u32(tail,eocd+12),cdOffset=u32(tail,eocd+16);
  const cd=await view(file.slice(cdOffset,cdOffset+cdSize)),dec=new TextDecoder();
  const out:ZipEntry[]=[];let p=0;
  for(let i=0;i<count;i++){
    if(u32(cd,p)!==0x02014b50)throw new Error('El ZIP está dañado.');
    const method=u16(cd,p+10),size=u32(cd,p+24),nameLen=u16(cd,p+28),extraLen=u16(cd,p+30),commentLen=u16(cd,p+32),offset=u32(cd,p+42);
    const name=dec.decode(new Uint8Array(cd.buffer,cd.byteOffset+p+46,nameLen));
    out.push({name,size,method,offset});p+=46+nameLen+extraLen+commentLen;
  }
  return out;
}
// Un archivo concreto del ZIP, recortado del original (sin copiarlo en memoria).
export async function entryBlob(file:Blob,e:ZipEntry,type=''):Promise<Blob>{
  if(e.method!==0)throw new Error(`«${e.name}» está comprimido y no se puede importar.`);
  const h=await view(file.slice(e.offset,e.offset+30));
  if(u32(h,0)!==0x04034b50)throw new Error('El ZIP está dañado.');
  const start=e.offset+30+u16(h,26)+u16(h,28);
  return file.slice(start,start+e.size,type);
}

export async function readExport(file:Blob):Promise<ImportPlan>{
  const list=await readZipIndex(file),entries=new Map(list.map(e=>[e.name,e]));
  const manifest=entries.get('aula.json');
  if(!manifest)throw new Error('Este ZIP no es una copia de «Exportar todo» de Aula (le falta aula.json).');
  const data=JSON.parse(await (await entryBlob(file,manifest)).text());
  if(data.format!=='aula')throw new Error('Este ZIP no es una copia de Aula.');
  const settings=data.settings?parseSettings(JSON.stringify(data.settings),EMPTY_SETTINGS):null;
  const lessons:ImportLesson[]=(Array.isArray(data.lessons)?data.lessons:[]).filter((l:any)=>l&&/^\d{4}-\d{2}-\d{2}$/.test(l.date))
    .map((l:any)=>({subject:String(l.subject??''),title:String(l.title??'Sin título'),date:l.date,topic:String(l.topic??''),notes:String(l.notes??''),
      files:(Array.isArray(l.files)?l.files:[]).filter((f:any)=>entries.has(f.path)).map((f:any)=>({name:String(f.name),type:String(f.type||''),size:Number(f.size)||0,path:String(f.path)}))}));
  return {settings,lessons,entries,bytes:lessons.reduce((s,l)=>s+l.files.reduce((a,f)=>a+f.size,0),0)};
}

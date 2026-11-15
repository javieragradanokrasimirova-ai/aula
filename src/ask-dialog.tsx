// Ventana de confirmar (eliminar…) o de pedir un texto (renombrar).
import {useState} from 'react';
import {Loader2} from 'lucide-react';
import {Modal} from './modal';

export type Ask={title:string;text?:string;confirm:string;danger?:boolean;input?:string;run:(value:string)=>Promise<void>|void};

export default function AskDialog({ask,onClose,onError}:{ask:Ask;onClose:()=>void;onError:(m:string)=>void}){
  const [busy,setBusy]=useState(false),[value,setValue]=useState(ask.input??'');
  return <Modal label={ask.title} className="ask" onClose={onClose}>{close=><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await ask.run(value);close()}catch(err){onError((err as Error).message);close()}}}>
    <h2>{ask.title}</h2>{ask.text&&<p>{ask.text}</p>}
    {ask.input!==undefined&&<input value={value} onChange={e=>setValue(e.target.value)} autoFocus onFocus={e=>{const dot=e.target.value.lastIndexOf('.');e.target.setSelectionRange(0,dot>0?dot:e.target.value.length)}} aria-label="Nombre"/>}
    <div className="form-footer"><button type="button" className="ghost" onClick={close}>Cancelar</button><button className={ask.danger?'primary destructive':'primary'} disabled={busy} autoFocus={ask.input===undefined}>{busy&&<Loader2 className="spin" size={16}/>}{ask.confirm}</button></div>
  </form>}</Modal>;
}

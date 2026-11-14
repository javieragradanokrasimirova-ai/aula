// Ventana para importar el ZIP de «Exportar todo»: primero enseña lo que trae y luego lo importa.
// Las clases y los ajustes se crean al momento; los archivos se suben con la cola normal de subidas.
import {useState} from 'react';
import {AlertCircle,ArrowUpRight,FileArchive,Loader2,Upload,X} from 'lucide-react';
import {Modal} from './archive';
import {readExport,type ImportPlan} from './import';
import {bytes,plural} from './types';

export default function ImportView({onClose,onImport}:{onClose:()=>void;onImport:(plan:ImportPlan,file:File,withSettings:boolean)=>Promise<void>}){
  const [file,setFile]=useState<File|null>(null),[plan,setPlan]=useState<ImportPlan|null>(null),[withSettings,setWithSettings]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const pick=async(f:File)=>{setBusy(true);setError('');setPlan(null);try{setPlan(await readExport(f));setFile(f)}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
  const files=plan?plan.lessons.reduce((s,l)=>s+l.files.length,0):0;
  return <Modal label="Importar una copia" onClose={onClose}>{close=><>
    <div className="modal-head"><div><span className="eyebrow">TRAER TUS DATOS</span><h2>Importar una copia de Aula</h2></div><button className="iconbtn" aria-label="Cerrar" onClick={close}><X size={20}/></button></div>
    {!plan?<>
      <ol className="connect-steps">
        <li>En tu Aula de siempre, baja hasta el final y pulsa <b>Exportar todo</b>. Se descarga un ZIP.</li>
        <li>Elígelo aquí. Antes de importar nada verás lo que trae.</li>
      </ol>
      <label className={'pick-files'+(busy?' has-files':'')}><span className="dropzone-icon">{busy?<Loader2 className="spin" size={20}/>:<FileArchive size={20}/>}</span>
        <b>{busy?'Leyendo el ZIP…':'Elegir el ZIP'}</b><small>Se lee en tu dispositivo: no se envía a ningún sitio hasta que pulses «Importar».</small>
        <input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)pick(f)}}/></label>
    </>:<>
      <div className="import-summary">
        <div><b>{plan.lessons.length}</b><span>{plan.lessons.length===1?'clase':'clases'}</span></div>
        <div><b>{files}</b><span>{files===1?'archivo':'archivos'}</span></div>
        <div><b>{bytes(plan.bytes)}</b><span>en total</span></div>
      </div>
      {plan.settings&&<label className="set-switch"><input type="checkbox" checked={withSettings} onChange={e=>setWithSettings(e.target.checked)}/><span className="set-switch-ui"/>
        <span><b>Usar también sus ajustes</b><small>{plural(plan.settings.subjects.length,'asignatura','asignaturas')}, tu horario y el curso «{plan.settings.course||'sin nombre'}». Sustituyen a los de ahora.</small></span></label>}
      <p className="connect-note">Las clases que ya tengas (misma asignatura, título y fecha) no se duplican. Los archivos se suben uno a uno: puedes seguir usando Aula mientras tanto, pero no cierres la pestaña hasta que acaben.</p>
    </>}
    {error&&<p className="error" role="alert"><AlertCircle size={17}/>{error}</p>}
    <div className="form-footer"><button type="button" className="ghost" onClick={close}>Cancelar</button>
      {plan&&<button className="primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onImport(plan,file!,withSettings);close()}catch(e){setError((e as Error).message);setBusy(false)}}}>
        {busy?<><Loader2 className="spin" size={16}/>Importando…</>:<><Upload size={16}/>Importar<ArrowUpRight size={17}/></>}</button>}
    </div></>}</Modal>;
}

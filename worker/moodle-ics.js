// Intermediario para el calendario de Moodle (Cloudflare Worker, plan gratuito).
//
// Por qué existe: Moodle no deja que otra web lea su calendario desde el navegador (no envía las
// cabeceras CORS), así que Aula no puede descargarlo por sí sola. Este Worker hace solo eso:
//   POST {"url":"https://tu-moodle/calendar/export_execute.php?…"}  →  el .ics tal cual.
//
// Límites, a propósito:
//  · Solo acepta peticiones desde la web de Aula (y desde 127.0.0.1/localhost para desarrollar).
//  · Solo descarga direcciones https que terminan en /calendar/export_execute.php (el enlace de
//    «Exportar calendario» de Moodle). Nada de IPs ni puertos raros.
//  · Solo devuelve la respuesta si es un calendario (BEGIN:VCALENDAR) y ocupa menos de 5 MB.
//  · No guarda nada ni escribe registros: el enlace pasa por aquí y se olvida.
const ORIGINS=[/^https:\/\/javieragradanokrasimirova-ai\.github\.io$/,/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/];
const MAX=5*1024*1024;

export default {
  async fetch(req){
    const origin=req.headers.get('Origin')||'',allowed=ORIGINS.some(r=>r.test(origin));
    const cors={'Access-Control-Allow-Origin':allowed?origin:'null','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'};
    const fail=(status,message)=>new Response(message,{status,headers:{...cors,'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(!allowed)return fail(403,'Este servicio solo funciona desde Aula.');
    if(req.method!=='POST')return fail(405,'Usa POST.');

    let url;
    try{url=new URL((await req.json()).url)}catch{return fail(400,'Ese enlace no es válido.')}
    if(url.protocol!=='https:'||url.port||url.username||!/\/calendar\/export_execute\.php$/.test(url.pathname)||/^(localhost|[\d.]+|\[.*\])$/i.test(url.hostname))
      return fail(400,'Ese enlace no es el de exportar el calendario de Moodle.');

    let r;
    try{r=await fetch(url.toString(),{redirect:'follow',headers:{'User-Agent':'Aula-calendario/1.0 (+https://github.com/javieragradanokrasimirova-ai/aula)','Accept':'text/calendar, text/plain;q=0.8'}})}
    catch{return fail(502,'No se ha podido conectar con tu Moodle. Inténtalo en un rato.')}
    if(!r.ok)return fail(502,`Tu Moodle ha respondido con un error (${r.status}).`);

    // Se lee con tope de tamaño (un calendario normal ocupa unos pocos KB).
    const reader=r.body.getReader(),parts=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX){reader.cancel();return fail(413,'El calendario es demasiado grande.')}parts.push(value)}
    const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length}
    const text=new TextDecoder().decode(bytes);
    if(!/^\s*BEGIN:VCALENDAR/.test(text))return fail(422,'Moodle no ha devuelto un calendario. Puede que el enlace ya no valga: genera uno nuevo en Moodle.');
    return new Response(text,{headers:{...cors,'Content-Type':'text/calendar; charset=utf-8','Cache-Control':'no-store'}});
  },
};

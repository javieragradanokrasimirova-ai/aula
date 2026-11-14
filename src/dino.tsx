
import {useEffect,useId,useRef,useState} from 'react';

// Mascota de Aula: un dinosaurio original con el libro del logotipo.
// Expresiones:
//   idle (parpadea y respira) · happy (encuentra algo) · think (busca) · sleep (de noche)
//   worried (entrega para hoy) · wave (saluda) · surprised · sad (no encuentra nada)
//   celebrate (tarea hecha, descarga lista) · giggle (le haces clic)
export type Mood='idle'|'happy'|'think'|'sleep'|'worried'|'wave'|'surprised'|'sad'|'celebrate'|'giggle';

const INK='#1f332c',SKIN='#88aa74',DARK='#6f9a5f',LINE='#4a7656',CREAM='#f3f1e4',BLUSH='#ef9f97';

export default function Dino({mood='idle',size=64,follow=false}:{mood?:Mood;size?:number;follow?:boolean}){
  const uid=useId().replace(/[^a-zA-Z0-9]/g,''),ref=useRef<SVGSVGElement>(null);
  const [boop,setBoop]=useState(false),[look,setLook]=useState({x:0,y:0});
  // Te sigue con la mirada (solo con ratón y si no está durmiendo o con los ojos cerrados).
  useEffect(()=>{
    if(!follow||typeof matchMedia!=='function'||!matchMedia('(hover:hover) and (pointer:fine)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    let raf=0,last:PointerEvent|null=null;
    const update=()=>{raf=0;const r=ref.current?.getBoundingClientRect();if(!r||!last)return;
      const dx=last.clientX-(r.left+r.width*.6),dy=last.clientY-(r.top+r.height*.36),d=Math.hypot(dx,dy)||1,k=Math.min(1,d/260);
      setLook({x:+(dx/d*3.6*k).toFixed(2),y:+(dy/d*3*k).toFixed(2)})};
    const move=(e:PointerEvent)=>{last=e;if(!raf)raf=requestAnimationFrame(update)};
    const leave=()=>setLook({x:0,y:0});
    addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerleave',leave);
    return()=>{removeEventListener('pointermove',move);document.removeEventListener('pointerleave',leave);if(raf)cancelAnimationFrame(raf)};
  },[follow]);
  // Si le haces clic, se ríe un momento.
  const poke=()=>{setBoop(true);setTimeout(()=>setBoop(false),950)};
  const m:Mood=boop?'giggle':mood;
  const closedHappy=m==='happy'||m==='celebrate'||m==='giggle',asleep=m==='sleep';
  const wide=m==='surprised',lx=closedHappy||asleep?0:m==='think'?1.2:look.x,ly=closedHappy||asleep?0:m==='think'?-4:m==='sad'?2:look.y;
  const g=(n:string)=>`url(#${n}${uid})`;
  // Silueta: se dibuja primero con un trazo grueso (contorno) y después rellena encima.
  const silhouette=<>
    <path d="M66 150C40 162 20 152 24 128c2-12 15-11 16-1 1 11 10 16 29 10z" className="dino-tail"/>
    <ellipse cx="100" cy="136" rx="48" ry="42"/><ellipse cx="112" cy="78" rx="44" ry="38"/><ellipse cx="141" cy="89" rx="21" ry="15.5"/>
    <ellipse cx="82" cy="175" rx="17" ry="9"/><ellipse cx="124" cy="176" rx="17" ry="9"/>
  </>;
  const eye=(cx:number,cy:number,rx:number,ry:number,pr:number)=>{
    if(closedHappy)return <path d={`M${cx-rx+1} ${cy+2}q${rx-1} ${-ry} ${2*rx-2} 0`} fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round"/>;
    if(asleep)return <path d={`M${cx-rx+1} ${cy+1}q${rx-1} ${ry*.7} ${2*rx-2} 0`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round"/>;
    const sx=wide?1.12:1,p=wide?pr*.72:pr;
    return <g><ellipse cx={cx} cy={cy} rx={rx*sx} ry={ry*sx} fill="#fff" stroke={LINE} strokeWidth="1.4"/>
      <g className="dino-pupils" style={{transform:`translate(${lx}px,${ly}px)`}}><circle cx={cx+1.5} cy={cy+1.5} r={p} fill={INK}/><circle cx={cx+3.6} cy={cy-1.4} r={p*.36} fill="#fff"/><circle cx={cx-.4} cy={cy+3.8} r={p*.16} fill="#fff" opacity=".8"/></g>
      {(m==='worried'||m==='sad')&&<path d={`M${cx-rx-1} ${cy-ry*.35}L${cx+rx+1} ${cy-ry-1}V${cy-ry-6}H${cx-rx-1}z`} fill={SKIN}/>}
    </g>};
  // Cejas de preocupación: la parte de dentro (hacia el centro de la cara) más alta.
  const brows=m==='worried'||m==='sad'?<path d="M99 60l14-6M143 58l-13-5" stroke={INK} strokeWidth="3" strokeLinecap="round"/>
    :m==='surprised'?<path d="M99 52q9-6 18 0M126 50q8-5 16 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round"/>
    :m==='think'?<path d="M126 54q8-6 16-1" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round"/>:null;
  const mouth=m==='celebrate'||m==='giggle'?<><path d="M120 94q12 17 26 0z" fill={INK}/><path d="M126 99q7 6 14 0" fill={BLUSH}/><path d="M124 94.5l3 4 3-3.6z" fill="#fff"/></>
    :m==='happy'?<><path d="M122 95q11 14 23 0z" fill={INK}/><path d="M127 96.5q6 5 13 0" fill={BLUSH}/><path d="M126 95.5l3 4 3-3.6z" fill="#fff"/></>
    :m==='surprised'?<ellipse cx="134" cy="99" rx="5" ry="6.5" fill={INK}/>
    :m==='sleep'?<ellipse cx="134" cy="99" rx="3.4" ry="2.6" fill={INK}/>
    :m==='sad'?<path d="M126 102q8-7 16 0" fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round"/>
    :m==='worried'?<path d="M125 100q3-3 6 0t6 0t6 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round"/>
    :m==='think'?<path d="M128 99h12" stroke={INK} strokeWidth="2.6" strokeLinecap="round"/>
    :<><path d="M125 97q9 8 18 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round"/><path d="M129 99.5l3 4 3-3.4z" fill="#fff"/></>;
  const armsUp=m==='celebrate';
  return <svg ref={ref} className={'dino '+m} viewBox="0 0 200 200" width={size} height={size} aria-hidden="true" onPointerDown={poke}>
    <defs>
      <radialGradient id={'skin'+uid} cx="38%" cy="30%" r="75%"><stop offset="0" stopColor="#a3c28f"/><stop offset=".55" stopColor={SKIN}/><stop offset="1" stopColor="#769a62"/></radialGradient>
      <radialGradient id={'belly'+uid} cx="45%" cy="30%" r="80%"><stop offset="0" stopColor="#fbfaf2"/><stop offset="1" stopColor="#e6e3cf"/></radialGradient>
      <linearGradient id={'spike'+uid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4f7d5d"/><stop offset="1" stopColor="#355a43"/></linearGradient>
    </defs>
    <ellipse className="dino-shadow" cx="100" cy="187" rx="58" ry="6" fill="#294f3d" opacity=".12"/>
    <g className="dino-bob">
      {/* Púas */}
      <g fill={g('spike')} stroke={LINE} strokeWidth="1.6">
        <ellipse cx="58" cy="100" rx="8" ry="12" transform="rotate(-78 58 100)"/><ellipse cx="62" cy="77" rx="9" ry="13" transform="rotate(-62 62 77)"/>
        <ellipse cx="74" cy="56" rx="9" ry="13.5" transform="rotate(-42 74 56)"/><ellipse cx="92" cy="43" rx="8.5" ry="12.5" transform="rotate(-18 92 43)"/>
      </g>
      <g fill={LINE} stroke={LINE} strokeWidth="5" strokeLinejoin="round">{silhouette}</g>
      <g fill={g('skin')}>{silhouette}</g>
      {/* Brillo suave en la cabeza y barriga */}
      <ellipse cx="96" cy="58" rx="16" ry="8" fill="#fff" opacity=".16" transform="rotate(-18 96 58)"/>
      <ellipse cx="108" cy="146" rx="29" ry="26" fill={g('belly')}/>
      <path d="M92 133q16-5 32 0M90 145q18-5 36 0M92 157q16-5 32 0" stroke="#dcd8c0" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7"/>
      {/* Garras */}
      <g fill={CREAM}><ellipse cx="72" cy="179" rx="3" ry="2.2"/><ellipse cx="80" cy="181" rx="3" ry="2.2"/><ellipse cx="88" cy="180" rx="3" ry="2.2"/>
        <ellipse cx="116" cy="181" rx="3" ry="2.2"/><ellipse cx="124" cy="182" rx="3" ry="2.2"/><ellipse cx="132" cy="181" rx="3" ry="2.2"/></g>
      {/* Cara */}
      <circle cx="151" cy="84" r="1.9" fill={INK}/><circle cx="157" cy="85" r="1.9" fill={INK}/>
      <g className="dino-eyes">{eye(108,73,10,11.5,6.5)}{eye(134,71,9,10.5,6)}</g>
      {brows}
      <ellipse cx="99" cy="93" rx="7" ry="4" fill={BLUSH} opacity={closedHappy||m==='surprised'?.95:.7}/><ellipse cx="150" cy="96" rx="6" ry="3.5" fill={BLUSH} opacity={closedHappy||m==='surprised'?.95:.7}/>
      {mouth}
      {/* El libro: tapa verde con marcapáginas, páginas blancas y líneas de texto. */}
      <g className="dino-book">
        <rect x="85" y="124" width="54" height="34" rx="6" fill="#294f3d" stroke="#1f3d2f" strokeWidth="1.5"/>
        <path d="M90 129q11-5 22 0v25q-11-5-22 0z" fill="#fff"/><path d="M112 129q11-5 22 0v25q-11-5-22 0z" fill="#fff"/>
        <path d="M94 136q7-2.4 14 0M94 143q7-2.4 14 0M116 136q7-2.4 14 0M116 143q7-2.4 14 0" stroke="#6d8a74" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
        <path d="M126 124v14l3-3 3 3v-14z" fill="#e0a64a"/>
      </g>
      {/* Brazos: sujetan el libro; al saludar uno se levanta y al celebrar, los dos. */}
      {armsUp?<>
        <g transform="rotate(35 78 116)"><ellipse cx="78" cy="116" rx="7" ry="10" fill={DARK} stroke={LINE} strokeWidth="1.6"/></g>
        <g transform="rotate(-35 146 114)"><ellipse cx="146" cy="114" rx="7" ry="10" fill={DARK} stroke={LINE} strokeWidth="1.6"/></g>
      </>:<>
        <ellipse className="dino-arm-l" cx="87" cy={m==='happy'?140:143} rx="7" ry="9" fill={DARK} stroke={LINE} strokeWidth="1.6"/>
        <ellipse className={'dino-arm-r'+(m==='wave'?' waving':'')} cx="137" cy={m==='happy'?140:143} rx="7" ry="9" fill={DARK} stroke={LINE} strokeWidth="1.6"/>
      </>}
      {/* Extras según el ánimo */}
      {m==='happy'&&<g className="dino-sparks"><path d="M166 50l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#f0c25c"/><path d="M48 38l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" fill="#f0c25c"/></g>}
      {m==='celebrate'&&<g className="dino-confetti"><rect x="40" y="30" width="6" height="10" rx="2" fill="#f0c25c" transform="rotate(-20 43 35)"/><rect x="160" y="24" width="6" height="10" rx="2" fill={BLUSH} transform="rotate(25 163 29)"/>
        <circle cx="62" cy="18" r="3.5" fill="#8fb6e3"/><circle cx="178" cy="54" r="3.5" fill="#f0c25c"/><rect x="138" y="10" width="5" height="9" rx="2" fill="#a8d08d" transform="rotate(-35 140 14)"/><circle cx="30" cy="62" r="3" fill={BLUSH}/></g>}
      {m==='think'&&<g className="dino-thought"><rect x="150" y="22" width="44" height="26" rx="13" fill="#fff" stroke="#c9d3c2"/>
        <circle className="d1" cx="162" cy="35" r="3" fill={SKIN}/><circle className="d2" cx="172" cy="35" r="3" fill={SKIN}/><circle className="d3" cx="182" cy="35" r="3" fill={SKIN}/><circle cx="152" cy="55" r="3.5" fill="#fff" stroke="#c9d3c2"/></g>}
      {m==='sleep'&&<g className="dino-zzz" fill="#6d8a74" fontFamily="system-ui,sans-serif" fontWeight="800"><text x="152" y="50" fontSize="16">z</text><text x="164" y="36" fontSize="20">z</text><text x="178" y="20" fontSize="24">Z</text></g>}
      {m==='worried'&&<path className="dino-sweat" d="M160 60q6 9 0 13q-6-4 0-13z" fill="#9cc8ea" stroke="#6fa3cc" strokeWidth="1.2"/>}
      {m==='sad'&&<path className="dino-tear" d="M104 88q4 7 0 10q-4-3 0-10z" fill="#9cc8ea"/>}
      {m==='surprised'&&<g className="dino-alert"><path d="M170 26l-3 20" stroke="#e0a64a" strokeWidth="5" strokeLinecap="round"/><circle cx="165.6" cy="55" r="3" fill="#e0a64a"/></g>}
    </g>
  </svg>;
}

import { AI_CHAR, OPENINGS, TRAITS } from '../data/config';
import { G } from '../sim/state';

/* =====================================================================
   KI-Persönlichkeit
   ---------------------------------------------------------------------
   Pro Partie zieht jede KI eine Eröffnung (Ansturm, Aufschwung, Igel,
   Technik) und ein bis zwei Charakterzüge. aiChar() liefert die Werte,
   nach denen die KI entscheidet: Grundcharakter × Persönlichkeit.
   Der Spieler erfährt die Persönlichkeit nur über den Geheimdienst.
   ===================================================================== */
const pick=(w:Record<string,number>)=>{ const L=Object.entries(w), s=L.reduce((a,[,v])=>a+v,0); let x=Math.random()*s; for(const [k,v] of L){ x-=v; if(x<0) return k; } return L[0][0]; };
/** Persönlichkeit würfeln (beim neuen Spiel) */
export function rollPersona(pid){
  const key=AI_CHAR[pid].key, op=pick(Object.fromEntries(Object.entries(OPENINGS).map(([k,o])=>[k,o.w[key]||1])));
  const T=Object.keys(TRAITS), tr=[T[Math.floor(Math.random()*T.length)]];
  if(Math.random()<0.4){ const t2=T.filter(t=>t!==tr[0]&&!(tr[0]==='verraeter'&&t==='treu')&&!(tr[0]==='treu'&&t==='verraeter')); tr.push(t2[Math.floor(Math.random()*t2.length)]); }
  return {opening:op, traits:tr};
}
export const personaOf=pid=>(G.ais[pid]&&G.ais[pid].persona)||null;
export const hasTrait=(pid,t)=>!!(personaOf(pid)&&personaOf(pid).traits.includes(t));
/** Entscheidungswerte der KI: Grundcharakter mit Eröffnung und Charakterzügen verrechnet */
export function aiChar(pid){
  const C:any={...AI_CHAR[pid], tech:1, grace:1, pactMul:1, grudge:1, drive:0, driveUntil:0, leadDrive:0}, P=personaOf(pid); if(!P) return C;
  const apply=m=>{ for(const k in m){ if(k==='peace') C.peace=Math.max(0,C.peace+m[k]); else C[k]=(C[k]??1)*m[k]; } };
  const O:any=OPENINGS[P.opening]; if(O){ apply(O.mods); C.grace*=O.grace; C.drive=O.drive||0; C.driveUntil=O.driveUntil||0; }
  for(const t of P.traits){ const T=TRAITS[t]; if(!T) continue; apply(T.mods); if(T.pactMul) C.pactMul*=T.pactMul; if(T.grudge) C.grudge*=T.grudge; if((T as any).leadDrive) C.leadDrive+=(T as any).leadDrive; }
  return C;
}
/** Text für Lagebericht und Sprachmodell */
export function personaText(pid, known?:{opening?:boolean, traits?:string[]}){
  const P=personaOf(pid); if(!P) return '';
  const op=(!known||known.opening)?`${OPENINGS[P.opening].name} (${OPENINGS[P.opening].desc})`:'unbekannt';
  const tr=P.traits.filter(t=>!known||(known.traits||[]).includes(t)).map(t=>TRAITS[t].name);
  return `Strategie: ${op}${tr.length?` · Charakter: ${tr.join(', ')}`:''}`;
}
/** Was der Spieler über die Persönlichkeit weiß */
export const personaKnown=pid=>{ const K=(G.personaSeen||(G.personaSeen={}))[pid]||(G.personaSeen[pid]={opening:false, traits:[]}); return K; };
/** ein Stück der Persönlichkeit wird bekannt (Geheimdienst oder eigenes Verhalten). Rückgabe: Text oder '' */
export function revealPersona(pid, what?:string){
  const P=personaOf(pid); if(!P) return ''; const K=personaKnown(pid);
  if((!what||what==='opening')&&!K.opening){ K.opening=true; const O=OPENINGS[P.opening]; return `${G.players[pid].short} setzt auf ${O.name}: ${O.desc}.|${O.counter}`; }
  const t=what&&what!=='opening'?what:P.traits.find(x=>!K.traits.includes(x));
  if(t&&P.traits.includes(t)&&!K.traits.includes(t)){ K.traits.push(t); return `${G.players[pid].leader} gilt als ${TRAITS[t].name} – ${TRAITS[t].desc}.|`; }
  return '';
}

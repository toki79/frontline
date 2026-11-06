import { msg } from '../core/events';
import { INTEL, MAJORS, RESEARCH, RTREE, UNITS, hasTech, lvlOf } from '../data/config';
import { G } from '../sim/state';

/* =====================================================================
   Geheimdienst: wer weiß was über wen?
   ---------------------------------------------------------------------
   Der Nachrichtendienst (Gebäude) liefert Meldungen über die anderen Mächte:
   begonnene und abgeschlossene Forschung, neue Waffengattungen, Truppen und
   Angriffspläne – je höher ausgebaut, desto zuverlässiger. Eine Botschaft
   hilft, Spionageabwehr der Gegenseite schadet. Jede Warnung nennt die
   passende Gegenmaßnahme. Auch die KI-Mächte nutzen ihren Geheimdienst und
   stellen ihre Verteidigung darauf ein.
   ===================================================================== */
const working = b => !b.dead && !b.site && !b.contam;
/** Ausbaustufe des besten eigenen Nachrichtendienstes (0 = keiner) */
export function intelLevel(pid){ let l=0; for(const b of G.buildings) if(b.owner===pid&&b.type==='intel'&&working(b)) l=Math.max(l,lvlOf(b)); return l; }
/** Wahrscheinlichkeit, dass obs von einem Ereignis bei tgt erfährt */
export function intelChance(obs,tgt){
  if(obs===tgt||!G.known[obs][tgt]) return 0;
  const l=intelLevel(obs), emb=G.embassy&&G.embassy[obs]&&G.embassy[obs][tgt];
  let c=l?INTEL.chance[Math.min(3,l)]:emb?INTEL.rumor+INTEL.embassy:INTEL.rumor*0.5;
  if(l&&emb) c+=INTEL.embassy;
  if(hasTech(G.players[tgt],'counterintel')) c-=INTEL.counter;
  return Math.max(0,Math.min(0.97,c));
}
const st=()=>G.intel||(G.intel={pending:[], log:[], seen:{}});
/** Was eine Macht über eine andere weiß (Forschung, Waffengattungen) – für KI und Lagebericht */
export function knows(obs,tgt){ const S=st(); const k=obs+'>'+tgt; return S.seen[k]||(S.seen[k]={tech:{}, units:{}, research:null, plan:null}); }
/** Ereignis bei tgt; jeder Beobachter erfährt es mit seiner Chance (nach kurzer Verzögerung) */
export function intelEvent(tgt, kind, key, extra?){
  for(const obs of MAJORS){ if(obs===tgt) continue;
    const c=intelChance(obs,tgt); if(!(c>0)||Math.random()>=c) continue;
    const at=G.t+INTEL.delay[0]+Math.random()*(INTEL.delay[1]-INTEL.delay[0]);
    st().pending.push({obs, tgt, kind, key, at, extra:extra||null}); }
}
/** fällige Meldungen ausliefern (einmal je Sekunde aus der Hauptschleife) */
export function updateIntel(){
  const S=st(), due=S.pending.filter(r=>G.t>=r.at); if(!due.length) return;
  S.pending=S.pending.filter(r=>G.t<r.at);
  for(const r of due){ const K=knows(r.obs,r.tgt);
    if(r.kind==='research') K.research=r.key;
    if(r.kind==='done'){ K.tech[r.key]=true; if(K.research===r.key) K.research=null; }
    if(r.kind==='unit') K.units[r.key]=Math.max(K.units[r.key]||0,(r.extra&&r.extra.n)||1);
    if(r.kind==='plan'&&(r.extra||{}).on===r.obs) K.plan={t:G.t, ...(r.extra||{})};
    if(r.obs===0) report(r); }
}
/** Meldung für den Spieler: Text, Gegenmaßnahme, Eintrag im Lagebericht */
function report(r){
  const n=G.players[r.tgt].short, T=INTEL.threats[r.key], R=RESEARCH[r.key];
  let txt='', warn=false, counter=T?T.counter:'';
  if(r.kind==='research'){ if(!T) return; txt=`🕵 Geheimdienst: ${n} forscht an ${T.txt}.`; warn=true; }
  else if(r.kind==='done'){ txt=T?`🕵 Geheimdienst: ${n} beherrscht jetzt ${T.txt}!`:`🕵 Geheimdienst: ${n} hat „${R?R.name:r.key}“ erforscht.`; warn=!!T; }
  else if(r.kind==='unit'){ const u=INTEL.units[r.key]; if(!u) return; const k=r.extra&&r.extra.n||1;
    txt=k>1?`🕵 Geheimdienst: ${n} hat inzwischen ${k} ${u}.`:`🕵 Geheimdienst: ${n} stellt ${u} auf.`; warn=true;
    counter=UNIT_COUNTER[r.key]||counter; }
  else if(r.kind==='plan'){ const e=r.extra||{};
    if(e.on===0){ txt=`🕵 Geheimdienst: ${n} bereitet einen Angriff auf uns vor${e.target?` – Ziel vermutlich: ${e.target}`:''}${e.army?` (${e.army})`:''}.`; warn=true; counter=e.counter||'Truppen dorthin verlegen, Zugänge sichern'; }
    else { txt=`🕵 Geheimdienst: ${n} bereitet einen Angriff auf ${G.known[0][e.on]?G.players[e.on].short:'eine fremde Macht'} vor.`; } }
  else if(r.kind==='victory'){ txt=`🕵 Geheimdienst: ${n} ${r.extra&&r.extra.txt}`; warn=true; counter=r.extra&&r.extra.counter||''; }
  if(!txt) return;
  msg(txt+(warn&&counter?` Empfehlung: ${counter}.`:''), warn?'#ffb38a':'#d6b45a');
  const S=st(); S.log.unshift({t:G.t, tgt:r.tgt, txt, counter:warn?counter:''}); if(S.log.length>INTEL.log) S.log.length=INTEL.log;
}
const UNIT_COUNTER = {
  tel:'Flugabwehrraketen mit Raketenabwehr, wichtige Gebäude auseinanderziehen, Raketenträger mit Reaper oder Jagdbombern jagen',
  jet:'Flugabwehrraketen-Stellungen, Flak, Flakpanzer',
  swarm:'Störsender und Selbstschussanlagen',
  heavy:'Panzerabwehrtrupps in Gräben, Panzerminen, Raketenwerfer',
  amphib:'Ufer sichern: Stellungen und Minen am Fluss',
  mlrs:'Truppen nicht ballen, Drohnen gegen die Werfer',
  reaper:'Flugabwehr mit Radar (Flak, Flakpanzer), Schützen in Deckung',
  nuke:'eigene Abschreckung und Flugabwehrraketen mit Raketenabwehr',
};
/** Truppenschätzung (Lagebericht ab Stufe 2): Anzahl je Gattung, leicht verrauscht */
export function armyEstimate(obs,tgt){
  const l=intelLevel(obs); if(l<INTEL.armyAt) return null;
  const c={inf:0, veh:0, heavy:0, air:0, missile:0};
  for(const u of G.units){ if(u.dead||u.owner!==tgt||!u.def.weapon) continue;
    if(u.type==='tel'||u.type==='mlrs') c.missile++; else if(u.def.cls==='air') c.air++; else if(u.def.armor==='heavy') c.heavy++; else if(u.def.cls==='veh') c.veh++; else c.inf++; }
  const noise=l>=3?0.1:0.25, f=v=>v?Math.max(1,Math.round(v*(1+(hashT(tgt,v)-0.5)*2*noise))):0;
  return {inf:f(c.inf), veh:f(c.veh), heavy:f(c.heavy), air:f(c.air), missile:f(c.missile)};
}
// gleichbleibendes Rauschen für etwa eine Minute (keine flackernden Zahlen)
const hashT=(a,b)=>{ const x=Math.sin(a*12.9898+b*78.233+Math.floor(G.t/60)*37.7)*43758.5453; return x-Math.floor(x); };
/** laufende Forschung der Gegenseite (Lagebericht ab Stufe 3) */
export function researchIntel(obs,tgt){
  if(intelLevel(obs)<INTEL.researchAt) return knows(obs,tgt).research;
  const q=G.players[tgt].q.research[0]; return q?q.type:null;
}
/** hat obs (KI) von einer Bedrohung erfahren? */
export const aiKnowsThreat=(obs,tgt,key)=>{ const K=knows(obs,tgt); return !!(K.tech[key]||K.units[key]||(UNITS[key]&&K.units[key])); };
/** Meisterschaft: genug Forschungen eines Zweigs */
export function mastery(p,branch){ let n=0; for(const k in (p.done||{})) if(RESEARCH[k]&&!RESEARCH[k].level&&RESEARCH[k].branch===branch) n++; return n>=RTREE.master; }
export function branchCount(p,branch){ let n=0; for(const k in (p.done||{})) if(RESEARCH[k]&&!RESEARCH[k].level&&RESEARCH[k].branch===branch) n++; return n; }

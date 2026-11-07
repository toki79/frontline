import { EVENTS, MAJORS, T, UNITS, AIS } from '../data/config';
import { G } from '../sim/state';
import { msg } from '../core/events';
import { dist, idx, inMap } from '../core/util';
import { findBuilding, spawnAt } from '../sim/world';
import { SIDE_TF } from '../sim/mapgen';
import { offerHandlers, showOffer } from '../sim/offers';

/* =====================================================================
   Ereignisse im Tal
   ---------------------------------------------------------------------
   Alle 6–10 Minuten passiert etwas, das alle Mächte gleich trifft:
   Wetter (Dürre, Rekordernte, Winter), Funde, Flüchtlinge, ein
   Banditenkönig, Preisschocks am Markt, ein Landesfest, Söldner.
   Andauernde Ereignisse wirken über evMul() auf Ernte, Tempo, Stimmung
   und Marktpreise.
   ===================================================================== */
const E=EVENTS.list;
export const evState=()=>(G.ev||(G.ev={next:EVENTS.first, on:{}, last:''}));
/** läuft das Ereignis gerade? */
export const evOn=k=>{ const S=G&&G.ev; return !!(S&&S.on[k]&&G.t<S.on[k]); };
/** Faktor eines laufenden Ereignisses (food, speed …); 1 wenn keines */
export function evMul(field:string){ const S=G&&G.ev; if(!S) return 1; let m=1; for(const k in S.on) if(G.t<S.on[k]&&E[k]&&E[k][field]!=null) m*=E[k][field]; return m; }
/** Stimmungsbonus/-malus laufender Ereignisse */
export function evMood(){ const S=G&&G.ev; if(!S) return 0; let m=0; for(const k in S.on) if(G.t<S.on[k]&&E[k]&&E[k].mood) m+=E[k].mood; return m; }
/** Preisfaktor am Markt */
export function evMarket(key:string){ const S=G&&G.ev; if(!S) return 1; let m=1; for(const k in S.on) if(G.t<S.on[k]&&E[k]&&E[k].market&&E[k].market[key]) m*=E[k].market[key]; return m; }
/** laufende Ereignisse für die Anzeige */
export function evActive(){ const S=G&&G.ev; if(!S) return []; return Object.keys(S.on).filter(k=>G.t<S.on[k]&&E[k]).map(k=>({key:k, ...E[k], left:S.on[k]-G.t})); }
/** jede Sekunde */
export function updateEvents(){
  const S=evState();
  for(const k in S.on) if(G.t>=S.on[k]){ delete S.on[k]; if(E[k]) msg(`${E[k].icon} ${E[k].name} ist vorbei.`,'#b8c8e0'); }
  if(G.t<S.next) return;
  S.next=G.t+EVENTS.gap[0]+Math.random()*(EVENTS.gap[1]-EVENTS.gap[0]);
  const keys=Object.keys(E).filter(k=>k!==S.last&&!S.on[k]&&!(k==='winter'&&S.on.ernte)&&!(k==='ernte'&&(S.on.duerre||S.on.winter))&&!(k==='duerre'&&S.on.ernte)&&!(k==='soeldner'&&G.offer));
  let x=Math.random()*keys.reduce((a,k)=>a+E[k].w,0), k=keys[0]; for(const c of keys){ x-=E[c].w; if(x<0){ k=c; break; } }
  fire(k);
}
/** Ereignis auslösen (auch für Tests) */
export function fire(k:string){
  const S=evState(), e=E[k]; if(!e) return false; S.last=k;
  if(k==='fund'&&!newDeposits()) return false;
  if(e.dur) S.on[k]=G.t+e.dur;
  msg(`${e.icon} ${e.name}: ${e.txt}${e.tip?` ➜ ${e.tip}.`:''}`,'#e8d48a');
  if(k==='fluecht') for(const pid of MAJORS){ const p=G.players[pid]; if(!findBuilding(pid,'hq')) continue; const n=Math.max(0,Math.min(e.pop,p.cap-p.pop)); p.pop+=n; if(pid===0) msg(n>0?`🧳 ${Math.round(n)} Flüchtlinge ziehen bei uns ein.`:'🧳 Kein freier Wohnraum – die Flüchtlinge ziehen weiter.','#b8c8e0'); }
  if(k==='banditen'){ for(const c of G.buildings) if(!c.dead&&c.type==='camp'){ c.raidT=Math.min(c.raidT??999,90+Math.random()*60); c.kingBonus=e.extra; } }
  if(k==='soeldner') mercs();
  return true;
}
/** neue Erz-, Öl- oder Felsvorkommen: dieselbe Lage für jede Stadt (gespiegelt) */
function newDeposits(){
  const W=Math.sqrt(G.terr.length), layer=Math.random()<0.5?G.ore:Math.random()<0.6?G.oil:G.rock, rich=layer===G.ore?1100:layer===G.oil?600:1500;
  for(let tries=0;tries<40;tries++){
    const a=Math.random()*Math.PI*2, r=22+Math.random()*14, cx=Math.floor(W/2-Math.abs(Math.cos(a))*r*0.7), cy=Math.floor(W/2+Math.abs(Math.sin(a))*r*0.7+8);
    const spots=MAJORS.map(pid=>SIDE_TF[pid](cx,cy));
    const ok=spots.every(([x,y])=>{ for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){ const X=x+dx,Y=y+dy; if(!inMap(X,Y)) return false; const i=idx(X,Y), t=G.terr[i];
        if(t===T.WATER||t===T.BRIDGE||G.occ[i]||G.road[i]||G.ore[i]||G.oil[i]||G.rock[i]) return false; }
      return !G.buildings.some(b=>!b.dead&&dist(b.x,b.y,x,y)<6); });
    if(!ok) continue;
    for(const [x,y] of spots) for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){ if(dx*dx+dy*dy>5||Math.random()<0.15) continue; const i=idx(x+dx,y+dy);
      if(G.terr[i]===T.FOREST){ G.terr[i]=T.GRASS; G.wood[i]=0; } if(G.terr[i]===T.MUD||G.terr[i]===T.MEADOW) G.terr[i]=T.GRASS; layer[i]=rich*(0.8+Math.random()*0.4); G.terrChanged.push(i); }
    const [px,py]=spots[0], hq=findBuilding(0,'hq'); G.evFound={x:px+0.5,y:py+0.5,t:G.t};
    if(hq){ const dx=px-hq.x, dy=py-hq.y, d=Math.round(Math.hypot(dx,dy)), dir=Math.abs(dx)>Math.abs(dy)*2?(dx>0?'Osten':'Westen'):Math.abs(dy)>Math.abs(dx)*2?(dy>0?'Süden':'Norden'):`${dy>0?'Süd':'Nord'}${dx>0?'osten':'westen'}`;
      msg(`⛏ Unser neues ${layer===G.ore?'Erzvorkommen':layer===G.oil?'Ölfeld':'Felsgestein'} liegt etwa ${d} Felder im ${dir} der Stadt.`,'#b8c8e0'); }
    return true;
  }
  return false;
}
/** Söldner: zuerst Aldoria, lehnt es ab, greift die reichste KI zu */
function mercs(){
  const e=E.soeldner; showOffer({type:'merc', from:2, price:e.price, units:e.units});
}
function spawnMercs(pid,units){ const hq=findBuilding(pid,'hq'); if(!hq) return;
  units.forEach((t,i)=>{ if(UNITS[t]) spawnAt(pid,t,hq.x+2.5+(i%3)*0.7,hq.y+3+Math.floor(i/3)*0.7); }); }
offerHandlers.merc=(o,yes)=>{
  const P=G.players[0];
  if(yes&&P.res.money>=o.price){ P.res.money-=o.price; spawnMercs(0,o.units); msg(`🗡 Die Söldner (${o.units.length} Trupps) stehen am Rathaus bereit.`,'#9fd88a'); return; }
  const ai=AIS.filter(f=>findBuilding(f,'hq')&&G.players[f].res.money>=o.price+800).sort((a,b)=>G.players[b].res.money-G.players[a].res.money)[0];
  if(ai!==undefined){ G.players[ai].res.money-=o.price; spawnMercs(ai,o.units); msg(`🗡 Die Söldner ziehen weiter – ${G.known[0][ai]?G.players[ai].short:'eine fremde Macht'} hat sie angeworben.`,'#ffb38a'); }
  else msg('🗡 Die Söldner ziehen ohne Auftrag weiter.','#b8c8e0');
};

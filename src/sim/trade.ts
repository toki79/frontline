import { dist } from '../core/util';
import { BASEVAL, RES, TRADE } from '../data/config';
import { distTo } from '../sim/combat';
import { needLevel } from '../sim/market';
import { setPath } from '../sim/pathfinding';
import { G } from '../sim/state';
import { findBuilding, freeTileAround, makeUnit } from '../sim/world';
import { msg } from '../core/events';

/* =====================================================================
   Handelsverträge: dauerhafter Tausch von Rohstoffen
   ---------------------------------------------------------------------
   Voraussetzung: Botschaft bei der Gegenseite (Diplomat ist dort angekommen)
   und ein eigenes Handelskontor. Alle TRADE.period Sekunden fährt von jeder
   Seite eine Karawane mit der vereinbarten Ware los. Karawanen können
   überfallen werden. Der Vertrag läuft, bis eine Seite kündigt.
   ===================================================================== */
export interface Contract { id:number; a:number; b:number; give:{res:string,amt:number}; get:{res:string,amt:number}; next:number; miss:number[]; done:number; since:number }

/** Wert einer Ware für eine Partei (Bedarf erhöht, Überschuss senkt) */
const worth=(pid,res,amt)=>BASEVAL[res]*amt*(1+0.6*Math.max(-0.8,needLevel(pid,res)));
/** Bewertung aus Sicht von b (bekommt give, liefert get) */
export function evalContract(b,give,get){
  const P=G.players[b], recv=worth(b,give.res,give.amt), cost=worth(b,get.res,get.amt);
  const canSupply=P.res[get.res]>=get.amt*1.5||G.profile[b].rich.includes(get.res);
  const reasons=[];
  if(G.war) reasons.push('Krieg');
  if(!canSupply) reasons.push(`zu wenig ${RES[get.res].name}`);
  if(give.res===get.res) reasons.push('gleiche Ware');
  if(G.aiAtt<-30) reasons.push('Misstrauen');
  if(G.contracts.filter(c=>c.a===0&&c.b===b).length>=TRADE.maxContracts) reasons.push('genug Verträge');
  const ratio=recv/Math.max(1,cost);
  if(ratio<TRADE.margin) reasons.push('Angebot zu schwach');
  return {ok:!reasons.length, ratio, reasons};
}
export const hasEmbassy=(a,b)=>!!(G.embassy&&G.embassy[a]&&G.embassy[a][b]);
/** Vertrag vorschlagen (Spieler a an Partei b). Ergebnis: Vertrag oder Begründung */
export function proposeContract(a,b,give,get){
  if(!hasEmbassy(a,b)) return {ok:false,reasons:['keine Botschaft']};
  if(!findBuilding(a,'kontor')) return {ok:false,reasons:['kein Handelskontor']};
  const e=evalContract(b,give,get); if(!e.ok) return e;
  const c: Contract={id:G.nextId++, a, b, give:{...give}, get:{...get}, next:G.t+5, miss:[0,0], done:0, since:G.t};
  G.contracts.push(c); G.aiAtt=Math.min(100,G.aiAtt+5);
  return {ok:true, c};
}
export function cancelContract(c,by,why?){
  const i=G.contracts.indexOf(c); if(i<0) return; G.contracts.splice(i,1);
  if(c.a===0||c.b===0){ const other=c.a===0?c.b:c.a;
    msg(by===0?`Handelsvertrag mit ${G.players[other].short} gekündigt.`:`📜 ${G.players[by].short} kündigt den Handelsvertrag${why?` (${why})`:''}.`,'#d6b45a'); }
  if(by===0) G.aiAtt=Math.max(-100,G.aiAtt-8);
}
/** Endpunkt einer Handelsroute: Handelskontor, sonst Rathaus */
export const tradePost=pid=>findBuilding(pid,'kontor')||findBuilding(pid,'hq');
function dispatch(c,from,to,res,amt){
  const P=G.players[from], src=from===0?findBuilding(0,'kontor'):tradePost(from), dst=tradePost(to);
  if(!src||!dst||P.res[res]<amt){ c.miss[from===c.a?0:1]++;
    if(from===0) msg(`⚠ Handelsvertrag: Lieferung von ${amt} ${RES[res].icon} fiel aus (${!src?'kein Handelskontor':'zu wenig '+RES[res].name}).`,'#ffb38a');
    return; }
  P.res[res]-=amt;
  const spot=freeTileAround(src,'veh'); if(!spot){ P.res[res]+=amt; return; }
  const u=makeUnit(from,'caravan',spot.x+0.5,spot.y+0.5);
  u.cargoRes=res; u.cargoAmt=amt; u.dest=dst; u.contract=c.id; u.mode='trade'; setPath(u,dst.x,dst.y);
}
/** jede Sekunde: fällige Lieferungen abschicken, Verträge prüfen */
export function updateTrade(){
  for(const c of [...G.contracts]){
    if(G.war){ cancelContract(c,c.b,'Krieg'); continue; }
    if(G.t>=c.next){ c.next=G.t+TRADE.period;
      dispatch(c,c.a,c.b,c.give.res,c.give.amt); dispatch(c,c.b,c.a,c.get.res,c.get.amt); }
    if(c.miss[0]>=TRADE.missLimit){ cancelContract(c,c.b,'ihr habt nicht geliefert'); continue; }
    if(c.miss[1]>=TRADE.missLimit){ cancelContract(c,c.a,'Kastrova liefert nicht'); continue; }
    // KI prüft gelegentlich, ob sich der Vertrag noch lohnt
    if(c.b===1&&Math.random()<1/45){ const r=worth(1,c.give.res,c.give.amt)/Math.max(1,worth(1,c.get.res,c.get.amt)); if(r<0.7) cancelContract(c,1,'lohnt sich nicht mehr'); }
  }
}
/** Karawane: fährt zum Ziel und liefert ab */
export function updateCaravan(u){
  if(!u.dest||u.dead) return;
  if(u.dest.dead){ u.dest=tradePost(u.dest.owner)||null; if(!u.dest){ u.dead=true; return; } setPath(u,u.dest.x,u.dest.y); }
  if(distTo(u,u.dest)<1.4){ const R=G.players[u.dest.owner]; R.res[u.cargoRes]+=u.cargoAmt;
    const c=G.contracts.find(c=>c.id===u.contract); if(c){ c.done++; if(c.b===1) G.aiAtt=Math.min(100,G.aiAtt+0.5); }
    if(u.dest.owner===0) msg(`🚚 Handelskarawane angekommen: +${u.cargoAmt} ${RES[u.cargoRes].icon}`,'#9fd88a');
    u.dead=true; return; }
  if(!u.path||u.pathI>=u.path.length){ u.repathT=(u.repathT||0)-1; if(u.repathT<=0){ u.repathT=3; setPath(u,u.dest.x,u.dest.y); } }
}
/** Diplomat: erreicht er das Rathaus der Gegenseite, entsteht dort eine Botschaft */
export function updateDiplomat(u){
  if(u.mission===undefined||u.mission===null) return;
  const hq=findBuilding(u.mission,'hq'); if(!hq){ u.mission=null; return; }
  if(G.war&&u.mission===1){ u.mission=null; if(u.owner===0) msg('Im Krieg empfängt Kastrova keine Diplomaten.','#ffb38a'); return; }
  if(distTo(u,hq)<1.3){ G.embassy[u.owner][u.mission]=true; u.dead=true; G.sel=G.sel.filter(s=>s!==u);
    if(u.owner===0){ msg(`🏛 Botschaft bei ${G.players[u.mission].name} eröffnet – Handelsverträge sind jetzt über 🤝 möglich.`,'#9fd88a'); G.aiAtt=Math.min(100,G.aiAtt+6); } }
}
export function sendDiplomats(units,target){
  let n=0; for(const u of units){ if(!u.def.diplomat) continue; u.mission=target.owner; u.mode='move'; u.goal={x:target.x,y:target.y}; setPath(u,target.x,target.y); n++; } return n;
}
/** Handelsroute (für die Karte): von wo nach wo laufen Karawanen? */
export function tradeRoutes(){ const out=[]; for(const c of G.contracts){ const a=findBuilding(c.a,'kontor'), b=tradePost(c.b); if(a&&b) out.push({a,b,c}); } return out; }
export function dist2(a,b){ return dist(a.x,a.y,b.x,b.y); }

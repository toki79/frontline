import { dist } from '../core/util';
import { G } from '../sim/state';
import { setPath } from '../sim/pathfinding';
import { nearestPassable } from '../sim/world';
import { msg } from '../core/events';

/* =====================================================================
   Truppentransport: Infanterie steigt in Mannschaftstransporter und
   Amphibienpanzer ein, fährt geschützt mit und sitzt am Ziel ab.
   Mitfahrende bleiben in G.units (u.carried), werden aber weder gezeichnet
   noch beschossen; sie folgen der Position ihres Fahrzeugs.
   ===================================================================== */
export const canRide = u => u.def.cls==='inf' && !u.def.carry && !u.def.worker && !u.def.diplomat;
export const aboard = c => (c.passengers||[]).filter(u=>!u.dead);
export const freeSeats = c => (c.def.carry||0) - aboard(c).length;
/** Infanterie zum Fahrzeug schicken – steigt ein, sobald sie es erreicht. Ergebnis: Anzahl */
export function orderBoard(units,c){
  let n=0, seats=freeSeats(c) - units.filter(u=>u.boardOn===c).length;
  for(const u of units){ if(seats<=0) break; if(!canRide(u)||u.carried||u.owner!==c.owner) continue;
    u.mode='board'; u.boardOn=c; u.target=null; u.order=null; u.escort=null; u.dug=false; setPath(u,c.x,c.y); u.repathT=1; seats--; n++; }
  return n;
}
function embark(u,c){ c.passengers=aboard(c).concat([u]); u.carried=true; u.carrier=c; u.boardOn=null; u.path=null; u.target=null; u.mode='idle'; G.sel=G.sel.filter(s=>s!==u); }
/** Absitzen rund um das Fahrzeug */
export function unload(c, hurt=0){
  const ps=aboard(c); c.passengers=[];
  ps.forEach((u,i)=>{ const a=i/Math.max(1,ps.length)*6.283, p=nearestPassable(c.x+Math.cos(a)*1.2,c.y+Math.sin(a)*1.2,'inf');
    u.carried=false; u.carrier=null; u.x=p?p.x+0.5:c.x; u.y=p?p.y+0.5:c.y; u.mode='idle'; u.guard={x:u.x,y:u.y}; u.path=null;
    if(hurt){ u.hp-=u.maxHp*hurt; u.lastHit=G.t; if(u.hp<=0){ u.dead=true; if(u.owner===0) G.stats.lost++; } } });
  return ps.length;
}
/** je Takt: Mitfahrende folgen dem Fahrzeug, Einsteigende laufen hin */
export function updateRider(u,dt){
  if(u.carried){ const c=u.carrier; if(!c||c.dead){ u.carried=false; u.carrier=null; u.mode='idle'; u.guard={x:u.x,y:u.y}; return; } u.x=c.x; u.y=c.y; return true; }
  if(u.mode==='board'){ const c=u.boardOn;
    if(!c||c.dead||freeSeats(c)<=0){ u.mode='idle'; u.boardOn=null; u.guard={x:u.x,y:u.y}; return; }
    if(dist(u.x,u.y,c.x,c.y)<1.6){ embark(u,c); if(u.owner===0&&G.t-(G.boardMsg||-9)>1){ G.boardMsg=G.t; msg(`🚚 An Bord: ${aboard(c).length}/${c.def.carry} Trupps im ${c.def.name.replace(/­/g,'')}.`); } return true; }
    u.repathT-=dt; if(u.repathT<=0||!u.path){ u.repathT=1; setPath(u,c.x,c.y); } }
}
/** Fahrzeug zerstört: Mitfahrende springen ab, verletzt */
export function bailOut(c){ const n=aboard(c).length; if(!n) return; unload(c,0.45); if(c.owner===0) msg(`💥 ${c.def.name.replace(/­/g,'')} zerstört – ${n} Trupp${n===1?'':'s'} abgesprungen, verletzt.`,'#ff8a7a'); }

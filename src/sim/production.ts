import { idx, inMap } from '../core/util';
import { BUILDINGS, BUILD_RADIUS, DEF, DEF_RADIUS, ECON, FEATURES, RESEARCH, T, TECH_UNLOCKS, TERRAIN, UNITS } from '../data/config';
import { canAfford, pay } from '../sim/costs';
import { G } from '../sim/state';
import { findBuilding, placeBuilding, rectDist, ringTiles, spawnUnit } from '../sim/world';
import { autoAccess, canPlaceRoad, findWorking, forestTilesNear, hasRockNear, planRoad } from '../sim/build';
import { msg } from '../core/events';

/* =====================================================================
   Produktion: Einheiten (Rathaus, Kaserne, Werk, Werkstatt) und Forschung.
   Gebäude haben keine Warteschlange – sie werden als Baustelle gesetzt.
   ===================================================================== */
export function queueName(type){return RESEARCH[type]?'research':BUILDINGS[type]||FEATURES[type]?null:UNITS[type].prod;}
export function missingReq(pid,type){
  const d=DEF(type), miss=[];
  const prod = RESEARCH[type] ? 'university' : (BUILDINGS[type]||FEATURES[type]) ? 'hq' : d.prod;
  if(!prod) return ['—'];
  if(!findBuilding(pid,prod)) miss.push(BUILDINGS[prod].name);
  for(const r of (d.req||[])) if(!findBuilding(pid,r)) miss.push(BUILDINGS[r].name);
  const p=G.players[pid];
  if(d.tech&&p.tech<d.tech) miss.push(`Universität Stufe ${d.tech}`);
  if(RESEARCH[type]&&p.tech<d.level-1) miss.push(`Stufe ${d.level-1}`);
  return miss;
}
export const available=(pid,type)=>missingReq(pid,type).length===0;
export function enqueue(pid,type){
  const p=G.players[pid], qn=queueName(type), q=p.q[qn]; if(!q) return false;
  if(!available(pid,type)||!canAfford(pid,type)) return false;
  if(qn==='research'&&(q.length||p.tech>=DEF(type).level)) return false;
  if(q.length>=(qn==='factory'?2:qn==='droneshop'?3:6)) return false;   // Fahrzeuge nur in kleinen Stückzahlen vorbestellen
  pay(pid,type,1); q.push({type,t:0,time:DEF(type).time}); return true;
}
export function cancelItem(pid,type){
  const p=G.players[pid], q=p.q[queueName(type)]; if(!q) return false;
  for(let i=q.length-1;i>=0;i--) if(q[i].type===type){pay(pid,type,-1);q.splice(i,1);return true;}
  return false;
}
export function updateProduction(pid,dt){
  const p=G.players[pid], f=(p.use>p.power?0.5:1)*(p.broke?ECON.brokeFactor:1);
  for(const qn of ['hq','barracks','factory','droneshop','research']){
    const q=p.q[qn]; if(!q.length) continue;
    const producer=findWorking(pid, qn==='research'?'university':qn); if(!producer) continue;   // ohne Zufahrt ruht die Produktion
    const it=q[0]; it.t+=dt*f;
    if(it.t>=it.time){
      if(qn==='research'){ const L=RESEARCH[it.type].level; q.shift(); p.tech=Math.max(p.tech,L);
        if(pid===0) msg(`🎓 Universität Stufe ${L} erreicht: ${TECH_UNLOCKS[L]} freigeschaltet.`,'#9fd88a');
        else msg(`Geheimdienst: Kastrova hat Forschungsstufe ${L} erreicht (${TECH_UNLOCKS[L]}).`,'#d6b45a'); }
      else if(spawnUnit(pid,it.type,producer)){q.shift();}
      else it.t=it.time;
    }
  }
}
export function tileFree(i){return TERRAIN[G.terr[i]].build&&G.oil[i]<=0&&G.ore[i]<=0&&G.rock[i]<=0&&!G.road[i]&&!G.occ[i];}
export function nearOwn(pid,tx,ty,w,h){
  for(const b of G.buildings){ if(b.dead||b.owner!==pid) continue;
    const dx=Math.max(b.tx-(tx+w), tx-(b.tx+b.w), 0), dy=Math.max(b.ty-(ty+h), ty-(b.ty+b.h), 0);
    if(Math.max(dx,dy)<=BUILD_RADIUS) return true; }
  return false;
}
export function canPlace(pid,type,tx,ty){
  const d=BUILDINGS[type];
  for(let y=ty;y<ty+d.h;y++)for(let x=tx;x<tx+d.w;x++){ if(!inMap(x,y)||!tileFree(idx(x,y))) return false; }
  if(d.needsOre&&!ringTiles(tx,ty,d.w,d.h).some(i=>G.ore[i]>0)) return false;
  if(d.needsRock&&!hasRockNear(tx,ty,d.w,d.h)) return false;
  if(d.needsForest&&forestTilesNear(tx,ty,d.w,d.h).length<3) return false;
  return nearOwn(pid,tx,ty,d.w,d.h);
}
export function tileBuildable(pid,x,y){ return tileFree(idx(x,y)) && nearOwn(pid,x,y,1,1); }
// Verteidigung: direkt auf der Karte bauen (ohne Rathaus-Warteschlange)
export function canPlaceDef(pid,type,x,y){
  if(FEATURES[type]&&FEATURES[type].road) return canPlaceRoad(pid,x,y);
  if(!inMap(x,y)) return false; const i=idx(x,y), t=G.terr[i];
  if(t===T.WATER||t===T.BRIDGE||G.occ[i]||G.oil[i]>0||G.ore[i]>0||G.rock[i]>0||G.road[i]) return false;
  if(FEATURES[type]){ if(G.feat[i]) return false; if(type==='trench'&&t!==T.GRASS&&t!==T.MUD) return false; }
  else { if(!TERRAIN[t].build||G.feat[i]) return false; for(const u of G.units) if(!u.dead&&u.def.cls!=='air'&&Math.floor(u.x)===x&&Math.floor(u.y)===y&&u.owner!==pid) return false; }
  for(const b of G.buildings) if(!b.dead&&b.owner===pid&&!b.def.def&&rectDist(b,x,y,1,1)<=DEF_RADIUS) return true;
  return false;
}
export function placeDefense(pid,type,x,y){
  if(FEATURES[type]&&FEATURES[type].road) return !missingReq(pid,type).length&&planRoad(pid,x,y);
  if(!canPlaceDef(pid,type,x,y)||missingReq(pid,type).length||!canAfford(pid,type)) return false;
  pay(pid,type,1);
  if(FEATURES[type]) G.feat[idx(x,y)]=FEATURES[type].id; else placeBuilding(pid,type,x,y,false);
  return true;
}
/** Baustelle beauftragen: Kosten werden sofort bezahlt, Bauarbeiter erledigen den Rest. */
export function placeSite(pid,type,tx,ty){
  if(!BUILDINGS[type]||BUILDINGS[type].def||!canPlace(pid,type,tx,ty)||missingReq(pid,type).length||!canAfford(pid,type)) return null;
  pay(pid,type,1);
  const b=placeBuilding(pid,type,tx,ty,false,true);
  b.access=autoAccess(pid,b);   // Zufahrt gleich mitplanen (>0 Felder, 0 schon da, -1 kein Weg, -2 zu wenig Stein)
  return b;
}

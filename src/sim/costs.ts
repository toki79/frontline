import { DEF, DRONES_PER_SHOP, ECON, UNITS, VEH_PER_FACTORY } from '../data/config';
import { G } from '../sim/state';
import { countBuildings } from '../sim/world';

// ---------- Kosten ----------
export const costOf=t=>DEF(t).cost||{};
export function lacking(pid,type){
  const p=G.players[pid], c=costOf(type), out=[];
  for(const k in c){ if(k==='pop'){ if(p.pop-c.pop<ECON.minPop) out.push('pop'); } else if((p.res[k]||0)<c[k]) out.push(k); }
  const d=DEF(type);
  if(d.combat&&combatVehicles(pid)>=VEH_PER_FACTORY*countBuildings(pid,'factory')) out.push('vehcap');
  if(UNITS[type]&&UNITS[type].cls==='air'&&droneCount(pid)>=DRONES_PER_SHOP*countBuildings(pid,'droneshop')) out.push('dronecap');
  return out;
}
export const canAfford=(pid,type)=>lacking(pid,type).length===0;
export function combatVehicles(pid){let n=0;for(const u of G.units) if(!u.dead&&u.owner===pid&&u.def.combat) n++;for(const i of G.players[pid].q.factory) if(UNITS[i.type].combat) n++;return n;}
export function droneCount(pid){let n=0;for(const u of G.units) if(!u.dead&&u.owner===pid&&u.def.cls==='air') n++;return n+G.players[pid].q.droneshop.length;}
export function pay(pid,type,sign){const p=G.players[pid],c=costOf(type);for(const k in c){if(k==='pop')p.pop-=sign*c.pop;else p.res[k]-=sign*c[k];}}

import { AIR, BUILDINGS, DEF, DRONES_PER_SHOP, ECON, RESEARCH, RTREE, UNITS, VEH_PER_FACTORY, hasTech, isAI, FAMINE } from '../data/config';
import { G } from '../sim/state';
import { countBuildings } from '../sim/world';

// ---------- Kosten ----------
/** abgeschlossene Forschungen ohne die Universitätsstufen (für steigende Kosten und Meisterschaft) */
/** Hungersnot-Notstand (Nahrung war in den letzten FAMINE.window Sekunden aufgebraucht) */
export const famine=p=>!!p&&(p.res.food<=0||G.t-(p.famineT??-1e9)<FAMINE.window);
export const doneCount=p=>Object.keys((p&&p.done)||{}).filter(k=>RESEARCH[k]&&!RESEARCH[k].level).length;
const scale=(c,m)=>{ const o={}; for(const k in c) o[k]=k==='pop'?c[k]:Math.round(c[k]*m/10)*10; return o; };
/** Kosten – mit pid: Forschung wird mit jeder erforschten Technik teurer, Kfz-Industrie verbilligt Fahrzeuge */
export function costOf(t,pid?){ const c=DEF(t).cost||{}; if(pid===undefined) return c; const p=G.players[pid];
  const ai=isAI(pid)&&G.diff&&G.diff.aiTech?G.diff.aiTech:1;   // KI-Rabatt auf Forschung und Schlüsselgebäude
  if(RESEARCH[t]){ const n=RESEARCH[t].level?0:doneCount(p), m=(1+RTREE.rise*n)*ai; return m!==1?scale(c,m):c; }
  if(ai!==1&&(t==='university'||t==='factory')) return scale(c,ai);
  if(UNITS[t]&&UNITS[t].cls==='veh'&&hasTech(p,'cars')) return scale(c,RTREE.cars.cost);
  if(t==='farm'&&famine(p)&&(p.freeFarms||0)<FAMINE.freeFarms) return {...c, money:0};   // Not-Hof: die Bürger packen selbst an
  return c; }
export function lacking(pid,type){
  const p=G.players[pid], c0=costOf(type,pid), out=[];
  // Gebäude (Baustellen): beim Setzen zählt nur das Geld – Material wird beim Bauen geholt
  const c=BUILDINGS[type]&&!BUILDINGS[type].def&&BUILDINGS[type].buildable!==false?{money:c0.money||0}:c0;
  for(const k in c){ if(k==='pop'){ if(p.pop-c.pop<ECON.minPop) out.push('pop'); } else if((p.res[k]||0)<c[k]) out.push(k); }
  const d=DEF(type);
  if(d.combat&&combatVehicles(pid)>=VEH_PER_FACTORY*countBuildings(pid,'factory')) out.push('vehcap');
  if(UNITS[type]&&UNITS[type].prod==='droneshop'&&droneCount(pid)>=DRONES_PER_SHOP*countBuildings(pid,'droneshop')) out.push('dronecap');
  if(UNITS[type]&&UNITS[type].prod==='airbase'&&G.units.filter(u=>!u.dead&&u.owner===pid&&u.def.sortie).length+G.players[pid].q.airbase.length>=AIR.perBase*countBuildings(pid,'airbase')) out.push('jetcap');
  return out;
}
export const canAfford=(pid,type)=>lacking(pid,type).length===0;
export function combatVehicles(pid){let n=0;for(const u of G.units) if(!u.dead&&u.owner===pid&&u.def.combat) n++;for(const i of G.players[pid].q.factory) if(UNITS[i.type].combat) n++;return n;}
export function droneCount(pid){let n=0;for(const u of G.units) if(!u.dead&&u.owner===pid&&u.def.cls==='air'&&u.def.prod==='droneshop') n++;return n+G.players[pid].q.droneshop.length;}
export function pay(pid,type,sign){const p=G.players[pid],c=costOf(type,pid);for(const k in c){if(k==='pop')p.pop-=sign*c.pop;else p.res[k]-=sign*c[k];}}

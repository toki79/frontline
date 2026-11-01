import { dist } from '../core/util';
import { FORT, MAP_H, MAP_W } from '../data/config';
import { findPath } from '../sim/pathfinding';
import { G } from '../sim/state';
import { findBuilding, rectDist } from '../sim/world';

/* =====================================================================
   Stadtschutz: Zugänge zur Stadt und ungeschützte wichtige Gebäude
   ---------------------------------------------------------------------
   Zugang = Stelle, an der ein Angreifer (Weg vom Gegner, aus der Talmitte
   oder von den Rändern) den Ring um die Stadt erreicht. Dort lohnen
   Gräben, Stacheldraht, Stellungen und Bunker.
   ===================================================================== */
const own = pid => G.buildings.filter(b=>!b.dead&&!b.site&&b.owner===pid&&!b.def.def);
export function accessPoints(pid){
  G.access=G.access||{};
  const c=G.access[pid]; if(c&&G.t-c.t<FORT.recalc&&!G.qDirtyAccess) return c.pts;
  const hq=findBuilding(pid,'hq'), mine=own(pid); if(!hq||!mine.length){ G.access[pid]={t:G.t,pts:[]}; return []; }
  const foe=findBuilding(1-pid,'hq');
  const origins=[foe?{x:foe.x,y:foe.y}:null, {x:MAP_W/2,y:MAP_H/2}, {x:hq.x,y:MAP_H/2}, {x:MAP_W/2,y:hq.y}, {x:MAP_W-1-hq.x,y:hq.y+(MAP_H/2-hq.y)*0.4}].filter(Boolean);
  const pts=[];
  for(const o of origins){ if(dist(o.x,o.y,hq.x,hq.y)<FORT.accessRing+6) continue;
    const path=findPath(Math.floor(o.x),Math.floor(o.y),Math.floor(hq.x),Math.floor(hq.y),'veh');
    for(const s of path){ let near=1e9; for(const b of mine){ const d=rectDist(b,Math.floor(s.x),Math.floor(s.y),1,1); if(d<near) near=d; }
      if(near<=FORT.accessRing){ if(!pts.some(p=>dist(p.x,p.y,s.x,s.y)<6)) pts.push({x:s.x,y:s.y}); break; } } }
  G.access[pid]={t:G.t,pts}; return pts;
}
/** wichtige Gebäude ohne Schutz (keine Stellung/Bunker und keine Soldaten in der Nähe) */
export function unprotected(pid){
  return own(pid).filter(b=>FORT.critical.includes(b.type)&&!G.buildings.some(d=>!d.dead&&!d.site&&d.owner===pid&&d.def.def&&d.def.weapon&&rectDist(b,d.tx,d.ty,d.w,d.h)<=FORT.guardR)
    &&!G.units.some(u=>!u.dead&&u.owner===pid&&u.def.weapon&&u.def.cls!=='air'&&rectDist(b,Math.floor(u.x),Math.floor(u.y),1,1)<=FORT.guardR));
}

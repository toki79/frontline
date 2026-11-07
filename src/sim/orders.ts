import { groupPace } from '../sim/groups';
import { dist, idx, inMap } from '../core/util';
import { CAGE, MAP_W } from '../data/config';
import { G } from '../sim/state';
import { setPath } from '../sim/pathfinding';
import { dockOf } from '../sim/units';
import { nearestPassable, passable } from '../sim/world';

/* =====================================================================
   Befehle
   ===================================================================== */
export function formationSpots(gx,gy,n,cls){
  const s=nearestPassable(gx,gy,cls); if(!s) return [];
  const out=[], seen=new Set([idx(s.x,s.y)]), q=[s];
  while(q.length&&out.length<n){ const c=q.shift(); out.push({x:c.x+0.5,y:c.y+0.5});
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const x=c.x+dx,y=c.y+dy,i=idx(x,y);
      if(inMap(x,y)&&!seen.has(i)&&passable(x,y,cls)){seen.add(i);q.push({x,y});}} }
  return out;
}
export function orderMove(units,gx,gy,mode='move'){
  if(!units.length) return;
  const spots=formationSpots(gx,gy,units.length,units.every(u=>u.def.move==='amph'||u.def.cls==='air')&&units.some(u=>u.def.move==='amph')?'amph':'veh');   // Amphibien dürfen aufs Wasser
  const rest=[...units].sort((a,b)=>dist(a.x,a.y,gx,gy)-dist(b.x,b.y,gx,gy)), pace=groupPace(units);   // Verband: gemeinsames Tempo
  rest.forEach((u,i)=>{ const s=spots[i]||spots[spots.length-1]||{x:gx,y:gy};
    u.mode=mode; u.target=null; u.escort=null; u.patrol=false; u.patrolArea=null; u.resume=null; u.order=null; u.area=null; u.dug=false; u.dugCover=false; u.digT=0; u.fleeing=null; u.prevTarget=null; u.goal={x:s.x,y:s.y}; u.pace=pace; if(u.def.harvester&&mode!=='harvest') u.hs=null; setPath(u,s.x,s.y); u.repathT=1; });
}
export function orderAttack(units,t){
  const armed=units.filter(u=>u.def.weapon), other=units.filter(u=>!u.def.weapon);
  for(const u of armed){u.mode='attack';u.target=t;u.path=null;u.repathT=0;u.escort=null;u.order=null;u.area=null;u.dug=false;u.dugCover=false;u.fleeing=null;u.prevTarget=null;}
  if(other.length) orderMove(other,t.x,t.y);
}
export function orderStop(units){for(const u of units){u.mode='idle';u.escort=null;u.order=null;u.area=null;u.path=null;u.target=null;u.guard={x:u.x,y:u.y};if(u.def.harvester)u.hs=null;}}
/** Drohnen: Lauerstellung (FPV) bzw. Aufklärungsflug (Spionage/Reaper) umschalten */
export function orderLurk(units,on){ for(const u of units) if(u.def.weapon&&u.def.weapon.kamikaze){ u.lurk=on; if(on&&!u.post) u.post={x:u.x,y:u.y}; } }
export function orderPatrol(units,on){ for(const u of units) if(u.def.cls==='air'&&!u.def.sortie&&!(u.def.weapon&&u.def.weapon.kamikaze)){ u.patrol=on; u.patrolArea=null; u.mode=on?'patrol':'idle'; u.target=null; u.path=null; u.guard={x:u.x,y:u.y}; } }
/** Gitterkäfig nachrüsten (Fahrzeuge nahe einem eigenen Fahrzeugwerk). Ergebnis: Anzahl, -1 = kein Werk in der Nähe, -2 = zu wenig Geld/Metall */
export function upgradeCage(pid,units){
  const p=G.players[pid], cand=units.filter(u=>!u.dead&&u.owner===pid&&u.def.cls==='veh'&&!u.cage);
  if(!cand.length) return 0;
  const near=cand.filter(u=>G.buildings.some(b=>!b.dead&&!b.site&&b.owner===pid&&b.type==='factory'&&dist(b.x,b.y,u.x,u.y)<=CAGE.range));
  if(!near.length) return -1;
  let n=0; for(const u of near){ if(p.res.money<CAGE.cost.money||p.res.metal<CAGE.cost.metal) break; p.res.money-=CAGE.cost.money; p.res.metal-=CAGE.cost.metal; u.cage=true; n++; }
  return n||-2;
}
/** Begleitschutz: bewaffnete Einheiten folgen einem eigenen Arbeiter/Laster und verteidigen ihn */
export function orderEscort(units,t){ let n=0; for(const u of units){ if(!u.def.weapon||u===t) continue; u.mode='escort'; u.escort=t; u.target=null; u.path=null; u.repathT=0; n++; } return n; }
export function orderHarvest(trucks,tile){for(const u of trucks){u.mode='harvest';u.hs='toOil';u.oilTile=tile;u.target=null;setPath(u,tile%MAP_W+0.5,((tile/MAP_W)|0)+0.5);}}
export function orderReturn(trucks,ref){for(const u of trucks){u.mode='harvest';u.ref=ref;const dk=dockOf(ref);setPath(u,dk.x,dk.y);u.hs='toRef';}}

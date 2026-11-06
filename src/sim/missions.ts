import { dist } from '../core/util';
import { MISSION, isMajor } from '../data/config';
import { distTo } from '../sim/combat';
import { orderLurk, orderMove, orderPatrol } from '../sim/orders';
import { G } from '../sim/state';
import { detected, hostile, spotted } from '../sim/world';
import { msg } from '../core/events';

/* =====================================================================
   Einsätze: Stellung halten, Gebiet klären, Angriff – für Boden und Drohnen
   ---------------------------------------------------------------------
   u.order = 'hold' | 'clear' | 'assault', u.area = {x,y,r}, u.dug = eingegraben.
   ===================================================================== */
export type OrderKind = 'hold'|'clear'|'assault'|'move';
export const ORDER_NAME = {hold:'Stellung halten', clear:'Gebiet klären', assault:'Angriff', move:'Sammeln'};
const isFpv = u => !!(u.def.weapon&&u.def.weapon.kamikaze);
const isScout = u => u.def.cls==='air'&&!isFpv(u);

/** Befehl an eine Gruppe – jede Einheitenart setzt ihn passend um */
export function applyOrder(units, kind: OrderKind, x, y){
  if(!units.length) return 0;
  const id=G.nextId++, ground=units.filter(u=>u.def.cls!=='air'), fpv=units.filter(isFpv), scouts=units.filter(isScout);
  if(ground.length){
    const armed=ground.filter(u=>u.def.weapon), other=ground.filter(u=>!u.def.weapon);
    if(armed.length){ orderMove(armed,x,y,kind==='hold'||kind==='move'?'move':'amove');
      const r=kind==='clear'?MISSION.clearR:kind==='assault'?MISSION.assaultR:0;
      for(const u of armed){ u.order=kind==='move'?null:kind; u.msn=id; u.area=r?{x,y,r}:null; u.digT=0; u.dug=false; u.quietT=0; } }
    if(other.length) orderMove(other,x,y,'move');
  }
  if(fpv.length){ orderMove(fpv,x,y,'move'); orderLurk(fpv,kind!=='move'); }
  if(scouts.length){
    if(kind==='hold'||kind==='move') orderMove(scouts,x,y,'move');
    else if(kind==='assault'&&scouts.some(u=>u.def.weapon)){ orderMove(scouts.filter(u=>u.def.weapon),x,y,'amove'); const sp=scouts.filter(u=>!u.def.weapon); if(sp.length){ orderPatrol(sp,true); for(const u of sp) u.patrolArea={x,y,r:MISSION.scoutR}; } }
    else { orderPatrol(scouts,true); for(const u of scouts) u.patrolArea={x,y,r:MISSION.scoutR}; }
  }
  if(units[0].owner===0) G.missions=(G.missions||[]).concat([{id,kind,x,y,t:G.t,done:false}]).slice(-20);
  return units.length;
}
/** Leine: wie weit darf eine Einheit ihrem Ziel nachlaufen? (null = Standard) */
export function chaseLimit(u){ if(u.order==='hold') return 0; if(u.area) return u.area.r+2; return null; }
/** Schadensfaktor für eingegrabene Truppen */
export const dugFactor = t => t.dug ? (t.def.cls==='inf'?MISSION.dugInf:MISSION.dugVeh) : 1;

export function updateMission(u,dt){
  if(!u.order) return;
  const moving=!!(u.path&&u.path.length&&u.pathI<u.path.length);
  // Eingraben: nur wer still steht und Stellung hält
  if(u.order==='hold'&&u.mode==='idle'&&!moving){ u.digT=(u.digT||0)+dt; if(!u.dug&&u.digT>=MISSION.digTime){ u.dug=true; } }
  else if(moving){ u.digT=0; u.dug=false; }
  if((u.order==='clear'||u.order==='assault')&&u.mode==='idle'&&u.area){
    u.msnT=(u.msnT||0)-dt; if(u.msnT>0) return; u.msnT=0.8;
    if(u.target&&!u.target.dead) { u.quietT=0; return; }
    let best=null, bd=1e9; const A=u.area;
    for(const e of G.units){ if(e.dead||!hostile(u.owner,e.owner)||!detected(e,u.owner)) continue; if(e.def.cls==='air'&&!(u.def.weapon&&(u.def.weapon.type==='flak'||u.def.weapon.type==='autocannon'||u.def.weapon.type==='bullet'))) continue;
      const da=dist(e.x,e.y,A.x,A.y); if(da>A.r) continue; if(isMajor(u.owner)&&!spotted(u.owner,e.x,e.y)) continue; const d=dist(u.x,u.y,e.x,e.y); if(d<bd){bd=d;best=e;} }
    for(const b of G.buildings){ if(b.dead||!hostile(u.owner,b.owner)) continue; if(u.order==='clear'&&b.type!=='camp') continue;
      if(distTo({x:A.x,y:A.y},b)>A.r) continue; if(u.owner===0&&!b.seen&&G.fog) continue; const d=distTo(u,b)+1; if(d<bd){bd=d;best=b;} }
    if(best){ u.target=best; u.quietT=0; return; }
    u.quietT=(u.quietT||0)+0.8;
    if(u.quietT>=MISSION.quiet){   // geklärt: dort Stellung halten
      const m=(G.missions||[]).find(m=>m.id===u.msn); if(m&&!m.done&&u.owner===0){ m.done=true; msg(u.order==='clear'?'🔍 Gebiet geklärt – die Truppen halten dort Stellung.':'⚔ Angriffsziel genommen – die Truppen halten dort Stellung.','#9fd88a'); }
      u.order='hold'; u.area=null; u.digT=0; }
  }
}

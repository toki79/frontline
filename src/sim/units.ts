import { angDiff, clamp, dist, idx, inMap, rotTo } from '../core/util';
import { mcls, AIR, CAGE, DRONE, FEAT, JAM, LEASH, MAP_H, MAP_W, hasTech } from '../data/config';
import { applyDamage, distTo, findTarget, fire, homeTurf, splash, updateFire } from '../sim/combat';
import { setPath } from '../sim/pathfinding';
import { G } from '../sim/state';
import { detected, hostile, nearestPassable, passable, tileCost } from '../sim/world';
import { msg } from '../core/events';
import { updateRider } from '../sim/transport';
import { updateWorker } from '../sim/build';
import { checkMine, updatePioneer } from '../sim/pioneers';
import { updateCaravan, updateDiplomat } from '../sim/trade';
import { chaseLimit, updateMission } from '../sim/missions';

/* =====================================================================
   Einheiten-Update
   ===================================================================== */
export function updateUnit(u,dt){
  const d=u.def;
  if(u.carried||u.mode==='board'){ if(updateRider(u,dt)) return; if(u.carried) return; }   // Truppentransport / Luftlandung
  u.cd-=dt;
  if(u.target&&(u.target.dead||!hostile(u.owner,u.target.owner)||!detected(u.target,u.owner))){u.target=null;if(u.mode==='attack'){u.mode='idle';u.guard={x:u.x,y:u.y};}}
  let firing=false;
  if(d.weapon){
    u.scanT-=dt;
    if(u.scanT<=0){ u.scanT=0.35+Math.random()*0.2;
      // FPV greifen nur in Lauerstellung selbstständig an; Aufklärer auf Patrouille lassen sich nicht ablenken
      // bewaffnete Hochflieger (Reaper) jagen auch auf Patrouille
      if(d.swarm&&u.lurk===undefined) u.lurk=true;   // Schwärme suchen sich selbst Ziele
      if(u.mode!=='move'&&u.mode!=='attack'&&(u.mode!=='patrol'||d.armor==='airHigh')&&u.mode!=='recharge'&&u.mode!=='rtb'&&u.mode!=='rearm'&&u.mode!=='board'&&!(d.weapon.kamikaze&&!u.lurk)){
        if(!u.target||distTo(u,u.target)>rangeOf(u)){const t=findTarget(u,Math.max(d.sight,rangeOf(u))); if(t) u.target=t;}
      }
    }
    if(u.target&&d.weapon.minRange&&distTo(u,u.target)<d.weapon.minRange) u.target=null;   // zu nah für Raketen
    if(u.target&&d.weapon.kamikaze&&distTo(u,u.target)<=d.weapon.range+0.15){             // Drohne schlägt ein
      const t=u.target; applyDamage(t,d.weapon.dmg,'drone',u); splash(u.x,u.y,d.weapon.splash,d.weapon.dmg*0.4,'drone',u);
      fxAdd({k:'boom',x:u.x,y:u.y,r:0.6,life:0.5});
      if(d.swarm){ u.hp-=AIR.swarmHp; u.target=null; u.path=null; if(u.hp>0) return; }   // Schwarm: eine Drohne weniger
      u.dead=true; if(u.owner===0) G.stats.lost++; G.sel=G.sel.filter(s=>s!==u); return;
    }
    if(u.target){
      const t=u.target, dd=distTo(u,t), aim=Math.atan2(t.y-u.y,t.x-u.x);
      u.tur=rotTo(u.tur,aim,(d.cls==='inf'||d.cls==='air'?12:4)*dt);
      if(d.weapon.kamikaze){ if(!u.path||u.repathT<=0){u.repathT=0.3;setPath(u,t.x,t.y);} u.repathT-=dt; }
      else if(dd<=rangeOf(u)){
        firing=true; u.path=null;
        if(d.cls==='inf') u.angle=u.tur;
        if(Math.abs(angDiff(u.tur,aim))<0.2&&u.cd<=0){ fire(u,t); if(d.upkeep&&G.players[u.owner].fuelShort) u.cd*=2;
          if(d.sortie) returnToBase(u,t); }   // Flugzeug: Bombe ab, zurück zum Fliegerhorst
      } else {
        const lim=chaseLimit(u);
        if(lim===0||(u.mode==='idle'&&dist(u.x,u.y,u.guard.x,u.guard.y)>(lim??LEASH))){u.target=null;}   // Stellung halten: nicht nachlaufen
        else { u.repathT-=dt; if(!u.path||u.repathT<=0){u.repathT=1+Math.random()*0.3; setPath(u,t.x,t.y);} }
      }
    }
  }
  if(d.weapon&&d.weapon.kamikaze){   // Störsender in der Nähe: Verbindung weg, Drohne taumelt und stürzt ab
    u.jamT=(u.jamT||0)-dt; if(u.jamT<=0){ u.jamT=0.3; u.jammed=!d.swarm&&!hasTech(G.players[u.owner],'ai')&&G.units.some(j=>!j.dead&&j.def.jam&&hostile(u.owner,j.owner)&&dist(j.x,j.y,u.x,u.y)<=JAM.radius); }   // mit KI fliegen sie autonom
    if(u.jammed){ u.target=null; if(Math.random()<dt*3){ u.path=[{x:u.x+(Math.random()-.5)*2,y:u.y+(Math.random()-.5)*2}]; u.pathI=0; }
      if(Math.random()<dt*JAM.crashPerSec){ fxAdd({k:'boom',x:u.x,y:u.y,r:0.3,life:0.35}); u.dead=true; if(u.owner===0){ G.stats.lost++; msg('📡 Eine FPV-Drohne ist im Störfeld abgestürzt.','#ffb38a'); } G.sel=G.sel.filter(s=>s!==u); return; } }
  }
  if(u.order) updateMission(u,dt);
  if(d.harvester) updateHarvest(u,dt);
  if(d.worker) updateWorker(u,dt);
  if(d.pioneer) updatePioneer(u,dt);
  if(d.caravan) updateCaravan(u);
  if(d.diplomat) updateDiplomat(u);
  if(u.hp<u.maxHp&&G.t-(u.lastHit||-99)>15&&d.cls!=='air'&&(u.healChk=(u.healChk||0)-dt)<=0){ u.healChk=1; u.home=homeTurf(u); }
  if(u.home&&u.hp<u.maxHp&&G.t-(u.lastHit||-99)>15) u.hp=Math.min(u.maxHp,u.hp+u.maxHp*0.015*dt);   // Versorgung zu Hause
  if(d.sortie) updateSortie(u,dt);
  if(d.battery){   // Drohnen-Akku: entlädt sich außerhalb der eigenen Stadt (Schweben braucht wenig)
    const home=G.buildings.some(b=>!b.dead&&!b.site&&b.owner===u.owner&&!b.def.def&&distTo(u,b)<=9);
    if(home) u.battery=Math.min(d.battery,(u.battery??d.battery)+dt*4); else u.battery=(u.battery??d.battery)-dt*(u.path&&u.path.length?1:DRONE.hoverDrain);
    if(d.weapon&&d.weapon.kamikaze&&u.mode!=='recharge'&&(u.sigT=(u.sigT||0)-dt)<=0){ u.sigT=0.5;   // Funkreichweite der FPV-Drohnen
      const R=fpvRange(u.owner)+(d.swarm?AIR.swarmRangeExtra:0); let near=1e9; for(const b of G.buildings) if(!b.dead&&!b.site&&b.owner===u.owner){ const dd=distTo(u,b); if(dd<near) near=dd; }
      if(near<=R) u.lastSig={x:u.x,y:u.y};
      else if(u.lastSig){ u.target=null; u.mode='move'; u.goal={...u.lastSig}; u.post={...u.lastSig}; setPath(u,u.lastSig.x,u.lastSig.y);
        if(u.owner===0&&G.t-(G.sigMsg||-99)>20){ G.sigMsg=G.t; msg(`📡 FPV-Drohne am Rand der Funkreichweite (${R} Felder vom eigenen Gebiet) – sie kehrt um. Grenzbunker erweitern die Reichweite.`,'#ffb38a'); } } }
    updateDroneDuty(u,home);
    if(u.battery<=0){ fxAdd({k:'boom',x:u.x,y:u.y,r:0.25,life:0.3}); u.dead=true; if(u.owner===0){G.stats.lost++; msg('Eine Drohne ist mit leerem Akku abgestürzt.','#ffb38a');} G.sel=G.sel.filter(s=>s!==u); return; }
  }
  if(u.mode==='escort'){   // Begleitschutz: dicht beim Schützling bleiben, Ziele nicht zu weit verfolgen
    const e=u.escort;
    if(!e||e.dead){ u.mode='idle'; u.escort=null; u.guard={x:u.x,y:u.y}; }
    else { if(u.target&&dist(u.target.x,u.target.y,e.x,e.y)>7) u.target=null;
      if(!u.target&&dist(u.x,u.y,e.x,e.y)>2.2){ u.repathT-=dt; if(!u.path||u.repathT<=0){ u.repathT=0.8; setPath(u,e.x+(Math.random()-.5),e.y+(Math.random()-.5)); } }
      else if(!u.target&&u.path&&dist(u.x,u.y,e.x,e.y)<1.4) u.path=null; }
  }
  if(!u.target&&!u.path){
    u.repathT-=dt;
    if((u.mode==='amove'||u.mode==='move')&&u.goal&&dist(u.x,u.y,u.goal.x,u.goal.y)>0.9&&u.repathT<=0){u.repathT=1.5;setPath(u,u.goal.x,u.goal.y);}
    else if(u.mode==='idle'&&d.weapon&&dist(u.x,u.y,u.guard.x,u.guard.y)>1.5&&u.repathT<=0){u.repathT=2;setPath(u,u.guard.x,u.guard.y);}
  }
  if(u.path&&!firing){
    if(u.pathI>=u.path.length){ u.path=null; arrived(u); }
    else {
      const p=u.path[u.pathI];
      if(!passable(Math.floor(p.x),Math.floor(p.y),mcls(u))){u.path=null;u.repathT=0;return;}
      if(d.weapon&&d.weapon.kamikaze&&u.target){p.x=u.target.x;p.y=u.target.y;}
      const dx=p.x-u.x, dy=p.y-u.y, L=Math.hypot(dx,dy);
      const ti=idx(clamp(Math.floor(u.x),0,MAP_W-1),clamp(Math.floor(u.y),0,MAP_H-1));
      const c=tileCost(ti,mcls(u)); let spd=(u.pace&&(u.mode==='move'||u.mode==='amove')?Math.min(d.speed,u.pace):d.speed)/(c===Infinity?1:c)*(u.cage?CAGE.speed:1);   // Verband: im Tempo der Langsamsten
      if(d.upkeep&&G.players[u.owner].fuelShort) spd*=0.5;                        // Treibstoffmangel
      if(d.cls==='veh'&&G.feat[ti]===FEAT.WIRE) G.feat[ti]=0;                      // Fahrzeuge walzen Draht platt
      if(d.cls==='veh'&&G.feat[ti]===FEAT.MINE){ checkMine(u,ti); if(u.dead) return; }
      const step=spd*dt;
      if(L>0.01){ const want=Math.atan2(dy,dx); u.angle=d.cls==='inf'?want:rotTo(u.angle,want,5*dt); if(!u.target) u.tur=rotTo(u.tur,u.angle,5*dt); }
      if(L<=step){u.x=p.x;u.y=p.y;u.pathI++;}
      else {u.x+=dx/L*step;u.y+=dy/L*step;}
    }
  }
}
/** Flugzeug nach dem Abwurf: zurück zum nächsten Fliegerhorst, dort nachladen, dann dasselbe Ziel erneut anfliegen */
function returnToBase(u,t){
  u.strike=t; u.target=null; u.mode='rtb';
  let best=null,bd=1e9; for(const b of G.buildings) if(!b.dead&&!b.site&&!b.contam&&b.owner===u.owner&&b.type==='airbase'){ const d=dist(u.x,u.y,b.x,b.y); if(d<bd){bd=d;best=b;} }
  u.base=best; if(best) setPath(u,best.x,best.y); else { u.mode='idle'; u.guard={x:u.x,y:u.y}; }
}
export function updateSortie(u,dt){
  if(u.mode==='rtb'){ const b=u.base; if(!b||b.dead){ returnToBase(u,u.strike); return; }
    if(dist(u.x,u.y,b.x,b.y)<2.5){ u.path=null; u.mode='rearm'; u.rearmT=AIR.rearm; u.cd=AIR.rearm; } else if(!u.path) setPath(u,b.x,b.y); }
  else if(u.mode==='rearm'){ u.rearmT-=dt; u.cd=Math.max(u.cd,u.rearmT); if(u.hp<u.maxHp) u.hp=Math.min(u.maxHp,u.hp+u.maxHp*0.04*dt);
    if(u.rearmT<=0){ const t=u.strike; u.strike=null; u.cd=0;
      if(t&&!t.dead&&hostile(u.owner,t.owner)){ u.target=t; u.mode='attack'; } else { u.mode='idle'; u.guard={x:u.x,y:u.y}; } } }
}
/** Waffenreichweite einer Einheit (Gleitbomben verlängern die Abwurfweite der Flugzeuge) */
export const rangeOf = u => { const w=u.def.weapon; if(!w) return 0; return w.range+(w.glide&&hasTech(G.players[u.owner],'glidebomb')?AIR.glideExtra:0); };
/** Funkreichweite der FPV-Drohnen einer Partei (mit KI: autonom, weiter) */
export const fpvRange = pid => DRONE.fpvRange+(hasTech(G.players[pid],'ai')?DRONE.fpvRangeAI:0);
/** Drohnen: zum Laden heimfliegen, danach Posten bzw. Aufklärungsflug fortsetzen; Patrouille über die ganze Karte */
function updateDroneDuty(u,home){
  const d=u.def;
  if(u.mode!=='recharge'&&!home&&u.battery<d.battery*DRONE.returnAt&&u.mode!=='attack'){
    u.resume={patrol:!!u.patrol, post:u.post||null}; u.mode='recharge'; u.target=null;
    let best=null,bd=1e9; for(const b of G.buildings) if(!b.dead&&!b.site&&b.owner===u.owner&&!b.def.def){ const dd=dist(u.x,u.y,b.x,b.y)+(b.type==='droneshop'?-4:0); if(dd<bd){bd=dd;best=b;} }
    if(best) setPath(u,best.x,best.y); return; }
  if(u.mode==='recharge'){
    if(home&&!u.path) u.path=null;
    if(home&&u.battery>=d.battery-0.5){ const r=u.resume||{}; u.resume=null;
      if(r.patrol){ u.mode='patrol'; u.patrol=true; u.path=null; }
      else if(r.post){ u.mode='move'; u.goal={...r.post}; setPath(u,r.post.x,r.post.y); }
      else { u.mode='idle'; u.guard={x:u.x,y:u.y}; } }
    return; }
  if(u.mode==='patrol'&&(!u.path||u.pathI>=u.path.length)){   // nächster Wegpunkt: bevorzugt Unerforschtes bzw. gerade nicht Gesehenes
    const vis=u.owner===0?G.vis:G.vis1, A=u.patrolArea; let best=null,bs=-1e9;
    for(let k=0;k<10;k++){ const a=Math.random()*6.283, rr=A?Math.sqrt(Math.random())*A.r:0;
      const x=A?Math.max(1,Math.min(MAP_W-1,A.x+Math.cos(a)*rr)):2+Math.random()*(MAP_W-4), y=A?Math.max(1,Math.min(MAP_H-1,A.y+Math.sin(a)*rr)):2+Math.random()*(MAP_H-4), i=Math.floor(y)*MAP_W+Math.floor(x);
      const v=vis?vis[i]:1, s=(v===0?30:v===1?12:0)+Math.min(dist(u.x,u.y,x,y),30)*0.4+Math.random()*5; if(s>bs){bs=s;best={x,y};} }
    setPath(u,best.x,best.y); }
}
export function arrived(u){ if(u.mode==='move'||u.mode==='amove'){ u.mode='idle'; u.guard={x:u.x,y:u.y}; if(u.def.cls==='air') u.post={x:u.x,y:u.y}; } }
export function updateBuilding(b,dt){
  // Selbstreparatur, wenn längere Zeit kein Beschuss
  if(b.fire>0){ updateFire(b,dt); if(b.dead) return; }
  if(b.site) return;   // Baustelle: Zustand wächst mit dem Baufortschritt
  if(b.owner<2&&b.hp<b.maxHp&&G.t-(b.lastHit||-99)>12) b.hp=Math.min(b.maxHp,b.hp+b.maxHp*0.012*dt);
  const w=b.def.weapon; if(!w) return;
  if(b.readyT&&G.t<b.readyT) return;   // im Bau
  b.cd-=dt;
  if(b.target&&(b.target.dead||!hostile(b.owner,b.target.owner)||distTo(b,b.target)>w.range)) b.target=null;
  b.scanT-=dt; if(!b.target&&b.scanT<=0){b.scanT=0.4;b.target=findTarget(b,w.range);}
  if(b.target){
    const a=Math.atan2(b.target.y-b.y,b.target.x-b.x); b.tur=rotTo(b.tur,a,4*dt);
    if(Math.abs(angDiff(b.tur,a))<0.25&&b.cd<=0){const p=G.players[b.owner]; fire(b,b.target); if(p.use>p.power) b.cd*=2;}
  }
}
/* ---------- Tanklaster ---------- */
export function dockOf(r){const p=nearestPassable(r.tx+1,r.ty+r.h,'veh',4);return p?{x:p.x+0.5,y:p.y+0.5}:{x:r.x,y:r.ty+r.h+0.5};}
export function nearestRefinery(u){let best=null,bd=1e9;for(const b of G.buildings){if(b.dead||b.site||b.owner!==u.owner||b.type!=='refinery')continue;const d=dist(u.x,u.y,b.x,b.y);if(d<bd){bd=d;best=b;}}return best;}
export function oilNear(u,r){let best=-1,bd=1e9;for(let y=Math.floor(u.y-r);y<=u.y+r;y++)for(let x=Math.floor(u.x-r);x<=u.x+r;x++){if(!inMap(x,y))continue;const i=idx(x,y);if(G.oil[i]<=0)continue;const d=dist(u.x,u.y,x+0.5,y+0.5);if(d<=r+0.5&&d<bd){bd=d;best=i;}}return best;}
export function findOil(u){
  const ref=nearestRefinery(u); let best=-1,bs=1e9;
  const taken=new Map(); for(const o of G.units) if(!o.dead&&o!==u&&o.def.harvester&&o.oilTile>=0) taken.set(o.oilTile,(taken.get(o.oilTile)||0)+1);
  for(let i=0;i<G.oil.length;i++){ if(G.oil[i]<=0) continue; const x=i%MAP_W+0.5,y=((i/MAP_W)|0)+0.5;
    let s=dist(u.x,u.y,x,y)+(ref?dist(ref.x,ref.y,x,y)*0.7:0)+(taken.get(i)||0)*5;
    for(const b of G.buildings) if(!b.dead&&b.owner!==u.owner&&b.owner!==2&&dist(b.x,b.y,x,y)<12) s+=40;
    if(s<bs){bs=s;best=i;} }
  return best;
}
export function updateHarvest(u,dt){
  const H=u.def.harvester; if(!u.hs) return;
  switch(u.hs){
    case 'seek':{ if(u.cargo>=H.cap){u.hs='return';break;}
      u.repathT-=dt; if(u.repathT>0) break; u.repathT=1;
      const t=findOil(u); if(t<0){u.hs=null;u.mode='idle';if(u.owner===0)msg('Keine Ölvorkommen mehr erreichbar.');break;}
      u.oilTile=t; u.hs='toOil'; u.mode='harvest'; setPath(u,t%MAP_W+0.5,((t/MAP_W)|0)+0.5); break;}
    case 'toOil': if(!u.path){const t=oilNear(u,1.0); if(t>=0){u.hs='mine';u.oilTile=t;} else u.hs='seek';} break;
    case 'mine':{ let t=u.oilTile;
      if(t<0||G.oil[t]<=0||dist(u.x,u.y,t%MAP_W+0.5,((t/MAP_W)|0)+0.5)>1.3){ t=oilNear(u,1.5);
        if(t<0){u.hs=u.cargo>=H.cap*0.5?'return':'seek';break;} u.oilTile=t; }
      const amt=Math.min(H.rate*dt,G.oil[t],H.cap-u.cargo); G.oil[t]-=amt; u.cargo+=amt;
      if(G.oil[t]<=0.01) G.oil[t]=0;
      if(Math.random()<dt*3) fxAdd({k:'smoke',x:u.x+(Math.random()-.5)*0.4,y:u.y,r:0.15,life:0.6,col:'#222'});
      if(u.cargo>=H.cap-0.01) u.hs='return'; break;}
    case 'return':{ const r=nearestRefinery(u); if(!r){u.hs=null;u.mode='idle';break;} u.ref=r; const dk=dockOf(r); setPath(u,dk.x,dk.y); u.hs='toRef'; break;}
    case 'toRef': if(!u.ref||u.ref.dead){u.hs='return';break;}
      if(!u.path){ if(distTo(u,u.ref)<1.6) u.hs='unload'; else { if(++u.stuck>4){u.stuck=0;u.x+=(Math.random()-.5)*0.6;u.y+=(Math.random()-.5)*0.6;} u.hs='return'; } } break;
    case 'unload':{ if(!u.ref||u.ref.dead){u.hs='return';break;}
      // Rohöl in den Tank der Raffinerie; ist er voll, wartet der Laster
      const r=u.ref, amt=Math.min(H.unload*dt,u.cargo,r.def.tank-(r.crude||0)); u.cargo-=amt; u.stuck=0; r.crude=(r.crude||0)+amt; u.waiting=amt<=0;
      if(u.cargo<=0.01){u.cargo=0;u.waiting=false;u.hs='seek';u.repathT=0;} break;}
  }
}
/* ---------- Projektile & Effekte ---------- */
export function fxAdd(f){f.age=-(f.delay||0);G.fx.push(f);}
export function updateProjectiles(dt){
  for(const p of G.projectiles){
    if(p.delay>0){p.delay-=dt;continue;}
    if(p.t&&!p.t.dead){p.lx=p.t.x+p.ox;p.ly=p.t.y+p.oy;}
    if(p.heavy){   // ballistische Rakete / Gleitbombe: Flächenschaden; Flugabwehrraketen können sie abfangen
      if(p.type==='ballistic'&&Math.random()<0.8) fxAdd({k:'smoke',x:p.x,y:p.y,r:0.25,life:1.2});
      for(const b of G.buildings){ if(b.dead||b.site||b.contam||b.type!=='sam'||!hostile(b.owner,p.src.owner)||p.icp.includes(b.id)) continue;
        if(dist(b.x,b.y,p.x,p.y)>AIR.interceptR) continue; p.icp.push(b.id);
        fxAdd({k:'tracer',x1:b.x,y1:b.y,x2:p.x,y2:p.y,life:0.25,col:'#9fd0ff'});
        if(Math.random()<AIR.intercept){ p.done=true; fxAdd({k:'boom',x:p.x,y:p.y,r:0.6,life:0.6});
          if(b.owner===0) msg(`🛡 Abgefangen: ${p.type==='ballistic'?'ballistische Rakete':'Gleitbombe'} über der Stadt zerstört.`,'#9fd88a'); break; } }
      if(p.done) continue;
      const dx=p.lx-p.x,dy=p.ly-p.y,L=Math.hypot(dx,dy),s=p.speed*dt;
      if(L<=s){ p.done=true; fxAdd({k:'boom',x:p.lx,y:p.ly,r:p.splash*0.8,life:0.9}); fxAdd({k:'flash',x:p.lx,y:p.ly,r:30,life:0.2}); G.scorch.push({x:p.lx,y:p.ly,r:p.splash*0.6,t:G.t});
        splash(p.lx,p.ly,p.splash,p.dmg,p.type,p.src); }
      else { p.x+=dx/L*s; p.y+=dy/L*s; p.a=Math.atan2(dy,dx); p.k=1-Math.max(0,L-s)/Math.max(1,p.d0); }
      continue; }
    if(p.type==='rocket'){ if(Math.random()<0.7) fxAdd({k:'smoke',x:p.x,y:p.y,r:0.14,life:0.6});
      const dx=p.lx-p.x,dy=p.ly-p.y,L=Math.hypot(dx,dy),s=p.speed*dt;
      if(L<=s){p.done=true; fxAdd({k:'boom',x:p.lx,y:p.ly,r:0.55,life:0.55}); G.scorch.push({x:p.lx,y:p.ly,r:0.35,t:G.t}); splash(p.lx,p.ly,p.splash,p.dmg,'rocket',p.src);}
      else {p.x+=dx/L*s;p.y+=dy/L*s;p.a=Math.atan2(dy,dx);}
      continue; }
    const dx=p.lx-p.x,dy=p.ly-p.y,L=Math.hypot(dx,dy),s=p.speed*dt;
    if(p.type==='missile'&&Math.random()<0.6) fxAdd({k:'smoke',x:p.x,y:p.y,r:0.12,life:0.5});
    if(L<=s){p.done=true; fxAdd({k:'boom',x:p.lx,y:p.ly,r:p.type==='shell'?0.45:0.35,life:0.45}); if(p.t&&!p.t.dead) applyDamage(p.t,p.dmg,p.type,p.src);
      if(p.type==='shell') for(let ty=Math.floor(p.ly-0.6);ty<=p.ly+0.6;ty++)for(let tx=Math.floor(p.lx-0.6);tx<=p.lx+0.6;tx++) if(inMap(tx,ty)&&G.feat[idx(tx,ty)]===FEAT.WIRE) G.feat[idx(tx,ty)]=0;}
    else {p.x+=dx/L*s;p.y+=dy/L*s;p.a=Math.atan2(dy,dx);}
  }
  G.projectiles=G.projectiles.filter(p=>!p.done);
}
export function separate(){
  const us=G.units;
  for(let i=0;i<us.length;i++){const a=us[i]; if(a.dead) continue;
    if(a.def.cls==='air'||a.carried) continue;
    for(let j=i+1;j<us.length;j++){const b=us[j]; if(b.dead||b.def.cls==='air'||b.carried) continue;
      const dx=b.x-a.x, dy=b.y-a.y; if(Math.abs(dx)>1||Math.abs(dy)>1) continue;
      const min=(a.def.size+b.def.size)*0.5, d=Math.hypot(dx,dy);
      if(d<min){
        // Fahrende Einheiten fahren aneinander vorbei, nur stehende werden geschoben (keine Blockaden)
        const am=!!(a.path&&a.path.length), bm=!!(b.path&&b.path.length); if(am&&bm) continue;
        const push=(min-d)*0.25, nx=d>0.001?dx/d:Math.random()-0.5, ny=d>0.001?dy/d:Math.random()-0.5;
        const ka=am?0:bm?2:1, kb=bm?0:am?2:1;
        const ax=a.x-nx*push*ka, ay=a.y-ny*push*ka, bx=b.x+nx*push*kb, by=b.y+ny*push*kb;
        if(ka&&passable(Math.floor(ax),Math.floor(ay),mcls(a))){a.x=ax;a.y=ay;}
        if(kb&&passable(Math.floor(bx),Math.floor(by),mcls(b))){b.x=bx;b.y=by;} } } }
}

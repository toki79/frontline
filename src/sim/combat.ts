import { dist, fmt, idx, inMap } from '../core/util';
import { DAMAGE, DENSITY, ECON, FEAT, RES, canHit } from '../data/config';
import { orderMove } from '../sim/orders';
import { G } from '../sim/state';
import { fxAdd } from '../sim/units';
import { coverAt, hostile, recalcPower, rectDist, updateRel } from '../sim/world';
import { emit } from '../core/events';
import { msg } from '../core/events';

/* =====================================================================
   Kampf
   ===================================================================== */
export function distTo(a,e){
  if(e.kind==='building'){const dx=Math.max(e.tx-a.x,0,a.x-(e.tx+e.w)),dy=Math.max(e.ty-a.y,0,a.y-(e.ty+e.h));return Math.hypot(dx,dy);}
  return Math.hypot(a.x-e.x,a.y-e.y);
}
export function homeTurf(u){ for(const b of G.buildings) if(!b.dead&&b.owner===u.owner&&!b.def.def&&distTo(u,b)<=6) return true; return false; }
export function findTarget(src,range){
  let best=null,bs=1e9; const w=src.def.weapon, minR=w.minRange||0, drone=w.type==='drone';
  for(const e of G.units){ if(e.dead||!hostile(src.owner,e.owner)||!canHit(w,e)) continue; const d=distTo(src,e); if(d>range||d<minR) continue;
    const sc=d-(drone&&e.def.cls==='veh'?3:0); if(sc<bs){bs=sc;best=e;} }
  if(!w.airOnly) for(const e of G.buildings){ if(e.dead||!hostile(src.owner,e.owner)) continue; const d=distTo(src,e); if(d>range||d<minR) continue;
    const sc=d+1.5+(e.def.def&&!e.def.weapon?3:0); if(sc<bs){bs=sc;best=e;} }   // Mauern nur, wenn sonst nichts da ist
  return best;
}
// Flächenschaden (Raketen, Drohnen): trifft alle Feinde im Radius, zerstört Stacheldraht
export function splash(x,y,r,dmg,type,src){
  for(const e of G.units){ if(e.dead||!hostile(src.owner,e.owner)||!canHit({type},e)) continue; const d=dist(x,y,e.x,e.y); if(d<=r) applyDamage(e,dmg*(1-0.5*d/r),type,src); }
  for(const e of G.buildings){ if(e.dead||!hostile(src.owner,e.owner)) continue; const d=distTo({x,y},e); if(d<=r) applyDamage(e,dmg*(1-0.5*d/r),type,src); }
  for(let ty=Math.floor(y-r);ty<=y+r;ty++)for(let tx=Math.floor(x-r);tx<=x+r;tx++) if(inMap(tx,ty)&&G.feat[idx(tx,ty)]===FEAT.WIRE&&dist(x,y,tx+0.5,ty+0.5)<=r) G.feat[idx(tx,ty)]=0;
}
export function aimPoint(t){ if(t.kind==='building') return {x:t.x+(Math.random()-0.5)*t.w*0.6,y:t.y+(Math.random()-0.5)*t.h*0.6}; return {x:t.x+(Math.random()-0.5)*0.3,y:t.y+(Math.random()-0.5)*0.3}; }
export function fire(s,t){
  const w=s.def.weapon; s.cd=w.rof*(0.9+Math.random()*0.2);
  const a=Math.atan2(t.y-s.y,t.x-s.x), ml=s.kind==='unit'?s.def.size*0.75:0.55;
  const mx=s.x+Math.cos(a)*ml, my=s.y+Math.sin(a)*ml, hp=aimPoint(t);
  if(w.salvo){   // Raketenwerfer: Salve auf zufällige Punkte um das Ziel
    for(let i=0;i<w.salvo;i++){ const a2=Math.random()*Math.PI*2, r2=Math.random()*w.spread;
      G.projectiles.push({x:mx,y:my,t:null,lx:t.x+Math.cos(a2)*r2,ly:t.y+Math.sin(a2)*r2,type:w.type,dmg:w.dmg,src:s,speed:10,delay:i*0.18,splash:w.splash}); }
    fxAdd({k:'flash',x:mx,y:my,r:6,life:0.15}); fxAdd({k:'smoke',x:mx,y:my,r:0.5,life:1.2});
    if(s.owner===0||t.owner===0) {} return;
  }
  if(w.type==='flak'){ for(let i=0;i<2;i++) fxAdd({k:'tracer',x1:mx,y1:my,x2:hp.x+(Math.random()-.5)*0.4,y2:hp.y+(Math.random()-.5)*0.4,life:0.08,col:'#ffd27a'});
    fxAdd({k:'boom',x:hp.x,y:hp.y,r:0.22,life:0.3}); applyDamage(t,w.dmg,w.type,s); return; }
  if(w.type==='bullet'||w.type==='autocannon'){
    const n=w.type==='bullet'?(s.kind==='unit'?Math.max(1,Math.ceil(s.hp/s.maxHp*3)):3):1;
    for(let i=0;i<n;i++) fxAdd({k:'tracer',x1:mx+(Math.random()-.5)*0.3,y1:my+(Math.random()-.5)*0.3,x2:hp.x+(Math.random()-.5)*0.3,y2:hp.y+(Math.random()-.5)*0.3,life:0.09,col:w.type==='bullet'?'#ffe9a0':'#ffc35a'});
    fxAdd({k:'flash',x:mx,y:my,r:w.type==='bullet'?2.5:4,life:0.06});
    if(w.type==='autocannon') fxAdd({k:'boom',x:hp.x,y:hp.y,r:0.25,life:0.25});
    applyDamage(t,w.dmg,w.type,s);
  } else {
    G.projectiles.push({x:mx,y:my,t,ox:hp.x-t.x,oy:hp.y-t.y,lx:hp.x,ly:hp.y,type:w.type,dmg:w.dmg,src:s,speed:w.type==='shell'?17:9});
    fxAdd({k:'flash',x:mx,y:my,r:w.type==='shell'?7:4,life:0.1});
    if(w.type==='shell') fxAdd({k:'smoke',x:mx,y:my,r:0.35,life:0.8});
  }
}
export function applyDamage(t,dmg,type,src){
  if(t.dead) return;
  let m=DAMAGE[type][t.armor]; if(m===undefined) m=1;
  if(t.kind==='unit'&&t.def.cls==='inf') m*=1-coverAt(t.x,t.y);
  if(t.kind==='unit'&&t.owner<2&&homeTurf(t)) m*=0.7;          // Heimvorteil: vorbereitete Stellungen
  t.lastHit=G.t;
  t.hp-=dmg*m*(0.85+Math.random()*0.3);
  if(src) onAttacked(t,src);
  if(t.hp<=0) destroy(t,src);
}
export function onAttacked(t,src){
  const v=t.owner, a=src.owner; if(v===a) return;
  if((v===0&&a===1)||(v===1&&a===0)) G.ai.lastCombat=G.t;
  if(v===2&&!G.militiaWar[a]){
    G.militiaWar[a]=true; G.attitude[a]=-100; if(G.militiaAlly===a) G.militiaAlly=-1; updateRel();
    msg(a===0?'Ihr habt die Grenzmiliz angegriffen – sie erklärt euch den Krieg!':'Kastrova hat die Grenzmiliz angegriffen. Die Miliz kämpft jetzt gegen Kastrova.', a===0?'#ff8a7a':'#d6b45a');
  } else if(v===2) G.attitude[a]=Math.max(-100,G.attitude[a]-0.5);
  if(t.kind==='unit'&&t.def.weapon&&!t.target&&t.mode!=='move'&&hostile(v,a)&&!src.dead) t.target=src;
  G.players[v].lastAttack={t:G.t,x:t.x,y:t.y};
  // Heimverteidigung: untätige Truppen in der Nähe eilen zu Hilfe
  if(v<2&&hostile(v,a)&&!src.dead&&G.t-(G.players[v].defendT||-9)>3){ G.players[v].defendT=G.t;
    const help=G.units.filter(u=>!u.dead&&u.owner===v&&u.def.weapon&&u.mode==='idle'&&!u.target&&!u.wave&&dist(u.x,u.y,t.x,t.y)<12&&canHit(u.def.weapon,src));
    if(help.length) orderMove(help,src.x,src.y,'amove'); }
  if(v===0){
    if(t.kind==='building'&&G.t-G.warnB>12){G.warnB=G.t;msg('⚠ Unsere Stadt wird angegriffen!','#ff8a7a');}
    else if(t.kind==='unit'&&G.t-G.warnU>25){G.warnU=G.t;msg('Einheiten unter Beschuss.','#ffb38a');}
  }
}
// Beute: Wer zerstört, erbeutet einen Teil der Vorräte
export function loot(e,src){
  if(!src) return; const ko=src.owner, vo=e.owner; if(ko===vo) return;
  if(e.kind==='building'&&(e.def.def||e.site)) return;
  const V=G.players[vo], K=G.players[ko], got: Record<string,number>={};
  if(e.kind==='unit'){ if(e.def.harvester&&e.cargo>5) got.oil=Math.floor(e.cargo*0.7); }
  else {
    const share=e.type==='hq'?0.4:0.15, cap=e.type==='hq'?900:250;
    for(const k of ['money','food','wood','stone','metal','oil']){ let a=Math.floor(Math.min((V.res[k]||0)*share,cap));
      if(e.type==='farm'&&k==='food') a=Math.floor(Math.min(V.res.food*0.3,350));
      if(e.type==='mine'&&k==='metal') a=Math.floor(Math.min(V.res.metal*0.3,250));
      if(e.type==='refinery'&&k==='oil') a=Math.floor(Math.min(V.res.oil*0.35,300));
      if(a>0){ V.res[k]-=a; got[k]=a; } }
  }
  const keys=Object.keys(got); if(!keys.length) return;
  for(const k of keys) K.res[k]+=got[k];
  const txt=keys.map(k=>`+${got[k]} ${RES[k].icon}`).join(' ');
  if(ko===0){ G.stats.loot+=keys.reduce((s,k)=>s+got[k],0); msg('Beute: '+txt,'#9fd88a'); }
  else if(vo===0) msg(`${G.players[ko].short} erbeutet: ${txt}`,'#ff8a7a');
  if(ko===1) G.ai.lootSince+=keys.reduce((s,k)=>s+got[k],0);
  fxAdd({k:'loot',x:e.x,y:e.y,txt,col:ko===0?'#9fd88a':'#ff9a8a',life:2.2});
}
export function destroy(e,src){
  if(e.dead) return; e.dead=true; if(e.kind==='building'){ G.qDirty=true; G.roadDirty=true; }
  loot(e,src);
  if(e.kind==='building'){
    for(let y=e.ty;y<e.ty+e.h;y++)for(let x=e.tx;x<e.tx+e.w;x++) if(G.occ[idx(x,y)]===e.id) G.occ[idx(x,y)]=0;
    for(let i=0;i<6;i++) fxAdd({k:'boom',x:e.x+(Math.random()-.5)*e.w,y:e.y+(Math.random()-.5)*e.h,r:0.6+Math.random()*0.8,life:0.7+Math.random()*0.5,delay:i*0.12});
    G.scorch.push({x:e.x,y:e.y,r:Math.max(e.w,e.h)*0.7,t:G.t});
    recalcPower(e.owner);
    for(const n of touching(e)) ignite(n);   // Feuer springt auf direkt angrenzende Gebäude über
    // Bewohner fliehen, wenn Wohnraum zerstört wird
    if(e.def.cap&&e.owner<2){ const V=G.players[e.owner], lost=Math.floor(Math.min(Math.max(0,V.pop-ECON.minPop),e.def.cap*0.5));
      if(lost>0){ V.pop-=lost; if(e.owner===0) msg(`−${lost} Einwohner sind geflohen.`,'#ff8a7a'); else if(src&&src.owner===0) msg(`Kastrova verliert ${lost} Einwohner.`,'#9fd88a'); } }
    if(e.owner===0&&e.type!=='wall') msg((e.site?'Baustelle verloren: ':'Gebäude verloren: ')+e.def.name,'#ff8a7a');
    if(e.owner===1&&src&&src.owner===0&&e.type!=='wall') msg('Feindliches Gebäude zerstört: '+e.def.name,'#9fd88a');
    if(e.type==='bunker') msg('Der Milizbunker ist gefallen – der Markt ist geschlossen.','#d6b45a');
    checkVictory();
  } else {
    const big=e.def.cls==='veh'; if(e.def.cls==='air') fxAdd({k:'boom',x:e.x,y:e.y,r:0.3,life:0.3});
    fxAdd({k:'boom',x:e.x,y:e.y,r:big?0.8:0.35,life:big?0.8:0.4});
    if(big) G.scorch.push({x:e.x,y:e.y,r:0.6,t:G.t});
    if(e.owner===0) G.stats.lost++;
    if(src&&src.owner===0&&e.owner!==0) G.stats.kills++;
  }
  G.sel=G.sel.filter(s=>!s.dead);
}
// ---------- Feuer ----------
const burns = b => !b.dead && !b.def.def && b.type!=='bunker';
/** Gebäude, die direkt angrenzen (ohne freies Feld dazwischen) */
export function touching(b){ return G.buildings.filter(o=>o!==b&&!o.dead&&burns(o)&&rectDist(o,b.tx,b.ty,b.w,b.h)===0); }
export function ignite(b){
  if(!burns(b)) return;
  if(!(b.fire>0)&&b.owner===0&&G.t-(G.fireMsg||-99)>15){ G.fireMsg=G.t; msg(`🔥 Feuer! ${b.def.name} brennt – dicht bebaute Viertel brennen schnell nieder.`,'#ff8a7a'); }
  b.fire=Math.max(b.fire||0,DENSITY.fireTime);
}
export function updateFire(b,dt){
  b.fire-=dt; b.lastHit=G.t;
  b.hp-=b.maxHp*DENSITY.fireDps*dt;
  if(Math.random()<dt*6) fxAdd({k:'flame',x:b.tx+Math.random()*b.w,y:b.ty+Math.random()*b.h,r:0.25+Math.random()*0.2,life:0.7});
  if(Math.random()<dt*2) fxAdd({k:'smoke',x:b.x+(Math.random()-.5)*b.w*0.6,y:b.y+(Math.random()-.5)*b.h*0.6,r:0.4,life:1.6,col:1});
  if(Math.random()<dt*DENSITY.fireSpread) for(const n of touching(b)) if(!(n.fire>0)&&Math.random()<0.5) ignite(n);
  if(b.hp<=0) destroy(b,null);
}
export function checkVictory(){
  if(G.over) return;
  const civ=pid=>G.buildings.filter(b=>!b.dead&&b.owner===pid&&!b.def.def).length;
  if(civ(1)===0) endGame(true,'Kastrova ist militärisch besiegt.');
  else if(civ(0)===0) endGame(false,'Eure Stadt ist gefallen.');
}
export function endGame(win,reason){
  G.over=true; G.result={win,reason};
  emit('gameover',win,reason);
}

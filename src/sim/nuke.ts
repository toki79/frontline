import { dist, idx, inMap } from '../core/util';
import { AIS, isMajor, MAP_H, MAP_W, NUKE, T } from '../data/config';
import { destroy, distTo } from '../sim/combat';
import { G } from '../sim/state';
import { fxAdd } from '../sim/units';
import { addAtt, findBuilding, recalcPower, setWar, updateRel } from '../sim/world';
import { clearForest } from '../sim/build';
import { msg } from '../core/events';

/* =====================================================================
   Atomwaffe: Start, Flug, Detonation, Verstrahlung, Folgen
   ---------------------------------------------------------------------
   G.missiles: fliegende Raketen · G.fallout: verstrahlte Zonen {x,y,r,until}
   ===================================================================== */
const pname = pid => G.players[pid].short;
/** Verstrahlte Felder als Karte (G.fallMap) – neu berechnet, wenn Zonen entstehen oder abklingen */
export function rebuildFallMap(){
  const N=MAP_W*MAP_H; if(!G.fallMap||G.fallMap.length!==N) G.fallMap=new Uint8Array(N); else G.fallMap.fill(0);
  G.fallout=(G.fallout||[]).filter(f=>G.t<f.until);
  for(const f of G.fallout) for(let y=Math.floor(f.y-f.r);y<=f.y+f.r;y++)for(let x=Math.floor(f.x-f.r);x<=f.x+f.r;x++)
    if(inMap(x,y)&&dist(x+0.5,y+0.5,f.x,f.y)<=f.r) G.fallMap[idx(x,y)]=1;
  for(const b of G.buildings) if(!b.dead){ const was=!!b.contam; b.contam=!!G.fallMap[idx(Math.floor(b.x),Math.floor(b.y))]; if(was!==b.contam){ recalcPower(b.owner); G.qDirty=true; } }
}
export const falloutTile = i => !!(G.fallMap&&G.fallMap[i]);
export const falloutAt = (x,y) => inMap(Math.floor(x),Math.floor(y))&&falloutTile(idx(Math.floor(x),Math.floor(y)));
/** Anteil der Leistung an dieser Stelle (0 in verstrahltem Gebiet, sonst 1) */
export function inFallout(b){ return falloutAt(b.x,b.y)?0:1; }

/** Atomrakete starten. Ergebnis: true, oder Begründung als Text */
export function launchNuke(pid,x,y){
  const p=G.players[pid], silo=findBuilding(pid,'silo');
  if(!silo) return 'kein Raketensilo';
  if(!(p.nukes>0)) return 'keine Rakete bereit';
  if(pid===0&&G.fog&&G.vis[idx(Math.floor(x),Math.floor(y))]===0) return 'Ziel nicht erkundet';
  p.nukes--;
  const d=dist(silo.x,silo.y,x,y);
  G.missiles=(G.missiles||[]).concat([{owner:pid, x0:silo.x, y0:silo.y, x, y, t0:G.t, dur:3+d/NUKE.speed}]);
  fxAdd({k:'flash',x:silo.x,y:silo.y,r:14,life:0.6}); fxAdd({k:'smoke',x:silo.x,y:silo.y,r:1.2,life:3});
  msg(pid===0?'☢ Atomrakete gestartet!':`☢☢ WARNUNG: ${pname(pid)} hat eine Atomrakete gestartet! Einschlag in ${Math.round(3+d/NUKE.speed)} s.`, pid===0?'#ffd36a':'#ff5a4a');
  // Folgen für den Angreifer: Krieg mit allen, Entsetzen im eigenen Land
  p.shockUntil=G.t+NUKE.shock; G.nukedBy=G.nukedBy||[]; G.nukedBy[pid]=true;
  if(isMajor(pid)){
    // Opfer: alle Mächte mit Gebäuden im Zielgebiet (sonst der Besitzer des nächsten Gebäudes) – Krieg mit ihnen
    const vict=new Set<number>(); let near=null, nd=1e9;
    for(const b of G.buildings){ if(b.dead||!isMajor(b.owner)||b.owner===pid) continue; const d=dist(b.x,b.y,x,y); if(d<NUKE.radius*1.5) vict.add(b.owner); if(d<nd){nd=d;near=b.owner;} }
    if(!vict.size&&near!==null) vict.add(near);
    for(const v of vict){ setWar(pid,v,true,pid); G.known[v][pid]=true; addAtt(v,pid,-100); }
    for(const a of AIS) if(a!==pid) addAtt(a,pid,-40);   // Entsetzen bei allen Mächten
    G.militiaWar[pid]=true; G.attitude[pid]=-100; if(G.militiaAlly===pid) G.militiaAlly=-1; updateRel(); }
  return true;
}
/** Explosion: Atombombe oder Kernschmelze */
export function blast(x,y,r,dmg,fallR,src){
  fxAdd({k:'nuke',x,y,r,life:5}); G.scorch.push({x,y,r:r*0.9,t:G.t});
  const s=src||{owner:-1,dead:true,x,y,kind:'nuke',def:{}};
  for(const u of G.units){ if(u.dead) continue; const d=dist(u.x,u.y,x,y); if(d>r) continue;
    const h=dmg*(1-d/(r+1))+(u.def.cls==='air'?200:0); u.hp-=h; u.lastHit=G.t; if(u.hp<=0) destroy(u,s.owner>=0?s:null); }
  const victims=new Set<number>();
  for(const b of G.buildings){ if(b.dead) continue; const d=distTo({x,y},b); if(d>r) continue;
    if(isMajor(b.owner)&&b.def.cap){ const p=G.players[b.owner]; p.pop=Math.max(10,p.pop-(b.resid||b.def.cap*0.5)*0.9*(1-d/(r+1))); victims.add(b.owner); }
    const hit=dmg*1.4*(1-d/(r+1)); b.hp=b.type==='hq'?Math.min(b.hp,Math.max(b.maxHp*NUKE.hqKeep,b.hp-hit)):b.hp-hit; b.lastHit=G.t;   /* Rathaus = Regierungsbunker */ if(b.hp<=0) destroy(b,s.owner>=0?s:null); else if(b.type!=='hq') b.fire=Math.max(b.fire||0,10); }
  for(let ty=Math.floor(y-r);ty<=y+r;ty++)for(let tx=Math.floor(x-r);tx<=x+r;tx++){ if(!inMap(tx,ty)||dist(tx+0.5,ty+0.5,x,y)>r*0.8) continue; const i=idx(tx,ty);
    if(G.terr[i]===T.FOREST) clearForest(i); if(G.terr[i]===T.MEADOW){ G.terr[i]=T.GRASS; G.terrChanged.push(i); } G.feat[i]=0; }
  if(fallR){ G.fallout=(G.fallout||[]).concat([{x,y,r:fallR,until:G.t+NUKE.falloutTime}]); rebuildFallMap(); }
  for(const v of victims){ G.players[v].bombedUntil=G.t+NUKE.victimTime; }
  G.qDirty=true; G.roadDirty=true;
}
export function updateNukes(dt){
  if(G.missiles&&G.missiles.length){
    for(const m of [...G.missiles]) if(G.t>=m.t0+m.dur){ G.missiles.splice(G.missiles.indexOf(m),1);
      const target=G.buildings.filter(b=>!b.dead&&distTo({x:m.x,y:m.y},b)<=NUKE.radius).map(b=>b.owner);
      blast(m.x,m.y,NUKE.radius,NUKE.dmg,NUKE.fallout,{owner:m.owner,dead:true,x:m.x,y:m.y,kind:'nuke',def:{}});
      msg(m.owner===0?'☢ Einschlag. Wo eben noch Leben war, ist nur noch Asche.':target.includes(0)?'☢☢ ATOMSCHLAG auf unser Land!':'☢ Eine Atomexplosion erschüttert das Tal.', '#ff5a4a'); }
  }
  // Verstrahlung: Bodentruppen, die das Gebiet betreten, sterben; Zonen klingen ab
  if(G.fallout&&G.fallout.length){
    if(!G.fallMap) rebuildFallMap();
    G.falloutT=(G.falloutT||0)-dt; if(G.falloutT<=0){ G.falloutT=0.5; const lost=[0,0];
      for(const u of G.units) if(!u.dead&&u.def.cls!=='air'&&falloutAt(u.x,u.y)){ if(u.owner===0) lost[0]++; fxAdd({k:'smoke',x:u.x,y:u.y,r:0.4,life:1.5}); destroy(u,null); }
      if(lost[0]&&G.t-(G.radMsg||-99)>8){ G.radMsg=G.t; msg(`☠ ${lost[0]} Einheit${lost[0]===1?'':'en'} im verstrahlten Gebiet umgekommen.`,'#ff8a7a'); }
      if(G.fallout.some(f=>G.t>=f.until)){ rebuildFallMap(); msg('☢ Eine verstrahlte Zone ist abgeklungen – dort kann wieder gebaut werden.','#9fd88a'); } }
  }
}
/** Abschreckung: besitzt pid einsatzbereite Atomraketen? */
export const deterrent = pid => (G.players[pid].nukes||0)>0;

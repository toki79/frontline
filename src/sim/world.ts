import type { Entity } from './types';
import { aiRally } from '../ai/kastrova';
import { clamp, idx, inMap } from '../core/util';
import { capOf, lvlMul, BUILDINGS, CONSTRUCTION, DENSITY, FEAT, MAP_H, MAP_W, NOISE_R, STORAGE, T, TECH_UNLOCKS, TERRAIN, UNITS } from '../data/config';
import { orderMove } from '../sim/orders';
import { G } from '../sim/state';
import { msg } from '../core/events';

/* =====================================================================
   Beziehungen
   ===================================================================== */
export function updateRel(){
  const r=G.rel, set=(a,b,v)=>{r[a][b]=v;r[b][a]=v;};
  set(0,1, G.war?'feind':'neutral');
  for(const pid of [0,1]){
    let v='neutral';
    if(G.militiaWar[pid]) v='feind'; else if(G.militiaAlly===pid) v='verbündet'; else if(G.militiaAlly===1-pid&&G.war) v='feind';
    set(2,pid,v);
  }
}
export const hostile=(a,b)=>a!==b&&G.rel[a][b]==='feind';
export function setWar(on,by?){
  if(G.war===on) return; G.war=on; updateRel();
  if(on){
    G.aiAtt=Math.min(G.aiAtt,-20);
    if(G.embassy&&(G.embassy[0][1]||G.embassy[1][0])){ G.embassy[0][1]=G.embassy[1][0]=false; msg('🏛 Die Botschaften wurden geschlossen.','#ffb38a'); }
    msg(by===0?'Ihr habt Kastrova den Krieg erklärt.':'⚔ Kastrova hat Aldoria den Krieg erklärt!','#ff8a7a');
  } else {
    msg('Frieden mit Kastrova geschlossen.','#9fd88a');
    for(const u of G.units){ if(u.target&&!hostile(u.owner,u.target.owner)) u.target=null; if(u.owner===1&&u.wave){u.wave=false;const r=aiRally();orderMove([u],r.x,r.y);} }
  }
}
export function armyStr(pid){let s=0;for(const u of G.units) if(!u.dead&&u.owner===pid&&u.def.weapon) s+=(u.def.cost.money||100)*(1+(u.def.cost.metal||0)/100)*(u.hp/u.maxHp);return s;}
export function defStr(pid){let s=0;for(const b of G.buildings) if(!b.dead&&b.owner===pid&&b.def.weapon) s+=500*(b.hp/b.maxHp);return s;}
/* =====================================================================
   Entitäten
   ===================================================================== */
export function terrAt(x,y){const tx=Math.floor(x),ty=Math.floor(y);return inMap(tx,ty)?G.terr[idx(tx,ty)]:T.WATER;}
export function passable(tx,ty,cls){ if(!inMap(tx,ty)) return false; if(cls==='air') return true; const i=idx(tx,ty); return G.occ[i]===0 && !(G.fallMap&&G.fallMap[i]) && TERRAIN[G.terr[i]].cost[cls]!==Infinity; }
// Bewegungskosten eines Feldes inkl. Stacheldraht/Graben
export function tileCost(i,cls){
  if(cls==='air') return 1;
  if(G.fallMap&&G.fallMap[i]) return Infinity;   // verstrahlt: Bodentruppen meiden das Gebiet
  let c=TERRAIN[G.terr[i]].cost[cls]; const f=G.feat[i];
  if(f===FEAT.WIRE) c*=cls==='inf'?3.5:1.1;
  else if(f===FEAT.TRENCH) c*=cls==='inf'?1.4:3.2;
  if(G.road[i]===2) c=Math.min(c,1)*CONSTRUCTION.roadSpeed;   // fertige Straße
  return c;
}
export function coverAt(x,y){ const tx=Math.floor(x),ty=Math.floor(y); if(!inMap(tx,ty)) return 0; const i=idx(tx,ty); return G.feat[i]===FEAT.TRENCH?0.6:TERRAIN[G.terr[i]].cover; }
export function nearestPassable(tx,ty,cls,maxR=12){
  tx=clamp(Math.floor(tx),0,MAP_W-1); ty=clamp(Math.floor(ty),0,MAP_H-1);
  if(passable(tx,ty,cls)) return {x:tx,y:ty};
  for(let r=1;r<=maxR;r++){ let best=null,bd=1e9;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){ if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
      if(passable(tx+dx,ty+dy,cls)){const d=dx*dx+dy*dy; if(d<bd){bd=d;best={x:tx+dx,y:ty+dy};}} }
    if(best) return best; }
  return null;
}
export function makeUnit(pid,type,x,y){
  const d=UNITS[type], a=pid===1?Math.PI*0.75:pid===0?-Math.PI*0.25:Math.PI/2;
  const u: Entity={id:G.nextId++, kind:'unit', type, def:d, owner:pid, x, y, hp:d.hp, maxHp:d.hp, armor:d.armor, angle:a, tur:a,
    mode:'idle', guard:{x,y}, goal:null, path:null, pathI:0, target:null, cd:0, scanT:Math.random()*0.4, repathT:0,
    cargo:0, hs:null, stuck:0, oilTile:-1, ref:null, wave:false, raid:false, born:G.t};
  G.units.push(u); return u;
}
export function spawnAt(pid,type,x,y){ const u=makeUnit(pid,type,x,y); if(UNITS[type].harvester) u.hs='seek'; return u; }
export function ringTiles(tx,ty,w,h){const out=[];for(let y=ty-1;y<=ty+h;y++)for(let x=tx-1;x<=tx+w;x++){if((x===tx-1||x===tx+w||y===ty-1||y===ty+h)&&inMap(x,y))out.push(idx(x,y));}return out;}
/** Gebäude setzen. site=true: als Baustelle, die erst von Bauarbeitern fertiggestellt wird. */
export function placeBuilding(pid,type,tx,ty,initial,site=false){
  const d=BUILDINGS[type];
  const b: Entity={id:G.nextId++, kind:'building', type, def:d, owner:pid, tx, ty, w:d.w, h:d.h, x:tx+d.w/2, y:ty+d.h/2,
    hp:d.hp, maxHp:d.hp, armor:d.def?'fort':'building', tur:pid===1?Math.PI*0.75:-Math.PI*0.25, cd:0, scanT:0, target:null, born:initial?-9:G.t, empty:false};
  if(d.needsOre) b.oreTiles=ringTiles(tx,ty,d.w,d.h).filter(i=>G.ore[i]>0);
  if(d.needsRock) b.rockTiles=ringTiles(tx,ty,d.w,d.h).filter(i=>G.rock[i]>0);
  if(site){ b.site=true; b.progress=0; b.hp=d.hp*0.1; b.lastHit=G.t; }
  G.buildings.push(b); G.qDirty=true; G.roadDirty=true;
  for(let y=ty;y<ty+d.h;y++)for(let x=tx;x<tx+d.w;x++) G.occ[idx(x,y)]=b.id;
  for(const u of G.units){ if(u.dead) continue; const tx2=Math.floor(u.x),ty2=Math.floor(u.y);
    if(inMap(tx2,ty2)&&G.occ[idx(tx2,ty2)]){const p=nearestPassable(tx2,ty2,u.def.cls); if(p){u.x=p.x+0.5;u.y=p.y+0.5;u.path=null;}} }
  recalcPower(pid);
  if(site) return b;
  if(d.spawn && !initial) spawnUnit(pid,d.spawn,b);
  if(type==='university'){ const p=G.players[pid]; if(p.tech<1){ p.tech=1; if(pid===0) msg(`🎓 Universität Stufe 1: ${TECH_UNLOCKS[1]} freigeschaltet.`,'#9fd88a'); } }
  if(d.def&&d.time&&!initial){ b.readyT=G.t+d.time; b.hp=d.hp*0.25; b.lastHit=G.t-20; }   // Stellung wird erst aufgebaut
  return b;
}
// Wohnqualität: Industrie in der Nähe senkt sie (direkt angrenzend voll, weiter weg abgeschwächt)
export function rectDist(b,tx,ty,w,h){const dx=Math.max(b.tx-(tx+w),tx-(b.tx+b.w),0),dy=Math.max(b.ty-(ty+h),ty-(b.ty+b.h),0);return Math.max(dx,dy);}
export function housingQuality(pid,tx,ty,w,h){
  let pen=0; const src=[];
  for(const b of G.buildings){ if(b.dead||b.site||b.owner!==pid||!b.def.noise) continue;
    const d=rectDist(b,tx,ty,w,h); if(d>NOISE_R) continue;
    pen+=b.def.noise*(d<=1?1:d<=2?0.7:0.35); if(!src.includes(b.def.name)) src.push(b.def.name); }
  // Enge Bebauung: belegte Nachbarfelder (Straßen zählen nicht)
  const ring=ringTiles(tx,ty,w,h); let occ=0; for(const i of ring) if(G.occ[i]) occ++;
  if(ring.length&&occ){ pen+=DENSITY.crowdPenalty*occ/ring.length; src.push('enge Bebauung'); }
  return {q:Math.max(0.3,1-pen),src};
}
export function refreshQuality(){
  for(const b of G.buildings){ if(b.dead||b.site||!b.def.cap) continue; const r=housingQuality(b.owner,b.tx,b.ty,b.w,b.h); b.quality=r.q; b.noiseSrc=r.src; }
  G.qDirty=false;
}
// ---------- Sicht & Nebel des Krieges ----------
// vis (Spieler) und vis1 (Kastrova): 0 = unerforscht, 1 = erkundet, 2 = gerade in Sicht.
// Ohne Nebel sieht der Spieler alles; Kastrova hat immer ihre eigene Sicht (Erstkontakt, Raketenwerfer).
// Hochfliegende Drohnen (airHigh) sind getarnt: nur Radar der Flugabwehr oder eigenes Feuer verrät sie.
export const fogOn=()=>!!(G&&G.fog);
export function seesFor(pid,o){ return o===pid||(o===2&&G.militiaAlly===pid); }
export function seesFor0(o){ return seesFor(0,o); }
export const visOf=pid=>pid===0?G.vis:G.vis1;
/** ist ein Feld für eine Partei gerade aufgeklärt? */
export function spotted(pid,x,y){ if(pid>1) return false; if(pid===0&&!G.fog) return true; const tx=Math.floor(x),ty=Math.floor(y); return inMap(tx,ty)&&visOf(pid)[idx(tx,ty)]===2; }
/** Hochflieger für eine Partei entdeckt? (andere Einheiten immer) */
export function detected(e,pid){ if(e.carried) return false; return e.kind!=='unit'||e.def.armor!=='airHigh'||seesFor(pid,e.owner)||!!(e.det&&e.det[pid]); }
export function updateVision(){
  G.vis1=G.vis1||new Uint8Array(MAP_W*MAP_H);
  for(const pid of [0,1]){
    if(pid===0&&!G.fog) continue;
    const v=visOf(pid); for(let i=0;i<v.length;i++) if(v[i]===2) v[i]=1;
    const reveal=(x,y,r)=>{ const r2=r*r; for(let ty=Math.max(0,Math.floor(y-r));ty<=Math.min(MAP_H-1,Math.ceil(y+r));ty++)for(let tx=Math.max(0,Math.floor(x-r));tx<=Math.min(MAP_W-1,Math.ceil(x+r));tx++){
      const dx=tx+0.5-x, dy=ty+0.5-y; if(dx*dx+dy*dy<=r2) v[ty*MAP_W+tx]=2; } };
    for(const u of G.units) if(!u.dead&&!u.carried&&seesFor(pid,u.owner)) reveal(u.x,u.y,u.def.sight+0.5);
    for(const b of G.buildings) if(!b.dead&&seesFor(pid,b.owner)) reveal(b.x,b.y,(b.def.sight||4)+Math.max(b.w,b.h)/2);
  }
  // Tarnung: Radar der Flugabwehr (fertig) erfasst Hochflieger im Umkreis; wer feuert, verrät sich kurz
  const radars=[...G.buildings.filter(b=>!b.dead&&!b.site&&b.def.radar), ...G.units.filter(u=>!u.dead&&u.def.radar)];
  for(const u of G.units){ if(u.dead||u.def.armor!=='airHigh') continue; const rev=G.t<(u.revealT||-1);
    u.det=[0,1,2,3].map(pid=>rev||radars.some(r=>r.owner===pid&&Math.hypot(r.x-u.x,r.y-u.y)<=r.def.radar)); }
  for(const b of G.buildings) if(!b.dead&&!b.seen&&inSightRect(b)) b.seen=true;
  // Erstkontakt
  for(const pid of [0,1]) for(const o of [0,1,2]){ if(o===pid||G.known[pid][o]) continue;
    const seen=G.units.some(u=>!u.dead&&u.owner===o&&detected(u,pid)&&spotted(pid,u.x,u.y))||G.buildings.some(b=>!b.dead&&b.owner===o&&spotted(pid,b.x,b.y));
    if(seen) makeContact(pid,o); }
}
/** Erstkontakt zwischen zwei Parteien */
export function makeContact(pid,o){
  if(G.known[pid][o]) return; G.known[pid][o]=true;
  if(pid===0&&o===1){ msg('🔭 Erstkontakt: Wir sind auf die Föderation Kastrova gestoßen! Diplomatie und Handel sind jetzt möglich (🤝).','#d6b45a');
    msg(`Geheimdienst: Kastrova hat ${G.regionText1}.`,'#d6b45a'); }
  if(pid===0&&o===2) msg('🔭 Erstkontakt: die Grenzmiliz von Belgor auf der Flussinsel – sie betreibt einen Markt (🤝).','#d6b45a');
  if(pid===1&&o===0) msg('⚠ Späher Kastrovas haben unsere Stadt entdeckt.','#ffb38a');
}
export function tileVis(x,y){ if(!G.fog) return 2; const tx=Math.floor(x),ty=Math.floor(y); return inMap(tx,ty)?G.vis[idx(tx,ty)]:0; }
export function inSightRect(b){ if(!G.fog) return true; for(let y=b.ty;y<b.ty+b.h;y++)for(let x=b.tx;x<b.tx+b.w;x++) if(G.vis[idx(x,y)]===2) return true; return false; }
export function visibleUnit(u){ return (!G.fog||seesFor0(u.owner)||tileVis(u.x,u.y)===2)&&detected(u,0); }
export function knownBuilding(b){ return !G.fog||seesFor0(b.owner)||b.seen; }
/** Fertiges Gebäude eines Typs (Baustellen zählen nicht) */
export function findBuilding(pid,type){return G.buildings.find(b=>!b.dead&&!b.site&&b.owner===pid&&b.type===type);}
/** Anzahl Gebäude; inclSites=true zählt auch Baustellen mit */
export function countBuildings(pid,type?,inclSites=false){let n=0;for(const b of G.buildings) if(!b.dead&&(inclSites||!b.site)&&b.owner===pid&&(!type||b.type===type)) n++;return n;}
/** Strom, Wohnraum und Lagerplatz (nur fertige Gebäude) */
export function recalcPower(pid){const p=G.players[pid];p.power=0;p.use=0;p.cap=0;p.store=STORAGE.base;
  for(const b of G.buildings){if(b.dead||b.site||b.contam||b.owner!==pid)continue;
    const pw=b.def.power||0;if(pw>0)p.power+=pw*lvlMul(b);else p.use-=pw;p.cap+=capOf(b);if(b.type==='depot')p.store+=STORAGE.depot*lvlMul(b);}}
export function freeTileAround(b,cls){
  const cand=[];
  for(let r=1;r<=4;r++){
    for(let y=b.ty-r;y<b.ty+b.h+r;y++)for(let x=b.tx-r;x<b.tx+b.w+r;x++){
      const onRing = x===b.tx-r||x===b.tx+b.w+r-1||y===b.ty-r||y===b.ty+b.h+r-1;
      if(!onRing||!passable(x,y,cls)) continue;
      const below = y>=b.ty+b.h ? 0 : 3;
      let crowd=0; for(const u of G.units) if(!u.dead&&Math.floor(u.x)===x&&Math.floor(u.y)===y) crowd++;
      cand.push({x,y,s:r*2+below+crowd*4+Math.abs(x-(b.tx+b.w/2))*0.3});
    }
    if(cand.length) break;
  }
  cand.sort((a,b)=>a.s-b.s); return cand[0]||null;
}
export function spawnUnit(pid,type,prod){
  const d=UNITS[type]; const spot=freeTileAround(prod,d.cls); if(!spot) return null;
  const u=makeUnit(pid,type,spot.x+0.5,spot.y+0.5);
  if(d.harvester){ u.hs='seek'; u.mode='harvest'; }
  else if(prod.type!=='bunker'){
    const r=nearestPassable(prod.x+(Math.random()-0.5)*3, prod.ty+prod.h+2+Math.random()*2, d.cls);
    if(r) orderMove([u], r.x+0.5, r.y+0.5);
  }
  if(pid===0) G.stats.built++;
  if(pid===1&&d.cls==='air'){ if(d.weapon&&d.weapon.kamikaze) u.lurk=true; else { u.patrol=true; u.mode='patrol'; u.path=null; } }   // KI: FPV lauern, Aufklärer fliegen los
  return u;
}

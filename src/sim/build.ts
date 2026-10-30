import { dist, idx, inMap } from '../core/util';
import { BUILDINGS, CONSTRUCTION, DENSITY, MAP_H, MAP_W, T, TECH_UNLOCKS } from '../data/config';
import { distTo } from '../sim/combat';
import { canAfford, costOf, pay } from '../sim/costs';
import { setPath } from '../sim/pathfinding';
import { G } from '../sim/state';
import { fxAdd } from '../sim/units';
import { findBuilding, nearestPassable, passable, rectDist, recalcPower, ringTiles, spawnUnit } from '../sim/world';
import { msg } from '../core/events';

/* =====================================================================
   Bauen vor Ort: Baustellen, Bauarbeiter, Straßen
   ---------------------------------------------------------------------
   Gebäude werden als Baustelle (b.site) gesetzt und erst von Bauarbeitern
   fertiggestellt. Straßen werden geplant (road=1) und Feld für Feld
   gebaut (road=2). Baustellen zählen nicht für Strom, Wohnraum oder
   Produktion.
   ===================================================================== */

/** Fertiges, intaktes Gebäude (keine Baustelle) */
export const active = b => !b.dead && !b.site;
/** Arbeitet das Gebäude? Fertig und mit Zufahrt (Verteidigung und Rathaus brauchen keine). */
export const works = b => !b.dead && !b.site && (b.type==='hq' || !!b.def.def || b.owner===2 || !!b.connected);
/** Arbeitendes Gebäude eines Typs (z. B. Produktionsstätte) */
export function findWorking(pid,type){ return G.buildings.find(b=>b.owner===pid&&b.type===type&&works(b)); }

// ---------- Baustellen ----------
export function completeSite(b){
  if(!b.site||b.dead) return;
  const d=b.def, pid=b.owner;
  b.site=false; b.progress=1; b.born=G.t; b.hp=Math.min(b.maxHp,Math.max(b.hp,b.maxHp*0.95));
  G.qDirty=true; G.roadDirty=true; recalcPower(pid);
  if(d.spawn) spawnUnit(pid,d.spawn,b);
  if(b.type==='university'){ const p=G.players[pid]; if(p.tech<1){ p.tech=1; if(pid===0) msg(`🎓 Universität Stufe 1: ${TECH_UNLOCKS[1]} freigeschaltet.`,'#9fd88a'); } }
  if(pid===0){ msg(`🏗 ${d.name} fertiggestellt.`,'#9fd88a'); G.stats.built++; }
  fxAdd({k:'marker',x:b.x,y:b.y,col:'#e8d27a',life:0.8});
}
export function siteWorkers(b){ let n=0; for(const u of G.units) if(!u.dead&&u.job&&u.job.b===b&&u.working) n++; return n; }

/** Abriss eines eigenen Gebäudes. Baustellen werden voll erstattet, fertige Gebäude teilweise. */
export function demolish(pid,b){
  if(!b||b.dead||b.owner!==pid||b.type==='hq'||b.kind!=='building') return false;
  const c=costOf(b.type), k=b.site?1:CONSTRUCTION.demolishRefund, p=G.players[pid];
  for(const r in c){ if(r==='pop') continue; p.res[r]+=Math.floor(c[r]*k); }
  b.dead=true;
  for(let y=b.ty;y<b.ty+b.h;y++)for(let x=b.tx;x<b.tx+b.w;x++) if(G.occ[idx(x,y)]===b.id) G.occ[idx(x,y)]=0;
  for(let i=0;i<5;i++) fxAdd({k:'smoke',x:b.x+(Math.random()-.5)*b.w,y:b.y+(Math.random()-.5)*b.h,r:0.4,life:1.2,delay:i*0.1});
  G.qDirty=true; G.roadDirty=true; recalcPower(pid);
  G.sel=G.sel.filter(s=>s!==b);
  return true;
}

// ---------- Straßen ----------
export function roadNearOwn(pid,x,y){
  for(const b of G.buildings) if(!b.dead&&b.owner===pid&&!b.def.def&&rectDist(b,x,y,1,1)<=CONSTRUCTION.roadRadius) return true;
  return false;
}
/** Darf hier eine Straße geplant werden? (freie Steppe/Schlamm/Ortschaft, keine Rohstoffe) */
export function roadTileOk(i){
  const t=G.terr[i];
  if(t!==T.GRASS&&t!==T.MUD&&t!==T.TOWN) return false;
  return !G.occ[i]&&G.oil[i]<=0&&G.ore[i]<=0&&G.rock[i]<=0&&!G.feat[i];
}
export function canPlaceRoad(pid,x,y){
  if(!inMap(x,y)) return false; const i=idx(x,y);
  if(G.road[i]||!roadTileOk(i)) return false;
  return roadNearOwn(pid,x,y);
}
export function planRoad(pid,x,y){
  if(!canPlaceRoad(pid,x,y)||!canAfford(pid,'road')) return false;
  pay(pid,'road',1); const i=idx(x,y); G.road[i]=1; G.roadOwner[i]=pid+1; G.roadDirty=true; return true;
}
/** Geplantes (noch nicht gebautes) Straßenfeld zurücknehmen */
export function cancelRoad(pid,x,y){
  if(!inMap(x,y)) return false; const i=idx(x,y);
  if(G.road[i]!==1||G.roadOwner[i]!==pid+1) return false;
  pay(pid,'road',-1); G.road[i]=0; G.roadOwner[i]=0; G.roadDirty=true; return true;
}
const N4=[[1,0],[-1,0],[0,1],[0,-1]], N8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
/** Straßennetz neu berechnen: welche Gebäude sind über gebaute Straßen mit dem Rathaus verbunden? */
export function updateRoadNet(){
  G.roadDirty=false;
  for(const pid of [0,1]){
    const hq=findBuilding(pid,'hq'); const seen=new Uint8Array(MAP_W*MAP_H), q=[];
    if(hq) for(const i of ringTiles(hq.tx,hq.ty,hq.w,hq.h)) if(G.road[i]===2){ seen[i]=1; q.push(i); }
    while(q.length){ const c=q.pop(), cx=c%MAP_W, cy=(c/MAP_W)|0;
      for(const [dx,dy] of N8){ const x=cx+dx,y=cy+dy; if(!inMap(x,y)) continue; const i=idx(x,y); if(!seen[i]&&G.road[i]===2){ seen[i]=1; q.push(i); } } }
    for(const b of G.buildings){ if(b.dead||b.owner!==pid) continue;
      b.connected = b.type==='hq' || (hq&&rectDist(b,hq.tx,hq.ty,hq.w,hq.h)===0) || ringTiles(b.tx,b.ty,b.w,b.h).some(i=>seen[i]); }
    recalcPower(pid);
  }
  updateFields();
  G.qDirty=true;
}
// ---------- Äcker ----------
/** Freie Steppe um Bauernhöfe wird zu Ackerland; zugebaute Felder senken den Ertrag. Ältere Höfe zuerst. */
export function fieldTileFree(i){ return G.terr[i]===T.GRASS&&!G.occ[i]&&!G.road[i]&&!G.feat[i]&&G.oil[i]<=0&&G.ore[i]<=0&&G.rock[i]<=0; }
export function updateFields(){
  G.field=G.field||new Uint8Array(MAP_W*MAP_H); G.field.fill(0);
  const R=DENSITY.farmFieldR;
  for(const b of G.buildings){ if(b.dead||b.type!=='farm') continue;
    if(b.site){ b.fields=0; b.fieldF=0; continue; }
    // nächstgelegene freie Felder zuerst, höchstens so viele wie nötig
    const cand=[];
    for(let y=b.ty-R;y<b.ty+b.h+R;y++)for(let x=b.tx-R;x<b.tx+b.w+R;x++){
      if(!inMap(x,y)) continue; const i=idx(x,y); if(G.field[i]||!fieldTileFree(i)) continue;
      cand.push([rectDist(b,x,y,1,1)+Math.abs(x+0.5-b.x)*0.01+Math.abs(y+0.5-b.y)*0.01,i]); }
    cand.sort((a,c)=>a[0]-c[0]);
    let n=0; for(const [,i] of cand){ if(n>=DENSITY.farmFields) break; G.field[i]=b.owner+1; n++; }
    b.fields=n; b.fieldF=Math.min(1,n/DENSITY.farmFields);
  }
}
/** Wie viele Ackerfelder hätte ein Hof an dieser Stelle? (Vorschau beim Platzieren) */
export function previewFields(tx,ty,w,h){
  const R=DENSITY.farmFieldR; let n=0;
  for(let y=ty-R;y<ty+h+R;y++)for(let x=tx-R;x<tx+w+R;x++){ if(!inMap(x,y)||(x>=tx&&x<tx+w&&y>=ty&&y<ty+h)) continue; const i=idx(x,y); if((!G.field||!G.field[i])&&fieldTileFree(i)) n++; }
  return n;
}

/** Straßenverlauf vom Rathaus zu einem Gebäude planen (Dijkstra; vorhandene Straßen werden bevorzugt).
 *  Gibt die noch zu planenden Felder zurück (leer = schon verbunden, null = kein Weg). */
export function routeRoad(pid,b){
  const hq=findBuilding(pid,'hq'); if(!hq||b===hq) return null;
  const N=MAP_W*MAP_H, cost=new Float32Array(N).fill(Infinity), from=new Int32Array(N).fill(-1), done=new Uint8Array(N);
  const goal=new Set(ringTiles(b.tx,b.ty,b.w,b.h));
  const stepCost=i=> G.road[i] ? 0.15 : (roadTileOk(i)&&roadNearOwn(pid,i%MAP_W,(i/MAP_W)|0) ? 1 : Infinity);
  const heap=[]; const push=(f,i)=>{heap.push([f,i]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m;}}return top;};
  for(const i of ringTiles(hq.tx,hq.ty,hq.w,hq.h)){ const c=stepCost(i); if(c<Infinity){ cost[i]=c; push(c,i); } }
  let end=-1;
  while(heap.length){ const [cc,c]=pop(); if(done[c]) continue; done[c]=1;
    if(goal.has(c)){ end=c; break; }
    const cx=c%MAP_W, cy=(c/MAP_W)|0;
    for(const [dx,dy] of N4){ const x=cx+dx,y=cy+dy; if(!inMap(x,y)) continue; const i=idx(x,y); if(done[i]) continue;
      const s=stepCost(i); if(s===Infinity) continue; const nc=cc+s; if(nc<cost[i]){ cost[i]=nc; from[i]=c; push(nc,i); } } }
  if(end<0) return null;
  const out=[]; for(let k=end;k!==-1;k=from[k]) if(!G.road[k]) out.push(k);
  return out.reverse();
}
/** Felder, die vom Rathaus aus per Straße erreichbar wären (für die KI-Platzwahl) */
export function roadReach(pid){
  const hq=findBuilding(pid,'hq'), seen=new Uint8Array(MAP_W*MAP_H); if(!hq) return seen;
  const ok=i=>G.road[i]>0||(roadTileOk(i)&&roadNearOwn(pid,i%MAP_W,(i/MAP_W)|0)), q=[];
  for(const i of ringTiles(hq.tx,hq.ty,hq.w,hq.h)) if(ok(i)){ seen[i]=1; q.push(i); }
  while(q.length){ const c=q.pop(), cx=c%MAP_W, cy=(c/MAP_W)|0;
    for(const [dx,dy] of N4){ const x=cx+dx,y=cy+dy; if(!inMap(x,y)) continue; const i=idx(x,y); if(!seen[i]&&ok(i)){ seen[i]=1; q.push(i); } } }
  return seen;
}
/** Beim Setzen einer Baustelle: Zufahrt automatisch planen. Ergebnis wie orderRoadTo. */
export function autoAccess(pid,b){
  const hq=findBuilding(pid,'hq'); if(!hq||b.def.def) return 0;
  if(rectDist(b,hq.tx,hq.ty,hq.w,hq.h)===0) return 0;
  return orderRoadTo(pid,b);
}
/** Straße zum Rathaus beauftragen. Ergebnis: Anzahl neuer Felder, 0 = schon verbunden/geplant, -1 = kein Weg, -2 = zu wenig Stein */
export function orderRoadTo(pid,b){
  const r=routeRoad(pid,b); if(r===null) return -1; if(!r.length) return 0;
  const need=r.length*costOf('road').stone; if(G.players[pid].res.stone<need) return -2;
  let n=0; for(const i of r) if(planRoad(pid,i%MAP_W,(i/MAP_W)|0)) n++;
  return n;
}

// ---------- Bauarbeiter ----------
function jobValid(j,pid){
  if(j.kind==='site') return !j.b.dead&&j.b.site&&j.b.owner===pid;
  return G.road[j.i]===1&&G.roadOwner[j.i]===pid+1;
}
function jobKey(j){ return j.kind==='site'?j.b.id:'r'+j.i; }
function findJob(u){
  const pid=u.owner, load=new Map();
  for(const w of G.units) if(!w.dead&&w!==u&&w.owner===pid&&w.job){ const k=jobKey(w.job); load.set(k,(load.get(k)||0)+1); }
  let best=null, bs=1e9;
  for(const b of G.buildings){ if(b.dead||b.owner!==pid||!b.site) continue; const n=load.get(b.id)||0; if(n>=CONSTRUCTION.maxWorkers) continue;
    const s=distTo(u,b)-8+n*2; if(s<bs){ bs=s; best={kind:'site',b}; } }
  for(let i=0;i<G.road.length;i++){ if(G.road[i]!==1||G.roadOwner[i]!==pid+1||load.has('r'+i)) continue;
    const s=dist(u.x,u.y,i%MAP_W+0.5,((i/MAP_W)|0)+0.5); if(s<bs){ bs=s; best={kind:'road',i}; } }
  return best;
}
function goToJob(u){
  const j=u.job;
  if(j.kind==='road'){ setPath(u,j.i%MAP_W+0.5,((j.i/MAP_W)|0)+0.5); return; }
  const b=j.b; let best=null, bd=1e9;
  for(const i of ringTiles(b.tx,b.ty,b.w,b.h)){ const x=i%MAP_W, y=(i/MAP_W)|0; if(!passable(x,y,'inf')) continue;
    let crowd=0; for(const w of G.units) if(!w.dead&&w!==u&&w.job&&w.job.b===b&&w.spot===i) crowd++;
    const d=dist(u.x,u.y,x+0.5,y+0.5)+crowd*3+Math.random()*0.5; if(d<bd){ bd=d; best=i; } }
  if(best===null){ u.job=null; return; }
  u.spot=best; setPath(u,best%MAP_W+0.5,((best/MAP_W)|0)+0.5);
}
/** Arbeiter einer Baustelle zuweisen (Spielerbefehl) */
export function assignWorkers(units,b){
  let n=0; for(const u of units){ if(!u.def.worker) continue; u.job={kind:'site',b}; u.mode='work'; u.target=null; u.jobTries=0; goToJob(u); n++; }
  return n;
}
export function updateWorker(u,dt){
  u.working=false;
  if(u.mode!=='idle'&&u.mode!=='work'){ u.job=null; return; }   // vom Spieler woandershin geschickt
  if(u.job&&!jobValid(u.job,u.owner)) u.job=null;
  if(!u.job){
    if(u.mode==='work'){ u.mode='idle'; u.guard={x:u.x,y:u.y}; }
    u.thinkT=(u.thinkT||0)-dt; if(u.thinkT>0) return; u.thinkT=0.7+Math.random()*0.5;
    const j=findJob(u);
    if(j){ u.job=j; u.mode='work'; u.jobTries=0; goToJob(u); return; }
    // nichts zu tun: zurück zum Rathaus
    const hq=findBuilding(u.owner,'hq');
    if(hq&&!u.path&&distTo(u,hq)>4.5){ const p=nearestPassable(hq.x+(Math.random()-.5)*4,hq.ty+hq.h+1+Math.random()*2,'inf'); if(p) setPath(u,p.x+0.5,p.y+0.5); }
    return;
  }
  const j=u.job, tx=j.kind==='road'?j.i%MAP_W+0.5:j.b.x, ty=j.kind==='road'?((j.i/MAP_W)|0)+0.5:j.b.y;
  const at = j.kind==='site' ? distTo(u,j.b)<0.95 : dist(u.x,u.y,tx,ty)<0.45;
  if(!at){
    if(!u.path||u.pathI>=u.path.length){ u.repathT-=dt; if(u.repathT<=0){ u.repathT=1; if(++u.jobTries>5){ u.job=null; u.jobTries=0; return; } goToJob(u); } }
    return;
  }
  u.path=null; u.working=true; u.jobTries=0;
  u.angle=Math.atan2(ty-u.y,tx-u.x);
  if(Math.random()<dt*1.5) fxAdd({k:'smoke',x:u.x+Math.cos(u.angle)*0.4,y:u.y+Math.sin(u.angle)*0.4,r:0.12,life:0.6});
  if(j.kind==='site'){
    const b=j.b, k=dt/(b.def.time*CONSTRUCTION.workTime);
    b.progress=Math.min(1,(b.progress||0)+k); b.hp=Math.min(b.maxHp,b.hp+b.maxHp*0.9*k);
    if(b.progress>=1) completeSite(b);
  } else {
    u.roadT=(u.roadT||0)+dt;
    if(u.roadT>=CONSTRUCTION.roadWork){ u.roadT=0; G.road[j.i]=2; G.roadDirty=true; u.job=null; }
  }
}

// ---------- Rohstoffgewinnung Holz & Stein ----------
/** Waldfelder im Umkreis eines Holzfällers */
export function forestTilesNear(tx,ty,w,h,r=3){
  const out=[]; for(let y=ty-r;y<ty+h+r;y++)for(let x=tx-r;x<tx+w+r;x++){ if(!inMap(x,y)) continue; const i=idx(x,y); if(G.terr[i]===T.FOREST&&G.wood[i]>0) out.push(i); }
  return out;
}
/** Wald ist abgeholzt: Feld wird Steppe (Renderer zeichnet es neu) */
export function clearForest(i){
  G.wood[i]=0; G.terr[i]=T.GRASS; G.terrChanged.push(i);
}
export function hasRockNear(tx,ty,w,h){ return ringTiles(tx,ty,w,h).some(i=>G.rock[i]>0); }
export const siteTypes = Object.keys(BUILDINGS).filter(k=>BUILDINGS[k].buildable!==false&&!BUILDINGS[k].def);

import { dist, idx, inMap } from '../core/util';
import { BUILDINGS, CONSTRUCTION, DENSITY, HAUL, MAP_H, MAP_W, RES, RESEARCH, T, TECH_UNLOCKS, TERRAIN, hasTech, isPlain, lvlOf, nextUpgrade } from '../data/config';
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
/** Arbeitet das Gebäude? (fertig und nicht zerstört) */
export const works = b => !b.dead && !b.site && !b.contam;   // verstrahlte Gebäude stehen still
/** Betriebe, deren Waren zur Sammelstelle gebracht werden müssen */
export const hauls = b => !!(b.def.wood||b.def.stone||b.def.metal||b.type==='farm');
/** Baustoffe, die erst beim Bauen aus dem Lager geholt werden */
export const MATS = ['wood','stone','metal'];
/** Arbeitendes Gebäude eines Typs (z. B. Produktionsstätte) */
export function findWorking(pid,type){ return G.buildings.find(b=>b.owner===pid&&b.type===type&&works(b)); }

// ---------- Baustellen ----------
export function completeSite(b){
  if(!b.site||b.dead) return;
  const d=b.def, pid=b.owner;
  if(b.dlv){ const p=G.players[pid]; for(const m in b.dlv) p.res[m]+=b.dlv[m]; b.dlv=null; }   // Reste zurück ins Lager
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
  const c=costOf(b.type), p=G.players[pid];
  if(b.site&&b.pio){ for(const r in c) if(r!=='pop') p.res[r]+=c[r]; }   // Stellung im Bau: alles zurück
  else if(b.site){ p.res.money+=c.money||0; for(const m of MATS) p.res[m]+=Math.floor(((b.used&&b.used[m])||0)+((b.dlv&&b.dlv[m])||0)); }   // Baustelle: Geld und verbautes Material zurück
  else for(const r in c){ if(r==='pop') continue; p.res[r]+=Math.floor(c[r]*CONSTRUCTION.demolishRefund); }
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
  if(!isPlain(t)&&t!==T.MUD&&t!==T.TOWN) return false;
  return !G.occ[i]&&G.oil[i]<=0&&G.ore[i]<=0&&G.rock[i]<=0&&!G.feat[i]&&!(G.fallMap&&G.fallMap[i])&&!(G.sapling&&G.sapling[i]>0);
}
export function canPlaceRoad(pid,x,y){
  if(!inMap(x,y)) return false; const i=idx(x,y);
  if(G.road[i]||!roadTileOk(i)) return false;
  return roadNearOwn(pid,x,y);
}
/** Straßenfeld planen (kostenlos – der Stein wird erst beim Bau verbraucht) */
export function planRoad(pid,x,y){
  if(!canPlaceRoad(pid,x,y)) return false;
  const i=idx(x,y); G.road[i]=1; G.roadOwner[i]=pid+1; G.roadDirty=true; return true;
}
/** Geplantes (noch nicht gebautes) Straßenfeld zurücknehmen */
export function cancelRoad(pid,x,y){
  if(!inMap(x,y)) return false; const i=idx(x,y);
  if(G.road[i]!==1||G.roadOwner[i]!==pid+1) return false;
  G.road[i]=0; G.roadOwner[i]=0; G.roadDirty=true; return true;
}
const N4=[[1,0],[-1,0],[0,1],[0,-1]], N8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
// ---------- Transportwege ----------
const heapOps=()=>{ const heap=[];
  return { heap,
    push:(f,i)=>{heap.push([f,i]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}},
    pop:()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m;}}return top;} }; };
/** Sammelstellen: Rathaus und fertige Lagerhäuser */
export const depots = pid => G.buildings.filter(b=>!b.dead&&!b.site&&b.owner===pid&&(b.type==='hq'||b.type==='depot'));
/** Wegkosten eines Feldes für Warentransport: Straße billig, Gelände nach Bewegungskosten, Wasser unpassierbar */
function haulStep(i){
  if(G.road[i]===2) return HAUL.roadCost;
  const c=TERRAIN[G.terr[i]].cost.inf; return c===Infinity?Infinity:c;
}
/** Leistung eines Betriebs abhängig vom Transportweg */
export const haulEff = w => Math.max(HAUL.min, 1/(1+Math.max(0,w-HAUL.free)/HAUL.half));
/** Transportwege aller Betriebe neu berechnen (Dijkstra von allen Sammelstellen aus) */
export function updateRoadNet(){
  G.roadDirty=false;
  for(const pid of [0,1]){
    const N=MAP_W*MAP_H, cost=new Float64Array(N).fill(Infinity), H=heapOps();   // Float64: sonst Rundungs-Endlosschleife
    for(const d of depots(pid)) for(const i of ringTiles(d.tx,d.ty,d.w,d.h)){ const c=haulStep(i); if(c<cost[i]){ cost[i]=c; H.push(c,i); } }
    while(H.heap.length){ const [cc,c]=H.pop(); if(cc>cost[c]) continue; const cx=c%MAP_W, cy=(c/MAP_W)|0;
      for(const [dx,dy] of N4){ const x=cx+dx,y=cy+dy; if(!inMap(x,y)) continue; const i=idx(x,y);
        const s=haulStep(i); if(s===Infinity) continue; const nc=cc+s; if(nc<cost[i]){ cost[i]=nc; H.push(nc,i); } } }
    if(pid===0) G.haulMap=cost;   // für die Vorschau beim Platzieren
    const dp=depots(pid);
    for(const b of G.buildings){ if(b.dead||b.owner!==pid) continue;
      let w=Infinity; if(dp.some(d=>rectDist(d,b.tx,b.ty,b.w,b.h)===0)) w=0;
      else for(const i of ringTiles(b.tx,b.ty,b.w,b.h)) w=Math.min(w,cost[i]);
      b.haul=w; b.eff=hauls(b)?(w===Infinity?HAUL.min:haulEff(w)):1; }
  }
  updateFields();
  G.qDirty=true;
}
// ---------- Äcker ----------
/** Freie Steppe um Bauernhöfe wird zu Ackerland; zugebaute Felder senken den Ertrag. Ältere Höfe zuerst. */
export function fieldTileFree(i){ return !(G.sapling&&G.sapling[i]>0)&&isPlain(G.terr[i])&&!G.occ[i]&&!G.road[i]&&!G.feat[i]&&G.oil[i]<=0&&G.ore[i]<=0&&G.rock[i]<=0; }
export function updateFields(){
  G.field=G.field||new Uint8Array(MAP_W*MAP_H); G.field.fill(0);
  const R=DENSITY.farmFieldR;
  for(const b of G.buildings){ if(b.dead||b.type!=='farm') continue;
    if(b.site){ b.fields=0; b.fieldF=0; continue; }
    // nächstgelegene freie Felder zuerst, höchstens so viele wie nötig
    const cand=[];
    for(let y=b.ty-R;y<b.ty+b.h+R;y++)for(let x=b.tx-R;x<b.tx+b.w+R;x++){
      if(!inMap(x,y)) continue; const i=idx(x,y); if(G.field[i]||!fieldTileFree(i)) continue;
      cand.push([rectDist(b,x,y,1,1)-(G.terr[i]===T.MEADOW?3:0)+Math.abs(x+0.5-b.x)*0.01+Math.abs(y+0.5-b.y)*0.01,i]); }
    cand.sort((a,c)=>a[0]-c[0]);   // Wiesen zuerst
    let n=0, y=0, m=0; for(const [,i] of cand){ if(n>=DENSITY.farmFields) break; G.field[i]=b.owner+1; n++; const mw=G.terr[i]===T.MEADOW; if(mw) m++; y+=mw?1:DENSITY.steppeYield; }
    b.fields=n; b.meadow=m; b.fieldF=Math.min(1,y/DENSITY.farmFields);
  }
}
/** Wie viele Ackerfelder hätte ein Hof an dieser Stelle? (Vorschau beim Platzieren) */
/** Ertrag (0..1) eines Hofs an dieser Stelle – Wiesen zählen voll, Steppe anteilig (Vorschau beim Platzieren) */
export function previewFields(tx,ty,w,h){
  const R=DENSITY.farmFieldR, ys=[];
  for(let y=ty-R;y<ty+h+R;y++)for(let x=tx-R;x<tx+w+R;x++){ if(!inMap(x,y)||(x>=tx&&x<tx+w&&y>=ty&&y<ty+h)) continue; const i=idx(x,y); if((!G.field||!G.field[i])&&fieldTileFree(i)) ys.push(G.terr[i]===T.MEADOW?1:DENSITY.steppeYield); }
  ys.sort((a,b)=>b-a); let s=0; for(let k=0;k<Math.min(ys.length,DENSITY.farmFields);k++) s+=ys[k];
  return Math.min(1,s/DENSITY.farmFields);
}

/** Straßenverlauf von der nächsten Sammelstelle (Rathaus/Lagerhaus) zu einem Gebäude planen
 *  (Dijkstra; vorhandene Straßen werden bevorzugt). Gibt die noch zu planenden Felder zurück
 *  (leer = schon verbunden, null = kein Weg). */
export function routeRoad(pid,b){
  const src=depots(pid).filter(d=>d!==b); if(!src.length||b.type==='hq') return null;
  if(src.some(d=>rectDist(d,b.tx,b.ty,b.w,b.h)===0)) return [];
  const N=MAP_W*MAP_H, cost=new Float32Array(N).fill(Infinity), from=new Int32Array(N).fill(-1), done=new Uint8Array(N);
  const goal=new Set(ringTiles(b.tx,b.ty,b.w,b.h));
  const stepCost=i=> G.road[i] ? 0.15 : (roadTileOk(i)&&roadNearOwn(pid,i%MAP_W,(i/MAP_W)|0) ? 1 : Infinity);
  const heap=[]; const push=(f,i)=>{heap.push([f,i]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m;}}return top;};
  for(const d of src) for(const i of ringTiles(d.tx,d.ty,d.w,d.h)){ const c=stepCost(i); if(c<cost[i]){ cost[i]=c; push(c,i); } }
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
/** Straßenverlauf zwischen zwei Feldern (Start- und Endpunkt) – vorhandene Straßen werden mitbenutzt.
 *  Gibt die neu zu planenden Felder zurück (null = kein Weg). */
export function routeRoadBetween(pid,x0,y0,x1,y1){
  if(!inMap(x0,y0)||!inMap(x1,y1)) return null;
  const okTile=i=>G.road[i]||(roadTileOk(i)&&roadNearOwn(pid,i%MAP_W,(i/MAP_W)|0));
  const a=idx(x0,y0), b=idx(x1,y1); if(!okTile(a)||!okTile(b)) return null;
  const N=MAP_W*MAP_H, cost=new Float64Array(N).fill(Infinity), from=new Int32Array(N).fill(-1), done=new Uint8Array(N);
  const stepCost=i=> G.road[i] ? 0.6 : okTile(i) ? 1 : Infinity;
  const H=heapOps(); cost[a]=0; H.push(0,a);
  while(H.heap.length){ const [cc,c]=H.pop(); if(done[c]) continue; done[c]=1; if(c===b) break;
    const cx=c%MAP_W, cy=(c/MAP_W)|0;
    for(const [dx,dy] of N4){ const x=cx+dx,y=cy+dy; if(!inMap(x,y)) continue; const i=idx(x,y); if(done[i]) continue;
      const s=stepCost(i); if(s===Infinity) continue; const nc=cc+s; if(nc<cost[i]){ cost[i]=nc; from[i]=c; H.push(nc,i); } } }
  if(!done[b]) return null;
  const out=[]; for(let k=b;k!==-1;k=from[k]) if(!G.road[k]) out.push(k);
  return out.reverse();
}
/** Straße von Start- bis Endpunkt planen. Ergebnis: Anzahl neuer Felder, -1 = kein Weg */
export function planRoadLine(pid,x0,y0,x1,y1){
  const r=routeRoadBetween(pid,x0,y0,x1,y1); if(r===null) return -1;
  let n=0; for(const i of r) if(planRoad(pid,i%MAP_W,(i/MAP_W)|0)) n++;
  return n;
}
/** Straße zur nächsten Sammelstelle planen. Ergebnis: Anzahl neuer Felder, 0 = schon verbunden/geplant, -1 = kein Weg */
export function orderRoadTo(pid,b){
  const r=routeRoad(pid,b); if(r===null) return -1; if(!r.length) return 0;
  let n=0; for(const i of r) if(planRoad(pid,i%MAP_W,(i/MAP_W)|0)) n++;
  return n;
}

// ---------- Bauarbeiter ----------
// Arbeiter holen Holz, Stein und Metall im Rathaus/Lagerhaus und tragen es zur Baustelle (je Gang CONSTRUCTION.carry).
// Straßen: Stein holen, dann Feld für Feld bauen. Weite Wege und fehlende Straßen bremsen also auch das Bauen.
const roadStone=()=>costOf('road').stone||0;
const tileX=i=>i%MAP_W+0.5, tileY=i=>((i/MAP_W)|0)+0.5;
/** nächste Sammelstelle (Rathaus/Lagerhaus) zu einem Punkt */
export function nearestDepot(pid,x,y){ let best=null,bd=1e9; for(const d of depots(pid)){ const dd=distTo({x,y},d); if(dd<bd){bd=dd;best=d;} } return best; }
/** Material, das gerade zu einer Baustelle unterwegs ist */
function incoming(b,m){ let n=0; for(const w of G.units) if(!w.dead&&w.job&&w.job.kind==='haul'&&w.job.b===b&&w.job.m===m) n+=w.job.amt; return n; }
/** noch zu holende Menge eines Baustoffs */
function stillNeeded(b,m){ const c=costOf(b.type); if(!c[m]) return 0; return c[m]-((b.used&&b.used[m])||0)-((b.dlv&&b.dlv[m])||0)-incoming(b,m); }
/** kann an der Baustelle gearbeitet werden? (jeder nötige Baustoff liegt vor Ort oder ist schon verbaut) */
function buildable(b){ const c=costOf(b.type); for(const m of MATS) if(c[m]&&((b.used&&b.used[m])||0)<c[m]-0.01&&((b.dlv&&b.dlv[m])||0)<0.01) return false; return true; }
/** Fehlt einer Baustelle Material im Lager? (Rohstoff oder null) */
export function siteLacks(b){ if(b.pio) return null; const p=G.players[b.owner], c=costOf(b.type);
  for(const m of MATS) if(c[m]&&stillNeeded(b,m)>0.01&&((b.dlv&&b.dlv[m])||0)<0.01&&p.res[m]<1) return m; return null; }
/** Baustoffe vor Ort / gebraucht (für die Anzeige) */
export function siteStock(b){ const c=costOf(b.type), out=[]; for(const m of MATS) if(c[m]) out.push({m,have:((b.used&&b.used[m])||0)+((b.dlv&&b.dlv[m])||0),need:c[m]}); return out; }
function jobValid(j,pid){
  if(j.kind==='site'||j.kind==='haul') return !j.b.dead&&j.b.site&&j.b.owner===pid;
  if(j.kind==='road') return G.road[j.i]===1&&G.roadOwner[j.i]===pid+1;
  return true;   // return
}
function findJob(u){
  const pid=u.owner, p=G.players[pid], load=new Map(), roadTaken=new Set();
  for(const w of G.units) if(!w.dead&&w!==u&&w.owner===pid&&w.job){ if(w.job.kind==='site') load.set(w.job.b.id,(load.get(w.job.b.id)||0)+1); if(w.job.kind==='road') roadTaken.add(w.job.i); }
  const carry=u.carry;
  let best=null, bs=1e9;
  const consider=(s,j)=>{ if(s<bs){ bs=s; best=j; } };
  for(const b of G.buildings){ if(b.dead||b.owner!==pid||!b.site||b.pio) continue;   // Stellungen bauen die Pioniere
    // bauen
    if(buildable(b)&&(load.get(b.id)||0)<CONSTRUCTION.maxWorkers) consider(distTo(u,b)-8+(load.get(b.id)||0)*2,{kind:'site',b});
    // Material bringen
    for(const m of MATS){ const need=stillNeeded(b,m); if(need<0.5) continue;
      if(carry&&carry.res===m){ consider(distTo(u,b)-12,{kind:'haul',b,m,amt:Math.min(carry.amt,need),phase:'deliver'}); continue; }
      if(p.res[m]<1) continue;
      const d=nearestDepot(pid,b.x,b.y); if(!d) continue;
      consider(distTo(u,d)+distTo(d,b)*0.5-6,{kind:'haul',b,m,amt:Math.min(CONSTRUCTION.carry,need,Math.floor(p.res[m])),phase:'fetch',d}); }
  }
  // Straßen
  const hasStone=carry&&carry.res==='stone'&&carry.amt>=roadStone();
  if(hasStone||p.res.stone>=roadStone()) for(let i=0;i<G.road.length;i++){ if(G.road[i]!==1||G.roadOwner[i]!==pid+1||roadTaken.has(i)) continue;
    consider(dist(u.x,u.y,tileX(i),tileY(i))-(hasStone?14:0),{kind:'road',i,phase:hasStone?'go':'fetch'}); }
  // übrig gebliebene Last zurückbringen
  if(!best&&carry){ const d=nearestDepot(pid,u.x,u.y); if(d) best={kind:'return',d}; }
  return best;
}
/** Laufziel zu einem Gebäude: freies Randfeld, möglichst nicht von anderen Arbeitern belegt */
function goToBuilding(u,b){
  let best=null, bd=1e9;
  for(const i of ringTiles(b.tx,b.ty,b.w,b.h)){ const x=i%MAP_W, y=(i/MAP_W)|0; if(!passable(x,y,'inf')) continue;
    let crowd=0; for(const w of G.units) if(!w.dead&&w!==u&&w.spot===i) crowd++;
    const d=dist(u.x,u.y,x+0.5,y+0.5)+crowd*3+Math.random()*0.5; if(d<bd){ bd=d; best=i; } }
  if(best===null) return false;
  u.spot=best; setPath(u,tileX(best),tileY(best)); return true;
}
function goToJob(u){
  const j=u.job;
  if(j.kind==='road'){ if(j.phase==='fetch'){ j.d=nearestDepot(u.owner,tileX(j.i),tileY(j.i)); if(!j.d||!goToBuilding(u,j.d)) u.job=null; } else setPath(u,tileX(j.i),tileY(j.i)); return; }
  if(j.kind==='return'){ if(j.d.dead||!goToBuilding(u,j.d)) u.job=null; return; }
  const target=j.kind==='haul'&&j.phase==='fetch'?j.d:j.b;
  if(!target||target.dead||!goToBuilding(u,target)) u.job=null;
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
  const j=u.job, p=G.players[u.owner];
  // Ziel dieses Abschnitts
  const tgt = j.kind==='road'&&j.phase!=='fetch' ? null : j.kind==='road'||j.kind==='return' ? j.d : j.kind==='haul'&&j.phase==='fetch' ? j.d : j.b;
  const at = tgt ? (!tgt.dead&&distTo(u,tgt)<0.95) : dist(u.x,u.y,tileX(j.i),tileY(j.i))<0.45;
  if(!at){
    if(!u.path||u.pathI>=u.path.length){ u.repathT-=dt; if(u.repathT<=0){ u.repathT=1; if(++u.jobTries>5){ u.job=null; u.jobTries=0; return; } goToJob(u); } }
    return;
  }
  u.path=null; u.jobTries=0;
  if(j.kind==='return'){ p.res[u.carry.res]+=u.carry.amt; u.carry=null; u.job=null; return; }
  if(j.kind==='haul'){
    if(j.phase==='fetch'){
      const a=Math.min(j.amt,Math.floor(p.res[j.m])); if(a<=0){ u.job=null; return; }
      if(u.carry&&u.carry.res!==j.m){ p.res[u.carry.res]+=u.carry.amt; u.carry=null; }   // anderes Material abgeben
      p.res[j.m]-=a; u.carry={res:j.m,amt:(u.carry?u.carry.amt:0)+a}; j.amt=Math.min(u.carry.amt,stillNeeded(j.b,j.m)+j.amt); j.phase='deliver'; goToJob(u); return; }
    // abliefern
    const b=j.b, a=Math.min(u.carry?u.carry.amt:0, Math.max(0,stillNeeded(b,j.m)+j.amt));
    b.dlv=b.dlv||{}; b.dlv[j.m]=(b.dlv[j.m]||0)+a; u.carry.amt-=a; if(u.carry.amt<=0.01) u.carry=null;
    u.job=null; u.thinkT=0; return;
  }
  if(j.kind==='road'&&j.phase==='fetch'){
    const a=Math.min(CONSTRUCTION.carry-(u.carry&&u.carry.res==='stone'?u.carry.amt:0),Math.floor(p.res.stone));
    if(u.carry&&u.carry.res!=='stone'){ p.res[u.carry.res]+=u.carry.amt; u.carry=null; }
    if(a>0){ p.res.stone-=a; u.carry={res:'stone',amt:(u.carry?u.carry.amt:0)+a}; }
    if(!u.carry||u.carry.amt<roadStone()){ u.job=null; return; }
    j.phase='go'; goToJob(u); return; }
  // arbeiten
  u.working=true;
  const tx=j.kind==='road'?tileX(j.i):j.b.x, ty=j.kind==='road'?tileY(j.i):j.b.y;
  u.angle=Math.atan2(ty-u.y,tx-u.x);
  if(Math.random()<dt*1.5) fxAdd({k:'smoke',x:u.x+Math.cos(u.angle)*0.4,y:u.y+Math.sin(u.angle)*0.4,r:0.12,life:0.6});
  if(j.kind==='site'){
    const b=j.b, c=costOf(b.type); b.used=b.used||{}; b.dlv=b.dlv||{};
    let k=Math.min(dt/(b.def.time*CONSTRUCTION.workTime),1-(b.progress||0));
    for(const m of MATS) if(c[m]&&b.used[m]<c[m]-0.01) k=Math.min(k,(b.dlv[m]||0)/c[m]);   // nur so weit, wie Material vor Ort ist
    if(k<=1e-6&&(b.progress||0)<0.9999){ u.working=false; u.job=null; u.thinkT=0; return; }
    for(const m of MATS) if(c[m]){ const a=Math.min(c[m]*k,b.dlv[m]||0); b.dlv[m]=(b.dlv[m]||0)-a; b.used[m]=(b.used[m]||0)+a; }
    b.progress=Math.min(1,(b.progress||0)+k); b.hp=Math.min(b.maxHp,b.hp+b.maxHp*0.9*k);
    if(b.progress>=0.9999) completeSite(b);
  } else {
    if(u.roadI!==j.i){   // neues Feld: Stein vom getragenen Vorrat nehmen
      if(!u.carry||u.carry.res!=='stone'||u.carry.amt<roadStone()){ u.working=false; j.phase='fetch'; goToJob(u); return; }
      u.carry.amt-=roadStone(); if(u.carry.amt<=0.01) u.carry=null; u.roadI=j.i; u.roadT=0; }
    u.roadT+=dt;
    if(u.roadT>=CONSTRUCTION.roadWork){ u.roadT=0; u.roadI=-1; G.road[j.i]=2; G.roadDirty=true; u.job=null; u.thinkT=0; }
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

// ---------- Ausbau am Platz ----------
/** Kann das Gebäude ausgebaut werden? Ergebnis: [] = ja, sonst Gründe */
export function upgradeBlock(pid,b){
  const U=nextUpgrade(b), p=G.players[pid], why=[];
  if(!U) return ['höchste Stufe erreicht'];
  if(b.site||b.upg) return ['wird gerade gebaut'];
  if(U.research&&!hasTech(p,U.research)) why.push(`Forschung „${RESEARCH[U.research].name}“`);
  for(const r of Object.keys(U.cost)) if(p.res[r]<U.cost[r]) why.push(`zu wenig ${RES[r].name}`);
  return why;
}
/** Ausbau beginnen: Kosten werden sofort fällig, das Gebäude arbeitet währenddessen weiter */
export function startUpgrade(pid,b){
  if(b.owner!==pid||upgradeBlock(pid,b).length) return false;
  const U=nextUpgrade(b), p=G.players[pid];
  for(const r of Object.keys(U.cost)) p.res[r]-=U.cost[r];
  b.upg={t:0,time:U.time}; return true;
}
export function updateUpgrades(dt){
  for(const b of G.buildings){ if(b.dead||!b.upg) continue;
    const p=G.players[b.owner]; b.upg.t+=dt*(p.broke?0.5:1);
    if(b.upg.t>=b.upg.time){ const U=nextUpgrade(b); b.lvl=lvlOf(b)+1; b.upg=null; recalcPower(b.owner);
      const mh=Math.round(b.def.hp*(1+0.25*(b.lvl-1))); b.hp+=mh-b.maxHp; b.maxHp=mh;   // stabiler gebaut
      if(b.owner===0&&U) msg(`⬆ Ausgebaut: ${b.def.name.replace(/\u00AD/g,'')} → ${U.name} (${upgradeEffect(b.type,U)}).`,'#9fd88a'); } }
}
/** Wirkung einer Ausbaustufe in Worten */
export function upgradeEffect(type,U){
  if(U.cap) return `${U.cap} Wohnraum`; if(U.food) return `Ertrag ×${String(U.food).replace('.',',')}`;
  const d=BUILDINGS[type], m=String(U.mul).replace('.',','); if(d.fireR) return `Löschbereich +${Math.round((lvlOf({lvl:2})-1)*25)} % und schneller`;
  const what=d.cap?'Wohnraum':d.power>0?'Strom':d.fun?'Unterhaltung':d.type==='depot'||type==='depot'?'Lagerplatz':d.export?'Export':d.food?'Nahrung':(d.wood||d.stone||d.metal||d.oilOut||d.refine)?'Förderung':['hq','barracks','factory','droneshop','university','kontor'].includes(type)?'Ausbildung/Forschung':'Leistung';
  return `${what} ×${m}`;
}

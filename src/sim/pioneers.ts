import { dist, idx, inMap } from '../core/util';
import { FEAT, FEATURES, MAP_W, PIONEER } from '../data/config';
import { applyDamage, distTo, splash } from '../sim/combat';
import { setPath } from '../sim/pathfinding';
import { G } from '../sim/state';
import { fxAdd } from '../sim/units';
import { hostile, passable, ringTiles } from '../sim/world';
import { completeSite } from '../sim/build';
import { msg } from '../core/events';

/* =====================================================================
   Pioniere: bauen geplante Verteidigung vor Ort, legen und räumen Minen
   ---------------------------------------------------------------------
   Pläne: G.fplan (Feature-ID) + G.fplanOwner; Stellungen sind Baustellen mit b.pio.
   Minen: G.feat = FEAT.MINE, G.featOwner = Besitzer+1 – für Feinde unsichtbar.
   ===================================================================== */
const featKey = id => Object.keys(FEATURES).find(k=>FEATURES[k].id===id&&!FEATURES[k].road);
const tx = i => i%MAP_W+0.5, ty = i => ((i/MAP_W)|0)+0.5;

function findJob(u){
  const pid=u.owner, load=new Map(), taken=new Set();
  for(const w of G.units) if(!w.dead&&w!==u&&w.owner===pid&&w.pjob){ if(w.pjob.b) load.set(w.pjob.b.id,(load.get(w.pjob.b.id)||0)+1); else taken.add(w.pjob.i); }
  let best=null, bs=1e9;
  for(const b of G.buildings){ if(b.dead||b.owner!==pid||!b.site||!b.pio) continue; const n=load.get(b.id)||0; if(n>=PIONEER.maxPerSite) continue;
    const s=distTo(u,b)-3+n*2; if(s<bs){ bs=s; best={b}; } }
  for(let i=0;i<G.fplan.length;i++){ if(!G.fplan[i]||G.fplanOwner[i]!==pid+1||taken.has(i)) continue;
    const s=dist(u.x,u.y,tx(i),ty(i)); if(s<bs){ bs=s; best={i}; } }
  return best;
}
function valid(j,pid){ return j.b ? (!j.b.dead&&j.b.site&&j.b.owner===pid) : (G.fplan[j.i]>0&&G.fplanOwner[j.i]===pid+1); }
function goTo(u){
  const j=u.pjob;
  if(j.i!==undefined){ setPath(u,tx(j.i),ty(j.i)); return; }
  let best=null,bd=1e9; for(const i of ringTiles(j.b.tx,j.b.ty,j.b.w,j.b.h)){ const x=i%MAP_W, y=(i/MAP_W)|0; if(!passable(x,y,'inf')) continue; const d=dist(u.x,u.y,x+0.5,y+0.5)+Math.random()*0.4; if(d<bd){bd=d;best=i;} }
  if(best===null){ u.pjob=null; return; } setPath(u,tx(best),ty(best));
}
export function updatePioneer(u,dt){
  u.working=false;
  clearMines(u,dt);
  if(u.target||(u.mode!=='idle'&&u.mode!=='work')){ if(u.mode!=='work') u.pjob=null; return; }   // kämpft oder wurde woandershin geschickt
  if(u.pjob&&!valid(u.pjob,u.owner)) u.pjob=null;
  if(!u.pjob){ if(u.mode==='work'){ u.mode='idle'; u.guard={x:u.x,y:u.y}; }
    u.thinkT=(u.thinkT||0)-dt; if(u.thinkT>0) return; u.thinkT=0.8+Math.random()*0.4;
    const j=findJob(u); if(j){ u.pjob=j; u.mode='work'; u.ptries=0; goTo(u); } return; }
  const j=u.pjob, at=j.b?distTo(u,j.b)<0.95:dist(u.x,u.y,tx(j.i),ty(j.i))<0.5;
  if(!at){ if(!u.path||u.pathI>=u.path.length){ u.repathT-=dt; if(u.repathT<=0){ u.repathT=1; if(++u.ptries>5){ u.pjob=null; return; } goTo(u); } } return; }
  u.path=null; u.working=true;
  if(Math.random()<dt*1.5) fxAdd({k:'smoke',x:u.x,y:u.y+0.2,r:0.12,life:0.6});
  if(j.b){ const b=j.b, k=dt/(Math.max(1,b.def.time)*PIONEER.workTime);
    b.progress=Math.min(1,(b.progress||0)+k); b.hp=Math.min(b.maxHp,b.hp+b.maxHp*0.9*k);
    if(b.progress>=0.9999){ completeSite(b); u.pjob=null; } return; }
  const key=featKey(G.fplan[j.i]); if(!key){ G.fplan[j.i]=0; u.pjob=null; return; }
  u.pt=(u.pi===j.i?u.pt:0)+dt; u.pi=j.i;
  if(u.pt>=FEATURES[key].work){ G.feat[j.i]=FEATURES[key].id; G.featOwner[j.i]=u.owner+1; G.fplan[j.i]=0; G.fplanOwner[j.i]=0; u.pt=0; u.pi=-1; u.pjob=null; u.thinkT=0; }
}
/** feindliche Minen in der Nähe erkennen und räumen */
function clearMines(u,dt){
  u.mineT=(u.mineT||0)-dt; if(u.mineT>0&&!u.clearing) return; u.mineT=0.5;
  let found=-1; const r=Math.ceil(PIONEER.detect);
  for(let y=Math.floor(u.y)-r;y<=Math.floor(u.y)+r&&found<0;y++)for(let x=Math.floor(u.x)-r;x<=Math.floor(u.x)+r;x++){ if(!inMap(x,y)) continue; const i=idx(x,y);
    if(G.feat[i]===FEAT.MINE&&G.featOwner[i]&&G.featOwner[i]-1!==u.owner&&dist(u.x,u.y,x+0.5,y+0.5)<=PIONEER.detect){ found=i; break; } }
  if(found<0){ u.clearing=null; return; }
  if(u.owner===0) G.mineSeen[found]=1;
  if(u.clearing!==found){ u.clearing=found; u.clearT=0; if(u.owner===0) msg('⚠ Pioniere haben eine feindliche Mine entdeckt und räumen sie.','#ffb38a'); }
  u.clearT+=0.5; if(u.clearT>=PIONEER.clearTime){ G.feat[found]=0; G.featOwner[found]=0; G.mineSeen[found]=0; u.clearing=null; fxAdd({k:'smoke',x:tx(found),y:ty(found),r:0.3,life:0.8}); }
}
/** Fahrzeug fährt auf ein Feld: feindliche Mine? */
export function checkMine(u,i){
  if(G.feat[i]!==FEAT.MINE||!G.featOwner[i]) return;
  const o=G.featOwner[i]-1; if(o===u.owner||!hostile(u.owner,o)) return;
  G.feat[i]=0; G.featOwner[i]=0; G.mineSeen[i]=0;
  const src={owner:o, x:tx(i), y:ty(i), dead:true, kind:'mine', def:{}};
  fxAdd({k:'boom',x:src.x,y:src.y,r:0.9,life:0.7}); G.scorch.push({x:src.x,y:src.y,r:0.6,t:G.t});
  applyDamage(u,PIONEER.mineDmg,'mine',src); splash(src.x,src.y,PIONEER.mineSplash,PIONEER.mineDmg*0.3,'mine',src);
  if(u.owner===0) msg(`💥 ${u.def.name} ist auf eine Mine gefahren!`,'#ff8a7a');
  else if(o===0) msg(`💥 Ein feindliches Fahrzeug ist auf unsere Mine gefahren (${u.def.name}).`,'#9fd88a');
}

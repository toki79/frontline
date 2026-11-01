import { dist } from '../core/util';
import { CONSTRUCTION, FIRE, FOREST, MAP_H, MAP_W, T, lvlMul } from '../data/config';
import { idx, inMap } from '../core/util';
import { fieldTileFree, works } from '../sim/build';
import { ignite, touching } from '../sim/combat';
import { G } from '../sim/state';
import { funCoverage } from '../sim/devplan';

/* =====================================================================
   Stadtleben: Brandgefahr und Feuerwehr
   ---------------------------------------------------------------------
   In größeren Städten bricht ab und zu Feuer aus – in eng bebauten Vierteln
   öfter. Eine Feuerwache im Umkreis senkt die Gefahr, löscht schnell und
   verhindert, dass Brände übergreifen.
   ===================================================================== */
const station = b => b.def.fireR && !b.dead && !b.site && !b.contam;
/** liegt das Gebäude im Schutzbereich einer eigenen Feuerwache? */
export function covered(b){ for(const s of G.buildings) if(s.owner===b.owner&&station(s)&&dist(s.x,s.y,b.x,b.y)<=s.def.fireR*(1+0.25*((s.lvl||1)-1))) return true; return false; }
const burnable = b => !b.dead && !b.def.def && b.type!=='bunker' && b.type!=='camp' && b.owner<2;
/** Anteil der eigenen Gebäude im Schutz einer Feuerwache */
export function fireCoverage(pid){ const own=G.buildings.filter(b=>burnable(b)&&!b.site&&b.owner===pid); if(!own.length) return 1;
  return own.filter(b=>b.fireCov).length/own.length; }
/** Forsthaus: pflanzt Setzlinge auf freiem Land im Umkreis; Setzlinge wachsen zu Wald heran */
function updateForest(){
  const N=MAP_W*MAP_H; if(!G.sapling||G.sapling.length!==N){ G.sapling=new Float32Array(N); G.saplings=[]; }
  for(const b of G.buildings){ if(!b.def.forester||!works(b)) continue;
    b.plantT=(b.plantT??FOREST.plantEvery)-lvlMul(b); if(b.plantT>0) continue; b.plantT=FOREST.plantEvery;
    const R=FOREST.radius, cand=[]; let n=0;
    for(let y=Math.floor(b.y-R-1);y<=b.y+R;y++)for(let x=Math.floor(b.x-R-1);x<=b.x+R;x++){ if(!inMap(x,y)||dist(x+0.5,y+0.5,b.x,b.y)>R+b.w/2) continue; const i=idx(x,y);
      if(G.sapling[i]>0){ n++; continue; }
      if(!fieldTileFree(i)||(G.field&&G.field[i])||(G.fallMap&&G.fallMap[i])) continue;
      let near=false; for(let yy=y-1;yy<=y+1&&!near;yy++)for(let xx=x-1;xx<=x+1;xx++) if(inMap(xx,yy)&&G.occ[idx(xx,yy)]&&G.occ[idx(xx,yy)]!==b.id){ near=true; break; }   // Abstand zu anderen Gebäuden
      if(!near) cand.push(i); }
    if(n<FOREST.maxSaplings*lvlMul(b)&&cand.length){ const i=cand[Math.floor(Math.random()*cand.length)]; G.sapling[i]=FOREST.grow; G.saplings.push(i); } }
  if(G.saplings&&G.saplings.length) G.saplings=G.saplings.filter(i=>{ if(!(G.sapling[i]>0)) return false; G.sapling[i]-=1;
    if(G.sapling[i]<=0){ G.sapling[i]=0; if(!G.occ[i]&&!G.road[i]){ G.terr[i]=T.FOREST; G.wood[i]=CONSTRUCTION.forestWood; G.terrChanged.push(i); } return false; } return true; });
}
export function updateCity(dt){
  G.cityT=(G.cityT||0)-dt; if(G.cityT>0) return; G.cityT=1;
  updateForest();
  const st=G.buildings.filter(station);
  for(const b of G.buildings) if(burnable(b)) b.fireCov=st.some(s=>s.owner===b.owner&&dist(s.x,s.y,b.x,b.y)<=s.def.fireR*(1+0.25*((s.lvl||1)-1)));
  G.funCov=[funCoverage(0),funCoverage(1)];
  for(const pid of [0,1]){ const p=G.players[pid]; if(p.pop<FIRE.minPop) continue;
    const k=Math.min(2,p.pop/1000);   // größere Städte: mehr Brandgefahr
    for(const b of G.buildings){ if(!burnable(b)||b.owner!==pid||b.site||b.fire>0) continue;
      const pre=FIRE.outbreak*(1+k)*4*(b.fireCov?FIRE.stationOutbreak:1); if(Math.random()>=pre) continue;   // grobe Vorauswahl, dann Nachbarn zählen
      const n=Math.min(4,touching(b).length); if(n&&Math.random()<n/4) ignite(b); } }   // frei stehende Gebäude fangen kaum Feuer
}
export { lvlMul };

import { dist } from '../core/util';
import { FIRE, lvlMul } from '../data/config';
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
export function updateCity(dt){
  G.cityT=(G.cityT||0)-dt; if(G.cityT>0) return; G.cityT=1;
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

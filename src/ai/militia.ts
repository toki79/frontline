import { dist } from '../core/util';
import { orderMove } from '../sim/orders';
import { G } from '../sim/state';
import { anyWar, findBuilding, foesOf, nearestPassable, spawnUnit } from '../sim/world';
import { MAJORS } from '../data/config';
import { msg } from '../core/events';

/* =====================================================================
   Grenzmiliz
   ===================================================================== */
export function militiaThink(){
  for(const k of MAJORS) if(!G.militiaWar[k]&&G.militiaAlly!==k) G.attitude[k]*=0.998;
  const bunker=findBuilding(2,'bunker'); if(!bunker) return;
  const mus=G.units.filter(u=>!u.dead&&u.owner===2);
  for(const u of mus) if(!u.raid&&u.mode==='idle'&&!u.target&&dist(u.x,u.y,bunker.x,bunker.y)>6){
    const p=nearestPassable(bunker.x+(Math.random()-.5)*5,bunker.y+(Math.random()-.5)*5,'inf'); if(p) orderMove([u],p.x+0.5,p.y+0.5); }
  if(G.militiaAlly>=0){
    if(--G.milSpawnT<=0){G.milSpawnT=25; if(mus.length<10) spawnUnit(2,'militia',bunker);}
    if(anyWar(G.militiaAlly)&&--G.milRaidT<=0){G.milRaidT=50;
      const idle=mus.filter(u=>!u.raid&&!u.target), foes=foesOf(G.militiaAlly);
      if(idle.length>=5){ const grp=idle.slice(0,idle.length-3);
        let tg=null,bd=1e9; for(const b of G.buildings) if(!b.dead&&foes.includes(b.owner)){const d=dist(b.x,b.y,bunker.x,bunker.y); if(d<bd){bd=d;tg=b;}}
        if(tg){ grp.forEach(u=>u.raid=true); orderMove(grp,tg.x,tg.y,'amove');
          if(tg.owner===0) msg('⚠ Milizkämpfer rücken gegen unsere Stadt vor!','#ff8a7a');
          else if(G.militiaAlly===0) msg(`Milizkämpfer greifen ${G.players[tg.owner].short} an – für unser Bündnis!`,'#9fd88a'); } }
    }
  }
}

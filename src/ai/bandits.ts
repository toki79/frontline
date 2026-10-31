import { dist } from '../core/util';
import { BANDITS } from '../data/config';
import { distTo } from '../sim/combat';
import { orderMove } from '../sim/orders';
import { G } from '../sim/state';
import { nearestPassable, spawnUnit } from '../sim/world';
import { msg } from '../core/events';

/* =====================================================================
   Räuberbanden (Partei 3): feindlich zu allen
   ---------------------------------------------------------------------
   Jedes Lager bewacht sein Gebiet (BANDITS.territory) und greift alles an,
   was dort auftaucht – unbegleitete Arbeiter und Laster sind leichte Beute.
   Ab und zu überfallen sie Gebäude in Reichweite. Ein zerstörtes Lager
   bringt Beute.
   ===================================================================== */
const rnd = (r: number[]) => r[0]+Math.random()*(r[1]-r[0]);
export function banditThink(){
  const camps=G.buildings.filter(b=>!b.dead&&b.type==='camp');
  const all=G.units.filter(u=>!u.dead&&u.owner===3);
  for(const c of camps){
    const mine=all.filter(u=>u.camp===c.id);
    if(!c.init){ c.init=true; c.raidT=rnd(BANDITS.raidEvery)+120; c.spawnT=BANDITS.spawn;
      for(let i=0;i<BANDITS.guard;i++){ const u=spawnUnit(3,'bandit',c); if(u){ u.camp=c.id; mine.push(u); } } }
    const cap=Math.min(BANDITS.max,BANDITS.guard+Math.floor(G.t/400));
    c.spawnT-=1;
    if(mine.length<cap&&c.spawnT<=0){ c.spawnT=BANDITS.spawn; const u=spawnUnit(3,'bandit',c); if(u){ u.camp=c.id; mine.push(u); } }
    // Eindringlinge im eigenen Gebiet angreifen
    let intr=null, bd=1e9;
    for(const e of G.units){ if(e.dead||e.owner===3||e.def.cls==='air') continue; const d=dist(e.x,e.y,c.x,c.y); if(d<BANDITS.territory&&d<bd){ bd=d; intr=e; } }
    for(const b of G.buildings){ if(b.dead||b.owner>1) continue; const d=distTo(c,b); if(d<BANDITS.territory&&d<bd){ bd=d; intr=b; } }
    if(intr) for(const u of mine) if(!u.raid&&!u.target&&u.mode!=='amove') orderMove([u],intr.x,intr.y,'amove');
    // Überfall auf ein Gebäude in Reichweite
    c.raidT-=1;
    if(c.raidT<=0){ c.raidT=rnd(BANDITS.raidEvery);
      let tg=null, td=1e9;
      for(const b of G.buildings){ if(b.dead||b.owner>1||b.def.def) continue; const d=distTo(c,b); if(d<BANDITS.raidRange&&d<td){ td=d; tg=b; } }
      const grp=mine.filter(u=>!u.target);
      if(tg&&grp.length>=2){ const go=grp.slice(0,Math.max(2,grp.length-1));
        for(const u of go) u.raid=true; orderMove(go,tg.x,tg.y,'amove');
        if(tg.owner===0) msg(`⚠ Räuber überfallen euren ${tg.def.name}! (${go.length} Mann)`,'#ff8a7a'); }
    }
    // Rückkehr ins Lager
    for(const u of mine) if(u.mode==='idle'&&!u.target&&dist(u.x,u.y,c.x,c.y)>4){
      u.raid=false; const p=nearestPassable(c.x+(Math.random()-.5)*4,c.y+(Math.random()-.5)*4,'inf'); if(p) orderMove([u],p.x+0.5,p.y+0.5); }
  }
  // Räuber ohne Lager streifen umher und lösen sich irgendwann auf
  for(const u of all) if(!camps.some(c=>c.id===u.camp)&&!u.target&&u.mode==='idle'&&Math.random()<0.01){ u.dead=true; }
}
/** nächstgelegenes Räuberlager (für KI und Tipps) */
export function nearestCamp(x,y,maxD=1e9){ let best=null,bd=maxD; for(const b of G.buildings) if(!b.dead&&b.type==='camp'){ const d=dist(x,y,b.x,b.y); if(d<bd){bd=d;best=b;} } return best; }

import { dist } from '../core/util';
import { BANDITS, RES } from '../data/config';
import { distTo } from '../sim/combat';
import { orderMove } from '../sim/orders';
import { G } from '../sim/state';
import { nearestPassable, spawnUnit } from '../sim/world';
import { fxAdd } from '../sim/units';
import { msg } from '../core/events';

/* =====================================================================
   Räuberbanden (Partei 3): feindlich zu allen
   ---------------------------------------------------------------------
   Jedes Lager bewacht sein Gebiet (BANDITS.territory) und greift alles an,
   was dort auftaucht – unbegleitete Arbeiter und Laster sind leichte Beute.
   Ab und zu überfallen sie Gebäude in Reichweite: Späher kündigen das eine
   Minute vorher an, dann plündern sie Vorräte und ziehen wieder ab.
   Ein zerstörtes Lager bringt Beute.
   ===================================================================== */
const rnd = (r: number[]) => r[0]+Math.random()*(r[1]-r[0]);
export function banditThink(){
  const camps=G.buildings.filter(b=>!b.dead&&b.type==='camp');
  const all=G.units.filter(u=>!u.dead&&u.owner===3);
  for(const c of camps){
    const mine=all.filter(u=>u.camp===c.id);
    if(!c.init){ c.init=true; c.raidT=rnd(BANDITS.firstRaid); c.spawnT=BANDITS.spawn;
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
    if(c.raidT<=BANDITS.warn&&!c.warned){ c.warned=true;   // Vorwarnung durch Späher
      const tg=raidTargetOf(c); if(tg&&tg.owner<=1&&mine.length>=2){
        // Stadtwache: untätige Soldaten in der Nähe rücken von selbst aus
        const guard=G.units.filter(u=>!u.dead&&u.owner===tg.owner&&u.def.weapon&&u.def.cls!=='air'&&!u.def.pioneer&&u.mode==='idle'&&!u.order&&!u.escort&&!u.task&&!u.wave&&dist(u.x,u.y,tg.x,tg.y)<BANDITS.guardR);
        if(guard.length) orderMove(guard,tg.x+(c.x-tg.x)*0.15,tg.y+(c.y-tg.y)*0.15,'amove');
        if(tg.owner===0){ G.banditWarn={t:G.t+BANDITS.warn+30, x:tg.x, y:tg.y, name:tg.def.name};
          msg(`👀 Räuber-Späher bei eurem ${tg.def.name} gesichtet – in etwa einer Minute droht ein Überfall! ${guard.length?`Eure Wache (${guard.length} Trupp${guard.length===1?'':'s'}) rückt aus.`:'Keine Soldaten in der Nähe – Kaserne bauen, Schützen hinschicken.'}`,'#ffb38a'); } } }
    if(c.raidT<=0){ c.raidT=rnd(BANDITS.raidEvery); c.warned=false;
      const tg=raidTargetOf(c);
      const grp=mine.filter(u=>!u.target);
      if(tg&&grp.length>=2){ const go=grp.slice(0,Math.max(2,grp.length-1));
        for(const u of go){ u.raid=true; u.looted=false; } orderMove(go,tg.x,tg.y,'amove');
        if(tg.owner===0) msg(`⚠ Räuber überfallen euren ${tg.def.name}! (${go.length} Mann) Sie wollen plündern.`,'#ff8a7a'); }
    }
    for(const u of mine) if(u.raid&&u.looted&&dist(u.x,u.y,c.x,c.y)<5){ u.raid=false; u.looted=false; }   // Beute heimgebracht
    // Plündern: am Ziel Vorräte rauben und abziehen (Gebäude bleiben stehen)
    const raiders=mine.filter(u=>u.raid&&!u.looted);
    if(raiders.length){ let vic=null;
      for(const u of raiders){ for(const b of G.buildings) if(!b.dead&&b.owner<=1&&!b.def.def&&distTo(u,b)<=4.5){ vic=b; break; } if(vic) break; }
      if(vic){ plunder(vic, raiders.length);
        for(const u of raiders){ u.looted=true; u.target=null; const p=nearestPassable(c.x+(Math.random()-.5)*3,c.y+(Math.random()-.5)*3,'inf'); if(p) orderMove([u],p.x+0.5,p.y+0.5); } } }
    // Rückkehr ins Lager
    for(const u of mine) if(u.mode==='idle'&&!u.target&&dist(u.x,u.y,c.x,c.y)>4){
      u.raid=false; const p=nearestPassable(c.x+(Math.random()-.5)*4,c.y+(Math.random()-.5)*4,'inf'); if(p) orderMove([u],p.x+0.5,p.y+0.5); }
  }
  // Räuber ohne Lager streifen umher und lösen sich irgendwann auf
  for(const u of all) if(!camps.some(c=>c.id===u.camp)&&!u.target&&u.mode==='idle'&&Math.random()<0.01){ u.dead=true; }
}
function raidTargetOf(c){ let tg=null, td=1e9;
  for(const b of G.buildings){ if(b.dead||b.owner>1||b.def.def) continue; const d=distTo(c,b); if(d<BANDITS.raidRange&&d<td){ td=d; tg=b; } }
  return tg; }
/** Räuber plündern die Vorräte der Partei, der das Gebäude gehört */
function plunder(b,n){
  const p=G.players[b.owner], P=BANDITS.plunder, k=Math.min(1,n/3), got=[];
  const money=Math.floor(Math.min(P.moneyMax*k,Math.max(0,p.res.money)*P.money)); if(money>0){ p.res.money-=money; got.push('$'+money); }
  for(const r of ['food','wood','stone','metal']){ const a=Math.floor(Math.min(P[r]*k,Math.max(0,p.res[r]))); if(a>0){ p.res[r]-=a; got.push(RES[r].icon+a); } }
  p.lastAttack={x:b.x,y:b.y,t:G.t};
  if(got.length) fxAdd({k:'loot',x:b.x,y:b.y,txt:'−'+got.join(' '),col:'#ff8a6a',life:2.5});
  if(b.owner===0) msg(`💰 Räuber haben euren ${b.def.name} geplündert${got.length?': '+got.join(', '):''} – und ziehen ab. Ihr Lager ausheben beendet die Überfälle.`,'#ff8a7a');
}
/** nächstgelegenes Räuberlager (für KI und Tipps) */
export function nearestCamp(x,y,maxD=1e9){ let best=null,bd=maxD; for(const b of G.buildings) if(!b.dead&&b.type==='camp'){ const d=dist(x,y,b.x,b.y); if(d<bd){bd=d;best=b;} } return best; }

import { COMBAT_AI, MAJORS } from '../data/config';
import { G } from '../sim/state';
import { msg } from '../core/events';
import { dist } from '../core/util';
import { detected, findBuilding, hostile, nearestPassable } from '../sim/world';
import { orderMove } from '../sim/orders';

/* =====================================================================
   Lagebeurteilung im Gefecht: geordneter Rückzug vor der Niederlage
   ---------------------------------------------------------------------
   Jede Sekunde prüft jede kämpfende Gruppe (alle eigenen Bodentruppen im
   Umkreis) das örtliche Kräfteverhältnis: eigene Truppen und Stellungen
   gegen sichtbare Feinde und feindliche Stellungen. Ist der Gegner klar
   überlegen, löst sich die Gruppe geschlossen und zieht sich zur Stadt
   zurück; erholt und nach einer Wartezeit kehrt sie auf ihren Posten
   zurück. Ausnahmen: Haltebefehl (bis zum letzten Mann), Verteidigung
   der eigenen Stadt, Einheiten auf ausdrücklichem Marsch.
   ===================================================================== */
const R=COMBAT_AI.rout, S=COMBAT_AI.service;
const val=u=>(u.def.cost.money||100)*(1+(u.def.cost.metal||0)/100)*(u.hp/u.maxHp)*(u.dug&&!u.dugCover?1.3:1);
const bval=b=>R.fort*(b.hp/b.maxHp);
const fights=u=>!u.dead&&!u.carried&&u.def.weapon&&!u.def.weapon.kamikaze&&u.def.cls!=='air'&&!u.def.worker&&!u.def.pioneer;
/** örtliches Kräfteverhältnis um (x,y) aus Sicht von pid: {own, foe} */
export function localBalance(pid,x,y){
  let own=0, foe=0;
  for(const u of G.units){ if(u.dead||u.carried||!u.def.weapon) continue;
    const d=dist(u.x,u.y,x,y);
    if(u.owner===pid){ if(d<=R.r&&!u.fleeing) own+=val(u); }
    else if(hostile(pid,u.owner)&&d<=R.er&&detected(u,pid)&&!u.def.weapon.airOnly) foe+=val(u)*(u.def.cls==='air'&&!u.def.weapon.kamikaze?1.2:1); }
  for(const b of G.buildings){ if(b.dead||b.site||!b.def.weapon||b.def.weapon.airOnly) continue;
    const d=dist(b.x,b.y,x,y), rg=(b.def.weapon.range||5)+1.5; if(d>rg) continue;
    if(b.owner===pid) own+=bval(b); else if(hostile(pid,b.owner)) foe+=bval(b); }
  return {own, foe};
}
function safeSpot(u){
  let best=null, bd=1e9;
  for(const b of G.buildings){ if(b.dead||b.owner!==u.owner||b.def.def||b.site) continue;
    const pref=b.type==='hq'||b.type==='barracks'||b.type==='factory'||b.type==='workshop'?0:8, dd=dist(u.x,u.y,b.x,b.y)+pref; if(dd<bd){ bd=dd; best=b; } }
  return best;
}
export function updateTactics(dt){
  G.tacT=(G.tacT||0)-dt; if(G.tacT>0) return; G.tacT=1;
  const seen=new Set<number>();
  for(const u of G.units){
    if(seen.has(u.id)||!MAJORS.includes(u.owner)||!fights(u)) continue;
    // zurück auf den Posten: erholt, gewartet, Auftrag wieder aufnehmen
    if(u.fleeing&&u.fleeing.rout){ const f=u.fleeing;
      if(u.mode==='idle'&&G.t-f.t>(f.service?8:R.wait)&&u.hp>=u.maxHp*COMBAT_AI.backHp&&!(f.service&&u.def.pod&&!(u.podAmmo>0))){ u.fleeing=null; u.routCool=G.t+R.cool;
        if(u.owner===0){ orderMove([u],f.x,f.y,'amove'); if(f.order){ u.order=f.order; u.area=f.area; u.msn=f.msn; } } }
      continue; }
    if(u.fleeing||u.order==='hold'||u.mode==='move'||u.mode==='refit') continue;
    // Wartung: Fahrzeuge des Spielers fahren in ruhigen Momenten selbst zur Werkstatt (Reparatur, Raketen nachladen) und kehren zurück
    if(u.owner===0&&u.def.cls==='veh'&&(u.order||u.grp)&&!u.escort&&(u.hp<u.maxHp*S.hp||(u.def.pod&&!(u.podAmmo>0)))&&G.t-(u.lastHit||-99)>S.quiet&&!(u.target&&!u.target.dead)){
      const shop=G.buildings.filter(b=>!b.dead&&!b.site&&b.owner===0&&b.type==='workshop').sort((a,b)=>dist(a.x,a.y,u.x,u.y)-dist(b.x,b.y,u.x,u.y))[0]||safeSpot(u);
      if(shop&&dist(u.x,u.y,shop.x,shop.y)>4){ const pp=nearestPassable(shop.x+(Math.random()-.5)*2,shop.y+shop.h/2+1.3,u.def.cls);
        if(pp){ const keep={x:u.x,y:u.y,t:G.t,rout:true,service:true,order:u.order,area:u.area,msn:u.msn}; orderMove([u],pp.x+0.5,pp.y+0.5); u.fleeing=keep;
          if(G.t-(G.svcMsg||-99)>30){ G.svcMsg=G.t; msg(`🔧 ${u.def.name.replace(/\u00AD/g,'')}${u.name?` „${u.name}“`:''} fährt zur ${shop.type==='workshop'?'Werkstatt':'Stadt'} (${u.hp<u.maxHp*S.hp?'Reparatur':'Raketen nachladen'}) und kehrt danach auf den Posten zurück.`,'#b8c8e0'); }
          continue; } } }
    if(G.t<(u.routCool||0)) continue;
    if(G.t-(u.lastHit||-99)>R.hit&&!(u.target&&!u.target.dead)) continue;          // nur im Gefecht
    const grp=G.units.filter(o=>o.owner===u.owner&&fights(o)&&!o.fleeing&&o.order!=='hold'&&o.mode!=='move'&&dist(o.x,o.y,u.x,u.y)<=R.r);
    for(const o of grp) seen.add(o.id);
    const cx=grp.reduce((s,o)=>s+o.x,0)/grp.length, cy=grp.reduce((s,o)=>s+o.y,0)/grp.length;
    const home=findBuilding(u.owner,'hq'); if(home&&dist(cx,cy,home.x,home.y)<R.homeR) continue;   // die eigene Stadt wird verteidigt
    const B=localBalance(u.owner,cx,cy); if(B.foe<R.minFoe||B.foe<B.own*R.ratio) continue;
    if(!G.units.some(o=>!o.dead&&o.owner===u.owner&&G.t-(o.lastHit||-99)<R.hit&&dist(o.x,o.y,cx,cy)<=R.r+3)&&!(G.fallen||[]).some(f=>f.o===u.owner&&G.t-f.t<R.hit&&dist(f.x,f.y,cx,cy)<=R.r)) continue;   // erst, wenn es ernst wird: Treffer oder Verluste
    let n=0;
    for(const o of grp){ const b=safeSpot(o); if(!b||dist(o.x,o.y,b.x,b.y)<4) continue;
      const keep={x:o.x,y:o.y,t:G.t,rout:true,order:o.order,area:o.area,msn:o.msn};
      for(let k=0;k<3;k++){ const pp=nearestPassable(b.x+(Math.random()-.5)*3,b.y+b.h/2+1.3+Math.random()*1.5,o.def.cls); if(!pp) continue;
        orderMove([o],pp.x+0.5,pp.y+0.5); break; }
      if(o.mode!=='move') continue;
      o.fleeing=keep; o.wave=false; o.target=null; n++; }
    if(n&&u.owner===0&&G.t-(G.routMsg||-99)>12){ G.routMsg=G.t;
      const g=u.grp&&(G.groups||[]).find(x=>x.id===u.grp);
      msg(`🏳 ${g?g.name:`${n} Einheit${n===1?'':'en'}`}: Rückzug vor der Übermacht (Feind etwa ${(B.foe/Math.max(1,B.own)).toFixed(1)}× stärker). Sie sammeln sich in der Stadt und kehren erholt zurück – Verstärkung schicken oder den Auftrag ändern.`,'#ffb38a'); }
  }
}

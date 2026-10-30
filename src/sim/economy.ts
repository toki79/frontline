import { ECON, EXPORT, MAP_H, MAP_W, T } from '../data/config';
import { endGame } from '../sim/combat';
import { G } from '../sim/state';
import { refreshQuality } from '../sim/world';
import { clearForest, roadBonus } from '../sim/build';
import { msg } from '../core/events';

/* =====================================================================
   Volkswirtschaft: Produktion, Verbrauch, Wachstum
   ===================================================================== */
export function rankOf(pop){ let r=0; for(let i=0;i<ECON.ranks.length;i++) if(pop>=ECON.ranks[i][0]) r=i; return r; }
export function nextMilestone(pop){ for(const [n] of ECON.ranks) if(n>pop) return n; return Math.ceil((pop+1)/1000)*1000; }
// Waldfelder für einen Holzfäller, die nächsten zuerst
function forestNear(b){
  const out=[]; for(let y=b.ty-3;y<b.ty+b.h+3;y++)for(let x=b.tx-3;x<b.tx+b.w+3;x++){ if(x<0||y<0||x>=MAP_W||y>=MAP_H) continue; const i=y*MAP_W+x; if(G.terr[i]===T.FOREST&&G.wood[i]>0) out.push(i); }
  return out.sort((a,c)=>dd(b,a)-dd(b,c));
}
const dd=(b,i)=>Math.abs(i%MAP_W+0.5-b.x)+Math.abs(((i/MAP_W)|0)+0.5-b.y);
export function updateEconomy(pid,dt){
  const p=G.players[pid], mul=pid===1?G.diff.incomeMul:1, powOk=p.use<=p.power;
  let foodProd=0, metalProd=0, oilProd=0, woodProd=0, stoneProd=0, mines=0, minesEmpty=0, linked=0, unlinked=0;
  for(const b of G.buildings){ if(b.dead||b.site||b.owner!==pid) continue;
    const rb=roadBonus(b);
    if(b.def.wood||b.def.stone||b.def.metal||b.def.refine){ if(b.connected) linked++; else unlinked++; }
    if(b.def.refine&&b.crude>0){ const a=Math.min(b.crude,b.def.refine*rb*dt*(powOk?1:0.5)); b.crude-=a; p.res.oil+=a*mul; oilProd+=a*mul/dt; }
    if(b.def.wood){   // Holzfäller: fällt den Wald Feld für Feld
      if(!b.forest||!b.forest.length||G.wood[b.forest[0]]<=0) b.forest=forestNear(b);
      if(b.forest.length){ const i=b.forest[0], a=Math.min(G.wood[i],b.def.wood*rb*dt); G.wood[i]-=a; p.res.wood+=a*mul; woodProd+=a*mul/dt; b.empty=false;
        if(G.wood[i]<=0.01) clearForest(i); }
      else if(!b.empty){ b.empty=true; if(pid===0) msg('Ein Holzfäller hat keinen Wald mehr – baue einen neuen am Waldrand.','#ffb38a'); }
    }
    if(b.def.stone){ let got=0;
      for(const i of b.rockTiles){ if(G.rock[i]>0){ const a=Math.min(G.rock[i],b.def.stone*rb*dt*(powOk?1:0.5)); G.rock[i]-=a; got=a; break; } }
      if(got>0){ p.res.stone+=got*mul; stoneProd+=got*mul/dt; } else if(!b.empty){ b.empty=true; if(pid===0) msg('Ein Steinbruch ist erschöpft – baue einen neuen an anderen Felsen.','#ffb38a'); }
    }
    if(b.def.food) foodProd+=b.def.food*(powOk||b.type==='hq'?1:0.7)*(b.type==='farm'?G.profile[pid].fert:1);
    if(b.def.metal){ let got=0;
      for(const i of b.oreTiles){ if(G.ore[i]>0){ const a=Math.min(G.ore[i],b.def.metal*rb*dt*(powOk?1:0.5)); G.ore[i]-=a; got=a; break; } }
      mines++; if(b.empty) minesEmpty++;
      if(got>0){ p.res.metal+=got*mul; metalProd+=got*mul/dt; } else if(!b.empty){ b.empty=true; if(pid===0) msg('Eine Mine ist erschöpft – baue eine neue an anderem Erz.','#ffb38a'); }
    }
  }
  foodProd*=mul;
  let soldiers=0, fuel=0;
  for(const u of G.units){ if(u.dead||u.owner!==pid) continue; soldiers+=u.def.cost.pop||0; if(u.def.upkeep) fuel+=u.def.upkeep; }
  const eat=(p.pop+soldiers)*ECON.foodPerHead;
  p.res.oil-=fuel*dt; p.fuelShort=p.res.oil<=0&&fuel>0; if(p.res.oil<0) p.res.oil=0;
  if(pid===0&&p.fuelShort&&G.t-(p.fuelMsg||-99)>40){p.fuelMsg=G.t;msg('⚠ Treibstoffmangel: Fahrzeuge fahren und schießen nur halb so schnell.','#ff8a7a');}
  p.upkeep={soldiers,fuel};
  p.foodRate=foodProd-eat;
  p.res.food+=p.foodRate*dt;
  p.res.money+=p.pop*ECON.taxPerHead*dt*mul;
  // Handelskontore: verkaufen Überschüsse über der Reserve
  let cap=0, exp=0, expBy={}; for(const b of G.buildings) if(!b.dead&&!b.site&&b.owner===pid&&b.def.export) cap+=b.def.export*(powOk?1:0.5);
  if(cap>0) for(const r of EXPORT.order){ const over=p.res[r]-EXPORT.reserve[r]; if(over<=0) continue; const a=Math.min(over,cap*dt); if(a<=0) continue;
    p.res[r]-=a; const m=a*EXPORT.price[r]*mul; p.res.money+=m; exp+=m; expBy[r]=(expBy[r]||0)+a/dt; cap-=a/dt; if(cap<=0) break; }
  p.rate={money:p.pop*ECON.taxPerHead*mul, export:exp/dt, expBy, food:p.foodRate, foodProd, eat, metal:metalProd, oil:oilProd, wood:woodProd, stone:stoneProd, mines, minesEmpty, linked, unlinked};
  p.growth=0; p.growBlock=null;
  // Neue Bewohner ziehen zuerst in die ruhigsten Häuser; die Qualität des nächsten freien Hauses bestimmt das Tempo
  if(G.qDirty) refreshQuality();
  const homes=G.buildings.filter(b=>!b.dead&&!b.site&&b.owner===pid&&b.def.cap).sort((a,b)=>b.quality-a.quality);
  let rem=p.pop, qm=0; for(const h of homes){ h.resid=Math.min(h.def.cap,Math.max(0,rem)); rem-=h.resid; if(!qm&&h.resid<h.def.cap-0.01) qm=h.quality; }
  p.growQ=qm||1;
  if(p.res.food<=0){ p.growBlock='hunger';
    p.res.food=0;
    p.pop=Math.max(ECON.minPop,p.pop-Math.max(0.4,p.pop*0.01)*dt);
    if(pid===0&&G.t-p.starveMsg>25){p.starveMsg=G.t;msg('⚠ Hungersnot! Die Bevölkerung schrumpft – baue Bauernhöfe oder kaufe Nahrung.','#ff8a7a');}
  } else if(p.pop>p.cap){
    p.pop=Math.max(p.cap,p.pop-1*dt); p.growth=-1; p.growBlock='wohnraum';
  } else if(p.pop<p.cap){
    let g=ECON.growBase+p.pop*ECON.growRate;
    g*=p.growQ; if(p.growQ<0.95) p.growBlock='laerm';
    if(p.foodRate<0){ g*=0.35; p.growBlock='nahrung'; }
    if(!powOk){ g*=0.5; p.growBlock=p.growBlock||'strom'; }
    p.growth=g;
    p.pop=Math.min(p.cap,p.pop+g*dt);
  } else if((p.growBlock='wohnraum')&&pid===0&&G.t-p.capMsg>90){p.capMsg=G.t;msg('Kein Wohnraum mehr – baue Wohnhäuser, damit die Stadt wächst.','#d2bd62');}
  // Stadtstufen (Meilensteine) – das Spiel läuft weiter
  const rk=rankOf(p.pop); if(p.rank===undefined) p.rank=rk;
  if(rk>p.rank){ p.rank=rk; const nm=ECON.ranks[rk][1];
    if(pid===0) msg(`🎉 Aldoria ist jetzt eine ${nm}! (${ECON.ranks[rk][0]} Einwohner)`,'#9fd88a'); else msg(`Kastrova ist jetzt eine ${nm}.`,'#d6b45a'); }
  else if(rk<p.rank&&p.pop<ECON.ranks[p.rank][0]*0.9) p.rank=rk;
  if(G.mode==='race'&&p.pop>=ECON.target&&!G.over) endGame(pid===0, pid===0?`Aldoria hat ${ECON.target} Einwohner erreicht – die Republik blüht.`:`Kastrova hat zuerst ${ECON.target} Einwohner erreicht.`);
}

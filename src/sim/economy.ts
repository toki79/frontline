import { evActive, evMood, evMul } from '../sim/happen';
import { FAMINE, RTREE, isAI, DEPOSIT, capOf, foodMulOf, lvlMul, lvlOf, BIOFUEL, ECON, EMERGENCY, EXPORT, MAP_H, MAP_W, MOOD, NUKE, RESEARCH_SPEED, STORAGE, T, hasTech } from '../data/config';
import { inFallout } from '../sim/nuke';
import { dist } from '../core/util';
import { endGame } from '../sim/combat';
import { G } from '../sim/state';
import { addAtt, anyWar, depositTiles, refreshQuality } from '../sim/world';
import { mastery } from '../sim/intel';
import { clearForest, hauls, works } from '../sim/build';
import { msg } from '../core/events';
import { emergency } from '../sim/production';
import { funCoverage } from '../sim/devplan';

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
  const p=G.players[pid], mul=isAI(pid)?G.diff.incomeMul:1, powOk=p.use<=p.power, bf=p.broke?ECON.brokeFactor:1;
  let foodProd=0, metalProd=0, oilProd=0, woodProd=0, stoneProd=0, mines=0, minesEmpty=0, linked=0, unlinked=0;
  let upkeep=0, noAccess=0;
  for(const b of G.buildings){ if(b.dead||b.site||b.owner!==pid) continue;
    upkeep+=(ECON.upkeep[b.type]||0)*(1+0.5*(lvlOf(b)-1));   // ausgebaute Gebäude kosten mehr Unterhalt
    const rb=bf*(b.eff??1)*(hasTech(p,'ai')?1+RESEARCH_SPEED.ai:1)*lvlMul(b);   // Transportweg zur Sammelstelle, KI-Optimierung
    if(hauls(b)&&(b.eff??1)<0.7) noAccess++;   // Betriebe mit weitem Transportweg
    if(b.def.refine&&b.crude>0){ const a=Math.min(b.crude,b.def.refine*lvlMul(b)*bf*dt*(powOk?1:0.5)); b.crude-=a; p.res.oil+=a*mul; oilProd+=a*mul/dt; }
    else if(b.def.refine&&hasTech(p,'biofuel')&&p.res.food>BIOFUEL.reserve){   // Biokraftstoff aus Nahrung
      const o=Math.min(BIOFUEL.rate*lvlMul(b)*bf*dt*(powOk?1:0.5),(p.res.food-BIOFUEL.reserve)/BIOFUEL.ratio); p.res.food-=o*BIOFUEL.ratio; p.res.oil+=o*mul; oilProd+=o*mul/dt; b.bio=true; }
    else if(b.def.refine) b.bio=false;
    if(b.def.oilOut){ const o=b.def.oilOut*rb*(powOk?1:0.3)*dt*mul; p.res.oil+=o; oilProd+=o/dt; }   // Bohrturm
    if(b.def.wood){   // Holzfäller: fällt den Wald Feld für Feld
      if(!b.forest||!b.forest.length||G.wood[b.forest[0]]<=0) b.forest=forestNear(b);
      if(b.forest.length){ const i=b.forest[0], a=Math.min(G.wood[i],b.def.wood*rb*dt); G.wood[i]-=a; p.res.wood+=a*mul; woodProd+=a*mul/dt; b.empty=false;
        if(G.wood[i]<=0.01) clearForest(i); }
      else if(!b.empty){ b.empty=true; if(pid===0) msg('Ein Holzfäller hat keinen Wald mehr – baue einen neuen am Waldrand.','#ffb38a'); }
    }
    if(b.def.stone){ let got=0;
      if(!b.rockTiles.some(i=>G.rock[i]>0)&&G.t>=(b.scanT||0)){ b.scanT=G.t+DEPOSIT.rescan; b.rockTiles=depositTiles(b,G.rock); }   // nächste Felsen im Vorkommen
      for(const i of b.rockTiles){ if(G.rock[i]>0){ const a=Math.min(G.rock[i],b.def.stone*rb*dt*(powOk?1:0.5)); G.rock[i]-=a; got=a; break; } }
      if(got>0){ p.res.stone+=got*mul; stoneProd+=got*mul/dt; b.empty=false; } else if(!b.empty){ b.empty=true; if(pid===0) msg(`Ein Steinbruch ist erschöpft – alle Felsen im Umkreis von ${DEPOSIT.r} Feldern sind abgebaut. Baue einen neuen an anderen Felsen.`,'#ffb38a'); }
    }
    if(b.def.food) foodProd+=b.def.food*(powOk||b.type==='hq'?1:b.type==='greenhouse'?0.3:0.7)*(b.type==='farm'?(b.fieldF??1)*(b.eff??1)*(hasTech(p,'fert')?1.5:1)*evMul('food'):1)*foodMulOf(b)*(b.type==='hq'?(G.t<(p.rationUntil||0)?FAMINE.rationMul:1):inFallout(b));   // Bauern arbeiten auch ohne Lohn weiter
    if(b.def.metal){ let got=0;
      if(!b.oreTiles.some(i=>G.ore[i]>0)&&G.t>=(b.scanT||0)){ b.scanT=G.t+DEPOSIT.rescan; b.oreTiles=depositTiles(b,G.ore); }   // nächstes Erz im Vorkommen
      for(const i of b.oreTiles){ if(G.ore[i]>0){ const a=Math.min(G.ore[i],b.def.metal*rb*dt*(powOk?1:0.5)); G.ore[i]-=a; got=a; break; } }
      mines++; if(b.empty) minesEmpty++;
      if(got>0){ p.res.metal+=got*mul; metalProd+=got*mul/dt; b.empty=false; } else if(!b.empty){ b.empty=true; if(pid===0) msg(`Eine Mine ist erschöpft – das ganze Erz im Umkreis von ${DEPOSIT.r} Feldern ist abgebaut. Baue eine neue an anderem Erz.`,'#ffb38a'); }
    }
  }
  foodProd*=mul;
  let soldiers=0, fuel=0;
  let paid=0, vols=[];
  for(const u of G.units){ if(u.dead||u.owner!==pid) continue; soldiers+=u.def.cost.pop||0; if(!u.def.emergency) paid+=u.def.cost.pop||0; else vols.push(u); if(u.def.upkeep) fuel+=u.def.upkeep; }
  // Bürgerwehr: nach dem Angriff gehen die Freiwilligen wieder nach Hause
  if(vols.length&&!emergency(pid)){ p.calmT=(p.calmT||0)+dt; if(p.calmT>EMERGENCY.disband){ p.calmT=0;
    for(const u of vols){ u.dead=true; p.pop+=u.def.cost.pop; soldiers-=u.def.cost.pop; } G.sel=G.sel.filter(s=>!s.dead);
    if(pid===0) msg(`🏠 Die Lage ist ruhig – ${vols.length} Trupp${vols.length===1?'':'s'} Bürgerwehr ${vols.length===1?'geht':'gehen'} wieder nach Hause.`,'#9fd88a'); } } else p.calmT=0;
  // Unterhalt: Gebäude und Sold – ohne Geld arbeiten Betriebe nur noch halb
  const wages=paid*ECON.wagePerPop, cost=upkeep+wages;
  p.res.money-=cost*dt;
  const wasBroke=p.broke; p.broke=p.res.money<=0; if(p.res.money<0) p.res.money=0;
  if(pid===0&&p.broke&&!wasBroke&&G.t-(p.brokeMsg||-99)>40){ p.brokeMsg=G.t; msg(`⚠ Die Kasse ist leer! Unterhalt und Sold fehlen – Betriebe und Ausbildung laufen langsamer (Höfe arbeiten weiter).${emergency(pid)?' Verteidigung: Bürgerwehr kostet kein Geld.':''}`,'#ff8a7a'); }
  const eat=(p.pop+soldiers)*ECON.foodPerHead;
  p.res.oil-=fuel*dt; p.fuelShort=p.res.oil<=0&&fuel>0; if(p.res.oil<0) p.res.oil=0;
  if(pid===0&&p.fuelShort&&G.t-(p.fuelMsg||-99)>40){p.fuelMsg=G.t;msg('⚠ Treibstoffmangel: Fahrzeuge fahren und schießen nur halb so schnell.','#ff8a7a');}
  p.upkeep={soldiers,fuel};
  p.foodRate=foodProd-eat;
  p.res.food+=p.foodRate*dt;
  famineCare(pid,p);
  // ---- Zufriedenheit: jedes Versäumnis drückt die Stimmung ----
  const why=[], pen=(c,amt,txt)=>{ if(c&&amt>=0.02){ why.push({txt,amt}); return amt; } return 0; };
  let target=1;
  target-=pen(p.res.food<=0,MOOD.hunger,'Hunger');
  target-=pen(p.res.food>0&&p.foodRate<0,MOOD.foodFalling,'Nahrung wird knapp');
  target-=pen(!powOk,MOOD.power,'Stromausfall');
  target-=pen(p.broke,MOOD.broke,'Kasse leer – Löhne bleiben aus');
  target-=pen(p.pop>p.cap+1,MOOD.crowded,'zu wenig Wohnraum');
  target-=pen((p.growQ??1)<0.9,MOOD.housing*(0.9-(p.growQ??1)),'schlechte Wohnlage (Lärm, Enge)');
  target-=pen(!!p.lastAttack&&G.t-p.lastAttack.t<60,MOOD.attacked,'Angriffe auf die Stadt');
  { const core=G.buildings.filter(b=>!b.dead&&b.owner===pid&&(b.type==='hq'||b.def.cap));
    target-=pen(G.buildings.some(c=>!c.dead&&c.type==='camp'&&core.some(h=>dist(c.x,c.y,h.x,h.y)<MOOD.banditR)),MOOD.bandits,'Räuber in Stadtnähe'); }
  target-=pen(anyWar(pid),MOOD.war,'Krieg');
  { const em=evMood(); if(em<0) target-=pen(true,-em,'Ereignis: '+evActive().filter(e=>e.mood<0).map(e=>e.name).join(', ')); else target+=em; }
  { const fc=(G.funCov&&G.funCov[pid])??1; target-=pen(fc<1,MOOD.fun*(1-fc),'zu wenig Unterhaltung (Park, Theater, Schwimmbad …)'); }
  target-=pen(G.t-(p.lastFire??-999)<60,MOOD.fires,'Brände in der Stadt');
  target-=pen(G.t<(p.shockUntil||0),NUKE.shockMood,'Entsetzen über den eigenen Atomschlag');
  target-=pen(G.t<(p.bombedUntil||0),NUKE.victimMood,'Atomschlag auf unser Land');
  target-=pen(G.buildings.some(b=>!b.dead&&b.owner===pid&&b.def.cap&&inFallout(b)<1),NUKE.radiationMood,'Strahlung in Wohngebieten');
  if(hasTech(p,'philosophy')) target+=RTREE.philosophy.mood;   // aufgeklärte Bürger
  p.moodWhy=why; p.moodTarget=Math.max(0,target);
  if(p.happy===undefined) p.happy=MOOD.start;
  p.happy+=(p.moodTarget-p.happy)*Math.min(1,MOOD.speed*dt);
  const taxF=Math.min(1.1,MOOD.taxBase+MOOD.taxPer*p.happy);
  const tax=p.pop*ECON.taxPerHead*taxF*mul*(mastery(p,'wirt')?RTREE.mastery.wirt.tax:1), adminShare=ECON.adminMax*p.pop/(p.pop+ECON.adminHalf)*(hasTech(p,'computing')?ECON.adminIT:1), admin=tax*adminShare;
  p.res.money+=(tax-admin)*dt;
  if(p.debt) repayDebt(pid,p,Math.max(0,tax-admin)*dt);
  // Handelskontore: verkaufen Überschüsse über der Reserve
  let cap=0, exp=0, expBy={}; for(const b of G.buildings) if(b.owner===pid&&b.def.export&&works(b)) cap+=b.def.export*lvlMul(b)*(powOk?1:0.5);
  if(cap>0) for(const r of EXPORT.order){ const over=p.res[r]-EXPORT.reserve[r]; if(over<=0) continue; const a=Math.min(over,cap*dt); if(a<=0) continue;
    p.res[r]-=a; const m=a*EXPORT.price[r]*mul; p.res.money+=m; exp+=m; expBy[r]=(expBy[r]||0)+a/dt; cap-=a/dt; if(cap<=0) break; }
  p.rate={money:tax, taxF, adminShare, export:exp/dt, expBy, food:p.foodRate, foodProd, eat, metal:metalProd, oil:oilProd, wood:woodProd, stone:stoneProd, mines, minesEmpty, linked, noAccess, upkeep, wages, admin};
  // Lager: was keinen Platz hat, verdirbt bzw. geht verloren
  p.full=p.full||{};
  for(const r of STORAGE.res){ const over=p.res[r]-p.store; p.full[r]=over>=-1;
    if(over>0){ p.res[r]=p.store; p.lost=(p.lost||0)+over; if(pid===0&&G.t-(p.fullMsg||-99)>60&&over>0.5){ p.fullMsg=G.t; msg(`Lager voll (${Math.round(p.store)}) – Überschuss geht verloren. Baue ein Lagerhaus oder verkaufe über das Handelskontor.`,'#d2bd62'); } } }
  p.growth=0; p.growBlock=null;
  // Neue Bewohner ziehen zuerst in die ruhigsten Häuser; die Qualität des nächsten freien Hauses bestimmt das Tempo
  if(G.qDirty) refreshQuality();
  const homes=G.buildings.filter(b=>b.owner===pid&&b.def.cap&&works(b)).sort((a,b)=>b.quality-a.quality);
  let rem=p.pop, qm=0; for(const h of homes){ const cp=capOf(h); h.resid=Math.min(cp,Math.max(0,rem)); rem-=h.resid; if(!qm&&h.resid<cp-0.01) qm=h.quality; }
  p.growQ=qm||1;
  if(p.res.food<=0){ p.growBlock='hunger';
    p.res.food=0;
    p.pop=Math.max(ECON.minPop,p.pop-Math.max(0.4,p.pop*0.01)*dt);
    if(pid===0&&G.t-p.starveMsg>25){p.starveMsg=G.t;msg(`⚠ Hungersnot! Die Bevölkerung schrumpft – baue Bauernhöfe (im Notstand ${(p.freeFarms||0)<FAMINE.freeFarms?'ohne Geld, nur Holz':'wieder zum vollen Preis'}) oder kaufe Nahrung.`,'#ff8a7a');}
  } else if(p.pop>p.cap){
    p.pop=Math.max(p.cap,p.pop-1*dt); p.growth=-1; p.growBlock='wohnraum';
  } else if(p.pop<p.cap){
    let g=(ECON.growBase+p.pop*ECON.growRate)*Math.min(1.2,p.happy*1.25);   // zufriedene Städte wachsen schneller
    g*=p.growQ; if(p.growQ<0.95) p.growBlock='laerm';
    if(p.foodRate<0){ g*=0.35; p.growBlock='nahrung'; }
    if(!powOk){ g*=0.5; p.growBlock=p.growBlock||'strom'; }
    p.growth=g;
    p.pop=Math.min(p.cap,p.pop+g*dt);
  } else if((p.growBlock='wohnraum')&&pid===0&&G.t-p.capMsg>90){p.capMsg=G.t;msg('Kein Wohnraum mehr – baue Wohnhäuser, damit die Stadt wächst.','#d2bd62');}
  // Abwanderung bei großer Unzufriedenheit
  if(p.happy<MOOD.emigrate&&p.pop>ECON.minPop){ const lost=p.pop*MOOD.emigrateRate*(1-p.happy/MOOD.emigrate)*dt; p.pop=Math.max(ECON.minPop,p.pop-lost); p.growth-=lost/dt; p.growBlock='unzufrieden';
    if(pid===0&&G.t-(p.emiMsg||-99)>45){ p.emiMsg=G.t; msg(`😠 Die Einwohner sind unzufrieden (${Math.round(p.happy*100)} %) und wandern ab! Grund: ${(p.moodWhy||[]).sort((a,b)=>b.amt-a.amt).map(w=>w.txt).slice(0,2).join(', ')}.`,'#ff8a7a'); } }
  // Stadtstufen (Meilensteine) – das Spiel läuft weiter
  const rk=rankOf(p.pop); if(p.rank===undefined) p.rank=rk;
  if(rk>p.rank){ p.rank=rk; const nm=ECON.ranks[rk][1];
    if(pid===0) msg(`🎉 Aldoria ist jetzt eine ${nm}! (${ECON.ranks[rk][0]} Einwohner)`,'#9fd88a'); else msg(`Kastrova ist jetzt eine ${nm}.`,'#d6b45a'); }
  else if(rk<p.rank&&p.pop<ECON.ranks[p.rank][0]*0.9) p.rank=rk;
  if(G.mode==='race'&&p.pop>=ECON.target&&!G.over) endGame(pid===0, pid===0?`Aldoria hat ${ECON.target} Einwohner erreicht – die Republik blüht.`:`Kastrova hat zuerst ${ECON.target} Einwohner erreicht.`);
}

/** Hungersnot: Notstand merken, Notrationen aus dem Rathaus, Frühwarnung für den Spieler */
function famineCare(pid,p){
  if(p.res.food<=0){
    if(G.t-(p.famineT??-1e9)>=FAMINE.window) p.freeFarms=0;   // neue Hungersnot: wieder kostenlose Not-Höfe
    p.famineT=G.t;
    if(G.t>=(p.rationCool||0)){ p.rationUntil=G.t+FAMINE.rationT; p.rationCool=G.t+FAMINE.rationT+FAMINE.rationCool;
      if(pid===0) msg(`🥖 Notrationen: Das Rathaus öffnet seine Vorräte (${FAMINE.rationMul}× Nahrung für ${Math.round(FAMINE.rationT/60*2)/2} min). Im Notstand kosten Bauernhöfe kein Geld, nur Holz.`,'#e8c46a'); }
  } else if(pid===0&&p.foodRate<0){
    const left=p.res.food/-p.foodRate;
    if(left<FAMINE.warn&&G.t-(p.foodWarnT??-1e9)>FAMINE.warnEvery){ p.foodWarnT=G.t;
      msg(`⚠ Nahrung reicht noch etwa ${left<90?Math.round(left)+' s':Math.round(left/60*2)/2+' min'} – baue jetzt einen Bauernhof (am besten auf grüner Wiese).`,'#ffb38a'); }
  }
}
/** Kredit für eine Hilfslieferung: ein Teil der Steuern geht an den Gläubiger, bis alles bezahlt ist */
function repayDebt(pid,p,income){
  const d=p.debt, a=Math.min(d.left,income*FAMINE.debtShare);
  p.res.money-=a; d.left-=a; if(G.players[d.to]) G.players[d.to].res.money+=a;
  if(d.left<=0.5){ p.debt=null; if(pid===0) msg(`Kredit an ${G.players[d.to].short} ist abbezahlt.`,'#9fd88a'); return; }
  if(G.t>d.until){ p.debt=null; addAtt(d.to,pid,-FAMINE.debtAnger);
    if(pid===0) msg(`${G.players[d.to].short} ist verärgert: Der Kredit wurde nicht rechtzeitig bezahlt (${Math.round(d.left)} $ offen).`,'#ff8a7a'); }
}

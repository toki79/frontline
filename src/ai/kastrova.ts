import { dist, idx, inMap } from '../core/util';
import { EXPORT, AI_WAR, AIS, AI_CHAR, MAJORS, T, FIRE, FUN, TRIBUTE, AI_MIX2, AI_MIX, AI_NUKE, AI_RESEARCH, NUKE, RESEARCH, hasTech, BANDITS, BUILDINGS, DEF, ECON, MAP_H, MAP_W, NOISE_R, REGION, RES, STORAGE, UNITS, canHit } from '../data/config';
import { distTo } from '../sim/combat';
import { canAfford, costOf, lacking } from '../sim/costs';
import { aiQuotes, marketOpen, trade } from '../sim/market';
import { showOffer } from '../sim/offers';
import { orderMove, upgradeCage } from '../sim/orders';
import { available, canPlace, canPlaceDef, enqueue, placeDefense, placeSite } from '../sim/production';
import { demolish, hauls, orderRoadTo, previewFields, siteLacks, startUpgrade, upgradeBlock } from '../sim/build';
import { G } from '../sim/state';
import { aiKnowsThreat, intelEvent, intelLevel } from '../sim/intel';
import { devOf } from '../sim/devplan';
import { focusArmy, focusDefense, llmActive } from './strategist';
import { exclBlock } from '../sim/production';
import { addAtt, anyWar, armyStr, atWar, attOf, countBuildings, defStr, detected, findBuilding, hostile, spotted, housingQuality, nameFor0, nearestPassable, rectDist, ringTiles, setWar, updateRel } from '../sim/world';
import { msg } from '../core/events';
import { bound, jointAgainst } from '../sim/pacts';
import { aiChar, hasTrait } from '../ai/persona';
import { deterrent, launchNuke } from '../sim/nuke';
import { funCoverage } from '../sim/devplan';
import { makeGroup } from '../sim/groups';
import { droppable, orderDrop } from '../sim/airdrop';
import { unprotected } from '../sim/fortify';
import { fireCoverage } from '../sim/city';

/* =====================================================================
   KI-Mächte (Kastrova, Veloria) – handeln nach Bedarf, Stärkeverhältnis und Vorsprung
   ---------------------------------------------------------------------
   Jede KI wählt einen Rivalen (ai.foe): im Krieg den Kriegsgegner, sonst die
   Macht, die ihr am gefährlichsten erscheint (Vorsprung, schlechte Haltung).
   mode: frieden  -> Aufbau; prüft, ob sich Forderung/Überfall lohnt
         krieg    -> Überfälle auf gezielte Gebäude, später Friedensangebot
   Der Charakter (AI_CHAR) verschiebt Angriffslust, Armeegröße und Handel.
   ===================================================================== */
/** alle KI-Mächte denken in ihrem eigenen Takt */
export function aiThinkAll(dt){
  for(const pid of AIS){ const ai=G.ais&&G.ais[pid]; if(!ai) continue;
    ai.thinkT-=dt; if(ai.thinkT<=0){ ai.thinkT=G.diff.think; aiThink(pid); } }
}
/** feindliche Truppen in Stadtnähe? */
function threat0(pid){ const hq=findBuilding(pid,'hq');
  for(const e of G.units){ if(e.dead||!hostile(pid,e.owner)) continue;
    if(e.owner===3){ if(hq&&dist(e.x,e.y,hq.x,hq.y)<12) return true; continue; }   // Räuber am Stadtrand sind kein Grund, das Sparen aufzugeben
    for(const b of G.buildings) if(!b.dead&&b.owner===pid&&distTo(e,b)<14) return true; } return false; }
const alive=pid=>G.buildings.some(b=>!b.dead&&b.owner===pid&&!b.def.def);
/** Rivalen wählen: Kriegsgegner zuerst, sonst wer am meisten bedroht */
function pickFoe(pid,ai){
  const others=MAJORS.filter(o=>o!==pid&&alive(o)); if(!others.length) return ai.foe;
  const hq=findBuilding(pid,'hq')||{x:MAP_W/2,y:MAP_H/2};
  const wars=others.filter(o=>atWar(pid,o));
  const near=o=>{ const h=findBuilding(o,'hq'); return h?dist(h.x,h.y,hq.x,hq.y):200; };
  if(wars.length){ return wars.sort((a,b)=>armyStr(b)/near(b)-armyStr(a)/near(a))[0]; }
  if(G.t<ai.foeT&&others.includes(ai.foe)) return ai.foe;
  ai.foeT=G.t+60;
  const p=G.players[pid];
  const Cx=aiChar(pid), rushNow=G.t<Cx.driveUntil&&G.t<AI_WAR.minT;   // Ansturm: zuerst gegen Aldoria (KI-Kriege erst später)
  const score=o=>(bound(pid,o)?-6:0)+(rushNow&&o===0?3:0)+(G.known[pid][o]?2:0)+G.players[o].pop/Math.max(30,p.pop)-attOf(pid,o)/40-near(o)/80+(o===ai.foe?0.3:0);
  return others.sort((a,b)=>score(b)-score(a))[0];
}
export function aiThink(pid=1){
  const p=G.players[pid], ai=G.ais[pid], D=G.diff, C=aiChar(pid);
  const myB=G.buildings.filter(b=>!b.dead&&b.owner===pid); if(!myB.length) return;
  const myU=G.units.filter(u=>!u.dead&&u.owner===pid);
  const army=myU.filter(u=>u.def.weapon&&!u.patrol&&u.mode!=='recharge'&&u.mode!=='rtb'&&u.mode!=='rearm'), trucks=myU.filter(u=>u.def.harvester);
  const myStr=armyStr(pid)+defStr(pid)*0.3;
  // Stärkeverhältnis und Vorsprung gegenüber jeder anderen Macht
  const race=G.mode==='race'; ai.rat=ai.rat||{}; ai.leads=ai.leads||{};
  for(const o of MAJORS){ if(o===pid) continue; const P=G.players[o];
    ai.rat[o]=myStr/Math.max(250,armyStr(o)+defStr(o)*0.6);
    ai.leads[o]=!!G.known[pid][o]&&(race?(P.pop>=ECON.target*0.55&&P.pop>p.pop*1.12):(P.pop>=150&&P.pop>p.pop*1.15)); }
  const F=ai.foe=pickFoe(pid,ai), P=G.players[F];
  const theirStr=armyStr(F)+defStr(F)*0.6, ratio=ai.rat[F]??1;
  const war=anyWar(pid), warF=atWar(pid,F);
  const mineOk=G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='mine'&&!b.empty);
  // --- Lage einschätzen ---
  let need=null;
  if(p.res.food<90&&p.foodRate<0.2) need='food';
  else if(p.res.metal<40&&!mineOk&&G.t>150) need='metal';
  else if(p.res.oil<40&&trucks.length===0&&countBuildings(pid,'factory')&&G.t>240) need='oil';
  const lead = !!ai.leads[F];
  const urgent = G.known[pid][F] && (race ? (P.pop>=ECON.target*0.8 && P.pop>p.pop) : (P.pop>=300 && P.pop>p.pop*1.4));
  ai.need=need; ai.lead=lead; ai.ratio=ratio;
  // Anfragen veröffentlichen (Bedarf am Markt für Aldoria bekannt machen)
  const metP=G.known[pid][0]&&G.known[0][pid];
  if(!atWar(pid,0)&&metP){ ai.ann=ai.ann||{}; ai.urg=ai.urg||{}; const qs=aiQuotes(pid);
    for(const r of REGION.res){ const q=qs.find(q=>q.side==='buy'&&q.res===r&&q.urgent); if(!q) ai.urg[r]=0; else if(!ai.urg[r]) ai.urg[r]=G.t; }
    for(const q of qs) if(q.side==='buy'&&q.urgent&&G.t>100&&G.t-ai.urg[q.res]>25&&G.t-(ai.ann[q.res]||-999)>120){ ai.ann[q.res]=G.t;
      msg(`📦 Marktanfrage: ${p.short} kauft ${q.amt} ${RES[q.res].name} ${RES[q.res].icon} für $${q.price}.`,'#d6b45a'); } }
  if(need){ if(!ai.requestSince) ai.requestSince=G.t; } else ai.requestSince=0;
  const patience = need ? G.t-ai.requestSince>60 : true;   // erst nach unbeantworteter Anfrage fordern
  const met=G.known[pid][F]&&G.known[F][pid];   // Forderungen, Krieg und Handel erst nach dem Erstkontakt
  if(F===0&&lead&&!ai.warnLead&&met){ai.warnLead=true;msg(`Geheimdienst: ${p.short} sieht euer Wachstum mit Sorge und rüstet auf.`,'#d6b45a');}

  // --- Sparen: für das nächste Schlüsselgebäude oder die nächste Forschung Geld zurücklegen ---
  const hasB=t=>G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type===t);
  const nextRes=aiNextResearch(p);
  const uniFirst=C.key==='handel'||C.tech>1.3||G.profile[pid].scarce.includes('metal');   // Handelsmacht (oder Metallmangel): erst Universität, dann Fahrzeugwerk
  const wantF=!hasB('factory')&&p.pop>90&&hasB('barracks'), wantU=!hasB('university')&&p.pop>100/Math.min(1.4,C.tech)&&hasB('power')&&(uniFirst||hasB('factory'));
  const resGoal=nextRes&&!p.q.research.length?nextRes:null;
  const goal=uniFirst?(wantU?'university':resGoal&&!hasTech(p,'res2')?resGoal:wantF?'factory':resGoal):(wantF?'factory':wantU?'university':resGoal);
  const saveFor=goal?(costOf(goal,pid).money||0)+(RESEARCH[goal]?100:40):0;
  if(goal!==ai.goal){ ai.goal=goal; ai.goalT=G.t; }
  ai.save=saveFor&&(G.t-ai.goalT)%360<300?saveFor:0;   // 5 min sparen, dann 1 min normal ausgeben, dann wieder sparen
  // Forschungs- und Aufbauetat: ein Teil der Steuern wird fürs Sparziel zurückgelegt (die KI verbraucht sonst alles fürs Wachstum)
  if(goal){ const put=Math.min(Math.max(0,p.res.money),((p.rate&&p.rate.money)||0)*AI_WAR.fund*D.think); p.res.money-=put; ai.fund=(ai.fund||0)+put; }
  if(ai.fund>0){ const c=goal?costOf(goal,pid):{}, need$=(c.money||0)+60;
    if(!goal){ p.res.money+=ai.fund; ai.fund=0; }   // Ziel erledigt: Etat freigeben
    else if(p.res.money+ai.fund>=need$){ p.res.money+=ai.fund; ai.fund=0;
      for(const [r,k] of [['metal','buyMetal'],['stone','buyStone'],['wood','buyWood']]) for(let n=0;n<5&&(c[r]||0)>p.res[r];n++) if(!trade(pid,k)) break;   // fehlendes Material zukaufen
      if(!canAfford(pid,goal)){ const keep=Math.min(Math.max(0,p.res.money),need$); p.res.money-=keep; ai.fund=keep; } } }   // noch nicht bezahlbar: Etat bleibt zurückgelegt
  const calm=!war&&!threat0(pid), saving=ai.save>0&&p.res.money<ai.save&&calm;
  devOf(pid).release.money=saving?0.05:0.3;   // Bürger bauen beim Sparen kaum aus
  ai.saving=saving;
  // --- Gebäude ---
  // Baustellen beauftragen (höchstens zwei gleichzeitig offen)
  // Baustellen, die schon lange auf Material warten, blockieren den Aufbau nicht
  for(const b of G.buildings) if(!b.dead&&b.owner===pid&&b.site){ if(siteLacks(b)) b.waitT=b.waitT??G.t; else b.waitT=undefined; }
  const sites=G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.site&&!(b.waitT!==undefined&&G.t-b.waitT>90)).length;
  ai.noSpot=ai.noSpot||{};
  if(sites<2&&findBuilding(pid,'hq')){
    let next=aiPickBuilding(p,army.length,need,lead);
    const mats=t=>{ const c=BUILDINGS[t].cost; return ['wood','stone','metal'].every(r=>(p.res[r]||0)>=(c[r]||0)); };
    if(goal&&BUILDINGS[goal]&&available(pid,goal)&&canAfford(pid,goal)&&mats(goal)&&!G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type===goal)) next=goal;
    if(next&&BUILDINGS[next]&&(next==='factory'||next==='university')&&!mats(next)) next=null;   // teure Bauten erst mit dem ganzen Material   // Sparziel erreicht: sofort bauen
    if(!findBuilding(pid,'intel')&&p.pop>200&&p.res.money>1800&&!G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='intel')&&!ai.noSpot.intel) next='intel';   // Geheimdienst
    // beim Sparen nur das Nötigste (Wohnraum, Nahrung, Strom, Baustoffe) – oder das Sparziel selbst
    const homeSite=G.buildings.some(b=>!b.dead&&b.owner===pid&&b.site&&(b.type==='house'||b.type==='block'));
    const urgentB=next===goal||(next==='mine'&&!countBuildings(pid,'mine'))||(next==='kontor'&&!countBuildings(pid,'kontor'))||(p.pop>=p.cap-6&&!homeSite&&(next==='house'||next==='block'))||(p.foodRate<0&&(next==='farm'||next==='greenhouse'))||(p.use+12>p.power&&(next==='power'||next==='npp'))||((next==='lumber'||next==='quarry')&&(p.res.wood<70||p.res.stone<70))||next==='depot'&&STORAGE.res.some(r=>p.res[r]>(p.store||STORAGE.base)*0.85);
    // Ausdehnung: fehlt ein Rohstoff in Reichweite, wächst die Stadt mit Lagerhäusern darauf zu
    const exp=G.t>150&&p.res.money>270?expandTarget(pid):null;
    if(exp&&(!saving||p.res.money>320)&&!G.buildings.some(b=>!b.dead&&b.owner===pid&&b.site&&b.type==='depot')&&countBuildings(pid,'depot')<8&&canAfford(pid,'depot')){ ai.expandTo=exp; if(!aiPlace(pid,'depot')) ai.expandTo=null; }
    else if(next&&(!saving||urgentB)&&available(pid,next)&&canAfford(pid,next)){ if(!aiPlace(pid,next)) ai.noSpot[next]=G.t; }
  }
  // Bauarbeiter: mit der Stadt wächst der Trupp
  const workers=myU.filter(u=>u.def.worker).length, wantW=Math.min(10,3+Math.floor(p.pop/80));
  if(workers<wantW&&!p.q.hq.length&&canAfford(pid,'worker')&&p.res.money>200&&(!saving||workers<3)) enqueue(pid,'worker');
  // Straßen zu Betrieben mit weitem Transportweg (wenn Stein da ist)
  ai.roadT=(ai.roadT||0)-D.think;
  if(ai.roadT<=0&&G.t>90){ ai.roadT=20;
    const open=G.road.some((r,i)=>r===1&&G.roadOwner[i]===pid+1);
    if(!open&&p.res.stone>=80) for(const b of myB.filter(b=>!b.site&&hauls(b)&&(b.eff??1)<0.8).sort((a,c)=>a.eff-c.eff)){ if(orderRoadTo(pid,b)>0) break; } }
  if(!saving||G.t>(ai.defT||0)){ ai.defT=G.t+20; aiDefense(pid); }
  // --- Forschung ---
  if(nextRes&&!p.q.research.length&&available(pid,nextRes)&&canAfford(pid,nextRes)&&p.res.money>(costOf(nextRes,pid).money||0)+(RESEARCH[nextRes].level?100:300)/C.tech) enqueue(pid,nextRes);
  // --- Atomrakete ---
  if(findBuilding(pid,'silo')&&!p.q.silo.length&&(p.nukes||0)<AI_NUKE.stock&&canAfford(pid,'nuke')&&p.res.money>UNITS.nuke.cost.money+AI_NUKE.reserve) enqueue(pid,'nuke');
  aiNukeStrike(pid,F,ratio,urgent);
  // --- Gitterkäfige für Fahrzeuge am Werk ---
  if(p.res.metal>150&&p.res.money>600) upgradeCage(pid,army.filter(u=>u.type==='mbt'||u.type==='ifv'||u.type==='mlrs'));
  // --- Tanklaster ---
  for(const t of trucks) if(!t.hs&&t.mode==='idle') t.hs='seek';
  const refs=countBuildings(pid,'refinery'), queuedTruck=p.q.factory.some(i=>i.type==='truck');
  if(refs&&trucks.length<Math.min(refs*2,3)&&!queuedTruck&&available(pid,'truck')&&canAfford(pid,'truck')&&p.res.money>700) enqueue(pid,'truck');
  // --- Handel am Milizmarkt ---
  const rich=2500/C.trade;
  if(marketOpen(pid)&&p.res.money>rich){   // volle Kasse: Baustoffe für Ausbauten zukaufen
    if(p.res.stone<250) trade(pid,'buyStone'); if(p.res.wood<200) trade(pid,'buyWood'); if(p.res.metal<200) trade(pid,'buyMetal'); }
  if(marketOpen(pid)){
    if(p.res.oil>300) trade(pid,'sellOil');
    if(need==='food'&&ratio<1.2&&p.res.money>400) trade(pid,'buyFood');
    // Baustoffe zukaufen, wenn eine Baustelle darauf wartet (bei knappen Rohstoffen schon früher)
    for(const [r,k] of [['wood','buyWood'],['stone','buyStone'],['metal','buyMetal']]){ const waits=G.buildings.some(b=>!b.dead&&b.owner===pid&&b.site&&siteLacks(b)===r);
      if(p.res[r]<80&&(waits||G.profile[pid].scarce.includes(r)&&!saving)&&p.res.money>320) trade(pid,k); }
    if(goal&&BUILDINGS[goal]&&p.res.money>=ai.save){ const c=BUILDINGS[goal].cost; if((c.metal||0)>p.res.metal) trade(pid,'buyMetal'); if((c.stone||0)>p.res.stone) trade(pid,'buyStone'); }   // fehlendes Material fürs Sparziel zukaufen
    if((p.res.metal<60&&!mineOk&&p.res.money>900)||(nextRes&&p.res.metal<DEF(nextRes).cost.metal&&p.res.money>1500)) trade(pid,'buyMetal');
  }
  aiTradeAI(pid);
  // --- Armee: Sollstärke nach Bedrohung, Absicht und Charakter ---
  const campsNear=G.buildings.filter(c=>!c.dead&&c.type==='camp'&&myB.some(b=>dist(c.x,c.y,b.x,b.y)<24)).length;
  let want=Math.round((3+campsNear*2+Math.floor(theirStr/450)+(war?3:0)+(lead?4:0)+(urgent?4:0)+(need&&ratio<1.3?3:0)+Math.min(6,Math.floor(p.res.money/1500)))*C.army*focusArmy(ai));
  const armyPop=army.reduce((s,u)=>s+(u.def.cost.pop||0),0);
  if(armyPop>p.pop*0.3+10) want=Math.min(want,army.length);
  if(army.length<want&&(aiKnowsThreat(pid,F,'heavyarmor')||aiKnowsThreat(pid,F,'heavy'))&&available(pid,'at')&&canAfford(pid,'at')&&!p.q.barracks.length&&Math.random()<0.4) enqueue(pid,'at');   // Geheimdienst: schwere Panzer -> Panzerabwehr
  if(army.length<want&&G.t>40&&p.res.money>2500&&Math.random()<0.35){   // Spätzeit-Waffen: Raketenträger, Schwärme, Jagdbomber
    for(const t of AI_MIX2) if(available(pid,t)&&canAfford(pid,t)&&p.res.money>UNITS[t].cost.money+1200&&!p.q[UNITS[t].prod].length){ enqueue(pid,t); break; } }
  if(army.length<want&&G.t>40&&(!saving||army.length<4)){
    for(let tries=0;tries<AI_MIX.length;tries++){
      const t=AI_MIX[ai.mix%AI_MIX.length];
      if(!available(pid,t)){ai.mix++;continue;}
      if(p.q[UNITS[t].prod].length>=1) break;
      const lack=lacking(pid,t);
      if(!lack.length){ if(p.res.money-UNITS[t].cost.money>(need?0:calm&&army.length>=4?Math.max(250,ai.save):250)||war||urgent){enqueue(pid,t);ai.mix++;} break; }
      if(lack.some(k=>k!=='money')){ai.mix++;continue;}   // fehlt Metall/Öl/Einwohner -> anderen Typ
      break;
    }
  }
  // --- Erkunden: Wer lebt noch im Tal? (Späher bis zum Erstkontakt mit allen) ---
  const unknown=[...MAJORS,2].filter(o=>o!==pid&&!G.known[pid][o]&&G.buildings.some(b=>!b.dead&&b.owner===o));
  if(unknown.length&&G.t>200){
    const sc=myU.find(u=>u.scout&&!u.dead);
    if(!sc){ const c=army.find(u=>u.def.cls==='inf'&&!u.wave&&!u.task); if(c){ c.scout=true; c.task='scout'; } }
    else if(sc.mode==='idle'&&!sc.target){ const o=unknown[0], h=o===2?{x:MAP_W/2,y:MAP_H/2}:(findBuilding(o,'hq')||{x:MAP_W/2,y:MAP_H/2}), spread=o===2?8:24;
      const pp=nearestPassable(h.x+(Math.random()-.5)*spread,h.y+(Math.random()-.5)*spread,'inf'); if(pp) orderMove([sc],pp.x+0.5,pp.y+0.5); }
  } else for(const u of myU) if(u.scout){ u.scout=false; u.task=null; }
  // --- Räuberlager in Stadtnähe ausheben ---
  ai.campT=(ai.campT||0)-D.think;
  if(ai.campT<=0){ ai.campT=30;
    const busy=army.filter(u=>u.task==='camp');
    if(!busy.length&&!(war&&ai.mode==='krieg'&&army.some(u=>u.wave))){
      let camp=null, cd=1e9; for(const c of G.buildings){ if(c.dead||c.type!=='camp') continue; for(const b of myB){ const d=dist(c.x,c.y,b.x,b.y); if(d<24&&d<cd){cd=d;camp=c;} } }
      const free=army.filter(u=>!u.wave&&!u.target&&u.def.cls!=='air').sort((a,b)=>b.hp-a.hp);
      const band=camp?G.units.filter(u=>!u.dead&&u.owner===3&&dist(u.x,u.y,camp.x,camp.y)<10).length:0, n=Math.max(4,Math.ceil(band*1.8));   // nur mit klarer Überzahl angreifen
      if(camp&&free.length>=n){ const grp=free.slice(0,Math.min(Math.max(6,n+2),free.length)); for(const u of grp) u.task='camp'; orderMove(grp,camp.x,camp.y,'amove'); }
    } else for(const u of busy){ if(!G.buildings.some(c=>!c.dead&&c.type==='camp'&&dist(c.x,c.y,u.x,u.y)<14)){ u.task=null; } else if(u.mode==='idle'&&!u.target){ const c=G.buildings.find(c=>!c.dead&&c.type==='camp'&&dist(c.x,c.y,u.x,u.y)<14); if(c) orderMove([u],c.x,c.y,'amove'); } }
  }
  // --- Verteidigung (im Krieg oder wenn die Miliz mit jemand anderem verbündet ist) ---
  const rally=aiRally(pid);
  let threat=null,tb=1e9;
  // Nur Gegner, die man sieht und die die eigenen Truppen auch treffen können – sonst laufen Schützen unter eine Drohne und werden abgeschossen
  const canFight=e=>army.some(u=>u.def.weapon&&canHit(u.def.weapon,e)), airNear=[];
  if(war||(G.militiaAlly>=0&&G.militiaAlly!==pid)) for(const e of G.units){ if(e.dead||!hostile(pid,e.owner)||e.owner===3) continue;
    let d0=1e9; for(const b of myB){const d=distTo(e,b); if(d<d0) d0=d;} if(d0>=13) continue;
    const seen=detected(e,pid)&&spotted(pid,e.x,e.y);
    if(e.def.cls==='air'&&(seen||e.def.weapon)){ airNear.push(e); ai.airSeenT=G.t; if(e.def.armor==='airHigh') ai.highSeenT=G.t; }
    if(!seen||!canFight(e)) continue;
    if(d0<tb){tb=d0;threat=e;} }
  // Bewaffnete Hochflieger (Reaper), gegen die niemand etwas ausrichten kann: Abstand halten statt sich zu sammeln
  for(const e of airNear){ if(!e.def.weapon) continue; const R=(e.def.weapon.range||6)+2;
    for(const u of army){ if(u.def.cls==='air'||(u.def.weapon&&canHit(u.def.weapon,e))||G.t<(u.evadeT||0)) continue;
      const d=dist(u.x,u.y,e.x,e.y); if(d>R) continue;
      const aa=myB.filter(b=>b.def.weapon&&b.def.weapon.airOnly&&!b.site).sort((a,b)=>dist(a.x,a.y,u.x,u.y)-dist(b.x,b.y,u.x,u.y))[0];
      const k=(R+3-d)/Math.max(0.5,d), tx=aa?aa.x:u.x+(u.x-e.x)*k, ty=aa?aa.y:u.y+(u.y-e.y)*k;   // unter den Schirm der Flugabwehr oder weg von der Drohne
      const pp=nearestPassable(tx,ty,u.def.cls); if(pp){ u.evadeT=G.t+6; u.target=null; orderMove([u],pp.x+0.5,pp.y+0.5); } } }
  // Gegenmittel: Flakpanzer bauen, wenn feindliche Drohnen über der Stadt kreisen
  if(airNear.length&&!army.some(u=>u.type==='spaag')&&available(pid,'spaag')&&canAfford(pid,'spaag')&&!p.q.factory.length) enqueue(pid,'spaag');
  if(threat&&army.length<5&&available(pid,'volunteer')&&!p.q.hq.some(i=>i.type==='volunteer')&&canAfford(pid,'volunteer')) enqueue(pid,'volunteer');   // Bürgerwehr in der Not
  if(threat){
    for(const u of army.filter(u=>!u.wave||dist(u.x,u.y,threat.x,threat.y)<15))
      if(!u.target&&(u.mode!=='amove'||!u.goal||dist(u.goal.x,u.goal.y,threat.x,threat.y)>6)) orderMove([u],threat.x,threat.y,'amove');
  }
  // --- Absicht ---
  if(!warF){
    ai.mode='frieden'; if(ai.warSince) delete ai.warSince[F];
    let aggr=((need&&patience?1:0)+(lead?0.9+C.leadDrive:0)+(G.t<C.driveUntil&&(F===0||G.t>AI_WAR.minT)?C.drive:0)+(urgent?1:0)+(ratio>2.5?0.5:0)+(deterrent(pid)&&!deterrent(F)?AI_NUKE.blackmail:0)+(G.t-((ai.humBy||{})[F]??-1e9)<TRIBUTE.revenge?0.4:0))*D.aggr*C.aggr - Math.max(0,attOf(pid,F))/60 - (G.t-((ai.tradedBy||{})[F]??-999)<90?0.4:0);
    if(war||bound(pid,F)) aggr=0;   // kein Zweifrontenkrieg, Abmachungen werden gehalten
    const deterred=deterrent(F);   // Atomrakete des Rivalen: keine Forderungen, kein Krieg
    if(deterred){ aggr*=AI_NUKE.deterAggr; if(F===0&&!ai.deterMsg&&met){ ai.deterMsg=true; msg(`☢ Geheimdienst: ${p.short} fürchtet eure Atomrakete. Forderungen und Kriegsdrohungen bleiben aus.`,'#9fd88a'); } } else ai.deterMsg=false;
    const busyOffer=F===0&&G.offer;
    const need0=F!==0?AI_WAR.aggr:1;
    if(met&&aggr>=need0*0.75&&G.t>(ai.planT||0)&&!deterred&&!war){ ai.planT=G.t+(F===0?150:400); const tg=raidTarget(pid,F,findBuilding(pid,'hq')||rally,need,lead,0);
      intelEvent(pid,'plan','war',{on:F, target:tg?tg.def.name.replace(/\u00AD/g,''):null, army:armyText(army), counter:'Verteidigung an den Zugängen verstärken, Reserve bereithalten'}); }   // Kriegspläne sickern durch
    const aiFoe=F!==0, gate=aiFoe?AI_WAR.minT:D.grace*C.grace;   // KI gegen KI: später und nur bei klarem Anlass (need0)
    const LLM=llmActive(ai);   // ein LLM-Stratege entscheidet über Krieg, Forderungen und Frieden selbst
    if(!LLM && met && !deterred && G.t>gate && aggr>=need0 && G.t>ai.cool && !busyOffer && ((army.length>=4&&ratio>=1.15)||(urgent&&army.length>=6&&ratio>=0.7))){
      if(need&&!urgent&&P.res[need]>=150&&Math.random()<0.7){
        const amt=need==='food'?150:need==='metal'?100:120;
        ai.cool=G.t+150; aiDemand(pid,F,need,amt);
      } else { ai.cool=G.t+60; setWar(pid,F,true,pid); ai.nextRaid=0; }
    }
    // Schutzgeld: Stärke ausnutzen, wenn der Rivale reich und schwach ist
    else if(!LLM&&!deterred&&met&&!war&&!bound(pid,F)&&G.t>D.grace*C.grace&&!need&&ratio>2.2*(2-D.aggr)/C.aggr&&P.res.money>1200&&army.length>=5&&G.t>ai.cool&&!busyOffer&&attOf(pid,F)<40){
      ai.cool=G.t+220; aiDemand(pid,F,'money',Math.min(600,Math.floor(P.res.money*0.3/50)*50));
    }
    if(!threat) for(const u of army) if(u.mode==='idle'&&!u.target&&!u.task&&dist(u.x,u.y,rally.x,rally.y)>5) orderMove([u],rally.x+(Math.random()-.5)*4,rally.y+(Math.random()-.5)*4);
  } else {
    ai.mode='krieg';
    const raiders=army.filter(u=>u.wave);
    if(raiders.length){
      if(raiders.length<2){ for(const u of raiders){u.wave=false;orderMove([u],rally.x,rally.y);} ai.raidTarget=null; }
      else for(const u of raiders) if(u.mode==='idle'&&!u.target){
        const tg=raidTarget(pid,u.waveFoe??F,u,need,lead,12);
        if(tg) orderMove([u],tg.x,tg.y,'amove'); else { u.wave=false; orderMove([u],rally.x,rally.y); }
      }
    } else if(G.t>(ai.dropT||0)&&droppable(myU).length>=3){   // Luftlandung hinter den Linien: bevorzugt ungeschützte wichtige Gebäude
      ai.dropT=G.t+120; const tg=unprotected(F)[0]||raidTarget(pid,F,findBuilding(pid,'hq')||rally,need,lead,0); if(tg) orderDrop(pid,droppable(myU),tg.x,tg.y);
    } else if(G.t>ai.nextRaid&&army.length>=4&&(ratio>=1.0||(urgent&&ratio>=0.6))){
      launchRaid(pid,F,army,need,lead,rally);
    } else if(!threat) for(const u of army) if(u.mode==='idle'&&!u.target&&dist(u.x,u.y,rally.x,rally.y)>5) orderMove([u],rally.x,rally.y);
    // Frieden anbieten, wenn das Ziel erreicht oder der Krieg aussichtslos ist (Handelsmächte früher)
    (ai.warSince=ai.warSince||{}); if(ai.warSince[F]===undefined) ai.warSince[F]=G.t;
    const tired=G.t-ai.lastCombat>40-C.peace*20&&G.t-ai.warSince[F]>AI_WAR.minDur;
    const sworn=jointAgainst(pid,F)&&ratio>=(hasTrait(pid,'treu')?0.25:0.5);   // Bündnis mit Aldoria: kein Separatfrieden, solange es nicht verzweifelt steht
    if(!sworn&&!llmActive(ai)&&!raiders.length&&!urgent&&tired&&G.t>ai.peaceCool&&!(F===0&&G.offer)&&((!need&&ai.lootSince>150*(1-C.peace*0.6))||ratio<0.7+C.peace*0.4||(deterrent(F)&&!deterrent(pid)))){
      ai.peaceCool=G.t+120; aiOfferPeace(pid,F);
    }
  }
  // --- Miliz umwerben ---
  ai.giftT-=D.think;
  if(ai.giftT<=0){ ai.giftT=30/C.gifts;
    if(G.known[pid][2]&&!G.militiaWar[pid]&&G.militiaAlly!==pid&&findBuilding(2,'bunker')&&p.res.money>=1500+(ai.save||0)&&G.t>90){
      p.res.money-=300; G.attitude[pid]=Math.min(100,G.attitude[pid]+12);
      if(G.attitude[pid]>=30&&G.known[0][pid]&&!(G.aiHint||{})[pid]){G.aiHint=G.aiHint||{}; G.aiHint[pid]=true;msg(`Geheimdienst: ${p.short} umwirbt die Grenzmiliz mit Geschenken.`,'#d6b45a');}
      if(G.attitude[pid]>=60&&(G.militiaAlly===-1||G.attitude[pid]>=G.attitude[G.militiaAlly]+25)){ G.militiaAlly=pid; updateRel(); msg(G.known[0][pid]?`Die Grenzmiliz hat ein Bündnis mit ${p.short} geschlossen!`:'Die Grenzmiliz hat ein Bündnis mit einer fremden Macht geschlossen!','#ff8a7a'); }
    }
  }
}
/** Forderung an eine andere Macht: an Aldoria als Dialog, unter KI-Mächten sofort entschieden */
export function aiDemand(pid,to,res,amt){
  if(to===0){ showOffer({type:'demand',from:pid,res,amt}); return; }
  const T=G.players[to], B=G.ais[to], r=B?.rat?.[pid]??1;
  if(T.res[res]>=amt&&(r<0.9||aiChar(to).peace>0.5&&r<1.3)){ T.res[res]-=amt; G.players[pid].res[res]+=amt; addAtt(to,pid,-15);
    if(G.known[0][pid]||G.known[0][to]) msg(`📰 ${nameFor0(to)} beugt sich ${nameFor0(pid)} und liefert ${amt} ${res==='money'?'$':RES[res].icon}.`,'#d6b45a'); }
  else { addAtt(to,pid,-15); setWar(pid,to,true,pid); G.ais[pid].nextRaid=0; }
}
/** Friedensangebot: an Aldoria als Dialog, unter KI-Mächten nach Lage */
export function aiOfferPeace(pid,to){
  if(to===0){ showOffer({type:'peace',from:pid}); return; }
  const B=G.ais[to]; if(!B) return;
  if(jointAgainst(to,pid)&&(B.rat?.[pid]??1)>=(hasTrait(to,'treu')?0.25:0.5)) return;   // an Aldoria gebunden
  if((B.rat?.[pid]??1)<1.3||aiChar(to).peace>0.5||G.t-B.lastCombat>60) setWar(pid,to,false,pid);
}
/** Handel unter den KI-Mächten: Überschuss gegen Engpass, verbessert die Beziehung */
function aiTradeAI(pid){
  const ai=G.ais[pid]; ai.aiTradeT=(ai.aiTradeT||0)-G.diff.think; if(ai.aiTradeT>0) return; ai.aiTradeT=45/aiChar(pid).trade;
  for(const o of AIS){ if(o===pid||atWar(pid,o)||!G.known[pid][o]||!G.known[o][pid]||!alive(o)||G.ais[o].saving) continue;
    const q=aiQuotes(o).find(q=>q.side==='buy'&&G.players[pid].res[q.res]>=q.amt*2&&!G.profile[pid].scarce.includes(q.res));
    if(q&&G.players[o].res.money>=q.price){ const A=G.players[pid], B=G.players[o]; A.res[q.res]-=q.amt; B.res[q.res]+=q.amt; B.res.money-=q.price; A.res.money+=q.price;
      addAtt(o,pid,3); addAtt(pid,o,2); (ai.tradedBy=ai.tradedBy||{})[o]=G.t; (G.ais[o].tradedBy=G.ais[o].tradedBy||{})[pid]=G.t; return; } }
}
// KI-Verteidigung: Stellungen an der Front, eine Graben-/Drahtlinie, Flugabwehr gegen Drohnen
export function aiDefense(pid){
  const p=G.players[pid], ai=G.ais[pid], C=aiChar(pid), F=ai.foe??0, hq=findBuilding(pid,'hq'); if(!hq||!findBuilding(pid,'barracks')) return;
  // Pioniere bauen die Stellungen – ohne sie bleibt alles Plan
  const pio=G.units.filter(u=>!u.dead&&u.owner===pid&&u.def.pioneer).length, wantPio=ai.saving?1:1+(anyWar(pid)||ai.lead?1:0)+(G.t>900?1:0);
  if(pio<wantPio&&!p.q.barracks.some(i=>i.type==='pioneer')&&canAfford(pid,'pioneer')&&p.res.money>300) enqueue(pid,'pioneer');
  if(!pio) return;
  if(G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.site&&b.pio).length>=2) return;   // erst fertig bauen
  const cnt=t=>countBuildings(pid,t);
  const enemyDrones=G.units.filter(u=>!u.dead&&u.owner===F&&u.def.cls==='air').length;
  const threat=anyWar(pid)||ai.lead;
  const heavyAir=G.units.filter(u=>!u.dead&&u.owner===F&&(u.def.sortie||u.def.swarm||u.type==='tel')).length;
  // Geheimdienst: bekannte Raketen-/Luftbedrohung des Rivalen -> vorbeugend Flugabwehrraketen
  const warned=['rocketry','aviation','glidebomb','tel','jet','bomb'].some(k=>aiKnowsThreat(pid,F,k));
  const airRecent=G.t-(ai.airSeenT??-1e9)<300, highRecent=G.t-(ai.highSeenT??-1e9)<300;   // Drohnen über der eigenen Stadt gesichtet
  const want={sam:heavyAir?Math.min(3,1+Math.floor(heavyAir/2)):warned||highRecent?1:0, flak:Math.max((enemyDrones>=2?2:0)+(enemyDrones>=5?1:0),airRecent?2:0,highRecent?3:0), sentry:Math.round((2+(threat?2:0))*C.defense*focusDefense(ai)), turret:Math.round(((G.t>300?1:0)+(threat?2:0))*C.defense*focusDefense(ai))};
  if(ai.saving){ want.sentry=Math.min(want.sentry,2); want.turret=0; }   // beim Sparen nur das Nötigste
  const dx=MAP_W/2-hq.x, dy=MAP_H/2-hq.y, L=Math.hypot(dx,dy)||1, fx=dx/L, fy=dy/L;
  for(const t of ['sam','flak','sentry','turret']){
    if(cnt(t)>=want[t]||!available(pid,t)||!canAfford(pid,t)||p.res.money<BUILDINGS[t].cost.money+((t==='flak'||t==='sam')&&airRecent?50:250)) continue;   // Flugabwehr in der Not zuerst
    let best=null,bs=1e9;
    for(let k=0;k<40;k++){ const r=4+Math.random()*4, ang=Math.atan2(fy,fx)+(Math.random()-0.5)*1.8;
      const x=Math.floor(hq.x+Math.cos(ang)*r), y=Math.floor(hq.y+Math.sin(ang)*r);
      if(!canPlaceDef(pid,t,x,y)) continue; let near=0; for(const b of G.buildings) if(!b.dead&&b.owner===pid&&b.def.weapon&&dist(b.x,b.y,x+.5,y+.5)<3) near++;
      const sc=near*5+Math.random(); if(sc<bs){bs=sc;best=[x,y];} }
    if(best){ placeDefense(pid,t,best[0],best[1]); return; }
  }
  // Grenzbunker Richtung Talmitte (sichert das Vorfeld)
  if(G.t>700&&cnt('gbunker')<(threat?2:1)&&available(pid,'gbunker')&&canAfford(pid,'gbunker')&&p.res.money>BUILDINGS.gbunker.cost.money+900){
    for(let k=0;k<40;k++){ const r=14+Math.random()*8, ang=Math.atan2(fy,fx)+(Math.random()-0.5)*1.2;
      const x=Math.floor(hq.x+Math.cos(ang)*r), y=Math.floor(hq.y+Math.sin(ang)*r);
      if(canPlaceDef(pid,'gbunker',x,y)){ placeDefense(pid,'gbunker',x,y); return; } } }
  const lines=ai.lines||0;
  if(G.t>180&&p.res.money>700&&(lines<1||(threat&&lines<2))){
    const d0=7.5+lines*1.5, px=-fy, py=fx;
    for(let k=-5;k<=5;k++){
      placeDefense(pid,'trench',Math.floor(hq.x+fx*d0+px*k),Math.floor(hq.y+fy*d0+py*k));
      if(k%3!==0) placeDefense(pid,'wire',Math.floor(hq.x+fx*(d0+1.4)+px*k),Math.floor(hq.y+fy*(d0+1.4)+py*k));
      if(threat&&k%2===0&&p.res.metal>80) placeDefense(pid,'atmine',Math.floor(hq.x+fx*(d0+3)+px*k),Math.floor(hq.y+fy*(d0+3)+py*k)); }
    ai.lines=lines+1;
  }
}
export function aiPickBuilding(p,armyN,need,lead){
  const pid=p.id, ai=G.ais[pid], ok=t=>G.t-((ai.noSpot||{})[t]??-999)>60;
  // erschöpfte Förderstätten zählen nicht (und werden abgerissen, um Platz zu schaffen)
  const has=t=>G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.type===t&&!b.empty).length;
  for(const b of G.buildings) if(!b.dead&&b.owner===pid&&b.empty&&!b.site&&(b.type==='lumber'||b.type==='quarry')) demolish(pid,b);
  // Baustoffe zuerst: ohne Holz und Stein entsteht nichts
  if(STORAGE.res.some(r=>p.res[r]>(p.store||STORAGE.base)*0.85)&&has('depot')<4&&p.pop>60) return 'depot';
  if(G.buildings.some(b=>!b.dead&&!b.site&&b.owner===pid&&hauls(b)&&(b.eff??1)<0.55)&&has('depot')<6&&ok('depot')&&p.res.money>400) return 'depot';
  if(!has('lumber')&&ok('lumber')) return 'lumber';
  if(!has('quarry')&&ok('quarry')&&G.t>15) return 'quarry';
  if(p.res.wood<70&&has('lumber')<3&&ok('lumber')) return 'lumber';
  if(p.res.wood<200&&has('forester')<2&&ok('forester')&&p.res.money>300&&(G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='lumber'&&b.empty)||G.t-((ai.noSpot||{}).lumber??-999)<120)) return 'forester';   // gefällten Wald wieder aufforsten
  if(p.res.stone<70&&has('quarry')<2&&ok('quarry')) return 'quarry';
  const pick=aiPickMain(p,need,has,ok);
  if(pick){ const c: any=BUILDINGS[pick].cost;
    if((c.wood||0)>p.res.wood&&has('lumber')<4&&ok('lumber')) return 'lumber';
    if((c.stone||0)>p.res.stone&&has('quarry')<3&&ok('quarry')) return 'quarry'; }
  return pick;
}
function aiPickMain(p,need,has,ok){
  const pid=p.id;
  const npp=hasTech(p,'physics')&&!has('npp')&&p.res.money>BUILDINGS.npp.cost.money+300;
  if(p.use+12>p.power) return npp?'npp':'power';
  const food=hasTech(p,'glass')&&p.power-p.use>40&&p.res.money>BUILDINGS.greenhouse.cost.money+200?'greenhouse':'farm';   // Gewächshaus spart Fläche
  const home=hasTech(p,'urban')&&p.res.money>BUILDINGS.block.cost.money+150&&p.res.stone>=BUILDINGS.block.cost.stone?'block':'house';   // Wohnblock statt Häuserteppich
  if(p.foodRate<0.3||need==='food') return food;
  if(p.pop>=p.cap-6) return home;
  if(!has('barracks')) return 'barracks';
  if(!has('kontor')&&p.pop>70&&EXPORT.order.some(r=>p.res[r]>EXPORT.reserve[r]+200)&&ok('kontor')) return 'kontor';   // Überschuss zu Geld machen
  if(p.pop>=p.cap-20&&p.res.money>400) return home;
  if((!has('mine')||(need==='metal'))&&ok('mine')) { if(aiCanReachOre(pid)) return 'mine'; }
  if(!has('refinery')&&ok('refinery')) return 'refinery';
  if(p.foodRate<1.2) return food;
  if(p.pop>FUN.free&&funCoverage(pid)<0.85){ for(const t of ['stadium','pool','theater','park']) if(available(pid,t)&&p.res.money>BUILDINGS[t].cost.money+(t==='park'?250:600)&&canAfford(pid,t)) return t; }   // Stadtleben vor weiteren Höfen
  const rich=t=>p.res.money>(costOf(t,pid).money||0)+250;   // teure Gebäude erst, wenn das Geld da ist (sonst blockieren sie den Aufbau)
  if(!has('factory')&&p.pop>90&&rich('factory')) return 'factory';
  if((has('factory')||AI_CHAR[pid].key==='handel'||G.profile[pid].scarce.includes('metal'))&&!has('university')&&p.pop>100&&rich('university')) return 'university';
  if(has('factory')&&!has('droneshop')&&p.tech>=1&&p.pop>140&&rich('droneshop')) return 'droneshop';
  const hi=aiPickHighTech(p,has,rich); if(hi) return hi;
  // Stadtleben: Feuerwache und Unterhaltung
  if(p.pop>FIRE.minPop&&fireCoverage(pid)<0.7&&has('firest')<4&&rich('firest')) return 'firest';
  if(p.pop>FUN.free-20&&funCoverage(pid)<1){ for(const t of ['stadium','pool','theater','park']) if(available(pid,t)&&rich(t)) return t; }
  if(p.pop>=p.cap-25) return home;
  if(p.res.money>4500&&has('factory')<2&&p.pop>300) return 'factory';
  if(p.foodRate<2.5) return food;
  if(!has('kontor')&&p.pop>180&&(p.res.oil>500||p.res.food>900||p.res.metal>500)) return 'kontor';
  if(has('lumber')<2&&p.pop>120) return 'lumber';
  if((G.mode!=='race'||p.cap<ECON.target+20)&&p.pop>p.cap-80) return home;
  return null;
}
/** kurze Beschreibung einer Truppe für Geheimdienstmeldungen */
export function armyText(units){ const c={}; for(const u of units) c[u.def.name.replace(/\u00AD/g,'')]=(c[u.def.name.replace(/\u00AD/g,'')]||0)+1;
  return Object.entries(c).sort((a:any,b:any)=>b[1]-a[1]).slice(0,4).map(([n,k])=>`${k}× ${n}`).join(', '); }
/** nächster Forschungsschritt der KI (nach AI_RESEARCH) */
export function aiNextResearch(p){
  if(!findBuilding(p.id,'university')) return null;
  const ai=G.ais[p.id]; if(llmActive(ai)&&ai.llm.research&&!hasTech(p,ai.llm.research)&&!exclBlock(p,ai.llm.research)&&available(p.id,ai.llm.research)) return ai.llm.research;   // Vorgabe des LLM-Strategen
  const L=(AI_RESEARCH[p.id]||AI_RESEARCH[1]) as [string,number][];
  for(const [k,pop] of L){ if(hasTech(p,k)||exclBlock(p,k)) continue;   // Entweder-oder: ausgeschlossene Zweige überspringen
    if((RESEARCH[k].needB||[]).includes('intel')&&!findBuilding(p.id,'intel')) continue;
    return p.pop>pop&&available(p.id,k)?k:null; }
  return null;
}
/** Hochtechnologie: Rechenzentrum, Kernkraft, Atomprogramm */
function aiPickHighTech(p,has,rich){
  const spare=p.power-p.use;
  if(hasTech(p,'computing')&&!has('datacenter')&&p.pop>320&&rich('datacenter')) return spare>160?'datacenter':hasTech(p,'physics')&&rich('npp')?'npp':'power';
  if(hasTech(p,'physics')&&!has('npp')&&spare<250&&rich('npp')) return 'npp';
  if(hasTech(p,'aviation')&&!has('airbase')&&rich('airbase')) return spare>45?'airbase':'power';
  if(hasTech(p,'deepdrill')&&has('derrick')<2&&p.res.oil<300&&rich('derrick')) return spare>50?'derrick':'power';
  if(hasTech(p,'bomb')&&!has('enrich')&&rich('enrich')) return spare>=420?'enrich':hasTech(p,'physics')&&rich('npp')?'npp':'power';
  if(has('enrich')&&!has('silo')&&rich('silo')) return 'silo';
  return null;
}
/** Atomschlag der KI: nur im Krieg, als Vergeltung oder in höchster Not – und nicht gegen eine Atommacht ohne Grund */
function aiNukeStrike(pid,F,ratio,urgent){
  const ai=G.ais[pid], p=G.players[pid];
  if(!atWar(pid,F)||!(p.nukes>0)||G.t<(ai.nukeT||0)) return;
  const revenge=!!(G.nukedBy&&G.nukedBy[F]), desperate=(urgent||ratio<AI_NUKE.ratio)&&!deterrent(F);
  if(!revenge&&!desperate) return;
  // Ziel: dort, wo die meisten Gebäude des Gegners im Sprengradius stehen (eigene verschonen)
  let best=null, bs=0;
  for(const b of G.buildings){ if(b.dead||b.owner!==F) continue;
    let s=0; for(const o of G.buildings){ if(o.dead) continue; const d=dist(o.x,o.y,b.x,b.y); if(d>NUKE.radius) continue; if(o.owner===F) s+=o.def.cap?2:1; else if(o.owner===pid){ s=-1; break; } }
    if(s>bs){ bs=s; best=b; } }
  if(best&&bs>=6){ ai.nukeT=G.t+AI_NUKE.cool; launchNuke(pid,best.x,best.y); }
}
/** fehlt ein wichtiger Rohstoff in Bau-Reichweite? Dann Ziel: nächstes Vorkommen (Erz, Öl, Felsen) */
export function expandTarget(pid){
  const ai=G.ais[pid], p=G.players[pid], hq=findBuilding(pid,'hq'); if(!hq) return null;
  const want=[]; if(!countBuildings(pid,'mine')) want.push(G.ore); if(!countBuildings(pid,'refinery')&&!countBuildings(pid,'derrick')) want.push(G.oil); if(!countBuildings(pid,'quarry')&&p.res.stone<200) want.push(G.rock);
  for(const L of want){ if(reach(pid,L)) continue;
    let best=null, bd=1e9; for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){ const i=idx(x,y); if(L[i]<=0) continue; const d=dist(x+.5,y+.5,hq.x,hq.y); if(d<bd&&d<45){bd=d;best={x:x+.5,y:y+.5};} }
    if(best&&!G.buildings.some(c=>!c.dead&&c.type==='camp'&&dist(c.x,c.y,best.x,best.y)<BANDITS.territory)) return best; }
  return null;
}
const reach=(pid,L)=>{ for(const b of G.buildings){ if(b.dead||b.owner!==pid) continue;
  for(let y=b.ty-6;y<=b.ty+b.h+6;y++)for(let x=b.tx-6;x<=b.tx+b.w+6;x++) if(inMap(x,y)&&L[idx(x,y)]>0) return true; } return false; };
export function aiCanReachOre(pid){ for(const b of G.buildings){ if(b.dead||b.owner!==pid) continue;
  for(let y=b.ty-8;y<=b.ty+b.h+8;y++)for(let x=b.tx-8;x<=b.tx+b.w+8;x++) if(inMap(x,y)&&G.ore[idx(x,y)]>0) return true; } return false; }
export function raidTarget(pid,F,from,need,lead,maxD){
  const ai=G.ais[pid], kinds=llmActive(ai)&&ai.llm.raid?[ai.llm.raid]:need==='food'?['farm']:need==='metal'?['mine']:need==='oil'?['refinery']:lead?['house','farm','hq']:['farm','refinery','mine','house'];
  let best=null,bd=1e9;
  for(const b of G.buildings){ if(b.dead||b.owner!==F) continue;
    const d=dist(from.x,from.y,b.x,b.y)+(kinds.includes(b.type)?0:20); if(maxD&&d>maxD+20) continue; if(d<bd){bd=d;best=b;} }
  if(!best&&!maxD) for(const b of G.buildings) if(!b.dead&&hostile(pid,b.owner)&&b.owner!==3){const d=dist(from.x,from.y,b.x,b.y);if(d<bd){bd=d;best=b;}}
  return best;
}
export function launchRaid(pid,F,army,need,lead,rally){
  const ai=G.ais[pid], hq=findBuilding(pid,'hq')||rally;
  const tg=raidTarget(pid,F,hq,need,lead,0); if(!tg) return;
  const sorted=[...army].sort((a,b)=>dist(a.x,a.y,hq.x,hq.y)-dist(b.x,b.y,hq.x,hq.y));
  const home=army.length>5?2:0, grp=sorted.slice(home);
  for(const u of grp){ u.wave=true; u.waveFoe=F; }
  makeGroup(pid,grp);   // die Angriffswelle kämpft als Verband
  orderMove(grp,tg.x,tg.y,'amove');
  ai.nextRaid=G.t+90; ai.raidTarget=tg; ai.lootSince=0;
  if(F===0) msg(`⚠ Überfall! ${grp.length} Einheiten ${G.players[pid].short}s rücken gegen euren ${tg.def.name} vor${intelLevel(0)>=2?` (${armyText(grp)})`:''}.`,'#ff8a7a');
}
export function aiRally(pid=1){const hq=findBuilding(pid,'hq')||G.buildings.find(b=>!b.dead&&b.owner===pid); if(!hq) return {x:MAP_W*0.75,y:MAP_H*0.25};
  const dx=MAP_W/2-hq.x, dy=MAP_H/2-hq.y, L=Math.hypot(dx,dy)||1; const p=nearestPassable(hq.x+dx/L*8,hq.y+dy/L*8,'veh'); return p?{x:p.x+0.5,y:p.y+0.5}:{x:hq.x,y:hq.y};}
export function aiPlace(pid,type){
  const d=BUILDINGS[type], own=G.buildings.filter(b=>!b.dead&&b.owner===pid); if(!own.length) return false;
  const hq=findBuilding(pid,'hq')||own[0];
  let x0=1e9,y0=1e9,x1=0,y1=0; for(const b of own){x0=Math.min(x0,b.tx);y0=Math.min(y0,b.ty);x1=Math.max(x1,b.tx+b.w);y1=Math.max(y1,b.ty+b.h);}
  const cand=[], far=G.buildings.filter(b=>!b.dead&&!b.site&&b.owner===pid&&hauls(b)&&(b.eff??1)<0.7);
  for(let y=y0-7;y<=y1+6;y++)for(let x=x0-7;x<=x1+6;x++){
    if(!canPlace(pid,type,x,y)) continue;
    if(G.buildings.some(c=>!c.dead&&c.type==='camp'&&dist(c.x,c.y,x+d.w/2,y+d.h/2)<BANDITS.territory+3)) continue;   // nicht ins Räubergebiet
    let ok=true; for(let yy=y-1;yy<=y+d.h&&ok;yy++)for(let xx=x-1;xx<=x+d.w;xx++){if(inMap(xx,yy)&&G.occ[idx(xx,yy)]){ok=false;break;}}
    if(!ok) continue;
    let s=dist(x+d.w/2,y+d.h/2,hq.x,hq.y);
    if(type==='turret') s=dist(x,y,hq.x+(MAP_W/2-hq.x)*0.3,hq.y+(MAP_H/2-hq.y)*0.3);
    if(type==='farm'||type==='house') s+=dist(x,y,hq.x-(MAP_W/2-hq.x)*0.3,hq.y-(MAP_H/2-hq.y)*0.3)*0.5; // eher hinten
    if(type==='house') s+=(1-housingQuality(pid,x,y,d.w,d.h).q)*30;                           // ruhig wohnen
    if(type==='farm') s-=previewFields(x,y,d.w,d.h)*25;                                        // Wiesen und freie Äcker
    if(type==='depot'&&far.length) s=Math.min(...far.map(b=>dist(x,y,b.x,b.y)));               // Lager zu entlegenen Betrieben
    if(type==='depot'&&G.ais[pid].expandTo){ const e=G.ais[pid].expandTo; s=dist(x+1,y+1,e.x,e.y); }   // Ausdehnung zum fehlenden Rohstoff
    if(type==='forester'){ const l=G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.type==='lumber'); if(l.length) s=Math.min(...l.map(b=>dist(x,y,b.x,b.y))); }   // Forsthaus neben den Holzfäller
    for(let yy=y;yy<y+d.h;yy++)for(let xx=x;xx<x+d.w;xx++) if(G.terr[idx(xx,yy)]===T.FOREST) s+=type==='lumber'?2:6;   // Wald möglichst stehen lassen
    if(d.noise) for(const h of own) if(h.def.cap&&rectDist(h,x,y,d.w,d.h)<=NOISE_R) s+=6;        // Industrie weg von Häusern
    cand.push({x,y,s:s+Math.random()*2});
  }
  if(!cand.length) return false;
  cand.sort((a,b)=>a.s-b.s);
  return !!placeSite(pid,type,cand[0].x,cand[0].y);
}

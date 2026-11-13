import { BUILDINGS, CITIZENS, DEV, FIRE, FUN, STORAGE, hasTech } from '../data/config';
import { G } from '../sim/state';
import { msg } from '../core/events';
import { countBuildings, findBuilding } from '../sim/world';
import { available, enqueue } from '../sim/production';
import { canAfford, costOf, famine } from '../sim/costs';
import { hauls, orderRoadTo } from '../sim/build';
import { fireCoverage } from '../sim/city';
import { devOf, funCoverage } from '../sim/devplan';
import { aiCanReachOre, aiPlace, expandTarget } from '../ai/kastrova';

/* =====================================================================
   Die Bürger bauen die Stadt selbst
   ---------------------------------------------------------------------
   Der Spieler gibt im Stadt-Fenster Prioritäten (aus/niedrig/hoch) und
   Freigaben vor. Alle paar Sekunden prüfen die Bürger den Bedarf jedes
   Bereichs (Wohnraum, Nahrung, Strom, Rohstoffe, Lager, Stadtleben,
   Wissen, Militär), wählen das dringendste Gebäude und setzen es selbst.
   Stellungen und Minen bleiben Sache des Kommandanten.
   Fehlt etwas (Geld, Baustoff, Bauplatz), steht es in G.cit.block –
   der Ratgeber macht daraus eine Entscheidung für den Spieler.
   ===================================================================== */
export const cit=()=>(G.cit||(G.cit={noSpot:{}, block:null, last:null}));
const name=t=>BUILDINGS[t].name.replace(/­/g,'');
/** Wunschliste: [Gebäude, Bereich, Dringlichkeit 1–10, Grund] */
export function citizenWants(pid=0){
  const p=G.players[pid], W:[string,string,number,string][]=[];
  const has=t=>G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.type===t&&!b.empty).length;
  const add=(t,c,u,why)=>{ if(BUILDINGS[t]) W.push([t,c,u,why]); };
  // Rohstoffe: ohne Holz und Stein entsteht nichts
  if(!has('lumber')) add('lumber','rohstoffe',10,'ohne Holz entsteht nichts');
  else if(p.res.wood<70&&has('lumber')<3) add('lumber','rohstoffe',6,'Holz wird knapp');
  else if(has('lumber')<2&&p.pop>120) add('lumber','rohstoffe',2,'mehr Holz für die wachsende Stadt');
  if(p.res.wood<200&&has('forester')<2&&G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='lumber'&&b.empty)) add('forester','rohstoffe',5,'der Wald ist abgeholzt');
  if(!has('quarry')&&G.t>15) add('quarry','rohstoffe',9,'Stein für Straßen und Gebäude');
  else if(p.res.stone<70&&has('quarry')<2) add('quarry','rohstoffe',6,'Stein wird knapp');
  if(!has('mine')&&p.pop>60&&aiCanReachOre(pid)) add('mine','rohstoffe',4,'Metall für Fahrzeuge und Industrie');
  if(!has('refinery')&&(has('factory')||p.pop>220)) add('refinery','rohstoffe',3,'Öl für Fahrzeuge');
  // Strom
  if(p.use+12>p.power) add(hasTech(p,'physics')&&!has('npp')&&p.pop>300?'npp':'power','strom',9,'der Strom reicht nicht');
  // Nahrung
  { const food=hasTech(p,'glass')&&p.power-p.use>40?'greenhouse':'farm';
    if(p.foodRate<0.3||famine(p)) add(food,'nahrung',9,'die Nahrung reicht nicht'); else if(p.foodRate<1.2) add(food,'nahrung',5,'Nahrungsreserve aufbauen'); else if(p.foodRate<2.5&&p.pop>p.cap-40) add(food,'nahrung',2,'Vorrat für weiteres Wachstum'); }
  // Wohnen
  { const home=hasTech(p,'urban')&&p.res.stone>=(BUILDINGS.block?.cost.stone||0)?'block':'house';
    if(p.pop>=p.cap-6) add(home,'wohnen',7,'kein freier Wohnraum'); else if(p.pop>=p.cap-25) add(home,'wohnen',5,'der Wohnraum wird knapp'); else if(p.pop>=p.cap-70) add(home,'wohnen',2,'Platz für Zuzug'); }
  // Lager und Handel
  if(STORAGE.res.some(r=>p.res[r]>(p.store||STORAGE.base)*0.85)&&has('depot')<4&&p.pop>60) add('depot','lager',6,'die Lager sind voll');
  else if(G.buildings.some(b=>!b.dead&&!b.site&&b.owner===pid&&hauls(b)&&(b.eff??1)<0.55)&&has('depot')<6) add('depot','lager',5,'weite Transportwege');
  if(!has('kontor')&&p.pop>120&&(p.res.oil>500||p.res.food>900||p.res.metal>500||p.res.wood>700)) add('kontor','lager',3,'Überschüsse verkaufen');
  // Stadtleben
  if(p.pop>FUN.free-20&&funCoverage(pid)<1){ const t=['stadium','pool','theater','park'].find(t=>available(pid,t)&&p.res.money>(BUILDINGS[t].cost.money||0)+(t==='park'?100:400)); if(t) add(t,'stadtleben',funCoverage(pid)<0.6?7:4,'den Bürgern fehlt Unterhaltung'); }
  if(p.pop>FIRE.minPop&&fireCoverage(pid)<0.7&&has('firest')<4) add('firest','stadtleben',4,'Brandschutz');
  // Wissen
  if(!has('university')&&p.pop>100) add('university','wissen',4,'Forschung ermöglichen');
  if(hasTech(p,'computing')&&!has('datacenter')&&p.pop>300&&p.power-p.use>160) add('datacenter','wissen',2,'Hochtechnologie');
  // Militär (Gebäude – Stellungen und Minen setzt der Kommandant)
  if(!has('barracks')&&p.pop>45) add('barracks','militaer',p.pop>90?8:5,'ohne Kaserne keine Truppen');
  if(has('barracks')&&!has('factory')&&p.pop>90) add('factory','militaer',3,'Fahrzeuge');
  if(has('factory')&&!has('workshop')&&p.pop>180) add('workshop','militaer',2,'Fahrzeuge ausrüsten');
  if(has('factory')&&!has('droneshop')&&p.tech>=1&&p.pop>140) add('droneshop','militaer',2,'Drohnen');
  if(hasTech(p,'aviation')&&!has('airbase')&&p.power-p.use>45) add('airbase','militaer',2,'Luftwaffe');
  if(has('barracks')&&!has('intel')&&p.pop>160) add('intel','militaer',2,'Nachrichtendienst');
  return W;
}
/** dürfen die Bürger das bezahlen? Dringendes aus der vollen Kasse, sonst nur aus der Freigabe */
function payable(pid,type,u,goal=false){
  const p=G.players[pid], d=devOf(pid), c:any=costOf(type,pid), urgent=u>=CITIZENS.urgent||goal, emergency=u>=CITIZENS.emergency;
  for(const r in c){ if(r==='pop') continue;
    const stock=r==='money'&&!emergency?Math.max(0,p.res.money-(d.reserve||0)):(p.res[r]||0);   // die Rücklage rühren die Bürger nur im Notfall an
    if(c[r]>stock*(urgent?1:(d.release[r]??1))) return r; }
  return '';
}
/** ein Denkschritt der Bürger */
export function citizenThink(pid=0){
  const d=devOf(pid), C=cit(), p=G.players[pid]; if(d.build===false||!findBuilding(pid,'hq')) return;
  // Bauarbeiter: ohne sie entsteht nichts
  const workers=G.units.filter(u=>!u.dead&&u.owner===pid&&u.def.worker).length, wantW=Math.min(CITIZENS.maxWorkers,3+Math.floor(p.pop/80));
  if(workers<wantW&&!p.q.hq.length&&canAfford(pid,'worker')&&(workers<2||p.res.money>200)) enqueue(pid,'worker');
  // Straßen: Betriebe mit weitem Transportweg ans Lager anbinden (eine Straße nach der anderen, wenn genug Stein da ist)
  if((d.prio.lager||0)+(d.prio.rohstoffe||0)>0&&p.res.stone>=CITIZENS.roadStone&&!G.road.some((r,i)=>r===1&&G.roadOwner[i]===pid+1)){
    const far=G.buildings.filter(b=>!b.dead&&!b.site&&b.owner===pid&&hauls(b)&&(b.eff??1)<CITIZENS.roadEff&&G.t-(C.roadTry?.[b.id]??-999)>120).sort((a,b)=>(a.eff??1)-(b.eff??1));
    for(const b of far){ (C.roadTry=C.roadTry||{})[b.id]=G.t; const n=orderRoadTo(pid,b);
      if(n>0){ if(pid===0) msg(`🛣 Die Bürger bauen eine Straße zum ${name(b.type)} (${n} Felder) – kürzere Wege, mehr Ertrag.`,'#9fd88a'); break; } } }
  const sites=G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.site&&!b.pio&&!b.def.def);
  const max=CITIZENS.sites+Math.floor(p.pop/CITIZENS.sitesPer);
  const stuck=sites.filter(b=>(b.waitT||0)>90).length;
  if(sites.length-stuck>=max){ return; }
  const ok=t=>G.t-(C.noSpot[t]??-999)>CITIZENS.retry&&!sites.some(b=>b.type===t);
  const W=citizenWants(pid).filter(([t,c])=>(d.prio[c]||0)>0&&ok(t)&&available(pid,t))
    .map(([t,c,u,why])=>({t,c,u,why,s:u+(d.prio[c]||0)*CITIZENS.prioW})).sort((a,b)=>b.s-a.s);
  C.block=null;
  // Großprojekt: auf das wichtigste teure Vorhaben wird eine Weile gespart (nur Notfälle gehen vor)
  const inc=Math.max(0,(p.rate&&p.rate.money)||0), spare=Math.max(0,p.res.money-(d.reserve||0));
  const big=W.find(w=>{ const m=costOf(w.t,pid).money||0; return m>=CITIZENS.big&&w.u<CITIZENS.emergency&&spare+inc*CITIZENS.saveT>=m; });   // nur, wenn es in der Sparzeit erreichbar ist
  if(!big) C.goal=null;
  else if(!C.goal||C.goal.type!==big.t){ if(G.t>=(C.goalPause||0)) C.goal={type:big.t, t0:G.t, why:big.why}; }
  if(C.goal&&G.t-C.goal.t0>CITIZENS.saveT){ C.goal=null; C.goalPause=G.t+CITIZENS.saveGap; }
  for(const w of W){
    let t=w.t; const isGoal=!!C.goal&&C.goal.type===t;
    if(C.goal&&!isGoal&&w.u<CITIZENS.emergency) continue;
    // Baustoff fehlt: erst die Quelle bauen
    const c:any=BUILDINGS[t].cost;
    if((c.wood||0)>p.res.wood&&countBuildings(pid,'lumber')<4&&ok('lumber')&&t!=='lumber') t='lumber';
    else if((c.stone||0)>p.res.stone&&countBuildings(pid,'quarry')<3&&ok('quarry')&&t!=='quarry') t='quarry';
    const lack=payable(pid,t,t!==w.t?CITIZENS.urgent:w.u,isGoal);
    if(lack){ if(!C.block||w.u>C.block.u) C.block={type:t, res:lack, why:w.why, u:w.u, t:G.t}; if(w.u>=CITIZENS.urgent) return; continue; }   // auf Dringendes wird gespart
    if(!canAfford(pid,t)) continue;
    if(aiPlace(pid,t)){ C.last={type:t,t:G.t}; if(isGoal){ C.goal=null; C.goalPause=G.t+CITIZENS.saveGap/2; }
      if(pid===0) msg(`🏗 Die Bürger bauen: ${name(t)}${t===w.t?` (${w.why})`:` – Baustoff für ${name(w.t)}`}.`,'#9fd88a');
      return; }
    C.noSpot[t]=G.t;
    // kein Platz für Rohstoffbetriebe: mit einem Lagerhaus zum Vorkommen ausdehnen
    if((t==='mine'||t==='quarry'||t==='refinery'||t==='lumber')&&(d.prio.lager||0)>0&&countBuildings(pid,'depot')<8&&canAfford(pid,'depot')){
      const e=expandTarget(pid); if(e){ C.expandTo=e; const done=aiPlace(pid,'depot'); C.expandTo=null; if(done){ if(pid===0) msg(`🏗 Die Bürger bauen ein Lagerhaus als Vorposten – Richtung ${name(t)}.`,'#9fd88a'); return; } } }
    if(pid===0&&w.u>=5&&G.t-(C.spotMsg||-999)>90){ C.spotMsg=G.t; C.block={type:t, res:'platz', why:w.why, u:w.u, t:G.t}; }
  }
}
export function updateCitizens(dt){ G.citT=(G.citT??CITIZENS.first)-dt; if(G.citT>0) return; G.citT=CITIZENS.think; citizenThink(0); }

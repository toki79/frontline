import { dist, idx, inMap } from '../core/util';
import { AI_MIX, BANDITS, BUILDINGS, DEF, ECON, MAP_H, MAP_W, NOISE_R, REGION, RES, STORAGE, UNITS } from '../data/config';
import { distTo } from '../sim/combat';
import { canAfford, lacking } from '../sim/costs';
import { aiQuotes, marketOpen, trade } from '../sim/market';
import { showOffer } from '../sim/offers';
import { orderMove } from '../sim/orders';
import { available, canPlace, canPlaceDef, enqueue, placeDefense, placeSite } from '../sim/production';
import { demolish, hauls, orderRoadTo, previewFields, siteLacks } from '../sim/build';
import { G } from '../sim/state';
import { armyStr, countBuildings, defStr, findBuilding, hostile, housingQuality, nearestPassable, rectDist, ringTiles, setWar, updateRel } from '../sim/world';
import { msg } from '../core/events';

/* =====================================================================
   KI Kastrova – handelt nach Bedarf, Stärkeverhältnis und Vorsprung
   ---------------------------------------------------------------------
   mode: frieden  -> Aufbau; prüft, ob sich Forderung/Überfall lohnt
         krieg    -> Überfälle auf gezielte Gebäude, später Friedensangebot
   ===================================================================== */
export function aiThink(){
  const pid=1, p=G.players[pid], P=G.players[0], ai=G.ai, D=G.diff;
  const myB=G.buildings.filter(b=>!b.dead&&b.owner===pid); if(!myB.length) return;
  const myU=G.units.filter(u=>!u.dead&&u.owner===pid);
  const army=myU.filter(u=>u.def.weapon), trucks=myU.filter(u=>u.def.harvester);
  const myStr=armyStr(pid)+defStr(pid)*0.3, theirStr=armyStr(0)+defStr(0)*0.6, ratio=myStr/Math.max(250,theirStr);
  const mineOk=G.buildings.some(b=>!b.dead&&b.owner===pid&&b.type==='mine'&&!b.empty);
  // --- Lage einschätzen ---
  let need=null;
  if(p.res.food<90&&p.foodRate<0.2) need='food';
  else if(p.res.metal<40&&!mineOk&&G.t>150) need='metal';
  else if(p.res.oil<40&&trucks.length===0&&countBuildings(pid,'factory')&&G.t>240) need='oil';
  const race=G.mode==='race';
  const lead = race ? (P.pop>=ECON.target*0.55 && P.pop>p.pop*1.12) : (P.pop>=150 && P.pop>p.pop*1.15);
  const urgent = race ? (P.pop>=ECON.target*0.8 && P.pop>p.pop) : (P.pop>=300 && P.pop>p.pop*1.4);
  ai.need=need; ai.lead=lead; ai.ratio=ratio;
  // Anfragen veröffentlichen (Bedarf am Markt bekannt machen)
  if(!G.war){ ai.ann=ai.ann||{}; ai.urg=ai.urg||{}; const qs=aiQuotes();
    for(const r of REGION.res){ const q=qs.find(q=>q.side==='buy'&&q.res===r&&q.urgent); if(!q) ai.urg[r]=0; else if(!ai.urg[r]) ai.urg[r]=G.t; }
    for(const q of qs) if(q.side==='buy'&&q.urgent&&G.t>100&&G.t-ai.urg[q.res]>25&&G.t-(ai.ann[q.res]||-999)>120){ ai.ann[q.res]=G.t;
      msg(`📦 Marktanfrage: Kastrova kauft ${q.amt} ${RES[q.res].name} ${RES[q.res].icon} für $${q.price}.`,'#d6b45a'); } }
  if(need){ if(!ai.requestSince) ai.requestSince=G.t; } else ai.requestSince=0;
  const patience = need ? G.t-ai.requestSince>60 : true;   // erst nach unbeantworteter Anfrage fordern
  if(lead&&!ai.warnLead){ai.warnLead=true;msg('Geheimdienst: Kastrova sieht euer Wachstum mit Sorge und rüstet auf.','#d6b45a');}

  // --- Gebäude ---
  // Baustellen beauftragen (höchstens zwei gleichzeitig offen)
  const sites=G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.site).length;
  ai.noSpot=ai.noSpot||{};
  if(sites<2&&findBuilding(pid,'hq')){
    const next=aiPickBuilding(p,army.length,need,lead);
    if(next&&available(pid,next)&&canAfford(pid,next)){ if(!aiPlace(pid,next)) ai.noSpot[next]=G.t; }
  }
  // Bauarbeiter: mit der Stadt wächst der Trupp
  const workers=myU.filter(u=>u.def.worker).length, wantW=Math.min(10,3+Math.floor(p.pop/80));
  if(workers<wantW&&!p.q.hq.length&&canAfford(pid,'worker')&&p.res.money>200) enqueue(pid,'worker');
  // Straßen zu Betrieben mit weitem Transportweg (wenn Stein da ist)
  ai.roadT=(ai.roadT||0)-D.think;
  if(ai.roadT<=0&&G.t>90){ ai.roadT=20;
    const open=G.road.some((r,i)=>r===1&&G.roadOwner[i]===2);
    if(!open&&p.res.stone>=80) for(const b of myB.filter(b=>!b.site&&hauls(b)&&(b.eff??1)<0.8).sort((a,c)=>a.eff-c.eff)){ if(orderRoadTo(pid,b)>0) break; } }
  aiDefense(pid);
  // --- Forschung ---
  if(findBuilding(pid,'university')&&!p.q.research.length){ const r=p.tech<2?'res2':p.tech<3?'res3':null;
    if(r&&p.pop>(r==='res2'?140:240)&&available(pid,r)&&canAfford(pid,r)&&p.res.money>DEF(r).cost.money+150) enqueue(pid,r); }
  // --- Tanklaster ---
  for(const t of trucks) if(!t.hs&&t.mode==='idle') t.hs='seek';
  const refs=countBuildings(pid,'refinery'), queuedTruck=p.q.factory.some(i=>i.type==='truck');
  if(refs&&trucks.length<Math.min(refs*2,3)&&!queuedTruck&&available(pid,'truck')&&canAfford(pid,'truck')&&p.res.money>700) enqueue(pid,'truck');
  // --- Handel am Milizmarkt ---
  if(marketOpen(pid)){
    if(p.res.oil>300) trade(pid,'sellOil');
    if(need==='food'&&ratio<1.2&&p.res.money>400) trade(pid,'buyFood');
    const nextRes=findBuilding(pid,'university')&&!p.q.research.length?(p.tech<2?'res2':p.tech<3?'res3':null):null;
    // Baustoffe zukaufen, wenn eine Baustelle darauf wartet (bei knappen Rohstoffen schon früher)
    for(const [r,k] of [['wood','buyWood'],['stone','buyStone']]){ const waits=G.buildings.some(b=>!b.dead&&b.owner===pid&&b.site&&siteLacks(b)===r);
      if(p.res[r]<80&&(waits||G.profile[pid].scarce.includes(r))&&p.res.money>320) trade(pid,k); }
    if((p.res.metal<60&&!mineOk&&p.res.money>900)||(nextRes&&p.res.metal<DEF(nextRes).cost.metal&&p.res.money>1500)) trade(pid,'buyMetal');
  }
  // --- Armee: Sollstärke nach Bedrohung und Absicht ---
  const campsNear=G.buildings.filter(c=>!c.dead&&c.type==='camp'&&myB.some(b=>dist(c.x,c.y,b.x,b.y)<24)).length;
  let want=3+campsNear*2+Math.floor(theirStr/450)+(G.war?3:0)+(lead?4:0)+(urgent?4:0)+(need&&ratio<1.3?3:0)+Math.min(6,Math.floor(p.res.money/1500));
  const armyPop=army.reduce((s,u)=>s+(u.def.cost.pop||0),0);
  if(armyPop>p.pop*0.3+10) want=Math.min(want,army.length);
  if(army.length<want&&G.t>40){
    for(let tries=0;tries<AI_MIX.length;tries++){
      const t=AI_MIX[ai.mix%AI_MIX.length];
      if(!available(pid,t)){ai.mix++;continue;}
      if(p.q[UNITS[t].prod].length>=1) break;
      const lack=lacking(pid,t);
      if(!lack.length){ if(p.res.money-UNITS[t].cost.money>(need?0:250)||G.war||urgent){enqueue(pid,t);ai.mix++;} break; }
      if(lack.some(k=>k!=='money')){ai.mix++;continue;}   // fehlt Metall/Öl/Einwohner -> anderen Typ
      break;
    }
  }
  // --- Räuberlager in Stadtnähe ausheben ---
  ai.campT=(ai.campT||0)-D.think;
  if(ai.campT<=0){ ai.campT=30;
    const busy=army.filter(u=>u.task==='camp');
    if(!busy.length&&!(G.war&&ai.mode==='krieg'&&army.some(u=>u.wave))){
      let camp=null, cd=1e9; for(const c of G.buildings){ if(c.dead||c.type!=='camp') continue; for(const b of myB){ const d=dist(c.x,c.y,b.x,b.y); if(d<24&&d<cd){cd=d;camp=c;} } }
      const free=army.filter(u=>!u.wave&&!u.target&&u.def.cls!=='air').sort((a,b)=>b.hp-a.hp);
      if(camp&&free.length>=4){ const grp=free.slice(0,Math.min(6,free.length)); for(const u of grp) u.task='camp'; orderMove(grp,camp.x,camp.y,'amove'); }
    } else for(const u of busy){ if(!G.buildings.some(c=>!c.dead&&c.type==='camp'&&dist(c.x,c.y,u.x,u.y)<14)){ u.task=null; } else if(u.mode==='idle'&&!u.target){ const c=G.buildings.find(c=>!c.dead&&c.type==='camp'&&dist(c.x,c.y,u.x,u.y)<14); if(c) orderMove([u],c.x,c.y,'amove'); } }
  }
  // --- Verteidigung (nur im Krieg) ---
  const rally=aiRally();
  let threat=null,tb=1e9;
  if(G.war||G.militiaAlly===0) for(const e of G.units){ if(e.dead||!hostile(pid,e.owner)) continue;
    for(const b of myB){const d=distTo(e,b); if(d<13&&d<tb){tb=d;threat=e;}} }
  if(threat){
    for(const u of army.filter(u=>!u.wave||dist(u.x,u.y,threat.x,threat.y)<15))
      if(!u.target&&(u.mode!=='amove'||!u.goal||dist(u.goal.x,u.goal.y,threat.x,threat.y)>6)) orderMove([u],threat.x,threat.y,'amove');
  }
  // --- Absicht ---
  if(!G.war){
    ai.mode='frieden';
    let aggr=((need&&patience?1:0)+(lead?0.9:0)+(urgent?1:0)+(ratio>2.5?0.5:0))*D.aggr - Math.max(0,G.aiAtt)/60 - (G.t-(ai.tradedT||-999)<90?0.4:0);
    if(G.t>D.grace && aggr>=1 && G.t>ai.cool && !G.offer && ((army.length>=4&&ratio>=1.15)||(urgent&&army.length>=6&&ratio>=0.7))){
      if(need&&!urgent&&P.res[need]>=150&&Math.random()<0.7){
        const amt=need==='food'?150:need==='metal'?100:120;
        ai.cool=G.t+150; showOffer({type:'demand',res:need,amt});
      } else { ai.cool=G.t+60; setWar(true,1); ai.nextRaid=0; }
    }
    // Schutzgeld: Stärke ausnutzen, wenn Aldoria reich und schwach ist
    else if(G.t>D.grace&&!need&&ratio>2.2*(2-D.aggr)&&P.res.money>1200&&army.length>=5&&G.t>ai.cool&&!G.offer&&G.aiAtt<40){
      ai.cool=G.t+220; showOffer({type:'demand',res:'money',amt:Math.min(600,Math.floor(P.res.money*0.3/50)*50)});
    }
    if(!threat) for(const u of army) if(u.mode==='idle'&&!u.target&&!u.task&&dist(u.x,u.y,rally.x,rally.y)>5) orderMove([u],rally.x+(Math.random()-.5)*4,rally.y+(Math.random()-.5)*4);
  } else {
    ai.mode='krieg';
    const raiders=army.filter(u=>u.wave);
    if(raiders.length){
      if(raiders.length<2){ for(const u of raiders){u.wave=false;orderMove([u],rally.x,rally.y);} ai.raidTarget=null; }
      else for(const u of raiders) if(u.mode==='idle'&&!u.target){
        const tg=raidTarget(u,need,lead,12);
        if(tg) orderMove([u],tg.x,tg.y,'amove'); else { u.wave=false; orderMove([u],rally.x,rally.y); }
      }
    } else if(G.t>ai.nextRaid&&army.length>=4&&(ratio>=1.0||(urgent&&ratio>=0.6))){
      launchRaid(army,need,lead,rally);
    } else if(!threat) for(const u of army) if(u.mode==='idle'&&!u.target&&dist(u.x,u.y,rally.x,rally.y)>5) orderMove([u],rally.x,rally.y);
    // Frieden anbieten, wenn das Ziel erreicht oder der Krieg aussichtslos ist
    if(!raiders.length&&!urgent&&G.t-ai.lastCombat>40&&G.t>ai.peaceCool&&!G.offer&&((!need&&ai.lootSince>150)||ratio<0.7)){
      ai.peaceCool=G.t+120; showOffer({type:'peace'});
    }
  }
  // --- Miliz umwerben ---
  ai.giftT-=D.think;
  if(ai.giftT<=0){ ai.giftT=30;
    if(!G.militiaWar[1]&&G.militiaAlly!==1&&findBuilding(2,'bunker')&&p.res.money>=1500&&G.t>90){
      p.res.money-=300; G.attitude[1]=Math.min(100,G.attitude[1]+12);
      if(G.attitude[1]>=30&&!G.aiHintShown){G.aiHintShown=true;msg('Geheimdienst: Kastrova umwirbt die Grenzmiliz mit Geschenken.','#d6b45a');}
      if(G.attitude[1]>=60&&(G.militiaAlly===-1||G.attitude[1]>=G.attitude[0]+25)){ G.militiaAlly=1; updateRel(); msg('Die Grenzmiliz hat ein Bündnis mit Kastrova geschlossen!','#ff8a7a'); }
    }
  }
}
// KI-Verteidigung: Stellungen an der Front, eine Graben-/Drahtlinie, Flugabwehr gegen Drohnen
export function aiDefense(pid){
  const p=G.players[pid], ai=G.ai, hq=findBuilding(pid,'hq'); if(!hq||!findBuilding(pid,'barracks')) return;
  const cnt=t=>countBuildings(pid,t);
  const enemyDrones=G.units.filter(u=>!u.dead&&u.owner===0&&u.def.cls==='air').length;
  const threat=G.war||ai.lead;
  const want={flak:(enemyDrones>=2?2:0)+(enemyDrones>=5?1:0), sentry:2+(threat?2:0), turret:(G.t>300?1:0)+(threat?2:0)};
  const dx=MAP_W/2-hq.x, dy=MAP_H/2-hq.y, L=Math.hypot(dx,dy)||1, fx=dx/L, fy=dy/L;
  for(const t of ['flak','sentry','turret']){
    if(cnt(t)>=want[t]||!available(pid,t)||!canAfford(pid,t)||p.res.money<BUILDINGS[t].cost.money+250) continue;
    let best=null,bs=1e9;
    for(let k=0;k<40;k++){ const r=4+Math.random()*4, ang=Math.atan2(fy,fx)+(Math.random()-0.5)*1.8;
      const x=Math.floor(hq.x+Math.cos(ang)*r), y=Math.floor(hq.y+Math.sin(ang)*r);
      if(!canPlaceDef(pid,t,x,y)) continue; let near=0; for(const b of G.buildings) if(!b.dead&&b.owner===pid&&b.def.weapon&&dist(b.x,b.y,x+.5,y+.5)<3) near++;
      const sc=near*5+Math.random(); if(sc<bs){bs=sc;best=[x,y];} }
    if(best){ placeDefense(pid,t,best[0],best[1]); return; }
  }
  const lines=ai.lines||0;
  if(G.t>180&&p.res.money>700&&(lines<1||(threat&&lines<2))){
    const d0=7.5+lines*1.5, px=-fy, py=fx;
    for(let k=-5;k<=5;k++){
      placeDefense(pid,'trench',Math.floor(hq.x+fx*d0+px*k),Math.floor(hq.y+fy*d0+py*k));
      if(k%3!==0) placeDefense(pid,'wire',Math.floor(hq.x+fx*(d0+1.4)+px*k),Math.floor(hq.y+fy*(d0+1.4)+py*k)); }
    ai.lines=lines+1;
  }
}
export function aiPickBuilding(p,armyN,need,lead){
  const pid=1, ai=G.ai, ok=t=>G.t-((ai.noSpot||{})[t]??-999)>60;
  // erschöpfte Förderstätten zählen nicht (und werden abgerissen, um Platz zu schaffen)
  const has=t=>G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.type===t&&!b.empty).length;
  for(const b of G.buildings) if(!b.dead&&b.owner===pid&&b.empty&&!b.site&&(b.type==='lumber'||b.type==='quarry')) demolish(pid,b);
  // Baustoffe zuerst: ohne Holz und Stein entsteht nichts
  if(STORAGE.res.some(r=>p.res[r]>(p.store||STORAGE.base)*0.85)&&has('depot')<4&&p.pop>60) return 'depot';
  if(G.buildings.some(b=>!b.dead&&!b.site&&b.owner===pid&&hauls(b)&&(b.eff??1)<0.55)&&has('depot')<6&&ok('depot')&&p.res.money>400) return 'depot';
  if(!has('lumber')&&ok('lumber')) return 'lumber';
  if(!has('quarry')&&ok('quarry')&&G.t>15) return 'quarry';
  if(p.res.wood<70&&has('lumber')<3&&ok('lumber')) return 'lumber';
  if(p.res.stone<70&&has('quarry')<2&&ok('quarry')) return 'quarry';
  const pick=aiPickMain(p,need,has,ok);
  if(pick){ const c: any=BUILDINGS[pick].cost;
    if((c.wood||0)>p.res.wood&&has('lumber')<4&&ok('lumber')) return 'lumber';
    if((c.stone||0)>p.res.stone&&has('quarry')<3&&ok('quarry')) return 'quarry'; }
  return pick;
}
function aiPickMain(p,need,has,ok){
  const pid=1;
  if(p.use+12>p.power) return 'power';
  if(p.foodRate<0.3||need==='food') return 'farm';
  if(p.pop>=p.cap-6) return 'house';
  if(!has('barracks')) return 'barracks';
  if(p.pop>=p.cap-20&&p.res.money>400) return 'house';
  if((!has('mine')||(need==='metal'))&&ok('mine')) { if(aiCanReachOre(pid)) return 'mine'; }
  if(!has('refinery')) return 'refinery';
  if(p.foodRate<1.2) return 'farm';
  const rich=t=>p.res.money>BUILDINGS[t].cost.money+250;   // teure Gebäude erst, wenn das Geld da ist (sonst blockieren sie den Aufbau)
  if(!has('factory')&&p.pop>90&&rich('factory')) return 'factory';
  if(has('factory')&&!has('university')&&p.pop>110&&rich('university')) return 'university';
  if(has('factory')&&!has('droneshop')&&p.tech>=1&&p.pop>140&&rich('droneshop')) return 'droneshop';
  if(p.pop>=p.cap-25) return 'house';
  if(p.res.money>4500&&has('factory')<2&&p.pop>300) return 'factory';
  if(p.foodRate<2.5) return 'farm';
  if(!has('kontor')&&p.pop>180&&(p.res.oil>500||p.res.food>900||p.res.metal>500)) return 'kontor';
  if(has('lumber')<2&&p.pop>120) return 'lumber';
  if((G.mode!=='race'||p.cap<ECON.target+20)&&p.pop>p.cap-80) return 'house';
  return null;
}
export function aiCanReachOre(pid){ for(const b of G.buildings){ if(b.dead||b.owner!==pid) continue;
  for(let y=b.ty-8;y<=b.ty+b.h+8;y++)for(let x=b.tx-8;x<=b.tx+b.w+8;x++) if(inMap(x,y)&&G.ore[idx(x,y)]>0) return true; } return false; }
export function raidTarget(from,need,lead,maxD){
  const kinds=need==='food'?['farm']:need==='metal'?['mine']:need==='oil'?['refinery']:lead?['house','farm','hq']:['farm','refinery','mine','house'];
  let best=null,bd=1e9;
  for(const b of G.buildings){ if(b.dead||b.owner!==0) continue;
    const d=dist(from.x,from.y,b.x,b.y)+(kinds.includes(b.type)?0:20); if(maxD&&d>maxD+20) continue; if(d<bd){bd=d;best=b;} }
  if(!best&&!maxD) for(const b of G.buildings) if(!b.dead&&hostile(1,b.owner)){const d=dist(from.x,from.y,b.x,b.y);if(d<bd){bd=d;best=b;}}
  return best;
}
export function launchRaid(army,need,lead,rally){
  const ai=G.ai, hq=findBuilding(1,'hq')||rally;
  const tg=raidTarget(hq,need,lead,0); if(!tg) return;
  const sorted=[...army].sort((a,b)=>dist(a.x,a.y,hq.x,hq.y)-dist(b.x,b.y,hq.x,hq.y));
  const home=army.length>5?2:0, grp=sorted.slice(home);
  for(const u of grp) u.wave=true;
  orderMove(grp,tg.x,tg.y,'amove');
  ai.nextRaid=G.t+90; ai.raidTarget=tg; ai.lootSince=0;
  msg(`⚠ Überfall! ${grp.length} Einheiten Kastrovas rücken gegen euren ${tg.def.name} vor.`,'#ff8a7a');
}
export function aiRally(){const hq=findBuilding(1,'hq')||G.buildings.find(b=>!b.dead&&b.owner===1); if(!hq) return {x:MAP_W*0.75,y:MAP_H*0.25};
  const dx=MAP_W/2-hq.x, dy=MAP_H/2-hq.y, L=Math.hypot(dx,dy)||1; const p=nearestPassable(hq.x+dx/L*8,hq.y+dy/L*8,'veh'); return p?{x:p.x+0.5,y:p.y+0.5}:{x:hq.x,y:hq.y};}
export function aiPlace(pid,type){
  const d=BUILDINGS[type], own=G.buildings.filter(b=>!b.dead&&b.owner===pid); if(!own.length) return false;
  const hq=findBuilding(pid,'hq')||own[0];
  let x0=99,y0=99,x1=0,y1=0; for(const b of own){x0=Math.min(x0,b.tx);y0=Math.min(y0,b.ty);x1=Math.max(x1,b.tx+b.w);y1=Math.max(y1,b.ty+b.h);}
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
    if(d.noise) for(const h of own) if(h.def.cap&&rectDist(h,x,y,d.w,d.h)<=NOISE_R) s+=6;        // Industrie weg von Häusern
    cand.push({x,y,s:s+Math.random()*2});
  }
  if(!cand.length) return false;
  cand.sort((a,b)=>a.s-b.s);
  return !!placeSite(pid,type,cand[0].x,cand[0].y);
}

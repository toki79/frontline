import { $$ } from './dom';
import { clamp, dist, fmt, idx, inMap, lerp } from '../core/util';
import { AIR, COMBINED, capOf, nextUpgrade, lvlOf, UPGRADES, BUILDINGS, CAGE, CONSTRUCTION, DEF, DEF_RADIUS, DENSITY, FEATURES, MAP_H, MAP_W, NUKE, RES, TILE, isDefType } from '../data/config';
import { launchNuke } from '../sim/nuke';
import { VH, VW, cam, clampCam, toWorld, zoomAt } from '../render/camera';
import { lacking } from '../sim/costs';
import { orderAttack, orderEscort, orderHarvest, orderLurk, orderMove, orderPatrol, orderReturn, orderStop, upgradeCage } from '../sim/orders';
import { cancelDefPlan, placeDefense, placeSite } from '../sim/production';
import { sendDiplomats } from '../sim/trade';
import { applyOrder, ORDER_NAME } from '../sim/missions';
import { ARM_NAME, groupState, groupsOf, makeGroup, members } from '../sim/groups';
import { centerOn } from '../render/camera';
import { issuePending } from '../ui/forces';
import { startUpgrade, upgradeBlock, upgradeEffect } from '../sim/build';
import { assignWorkers, canPlaceRoad, cancelRoad, demolish, orderRoadTo, planRoadLine, siteLacks, siteStock, siteWorkers } from '../sim/build';
import { G } from '../sim/state';
import { fxAdd } from '../sim/units';
import { hostile, knownBuilding, visibleUnit } from '../sim/world';
import { $, cv, mini } from '../ui/dom';
import { costHtml, f1 } from '../ui/format';
import { msg } from '../core/events';
import { WEAPON_INFO } from '../ui/tooltips';

export const input={pts:new Map(),drag:null,pinch:null,box:null,keys:new Set(),lastTap:{t:0,id:-1}};
export const endPtr=e=>{
  if(!G) return;
  input.pts.delete(e.pointerId);
  if(input.pinch){ if(input.pts.size<2) input.pinch=null; input.drag=null; return; }
  const dr=input.drag; input.drag=null; if(!dr) return;
  if(!dr.moved){ handleTap(toWorld(e.clientX,e.clientY), dr.mouse&&dr.button===2, dr.shift); }
  else if(dr.mode==='paint'){ const w=toWorld(e.clientX,e.clientY), i=idx(clamp(Math.floor(w.x),0,MAP_W-1),clamp(Math.floor(w.y),0,MAP_H-1)); if(i!==G.lastPaint) handleTap(w,false,false); }
  else if(dr.mode==='box'&&input.box){ boxSelect(input.box,dr.shift); }
  input.box=null;
};
export function myUnitsSel(){return G.sel.filter(e=>e.kind==='unit'&&e.owner===0&&!e.dead);}
export function pickEntity(w){
  let best=null,bd=1e9;
  for(const u of G.units){ if(u.dead||!visibleUnit(u)) continue; const d=dist(u.x,u.y,w.x,w.y); const r=Math.max(0.55,u.def.size*0.8); if(d<r&&d<bd){bd=d;best=u;} }
  if(best) return best;
  const tx=Math.floor(w.x),ty=Math.floor(w.y); if(!inMap(tx,ty)) return null; const id=G.occ[idx(tx,ty)];
  const b=id?G.buildings.find(b=>b.id===id&&!b.dead):null; return b&&knownBuilding(b)?b:null;
}
export function handleTap(w,right,shift){
  if(G.over) return;
  if(G.nukeAim){ if(right){ G.nukeAim=false; G.nukeArm=null; refreshCmds(); return; } nukeTap(w); return; }
  if(G.orderPending){ if(right){ G.orderPending=null; refreshCmds(); return; } issuePending(w.x,w.y); fxAdd({k:'marker',x:w.x,y:w.y,col:'#ffd36a',life:0.7}); return; }
  if(G.placing&&isDefType(G.placing)){
    if(right){G.placing=null;G.roadStart=null;refreshCmds();return;}
    const x=Math.floor(w.x), y=Math.floor(w.y), road=FEATURES[G.placing]&&FEATURES[G.placing].road;
    if(road){ roadTap(x,y); return; }
    if(!road&&cancelDefPlan(0,x,y)){ G.lastPaint=idx(x,y); msg('Plan zurückgenommen, Kosten erstattet.'); return; }
    if(!placeDefense(0,G.placing,x,y)){ const lack=lacking(0,G.placing);
      if(G.t-(G.defMsgT||-9)>1.5){G.defMsgT=G.t; msg(lack.length?'Es fehlt: '+lack.map(r=>RES[r].name).join(', '):road?`Straßen nur auf freier Steppe, Schlamm oder Ortschaft, höchstens ${CONSTRUCTION.roadRadius} Felder von eigenen Gebäuden.`:`Hier nicht möglich (freies Land, höchstens ${DEF_RADIUS} Felder vor der Stadt).`,'#ffb38a');} }
    G.lastPaint=idx(x,y); return;
  }
  if(G.placing){
    if(right){G.placing=null;return;}
    const d=BUILDINGS[G.placing], tx=Math.floor(w.x)-Math.floor((d.w-1)/2), ty=Math.floor(w.y)-Math.floor((d.h-1)/2);
    const site=placeSite(0,G.placing,tx,ty);
    if(site){ G.placing=null; if(!G.units.some(u=>!u.dead&&u.owner===0&&u.def.worker)) msg('Keine Bauarbeiter! Bilde im Reiter Truppen am Rathaus neue aus.','#ffb38a');
      const c=BUILDINGS[site.type].cost, mats=['wood','stone','metal'].filter(m=>c[m]);
      if(mats.length) msg(`🏗 Baustelle gesetzt. Material holen die Arbeiter beim Bauen: ${mats.map(m=>RES[m].icon+c[m]).join(' ')}${mats.some(m=>G.players[0].res[m]<c[m])?' – reicht noch nicht, die Baustelle wartet.':''}`); }
    else { const lack=lacking(0,G.placing);
      msg(lack.length?'Es fehlt: '+lack.map(r=>RES[r].name).join(', '):d.needsOre?'Die Mine muss direkt an graue Erzfelsen grenzen (gelb markiert) und nahe der Stadt liegen.':d.needsRock?'Der Steinbruch muss direkt an helle Felsbrocken grenzen (gelb markiert).':d.needsForest?'Der Holzfäller braucht Wald in der Nähe (gelb markiert, mind. 3 Waldfelder im Umkreis von 3).':'Hier kann nicht gebaut werden (nur auf freier Steppe, nicht auf Straßen, nahe der eigenen Stadt).','#ffb38a'); }
    refreshCmds(); return;
  }
  const ent=pickEntity(w), mine=myUnitsSel();
  if(right){ if(mine.length) command(ent,w,mine); return; }
  if(G.escortMode&&mine.length){
    if(ent&&ent.kind==='unit'&&ent.owner===0&&!mine.includes(ent)){ const n=orderEscort(mine,ent); fxAdd({k:'marker',x:ent.x,y:ent.y,col:'#7fb0ea',life:0.6});
      msg(`🛡 ${n} Einheit${n===1?'':'en'} begleite${n===1?'t':'n'} jetzt: ${ent.def.name}.`,'#9fd88a'); }
    else msg('Zum Begleiten einen eigenen Arbeiter, Laster oder eine andere Einheit antippen.','#ffb38a');
    G.escortMode=false; refreshCmds(); return; }
  if(G.amoveMode&&mine.length){ applyOrder(mine,'assault',w.x,w.y); fxAdd({k:'marker',x:w.x,y:w.y,col:'#ff7a5a',life:0.5}); G.amoveMode=false; refreshCmds(); return; }
  if(G.orderMode&&mine.length){ applyOrder(mine,G.orderMode,w.x,w.y); fxAdd({k:'marker',x:w.x,y:w.y,col:G.orderMode==='hold'?'#7fb0ea':'#ffd36a',life:0.6});
    msg(`${mine.length} Einheit${mine.length===1?'':'en'}: ${ORDER_NAME[G.orderMode]}.`); G.orderMode=null; refreshCmds(); return; }
  if(ent&&ent.owner===0){
    if(ent.kind==='building'&&ent.site&&mine.some(u=>u.def.worker)){ assignWorkers(mine,ent); fxAdd({k:'marker',x:ent.x,y:ent.y,col:'#e8c84a',life:0.5}); return; }
    if(ent.kind==='building'&&ent.type==='refinery'&&mine.some(u=>u.def.harvester)){orderReturn(mine.filter(u=>u.def.harvester),ent);fxAdd({k:'marker',x:ent.x,y:ent.y,col:'#e8c84a',life:0.5});return;}
    const now=performance.now();
    if(ent.kind==='unit'&&input.lastTap.id===ent.id&&now-input.lastTap.t<350&&ent.grp){ G.sel=G.units.filter(u=>!u.dead&&u.grp===ent.grp); }   // Doppeltipp: ganzer Verband
    else if(ent.kind==='unit'&&input.lastTap.id===ent.id&&now-input.lastTap.t<350){
      G.sel=G.units.filter(u=>!u.dead&&u.owner===0&&u.type===ent.type&&u.x*TILE>cam.x&&u.x*TILE<cam.x+VW/cam.zoom&&u.y*TILE>cam.y&&u.y*TILE<cam.y+VH/cam.zoom);
    } else if(shift&&ent.kind==='unit'){ G.sel=G.sel.includes(ent)?G.sel.filter(s=>s!==ent):[...G.sel.filter(s=>s.kind==='unit'&&s.owner===0),ent]; }
    else G.sel=[ent];
    input.lastTap={t:now,id:ent.id}; refreshCmds(); return;
  }
  if(mine.length){ command(ent,w,mine); return; }
  G.sel = ent?[ent]:[]; refreshCmds();
}
/** Straße: Startpunkt antippen, dann Endpunkt – der Weg wird geplant; der Endpunkt ist der nächste Start */
function roadTap(x,y){
  const s=G.roadStart;
  if(!s){ if(cancelRoad(0,x,y)){ msg('Geplantes Straßenfeld zurückgenommen.'); return; }   // geplantes Feld antippen = zurücknehmen
    if(!inMap(x,y)||!(G.road[idx(x,y)]||canPlaceRoad(0,x,y))){ msg(`Startpunkt muss auf freier Steppe, Wiese, Schlamm oder einer Straße liegen, höchstens ${CONSTRUCTION.roadRadius} Felder von eigenen Gebäuden.`,'#ffb38a'); return; }
    G.roadStart={x,y}; msg('🛣 Startpunkt gesetzt – jetzt den Endpunkt antippen.'); refreshCmds(); return; }
  if(s.x===x&&s.y===y) return;   // doppelt erkannter Tipp: nichts tun
  const n=planRoadLine(0,s.x,s.y,x,y);
  if(n<0){ msg('Kein Weg für eine Straße gefunden (Wasser, Gebäude, Rohstoffe oder zu weit von der Stadt).','#ffb38a'); return; }
  msg(n?`🛣 ${n} Straßenfeld${n===1?'':'er'} geplant – die Bauarbeiter brauchen ${n*DEF('road').cost.stone} 🪨 Stein. Weiter: nächsten Endpunkt antippen, ✕ beendet.`:'Diese Strecke ist schon Straße.', n?'#9fd88a':undefined);
  G.roadStart={x,y}; G.roadPrev=null; refreshCmds();
}
/** Atomrakete: erstes Antippen zielt, zweites Antippen an derselben Stelle startet */
function nukeTap(w){
  const a=G.nukeArm;
  if(a&&dist(a.x,a.y,w.x,w.y)<2.5&&G.t-a.t<10){ const r=launchNuke(0,a.x,a.y); G.nukeAim=false; G.nukeArm=null; G.hover=null;
    if(r!==true) msg('Start nicht möglich: '+r,'#ffb38a'); refreshCmds(); return; }
  if(G.fog&&G.vis[idx(clamp(Math.floor(w.x),0,MAP_W-1),clamp(Math.floor(w.y),0,MAP_H-1))]===0){ msg('Ziel nicht erkundet – nur aufgeklärte Gebiete können anvisiert werden.','#ffb38a'); return; }
  G.nukeArm={x:w.x,y:w.y,t:G.t}; G.hover={x:w.x,y:w.y};
  const own=G.buildings.some(b=>!b.dead&&b.owner===0&&dist(b.x,b.y,w.x,w.y)<NUKE.radius+1);
  msg(`☢ Ziel markiert.${own?' ⚠ EIGENE GEBÄUDE IM SPRENGRADIUS!':''} Zum Start dieselbe Stelle noch einmal antippen – ✕ bricht ab.`,'#ff8a7a'); refreshCmds();
}
export function command(ent,w,mine){
  if(ent&&ent.owner===1&&ent.type==='hq'&&mine.some(u=>u.def.diplomat)&&!hostile(0,1)){ const n=sendDiplomats(mine,ent); fxAdd({k:'marker',x:ent.x,y:ent.y,col:'#e8d27a',life:0.6}); msg(`🎩 ${n} Diplomat${n===1?'':'en'} unterwegs zu ${G.players[1].name}.`); return; }
  if(ent&&ent.owner!==0){
    if(hostile(0,ent.owner)){ orderAttack(mine,ent); fxAdd({k:'marker',x:ent.x,y:ent.y,col:'#ff5a4a',life:0.5}); return; }
    const r=G.rel[0][ent.owner];
    msg(`${G.players[ent.owner].name}: ${r==='verbündet'?'verbündet':'kein Krieg'} – angreifen erst nach Kriegserklärung (🤝 Diplomatie).`,'#d6b45a');
    return;
  }
  const tile=idx(clamp(Math.floor(w.x),0,MAP_W-1),clamp(Math.floor(w.y),0,MAP_H-1));
  const trucks=mine.filter(u=>u.def.harvester), others=mine.filter(u=>!u.def.harvester);
  if(G.oil[tile]>0&&trucks.length){ orderHarvest(trucks,tile); if(others.length) orderMove(others,w.x,w.y); fxAdd({k:'marker',x:w.x,y:w.y,col:'#e8c84a',life:0.5}); return; }
  orderMove(mine,w.x,w.y); fxAdd({k:'marker',x:w.x,y:w.y,col:'#9ff07a',life:0.5});
}
export function boxSelect(b,shift){
  const a=toWorld(Math.min(b.x0,b.x1),Math.min(b.y0,b.y1)), c=toWorld(Math.max(b.x0,b.x1),Math.max(b.y0,b.y1));
  const got=G.units.filter(u=>!u.dead&&u.owner===0&&u.x>=a.x&&u.x<=c.x&&u.y>=a.y&&u.y<=c.y);
  const combat=got.filter(u=>u.def.weapon);
  const pick=combat.length?combat:got;
  G.sel = shift ? [...new Set([...myUnitsSel(),...pick])] : pick;
  G.boxMode=false; refreshCmds();
}
export function cmd(c){
  if(!G) return;
  const mine=myUnitsSel();
  if(c==='box'){G.boxMode=!G.boxMode;G.amoveMode=false;}
  else if(c==='amove'){ if(mine.length){G.amoveMode=!G.amoveMode;G.boxMode=false;G.escortMode=false;} else msg('Zuerst Einheiten auswählen.'); }
  else if(c==='cage'){ const n=upgradeCage(0,mine);
    msg(n>0?`▦ ${n} Fahrzeug${n===1?'':'e'} mit Gitterkäfig nachgerüstet ($${CAGE.cost.money} + ⛏${CAGE.cost.metal} je Fahrzeug): Drohnen richten nur noch ${Math.round(CAGE.drone*100)} % Schaden an, etwas langsamer.`:n===-1?`Käfige nur nahe einem eigenen Fahrzeugwerk (bis ${CAGE.range} Felder).`:n===-2?'Zu wenig Geld oder Metall für die Käfige.':'Alle gewählten Fahrzeuge haben schon Käfige.',n>0?'#9fd88a':'#ffb38a'); }
  else if(c==='lurk'){ const fp=mine.filter(u=>u.def.weapon&&u.def.weapon.kamikaze); const on=!fp.every(u=>u.lurk); orderLurk(fp,on);
    msg(on?`🎯 ${fp.length} FPV-Drohne${fp.length===1?'':'n'} in Lauerstellung: Sie stürzen sich auf Feinde in Sicht.`:'FPV-Drohnen halten still und greifen nur auf Befehl an.'); }
  else if(c==='patrol'){ const sc=mine.filter(u=>u.def.cls==='air'&&!(u.def.weapon&&u.def.weapon.kamikaze)); const on=!sc.every(u=>u.patrol); orderPatrol(sc,on);
    msg(on?`🛰 ${sc.length} Drohne${sc.length===1?'':'n'} auf Aufklärungsflug – sie erkunden selbstständig das Tal und laden zwischendurch zu Hause.`:'Aufklärungsflug beendet.'); }
  else if(c==='escort'){ if(mine.some(u=>u.def.weapon)){ G.escortMode=!G.escortMode; G.amoveMode=false; G.boxMode=false; if(G.escortMode) msg('🛡 Jetzt den Arbeiter oder Laster antippen, der begleitet werden soll.'); } else msg('Zuerst bewaffnete Einheiten auswählen.'); }
  else if(c==='stop'){orderStop(mine);G.amoveMode=false;}
  else if(c==='all'){G.sel=G.units.filter(u=>!u.dead&&u.owner===0&&u.def.weapon);G.amoveMode=false;}
  else if(c==='group'){ const fight=mine.filter(u=>u.def.weapon||u.def.jam);
    if(fight.length<2) msg('Für einen Verband mindestens zwei kampffähige Einheiten auswählen (Rahmen ▢ oder Doppeltipp).','#ffb38a');
    else { const g=makeGroup(0,fight), st=groupState(g); G.sel=fight;
      msg(`🎖 ${g.name} gebildet: ${fight.length} Einheiten (${st.arms.map(a=>ARM_NAME[a]).join(', ')||'–'}). ${st.combined?'Verbundene Waffen: +'+Math.round(COMBINED.dmg*100)+' % Kampfkraft, −'+Math.round(COMBINED.def*100)+' % Schaden.':'Tipp: Infanterie, Fahrzeuge, Flugabwehr und Drohnen gemischt ergeben verbundene Waffen.'} Der Knopf 🎖 links in der Befehlsleiste wählt den Verband (zweimal tippen = hinschauen), Doppeltipp auf ein Mitglied ebenso.`,'#9fd88a'); } }
  else if(c.startsWith('grp')){ const g=(G.groups||[]).find(x=>x.id===Number(c.slice(3))); if(g){ const ms=members(g);
    const same=G.sel.length===ms.length&&ms.every(u=>G.sel.includes(u));
    if(same&&ms.length){ const s=groupState(g); centerOn(s.cx,s.cy); } else G.sel=ms; G.amoveMode=false; G.orderMode=null; } }
  else if(c==='desel'){G.sel=[];G.amoveMode=false;G.boxMode=false;G.escortMode=false;G.placing=null;G.orderMode=null;G.orderPending=null;G.nukeAim=false;G.nukeArm=null;G.roadStart=null;}
  else if(c==='nuke'){ const b=selBuilding(); if(b&&b.type==='silo'){ if(!(G.players[0].nukes>0)) msg('Noch keine Atomrakete fertig – im Reiter 🎓 Forschung bauen.','#ffb38a');
    else { G.nukeAim=!G.nukeAim; G.nukeArm=null; if(G.nukeAim) msg('☢ Ziel wählen: ein erkundetes Gebiet antippen. Alles im Umkreis von '+NUKE.radius+' Feldern wird vernichtet.','#ff8a7a'); } } }
  else if(c==='hold'||c==='clear'){ if(mine.length){ G.orderMode=G.orderMode===c?null:c; G.amoveMode=false; G.escortMode=false; } else msg('Zuerst Einheiten auswählen.'); }
  else if(c==='road'){ const b=selBuilding(); if(b){ const n=orderRoadTo(0,b);
    msg(n>0?`🛣 ${n} Straßenfeld${n===1?'':'er'} geplant – die Bauarbeiter brauchen ${n*DEF('road').cost.stone} 🪨 Stein dafür.`:n===0?'Schon mit Rathaus/Lagerhaus verbunden bzw. Straße bereits geplant.':'Kein Weg für eine Straße gefunden (Wasser, Gebäude oder zu weit von der Stadt).',n>0?'#9fd88a':'#ffb38a'); } }
  else if(c==='upgrade'){ const b=selOwnBuilding(); if(b){ const U=nextUpgrade(b), why=upgradeBlock(0,b);
    if(why.length) msg(`Ausbau${U?' zu '+U.name:''} nicht möglich: ${why.join(', ')}.`,'#ffb38a');
    else if(startUpgrade(0,b)) msg(`⬆ Ausbau zu ${U.name} begonnen (${U.time} s) – ${costHtml(U.cost)}. Das Gebäude arbeitet währenddessen weiter.`,'#9fd88a'); } }
  else if(c==='demolish'){ const b=selBuilding(); if(b){
    if(G.demolishArm!==b.id||G.t-(G.demolishT||-9)>3){ G.demolishArm=b.id; G.demolishT=G.t; msg(`Nochmal 🗑 tippen: ${b.def.name} ${b.site?'abbrechen (volle Erstattung)':'abreißen (30 % Erstattung)'}.`,'#ffb38a'); }
    else { G.demolishArm=null; if(demolish(0,b)) msg(`${b.def.name} ${b.site?'abgebrochen':'abgerissen'}.`); } } }
  refreshCmds();
}
/** einzelnes eigenes Gebäude in der Auswahl (auch das Rathaus) */
export function selOwnBuilding(){ const s=G.sel.filter(e=>!e.dead); return s.length===1&&s[0].kind==='building'&&s[0].owner===0?s[0]:null; }
/** einzelnes eigenes Gebäude in der Auswahl (nicht das Rathaus) */
export function selBuilding(){ const s=G.sel.filter(e=>!e.dead); return s.length===1&&s[0].kind==='building'&&s[0].owner===0&&s[0].type!=='hq'?s[0]:null; }
export function refreshCmds(){
  document.querySelector('[data-c=box]').classList.toggle('on',!!(G&&G.boxMode));
  document.querySelector('[data-c=amove]').classList.toggle('on',!!(G&&G.amoveMode));
  const fight=!!G&&myUnitsSel().some(u=>u.def.weapon||u.def.cls==='air');
  { const gb=document.querySelector('#grpBtns') as HTMLElement, gs=G?groupsOf(0):[];   // Schnellwahl der Verbände
    const key=gs.map(g=>g.id+':'+members(g).length+(G.sel.length&&members(g).every(u=>G.sel.includes(u))&&G.sel.length===members(g).length?'*':'')).join(',');
    if(gb.dataset.k!==key){ gb.dataset.k=key; gb.innerHTML=gs.map(g=>{ const n=members(g).length, on=key.includes(g.id+':'+n+'*'); return `<button data-c="grp${g.id}" class="${on?'on':''}">🎖${g.n}<small>${n} Einh.</small></button>`; }).join(''); } }
  { const m=G?myUnitsSel().filter(u=>u.def.weapon||u.def.jam):[]; const one=m.length&&m[0].grp&&m.every(u=>u.grp===m[0].grp);
    document.querySelector('[data-c=group]').classList.toggle('show',m.length>=2&&!one); }
  for(const k of ['hold','clear']){ const b=document.querySelector(`[data-c=${k}]`); b.classList.toggle('show',fight); b.classList.toggle('on',!!(G&&G.orderMode===k)); }
  const sb=G&&selBuilding(), armed=!!G&&myUnitsSel().some(u=>u.def.weapon);
  document.querySelector('[data-c=escort]').classList.toggle('show',armed&&myUnitsSel().some(u=>u.def.cls!=='air'));
  const fpv=G?myUnitsSel().filter(u=>u.def.weapon&&u.def.weapon.kamikaze):[], scouts=G?myUnitsSel().filter(u=>u.def.cls==='air'&&!u.def.sortie&&!(u.def.weapon&&u.def.weapon.kamikaze)):[];
  document.querySelector('[data-c=cage]').classList.toggle('show',!!G&&myUnitsSel().some(u=>u.def.cls==='veh'&&!u.cage));
  const bl=document.querySelector('[data-c=lurk]'), bp=document.querySelector('[data-c=patrol]');
  bl.classList.toggle('show',fpv.length>0); bl.classList.toggle('on',fpv.length>0&&fpv.every(u=>u.lurk));
  bp.classList.toggle('show',scouts.length>0); bp.classList.toggle('on',scouts.length>0&&scouts.every(u=>u.patrol));
  document.querySelector('[data-c=escort]').classList.toggle('on',!!(G&&G.escortMode));
  document.querySelector('[data-c=demolish]').classList.toggle('show',!!sb);
  { const ob=G&&selOwnBuilding(), ub=document.querySelector('[data-c=upgrade]'); ub.classList.toggle('show',!!(ob&&UPGRADES[ob.type]&&!ob.site&&nextUpgrade(ob))); ub.classList.toggle('poor',!!(ob&&UPGRADES[ob.type]&&upgradeBlock(0,ob).length)); }
  document.querySelector('[data-c=demolish]').classList.toggle('warn',!!(sb&&G.demolishArm===sb.id));
  { const nb=document.querySelector('[data-c=nuke]'); nb.classList.toggle('show',!!(G&&(G.nukeAim||(sb&&sb.type==='silo'&&!sb.site)))); nb.classList.toggle('on',!!(G&&G.nukeAim)); }
  document.querySelector('[data-c=road]').classList.toggle('show',!!(sb&&!sb.site&&!sb.def.def&&(sb.eff??1)<0.97));
  updateInfo();
}
export function updateInfo(){
  const el=$('#info'); if(!G){el.textContent='';return;}
  if(G.placing&&isDefType(G.placing)){ const d=DEF(G.placing), road=FEATURES[G.placing]&&FEATURES[G.placing].road, pio=G.units.filter(u=>!u.dead&&u.owner===0&&u.def.pioneer).length;
    if(road){ el.textContent=G.roadStart?`🛣 Straße: Endpunkt antippen – der Weg wird automatisch geplant · ${DEF('road').cost.stone} 🪨 je Feld · ✕ beendet`:'🛣 Straße: Startpunkt antippen (an der Stadt oder einer Straße) · geplantes Feld antippen = zurücknehmen · ✕ beendet'; return; }
    el.textContent=`${d.name} ${road?'planen':'beauftragen'}: ${d.line?'antippen oder über die Karte ziehen':'Feld antippen'} · ${costHtml(d.cost)} je Feld · ${road?'Bauarbeiter bauen':pio?`${pio} Pionier${pio===1?'':'e'} bauen`:'⚠ keine Pioniere – in der Kaserne ausbilden'} · Plan antippen = zurücknehmen · ✕ beendet`; return; }
  if(G.placing){const pd=BUILDINGS[G.placing]; el.textContent='Platzieren: '+pd.name+(pd.needsOre?' – direkt neben Erz (gelb) tippen':pd.needsRock?' – direkt neben Felsen (gelb) tippen':pd.needsForest?' – nahe am Wald (gelb) tippen':pd.cap?' – grün = ruhig, gelb/orange = Lärm oder enge Bebauung':G.placing==='farm'?' – am besten auf grüner Wiese, mit Freiraum für Äcker':' – auf grün markiertes Feld tippen')+' · Geld jetzt, Holz/Stein beim Bauen';return;}
  if(G.nukeAim){ el.textContent=G.nukeArm?'☢ Ziel markiert – dieselbe Stelle nochmal antippen = START · ✕ Abwählen bricht ab':`☢ Atomschlag: erkundetes Ziel antippen (Radius ${NUKE.radius} Felder) · ✕ Abwählen bricht ab`; return; }
  if(G.orderPending){ const n=Object.values(G.orderPending.pick).reduce((s: number,v: any)=>s+v,0); el.textContent=`🎯 Einsatz „${ORDER_NAME[G.orderPending.kind]}“ mit ${n} Einheiten: Ziel auf der Karte antippen · ✕ Abwählen bricht ab`; return; }
  if(G.orderMode){ el.textContent=`${ORDER_NAME[G.orderMode]}: Ziel antippen – ${G.orderMode==='hold'?'Truppen ziehen hin und graben sich ein':'Truppen säubern den Umkreis und halten dann Stellung'}`; return; }
  if(G.amoveMode){el.textContent='Angriff: Ziel antippen – vorrücken und alles im Umkreis angreifen';return;}
  if(G.escortMode){el.textContent='Begleiten: eigenen Arbeiter oder Laster antippen – die Auswahl bleibt bei ihm und verteidigt ihn';return;}
  if(G.boxMode){el.textContent='Rahmen aufziehen, um Einheiten zu wählen';return;}
  const s=G.sel.filter(e=>!e.dead); if(!s.length){el.textContent='';return;}
  if(s.length===1){const e=s[0], f=G.players[e.owner];
    let t=`${e.def.name} · Zustand ${Math.ceil(e.hp)}/${e.maxHp}`+(e.owner!==0?` · ${f.short} (${G.rel[0][e.owner]})`:'');
    if(e.kind==='unit'&&e.def.weapon&&e.def.weapon.kamikaze) t+=e.lurk?' · 🎯 Lauerstellung':' · hält still (🎯 für Lauerstellung)';
    if(e.kind==='unit'&&e.def.sortie) t+=e.mode==='rtb'?' · ✈ fliegt zum Nachladen heim':e.mode==='rearm'?` · ✈ wird neu bewaffnet (${Math.ceil(e.rearmT)} s)`:' · bereit – Ziel antippen';
    if(e.kind==='unit'&&e.def.swarm) t+=` · 🐝 ${Math.max(1,Math.ceil(e.hp/AIR.swarmHp))} Drohnen`;
    if(e.kind==='unit'&&e.def.cls==='air'&&!e.def.sortie&&!(e.def.weapon&&e.def.weapon.kamikaze)) t+=e.mode==='recharge'?' · fliegt zum Laden heim':e.patrol?' · 🛰 auf Aufklärungsflug':' · (🛰 für Aufklärungsflug)';
    if(e.kind==='unit'&&e.def.armor==='airHigh'&&e.owner===0) t+=' · getarnt – nur Radar der Flugabwehr entdeckt sie';
    if(e.kind==='unit'&&e.cage) t+=' · ▦ Gitterkäfig';
    if(e.kind==='unit'&&e.jammed) t+=' · 📡 gestört!';
    if(e.kind==='unit'&&e.def.diplomat) t+=e.mission!==undefined&&e.mission!==null?' · auf dem Weg zur Botschaft':' · Rathaus Kastrovas antippen, um eine Botschaft zu eröffnen';
    if(e.kind==='unit'&&e.def.caravan) t+=` · Ladung ${e.cargoAmt} ${RES[e.cargoRes].icon} → ${G.players[e.dest?e.dest.owner:0].short}`;
    if(e.kind==='unit'&&e.def.pioneer) t+=e.clearing?' · räumt eine Mine':e.working?' · baut':e.pjob?' · auf dem Weg zum Bauplatz':' · wartet auf Aufträge (Verteidigung planen)';
    if(e.kind==='unit'&&e.order) t+=` · ${ORDER_NAME[e.order]}${e.order==='hold'?(e.dug?' (eingegraben 🛡)':' (gräbt sich ein …)'):''}`;
    if(e.kind==='unit'&&e.mode==='escort'&&e.escort) t+=` · 🛡 begleitet ${e.escort.def.name}`;
    if(e.kind==='building'&&e.type==='camp') t+=' · Räuber greifen alles in der Umgebung an. Zerstören bringt Beute.';
    if(e.kind==='unit'&&e.def.battery) t+=` · Akku ${Math.round((e.battery??e.def.battery)/e.def.battery*100)} %`;
    if(e.kind==='building'&&e.readyT&&G.t<e.readyT) t+=` · im Bau (${Math.ceil(e.readyT-G.t)} s)`;
    if(e.kind==='building'&&e.site){ const n=siteWorkers(e), lk=siteLacks(e); t=`🏗 Baustelle: ${e.def.name} · ${Math.floor((e.progress||0)*100)} % · ${lk?'⚠ wartet auf '+RES[lk].name:n?n+' Arbeiter am Werk':'Arbeiter bringen Material'} · `+siteStock(e).map(s=>`${RES[s.m].icon} ${Math.floor(s.have)}/${s.need}`).join(' ')+(e.owner===0?' · Arbeiter wählen und Baustelle antippen schickt sie hin':''); el.textContent=t; return; }
    if(e.kind==='unit'&&e.def.worker) t+=(e.working?' · arbeitet':e.job?(e.job.kind==='haul'||e.job.kind==='road'&&e.job.phase==='fetch'?' · holt Material':' · auf dem Weg zur Arbeit'):' · wartet auf Aufträge')+(e.carry?` · trägt ${Math.floor(e.carry.amt)} ${RES[e.carry.res].icon}`:'');
    if(e.kind==='building'&&e.haul!==undefined&&(e.def.wood||e.def.stone||e.def.metal||e.type==='farm')) t+=` · Transportweg ${e.haul===Infinity?'–':f1(e.haul)} → Leistung ${Math.round((e.eff??1)*100)} %`+((e.eff??1)<0.97&&e.owner===0?' (🛣 Straße oder Lagerhaus in der Nähe hilft)':'');
    if(e.kind==='building'&&e.fire>0) t+=' · 🔥 brennt!';
    if(e.kind==='building'&&e.contam) t+=' · ☢ verstrahlt – steht still, bis die Strahlung abklingt';
    if(e.kind==='building'&&e.type==='farm'&&e.fields!==undefined) t+=` · Äcker ${e.fields}/${DENSITY.farmFields} (Ertrag ${Math.round((e.fieldF??1)*100)} %)`;
    if(e.kind==='building'&&e.type==='lumber') t+=e.empty?' · kein Wald mehr':'';
    if(e.kind==='building'&&e.type==='quarry') t+=e.empty?' · erschöpft':' · Stein übrig: '+fmt(e.rockTiles.reduce((s,i)=>s+G.rock[i],0));
    if(e.kind==='building'&&e.def.refine) t+=` · Rohöltank ${Math.floor(e.crude||0)}/${e.def.tank} · verarbeitet ${e.def.refine} Öl/s`;
    if(e.kind==='unit'&&e.def.harvester&&e.waiting) t+=' · wartet: Raffinerie-Tank voll';
    if(e.kind==='unit'&&e.def.harvester) t+=` · Ladung ${Math.floor(e.cargo)}/${e.def.harvester.cap} Öl`;
    if(e.owner===0&&e.def.desc) t+=' · '+e.def.desc;
    if(e.def.weapon) t+=' · '+WEAPON_INFO[e.def.weapon.type];
    if(e.kind==='building'&&e.def.cap&&e.quality!==undefined) t+=` · Bewohner ${Math.floor(e.resid||0)}/${capOf(e)} · Wohnqualität ${Math.round(e.quality*100)} %`+(e.noiseSrc&&e.noiseSrc.length?` (Lärm: ${e.noiseSrc.join(', ')})`:'');
    if(e.kind==='building'&&UPGRADES[e.type]&&!e.site){ const U=nextUpgrade(e); t+=` · Stufe ${lvlOf(e)}/${UPGRADES[e.type].length}`+(e.upg?` · ⬆ Ausbau ${Math.floor(e.upg.t/e.upg.time*100)} %`:U&&e.owner===0?` · ⬆ nächste Stufe ${U.name}: ${upgradeEffect(e.type,U)} für ${costHtml(U.cost)}${U.research&&!G.players[0].done[U.research]?' (braucht Forschung)':''}`:''); }
    if(e.kind==='building'&&e.type==='silo'&&e.owner===0) t+=` · ☢ ${G.players[0].nukes||0} Rakete${G.players[0].nukes===1?'':'n'} bereit`+(G.players[0].q.silo.length?` · Bau ${Math.floor(G.players[0].q.silo[0].t/G.players[0].q.silo[0].time*100)} %`:'');
    if(e.kind==='building'&&e.type==='mine') t+=e.empty?' · erschöpft':' · Erz übrig: '+fmt(e.oreTiles.reduce((s,i)=>s+G.ore[i],0));
    el.textContent=t; return;}
  { const gid=s[0].grp, g=gid&&(G.groups||[]).find(x=>x.id===gid);   // ganzer Verband gewählt
    if(g&&s.every(e=>e.grp===gid)){ const st=groupState(g), cnt={}; for(const e of st.ms) cnt[e.def.name.replace(/\u00AD/g,'')]=(cnt[e.def.name.replace(/\u00AD/g,'')]||0)+1;
      const hp=st.ms.reduce((a,u)=>a+u.hp,0)/Math.max(1,st.ms.reduce((a,u)=>a+u.maxHp,0));
      el.textContent=`🎖 ${g.name} · ${Object.entries(cnt).map(([k,v])=>v+'× '+k).join(', ')} · Zustand ${Math.round(hp*100)} % · ${st.combined?`⭐ verbundene Waffen (${st.arms.map(a=>ARM_NAME[a]).join(' + ')}): +${Math.round(COMBINED.dmg*100)} % Kampfkraft, −${Math.round(COMBINED.def*100)} % Schaden`:'keine verbundenen Waffen – Gattungen mischen und beisammenhalten'} · marschiert im Tempo der Langsamsten`; return; } }
  const cnt={}; for(const e of s) cnt[e.def.name]=(cnt[e.def.name]||0)+1;
  el.textContent=Object.entries(cnt).map(([k,v])=>v+'× '+k).join(', ');
}
export const miniPtr=e=>{ if(!G) return; const r=mini.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width*MAP_W, y=(e.clientY-r.top)/r.height*MAP_H;
  cam.x=x*TILE-VW/cam.zoom/2; cam.y=y*TILE-VH/cam.zoom/2; clampCam(); };

export function init(){
cv.addEventListener('pointerdown',e=>{
  if(!G) return; cv.setPointerCapture(e.pointerId);
  input.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(input.pts.size===2){const [a,b]=[...input.pts.values()]; input.pinch={d:dist(a.x,a.y,b.x,b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2}; input.drag=null; input.box=null; return;}
  if(input.pts.size>2) return;
  const mouse=e.pointerType==='mouse';
  const paint = G.placing&&DEF(G.placing).line&&(!mouse||e.button===0);
  const mode = paint?'paint' : mouse ? (e.button===0?'box':'pan') : (G.boxMode?'box':'pan');
  G.lastPaint=-1;
  input.drag={x0:e.clientX,y0:e.clientY,lx:e.clientX,ly:e.clientY,moved:false,mode,button:e.button,shift:e.shiftKey,mouse};
});
cv.addEventListener('pointermove',e=>{
  if(!G) return;
  if(e.pointerType==='mouse') G.hover=toWorld(e.clientX,e.clientY);
  if(!input.pts.has(e.pointerId)) return;
  input.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(input.pinch&&input.pts.size===2){const [a,b]=[...input.pts.values()];const d=dist(a.x,a.y,b.x,b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    zoomAt(mx,my,cam.zoom*d/input.pinch.d); cam.x-=(mx-input.pinch.mx)/cam.zoom; cam.y-=(my-input.pinch.my)/cam.zoom; clampCam();
    input.pinch={d,mx,my}; return;}
  const dr=input.drag; if(!dr) return;
  if(!dr.moved&&dist(e.clientX,e.clientY,dr.x0,dr.y0)>(dr.mouse?5:10)) dr.moved=true;
  if(dr.moved){
    if(dr.mode==='pan'){cam.x-=(e.clientX-dr.lx)/cam.zoom;cam.y-=(e.clientY-dr.ly)/cam.zoom;clampCam();}
    else if(dr.mode==='paint'){ // alle Felder zwischen letzter und aktueller Position belegen
      const a=toWorld(dr.lx,dr.ly), b=toWorld(e.clientX,e.clientY), n=Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*2)+1;
      for(let k=0;k<=n;k++){ const x=Math.floor(lerp(a.x,b.x,k/n)), y=Math.floor(lerp(a.y,b.y,k/n)); if(inMap(x,y)&&idx(x,y)!==G.lastPaint){ G.lastPaint=idx(x,y); placeDefense(0,G.placing,x,y); } } }
    else input.box={x0:dr.x0,y0:dr.y0,x1:e.clientX,y1:e.clientY};
  }
  dr.lx=e.clientX; dr.ly=e.clientY;
});
cv.addEventListener('pointerup',endPtr); cv.addEventListener('pointercancel',e=>{input.pts.delete(e.pointerId);input.drag=null;input.box=null;input.pinch=null;});
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('wheel',e=>{e.preventDefault();if(G)zoomAt(e.clientX,e.clientY,cam.zoom*Math.exp(-e.deltaY*0.0015));},{passive:false});
addEventListener('keydown',e=>{ if(!G) return; input.keys.add(e.key.toLowerCase());
  const k=e.key.toLowerCase();
  if(k==='escape'){G.placing=null;G.roadStart=null;G.amoveMode=false;G.orderMode=null;G.orderPending=null;G.sel=[];refreshCmds();}
  if(k==='s'&&!e.repeat) cmd('stop');
  if(k==='a'&&!e.repeat) cmd('amove');
});
addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>input.keys.clear());
$$('#cmds button').forEach(b=>b.addEventListener('click',()=>cmd(b.dataset.c)));
$('#grpBtns').addEventListener('click',e=>{ const b=(e.target as HTMLElement).closest('button') as HTMLElement; if(b) cmd(b.dataset.c); });
mini.addEventListener('pointerdown',e=>{mini.setPointerCapture(e.pointerId);miniPtr(e);});
mini.addEventListener('pointermove',e=>{if(mini.hasPointerCapture(e.pointerId))miniPtr(e);});
}

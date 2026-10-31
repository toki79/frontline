import { $$ } from './dom';
import { clamp, dist, fmt, idx, inMap, lerp } from '../core/util';
import { BUILDINGS, CONSTRUCTION, DEF, DEF_RADIUS, DENSITY, FEATURES, MAP_H, MAP_W, RES, TILE, isDefType } from '../data/config';
import { VH, VW, cam, clampCam, toWorld, zoomAt } from '../render/camera';
import { lacking } from '../sim/costs';
import { orderAttack, orderEscort, orderHarvest, orderMove, orderReturn, orderStop } from '../sim/orders';
import { placeDefense, placeSite } from '../sim/production';
import { assignWorkers, cancelRoad, demolish, orderRoadTo, siteLacks, siteStock, siteWorkers } from '../sim/build';
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
  if(G.placing&&isDefType(G.placing)){
    if(right){G.placing=null;refreshCmds();return;}
    const x=Math.floor(w.x), y=Math.floor(w.y), road=FEATURES[G.placing]&&FEATURES[G.placing].road;
    if(road&&cancelRoad(0,x,y)){ G.lastPaint=idx(x,y); return; }   // geplantes Straßenfeld antippen = zurücknehmen
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
  if(G.amoveMode&&mine.length){ orderMove(mine,w.x,w.y,'amove'); fxAdd({k:'marker',x:w.x,y:w.y,col:'#ff7a5a',life:0.5}); G.amoveMode=false; refreshCmds(); return; }
  if(ent&&ent.owner===0){
    if(ent.kind==='building'&&ent.site&&mine.some(u=>u.def.worker)){ assignWorkers(mine,ent); fxAdd({k:'marker',x:ent.x,y:ent.y,col:'#e8c84a',life:0.5}); return; }
    if(ent.kind==='building'&&ent.type==='refinery'&&mine.some(u=>u.def.harvester)){orderReturn(mine.filter(u=>u.def.harvester),ent);fxAdd({k:'marker',x:ent.x,y:ent.y,col:'#e8c84a',life:0.5});return;}
    const now=performance.now();
    if(ent.kind==='unit'&&input.lastTap.id===ent.id&&now-input.lastTap.t<350){
      G.sel=G.units.filter(u=>!u.dead&&u.owner===0&&u.type===ent.type&&u.x*TILE>cam.x&&u.x*TILE<cam.x+VW/cam.zoom&&u.y*TILE>cam.y&&u.y*TILE<cam.y+VH/cam.zoom);
    } else if(shift&&ent.kind==='unit'){ G.sel=G.sel.includes(ent)?G.sel.filter(s=>s!==ent):[...G.sel.filter(s=>s.kind==='unit'&&s.owner===0),ent]; }
    else G.sel=[ent];
    input.lastTap={t:now,id:ent.id}; refreshCmds(); return;
  }
  if(mine.length){ command(ent,w,mine); return; }
  G.sel = ent?[ent]:[]; refreshCmds();
}
export function command(ent,w,mine){
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
  else if(c==='escort'){ if(mine.some(u=>u.def.weapon)){ G.escortMode=!G.escortMode; G.amoveMode=false; G.boxMode=false; if(G.escortMode) msg('🛡 Jetzt den Arbeiter oder Laster antippen, der begleitet werden soll.'); } else msg('Zuerst bewaffnete Einheiten auswählen.'); }
  else if(c==='stop'){orderStop(mine);G.amoveMode=false;}
  else if(c==='all'){G.sel=G.units.filter(u=>!u.dead&&u.owner===0&&u.def.weapon);G.amoveMode=false;}
  else if(c==='desel'){G.sel=[];G.amoveMode=false;G.boxMode=false;G.escortMode=false;G.placing=null;}
  else if(c==='road'){ const b=selBuilding(); if(b){ const n=orderRoadTo(0,b);
    msg(n>0?`🛣 ${n} Straßenfeld${n===1?'':'er'} geplant – die Bauarbeiter brauchen ${n*DEF('road').cost.stone} 🪨 Stein dafür.`:n===0?'Schon mit Rathaus/Lagerhaus verbunden bzw. Straße bereits geplant.':'Kein Weg für eine Straße gefunden (Wasser, Gebäude oder zu weit von der Stadt).',n>0?'#9fd88a':'#ffb38a'); } }
  else if(c==='demolish'){ const b=selBuilding(); if(b){
    if(G.demolishArm!==b.id||G.t-(G.demolishT||-9)>3){ G.demolishArm=b.id; G.demolishT=G.t; msg(`Nochmal 🗑 tippen: ${b.def.name} ${b.site?'abbrechen (volle Erstattung)':'abreißen (30 % Erstattung)'}.`,'#ffb38a'); }
    else { G.demolishArm=null; if(demolish(0,b)) msg(`${b.def.name} ${b.site?'abgebrochen':'abgerissen'}.`); } } }
  refreshCmds();
}
/** einzelnes eigenes Gebäude in der Auswahl (nicht das Rathaus) */
export function selBuilding(){ const s=G.sel.filter(e=>!e.dead); return s.length===1&&s[0].kind==='building'&&s[0].owner===0&&s[0].type!=='hq'?s[0]:null; }
export function refreshCmds(){
  document.querySelector('[data-c=box]').classList.toggle('on',!!(G&&G.boxMode));
  document.querySelector('[data-c=amove]').classList.toggle('on',!!(G&&G.amoveMode));
  const sb=G&&selBuilding(), armed=!!G&&myUnitsSel().some(u=>u.def.weapon);
  document.querySelector('[data-c=escort]').classList.toggle('show',armed);
  document.querySelector('[data-c=escort]').classList.toggle('on',!!(G&&G.escortMode));
  document.querySelector('[data-c=demolish]').classList.toggle('show',!!sb);
  document.querySelector('[data-c=demolish]').classList.toggle('warn',!!(sb&&G.demolishArm===sb.id));
  document.querySelector('[data-c=road]').classList.toggle('show',!!(sb&&!sb.site&&!sb.def.def&&(sb.eff??1)<0.97));
  updateInfo();
}
export function updateInfo(){
  const el=$('#info'); if(!G){el.textContent='';return;}
  if(G.placing&&isDefType(G.placing)){ const d=DEF(G.placing); el.textContent=`${d.name} bauen: ${d.line?'antippen oder über die Karte ziehen':'Feld antippen'} · ${costHtml(d.cost)} je Feld · ✕ Abwählen beendet`; return; }
  if(G.placing){const pd=BUILDINGS[G.placing]; el.textContent='Platzieren: '+pd.name+(pd.needsOre?' – direkt neben Erz (gelb) tippen':pd.needsRock?' – direkt neben Felsen (gelb) tippen':pd.needsForest?' – nahe am Wald (gelb) tippen':pd.cap?' – grün = ruhig, gelb/orange = Lärm oder enge Bebauung':G.placing==='farm'?' – am besten auf grüner Wiese, mit Freiraum für Äcker':' – auf grün markiertes Feld tippen')+' · Geld jetzt, Holz/Stein beim Bauen';return;}
  if(G.amoveMode){el.textContent='Angriffsbewegung: Ziel antippen';return;}
  if(G.escortMode){el.textContent='Begleiten: eigenen Arbeiter oder Laster antippen – die Auswahl bleibt bei ihm und verteidigt ihn';return;}
  if(G.boxMode){el.textContent='Rahmen aufziehen, um Einheiten zu wählen';return;}
  const s=G.sel.filter(e=>!e.dead); if(!s.length){el.textContent='';return;}
  if(s.length===1){const e=s[0], f=G.players[e.owner];
    let t=`${e.def.name} · Zustand ${Math.ceil(e.hp)}/${e.maxHp}`+(e.owner!==0?` · ${f.short} (${G.rel[0][e.owner]})`:'');
    if(e.kind==='unit'&&e.mode==='escort'&&e.escort) t+=` · 🛡 begleitet ${e.escort.def.name}`;
    if(e.kind==='building'&&e.type==='camp') t+=' · Räuber greifen alles in der Umgebung an. Zerstören bringt Beute.';
    if(e.kind==='unit'&&e.def.battery) t+=` · Akku ${Math.round((e.battery??e.def.battery)/e.def.battery*100)} %`;
    if(e.kind==='building'&&e.readyT&&G.t<e.readyT) t+=` · im Bau (${Math.ceil(e.readyT-G.t)} s)`;
    if(e.kind==='building'&&e.site){ const n=siteWorkers(e), lk=siteLacks(e); t=`🏗 Baustelle: ${e.def.name} · ${Math.floor((e.progress||0)*100)} % · ${lk?'⚠ wartet auf '+RES[lk].name:n?n+' Arbeiter am Werk':'Arbeiter bringen Material'} · `+siteStock(e).map(s=>`${RES[s.m].icon} ${Math.floor(s.have)}/${s.need}`).join(' ')+(e.owner===0?' · Arbeiter wählen und Baustelle antippen schickt sie hin':''); el.textContent=t; return; }
    if(e.kind==='unit'&&e.def.worker) t+=(e.working?' · arbeitet':e.job?(e.job.kind==='haul'||e.job.kind==='road'&&e.job.phase==='fetch'?' · holt Material':' · auf dem Weg zur Arbeit'):' · wartet auf Aufträge')+(e.carry?` · trägt ${Math.floor(e.carry.amt)} ${RES[e.carry.res].icon}`:'');
    if(e.kind==='building'&&e.haul!==undefined&&(e.def.wood||e.def.stone||e.def.metal||e.type==='farm')) t+=` · Transportweg ${e.haul===Infinity?'–':f1(e.haul)} → Leistung ${Math.round((e.eff??1)*100)} %`+((e.eff??1)<0.97&&e.owner===0?' (🛣 Straße oder Lagerhaus in der Nähe hilft)':'');
    if(e.kind==='building'&&e.fire>0) t+=' · 🔥 brennt!';
    if(e.kind==='building'&&e.type==='farm'&&e.fields!==undefined) t+=` · Äcker ${e.fields}/${DENSITY.farmFields} (Ertrag ${Math.round((e.fieldF??1)*100)} %)`;
    if(e.kind==='building'&&e.type==='lumber') t+=e.empty?' · kein Wald mehr':'';
    if(e.kind==='building'&&e.type==='quarry') t+=e.empty?' · erschöpft':' · Stein übrig: '+fmt(e.rockTiles.reduce((s,i)=>s+G.rock[i],0));
    if(e.kind==='building'&&e.def.refine) t+=` · Rohöltank ${Math.floor(e.crude||0)}/${e.def.tank} · verarbeitet ${e.def.refine} Öl/s`;
    if(e.kind==='unit'&&e.def.harvester&&e.waiting) t+=' · wartet: Raffinerie-Tank voll';
    if(e.kind==='unit'&&e.def.harvester) t+=` · Ladung ${Math.floor(e.cargo)}/${e.def.harvester.cap} Öl`;
    if(e.owner===0&&e.def.desc) t+=' · '+e.def.desc;
    if(e.def.weapon) t+=' · '+WEAPON_INFO[e.def.weapon.type];
    if(e.kind==='building'&&e.def.cap&&e.quality!==undefined) t+=` · Bewohner ${Math.floor(e.resid||0)}/${e.def.cap} · Wohnqualität ${Math.round(e.quality*100)} %`+(e.noiseSrc&&e.noiseSrc.length?` (Lärm: ${e.noiseSrc.join(', ')})`:'');
    if(e.kind==='building'&&e.type==='mine') t+=e.empty?' · erschöpft':' · Erz übrig: '+fmt(e.oreTiles.reduce((s,i)=>s+G.ore[i],0));
    el.textContent=t; return;}
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
  if(k==='escape'){G.placing=null;G.amoveMode=false;G.sel=[];refreshCmds();}
  if(k==='s'&&!e.repeat) cmd('stop');
  if(k==='a'&&!e.repeat) cmd('amove');
});
addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>input.keys.clear());
$$('#cmds button').forEach(b=>b.addEventListener('click',()=>cmd(b.dataset.c)));
mini.addEventListener('pointerdown',e=>{mini.setPointerCapture(e.pointerId);miniPtr(e);});
mini.addEventListener('pointermove',e=>{if(mini.hasPointerCapture(e.pointerId))miniPtr(e);});
}

import { idx, inMap } from '../core/util';
import { BUILDINGS, BUILD_RADIUS, DEF, DEF_RADIUS, ECON, EMERGENCY, FEATURES, FORT, hasTech, isDefType, isPlain, NUKE, RESEARCH, RESEARCH_SPEED, T, TECH_UNLOCKS, TERRAIN, UNITS } from '../data/config';
import { canAfford, pay } from '../sim/costs';
import { G } from '../sim/state';
import { findBuilding, placeBuilding, rectDist, ringTiles, spawnUnit } from '../sim/world';
import { canPlaceRoad, findWorking, forestTilesNear, hasRockNear, planRoad } from '../sim/build';
import { msg } from '../core/events';

/* =====================================================================
   Produktion: Einheiten (Rathaus, Kaserne, Werk, Werkstatt) und Forschung.
   Gebäude haben keine Warteschlange – sie werden als Baustelle gesetzt.
   ===================================================================== */
export function queueName(type){return RESEARCH[type]?'research':BUILDINGS[type]||FEATURES[type]?null:UNITS[type].prod;}
export function missingReq(pid,type){
  const d=DEF(type), miss=[];
  // Verteidigung bauen Pioniere aus der Kaserne; Straßen und Gebäude das Rathaus
  const prod = RESEARCH[type] ? 'university' : (isDefType(type)&&!(FEATURES[type]&&FEATURES[type].road)) ? 'barracks' : (BUILDINGS[type]||FEATURES[type]) ? 'hq' : d.prod;
  if(!prod) return ['—'];
  if(!findBuilding(pid,prod)) miss.push(BUILDINGS[prod].name);
  for(const r of (d.req||[])) if(!findBuilding(pid,r)) miss.push(BUILDINGS[r].name);
  const p=G.players[pid];
  if(d.tech&&p.tech<d.tech) miss.push(`Universität Stufe ${d.tech}`);
  if(d.emergency&&!emergency(pid)) miss.push('Angriff auf die Stadt oder Krieg');
  if(d.emergency&&G.units.filter(u=>!u.dead&&u.owner===pid&&u.type===type).length>=EMERGENCY.maxVolunteers) miss.push(`höchstens ${EMERGENCY.maxVolunteers} Trupps`);
  if(d.research&&!hasTech(p,d.research)) miss.push(`Forschung „${RESEARCH[d.research].name}“`);
  if(RESEARCH[type]){ for(const n of (d.need||[])) if(!hasTech(p,n)) miss.push(RESEARCH[n].name);
    for(const b of (d.needB||[])) if(!findBuilding(pid,b)) miss.push(BUILDINGS[b].name); }
  return miss;
}
/** Notstand: Stadt kürzlich angegriffen oder Krieg */
export const emergency = pid => G.war&&pid<2 || !!(G.players[pid].lastAttack&&G.t-G.players[pid].lastAttack.t<EMERGENCY.window);
export const available=(pid,type)=>missingReq(pid,type).length===0;
export function enqueue(pid,type){
  const p=G.players[pid], qn=queueName(type), q=p.q[qn]; if(!q) return false;
  if(!available(pid,type)||!canAfford(pid,type)) return false;
  if(qn==='research'&&(q.length||hasTech(p,type))) return false;
  if(qn==='silo'&&(q.length||(p.nukes||0)>=NUKE.maxStock)) return false;
  if(q.length>=(qn==='factory'?2:qn==='droneshop'?3:6)) return false;   // Fahrzeuge nur in kleinen Stückzahlen vorbestellen
  pay(pid,type,1); q.push({type,t:0,time:DEF(type).time}); return true;
}
export function cancelItem(pid,type){
  const p=G.players[pid], q=p.q[queueName(type)]; if(!q) return false;
  for(let i=q.length-1;i>=0;i--) if(q[i].type===type){pay(pid,type,-1);q.splice(i,1);return true;}
  return false;
}
export function updateProduction(pid,dt){
  const p=G.players[pid], f=(p.use>p.power?0.5:1)*(p.broke?ECON.brokeFactor:1)*(hasTech(p,'ai')?1+RESEARCH_SPEED.ai:1);
  for(const qn of ['hq','kontor','barracks','factory','droneshop','silo','research']){
    const q=p.q[qn]; if(!q||!q.length) continue;
    const producer=findWorking(pid, qn==='research'?'university':qn); if(!producer) continue;
    const it=q[0];
    let ff=UNITS[it.type]&&UNITS[it.type].emergency?1:f;   // Bürgerwehr: Freiwillige brauchen kein Geld
    if(qn==='research'){ ff*=1+RESEARCH_SPEED.datacenter*Math.min(RESEARCH_SPEED.maxDatacenters,G.buildings.filter(b=>b.owner===pid&&b.type==='datacenter'&&!b.dead&&!b.site).length);   // Rechenzentren
      const R=RESEARCH[it.type]; if(R.power&&p.use>p.power) ff=0; it.stalled=ff===0?'⚡ Strommangel – steht still':''; }   // KI und Atomprogramm: nur mit genug Strom
    if(qn==='silo'){ if(!findWorking(pid,'enrich')) ff=0; it.stalled=ff===0?'Anreicherungsanlage arbeitet nicht':''; }
    it.t+=dt*ff;
    if(it.t>=it.time){
      if(qn==='research'){ const R=RESEARCH[it.type]; q.shift(); p.done=p.done||{}; p.done[it.type]=true; if(R.level) p.tech=Math.max(p.tech,R.level);
        const what=R.level?`Stufe ${R.level}: ${TECH_UNLOCKS[R.level]}`:`${R.name}: ${R.desc}`;
        if(pid===0) msg(`${R.icon||'🎓'} Erforscht – ${what}.`,'#9fd88a');
        else if(G.known[0][1]&&(R.level||it.type==='bomb'||it.type==='ai'||it.type==='physics')) msg(it.type==='bomb'?'☢ Geheimdienst: Kastrova betreibt ein Atomwaffenprogramm!':`Geheimdienst: Kastrova hat „${R.name}“ erforscht.`,it.type==='bomb'?'#ff8a7a':'#d6b45a'); }
      else if(UNITS[it.type].stored){ q.shift(); p.nukes=(p.nukes||0)+1;
        if(pid===0) msg('☢ Eine Atomrakete ist einsatzbereit. Schon ihr Besitz schreckt Kastrova ab.','#ffd36a');
        else if(G.known[0][1]) msg('☢☢ Geheimdienst: Kastrova besitzt jetzt eine Atomrakete!','#ff8a7a'); }
      else if(spawnUnit(pid,it.type,producer)){q.shift();}
      else it.t=it.time;
    }
  }
}
export function tileFree(i){return !(G.fallMap&&G.fallMap[i])&&TERRAIN[G.terr[i]].build&&G.oil[i]<=0&&G.ore[i]<=0&&G.rock[i]<=0&&!G.road[i]&&!G.occ[i];}
export function nearOwn(pid,tx,ty,w,h){
  for(const b of G.buildings){ if(b.dead||b.owner!==pid) continue;
    const dx=Math.max(b.tx-(tx+w), tx-(b.tx+b.w), 0), dy=Math.max(b.ty-(ty+h), ty-(b.ty+b.h), 0);
    if(Math.max(dx,dy)<=BUILD_RADIUS) return true; }
  return false;
}
export function canPlace(pid,type,tx,ty){
  const d=BUILDINGS[type];
  for(let y=ty;y<ty+d.h;y++)for(let x=tx;x<tx+d.w;x++){ if(!inMap(x,y)||!tileFree(idx(x,y))) return false; }
  if(d.needsOre&&!ringTiles(tx,ty,d.w,d.h).some(i=>G.ore[i]>0)) return false;
  if(d.needsRock&&!hasRockNear(tx,ty,d.w,d.h)) return false;
  if(d.needsForest&&forestTilesNear(tx,ty,d.w,d.h).length<3) return false;
  return nearOwn(pid,tx,ty,d.w,d.h);
}
export function tileBuildable(pid,x,y){ return tileFree(idx(x,y)) && nearOwn(pid,x,y,1,1); }
// Verteidigung: direkt auf der Karte bauen (ohne Rathaus-Warteschlange)
export function canPlaceDef(pid,type,x,y){
  if(FEATURES[type]&&FEATURES[type].road) return canPlaceRoad(pid,x,y);
  const d=BUILDINGS[type], w=d?d.w:1, h=d?d.h:1;
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
    if(!inMap(xx,yy)) return false; const i=idx(xx,yy), t=G.terr[i];
    if(t===T.WATER||t===T.BRIDGE||(G.fallMap&&G.fallMap[i])||G.occ[i]||G.oil[i]>0||G.ore[i]>0||G.rock[i]>0||G.road[i]||G.fplan[i]) return false;
    if(FEATURES[type]){ if(G.feat[i]) return false; if(type==='trench'&&!isPlain(t)&&t!==T.MUD) return false; }
    else { if(!TERRAIN[t].build||G.feat[i]) return false; for(const u of G.units) if(!u.dead&&u.def.cls!=='air'&&Math.floor(u.x)===xx&&Math.floor(u.y)===yy&&u.owner!==pid) return false; } }
  if(d&&d.border){   // Grenzbunker: weit draußen erlaubt, aber nur auf erkundetem Land und nicht direkt am Gegner
    if(pid===0&&G.fog&&G.vis[idx(x,y)]===0) return false;
    for(const b of G.buildings) if(!b.dead&&b.owner!==pid&&b.owner<=2&&rectDist(b,x,y,w,h)<FORT.enemyGap) return false;
    for(const b of G.buildings) if(!b.dead&&b.owner===pid&&!b.def.def&&rectDist(b,x,y,w,h)<=FORT.borderR) return true;
    return false; }
  for(const b of G.buildings) if(!b.dead&&b.owner===pid&&(!b.def.def||b.def.border)&&rectDist(b,x,y,w,h)<=DEF_RADIUS) return true;   // auch rund um eigene Grenzbunker
  return false;
}
/** Verteidigung beauftragen: wird bezahlt und als Plan bzw. Baustelle gesetzt – Pioniere bauen es vor Ort */
export function placeDefense(pid,type,x,y){
  if(FEATURES[type]&&FEATURES[type].road) return !missingReq(pid,type).length&&planRoad(pid,x,y);
  if(!canPlaceDef(pid,type,x,y)||missingReq(pid,type).length||!canAfford(pid,type)) return false;
  pay(pid,type,1);
  if(FEATURES[type]){ const i=idx(x,y); G.fplan[i]=FEATURES[type].id; G.fplanOwner[i]=pid+1; }
  else { const b=placeBuilding(pid,type,x,y,false,true); b.pio=true; }
  return true;
}
/** geplantes Verteidigungsfeld zurücknehmen (volle Erstattung) */
export function cancelDefPlan(pid,x,y){
  if(!inMap(x,y)) return false; const i=idx(x,y);
  if(!G.fplan[i]||G.fplanOwner[i]!==pid+1) return false;
  const k=Object.keys(FEATURES).find(k=>FEATURES[k].id===G.fplan[i]&&!FEATURES[k].road); if(k) pay(pid,k,-1);
  G.fplan[i]=0; G.fplanOwner[i]=0; return true;
}
/** Baustelle beauftragen: Kosten werden sofort bezahlt, Bauarbeiter erledigen den Rest. */
export function placeSite(pid,type,tx,ty){
  if(!BUILDINGS[type]||BUILDINGS[type].def||!canPlace(pid,type,tx,ty)||missingReq(pid,type).length||!canAfford(pid,type)) return null;
  G.players[pid].res.money-=BUILDINGS[type].cost.money||0;   // Holz, Stein, Metall holen die Arbeiter erst beim Bauen
  return placeBuilding(pid,type,tx,ty,false,true);
}

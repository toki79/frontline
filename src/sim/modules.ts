import { MODULES, UNITS, VETERAN, WORKSHOP, hasTech } from '../data/config';
import { G } from '../sim/state';
import { msg } from '../core/events';
import { dist } from '../core/util';

/* =====================================================================
   Werkstatt: Fahrzeuge individuell ausrüsten · Veteranen
   ---------------------------------------------------------------------
   Ein Modul wird einmal entwickelt (p.mdev) und dann in einzelne
   Fahrzeuge eingebaut (u.mods). Jedes ausgerüstete Fahrzeug bekommt
   eine eigene Kopie seiner Spielwerte (u.def = buildDef(...)) – so
   wirken Tempo, Reichweite, Waffen usw. überall, ohne Sonderfälle.
   Einbau nur in der Werkstatt: das Fahrzeug muss dort stehen.
   ===================================================================== */
export type ModKey = keyof typeof MODULES;
/** Spielwerte eines Fahrzeugs mit seinen Modulen */
export function buildDef(type:string, mods:string[]=[]){
  const B=UNITS[type]; if(!B||!mods||!mods.length) return B;
  const d:any={...B, cost:B.cost, weapon:B.weapon&&{...B.weapon}, aux:B.aux&&{...B.aux}, mods:true};
  for(const k of mods){ const M:any=MODULES[k]; if(!M) continue;
    if(M.speed) d.speed*=M.speed;
    if(M.upkeep&&d.upkeep) d.upkeep*=M.upkeep;
    if(M.range&&d.weapon) d.weapon.range+=M.range;
    if(M.rof&&d.weapon) d.weapon.rof*=M.rof;
    if(M.weapon) d.weapon={...M.weapon};
    if(M.aux) d.aux={...M.aux};
    if(M.pod) d.pod={...M.pod};
    if(M.sight) d.sight+=M.sight;
    if(M.dmg) d.dmgMul=(d.dmgMul||1)*M.dmg;
    if(M.smart) d.smart=true;
    if(M.aps) d.aps=M.aps;
    if(M.hp) d.hp=Math.round(d.hp*M.hp);
  }
  return d;
}
export const capOf=(type:string)=>WORKSHOP.cap[type]||0;
export const weightOf=(mods:string[]=[])=>mods.reduce((s,k)=>s+(MODULES[k]?.weight||0),0);
export const isFittable=u=>!!u&&u.kind==='unit'&&!u.dead&&capOf(u.type)>0;
/** eigene, fertige Werkstatt in Reichweite des Fahrzeugs */
export const shopNear=u=>G.buildings.find(b=>!b.dead&&!b.site&&b.type==='workshop'&&b.owner===u.owner&&dist(b.x,b.y,u.x,u.y)<=WORKSHOP.radius);
export const devDone=(p,k)=>!!(p.mdev&&p.mdev[k]);
/** Warum kann dieses Modul gerade nicht eingebaut werden? ('' = geht) */
export function fitBlock(u,k:string,ignoreMoney=false){
  const M:any=MODULES[k], p=G.players[u.owner]; if(!M) return 'unbekannt';
  if(!M.fits.includes(u.type)) return 'passt nicht';
  if(!devDone(p,k)) return 'nicht entwickelt';
  if(!shopNear(u)) return 'nicht in der Werkstatt';
  if((u.mods||[]).includes(k)) return 'eingebaut';
  if(u.fit) return 'Einbau läuft';
  const rest=(u.mods||[]).filter(x=>MODULES[x].slot!==M.slot);   // gleicher Platz wird ersetzt
  if(weightOf(rest)+M.weight>capOf(u.type)) return 'zu schwer';
  if(!ignoreMoney){ for(const r in M.cost) if((p.res[r]||0)<M.cost[r]) return 'zu teuer'; }
  return '';
}
/** Einbau beginnen (bezahlt sofort, dauert WORKSHOP.fitTime) */
export function fitModule(u,k:string){
  const why=fitBlock(u,k); if(why) return why;
  const M:any=MODULES[k], p=G.players[u.owner]; for(const r in M.cost) p.res[r]-=M.cost[r];
  u.fit={k, t:WORKSHOP.fitTime}; u.mode='refit'; u.path=null; u.target=null; u.goal=null;
  return '';
}
/** mehrere Module nacheinander einbauen (z. B. „wie zuletzt“) */
export function fitPlan(u,keys:string[]){ const todo=keys.filter(k=>!(u.mods||[]).includes(k)); if(!todo.length) return 'schon so ausgerüstet';
  const first=todo.shift(); const why=fitModule(u,first); if(why) return why; u.fitQ=todo; return ''; }
/** Modul ausbauen (sofort, ohne Erstattung) */
export function removeModule(u,k:string){ if(!shopNear(u)||u.fit) return false; u.mods=(u.mods||[]).filter(x=>x!==k); applyDef(u); return true; }
export function applyDef(u){
  const old=u.maxHp||u.def.hp; u.def=buildDef(u.type,u.mods||[]);
  u.maxHp=u.def.hp; u.hp=Math.min(u.maxHp,u.hp*u.maxHp/old);
  if(u.def.aps&&u.aps===undefined) u.aps=u.def.aps; if(!u.def.aps) u.aps=undefined;
  if(u.def.pod&&u.podAmmo===undefined) u.podAmmo=1;
}
/** Entwicklung beginnen */
export function devBlock(pid,k:string){
  const M:any=MODULES[k], p=G.players[pid]; if(!M) return 'unbekannt';
  if(devDone(p,k)) return 'fertig';
  if(!G.buildings.some(b=>!b.dead&&!b.site&&b.type==='workshop'&&b.owner===pid)) return 'keine Werkstatt';
  if(p.mdevQ) return 'Werkstatt entwickelt bereits';
  const miss=M.need.filter(r=>!hasTech(p,r)); if(miss.length) return 'braucht Forschung';
  for(const r in M.dev) if((p.res[r]||0)<M.dev[r]) return 'zu teuer';
  return '';
}
export function startDev(pid,k:string){ const why=devBlock(pid,k); if(why) return why; const M:any=MODULES[k], p=G.players[pid];
  for(const r in M.dev) p.res[r]-=M.dev[r]; p.mdevQ={k, t:0, time:M.devTime}; return ''; }
/** jede Sekunde-Bruchteil: Entwicklung, Einbau, Nachladen */
export function updateModules(dt){
  for(let pid=0;pid<G.players.length;pid++){ const p=G.players[pid], q=p.mdevQ; if(!q) continue;
    if(!G.buildings.some(b=>!b.dead&&!b.site&&b.type==='workshop'&&b.owner===pid)) continue;   // ohne Werkstatt ruht die Entwicklung
    q.t+=dt*(p.powerOk===false?0.5:1);
    if(q.t>=q.time){ (p.mdev||(p.mdev={}))[q.k]=true; p.mdevQ=null; if(pid===0) msg(`🔧 Entwicklung abgeschlossen: ${MODULES[q.k].icon} ${MODULES[q.k].name}. Fahrzeuge können es jetzt in der Werkstatt einbauen.`,'#9fd88a'); } }
  G.modT=(G.modT||0)-dt; const tick=G.modT<=0; if(tick) G.modT=1;
  for(const u of G.units){ if(u.dead) continue;
    if(u.fit){ if(!shopNear(u)||u.mode!=='refit'){ const M:any=MODULES[u.fit.k], p=G.players[u.owner]; for(const r in M.cost) p.res[r]+=M.cost[r]; u.fit=null; if(u.mode==='refit') u.mode='idle';   // abgebrochen: Geld zurück
        if(u.owner===0) msg(`🔧 Einbau abgebrochen (${label(u)} hat die Werkstatt verlassen) – Kosten erstattet.`,'#ffb38a'); continue; }
      u.fit.t-=dt; if(u.fit.t<=0){ const k=u.fit.k, M:any=MODULES[k]; u.fit=null; u.mode='idle'; u.guard={x:u.x,y:u.y};
        u.mods=(u.mods||[]).filter(x=>MODULES[x].slot!==M.slot); u.mods.push(k); applyDef(u);
        if(u.def.aps) u.aps=u.def.aps; if(u.def.pod) u.podAmmo=1;
        if(u.owner===0){ G.lastFit=[...u.mods]; msg(`🔧 ${label(u)}: ${M.icon} ${M.name} eingebaut.`,'#9fd88a'); }
        while(u.fitQ&&u.fitQ.length){ const nx=u.fitQ.shift(); if((u.mods||[]).includes(nx)) continue; const why=fitModule(u,nx); if(!why) break; if(u.owner===0) msg(`🔧 ${label(u)}: ${MODULES[nx].name} nicht eingebaut (${why}).`,'#ffb38a'); } } }
    if(u.def.cls==='veh'&&u.hp<u.maxHp&&G.t-(u.lastHit||-99)>5&&shopNear(u)) u.hp=Math.min(u.maxHp,u.hp+u.maxHp*0.03*dt);   // Werkstatt repariert
    if(!tick||!(u.def.pod||u.def.aps)) continue;
    // Nachladen: in der Werkstatt sofort, zu Hause nach einer Weile ohne Beschuss
    const shop=shopNear(u), home=shop||(G.t-(u.lastHit||-99)>15&&G.buildings.some(b=>!b.dead&&b.owner===u.owner&&!b.def.def&&dist(b.x,b.y,u.x,u.y)<6));
    if(!home){ u.reloadT=0; continue; }
    u.reloadT=(u.reloadT||0)+1;
    if(u.def.pod&&!(u.podAmmo>0)&&(shop||u.reloadT>=WORKSHOP.reloadT)){ u.podAmmo=1; if(u.owner===0&&!shop) msg(`🚀 ${label(u)}: Raketenbehälter nachgeladen.`,'#b8c8e0'); }
    if(u.def.aps&&(u.aps||0)<u.def.aps&&(shop||u.reloadT%WORKSHOP.apsT===0)) u.aps=shop?u.def.aps:(u.aps||0)+1;
  }
}
/* ---------- Veteranen ---------- */
export const rankOf=u=>{ const k=u.kills||0; let r=0; for(const n of VETERAN.kills) if(k>=n) r++; return r; };
/** Fahrzeuge bekommen bei der Herstellung einen Namen */
export function nameUnit(u){
  if(!u||u.name||u.def.cls!=='veh'||!u.def.combat) return;
  const used=G.nameUse||(G.nameUse={}), L=VETERAN.vehNames, k=L[Math.floor(Math.random()*L.length)];
  used[k]=(used[k]||0)+1; u.name=used[k]>1?`${k} ${used[k]}`:k;
}
export const label=u=>`${u.def.name.replace(/­/g,'')}${u.name?` „${u.name}“`:''}`;
/** Abschuss gutschreiben, Beförderung melden */
export function creditKill(src,victim){
  if(!src||src.kind!=='unit'||src.dead||!src.def.weapon) return;
  if(victim.kind==='building'&&!victim.def.weapon&&!victim.def.def) return;   // nur Einheiten und Stellungen zählen
  const r0=rankOf(src); src.kills=(src.kills||0)+1; const r1=rankOf(src);
  if(r1>r0&&src.owner===0) msg(`⭐ ${label(src)} steigt auf: ${VETERAN.names[r1-1]} (${src.kills} Abschüsse).`,'#e8d48a');
}
/** Verlust eines bekannten Fahrzeugs melden */
export function mourn(u){
  if(u.owner!==0||u.kind!=='unit') return;
  const r=rankOf(u); if(!u.name||(r<1&&!(u.mods&&u.mods.length))) return;
  msg(`✝ ${label(u)} ist gefallen${r?` – ${VETERAN.names[r-1]}, ${u.kills} Abschüsse`:''}${u.mods&&u.mods.length?` – mit ${u.mods.map(k=>MODULES[k].icon).join('')}`:''}.`,'#ff8a7a');
}

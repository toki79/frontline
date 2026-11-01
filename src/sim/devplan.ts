import { DEV, FUN, UPGRADES, lvlOf, nextUpgrade } from '../data/config';
import { startUpgrade, upgradeBlock, upgradeEffect } from '../sim/build';
import { G } from '../sim/state';
import { msg } from '../core/events';

/* =====================================================================
   Stadtentwicklung: Die Bürger bauen ihre Gebäude selbst aus
   ---------------------------------------------------------------------
   Der Spieler legt je Bereich die Priorität fest (aus/niedrig/hoch) und gibt
   einen Anteil seiner Vorräte frei. Alle paar Sekunden suchen die Bürger den
   dringendsten Ausbau, der mit den freigegebenen Mitteln bezahlbar ist.
   ===================================================================== */
export function devOf(pid){
  G.dev=G.dev||{};
  if(!G.dev[pid]){ G.dev[pid]=JSON.parse(JSON.stringify(DEV.defaults));
    if(pid===1){ Object.assign(G.dev[1].prio,{wohnen:2, nahrung:2, militaer:1}); G.dev[1].release={money:0.3, wood:0.5, stone:0.5, metal:0.3}; } }
  return G.dev[pid];
}
export const catOf = type => Object.keys(DEV.cats).find(c=>DEV.cats[c].types.includes(type));
/** Bezahlbar mit den freigegebenen Mitteln? */
export function affordable(pid,U){ const p=G.players[pid], d=devOf(pid);
  for(const r of Object.keys(U.cost)) if(U.cost[r]>(p.res[r]||0)*(d.release[r]??0)) return false; return true; }
/** Dringlichkeit eines Bereichs: Engpässe zählen extra */
function need(pid,cat){ const p=G.players[pid];
  switch(cat){
    case 'wohnen': return p.pop>=p.cap-30?5:0;
    case 'nahrung': return p.foodRate<1?5:p.foodRate<3?2:0;
    case 'strom': return p.use>p.power*0.9?5:0;
    case 'stadtleben': return funCoverage(pid)<1?4:0;
    case 'lager': return (p.full&&Object.values(p.full).some(Boolean))?4:0;
    case 'rohstoffe': return 2;
    default: return 0; } }
/** Anteil der Einwohner (über FUN.free), für die es Unterhaltung gibt */
export function funCoverage(pid){ const p=G.players[pid], want=Math.max(0,p.pop-FUN.free); if(want<=0) return 1;
  let f=0; for(const b of G.buildings) if(!b.dead&&!b.site&&!b.contam&&b.owner===pid&&b.def.fun) f+=b.def.fun*(b.lvl>1?UPGRADES[b.type][b.lvl-1].mul:1);
  return Math.min(1,f/want); }
export function devThink(pid){
  const d=devOf(pid); if(!d.on) return;
  const p=G.players[pid], running=G.buildings.filter(b=>!b.dead&&b.owner===pid&&b.upg).length;
  if(running>=DEV.parallel+Math.floor(p.pop/DEV.parallelPer)) return;
  let best=null, bs=-1e9;
  for(const b of G.buildings){ if(b.dead||b.owner!==pid||b.site||b.upg||b.contam) continue;
    const cat=catOf(b.type), pr=cat?d.prio[cat]||0:0; if(!pr) continue;
    const U=nextUpgrade(b); if(!U||upgradeBlock(pid,b).length||!affordable(pid,U)) continue;
    const s=pr*10+need(pid,cat)-lvlOf(b)*2+Math.random(); if(s>bs){ bs=s; best=b; } }
  if(best){ const U=nextUpgrade(best); if(startUpgrade(pid,best)){ best.autoUp=true;
    if(pid===0) msg(`🏙 Die Bürger bauen aus: ${best.def.name.replace(/­/g,'')} → ${U.name} (${upgradeEffect(best.type,U)}).`,'#9fd88a'); } }
}
export function updateDev(dt){ G.devT=(G.devT||0)-dt; if(G.devT>0) return; G.devT=DEV.think; for(const pid of [0,1]) devThink(pid); }

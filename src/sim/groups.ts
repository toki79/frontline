import { dist } from '../core/util';
import { COMBINED } from '../data/config';
import { G } from '../sim/state';

/* =====================================================================
   Verbände (Kampfgruppen): Soldaten, Fahrzeuge und Drohnen gemeinsam führen
   ---------------------------------------------------------------------
   • Ein Verband bewegt sich im Tempo seiner langsamsten Einheit (bleibt beisammen).
   • Verbundene Waffen: Sind mindestens zwei Waffengattungen beisammen
     (Infanterie, Panzer/Fahrzeuge, Flugabwehr/Störsender, Drohnen), kämpfen
     sie besser und nehmen weniger Schaden.
   ===================================================================== */
export const groupsOf = pid => (G.groups||[]).filter(g=>g.owner===pid);
export const members = g => G.units.filter(u=>!u.dead&&u.grp===g.id);
export function makeGroup(pid,units){
  G.groups=G.groups||[]; G.grpNext=G.grpNext||1;
  const used=new Set(groupsOf(pid).map(g=>g.n)); let n=1; while(used.has(n)) n++;
  const g={id:G.grpNext++, owner:pid, n, name:`${n}. Kampfgruppe`, reinforce:false};
  G.groups.push(g);
  for(const u of units) if(!u.dead&&u.owner===pid) u.grp=g.id;
  pruneGroups(); return g;
}
export function dissolveGroup(g){ for(const u of G.units) if(u.grp===g.id) u.grp=null; G.groups=(G.groups||[]).filter(x=>x!==g); }
function pruneGroups(){ G.groups=(G.groups||[]).filter(g=>G.units.some(u=>!u.dead&&u.grp===g.id)); }
/** Waffengattungen einer Einheit (für verbundene Waffen) */
export function arm(u){ const d=u.def, w=d.weapon;
  if(d.jam||(w&&w.airOnly)) return 'flugabwehr';
  if(!w) return null;
  if(d.cls==='inf') return 'infanterie';
  if(d.cls==='veh') return 'panzer';
  if(d.cls==='air') return 'drohnen';
  return null; }
export const ARM_NAME = {infanterie:'Infanterie', panzer:'Fahrzeuge', flugabwehr:'Flugabwehr', drohnen:'Drohnen'};
/** Lage eines Verbands: Mitglieder, Schwerpunkt, Gattungen in der Nähe, Bonus aktiv? */
export function groupState(g){
  const ms=members(g); if(!ms.length) return {ms, cx:0, cy:0, arms:[], combined:false};
  const ground=ms.filter(u=>u.def.cls!=='air'), ref=ground.length?ground:ms;
  const cx=ref.reduce((s,u)=>s+u.x,0)/ref.length, cy=ref.reduce((s,u)=>s+u.y,0)/ref.length;
  const near=ms.filter(u=>dist(u.x,u.y,cx,cy)<=COMBINED.radius), arms=[...new Set(near.map(arm).filter(Boolean))];
  return {ms, cx, cy, near, arms, combined:arms.length>=COMBINED.minArms};
}
export function updateGroups(dt){
  G.grpT=(G.grpT||0)-dt; if(G.grpT>0) return; G.grpT=1;
  pruneGroups();
  for(const u of G.units) u.cmb=false;
  for(const g of (G.groups||[])){ const s=groupState(g); if(s.combined) for(const u of s.near) u.cmb=true; }
}
/** gemeinsames Marschtempo: langsamste Einheit (am Boden) bestimmt das Tempo */
export function groupPace(units){
  if(units.length<2) return null; const id=units[0].grp; if(!id||units.some(u=>u.grp!==id)) return null;
  const ground=units.filter(u=>u.def.cls!=='air'); if(!ground.length) return null;
  return Math.min(...ground.map(u=>u.def.speed));
}

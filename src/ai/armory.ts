import { AI_ARMORY, MODULES, hasTech } from '../data/config';
import { trade } from '../sim/market';
import { G } from '../sim/state';
import { dist } from '../core/util';
import { findBuilding, nearestPassable } from '../sim/world';
import { capOf, devCost, devDone, fitPlan, isFittable, shopNear, startDev, weightOf } from '../sim/modules';
import { intelEvent } from '../sim/intel';
import { orderMove } from '../sim/orders';
import { personaOf } from '../ai/persona';

/* =====================================================================
   KI-Werkstatt: was die KI entwickelt und einbaut
   ---------------------------------------------------------------------
   Die Reihenfolge folgt der Persönlichkeit (Ansturm: Tempo und Feuer,
   Igel: Schutz und Flak, Technik: Elektronik …) und reagiert auf den
   Gegner: viele Drohnen → Flak, viele Lenkwaffen → aktiver Schutz,
   viel Infanterie und Bunker → Flammenwerfer. Ausgerüstet wird nur in
   Ruhe, höchstens zwei Fahrzeuge zugleich.
   ===================================================================== */
const PREF={
  rush:    ['turbo','langrohr','raketen','era','flak','ki','flamme','aps'],
  boom:    ['ki','langrohr','turbo','aps','flak','era','raketen','flamme'],
  igel:    ['era','flak','aps','langrohr','ki','raketen','flamme','turbo'],
  technik: ['ki','aps','raketen','flak','langrohr','era','turbo','flamme'],
};
const bump=(L:string[],k:string,pos:number)=>{ const i=L.indexOf(k); if(i>pos){ L.splice(i,1); L.splice(pos,0,k); } };
/** Reihenfolge der Wunschmodule für diese KI, angepasst an den Gegner */
export function wishList(pid){
  const ai=G.ais[pid], P=personaOf(pid), L=[...(PREF[P&&P.opening]||PREF.boom)], foe=ai.foe??0;
  let air=0, guided=0, inf=0;
  for(const u of G.units){ if(u.dead||u.owner!==foe) continue; const w=u.def.weapon;
    if(u.def.cls==='air') air++; if(w&&(w.type==='missile'||w.kamikaze||w.type==='hellfire')) guided++; if(u.def.cls==='inf'&&w) inf++; }
  const bunkers=G.buildings.filter(b=>!b.dead&&b.owner===foe&&b.def.def&&b.def.armor==='fort').length;
  if(air>=3||G.t-(ai.airSeenT??-1e9)<300) bump(L,'flak',0);
  if(guided>=4) bump(L,'aps',0);
  if(inf>=12||bunkers>=3) bump(L,'flamme',1);
  return L;
}
/** beste Ausstattung aus den entwickelten Modulen für ein Fahrzeug */
export function planFor(u,wish:string[]){
  const p=G.players[u.owner], mods=[...(u.mods||[])], plan:string[]=[];
  for(const k of wish){ const M:any=MODULES[k]; if(!devDone(p,k)||!M.fits.includes(u.type)||mods.includes(k)) continue;
    if(mods.some(x=>MODULES[x].slot===M.slot)) continue;
    if(weightOf(mods)+M.weight>capOf(u.type)) continue;
    mods.push(k); plan.push(k); }
  return plan;
}
const planCost=(plan:string[])=>plan.reduce((s,k)=>s+(MODULES[k].cost.money||0),0);
/** alle paar Sekunden aus aiThink */
export function aiArmory(pid,calm:boolean,dt:number){
  const p=G.players[pid], ai=G.ais[pid];
  const shop=G.buildings.find(b=>!b.dead&&!b.site&&b.type==='workshop'&&b.owner===pid); if(!shop) return;
  // Werkstatt-Etat: ein Teil der Steuern wird zurückgelegt (die KI gibt sonst alles sofort aus)
  const fleet=G.units.filter(u=>!u.dead&&u.owner===pid&&isFittable(u)).length; if(!fleet) return;   // ohne Kampffahrzeuge kein Etat, keine Entwicklung
  const put=Math.min(Math.max(0,p.res.money),Math.max(0,(p.rate&&p.rate.money)||0)*AI_ARMORY.share*dt);
  if((ai.mfund||0)<AI_ARMORY.maxFund){ p.res.money-=put; ai.mfund=(ai.mfund||0)+put; }
  // aus dem Etat bezahlen: was fn ausgibt, geht zuerst vom Etat ab
  const spend=(fn:()=>string)=>{ const m0=p.res.money, f=ai.mfund||0; p.res.money+=f; ai.mfund=0; const why=fn(); const spent=m0+f-p.res.money;
    ai.mfund=Math.max(0,f-Math.max(0,spent)); p.res.money=m0-Math.max(0,spent-f); return why; };
  const wish=wishList(pid);
  // Entwickeln: das nächste Wunschmodul (fehlendes Metall wird zugekauft)
  if(!p.mdevQ) for(const k of wish){ if(devDone(p,k)) continue; const c=devCost(pid,k), M:any=MODULES[k];
    if(M.need.some(r=>!hasTech(p,r))) continue;   // Forschung fehlt: das nächste Wunschmodul
    if((ai.mfund||0)>=(c.money||0)+200){ for(const [r,t] of [['metal','buyMetal']]) for(let n=0;n<4&&(c[r]||0)>p.res[r];n++) if(spend(()=>trade(pid,t)?'':'nein')) break;
      const why=spend(()=>startDev(pid,k)); if(!why) intelEvent(pid,'module',k); }
    break; }   // nur das erste offene Wunschmodul – nicht auf Billiges ausweichen
  if(!calm) return;
  // Einbauen: Fahrzeuge in der Nähe der Stadt nacheinander in die Werkstatt
  const busy=G.units.filter(u=>!u.dead&&u.owner===pid&&(u.fit||(u.toShop&&G.t-u.toShop<90))).length;
  for(const u of G.units){ if(u.dead||u.owner!==pid||!isFittable(u)||u.fit||u.wave||u.mode==='attack') continue;
    const plan=planFor(u,wish); if(!plan.length) continue;
    if((ai.mfund||0)<planCost(plan)) return;
    if(shopNear(u)){ if(!spend(()=>fitPlan(u,plan))) u.toShop=0; continue; }
    if(busy>=2||u.toShop&&G.t-u.toShop<90) continue;
    const hq=findBuilding(pid,'hq'); if(hq&&dist(u.x,u.y,hq.x,hq.y)>30) continue;   // nur Fahrzeuge daheim
    const pp=nearestPassable(shop.x+(Math.random()-.5)*2,shop.y+shop.h/2+1.4,u.def.cls); if(!pp) continue;
    orderMove([u],pp.x+0.5,pp.y+0.5); u.toShop=G.t; return;   // eins nach dem anderen
  }
}
/** sieht die KI gerade Ausrüstungsbedarf? (für die Gebäudewahl) */
export const wantsWorkshop=(pid)=>G.units.filter(u=>!u.dead&&u.owner===pid&&isFittable(u)).length>=3;

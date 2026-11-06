import { aiThinkAll } from '../ai/kastrova';
import { updateIntel } from '../sim/intel';
import { updateVictory } from '../sim/victory';
import { isMajor } from '../data/config';
import { militiaThink } from '../ai/militia';
import { banditThink } from '../ai/bandits';
import { updateTrade } from '../sim/trade';
import { updateNukes } from '../sim/nuke';
import { updateTribute } from '../sim/tribute';
import { famineAid } from '../sim/offers';
import { updateDev } from '../sim/devplan';
import { updateCity } from '../sim/city';
import { updateGroups } from '../sim/groups';
import { updateFlights } from '../sim/airdrop';
import { updateReinforce } from '../sim/reinforce';
import { updateUpgrades } from '../sim/build';
import { updateEconomy } from '../sim/economy';
import { MARKET_RECOVER } from '../sim/market';
import { updateProduction } from '../sim/production';
import { G } from '../sim/state';
import { separate, updateBuilding, updateProjectiles, updateUnit } from '../sim/units';
import { recalcPower, updateVision } from '../sim/world';
import { updateRoadNet } from '../sim/build';

/* =====================================================================
   Hauptschleife
   ===================================================================== */
export function update(dt){
  G.t+=dt;
  for(const p of G.players){recalcPower(p.id); updateProduction(p.id,dt); if(isMajor(p.id)) updateEconomy(p.id,dt); if(G.over) return;}
  aiThinkAll(dt);
  G.milThinkT-=dt; if(G.milThinkT<=0){G.milThinkT=1; militiaThink(); banditThink(); updateTrade(); updateTribute(); famineAid(); updateIntel(); updateVictory(); if(G.over) return;}
  if(G.roadDirty) updateRoadNet();
  G.visT-=dt; if(G.visT<=0){G.visT=0.25; updateVision();}
  for(const k in G.market) G.market[k]=Math.max(0,G.market[k]-MARKET_RECOVER*dt);
  for(const u of G.units) if(!u.dead) updateUnit(u,dt);
  for(const b of G.buildings) if(!b.dead) updateBuilding(b,dt);
  updateProjectiles(dt);
  updateNukes(dt);
  updateUpgrades(dt);
  updateDev(dt);
  updateCity(dt);
  updateGroups(dt);
  updateFlights(dt);
  updateReinforce(dt);
  separate();
  for(const f of G.fx) f.age+=dt;
  G.fx=G.fx.filter(f=>f.age<f.life);
  if(G.fx.length>600) G.fx.splice(0,G.fx.length-600);
  G.units=G.units.filter(u=>!u.dead);
  if(G.buildings.some(b=>b.dead)) G.buildings=G.buildings.filter(b=>!b.dead);
  if(G.scorch.length>80) G.scorch.shift();
}

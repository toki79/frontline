import { mulberry32 } from '../core/util';
import { DIFFICULTY, FACTIONS, MAP_H, MAP_W, REGION } from '../data/config';
import { genMap, setupStart } from '../sim/mapgen';
import { updateRel, updateVision } from '../sim/world';
import { msg } from '../core/events';

/* =====================================================================
   Spielzustand
   ===================================================================== */
import type { Game } from './types';
export let G: Game = null;
/** Spielstand ersetzen (z. B. null beim Zurück ins Menü) */
export function setG(g: Game){ G=g; }
export function newGame(diffKey='mittel',fog=true,mode='endless'){
  const seed = (Math.random()*1e9)|0;
  G = {
    t:0, fog, mode, diffKey, diff:DIFFICULTY[diffKey], rng:mulberry32(seed), nextId:1,
    vis:new Uint8Array(MAP_W*MAP_H), visT:0, feat:new Uint8Array(MAP_W*MAP_H), terr:new Uint8Array(MAP_W*MAP_H), oil:new Float32Array(MAP_W*MAP_H), ore:new Float32Array(MAP_W*MAP_H), occ:new Int32Array(MAP_W*MAP_H),
    wood:new Float32Array(MAP_W*MAP_H), rock:new Float32Array(MAP_W*MAP_H), road:new Uint8Array(MAP_W*MAP_H), roadOwner:new Uint8Array(MAP_W*MAP_H), featOwner:new Uint8Array(MAP_W*MAP_H), fplan:new Uint8Array(MAP_W*MAP_H), fplanOwner:new Uint8Array(MAP_W*MAP_H), mineSeen:new Uint8Array(MAP_W*MAP_H), roadDirty:true, terrChanged:[],
    units:[], buildings:[], projectiles:[], fx:[], scorch:[], missiles:[], fallout:[],
    players: FACTIONS.map((f,i)=>({id:i, ...f, res:{money:0,food:0,wood:0,stone:0,metal:0,oil:0}, pop:0, cap:0, foodRate:0, power:0, use:0,
              done:{}, nukes:0, q:{hq:[], kontor:[], silo:[], airbase:[], barracks:[], factory:[], droneshop:[], research:[]}, tech:0, lastAttack:null, fuelShort:false, starveMsg:-99, capMsg:-99})),
    rel:[['-','neutral','neutral','feind'],['neutral','-','neutral','feind'],['neutral','neutral','-','feind'],['feind','feind','feind','-']],
    war:false, aiAtt:0, offer:null,
    contracts:[], embassy:[[false,false,false,false],[false,false,false,false]],
    known:[[true,false,false,false],[false,true,false,false],[true,true,true,true],[true,true,true,true]],   // Erstkontakt: wer kennt wen?
    militiaAlly:-1, militiaWar:[false,false], attitude:[0,0], mercCooldown:0, market:{sellOil:0,buyFood:0,buyMetal:0},
    milSpawnT:20, milRaidT:40, aiHintShown:false,
    ai:{mode:'frieden', mix:0, placeFail:0, thinkT:2, giftT:60, cool:0, nextRaid:0, lastCombat:-99, peaceCool:0, lootSince:0, need:null, lead:false, raidTarget:null, warnLead:false},
    milThinkT:1, sel:[], placing:null, boxMode:false, amoveMode:false, over:false, paused:false,
    warnB:-99, warnU:-99, stats:{built:0, lost:0, kills:0, loot:0}, uiT:0, miniT:0, terrCanvas:null, miniBg:null,
  };
  { // zwei Rohstoffe reich, zwei knapp, einer normal – Kastrova genau umgekehrt
    const rs=[...REGION.res]; for(let i=rs.length-1;i>0;i--){ const j=Math.floor(G.rng()*(i+1)); [rs[i],rs[j]]=[rs[j],rs[i]]; }
    const rich=rs.slice(0,2), scarce=rs.slice(2,4);
    G.profile=[{rich,scarce},{rich:scarce,scarce:rich},{rich:[],scarce:[]},{rich:[],scarce:[]}]; }
  if(!fog) G.known=[[true,true,true,true],[true,true,true,true],[true,true,true,true],[true,true,true,true]];
  G.regionText1=regionText(1);
  genMap();
  setupStart();
  updateRel();
  updateVision();
  msg(`Unsere Region: ${regionText(0)}.`,'#7fb0ea');
  if(fog) msg('Das Tal jenseits unserer Stadt ist unerforscht. Wer dort lebt, wissen wir nicht – schicke Späher oder Drohnen aus.','#d6b45a');
  else msg(`Geheimdienst: Kastrova hat ${G.regionText1}. Was uns fehlt, hat Kastrova – handeln oder holen.`,'#d6b45a');
  msg('Kommandant, die Stadt wartet. Bauarbeiter errichten alles vor Ort – Holz und Stein holen sie beim Bauen aus dem Lager.', '#d2bd62');
}
export const isScarce=(pid,r)=>!!G&&G.profile[pid].scarce.includes(r);
export const isRich=(pid,r)=>!!G&&G.profile[pid].rich.includes(r);
export function regionText(pid){ const pr=G.profile[pid];
  return `${pr.rich.map(r=>REGION.rich[r]).join(' und ')}, aber ${pr.scarce.map(r=>REGION.scarce[r]).join(' und ')}`;
}

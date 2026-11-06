import { mulberry32 } from '../core/util';
import { AIS, AI_CHAR, DIFFICULTY, FACTIONS, MAP_H, MAP_W, REGION } from '../data/config';
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
    rel:FACTIONS.map((_,a)=>FACTIONS.map((_,b)=>a===b?'-':a===3||b===3?'feind':'neutral')),
    wars:{}, offer:null,
    contracts:[], pacts:[], pactBreaks:0, chat:{}, embassy:FACTIONS.map(()=>FACTIONS.map(()=>false)),
    known:FACTIONS.map((_,a)=>FACTIONS.map((_,b)=>a===b||a===2||a===3||b===3)),   // Erstkontakt: wer kennt wen? (Miliz und Räuber kennen alle)
    militiaAlly:-1, militiaWar:FACTIONS.map(()=>false), attitude:FACTIONS.map(()=>0), mercCooldown:0, market:{sellOil:0,buyFood:0,buyMetal:0},
    milSpawnT:20, milRaidT:40, aiHintShown:false,
    ais:Object.fromEntries(AIS.map((pid,i)=>[pid,{pid, char:AI_CHAR[pid].key, att:{0:0,1:0,4:0}, foe:0, foeT:0, mode:'frieden', mix:i*5, placeFail:0, thinkT:2+i*0.5, giftT:60+i*15, cool:0, nextRaid:0, lastCombat:-99, peaceCool:0, lootSince:0, need:null, lead:false, raidTarget:null, warnLead:false, ratio:1}])),
    visAi:Object.fromEntries(AIS.map(pid=>[pid,new Uint8Array(MAP_W*MAP_H)])),
    milThinkT:1, sel:[], placing:null, boxMode:false, amoveMode:false, over:false, paused:false,
    warnB:-99, warnU:-99, stats:{built:0, lost:0, kills:0, loot:0}, uiT:0, miniT:0, terrCanvas:null, miniBg:null,
  };
  { // zwei Rohstoffe reich, zwei knapp, einer normal – Kastrova genau umgekehrt, Veloria reich an dem fünften und einem Engpass Aldorias
    const rs=[...REGION.res]; for(let i=rs.length-1;i>0;i--){ const j=Math.floor(G.rng()*(i+1)); [rs[i],rs[j]]=[rs[j],rs[i]]; }
    const rich=rs.slice(0,2), scarce=rs.slice(2,4), none={rich:[],scarce:[]};
    G.profile=[{rich,scarce},{rich:scarce,scarce:rich},none,none,{rich:[rs[4],rs[2]],scarce:[rs[1],rs[3]]}]; }
  if(!fog) G.known=FACTIONS.map(()=>FACTIONS.map(()=>true));
  G.regionTexts=FACTIONS.map((_,i)=>regionText(i));
  genMap();
  setupStart();
  updateRel();
  updateVision();
  msg(`Unsere Region: ${regionText(0)}.`,'#7fb0ea');
  if(fog) msg('Das Tal jenseits unserer Stadt ist unerforscht. Wer dort lebt, wissen wir nicht – schicke Späher oder Drohnen aus.','#d6b45a');
  else for(const pid of AIS) msg(`Geheimdienst: ${G.players[pid].short} (${AI_CHAR[pid].label}) hat ${G.regionTexts[pid]}.`,'#d6b45a');
  msg('Kommandant, die Stadt wartet. Bauarbeiter errichten alles vor Ort – Holz und Stein holen sie beim Bauen aus dem Lager.', '#d2bd62');
}
export const isScarce=(pid,r)=>!!G&&G.profile[pid].scarce.includes(r);
export const isRich=(pid,r)=>!!G&&G.profile[pid].rich.includes(r);
export function regionText(pid){ const pr=G.profile[pid]; if(!pr.rich.length) return '';
  return `${pr.rich.map(r=>REGION.rich[r]).join(' und ')}, aber ${pr.scarce.map(r=>REGION.scarce[r]).join(' und ')}`;
}

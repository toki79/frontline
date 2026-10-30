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
    wood:new Float32Array(MAP_W*MAP_H), rock:new Float32Array(MAP_W*MAP_H), road:new Uint8Array(MAP_W*MAP_H), roadOwner:new Uint8Array(MAP_W*MAP_H), roadDirty:true, terrChanged:[],
    units:[], buildings:[], projectiles:[], fx:[], scorch:[],
    players: FACTIONS.map((f,i)=>({id:i, ...f, res:{money:0,food:0,wood:0,stone:0,metal:0,oil:0}, pop:0, cap:0, foodRate:0, power:0, use:0,
              q:{hq:[], barracks:[], factory:[], droneshop:[], research:[]}, tech:0, lastAttack:null, fuelShort:false, starveMsg:-99, capMsg:-99})),
    rel:[['-','neutral','neutral'],['neutral','-','neutral'],['neutral','neutral','-']],
    war:false, aiAtt:0, offer:null,
    militiaAlly:-1, militiaWar:[false,false], attitude:[0,0], mercCooldown:0, market:{sellOil:0,buyFood:0,buyMetal:0},
    milSpawnT:20, milRaidT:40, aiHintShown:false,
    ai:{mode:'frieden', mix:0, placeFail:0, thinkT:2, giftT:60, cool:0, nextRaid:0, lastCombat:-99, peaceCool:0, lootSince:0, need:null, lead:false, raidTarget:null, warnLead:false},
    milThinkT:1, sel:[], placing:null, boxMode:false, amoveMode:false, over:false, paused:false,
    warnB:-99, warnU:-99, stats:{built:0, lost:0, kills:0, loot:0}, uiT:0, miniT:0, terrCanvas:null, miniBg:null,
  };
  { const rs=['food','metal','oil'], b0=rs[Math.floor(G.rng()*3)], rest=rs.filter(r=>r!==b0), b1=rest[Math.floor(G.rng()*2)];
    G.profile=[{scarce:b0,rich:b1},{scarce:b1,rich:b0},{scarce:null,rich:null}];
    for(const pr of G.profile) pr.fert=pr.scarce==='food'?REGION.fertScarce:pr.rich==='food'?REGION.fertRich:1; }
  genMap();
  setupStart();
  updateRel();
  updateVision();
  const pr=G.profile;
  msg(`Unsere Region: ${REGION.rich[pr[0].rich]}, aber ${REGION.scarce[pr[0].scarce]}.`,'#7fb0ea');
  msg(`Geheimdienst: Kastrova hat ${REGION.rich[pr[1].rich]}, aber ${REGION.scarce[pr[1].scarce]}. Handel lohnt sich.`,'#d6b45a');
  msg('Kommandant, die Stadt wartet. Baue Holzfäller und Steinbruch, dann Bauernhof, Wohnhäuser und ein Kraftwerk – deine Bauarbeiter errichten alles vor Ort.', '#d2bd62');
}

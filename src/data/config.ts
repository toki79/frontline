import { splash } from '../sim/combat';

/* =====================================================================
   FRONTLINIE v0.2 – Aufbau, Bevölkerung, bedarfsgesteuerte KI
   ---------------------------------------------------------------------
   Inhalte stehen in den Datentabellen hier oben:
   UNITS / BUILDINGS (Kosten in Geld, Metall, Öl und Einwohnern),
   TERRAIN, DAMAGE, DIFFICULTY, ECON. Neue Einheit = neuer Eintrag
   (+ Zeichnung in drawUnitShape / drawBuildingShape).
   ===================================================================== */
export const TILE = 32, MAP_W = 64, MAP_H = 64, BUILD_RADIUS = 5, LEASH = 6;
export const DEF_RADIUS = 9;          // Verteidigung darf weiter vor der Stadt liegen als Gebäude
export const VEH_PER_FACTORY = 4;     // Kampffahrzeuge je Fahrzeugwerk
export const DRONES_PER_SHOP = 6;     // Drohnen je Drohnenwerkstatt
export const NOISE_R = 4;   // Reichweite von Industrielärm in Feldern (noise = Abzug an Wohnqualität)
// ---------- Volkswirtschaft ----------
export const ECON = {
  target: 500,          // Einwohner zum Sieg
  foodPerHead: 0.02,    // Nahrung pro Einwohner und Sekunde
  taxPerHead: 0.07,     // Geld pro Einwohner und Sekunde
  growBase: 0.2,        // Grundwachstum (Einwohner/s)
  growRate: 0.002,      // zusätzliches Wachstum je Einwohner
  minPop: 10,           // so viele Einwohner bleiben immer (keine Rekrutierung darunter)
  ranks: <[number,string][]>[[0,'Dorf'],[100,'Kleinstadt'],[250,'Stadt'],[500,'Großstadt'],[1000,'Metropole'],[2000,'Weltstadt']],
};
export const RES = {money:{icon:'$',name:'Geld'}, food:{icon:'🌾',name:'Nahrung'}, metal:{icon:'⛏',name:'Metall'}, oil:{icon:'🛢',name:'Öl'}, pop:{icon:'👥',name:'Einwohner'},
  vehcap:{icon:'🛠',name:`Fahrzeuglimit (${VEH_PER_FACTORY} je Fahrzeugwerk)`}, dronecap:{icon:'🛠',name:`Drohnenlimit (${DRONES_PER_SHOP} je Werkstatt)`}};
// ---------- Gelände ----------
export const TERRAIN = [
  {key:'grass',  name:'Steppe',    col:['#6f7e45','#73834a','#6a7942'], cost:{inf:1,  veh:1},   cover:0,    build:true},
  {key:'forest', name:'Wald',      col:['#4a6534','#46602f'],           cost:{inf:1.3,veh:2.6}, cover:0.35, build:false},
  {key:'mud',    name:'Schlamm',   col:['#6e5d40','#68583b'],           cost:{inf:1.6,veh:3.2}, cover:0,    build:false},
  {key:'town',   name:'Ortschaft', col:['#86826f','#7f7b69'],           cost:{inf:1,  veh:1.4}, cover:0.45, build:false},
  {key:'water',  name:'Fluss',     col:['#3b6176','#395d71'],           cost:{inf:Infinity,veh:Infinity}, cover:0, build:false},
  {key:'bridge', name:'Brücke',    col:['#6f6252'],                     cost:{inf:1,  veh:1},   cover:0,    build:false},
];
export const T = {GRASS:0, FOREST:1, MUD:2, TOWN:3, WATER:4, BRIDGE:5};
// ---------- Schaden: Waffentyp gegen Panzerung ----------
// air = tieffliegende Drohnen, airHigh = hochfliegende (nur Flugabwehr, schwach Maschinenkanone); 0 heißt: kann dieses Ziel gar nicht bekämpfen
export const DAMAGE = {
  bullet:     {none:1.0,  light:0.3, heavy:0.08, building:0.15, fort:0.06, air:0.45, airHigh:0},
  autocannon: {none:0.9,  light:0.8, heavy:0.25, building:0.4,  fort:0.25, air:1.0, airHigh:0.35},
  shell:      {none:0.35, light:1.0, heavy:1.0,  building:0.9,  fort:0.55, air:0, airHigh:0},
  missile:    {none:0.15, light:1.0, heavy:0.9,  building:0.6,  fort:0.35, air:0, airHigh:0},
  rocket:     {none:0.6,  light:0.7, heavy:0.35, building:1.0,  fort:0.6,  air:0, airHigh:0},
  drone:      {none:0.7,  light:1.3, heavy:1.0,  building:0.5,  fort:0.35, air:0, airHigh:0},
  flak:       {none:0.3,  light:0.2, heavy:0.05, building:0.05, fort:0.03, air:2.0, airHigh:1.6},
};
export const canHit=(w,t)=>{ const air=t.kind==='unit'&&t.def.cls==='air'; if(w.airOnly) return air; return (DAMAGE[w.type][t.armor]||0)>0; };
// ---------- Geländeausbau (Graben, Stacheldraht) ----------
export const FEAT = {NONE:0, WIRE:1, TRENCH:2};
export const FEATURES = {
  wire:   {id:1, name:'Stacheldraht',  cost:{money:15}, desc:'Bremst Infanterie stark, Fahrzeuge walzen ihn platt', line:true},
  trench: {id:2, name:'Schützengraben',cost:{money:30}, desc:'Infanterie darin: 60 % Deckung · bremst Fahrzeuge stark', line:true},
};
// ---------- Einheiten ----------
export const UNITS = {
  inf:   {name:'Schützentrupp', cls:'inf', cost:{money:100, pop:5}, time:4, hp:90, armor:'none', speed:1.25, sight:6, size:0.4,
          weapon:{type:'bullet', dmg:9, range:4, rof:0.9}, prod:'barracks', req:[], desc:'Günstig, stark in Wald und Ortschaften'},
  at:    {name:'Panzerabwehr', cls:'inf', cost:{money:200, metal:20, pop:5}, time:6, hp:80, armor:'none', speed:1.15, sight:6, size:0.4,
          weapon:{type:'missile', dmg:65, range:6, rof:3.2}, prod:'barracks', req:[], desc:'Lenkflugkörper gegen Fahrzeuge, reicht weiter als Panzer'},
  ifv:   {name:'Schützenpanzer', cls:'veh', cost:{money:300, metal:60, oil:40, pop:4}, time:11, hp:320, upkeep:0.05, combat:true, armor:'light', speed:2.3, sight:7, size:0.6,
          weapon:{type:'autocannon', dmg:15, range:5, rof:0.5}, prod:'factory', req:[], desc:'Schnell, gut gegen Infanterie'},
  mbt:   {name:'Kampfpanzer', cls:'veh', cost:{money:450, metal:120, oil:70, pop:4}, time:20, hp:650, upkeep:0.1, combat:true, armor:'heavy', speed:1.55, sight:7, size:0.72,
          weapon:{type:'shell', dmg:70, range:5.5, rof:2.4}, prod:'factory', req:[], desc:'Schwer gepanzert, knackt Fahrzeuge'},
  truck: {name:'Tanklaster', cls:'veh', cost:{money:400, metal:30, pop:2}, time:10, hp:420, armor:'light', speed:1.7, sight:5, size:0.62,
          harvester:{cap:350, rate:70, unload:200}, prod:'factory', req:['refinery'], desc:'Fördert Öl, bringt es zur Raffinerie'},
  mlrs:  {name:'Raketenwerfer', cls:'veh', tech:2, cost:{money:550, metal:100, oil:60, pop:4}, time:18, hp:260, armor:'light', speed:1.4, sight:10, size:0.66, upkeep:0.08, combat:true,
          weapon:{type:'rocket', dmg:32, range:9.5, minRange:3, rof:11, salvo:6, splash:1.1, spread:1.6}, prod:'factory', req:[], desc:'Salven auf große Distanz, Flächenschaden, ungenau'},
  drone: {name:'FPV-Kamikazedrohne', cls:'air', tech:2, cost:{money:120, metal:15, pop:1}, time:4, hp:30, armor:'air', speed:4.5, sight:9, size:0.35, battery:90,
          weapon:{type:'drone', dmg:80, range:0.45, rof:1, kamikaze:true, splash:0.7}, prod:'droneshop', req:[], desc:'Tieffliegend, stürzt sich aufs Ziel, fliegt über Hindernisse'},
  spy:   {name:'Spionagedrohne', cls:'air', tech:1, cost:{money:220, metal:20, pop:1}, time:6, hp:60, armor:'airHigh', speed:3.4, sight:13, size:0.35, battery:180,
          prod:'droneshop', req:[], desc:'Hochfliegend, unbewaffnet, sieht sehr weit'},
  reaper:{name:'Reaper-Drohne', cls:'air', tech:3, cost:{money:900, metal:120, oil:60, pop:2}, time:16, hp:240, armor:'airHigh', speed:2.6, sight:10, size:0.6, battery:150,
          weapon:{type:'missile', dmg:75, range:6.5, rof:5}, prod:'droneshop', req:[], desc:'Hochfliegende Kampfdrohne mit Lenkraketen'},
  militia:{name:'Milizionäre', cls:'inf', cost:{money:150}, time:0, hp:75, armor:'none', speed:1.3, sight:6, size:0.4,
          weapon:{type:'bullet', dmg:8, range:4, rof:0.95}, prod:null, desc:'Kämpfer der Grenzmiliz'},
  // Drohnen und Raketenwerfer: siehe drawUnitShape
};
// ---------- Gebäude ----------
// cap = Wohnraum, food/metal = Produktion pro Sekunde, needsOre = muss an Erz grenzen
export const BUILDINGS = {
  hq:      {name:'Rathaus',       w:3,h:3, hp:1800, power:30,  cost:{}, time:0, buildable:false, cap:40, food:0.5, sight:8, desc:'Baut Gebäude, 40 Wohnraum'},
  house:   {name:'Wohnhaus',      w:2,h:2, hp:450,  power:-10, cost:{money:250}, time:5, req:[], cap:50, sight:3, desc:'+50 Wohnraum'},
  farm:    {name:'Bauernhof',     w:3,h:2, hp:450,  power:0,   cost:{money:300}, time:6, req:[], food:2.5, sight:3, desc:'+2,5 Nahrung/s'},
  power:   {name:'Kraftwerk',     w:2,h:2, hp:600,  power:100, cost:{money:300}, time:6, req:[], noise:0.3, sight:4, desc:'+100 Strom'},
  mine:    {name:'Mine',          w:2,h:2, hp:650,  power:-20, cost:{money:450}, time:8, req:[], metal:1.5, needsOre:true, noise:0.35, sight:4, desc:'Metall, nur direkt an Erz'},
  refinery:{name:'Raffinerie',    w:3,h:2, hp:900,  power:-30, cost:{money:900}, time:11, req:['power'], spawn:'truck', noise:0.4, sight:5, refine:3, tank:800, desc:'Verarbeitet Rohöl (3 Öl/s), inkl. Tanklaster'},
  barracks:{name:'Kaserne',       w:2,h:2, hp:700,  power:-20, cost:{money:300}, time:7, req:['power'], noise:0.15, sight:5, desc:'Bildet Infanterie aus'},
  factory: {name:'Fahrzeugwerk',  w:3,h:3, hp:1100, power:-40, cost:{money:800, metal:80}, time:14, req:['barracks'], noise:0.35, sight:5, desc:`Baut Fahrzeuge (max. ${VEH_PER_FACTORY} Kampffahrzeuge je Werk)`},
  kontor:  {name:'Handelskontor', w:2,h:2, hp:600, power:-10, cost:{money:600}, time:9, req:[], noise:0.15, sight:4, export:4,
            desc:'Exportiert Überschüsse automatisch gegen Geld'},
  university:{name:'Universität', w:3,h:2, hp:700, power:-30, cost:{money:800, metal:40}, time:14, req:['power'], sight:4, desc:'Forschung: Stufe 1, ausbaubar bis Stufe 3'},
  droneshop:{name:'Drohnen\u00ADwerkstatt',w:2,h:2, hp:550, power:-20, cost:{money:500, metal:40}, time:9, req:['barracks'], tech:1, noise:0.15, sight:5, desc:`Baut FPV-Drohnen (max. ${DRONES_PER_SHOP} je Werkstatt)`},
  // --- Verteidigung (def:true): direkt auf der Karte platzieren, Stellungen brauchen danach Bauzeit ---
  wall:    {name:'Betonmauer',    w:1,h:1, hp:1000, power:0,   cost:{money:40},  time:0, req:[], def:true, line:true, sight:1, desc:'Blockiert Bodentruppen, hält viel aus'},
  sentry:  {name:'Selbstschuss\u00ADanlage', w:1,h:1, hp:420, power:-5, cost:{money:180}, time:6, req:[], def:true, noise:0.05, sight:6, desc:'Automatisches MG gegen Infanterie und Drohnen',
            weapon:{type:'bullet', dmg:10, range:4.5, rof:0.35}},
  turret:  {name:'MK-Stellung',   w:1,h:1, hp:750,  power:-15, cost:{money:350, metal:30}, time:8, req:['barracks'], def:true, noise:0.1, sight:7, desc:'Maschinenkanone gegen Fahrzeuge, Infanterie und Drohnen',
            weapon:{type:'autocannon', dmg:17, range:6, rof:0.55}},
  flak:    {name:'Flugabwehr',    w:1,h:1, hp:450,  power:-15, cost:{money:300, metal:25}, time:7, req:['barracks'], def:true, noise:0.1, sight:9, desc:'Holt Drohnen vom Himmel (nur Luftziele)',
            weapon:{type:'flak', dmg:24, range:8, rof:0.4, airOnly:true}},
  bunker:  {name:'Milizbunker',   w:2,h:2, hp:1400, power:0,   cost:{}, time:0, buildable:false, sight:7,
            weapon:{type:'bullet', dmg:13, range:5.5, rof:0.5}},
};
// ---------- Parteien ----------
export const FACTIONS = [
  {name:'Republik Aldoria',      short:'Aldoria',  leader:'Ihr',             col:'#4f86d6', dark:'#1d3f73'},
  {name:'Föderation Kastrova',   short:'Kastrova', leader:'Marschall Varek', col:'#cc4a3c', dark:'#6e1d15'},
  {name:'Grenzmiliz von Belgor', short:'Miliz',    leader:'Hauptmann Dorin', col:'#c9a640', dark:'#6a5317'},
];
// ---------- KI ----------
// incomeMul: Wirtschaftsbonus der KI, grace: Sekunden ohne Aggression, aggr: Angriffslust
export const DIFFICULTY = {
  leicht: {incomeMul:0.85, grace:300, think:1.5, aggr:0.7},
  mittel: {incomeMul:1.0,  grace:200, think:1.0, aggr:1.0},
  schwer: {incomeMul:1.2,  grace:120, think:0.7, aggr:1.35},
};
export const AI_MIX = ['inf','inf','ifv','at','drone','inf','mbt','drone','ifv','at','mlrs','reaper','drone','mbt'];
// ---------- Regionen: jede Stadt hat einen Engpass und einen Überschuss (pro Spiel zufällig, gegenseitig ergänzend) ----------
export const REGION = {
  scarce:  {food:'karge Böden – Bauernhöfe liefern nur gut die Hälfte', metal:'kaum Erz in Stadtnähe', oil:'keine Ölfelder in Stadtnähe'},
  rich:    {food:'fruchtbare Böden – Bauernhöfe liefern 40 % mehr',   metal:'reiche Erzvorkommen',    oil:'reiche Ölfelder'},
  fertScarce:0.55, fertRich:1.4,
};
// Handel zwischen den Städten: Grundwert je Einheit, Losgröße
export const BASEVAL = {food:2.2, metal:4.5, oil:1.6};
// Handelskontor: verkauft nur, was über der Reserve liegt; Exportpreis je Einheit
export const EXPORT = {order:['oil','metal','food'], reserve:{oil:300, metal:250, food:400}, price:{oil:1.1, metal:2.8, food:1.4}};
export const LOT = {food:100, metal:50, oil:100};
// Universität: Stufe 1 = gebaut, Stufe 2/3 durch Forschung in der Universität
export const RESEARCH = {
  res2:{name:'Forschung Stufe 2', level:2, cost:{money:1000, metal:100}, time:60, desc:'Schaltet FPV-Kamikazedrohnen und Raketenwerfer frei'},
  res3:{name:'Forschung Stufe 3', level:3, cost:{money:1600, metal:200, oil:100}, time:90, desc:'Schaltet die Reaper-Drohne frei'},
};
export const TECH_UNLOCKS = {1:'Drohnenwerkstatt, Spionagedrohne', 2:'FPV-Kamikazedrohne, Raketenwerfer', 3:'Reaper-Drohne'};
export const DEF = t => UNITS[t] || BUILDINGS[t] || FEATURES[t] || RESEARCH[t];
export const isDefType = t => !!(FEATURES[t] || (BUILDINGS[t]&&BUILDINGS[t].def));

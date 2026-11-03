
/* =====================================================================
   FRONTLINIE – alle Spielwerte an einem Ort
   ---------------------------------------------------------------------
   UNITS / BUILDINGS (Kosten in Geld, Holz, Stein, Metall, Öl, Einwohnern),
   TERRAIN, DAMAGE, DIFFICULTY, ECON, CONSTRUCTION. Neue Einheit = neuer
   Eintrag (+ Zeichnung in render/draw.ts).
   ===================================================================== */
export const TILE = 32, MAP_W = 96, MAP_H = 96, BUILD_RADIUS = 5, LEASH = 6;
// Notstand: Bürgerwehr bei Angriff, Beute nur aus passenden Gebäuden
export const EMERGENCY = {window:120, maxVolunteers:8, disband:150, wageFree:true};
// Beute beim Zerstören: Geld nur aus Rathaus (Stadtkasse) und Kontor; Betriebe verlieren ihr eigenes Erzeugnis
export const LOOT = {treasury:{hq:[0.3,700], kontor:[0.12,250]}, goods:{farm:['food',0.25,300], greenhouse:['food',0.2,200], mine:['metal',0.25,200], refinery:['oil',0.3,250], lumber:['wood',0.25,150], quarry:['stone',0.25,150], depot:['*',0.12,150]}};
// Verbände: verbundene Waffen (mind. zwei Gattungen beisammen) kämpfen besser
export const COMBINED = {radius:7, minArms:2, dmg:0.15, def:0.12};
// Verteidigungsvorteil: Stellungen schießen genauer (vorbereitete Schussfelder) und halten direktem Feuer besser stand.
// Artillerie, Raketen und Bomben wirken voll – wer Befestigungen knacken will, braucht sie (oder Luftlandungen, Amphibien).
export const FORTIFY = {dmgOut:1.3, direct:0.65, artillery:['rocket','ballistic','glide'], dugOut:1.15};
export const DEF_RADIUS = 9;          // Verteidigung darf weiter vor der Stadt liegen als Gebäude
// Stadtschutz: wichtige Gebäude, Zugänge, Grenzbunker
export const FORT = {critical:['hq','power','npp','factory','university','refinery','datacenter','enrich','silo','droneshop','kontor'], guardR:6, accessRing:9, recalc:30,
  borderR:30, enemyGap:8};   // Grenzbunker: bis 30 Felder von der Stadt, mind. 8 Felder Abstand zu fremden Gebäuden
export const VEH_PER_FACTORY = 4;     // Kampffahrzeuge je Fahrzeugwerk
export const DRONES_PER_SHOP = 6;     // Drohnen je Drohnenwerkstatt
export const NOISE_R = 4;
// ---------- Bauen ----------
export const CONSTRUCTION = {
  workTime: 8,          // Bauzeit = time × workTime bei EINEM Arbeiter (mehr Arbeiter = schneller)
  carry: 10,            // so viel Holz/Stein/Metall trägt ein Arbeiter pro Gang
  maxWorkers: 3,        // so viele Arbeiter können gleichzeitig an einer Baustelle arbeiten
  roadWork: 4,          // Sekunden Arbeit pro Straßenfeld (Stein tragen die Arbeiter selbst heran)
  roadSpeed: 0.55,      // Bewegungskosten auf Straßen (kleiner = schneller)
  roadRadius: 12,       // Straßen dürfen so weit von eigenen Gebäuden entfernt liegen
  startWorkers: 3,
  forestWood: 120,      // Holz pro Waldfeld; leer gefällter Wald wird zu Steppe
  clearShare: 0.5,      // Bauen auf Wald: die Bäume werden gerodet, dieser Anteil des Holzes kommt ins Lager
  demolishRefund: 0.3,  // Erstattung beim Abriss fertiger Gebäude (Baustellen: voll)
  // Baustellen: Geld wird beim Setzen bezahlt, Holz/Stein/Metall erst beim Bauen aus dem Lager geholt.
};
// ---------- Transport ----------
// Betriebe liefern zur nächsten Sammelstelle (Rathaus oder Lagerhaus). Je länger der Weg, desto weniger kommt an.
// Leistung = 1 / (1 + max(0, Weg − free) / half). Straßen zählen nur mit roadCost je Feld.
export const HAUL = {
  free: 2,              // so viele Weg-Felder kosten nichts
  half: 6,              // weitere Felder, bei denen die Leistung auf die Hälfte fällt (8 Felder ohne Straße = 50 %)
  roadCost: 0.15,       // ein Straßenfeld zählt so viel wie 0,15 Felder Gelände
  min: 0.25,            // schlechteste Leistung
};
// ---------- Dichte Bebauung ----------
export const DENSITY = {
  farmFieldR: 2,        // Bauernhof bewirtschaftet freie Steppe in diesem Umkreis
  farmFields: 12,       // so viele freie Ackerfelder braucht ein Hof für vollen Ertrag
  steppeYield: 0.4,     // ein Acker auf karger Steppe bringt nur 40 % eines Ackers auf grüner Wiese
  crowdPenalty: 0.45,   // Wohnhaus komplett umbaut (alle Nachbarfelder belegt) = −45 % Wohnqualität
  fireTime: 10,         // Sekunden, die ein Gebäude brennt
  fireDps: 0.04,        // Brandschaden je Sekunde (Anteil der Lebenspunkte)
  fireSpread: 0.06,     // Wahrscheinlichkeit je Sekunde, dass ein Brand auf ein angrenzendes Gebäude überspringt
};
// ---------- Stadtentwicklung: Bürger bauen selbst aus (Spieler gibt Prioritäten und Mittel frei) ----------
export const DEV = {
  cats: {wohnen:{name:'Wohnen', icon:'🏠', types:['house','block','hq']}, nahrung:{name:'Nahrung', icon:'🌾', types:['farm','greenhouse']},
         rohstoffe:{name:'Rohstoffe', icon:'⛏', types:['lumber','forester','quarry','mine','refinery','derrick']}, strom:{name:'Strom', icon:'⚡', types:['power','npp']},
         stadtleben:{name:'Stadtleben', icon:'🎭', types:['park','theater','pool','stadium','firest']}, lager:{name:'Lager & Handel', icon:'📦', types:['depot','kontor']},
         wissen:{name:'Forschung', icon:'🎓', types:['university','datacenter']}, militaer:{name:'Militär', icon:'🪖', types:['barracks','factory','droneshop']}},
  think: 6, parallel: 2, parallelPer: 1000,     // gleichzeitige Ausbauten: 2 + 1 je 1000 Einwohner
  release: [0, 0.25, 0.5, 0.75],                // wählbare Freigaben (Anteil der Vorräte)
  defaults: {on:true, prio:{wohnen:1, nahrung:1, rohstoffe:1, strom:1, stadtleben:1, lager:1, wissen:1, militaer:0}, release:{money:0.25, wood:0.5, stone:0.5, metal:0.25}},
};
// ---------- Stadtleben: Unterhaltung und Feuerwehr ----------
// Forsthaus: pflanzt Setzlinge, die nach grow Sekunden zu Wald werden
export const FOREST = {plantEvery:12, grow:420, radius:4, maxSaplings:8};
export const FUN = {free:300};   // so viele Einwohner kommen ohne Unterhaltung aus; darüber braucht jeder einen Platz
export const FIRE = {outbreak:0.00025, minPop:250, stationR:11, stationQuench:3, stationOutbreak:0.25};   // Brandgefahr je Gebäude und Sekunde (eng bebaut höher); Feuerwehr löscht schnell und verhindert Übergreifen
// ---------- Zufriedenheit: Versäumnisse haben Folgen ----------
export const MOOD = {
  start: 0.8,
  hunger: 0.45, foodFalling: 0.12, power: 0.15, broke: 0.25, crowded: 0.12,
  housing: 0.6,         // × (0,9 − Wohnqualität), wenn die Wohnlage schlecht ist
  attacked: 0.2,        // Angriff auf Stadt oder Einheiten in den letzten 60 s
  bandits: 0.12,        // Räuberlager in Stadtnähe
  banditR: 16,
  war: 0.08,
  fun: 0.2,             // fehlende Unterhaltung (× fehlender Anteil), erst ab FUN.free Einwohnern
  fires: 0.08,          // Brände in der Stadt in der letzten Minute
  speed: 0.03,          // so schnell nähert sich die Stimmung ihrem Zielwert (je Sekunde)
  taxBase: 0.5, taxPer: 0.6,   // Steuern × (0,5 + 0,6 × Zufriedenheit), max. 1,1
  emigrate: 0.35,       // darunter wandern Einwohner ab
  emigrateRate: 0.006,  // Anteil der Einwohner je Sekunde bei Zufriedenheit 0
};
// ---------- Lager ----------
export const STORAGE = {
  base: 800,            // Lagerplatz je Rohstoff im Rathaus
  depot: 1000,          // zusätzlicher Lagerplatz je Lagerhaus
  res: ['food','wood','stone','metal','oil'],
};
// ---------- Volkswirtschaft ----------
export const ECON = {
  target: 500,          // Einwohner zum Sieg
  foodPerHead: 0.02,    // Nahrung pro Einwohner und Sekunde
  taxPerHead: 0.05,     // Geld pro Einwohner und Sekunde
  // Unterhalt in $/s je fertigem Gebäude (fehlt = 0)
  upkeep: {lumber:0.1, quarry:0.15, farm:0.1, power:0.4, mine:0.3, refinery:0.5, barracks:0.4, factory:1.5, kontor:0.3,
           university:1.2, droneshop:1.0, depot:0.15, block:0.2, greenhouse:0.3, datacenter:2, npp:3, enrich:4, silo:2, sentry:0.1, turret:0.25, atpost:0.2, flak:0.25, sam:0.4, airbase:2.5, gbunker:0.4, derrick:0.8, forester:0.1, park:0.1, theater:0.6, pool:1.0, stadium:2.2, firest:0.5},
  wagePerPop: 0.025,    // Sold je Einwohner, der als Soldat/Arbeiter dient ($/s)
  // Stadtverwaltung: Anteil der Steuern, wächst mit der Stadtgröße, bleibt aber unter adminMax
  // (500 EW ≈ 20 %, 1000 ≈ 30 %, 3000 ≈ 45 %, 10 000 ≈ 55 %) – Wachstum lohnt sich immer, nur weniger
  adminMax: 0.6, adminHalf: 1000, adminIT: 0.8,   // adminIT: Faktor mit erforschter Informatik (digitale Verwaltung)
  brokeFactor: 0.7,     // ohne Geld arbeiten Betriebe nur mit diesem Anteil (Höfe arbeiten weiter)
  growBase: 0.2,        // Grundwachstum (Einwohner/s)
  growRate: 0.002,      // zusätzliches Wachstum je Einwohner
  minPop: 10,           // so viele Einwohner bleiben immer (keine Rekrutierung darunter)
  ranks: <[number,string][]>[[0,'Dorf'],[100,'Kleinstadt'],[250,'Stadt'],[500,'Großstadt'],[1000,'Metropole'],[2000,'Weltstadt']],
};
export const RES = {money:{icon:'$',name:'Geld'}, food:{icon:'🌾',name:'Nahrung'}, wood:{icon:'🪵',name:'Holz'}, stone:{icon:'🪨',name:'Stein'}, metal:{icon:'⛏',name:'Metall'}, oil:{icon:'🛢',name:'Öl'}, pop:{icon:'👥',name:'Einwohner'},
  vehcap:{icon:'🛠',name:`Fahrzeuglimit (${VEH_PER_FACTORY} je Fahrzeugwerk)`}, dronecap:{icon:'🛠',name:`Drohnenlimit (${DRONES_PER_SHOP} je Werkstatt)`}, jetcap:{icon:'🛠',name:'Flugzeuglimit (4 je Fliegerhorst)'}};
// ---------- Gelände ----------
export const TERRAIN = [
  {key:'grass',  name:'Steppe',    col:['#6f7e45','#73834a','#6a7942'], cost:{inf:1,  veh:1, amph:1},   cover:0,    build:true},
  {key:'forest', name:'Wald',      col:['#4a6534','#46602f'],           cost:{inf:1.3,veh:2.6, amph:2.6}, cover:0.35, build:false},
  {key:'mud',    name:'Schlamm',   col:['#6e5d40','#68583b'],           cost:{inf:1.6,veh:3.2, amph:1.4}, cover:0,    build:false},
  {key:'town',   name:'Ortschaft', col:['#86826f','#7f7b69'],           cost:{inf:1,  veh:1.4, amph:1.4}, cover:0.45, build:false},
  {key:'water',  name:'Fluss',     col:['#3b6176','#395d71'],           cost:{inf:Infinity,veh:Infinity, amph:1.6}, cover:0, build:false},
  {key:'bridge', name:'Brücke',    col:['#6f6252'],                     cost:{inf:1,  veh:1, amph:1},   cover:0,    build:false},
  {key:'meadow', name:'Wiese',     col:['#5d8a3a','#61903d','#588536'], cost:{inf:1,  veh:1, amph:1},   cover:0,    build:true},
];
export const T = {GRASS:0, FOREST:1, MUD:2, TOWN:3, WATER:4, BRIDGE:5, MEADOW:6};
/** freie, bebaubare Ebene (Steppe oder Wiese) */
export const isPlain = t => t===T.GRASS || t===T.MEADOW;
// ---------- Schaden: Waffentyp gegen Panzerung ----------
// air = tieffliegende Drohnen, airHigh = hochfliegende (nur Flugabwehr, schwach Maschinenkanone); 0 heißt: kann dieses Ziel gar nicht bekämpfen
export const DAMAGE = {
  bullet:     {none:1.0,  light:0.18, heavy:0.03, building:0.15, fort:0.06, air:0.45, airHigh:0},   // Gewehre kratzen Panzer kaum
  autocannon: {none:0.9,  light:0.8, heavy:0.25, building:0.4,  fort:0.25, air:1.0, airHigh:0.12},
  hellfire:   {none:1.6,  light:1.0, heavy:0.45, building:0.35, fort:0.2,  air:0, airHigh:0},     // Reaper: Präzisionsraketen von oben – tödlich für Schützen
  shell:      {none:0.5,  light:1.0, heavy:1.0,  building:0.9,  fort:0.4, air:0, airHigh:0},
  missile:    {none:0.15, light:1.0, heavy:0.9,  building:0.6,  fort:0.35, air:0, airHigh:0},
  rocket:     {none:0.6,  light:0.7, heavy:0.35, building:1.0,  fort:0.6,  air:0, airHigh:0},
  drone:      {none:0.7,  light:5.0, heavy:10,   building:0.5,  fort:0.35, air:0, airHigh:0},   // Kamikaze von oben: ein Treffer zerstört Panzer und Raketenwerfer (Käfig schützt)
  flak:       {none:0.3,  light:0.2, heavy:0.05, building:0.05, fort:0.03, air:2.0, airHigh:0.8},
  mine:       {none:0.3,  light:1.3, heavy:1.0,  building:0,    fort:0,    air:0,   airHigh:0},
  ballistic:  {none:0.8,  light:1.0, heavy:0.8,  building:1.3,  fort:0.9,  air:0,   airHigh:0},     // ballistische Rakete: Flächenschaden, stark gegen Gebäude
  glide:      {none:0.8,  light:1.0, heavy:0.9,  building:1.3,  fort:0.9,  air:0,   airHigh:0},     // Gleit-/Freifallbombe
  sam:        {none:0,    light:0,   heavy:0,    building:0,    fort:0,    air:2.5, airHigh:1.2},   // Flugabwehrrakete
};
export const canHit=(w,t)=>{ const air=t.kind==='unit'&&t.def.cls==='air'; if(w.airOnly) return air; return (DAMAGE[w.type][t.armor]||0)>0; };
// ---------- Geländeausbau (Graben, Stacheldraht) ----------
export const FEAT = {NONE:0, WIRE:1, TRENCH:2, MINE:3};
// Pioniere: bauen Verteidigung vor Ort, legen und räumen Minen
export const PIONEER = {
  workTime: 2.5,        // Bauzeit einer Stellung = time × workTime (ein Pionier)
  maxPerSite: 2,
  clearTime: 3,         // Sekunden, um eine feindliche Mine in der Nähe zu räumen
  detect: 1.6,          // so nah muss ein Pionier an eine feindliche Mine
  mineDmg: 300,         // Schaden einer Panzermine am auslösenden Fahrzeug
  mineSplash: 0.9,
};
// Straße: wird geplant (gezogen) und von Bauarbeitern gebaut
export const FEATURES = {
  road:   {id:0, name:'Straße', cost:{stone:2}, desc:'Startpunkt antippen, dann Endpunkt – der Weg wird automatisch geplant. Einheiten sind auf Straßen fast doppelt so schnell, Waren kommen schneller an.', road:true},
  wire:   {id:1, name:'Stacheldraht',  cost:{money:15}, work:2.5, desc:'Bremst Infanterie stark, Fahrzeuge walzen ihn platt', line:true},
  trench: {id:2, name:'Schützengraben',cost:{money:30}, work:6, desc:'Infanterie darin: 60 % Deckung · bremst Fahrzeuge stark', line:true},
  atmine: {id:3, name:'Panzermine',    cost:{money:40, metal:5}, work:3, desc:'Für Feinde unsichtbar; zerstört bzw. beschädigt schwer jedes feindliche Fahrzeug, das darüber fährt', line:true},
};
// ---------- Einheiten ----------
export const UNITS = {
  worker:{name:'Bauarbeiter', cls:'inf', cost:{money:90, pop:1}, time:8, hp:40, armor:'none', speed:1.45, sight:4, size:0.3,
          worker:true, prod:'hq', req:[], desc:'Baut Gebäude und Straßen – mehr Arbeiter, schnellerer Bau'},
  pioneer:{name:'Pioniere', cls:'inf', cost:{money:150, pop:3}, time:8, hp:85, armor:'none', speed:1.3, sight:6, size:0.4, pioneer:true,
          weapon:{type:'bullet', dmg:5, range:3.5, rof:1.2}, prod:'barracks', req:[], desc:'Bauen Mauern, Gräben, Stacheldraht, Minen und Stellungen vor Ort; räumen feindliche Minen'},
  inf:   {name:'Schützentrupp', cls:'inf', cost:{money:100, pop:5}, time:4, hp:90, armor:'none', speed:1.25, sight:6, size:0.4,
          weapon:{type:'bullet', dmg:9, range:4, rof:0.9}, prod:'barracks', req:[], desc:'Günstig, stark in Wald und Ortschaften'},
  at:    {name:'Panzerabwehr', cls:'inf', cost:{money:200, metal:20, pop:5}, time:6, hp:80, armor:'none', speed:1.15, sight:6, size:0.4,
          weapon:{type:'missile', dmg:65, range:6, rof:3.2}, prod:'barracks', req:[], desc:'Lenkflugkörper gegen Fahrzeuge, reicht weiter als Panzer'},
  ifv:   {name:'Schützenpanzer', cls:'veh', cost:{money:300, metal:60, oil:40, pop:4}, time:11, hp:320, upkeep:0.05, combat:true, armor:'light', speed:2.3, sight:7, size:0.6,
          weapon:{type:'autocannon', dmg:15, range:5, rof:0.5}, prod:'factory', req:[], desc:'Schnell, gut gegen Infanterie'},
  mbt:   {name:'Kampfpanzer', cls:'veh', cost:{money:450, metal:120, oil:70, pop:4}, time:20, hp:650, upkeep:0.1, combat:true, armor:'heavy', speed:1.55, sight:7, size:0.72,
          weapon:{type:'shell', dmg:70, range:5.5, rof:2.4}, prod:'factory', req:[], desc:'Schwer gepanzert, knackt Fahrzeuge'},
  spaag: {name:'Flakpanzer', cls:'veh', tech:1, cost:{money:400, metal:70, oil:30, pop:3}, time:12, hp:300, upkeep:0.06, combat:true, armor:'light', speed:2.0, sight:8, size:0.62, radar:8.5,
          weapon:{type:'flak', dmg:20, range:8, rof:0.4, airOnly:true}, prod:'factory', req:[], desc:'Mobile Flugabwehr mit kleinem Radar – Begleitschutz gegen Drohnen'},
  jammer:{name:'Störsender', cls:'veh', tech:1, cost:{money:350, metal:40, oil:20, pop:2}, time:10, hp:220, upkeep:0.04, armor:'light', speed:1.9, sight:7, size:0.6, jam:true,
          prod:'factory', req:[], desc:'Elektronische Kampfführung: feindliche FPV-Drohnen in der Nähe verlieren die Verbindung und stürzen ab'},
  nuke:  {name:'Atomrakete', cls:'stored', cost:{money:15000, metal:1500, oil:800}, time:600, prod:'silo', req:['enrich'], stored:true, hp:1, armor:'none', speed:0, sight:0, size:0,
          desc:'Vernichtet alles im Umkreis von 9 Feldern und verstrahlt das Gebiet. Schon der Besitz schreckt Angreifer ab.'},
  diplomat:{name:'Diplomat', cls:'inf', cost:{money:200, pop:1}, time:10, hp:50, armor:'none', speed:1.45, sight:5, size:0.3, diplomat:true,
          prod:'kontor', req:[], desc:'Reist zum Rathaus einer anderen Macht und eröffnet dort eine Botschaft – Voraussetzung für Handelsverträge'},
  caravan:{name:'Handelskarawane', cls:'veh', cost:{money:0}, time:0, hp:260, armor:'light', speed:1.8, sight:5, size:0.62, caravan:true,
          prod:null, desc:'Bringt Waren eines Handelsvertrags ans Ziel – kann überfallen werden'},
  truck: {name:'Tanklaster', cls:'veh', cost:{money:400, metal:30, pop:2}, time:10, hp:420, armor:'light', speed:1.7, sight:5, size:0.62,
          harvester:{cap:350, rate:70, unload:200}, prod:'factory', req:['refinery'], desc:'Fördert Öl, bringt es zur Raffinerie'},
  mlrs:  {name:'Raketenwerfer', cls:'veh', tech:2, cost:{money:550, metal:100, oil:60, pop:4}, time:18, hp:260, armor:'light', speed:1.4, sight:7, size:0.66, upkeep:0.08, combat:true,
          weapon:{type:'rocket', dmg:48, range:22, minRange:4, rof:14, salvo:8, splash:1.6, spread:2.0}, prod:'factory', req:[], desc:'Verheerende Salven auf 22 Felder – aber nur auf Ziele, die gerade aufgeklärt sind (Drohnen, Späher)'},
  drone: {name:'FPV-Kamikazedrohne', cls:'air', tech:2, cost:{money:120, metal:15, pop:1}, time:4, hp:30, armor:'air', speed:4.5, sight:9, size:0.35, battery:90,
          weapon:{type:'drone', dmg:80, range:0.45, rof:1, kamikaze:true, splash:0.7}, prod:'droneshop', req:[], desc:'Tieffliegend, schwebt an ihrem Posten; in Lauerstellung (🎯) stürzt sie sich auf Feinde in Sicht'},
  spy:   {name:'Spionagedrohne', cls:'air', tech:1, cost:{money:220, metal:20, pop:1}, time:6, hp:60, armor:'airHigh', speed:3.4, sight:13, size:0.35, battery:420,
          prod:'droneshop', req:[], desc:'Hochfliegend und getarnt, unbewaffnet, sieht sehr weit – auf Aufklärungsflug (🛰) erkundet sie selbstständig die Karte'},
  reaper:{name:'Reaper-Drohne', cls:'air', tech:3, cost:{money:900, metal:120, oil:60, pop:2}, time:16, hp:420, armor:'airHigh', speed:2.6, sight:12, size:0.6, battery:480,
          weapon:{type:'hellfire', dmg:70, range:7, rof:3.5}, prod:'droneshop', req:[], desc:'Hochfliegend und getarnt, gepanzert, Präzisionsraketen gegen Schützen – auf Aufklärungsflug (🛰) jagt sie selbstständig feindliche Infanterie'},
  tel:   {name:'Raketen\u00ADträger', cls:'veh', cost:{money:1600, metal:220, oil:120, pop:3}, time:20, hp:280, armor:'light', speed:1.4, sight:5, size:0.75, combat:true, upkeep:0.2, research:'rocketry',
          weapon:{type:'ballistic', dmg:650, range:40, minRange:8, rof:50, splash:2.2}, prod:'factory', req:[], desc:'Ballistische Kurzstreckenrakete: 40 Felder weit, verheerend gegen Gebäude – nur auf aufgeklärte Ziele, lange Nachladezeit'},
  swarm: {name:'Drohnen\u00ADschwarm', cls:'air', cost:{money:1000, metal:100, pop:2}, time:12, hp:176, armor:'air', speed:3.0, sight:7, size:0.6, battery:150, swarm:8, research:'swarm',
          weapon:{type:'drone', dmg:80, range:0.45, rof:0.6, kamikaze:true, splash:0.6}, prod:'droneshop', req:[], desc:'Acht autonome Kamikazedrohnen: suchen sich selbst Ziele, Störsender wirken nicht – Flugabwehr und MGs dünnen sie aus'},
  jet:   {name:'Jagd\u00ADbomber', cls:'air', cost:{money:1800, metal:200, oil:150, pop:2}, time:22, hp:320, armor:'air', speed:6.5, sight:8, size:0.8, upkeep:0.3, sortie:true, research:'aviation',
          weapon:{type:'glide', dmg:650, range:2, rof:2, splash:1.9, glide:true}, prod:'airbase', req:[], desc:'Fliegt vom Fliegerhorst zum Ziel, wirft eine Bombe und kehrt zum Nachladen zurück – mit Gleitbomben aus großer Entfernung'},
  apc:   {name:'Mannschafts\u00ADtransporter', cls:'veh', tech:1, cost:{money:350, metal:50, oil:30, pop:2}, time:10, hp:380, armor:'light', speed:2.4, sight:6, size:0.65, combat:true, upkeep:0.05, carry:4,
          weapon:{type:'bullet', dmg:9, range:4.5, rof:0.6}, prod:'factory', req:[], desc:'Bringt bis zu 4 Trupps Infanterie schnell und geschützt an die Front – Schützen wählen und den Transporter antippen'},
  amphib:{name:'Amphibien\u00ADpanzer', cls:'veh', move:'amph', cost:{money:550, metal:80, oil:50, pop:3}, time:14, hp:360, armor:'light', speed:2.0, sight:6, size:0.7, combat:true, upkeep:0.06, carry:2, research:'amphibious',
          weapon:{type:'autocannon', dmg:13, range:5, rof:0.55}, prod:'factory', req:[], desc:'Fährt durch Flüsse und Schlamm – umgeht Brücken und Sperren, nimmt 2 Trupps Infanterie mit'},
  para:  {name:'Fallschirm\u00ADjäger', cls:'inf', cost:{money:180, pop:5}, time:6, hp:100, armor:'none', speed:1.3, sight:7, size:0.4, research:'airborne',
          weapon:{type:'bullet', dmg:10, range:4, rof:0.85}, prod:'airbase', req:[], desc:'Elite-Infanterie: am Fliegerhorst wählen, ✈ Absprung tippen und ein erkundetes Ziel – sie landen hinter den feindlichen Linien'},
  volunteer:{name:'Bürgerwehr', cls:'inf', cost:{pop:4}, time:3, hp:75, armor:'none', speed:1.2, sight:5, size:0.38, emergency:true,
          weapon:{type:'bullet', dmg:7, range:3.8, rof:1.0}, prod:'hq', req:[], desc:'Kostenlose Freiwillige – nur wenn die Stadt angegriffen wird oder Krieg herrscht; löst sich danach wieder auf'},
  militia:{name:'Milizionäre', cls:'inf', cost:{money:150}, time:0, hp:75, armor:'none', speed:1.3, sight:6, size:0.4,
          weapon:{type:'bullet', dmg:8, range:4, rof:0.95}, prod:null, desc:'Kämpfer der Grenzmiliz'},
  bandit: {name:'Räuber', cls:'inf', cost:{money:0}, time:0, hp:70, armor:'none', speed:1.35, sight:6, size:0.4,
          weapon:{type:'bullet', dmg:7, range:4, rof:1.0}, prod:null, desc:'Überfällt Arbeiter, Laster und Außenposten'},
  // Drohnen und Raketenwerfer: siehe drawUnitShape
};
// ---------- Gebäude ----------
// cap = Wohnraum, food/metal = Produktion pro Sekunde, needsOre = muss an Erz grenzen
export const BUILDINGS = {
  hq:      {name:'Rathaus',       w:3,h:3, hp:1800, power:30,  cost:{}, time:0, buildable:false, cap:40, food:0.5, sight:8, desc:'Bildet Bauarbeiter aus, 40 Wohnraum, Rathauswache mit MG',
            weapon:{type:'bullet', dmg:9, range:5.5, rof:0.6}},
  house:   {name:'Wohnhaus',      w:2,h:2, hp:450,  power:-10, cost:{money:150, wood:40}, time:5, req:[], cap:50, sight:3, desc:'+50 Wohnraum'},
  farm:    {name:'Bauernhof',     w:3,h:2, hp:450,  power:0,   cost:{money:150, wood:50}, time:6, req:[], food:2.5, sight:3, desc:'+2,5 Nahrung/s'},
  forester:{name:'Forst\u00ADhaus',  w:2,h:2, hp:350,  power:0,   cost:{money:150, wood:20}, time:5, req:[], forester:true, sight:4, desc:'Pflanzt Bäume im Umkreis von 4 Feldern – nach 7 Minuten ist daraus Wald geworden'},
  lumber:  {name:'Holzfäller',    w:2,h:2, hp:400,  power:0,   cost:{money:120}, time:5, req:[], wood:1.0, needsForest:true, noise:0.1, sight:4, desc:'Holz, muss am Wald stehen (fällt ihn nach und nach)'},
  quarry:  {name:'Steinbruch',    w:2,h:2, hp:550,  power:-5,  cost:{money:150, wood:30}, time:6, req:[], stone:0.8, needsRock:true, noise:0.3, sight:4, desc:'Stein, nur direkt an Felsen'},
  block:   {name:'Wohnblock',     w:2,h:2, hp:700,  power:-20, cost:{money:500, wood:20, stone:120, metal:20}, time:14, req:[], research:'urban', cap:150, sight:3, desc:'150 Wohnraum auf kleiner Fläche'},
  greenhouse:{name:'Gewächshaus', w:2,h:2, hp:400,  power:-30, cost:{money:600, wood:40, stone:60, metal:60}, time:12, req:[], research:'glass', food:5, noise:0.05, sight:3, desc:'+5 Nahrung/s ohne Äcker'},
  datacenter:{name:'Rechen\u00ADzentrum', w:2,h:2, hp:600, power:-150, cost:{money:2500, stone:100, metal:200}, time:20, req:['university'], research:'computing', noise:0.1, sight:3, desc:'Forschung +50 % (bis zu zwei)'},
  npp:     {name:'Kern\u00ADkraftwerk', w:3,h:3, hp:1500, power:600, cost:{money:6000, stone:400, metal:400}, time:40, req:[], research:'physics', noise:0.3, sight:5, desc:'+600 Strom – wird es zerstört, kommt es zur Kernschmelze'},
  enrich:  {name:'Anreicherungs\u00ADanlage', w:3,h:2, hp:900, power:-400, cost:{money:8000, stone:300, metal:600}, time:40, req:[], research:'bomb', noise:0.3, sight:4, desc:'Uran für Atomwaffen – braucht enorm viel Strom'},
  silo:    {name:'Raketen\u00ADsilo', w:2,h:2, hp:1200, power:-50, cost:{money:5000, stone:400, metal:400}, time:30, req:['enrich'], research:'bomb', sight:4, desc:'Baut und startet Atomraketen'},
  park:    {name:'Park',          w:2,h:2, hp:300,  power:0,   cost:{money:200, wood:20}, time:5, req:[], fun:120, sight:3, desc:'Unterhaltung für 120 Einwohner'},
  theater: {name:'Theater',       w:2,h:2, hp:600,  power:-15, cost:{money:900, wood:60, stone:150}, time:14, req:[], fun:350, sight:3, desc:'Unterhaltung für 350 Einwohner'},
  pool:    {name:'Schwimm\u00ADbad',  w:3,h:2, hp:600,  power:-30, cost:{money:1400, stone:200, metal:40}, time:18, req:[], fun:600, sight:3, desc:'Unterhaltung für 600 Einwohner'},
  stadium: {name:'Stadion',       w:3,h:3, hp:1200, power:-40, cost:{money:3500, stone:500, metal:150}, time:30, req:[], research:'urban', fun:1600, noise:0.2, sight:4, desc:'Unterhaltung für 1600 Einwohner'},
  firest:  {name:'Feuer\u00ADwache',  w:2,h:2, hp:700,  power:-10, cost:{money:600, wood:40, stone:80}, time:10, req:[], fireR:11, sight:4, desc:'Löscht Brände im Umkreis von 11 Feldern schnell und verhindert, dass sie übergreifen'},
  depot:   {name:'Lagerhaus',     w:2,h:2, hp:600,  power:0,   cost:{money:250, wood:60, stone:40}, time:6, req:[], sight:3, desc:'+1000 Lagerplatz für jeden Rohstoff'},
  power:   {name:'Kraftwerk',     w:2,h:2, hp:600,  power:100, cost:{money:250, stone:40}, time:6, req:[], noise:0.3, sight:4, desc:'+100 Strom'},
  mine:    {name:'Mine',          w:2,h:2, hp:650,  power:-20, cost:{money:300, wood:30, stone:20}, time:8, req:[], metal:1.5, needsOre:true, noise:0.35, sight:4, desc:'Metall, nur direkt an Erz'},
  airbase: {name:'Flieger\u00ADhorst',  w:4,h:3, hp:1600, power:-40, cost:{money:3000, stone:300, metal:300}, time:30, req:['factory'], research:'aviation', noise:0.5, sight:6, desc:'Startbahn und Hangars: baut Jagdbomber, die hier nach jedem Einsatz neu bewaffnet werden'},
  derrick: {name:'Bohrturm',      w:2,h:2, hp:600,  power:-40, cost:{money:1500, stone:100, metal:150}, time:20, req:[], research:'deepdrill', oilOut:1.2, noise:0.3, sight:4, desc:'Fördert 1,2 Öl/s aus der Tiefe – überall baubar, braucht Strom'},
  refinery:{name:'Raffinerie',    w:3,h:2, hp:900,  power:-30, cost:{money:700, stone:60}, time:11, req:['power'], spawn:'truck', noise:0.4, sight:5, refine:3, tank:800, desc:'Verarbeitet Rohöl (3 Öl/s), inkl. Tanklaster'},
  barracks:{name:'Kaserne',       w:2,h:2, hp:700,  power:-20, cost:{money:200, wood:40, stone:20}, time:7, req:['power'], noise:0.15, sight:5, desc:'Bildet Infanterie aus'},
  factory: {name:'Fahrzeugwerk',  w:3,h:3, hp:1100, power:-40, cost:{money:1800, metal:180, stone:160}, time:20, req:['barracks'], noise:0.35, sight:5, desc:`Baut Fahrzeuge (max. ${VEH_PER_FACTORY} Kampffahrzeuge je Werk)`},
  kontor:  {name:'Handelskontor', w:2,h:2, hp:600, power:-10, cost:{money:400, wood:60}, time:9, req:[], noise:0.15, sight:4, export:4,
            desc:'Exportiert Überschüsse automatisch gegen Geld'},
  university:{name:'Universität', w:3,h:2, hp:700, power:-30, cost:{money:900, metal:60, stone:120}, time:16, req:['power'], sight:4, desc:'Forschung: Stufe 1, ausbaubar bis Stufe 3'},
  droneshop:{name:'Drohnen\u00ADwerkstatt',w:2,h:2, hp:550, power:-20, cost:{money:1300, metal:120, stone:100}, time:14, req:['barracks'], tech:1, noise:0.15, sight:5, desc:`Baut FPV-Drohnen (max. ${DRONES_PER_SHOP} je Werkstatt)`},
  // --- Verteidigung (def:true): direkt auf der Karte platzieren, Stellungen brauchen danach Bauzeit ---
  wall:    {name:'Betonmauer',    w:1,h:1, hp:1000, power:0,   cost:{money:20, stone:10},  time:3, req:[], def:true, line:true, sight:1, desc:'Blockiert Bodentruppen, hält viel aus'},
  sentry:  {name:'Selbstschuss\u00ADanlage', w:1,h:1, hp:420, power:-5, cost:{money:150, stone:10}, time:6, req:[], def:true, noise:0.05, sight:6, desc:'Automatisches MG gegen Infanterie und Drohnen',
            weapon:{type:'bullet', dmg:10, range:4.5, rof:0.35}},
  atpost:  {name:'Panzer\u00ADabwehr\u00ADstellung', w:1,h:1, hp:650, power:-5, cost:{money:260, metal:40, stone:30}, time:8, req:['barracks'], def:true, noise:0.05, sight:7, desc:'Eingegrabene Lenkraketen gegen Panzer – das Rückgrat jeder Grenzbefestigung',
            weapon:{type:'missile', dmg:100, range:7, rof:3.0}},
  turret:  {name:'MK-Stellung',   w:1,h:1, hp:750,  power:-15, cost:{money:300, metal:30, stone:20}, time:8, req:['barracks'], def:true, noise:0.1, sight:7, desc:'Maschinenkanone gegen Fahrzeuge, Infanterie und Drohnen',
            weapon:{type:'autocannon', dmg:17, range:6, rof:0.55}},
  sam:     {name:'Flugabwehr\u00ADraketen', w:1,h:1, hp:600, power:-20, cost:{money:900, metal:120, stone:40}, time:10, req:['barracks'], research:'airdef', def:true, noise:0.1, sight:10, radar:10, desc:'Holt Flugzeuge und Drohnen vom Himmel und fängt ballistische Raketen und Gleitbomben mit Chance ab',
            weapon:{type:'sam', dmg:120, range:10, rof:2.5, airOnly:true}},
  flak:    {name:'Flugabwehr',    w:1,h:1, hp:450,  power:-15, cost:{money:250, metal:25, stone:20}, time:7, req:['barracks'], def:true, noise:0.1, sight:9, radar:9, desc:'Holt Drohnen vom Himmel; ihr Radar entdeckt getarnte Hochflieger im Umkreis von 9 Feldern',
            weapon:{type:'flak', dmg:24, range:8, rof:0.4, airOnly:true}},
  gbunker: {name:'Grenz\u00ADbunker',  w:2,h:2, hp:3200, power:0, cost:{money:1200, stone:300, metal:120}, time:20, req:['barracks'], def:true, border:true, fireproof:true, sight:8, desc:'Betonbunker an der Grenze – hält enorm viel aus, sichert das Vorfeld',
            weapon:{type:'autocannon', dmg:16, range:6.5, rof:0.5}},
  bunker:  {name:'Milizbunker',   w:2,h:2, hp:1400, power:0,   cost:{}, time:0, buildable:false, sight:7,
            weapon:{type:'bullet', dmg:13, range:5.5, rof:0.5}},
  camp:    {name:'Räuberlager',   w:2,h:2, hp:900,  power:0,   cost:{}, time:0, buildable:false, sight:6, desc:'Unterschlupf einer Räuberbande – zerstören bringt Beute'},
};
// ---------- Parteien ----------
export const FACTIONS = [
  {name:'Republik Aldoria',      short:'Aldoria',  leader:'Ihr',             col:'#4f86d6', dark:'#1d3f73'},
  {name:'Föderation Kastrova',   short:'Kastrova', leader:'Marschall Varek', col:'#cc4a3c', dark:'#6e1d15'},
  {name:'Grenzmiliz von Belgor', short:'Miliz',    leader:'Hauptmann Dorin', col:'#c9a640', dark:'#6a5317'},
  {name:'Räuberbanden',          short:'Räuber',   leader:'–',               col:'#8a8a82', dark:'#3a3a34'},
];
// ---------- Einsätze ----------
export const MISSION = {
  digTime: 6,           // Sekunden, bis sich Truppen in Stellung eingegraben haben
  dugInf: 0.55,         // Schadensfaktor eingegrabener Infanterie
  dugVeh: 0.75,         // … und eingegrabener Fahrzeuge
  clearR: 7,            // Umkreis „Gebiet klären“
  assaultR: 10,         // Umkreis „Angriff“
  scoutR: 10,           // Umkreis der Gebietsaufklärung von Drohnen
  quiet: 4,             // so lange ohne Feind, dann gilt das Gebiet als geklärt
};
// ---------- Schutz teurer Waffen ----------
export const CAGE = {
  cost:{money:80, metal:20},   // Gitterkäfig je Fahrzeug, nachrüsten nahe dem Fahrzeugwerk
  range: 8,
  drone: 0.3, missile: 0.7, rocket: 0.85,   // Schadensfaktoren mit Käfig
  speed: 0.9,
};
export const JAM = { radius: 5.5, crashPerSec: 0.45 };   // Störsender: FPV-Drohnen im Umkreis verlieren die Verbindung
// ---------- Handelsverträge ----------
export const TRADE = {
  period: 60,           // Sekunden zwischen zwei Lieferungen
  amounts: [50,100,200],
  margin: 1.1,          // die Gegenseite will mindestens 10 % Vorteil (nach ihrem Bedarf bewertet)
  missLimit: 2,         // so viele ausgefallene Lieferungen, dann kündigt die Gegenseite
  maxContracts: 3,
  loot: 0.7,            // Anteil der Ladung, den ein Angreifer bei einer zerstörten Karawane erbeutet
};
// ---------- Drohnen ----------
// Luftwaffe: Gleitbomben vergrößern die Abwurfweite; nach jedem Einsatz zum Fliegerhorst zurück
export const AIR = {dropRange:40, dropSpeed:7, dropMax:6, dropAA:{flak:0.12, sam:0.3, spaag:0.12}, glideExtra:12, rearm:25, perBase:4, swarmSize:8, swarmHp:22, swarmRangeExtra:8, interceptR:9, intercept:0.55};
export const DRONE = {
  hoverDrain: 0.3,      // Akkuverbrauch beim Schweben (Anteil vom Flug)
  returnAt: 0.25,       // unter diesem Akkustand fliegen Drohnen selbstständig zum Laden heim
  fpvRange: 16,         // Funkreichweite der FPV-Drohnen ab eigenen Gebäuden (auch Grenzbunker) – sie wirken im Grenzgebiet
  fpvRangeAI: 10,       // zusätzliche Reichweite mit erforschter KI (autonome Drohnen)
};
// ---------- Räuber ----------
export const BANDITS = {
  camps: [[9,13],[15,27],[26,40],[3,36]],   // Lager im Entwurfsmaß (64er-Karte, Aldoria-Seite), werden gespiegelt
  guard: 3,             // Räuber je Lager zu Beginn
  max: 6,               // höchstens so viele je Lager (wächst mit der Zeit)
  spawn: 35,            // Sekunden bis Nachschub
  territory: 9,         // in diesem Umkreis ums Lager wird jeder angegriffen
  raidRange: 18,        // Überfälle auf Gebäude bis zu dieser Entfernung
  raidEvery: [150,240], // Sekunden zwischen Überfällen (zufällig)
  firstRaid: [600,720], // Schonfrist: erster Überfall frühestens nach 10 Minuten
  warn: 60,             // so viele Sekunden vorher melden Späher den Überfall
  plunder: {money:0.15, moneyMax:200, food:80, wood:50, stone:40, metal:20},   // Raub je Überfall (Geld: Anteil, gedeckelt)
  guardR: 22,           // untätige Soldaten in diesem Umkreis rücken bei einer Vorwarnung als Stadtwache aus
  loot: {money:500, wood:120, stone:80, metal:40},   // Beute beim Zerstören eines Lagers
};
// ---------- KI ----------
// incomeMul: Wirtschaftsbonus der KI, grace: Sekunden ohne Aggression, aggr: Angriffslust
export const DIFFICULTY = {
  leicht: {incomeMul:0.85, grace:300, think:1.5, aggr:0.7},
  mittel: {incomeMul:1.0,  grace:200, think:1.0, aggr:1.0},
  schwer: {incomeMul:1.2,  grace:120, think:0.7, aggr:1.35},
};
export const AI_MIX2 = ['tel','swarm','jet','amphib','para'];   // Spätzeit-Waffen der KI, sobald erforscht
export const AI_MIX = ['inf','inf','ifv','at','drone','inf','mbt','spaag','drone','apc','ifv','at','jammer','mlrs','reaper','drone','mbt'];
// ---------- Regionen: jede Stadt hat einen Engpass und einen Überschuss (pro Spiel zufällig, gegenseitig ergänzend) ----------
// Jede Stadt ist bei zwei Rohstoffen reich und bei zwei knapp; Kastrova genau umgekehrt. Der fünfte ist normal.
export const REGION = {
  res:     ['food','wood','stone','metal','oil'],
  scarce:  {food:'kaum grüne Wiesen (Höfe auf karger Steppe)', wood:'kaum Wald in Stadtnähe', stone:'keine Felsen in Stadtnähe', metal:'kaum Erz in Stadtnähe', oil:'keine Ölfelder in Stadtnähe'},
  rich:    {food:'fruchtbare grüne Wiesen', wood:'dichte Wälder', stone:'viele Felsen', metal:'reiche Erzvorkommen', oil:'reiche Ölfelder'},
};
// Handel zwischen den Städten: Grundwert je Einheit, Losgröße
export const BASEVAL = {food:2.2, wood:1.6, stone:1.8, metal:4.5, oil:1.6};
// Handelskontor: verkauft nur, was über der Reserve liegt; Exportpreis je Einheit
export const EXPORT = {order:['oil','metal','stone','wood','food'], reserve:{oil:300, metal:250, stone:300, wood:300, food:400}, price:{oil:1.1, metal:2.8, stone:1.0, wood:0.8, food:1.4}};
// Tribut, den Aldoria von Kastrova fordert: Furcht (Stärke, Atomwaffe, verlorener Krieg) gegen Schmerz (Wert, Land, Dauer)
export const TRIBUTE = {money:[300,800,2000], res:[100,250,500], every:60, cool:120, landR:5, landMax:4,
  accept:0.2, superiority:1.0, nuke:1.5, losingWar:0.6, ally:0.3, pain:4, land:1.0, landEach:0.15, recurring:0.5, grudge:20, angry:15, revenge:600};
export const LOT = {food:100, wood:100, stone:80, metal:50, oil:100};
// Forschungsbaum: Universität Stufe 1 = gebaut; alles Weitere wird in der Universität erforscht.
// need = vorher erforscht, needB = Gebäude muss stehen, power = forscht nur ohne Stromengpass
export const RESEARCH = {
  res2:   {name:'Forschung Stufe 2', icon:'🎓', level:2, cost:{money:1500, metal:150}, time:180, need:[], desc:'Schaltet FPV-Kamikazedrohnen und Raketenwerfer frei'},
  res3:   {name:'Forschung Stufe 3', icon:'🎓', level:3, cost:{money:2400, metal:250, oil:150}, time:300, need:['res2'], desc:'Schaltet die Reaper-Drohne frei'},
  fert:   {name:'Düngemittel', icon:'🌾', cost:{money:1200, metal:60}, time:150, need:['res2'], desc:'Alle Bauernhöfe bringen 50 % mehr Ertrag'},
  glass:  {name:'Gewächshäuser', icon:'🥬', cost:{money:2000, metal:120, stone:200}, time:200, need:['fert','res3'], desc:'Gewächshaus: ernährt 250 Einwohner auf 2×2 Feldern ohne Äcker (braucht viel Strom)'},
  urban:  {name:'Stadtplanung', icon:'🏙', cost:{money:1500, stone:200}, time:150, need:['res2'], desc:'Wohnblock: 150 Einwohner auf 2×2 Feldern'},
  physics:{name:'Kernphysik', icon:'⚛', cost:{money:4000, metal:300}, time:300, need:['res3'], desc:'Kernkraftwerk: +600 Strom – zerstört verstrahlt es die Umgebung'},
  computing:{name:'Informatik', icon:'💻', cost:{money:3000, metal:200}, time:240, need:['res3'], desc:'Rechenzentrum: beschleunigt die Forschung, braucht viel Strom'},
  ai:     {name:'Künstliche Intelligenz', icon:'🧠', cost:{money:8000, metal:400}, time:600, need:['computing'], needB:['datacenter'], power:true, desc:'Autonome FPV-Drohnen (Störsender wirkungslos, +10 Felder Reichweite), alle Betriebe und Werke 15 % schneller – Voraussetzung fürs Atomprogramm'},
  biofuel:{name:'Biokraftstoff', icon:'🌽', cost:{money:1500, metal:80}, time:180, need:['fert'], desc:'Raffinerien machen aus überschüssiger Nahrung Öl, wenn kein Rohöl da ist (2 🌾 → 1 🛢)'},
  deepdrill:{name:'Tiefbohrung', icon:'🛢', cost:{money:2500, metal:200}, time:240, need:['res3'], desc:'Bohrturm: fördert Öl aus tiefen Lagerstätten – auch wenn die Ölfelder erschöpft sind'},
  amphibious:{name:'Amphibische Kriegführung', icon:'🌊', cost:{money:1500, metal:120}, time:150, need:['res2'], desc:'Amphibienpanzer: fahren durch Flüsse und umgehen Brücken und Grenzbefestigungen'},
  airborne:{name:'Luftlandetruppen', icon:'🪂', cost:{money:2000, metal:100}, time:180, need:['aviation'], desc:'Fallschirmjäger: springen hinter den feindlichen Linien ab – Flugabwehr auf dem Weg ist gefährlich'},
  airdef: {name:'Luftverteidigung', icon:'🛡', cost:{money:1800, metal:150}, time:180, need:['res2'], desc:'Flugabwehrraketen-Stellung: holt Flugzeuge und Drohnen vom Himmel, fängt Raketen und Gleitbomben mit Chance ab'},
  rocketry:{name:'Raketentechnik', icon:'🚀', cost:{money:3000, metal:250, oil:100}, time:240, need:['res3'], desc:'Raketenträger mit ballistischen Kurzstreckenraketen (40 Felder weit)'},
  aviation:{name:'Luftfahrt', icon:'✈', cost:{money:3500, metal:300, oil:150}, time:300, need:['res3'], needB:['factory'], desc:'Fliegerhorst und Jagdbomber (Freifallbomben – müssen das Ziel überfliegen)'},
  glidebomb:{name:'Gleitbomben', icon:'🎯', cost:{money:2500, metal:200}, time:200, need:['aviation','computing'], desc:'Jagdbomber werfen aus 14 Feldern Entfernung – außerhalb der meisten Flugabwehr'},
  swarm:  {name:'Drohnenschwärme', icon:'🐝', cost:{money:3000, metal:200}, time:240, need:['computing'], desc:'Drohnenschwarm: acht autonome Kamikazedrohnen in einer Einheit'},
  bomb:   {name:'Atomwaffenprogramm', icon:'☢', cost:{money:12000, metal:800, oil:400}, time:600, need:['physics','ai'], power:true, desc:'Anreicherungsanlage und Raketensilo – die ultimative Abschreckung'},
};
// Biokraftstoff: Nahrung → Öl in der Raffinerie (nur über der Reserve)
export const BIOFUEL = {ratio:2, rate:1.5, reserve:300};
export const RESEARCH_SPEED = {datacenter:0.5, maxDatacenters:2, ai:0.15};
// KI Kastrova: Reihenfolge der Forschung und Mindest-Einwohnerzahl je Schritt
export const AI_RESEARCH = [['res2',140],['fert',200],['urban',220],['airdef',230],['amphibious',250],['res3',240],['biofuel',280],['deepdrill',300],['computing',320],['rocketry',340],['aviation',360],['swarm',380],['airborne',390],['glidebomb',400],['physics',340],['glass',360],['ai',420],['bomb',480]];
// KI und Atomwaffen: Abschreckung dämpft die Angriffslust, Einsatz nur in der Not
export const AI_NUKE = {stock:1, reserve:1500, deterAggr:0.15, blackmail:0.5, ratio:0.6, cool:300};
// ---------- Atomwaffe ----------
export const NUKE = {
  radius: 13, dmg: 4500, speed: 8,     // Sprengradius, Schaden im Zentrum, Flugtempo (Felder/s)
  fallout: 12, falloutTime: 900,       // verstrahlt: kein Bauen, Bodentruppen sterben beim Betreten, Gebäude stehen still
  shock: 900, shockMood: 0.35,         // eigene Bevölkerung nach dem Einsatz
  victimMood: 0.3, victimTime: 600, radiationMood: 0.15,
  meltdown: {radius:4, dmg:1500, fallout:5},   // zerstörtes Kernkraftwerk
  maxStock: 3,
  hqKeep: 0.15,                        // Rathaus (Regierungsbunker) überlebt mit diesem Anteil – erobern müssen Truppen
};
export const TECH_UNLOCKS = {1:'Drohnenwerkstatt, Spionagedrohne', 2:'FPV-Kamikazedrohne, Raketenwerfer', 3:'Reaper-Drohne'};
// ---------- Ausbaustufen: Gebäude direkt am Platz verbessern (spart Fläche) ----------
// Stufe 1 = Grundbau; cap = Wohnraum, food = Faktor auf den Ertrag, research = nötige Forschung
export const UPGRADES = {
  house: [null, {name:'Stadthaus', cap:80, cost:{money:220, wood:30, stone:60}, time:30},
                {name:'Mehrfamilienhaus', cap:120, cost:{money:380, stone:120, metal:20}, time:45, research:'urban'}],
  farm:  [null, {name:'Gutshof', food:1.4, cost:{money:240, wood:40, stone:40}, time:30},
                {name:'Agrarbetrieb', food:1.9, cost:{money:420, stone:60, metal:40}, time:45, research:'fert'}],
};
// Alle übrigen Gebäude (außer Verteidigung, Silo, Anreicherung): Stufe II ×1,4 und Stufe III ×1,9 Leistung
export const LVL_MUL = [1, 1.4, 1.9];
for(const [k,d] of Object.entries(BUILDINGS) as [string,any][]){
  if(UPGRADES[k]||d.def||d.buildable===false&&k!=='hq'||['silo','enrich','wall'].includes(k)) continue;
  const c=d.cost||{}, m=c.money||400;
  UPGRADES[k]=[null,
    {name:'Stufe II', mul:1.4, cost:{money:Math.round(Math.max(150,m*0.8)/10)*10, stone:Math.round((40+(c.stone||0)*0.5)/10)*10, ...(c.metal||m>=1000?{metal:Math.round((10+(c.metal||0)*0.5)/10)*10}:{})}, time:Math.max(20,Math.round((d.time||10)*3))},
    {name:'Stufe III', mul:1.9, cost:{money:Math.round(Math.max(300,m*1.5)/10)*10, stone:Math.round((80+(c.stone||0))/10)*10, metal:Math.round((30+(c.metal||0))/10)*10}, time:Math.max(30,Math.round((d.time||10)*4.5)), research:'res2'}];
}
/** Ausbaustufe eines Gebäudes (1 = Grundbau) und die nächste Stufe */
export const lvlOf = b => b.lvl||1;
export const nextUpgrade = b => { const U=UPGRADES[b.type]; return U&&U[lvlOf(b)]||null; };
/** Wohnraum und Ertragsfaktor unter Berücksichtigung der Ausbaustufe */
export const lvlMul = b => { const U=UPGRADES[b.type], l=lvlOf(b); return l>1&&U&&U[l-1].mul ? U[l-1].mul : 1; };
export const capOf = b => { const U=UPGRADES[b.type], l=lvlOf(b); return l>1&&U&&U[l-1].cap ? U[l-1].cap : Math.round((b.def.cap||0)*lvlMul(b)); };
export const foodMulOf = b => { const U=UPGRADES[b.type], l=lvlOf(b); return l>1&&U&&U[l-1].food ? U[l-1].food : lvlMul(b); };
/** Bewegungsklasse einer Einheit (Amphibien fahren auch durchs Wasser) */
export const mcls = u => u.def.move||u.def.cls;
export const DEF = t => UNITS[t] || BUILDINGS[t] || FEATURES[t] || RESEARCH[t];
/** Forschungs-Fortschritt einer Partei */
export const hasTech = (p,k) => !!(p&&p.done&&p.done[k]);
export const isDefType = t => !!(FEATURES[t] || (BUILDINGS[t]&&BUILDINGS[t].def));
/** Gebäude, die als Baustelle entstehen und von Arbeitern gebaut werden */
export const isSiteType = t => !!(BUILDINGS[t] && !BUILDINGS[t].def && BUILDINGS[t].buildable!==false);

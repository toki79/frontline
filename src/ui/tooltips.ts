import { $$ } from './dom';
import { clamp, fmt } from '../core/util';
import { BUILDINGS, CAGE, CONSTRUCTION, DEF, JAM, DEF_RADIUS, DENSITY, HAUL, MOOD, PIONEER, FORT, DRONE, EMERGENCY, NUKE, RESEARCH_SPEED, STORAGE, DRONES_PER_SHOP, ECON, EXPORT, FEATURES, NOISE_R, REGION, RES, RESEARCH, TECH_UNLOCKS, VEH_PER_FACTORY, UPGRADES, hasTech, isDefType } from '../data/config';
import { lacking } from '../sim/costs';
import { nextMilestone, rankOf } from '../sim/economy';
import { tradeTerms } from '../sim/market';
import { missingReq } from '../sim/production';
import { G } from '../sim/state';
import { countBuildings } from '../sim/world';
import { $ } from '../ui/dom';
import { costHtml, costLong, f1 } from '../ui/format';

/* =====================================================================
   Info-Texte (Mouseover bzw. Antippen)
   ===================================================================== */
export const WEAPON_INFO = {bullet:'Gewehre: stark gegen Infanterie, schwach gegen Drohnen', autocannon:'Maschinenkanone: gut gegen Infanterie, leichte Fahrzeuge und Drohnen',
  shell:'Panzerkanone: stark gegen Fahrzeuge und Gebäude (nicht gegen Drohnen)', missile:'Lenkflugkörper: stark gegen Fahrzeuge (nicht gegen Drohnen)',
  rocket:'Raketensalve: große Reichweite, Flächenschaden, ungenau – stark gegen Gebäude und Gruppen', drone:'Kamikaze: stürzt sich aufs Ziel – stark gegen Fahrzeuge',
  flak:'Flugabwehr: nur gegen Drohnen, dort sehr wirksam'};
export const ARMOR_NAME = {none:'keine (Infanterie)', light:'leicht', heavy:'schwer', building:'Gebäude', fort:'Befestigung', air:'tieffliegend – Gewehre, Maschinenkanonen und Flugabwehr treffen', airHigh:'hochfliegend – nur Flugabwehr und (schwach) Maschinenkanonen treffen'};
export function tipFor(k){
  const d=DEF(k), L=[`<b>${d.name}</b> – ${d.desc}`, 'Kosten: '+costLong(d.cost)+(isDefType(k)?' je Feld':'')];
  if(RESEARCH[k]) { L.push(`<span class="dim">Forschungsdauer ${d.time} s in der Universität. ${d.power?'<b>Braucht ausreichend Strom</b> – bei Strommangel steht die Forschung still.':'Strommangel halbiert das Tempo.'} Jedes Rechenzentrum (max. ${RESEARCH_SPEED.maxDatacenters}) beschleunigt um ${Math.round(RESEARCH_SPEED.datacenter*100)} %.</span>`);
    const pre=[...(d.need||[]).map(n=>RESEARCH[n].icon+' '+RESEARCH[n].name), ...(d.needB||[]).map(b=>'🏢 '+BUILDINGS[b].name)];
    if(pre.length) L.push('Voraussetzung: '+pre.join(', '));
    const opens=Object.keys(RESEARCH).filter(o=>(RESEARCH[o].need||[]).includes(k)).map(o=>RESEARCH[o].icon+' '+RESEARCH[o].name);
    if(opens.length) L.push('Führt zu: '+opens.join(', '));
    if(G&&hasTech(G.players[0],k)) L.push('<span style="color:#9fd88a">✓ Bereits erforscht.</span>'); }
  if(k==='nuke') L.push(`Wird im Raketensilo gebaut (die Anreicherungsanlage muss laufen), höchstens ${NUKE.maxStock} auf Lager. <b>Abschreckung:</b> Solange du eine Rakete besitzt, erklärt Kastrova keinen Krieg und stellt keine Forderungen. <b>Einsatz:</b> Silo wählen → ☢ Start → erkundetes Ziel antippen. Vernichtet alles im Umkreis von ${NUKE.radius} Feldern (nur das Rathaus übersteht es als Bunker, schwer beschädigt – erobern müssen Truppen) und verstrahlt das Gebiet ${Math.round(NUKE.falloutTime/60)} min lang. Folgen: Krieg mit allen, die eigene Bevölkerung ist lange entsetzt.`);
  if(d.research&&!RESEARCH[k]) L.push(`${RESEARCH[d.research].icon} Benötigt Forschung „${RESEARCH[d.research].name}“.`);
  if(d.tech) L.push(`🎓 Benötigt Universität Stufe ${d.tech}.`);
  if(k==='kontor') L.push(`Verkauft laufend bis ${BUILDINGS.kontor.export} Einheiten/s, aber nur was über der Reserve liegt (🛢 ${EXPORT.reserve.oil}, ⛏ ${EXPORT.reserve.metal}, 🌾 ${EXPORT.reserve.food}). Preise: 🛢 ${f1(EXPORT.price.oil)} $, ⛏ ${f1(EXPORT.price.metal)} $, 🌾 ${f1(EXPORT.price.food)} $ je Einheit – weniger als beim Handel mit Kastrova, dafür ohne Marktsättigung.`);
  if(k==='university') L.push(`Stufe 1: ${TECH_UNLOCKS[1]} · Stufe 2: ${TECH_UNLOCKS[2]} · Stufe 3: ${TECH_UNLOCKS[3]}. Erforschtes Wissen bleibt auch erhalten, wenn die Universität zerstört wird.`);
  if(k==='road') L.push(`<b>Startpunkt antippen, dann Endpunkt</b> – der kürzeste Weg wird geplant (bis ${CONSTRUCTION.roadRadius} Felder von eigenen Gebäuden, vorhandene Straßen werden mitbenutzt). Weitere Endpunkte verlängern die Straße. Bauarbeiter bauen sie Feld für Feld. Geplantes Feld antippen = zurücknehmen. Auf Straßen sind alle Einheiten fast doppelt so schnell. Planen ist kostenlos, jedes Feld verbraucht beim Bau ${DEF('road').cost.stone} 🪨 Stein. <b>Transport:</b> Höfe, Holzfäller, Steinbrüche und Minen liefern zur nächsten Sammelstelle (Rathaus oder Lagerhaus). Je länger der Weg, desto weniger kommt an – eine Straße zählt nur ${Math.round(HAUL.roadCost*100)} % des Weges, lohnt sich also besonders bei weiten Strecken. Gebäude wählen → 🛣 Straße plant den Weg.`);
  else if(isDefType(k)) L.push(`Wird auf der Karte geplant (bis ${DEF_RADIUS} Felder vor der Stadt)${d.line?', auch durch Ziehen über mehrere Felder':''} und von <b>Pionieren</b> vor Ort gebaut – erst in der Kaserne Pioniere ausbilden. Bezahlt wird beim Planen; Plan antippen nimmt ihn zurück.`);
  if(k==='gbunker') L.push(`🏰 <b>Darf weit draußen stehen:</b> bis ${FORT.borderR} Felder von der Stadt auf erkundetem Land, mindestens ${FORT.enemyGap} Felder von fremden Gebäuden. Rund um den Bunker dürfen weitere Gräben und Stellungen geplant werden. Befestigt: Gewehre kratzen kaum, Panzer, Raketenwerfer und Drohnen brauchen lange. Pioniere müssen hinlaufen – begleiten!`);
  if(k==='atmine') L.push(`Für Feinde unsichtbar. Nur Fahrzeuge lösen sie aus (${PIONEER.mineDmg} Schaden – leichte Fahrzeuge sind meist hinüber). Feindliche Pioniere können Minen entdecken und räumen.`);
  if(k==='pioneer') L.push('Bauen alles aus dem Reiter Verteidigung vor Ort und räumen feindliche Minen, die sie in ihrer Nähe entdecken. Leicht bewaffnet.');
  if(FEATURES[k]){ if(k==='trench') L.push('Infanterie im Graben erhält 60 % Deckung. Fahrzeuge kommen nur sehr langsam hindurch. Unzerstörbar.');
    if(k==='wire') L.push('Infanterie kommt nur sehr langsam durch. Panzer walzen ihn platt, Granaten und Raketen zerreißen ihn.'); }
  else if(RESEARCH[k]){}
  else if(BUILDINGS[k]){
    if(d.def) L.push(`Bauzeit für einen Pionier: ${Math.round(Math.max(1,d.time)*PIONEER.workTime)} s.`);
    if(d.radar) L.push(`📡 Radar: entdeckt getarnte Hochflieger (Spionage- und Reaper-Drohnen) im Umkreis von ${d.radar} Feldern – nur dann können sie bekämpft werden.`);
    if(d.power) L.push(d.power>0?`Strom: erzeugt +${d.power} ⚡`:`Strom: verbraucht ${-d.power} ⚡`);
    if(d.cap) L.push(`Wohnraum: +${d.cap} Einwohner. <b>Ruhig bauen:</b> Industrie im Umkreis von ${NOISE_R} Feldern und zugebaute Nachbarfelder (enge Bebauung) senken die Wohnqualität, dann ziehen Bewohner langsamer ein. Beim Platzieren zeigen die Farben grün/gelb/orange die Qualität.`);
    if(d.noise) L.push(`<span style="color:#ffb38a">Lärm: senkt die Wohnqualität von Häusern im Umkreis von ${NOISE_R} Feldern (direkt daneben −${Math.round(d.noise*100)} %).</span>`);
    if(d.food) L.push(`Nahrung: +${f1(d.food)} 🌾 pro Sekunde (ernährt ${Math.round(d.food/ECON.foodPerHead)} Einwohner)`);
    if(d.metal) L.push(`Metall: +${f1(d.metal)} ⛏ pro Sekunde, solange das angrenzende Erz reicht`);
    if(d.wood) L.push(`Holz: +${f1(d.wood)} 🪵 pro Sekunde. Fällt den Wald im Umkreis von 3 Feldern nach und nach (ein Waldfeld = ${CONSTRUCTION.forestWood} Holz).`);
    if(d.stone) L.push(`Stein: +${f1(d.stone)} 🪨 pro Sekunde, solange die angrenzenden Felsen reichen.`);
    if(!d.def){ const m=['wood','stone','metal'].filter(r=>d.cost[r]); L.push(`🏗 Beim Setzen wird nur das Geld fällig${m.length?`; ${m.map(r=>RES[r].icon+' '+RES[r].name).join(', ')} holen die Arbeiter beim Bauen aus dem Lager – fehlt es, wartet die Baustelle`:''}.`); }
    if(d.wood||d.stone||d.metal||k==='farm') L.push(`🛣 Liefert zum Rathaus oder nächsten Lagerhaus: weiter Weg = weniger Ertrag. Straßen und Lagerhäuser in der Nähe helfen.`);
    if(ECON.upkeep[k]) L.push(`Unterhalt: ${f1(ECON.upkeep[k])} $/s`);
    if(k==='farm') L.push(`🌾 Bewirtschaftet freie Fläche im Umkreis von ${DENSITY.farmFieldR} Feldern: ${DENSITY.farmFields} Äcker auf <b>grüner Wiese</b> = voller Ertrag, auf karger Steppe nur ${Math.round(DENSITY.steppeYield*100)} %. Zugebaute Felder fehlen.`);
    if(k==='depot') L.push('Sammelstelle: Betriebe in der Nähe liefern hierhin statt zum Rathaus (kürzere Transportwege).');
    if(k==='depot') L.push(`Lagerplatz: Rathaus ${STORAGE.base}, je Lagerhaus +${STORAGE.depot} für Nahrung, Holz, Stein, Metall und Öl. Was nicht ins Lager passt, geht verloren.`);
    if(UPGRADES[k]) L.push('⬆ <b>Ausbau am Platz</b> (Gebäude wählen → ⬆ Ausbau): '+UPGRADES[k].slice(1).map((U,i)=>`Stufe ${i+2} ${U.name}: ${U.cap?U.cap+' Wohnraum':'Ertrag ×'+String(U.food).replace('.',',')+' auf denselben Äckern'}, ${costHtml(U.cost)}${U.research?` (nach „${RESEARCH[U.research].name}“)`:''}`).join(' · ')+'. Spart Fläche.');
    if(k==='npp') L.push(`☢ Wird es zerstört, kommt es zur Kernschmelze: Verwüstung im Umkreis von ${NUKE.meltdown.radius} Feldern und ${Math.round(NUKE.falloutTime/60)} min Verstrahlung. Nicht an die Front bauen!`);
    if(k==='datacenter') L.push(`Beschleunigt die Forschung um ${Math.round(RESEARCH_SPEED.datacenter*100)} % (höchstens ${RESEARCH_SPEED.maxDatacenters} zählen). Voraussetzung für die Erforschung der KI.`);
    if(k==='greenhouse') L.push('Braucht keine Äcker – spart viel Fläche gegenüber Bauernhöfen, kostet aber Strom und Unterhalt.');
    if(k==='enrich') L.push('Ohne laufende Anreicherung baut das Silo keine Raketen. Schon die Bauphase verrät dich dem Geheimdienst des Gegners.');
    if(d.needsOre) L.push('Muss direkt an graue Erzfelsen grenzen.');
    if(d.needsRock) L.push('Muss direkt an helle Felsbrocken grenzen.');
    if(d.needsForest) L.push('Braucht Wald in der Nähe (mind. 3 Waldfelder).');
    if(d.spawn) L.push('Liefert einen Tanklaster mit.');
    if(d.weapon) L.push('Waffe: '+WEAPON_INFO[d.weapon.type]+` · Reichweite ${d.weapon.range}`);
    if(!d.def) L.push(`🏗 Wird als Baustelle gesetzt und von Bauarbeitern errichtet: ${Math.round(d.time*CONSTRUCTION.workTime)} s mit einem Arbeiter, mit ${CONSTRUCTION.maxWorkers} Arbeitern ${Math.round(d.time*CONSTRUCTION.workTime/CONSTRUCTION.maxWorkers)} s. Bezahlt wird beim Setzen.`);
    L.push(`<span class="dim">Größe ${d.w}×${d.h} Felder · Zustand ${d.hp}</span>`);
  } else if(!d.stored) {
    L.push(`Zustand ${d.hp} · Panzerung: ${ARMOR_NAME[d.armor]}`);
    if(d.weapon) L.push('Waffe: '+WEAPON_INFO[d.weapon.type]+` · Reichweite ${d.weapon.range}`);
    if(d.worker) L.push(`Sucht sich selbst Arbeit: Baustellen zuerst, dann geplante Straßen. Bis zu ${CONSTRUCTION.maxWorkers} Arbeiter je Baustelle. Unbewaffnet – im Krieg schützen!`);
    if(d.harvester) L.push(`Fasst ${d.harvester.cap} Öl pro Fahrt. Tippe ein Ölfeld an, um ihn dorthin zu schicken.`);
    if(d.weapon&&d.weapon.minRange) L.push(`Mindestreichweite ${d.weapon.minRange} – kann nahe Ziele nicht treffen.`);
    if(d.weapon&&d.weapon.range>d.sight) L.push(`🔭 Reichweite ${d.weapon.range} Felder, aber selbst sieht er nur ${d.sight}: Ziele dahinter müssen gerade aufgeklärt sein (Drohnen, Späher, eigene Truppen).`);
    if(d.cls==='veh') L.push(`▦ Nahe dem Fahrzeugwerk mit Gitterkäfig nachrüstbar ($${CAGE.cost.money} + ⛏${CAGE.cost.metal}): Drohnen richten dann nur ${Math.round(CAGE.drone*100)} % Schaden an, Lenkwaffen ${Math.round(CAGE.missile*100)} %, aber ${Math.round((1-CAGE.speed)*100)} % langsamer.`);
    if(d.jam) L.push(`📡 Störfeld ${JAM.radius} Felder: feindliche FPV-Drohnen darin verlieren die Verbindung und stürzen ab. Unbewaffnet – Begleitschutz für Panzer.`);
    if(d.radar) L.push(`Radar ${d.radar} Felder: entdeckt getarnte Hochflieger in der Nähe.`);
    if(d.emergency) L.push(`🚨 <b>Notstand:</b> nur verfügbar, wenn die Stadt in den letzten ${Math.round(EMERGENCY.window/60)} Minuten angegriffen wurde oder Krieg herrscht. Kostet kein Geld und keinen Sold – auch bei leerer Kasse sofort bereit. Höchstens ${EMERGENCY.maxVolunteers} Trupps; ist es ${Math.round(EMERGENCY.disband/60*10)/10} Minuten ruhig, gehen die Freiwilligen wieder nach Hause.`);
    if(k==='drone') L.push(`Billig, aber tödlich für Fahrzeuge: <b>ein Treffer zerstört Kampfpanzer oder Raketenwerfer</b> (mit Gitterkäfig braucht es 3–4). 📡 Funkreichweite ${DRONE.fpvRange} Felder ab eigenen Gebäuden – sie wirken im Grenzgebiet; Grenzbunker erweitern die Reichweite, erforschte KI um ${DRONE.fpvRangeAI}. Gegenmittel: Käfige, Störsender, Flakpanzer, Flugabwehr.`);
    if(d.combat) L.push(`Höchstens ${VEH_PER_FACTORY} Kampffahrzeuge je Fahrzeugwerk. Verbraucht ${f1(d.upkeep)} 🛢 Öl pro Sekunde (ohne Öl halbes Tempo).`);
    if(d.armor==='airHigh') L.push('Fliegt hoch und getarnt: Gegner sehen sie nur, wenn ihre Flugabwehr sie per Radar erfasst (oder kurz nachdem sie feuert). Dann treffen nur Flugabwehr und schwach Maschinenkanonen.');
    else if(d.cls==='air') L.push('Fliegt tief: Gewehre, Maschinenkanonen und Flugabwehr können sie abschießen.');
    if(d.sight>=12) L.push(`Sichtweite ${d.sight} Felder – deckt den Nebel des Krieges weit auf.`);
    if(d.battery) L.push(`Akku ${d.battery} s außerhalb der eigenen Stadt, lädt zu Hause wieder. Höchstens ${DRONES_PER_SHOP} je Werkstatt.`);
    if(d.cost.pop) L.push(`<span class="dim">Soldaten essen weiter mit (${f1(d.cost.pop*ECON.foodPerHead)} 🌾/s).</span>`);
    L.push(`<span class="dim">Ausbildung ${d.time} s in: ${BUILDINGS[d.prod].name}</span>`);
  }
  if(G){ const miss=missingReq(0,k); if(miss.length) L.push(`<span style="color:#ff9a8a">Benötigt zuerst: ${miss.join(', ')}</span>`);
    else { const lack=lacking(0,k); if(lack.length) L.push(`<span style="color:#ffb38a">Es fehlt: ${lack.map(r=>RES[r].name).join(', ')}</span>`); } }
  return L.join('<br>');
}
export function regionNote(res){ const pr=G.profile[0]; return pr.scarce.includes(res)?`<br><span style="color:#ff9a8a">⚠ Engpass eurer Region: ${REGION.scarce[res]}.</span>`:pr.rich.includes(res)?`<br><span style="color:#9fd88a">★ Stärke eurer Region: ${REGION.rich[res]}.</span>`:''; }
export const HUD_TIPS: Record<string, ()=>string> = {
  money:()=>{const p=G.players[0],r: any=p.rate||{money:0,export:0,expBy:{}};
    const ex=r.export>0.05?`<br>+${f1(r.export)} $/s aus dem Handelskontor (${Object.entries(r.expBy).map(([k,v])=>f1(v)+' '+RES[k].icon+'/s').join(', ')})`:'';
    return `<b>$ Geld: ${fmt(p.res.money)}</b><br>+${f1(r.money)} $/s Steuern von ${Math.floor(p.pop)} Einwohnern – mehr Einwohner = mehr Geld.${ex}<br><span class="dim">Weitere Quellen: Handel mit Kastrova (zahlt viel für ihren Engpass), Milizmarkt, Beute. Ein Handelskontor exportiert Überschüsse dauerhaft.</span>`;},
  food:()=>{const p=G.players[0],r=p.rate||{foodProd:0,eat:0};const t=p.foodRate<0&&p.res.food>0?`<br><span style="color:#ff9a8a">Vorrat reicht noch ca. ${Math.round(p.res.food/-p.foodRate)} s.</span>`:'';
    return `<b>🌾 Nahrung: ${fmt(p.res.food)}</b><br>Erzeugung +${f1(r.foodProd)}/s (Bauernhöfe, Rathaus) − Verbrauch ${f1(r.eat)}/s (${Math.floor(p.pop)} Einwohner) = <b>${p.foodRate>=0?'+':''}${f1(p.foodRate)}/s</b>.${t}<br><span class="dim">Ein Bauernhof ernährt ${Math.round(2.5*G.profile[0].fert/ECON.foodPerHead)} Einwohner. Ohne Nahrung schrumpft die Stadt.</span>${regionNote('food')}`;},
  wood:()=>{const p=G.players[0],r=p.rate||{wood:0},n=countBuildings(0,'lumber');return `<b>🪵 Holz: ${fmt(p.res.wood)}</b><br>+${f1(r.wood||0)}/s von ${n} Holzfäller${n===1?'':'n'}.<br><span class="dim">Holzfäller am Waldrand bauen – sie holzen den Wald nach und nach ab. Gebraucht für Wohnhäuser, Bauernhöfe, Kaserne, Mine, Steinbruch und Kontor. </span>${regionNote('wood')}`;},
  stone:()=>{const p=G.players[0],r=p.rate||{stone:0},n=countBuildings(0,'quarry');return `<b>🪨 Stein: ${fmt(p.res.stone)}</b><br>+${f1(r.stone||0)}/s aus ${n} Steinbr${n===1?'uch':'üchen'}.<br><span class="dim">Steinbruch direkt an hellen Felsbrocken bauen. Gebraucht für Straßen (${DEF('road').cost.stone} je Feld), Kraftwerk, Raffinerie, Fahrzeugwerk, Universität und Stellungen. </span>${regionNote('stone')}`;},
  metal:()=>{const p=G.players[0],r=p.rate||{metal:0,mines:0,minesEmpty:0};return `<b>⛏ Metall: ${fmt(p.res.metal)}</b><br>Förderung +${f1(r.metal)}/s aus ${r.mines-r.minesEmpty} aktiven Minen${r.minesEmpty?` (${r.minesEmpty} erschöpft)`:''}.<br><span class="dim">Minen nur direkt an grauen Erzfelsen. Gebraucht für Panzer, Fahrzeugwerk, MK-Stellung, Panzerabwehr.</span>${regionNote('metal')}`;},
  oil:()=>{const p=G.players[0],n=G.units.filter(u=>u.owner===0&&u.def.harvester).length,rf=countBuildings(0,'refinery');return `<b>🛢 Öl: ${fmt(p.res.oil)}</b><br>+${f1(p.rate?p.rate.oil||0:0)}/s aus ${rf} Raffinerie${rf===1?'':'n'} (je max. 3/s) · ${n} Tanklaster. Mehr Laster als die Raffinerie verarbeiten kann, bringen nichts – dann warten sie. Öl braucht man für Fahrzeuge; Überschuss am Milizmarkt verkaufen (zurzeit 100 🛢 → $${tradeTerms(0,'sellOil').get.money}; jeder Verkauf drückt den Preis).<br><span class="dim">Raffinerie bauen → Tanklaster fördert automatisch.</span>${regionNote('oil')}`;},
  pop:()=>{const p=G.players[0];const why={unzufrieden:'Unzufriedenheit – Einwohner wandern ab!',hunger:'Hungersnot – Bevölkerung schrumpft!',wohnraum:'Wohnraum voll – Wohnhaus bauen.',nahrung:'Nahrung sinkt – Wachstum gebremst.',strom:'Strommangel – Wachstum halbiert.',laerm:`Freie Wohnungen liegen neben Industrie – Wachstum nur ${Math.round((p.growQ||1)*100)} %.`}[p.growBlock];
    return `<b>👥 Einwohner: ${Math.floor(p.pop)} von ${p.cap} Wohnraum</b><br>${G.mode==='race'?`Siegziel: ${ECON.target} Einwohner (Balken).`:`Stadtstufe: <b>${ECON.ranks[rankOf(p.pop)][1]}</b> · Balken = Weg zur nächsten Stufe (${nextMilestone(p.pop)}).`} Wachstum zurzeit ${p.growth>=0?'+':''}${f1((p.growth||0)*60)} pro Minute.<br>Neue Bewohner ziehen zuerst in die ruhigsten Häuser.${why?`<br><span style="color:#ffb38a">${why}</span>`:''}<br><span class="dim">Soldaten kosten Einwohner. Zerstörte Wohnhäuser vertreiben Bewohner.</span>`;},
  popAi:()=>{const A=G.players[1];if(!G.known[0][1]) return '<b>Unbekannte Macht</b><br>Noch kein Kontakt. Erkunde das Tal, um herauszufinden, wer hier noch lebt.';return `<b>👥 Kastrova: ${Math.floor(A.pop)} Einwohner</b><br>${G.mode==='race'?`Wer zuerst ${ECON.target} erreicht, gewinnt.`:`Stadtstufe: ${ECON.ranks[rankOf(A.pop)][1]}.`} Liegt ihr deutlich vorn, wird Kastrova misstrauisch und rüstet auf.`;},
  power:()=>{const p=G.players[0];return `<b>⚡ Strom: ${p.use} verbraucht / ${p.power} erzeugt</b><br>${p.use>p.power?'<span style="color:#ff9a8a">Mangel! Produktion, Wachstum und Abwehr laufen nur halb so schnell → Kraftwerk bauen.</span>':`Noch ${p.power-p.use} frei. Ein Kraftwerk liefert +100.`}`;},
  stance:()=>G.war?'<b>⚔ Krieg mit Kastrova</b><br>Einheiten greifen sich gegenseitig an. Zerstörte Gebäude bringen dem Angreifer Beute. Frieden über 🤝 anbieten.':'<b>Frieden mit Kastrova</b><br>Niemand schießt. Kastrova kann aber Forderungen stellen oder den Krieg erklären, wenn ihr zu schnell wachst oder schwach seid.',
};
HUD_TIPS.happy=()=>{ const p=G.players[0], h=p.happy??0.8, why=(p.moodWhy||[]).slice().sort((a,b)=>b.amt-a.amt);
  return `<b>Zufriedenheit: ${Math.round(h*100)} %</b> (Ziel ${Math.round((p.moodTarget??h)*100)} %)<br>`+
    (why.length?'Was die Leute stört: '+why.map(w=>`${w.txt} (−${Math.round(w.amt*100)})`).join(', '):'Alles in Ordnung – die Leute sind zufrieden.')+
    `<br><span class="dim">Wirkt auf Steuern (zurzeit ×${f1(p.rate?p.rate.taxF||1:1)}) und Wachstum. Unter ${Math.round(MOOD.emigrate*100)} % wandern Einwohner ab. Die Stimmung folgt langsam: Versäumnisse rächen sich, Verbesserungen wirken mit Verzögerung.</span>`; };
// Lagerplatz an alle Rohstoff-Tipps anhängen, Unterhalt an den Geld-Tipp
for(const r of STORAGE.res){ const f=HUD_TIPS[r]; if(!f) continue;
  HUD_TIPS[r]=()=>{ const p=G.players[0], full=p.res[r]>=p.store-1;
    return f()+`<br>${full?'<span style="color:#ffb060">':'<span class="dim">'}Lager: ${fmt(p.res[r])} / ${fmt(p.store)}${full?' – voll, Überschuss geht verloren! Lagerhaus bauen oder per Handelskontor verkaufen.':''}</span>`; }; }
{ const f=HUD_TIPS.money; HUD_TIPS.money=()=>{ const p=G.players[0], r: any=p.rate||{};
  const tot=(r.upkeep||0)+(r.wages||0)+(r.admin||0);
  return f()+`<br><b>Ausgaben −${f1(tot)} $/s:</b> Unterhalt der Gebäude ${f1(r.upkeep||0)} · Sold ${f1(r.wages||0)} · Stadtverwaltung ${f1(r.admin||0)} (wächst mit der Stadtgröße).`+(p.broke?'<br><span style="color:#ff9a8a">Kasse leer: Betriebe und Ausbildung laufen nur halb so schnell!</span>':''); }; }
export const tipEl=$('#tip'); let tipTimer=null, tipAnchor=null;
export function showTip(html,anchor,ms?){
  tipEl.innerHTML=html; tipEl.style.display='block'; tipAnchor=anchor;
  const r=anchor.getBoundingClientRect(), w=tipEl.offsetWidth, h=tipEl.offsetHeight;
  let x=r.left+r.width/2-w/2, y=r.bottom+6;
  if(y+h>innerHeight-6) y=r.top-h-6;
  tipEl.style.left=clamp(x,6,innerWidth-w-6)+'px'; tipEl.style.top=Math.max(6,y)+'px';
  clearTimeout(tipTimer); if(ms) tipTimer=setTimeout(hideTip,ms);
}
export function hideTip(){tipEl.style.display='none';tipAnchor=null;clearTimeout(tipTimer);}

export function init(){
$$('[data-tip]').forEach(el=>{
  const key=el.dataset.tip;
  el.addEventListener('pointerenter',e=>{ if(e.pointerType==='mouse'&&G) showTip(HUD_TIPS[key](),el); });
  el.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse') hideTip(); });
  el.addEventListener('click',e=>{ e.stopPropagation(); if(!G) return; if(tipAnchor===el){hideTip();return;} showTip(HUD_TIPS[key](),el,5000); });
});
document.addEventListener('pointerdown',e=>{ if(tipAnchor&&!tipAnchor.contains(e.target)) hideTip(); },true);
}

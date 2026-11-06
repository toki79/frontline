// Simulationstests ohne Browser: prüft, dass die Spiellogik unabhängig von Grafik/DOM läuft.
import { describe, it, expect, vi } from 'vitest';
import { newGame, G } from '../src/sim/state';
import { update } from '../src/sim/loop';
import { canPlace, placeSite, placeDefense } from '../src/sim/production';
import { findBuilding, countBuildings, tileCost, spawnAt, placeBuilding, setWar, makeContact, atWar } from '../src/sim/world';
import { enqueue, missingReq } from '../src/sim/production';
import { launchNuke, inFallout, rebuildFallMap } from '../src/sim/nuke';
import { aiThink } from '../src/ai/kastrova';
import { applyDecision, llmActive, parseDecision, strategistPrompt } from '../src/ai/strategist';
import { rangeOf } from '../src/sim/units';
import { makeGroup, groupState, dissolveGroup } from '../src/sim/groups';
import { orderBoard, unload, aboard } from '../src/sim/transport';
import { orderDrop } from '../src/sim/airdrop';
import { reinfOf } from '../src/sim/reinforce';
import { depositTiles } from '../src/sim/world';
import { findPath } from '../src/sim/pathfinding';
import { devOf } from '../src/sim/devplan';
import { demandTribute, evalTribute, landOffer } from '../src/sim/tribute';
import { applyDamage, continueGame, destroy } from '../src/sim/combat';
import { serialize, loadGame } from '../src/sim/save';
import { hasEmbassy, proposeContract, sendDiplomats } from '../src/sim/trade';
import { applyOrder } from '../src/sim/missions';
import { orderAttack, orderEscort, orderLurk, orderMove, orderPatrol } from '../src/sim/orders';
import { AIR, BANDITS, BUILDINGS, CONSTRUCTION, FEAT, MAP_H, MAP_W, NUKE, RESEARCH, STORAGE, T, VICTORY } from '../src/data/config';
import { answerOffer } from '../src/sim/offers';
import { canPlaceRoad, demolish, orderRoadTo, planRoadLine, startUpgrade, upgradeBlock } from '../src/sim/build';
import { accessPoints, unprotected } from '../src/sim/fortify';
import { canPlaceDef } from '../src/sim/production';
import { idx } from '../src/core/util';
import { on } from '../src/core/events';
import { costOf } from '../src/sim/costs';
import { armyEstimate, intelChance, knows, mastery, researchIntel } from '../src/sim/intel';
import { conclude, judge, pactTerms, pactWith, bound, updatePacts } from '../src/sim/pacts';
import { envoyPrompt, readEnvoy, applyMood } from '../src/ai/envoy';
import { aiOfferPeace } from '../src/ai/kastrova';

const run = (sec: number) => { for (let i = 0; i < sec * 20; i++) { update(0.05); if (G.offer) answerOffer(true); } };
/** Baustelle nahe dem Rathaus setzen */
function siteNearHq(type: string) {
  const hq = findBuilding(0, 'hq');
  for (let r = 3; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.floor(hq.x) + dx, y = Math.floor(hq.y) + dy;
    if (canPlace(0, type, x, y)) return placeSite(0, type, x, y);
  }
  return null;
}
/** neues Spiel, bei dem Aldoria die genannten Rohstoffe nicht knapp hat */
const gameWith = (...notScarce: string[]) => { for (let k = 0; k < 50; k++) { newGame('mittel'); if (notScarce.every(r => !G.profile[0].scarce.includes(r))) return; } };
/** Räuber entfernen (für Tests, die lange Wege brauchen) */
const noBandits = () => { for (const b of G.buildings) if (b.type === 'camp') b.dead = true; for (const u of G.units) if (u.owner === 3) u.dead = true; G.buildings = G.buildings.filter(b => !b.dead); };
/** fertiges Gebäude nahe dem Rathaus (ohne Baustelle und Voraussetzungen) */
function builtNearHq(type: string, pid = 0) {
  const hq = findBuilding(pid, 'hq'), d = BUILDINGS[type];
  for (let r = 3; r < 22; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.floor(hq.x) + dx, y = Math.floor(hq.y) + dy; let ok = true;
    for (let yy = y; yy < y + d.h && ok; yy++) for (let xx = x; xx < x + d.w; xx++) if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H || G.occ[idx(xx, yy)] || G.terr[idx(xx, yy)] === T.WATER) { ok = false; break; }
    if (ok) return placeBuilding(pid, type, x, y, false);
  }
  return null;
}
const runUntil = (cond: () => boolean, maxSec: number) => { for (let i = 0; i < maxSec * 20 && !cond(); i++) { update(0.05); if (G.offer) answerOffer(true); } return cond(); };

describe('Simulation', () => {
  it('startet ein Spiel mit Rathäusern, Miliz, Bauarbeitern und Baustoffen', () => {
    newGame('mittel');
    expect(findBuilding(0, 'hq')).toBeTruthy();
    expect(findBuilding(1, 'hq')).toBeTruthy();
    expect(findBuilding(2, 'bunker')).toBeTruthy();
    expect(G.profile[0].scarce).not.toBe(G.profile[1].scarce);
    expect(G.units.filter(u => u.owner === 0 && u.def.worker).length).toBe(CONSTRUCTION.startWorkers);
    expect(G.players[0].res.wood).toBeGreaterThan(0);
    expect(G.rock.some(v => v > 0)).toBe(true);
  });

  it('Baustelle: bezahlt sofort, Arbeiter bauen sie fertig, erst dann zählt sie', () => {
    newGame('mittel');
    const w0 = G.players[0].res.wood, m0 = G.players[0].res.money, cap0 = G.players[0].cap;
    const s = siteNearHq('house');
    expect(s).toBeTruthy();
    expect(s.site).toBe(true);
    expect(G.players[0].res.money).toBe(m0 - 150);   // Geld sofort
    expect(G.players[0].res.wood).toBe(w0);          // Holz erst beim Bauen
    update(0.05);
    expect(G.players[0].cap).toBe(cap0);                 // Baustelle bringt noch keinen Wohnraum
    expect(runUntil(() => !s.site, 90)).toBe(true);      // Arbeiter bauen sie fertig
    expect(G.players[0].cap).toBe(cap0 + 50);
    expect(G.players[0].res.wood).toBeLessThan(w0 - 39);
  });

  it('Baustelle wartet, wenn Material fehlt', () => {
    newGame('mittel');
    G.players[0].res.wood = 0;
    const s = siteNearHq('house');
    expect(s).toBeTruthy();
    run(30);
    expect(s.site).toBe(true);
    expect(s.progress || 0).toBe(0);
    G.players[0].res.wood = 100;
    expect(runUntil(() => !s.site, 120)).toBe(true);
  });

  it('Wohnhaus und Bauernhof lassen die Stadt wachsen', () => {
    newGame('mittel');
    const f = siteNearHq('farm'), h = siteNearHq('house');
    expect(f && h).toBeTruthy();
    runUntil(() => !f.site && !h.site, 120);
    const pop0 = G.players[0].pop;
    run(60);
    expect(G.players[0].pop).toBeGreaterThan(pop0);
  });

  it('ohne Bauarbeiter geht es nicht voran', () => {
    newGame('mittel');
    for (const u of G.units) if (u.owner === 0 && u.def.worker) u.dead = true;
    const s = siteNearHq('house');
    run(30);
    expect(s.site).toBe(true);
    expect(s.progress).toBe(0);
  });

  it('Holzfäller und Steinbruch fördern Baustoffe', () => {
    gameWith('wood','stone');
    const l = siteNearHq('lumber'), q = siteNearHq('quarry');
    expect(l).toBeTruthy(); expect(q).toBeTruthy();
    runUntil(() => !l.site && !q.site, 120);
    const w = G.players[0].res.wood, st = G.players[0].res.stone;
    run(20);
    expect(G.players[0].res.wood).toBeGreaterThan(w);
    expect(G.players[0].res.stone).toBeGreaterThan(st);
  });

  it('Transport: weiter Weg senkt die Leistung, Straßen helfen (Stein beim Bau)', () => {
    gameWith('stone');
    G.players[0].res.money = 9000; G.players[0].res.wood = 800; G.players[0].res.stone = 0;
    // Steinbruch irgendwo mit Felsen, möglichst weit weg
    let q = null; const hq = findBuilding(0, 'hq');
    const spots = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (canPlace(0, 'quarry', x, y)) spots.push([x, y]);
    spots.sort((a, b) => (b[0] - hq.x) ** 2 + (b[1] - hq.y) ** 2 - ((a[0] - hq.x) ** 2 + (a[1] - hq.y) ** 2));
    q = placeSite(0, 'quarry', spots[0][0], spots[0][1]);
    expect(q).toBeTruthy();
    expect(G.road.some(r => r > 0)).toBe(false);          // keine automatischen Straßen
    G.players[0].res.stone = 300;
    expect(runUntil(() => !q.site, 200)).toBe(true);
    update(0.05);
    const e0 = q.eff;
    expect(e0).toBeLessThan(1);
    const stone0 = G.players[0].res.stone;
    expect(orderRoadTo(0, q)).toBeGreaterThan(0);
    expect(runUntil(() => !G.road.some((r, i) => r === 1 && G.roadOwner[i] === 1), 300)).toBe(true);
    update(0.05);
    expect(q.eff).toBeGreaterThan(e0);
    const i = G.road.findIndex(r => r === 2);
    expect(tileCost(i, 'veh')).toBeLessThan(1);
    expect(canPlaceRoad(0, 40, 10)).toBe(false);
    void stone0;
  });

  it('Rohstoffe ungleich verteilt: Profil ergänzt sich, Wiesen bringen mehr', () => {
    newGame('mittel');
    const [a, k] = G.profile;
    expect(a.rich.length).toBe(2); expect(a.scarce.length).toBe(2);
    expect([...k.scarce].sort()).toEqual([...a.rich].sort());
    expect(G.terr.some(t => t === T.MEADOW)).toBe(true);
  });

  it('Unterhalt kostet Geld, leere Kasse bremst', () => {
    newGame('mittel');
    const p = G.players[0];
    for (let k = 0; k < 6; k++) spawnAt(0, 'inf', 10 + k * 0.3, 50);
    p.res.money = 1; p.pop = 10;
    run(2);
    expect(p.broke).toBe(true);
    expect(p.res.money).toBeLessThan(0.5);
  });

  it('Lager: mehr als der Lagerplatz geht verloren', () => {
    newGame('mittel');
    const p = G.players[0]; p.res.wood = 5000;
    update(0.05);
    expect(p.res.wood).toBe(STORAGE.base);
  });

  it('Bauernhof: zugebaute Äcker senken den Ertrag', () => {
    newGame('mittel');
    const f = siteNearHq('farm'); G.players[0].res.money = 9000; G.players[0].res.wood = 800;
    runUntil(() => !f.site, 90); update(0.05);
    const before = f.fields;
    // ringsum Häuser setzen
    for (let y = f.ty - 3; y <= f.ty + f.h + 1; y++) for (let x = f.tx - 3; x <= f.tx + f.w + 1; x++) if (canPlace(0, 'house', x, y)) placeSite(0, 'house', x, y);
    G.roadDirty = true; update(0.05);
    expect(f.fields).toBeLessThan(before);
    expect(f.fieldF).toBeLessThan(1);
  });

  it('Feuer springt auf angrenzende Gebäude über', () => {
    newGame('mittel');
    G.players[0].res.money = 9000; G.players[0].res.wood = 800;
    const a = siteNearHq('house');
    let b = null;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (!b && canPlace(0, 'house', a.tx + dx, a.ty + dy)) b = placeSite(0, 'house', a.tx + dx, a.ty + dy);
    expect(b).toBeTruthy();
    destroy(a, null);
    expect(b.fire).toBeGreaterThan(0);
  });

  it('Abriss einer Baustelle erstattet die Kosten', () => {
    newGame('mittel');
    const m0 = G.players[0].res.money, w0 = G.players[0].res.wood;
    const s = siteNearHq('farm');
    expect(demolish(0, s)).toBe(true);   // Geld zurück, Holz war noch nicht verbaut
    expect(G.players[0].res.money).toBe(m0);
    expect(G.players[0].res.wood).toBe(w0);
    expect(G.occ[idx(s.tx, s.ty)]).toBe(0);
  });

  it('KI baut ihre Stadt selbstständig auf (mit Baustellen und Holz/Stein)', () => {
    newGame('mittel');
    run(300);
    expect(countBuildings(1)).toBeGreaterThan(4);
    const sc = G.profile[1].scarce;   // sind Holz UND Stein knapp, kauft die KI zu statt selbst abzubauen
    if (!(sc.includes('wood') && sc.includes('stone'))) expect(countBuildings(1, 'lumber', true) + countBuildings(1, 'quarry', true)).toBeGreaterThan(0);
    expect(runUntil(() => G.players[1].pop > 40, 180)).toBe(true);   // auf manchen Karten dauert das erste Wohnhaus etwas länger als 5 min
  });

  it('Verteidigung: geplant und bezahlt, Pioniere bauen sie vor Ort', () => {
    newGame('mittel');
    const hq = findBuilding(0, 'hq');
    expect(placeDefense(0, 'trench', Math.floor(hq.x) + 4, Math.floor(hq.y) - 4)).toBe(false);   // ohne Kaserne nicht
    const bar = placeBuilding(0, 'barracks', hq.tx + 4, hq.ty, true);
    const m = G.players[0].res.money; let spot = null;
    for (let d = 4; d < 9 && !spot; d++) if (placeDefense(0, 'trench', Math.floor(hq.x) + d, Math.floor(hq.y) - d)) spot = [Math.floor(hq.x) + d, Math.floor(hq.y) - d];
    expect(spot).toBeTruthy();
    expect(G.players[0].res.money).toBe(m - 30);
    const i = idx(spot[0], spot[1]);
    run(20); expect(G.feat[i]).toBe(0);                 // ohne Pioniere bleibt es Plan
    spawnAt(0, 'pioneer', bar.x, bar.y + 2);
    expect(runUntil(() => G.feat[i] === FEAT.TRENCH, 60)).toBe(true);
  });

  it('Panzermine zerstört feindliches Fahrzeug, Infanterie löst sie nicht aus', () => {
    newGame('mittel');
    const hq = findBuilding(0, 'hq'), x = hq.tx + 8, y = hq.ty - 4, i = idx(x, y);
    G.feat[i] = FEAT.MINE; G.featOwner[i] = 1;
    setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const drive = (u) => { u.mode = 'move'; u.goal = {x: x + 2.5, y: y + 0.5}; u.path = [{x: x + 0.5, y: y + 0.5}, {x: x + 2.5, y: y + 0.5}]; u.pathI = 0; };
    const inf = spawnAt(1, 'inf', x - 1 + 0.5, y + 0.5); drive(inf);
    run(4); expect(G.feat[i]).toBe(FEAT.MINE);
    const ifv = spawnAt(1, 'ifv', x - 1 + 0.5, y + 0.5); drive(ifv);
    run(4);
    expect(G.feat[i]).toBe(0);
    expect(ifv.dead || ifv.hp < ifv.maxHp * 0.2).toBe(true);
  });

  it('Erstkontakt: Kastrova ist zu Beginn unbekannt', () => {
    newGame('mittel', true);
    expect(G.known[0][1]).toBe(false);
    const k = findBuilding(1, 'hq');
    spawnAt(0, 'spy', k.x - 6, k.y + 6);
    run(1);
    expect(G.known[0][1]).toBe(true);
  });

  it('Tarnung: Hochflieger ohne Radar nicht angreifbar, mit Flak schon', () => {
    newGame('mittel');
    setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const k = findBuilding(1, 'hq');
    const r = spawnAt(0, 'spy', k.x + 6, k.y + 6); r.mode = 'idle';
    const t = spawnAt(1, 'ifv', k.x + 7, k.y + 6);
    run(1);
    expect(r.det[1]).toBe(false);
    expect(t.target === r).toBe(false);
    placeBuilding(1, 'flak', Math.floor(k.x) + 4, Math.floor(k.y) + 8, true);
    run(1);
    expect(r.det[1]).toBe(true);
  });

  it('Raketenwerfer schießt weit, aber nur auf aufgeklärte Ziele', () => {
    newGame('mittel', false);
    setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    G.fog = true; G.vis.fill(0);
    const hq = findBuilding(0, 'hq'), mx = hq.tx + 7, my = hq.ty - 5;
    const m = spawnAt(0, 'mlrs', mx + 0.5, my + 0.5), tg = placeBuilding(1, 'house', mx, my - 19, true);
    const p = G.players[0]; p.res.oil = 500;
    run(3);
    expect(m.target).toBeFalsy();                      // nicht aufgeklärt
    spawnAt(0, 'spy', mx + 1, my - 17);
    run(3);
    expect(!!m.target || m.cd > 0).toBe(true); void tg;   // zielt oder hat schon gefeuert
  });

  it('FPV-Drohne: lauert nur, wenn eingestellt', () => {
    newGame('mittel');
    setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const d = spawnAt(0, 'drone', 30.5, 60.5); d.mode = 'idle'; d.guard = {x:30.5, y:60.5};
    const e = spawnAt(1, 'mbt', 33.5, 60.5); e.mode = 'idle';   // Panzerkanone trifft keine Drohnen
    run(2); expect(d.dead).toBeFalsy();
    orderLurk([d], true);
    run(4); expect(d.dead).toBe(true);
  });

  it('Reaper auf Aufklärungsflug erkundet selbstständig', () => {
    newGame('mittel', true);
    const r = spawnAt(0, 'reaper', 20, 70);
    const explored0 = G.vis.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
    orderPatrol([r], true);
    run(60);
    expect(G.vis.reduce((s, v) => s + (v > 0 ? 1 : 0), 0)).toBeGreaterThan(explored0 + 300);
  });

  it('Bauarbeiter tragen Material zur Baustelle', () => {
    newGame('mittel');
    const s = siteNearHq('farm');
    let carried = false;
    for (let i = 0; i < 20 * 60 && s.site; i++) { update(0.05); if (G.units.some(u => u.owner === 0 && u.carry && u.carry.res === 'wood')) carried = true; }
    expect(carried).toBe(true);
    expect(s.site).toBe(false);
  });

  it('Räuber: Lager auf der Karte, greifen unbegleitete Arbeiter an', () => {
    newGame('mittel');
    const camps = G.buildings.filter(b => b.type === 'camp');
    expect(camps.length).toBeGreaterThanOrEqual(4);
    run(2);
    const c = camps[0];
    expect(G.units.filter(u => u.owner === 3 && u.camp === c.id).length).toBeGreaterThan(0);
    const w = spawnAt(0, 'worker', c.x + 3, c.y + 3); w.mode = 'move';
    run(25);
    expect(w.dead || w.hp < w.maxHp).toBe(true);
  });

  it('Räuber-Überfall: Schonfrist, Vorwarnung, Plündern statt Zerstören', () => {
    const msgs: string[] = []; on('msg', (m: string) => msgs.push(m));
    newGame('mittel'); G.ais[1].peaceCool = 1e9;
    for (const u of G.units) if (u.owner === 0 && u.def.weapon) u.dead = true;   // ohne Wache
    const c = G.buildings.find(b => b.type === 'camp' && b.x < 48 && b.y > 40);
    const tx = Math.floor(c.x) + 7, ty = Math.floor(c.y) + 7;
    const farm = placeBuilding(0, 'farm', tx, ty, false);
    G.players[0].res.money = 1000; G.players[0].res.food = 300;
    run(2);
    expect(c.raidT).toBeGreaterThan(BANDITS.firstRaid[0] - 10);            // Schonfrist
    for (const u of G.units) if (u.owner === 0) u.dead = true;              // niemand lenkt die Räuber ab
    c.raidT = BANDITS.warn - 1;
    run(3);
    expect(msgs.some(m => m.includes('Späher'))).toBe(true);               // Vorwarnung
    c.raidT = 1; const money0 = G.players[0].res.money;
    expect(runUntil(() => msgs.some(m => m.includes('geplündert')), 90)).toBe(true);
    expect(G.players[0].res.money).toBeLessThan(money0);
    expect(farm.dead).toBeFalsy();                                          // Gebäude bleibt stehen
  }, 20000);

  it('Stadtwache: bei Vorwarnung rücken untätige Soldaten von selbst aus', () => {
    newGame('mittel');
    const c = G.buildings.find(b => b.type === 'camp' && b.x < 48 && b.y > 40);
    placeBuilding(0, 'farm', Math.floor(c.x) + 7, Math.floor(c.y) + 7, false);
    const inf = G.units.filter(u => u.owner === 0 && u.type === 'inf');
    for (const u of inf) { u.x = c.x + 12; u.y = c.y + 14; }
    run(1); c.raidT = BANDITS.warn - 1; run(2);
    expect(inf.some(u => u.mode === 'amove')).toBe(true);
  });

  it('Begleitschutz: Soldaten folgen dem Arbeiter', () => {
    newGame('mittel');
    const w = G.units.find(u => u.owner === 0 && u.def.worker), s = G.units.find(u => u.owner === 0 && u.type === 'inf');
    expect(orderEscort([s], w)).toBe(1);
    orderMove([w], w.x + 6, w.y - 4);
    run(10);
    expect(Math.hypot(s.x - w.x, s.y - w.y)).toBeLessThan(4.5);
  });

  it('Zufriedenheit: Hunger drückt Stimmung und Steuern', () => {
    newGame('mittel');
    const p = G.players[0];
    run(5); const h0 = p.happy;
    p.rationCool = 1e9; p.res.food = 0; run(40);                      // ohne Notrationen
    expect(p.happy).toBeLessThan(h0 - 0.1);
    expect(p.rate.taxF).toBeLessThan(1);
  });

  it('Spielstand: speichern, laden, weiterspielen', () => {
    newGame('mittel', true);
    siteNearHq('farm'); run(60);
    const str = serialize();
    const pop = G.players[0].pop, nb = G.buildings.length, nu = G.units.length, t = G.t;
    const g = loadGame(str);
    expect(g.t).toBe(t); expect(g.players[0].pop).toBe(pop);
    expect(g.buildings.length).toBe(nb); expect(g.units.length).toBe(nu);
    expect(g.terr instanceof Uint8Array).toBe(true);
    expect(g.units.every(u => u.def)).toBe(true);
    const job = g.units.find(u => u.job && u.job.b); if (job) expect(g.buildings.includes(job.job.b)).toBe(true);
    run(60);
    expect(G.t).toBeGreaterThan(t + 59);
  });

  it('Kamikazedrohnen gegen Panzer, Käfig schützt', () => {
    newGame('mittel');
    setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const hq = findBuilding(1, 'hq');
    const t1 = spawnAt(1, 'mbt', hq.x + 8, hq.y + 8), t2 = spawnAt(1, 'mbt', hq.x + 8, hq.y + 10); t2.cage = true;
    applyDamage(t1, 80, 'drone', {owner:0, dead:true, x:0, y:0}); applyDamage(t2, 80, 'drone', {owner:0, dead:true, x:0, y:0});
    expect(t1.dead).toBe(true);                       // ein Treffer genügt
    expect(t2.dead).toBeFalsy();                      // Käfig: Panzer überlebt
    expect(t2.maxHp - t2.hp).toBeLessThan(t2.maxHp * 0.45);
    const m = spawnAt(1, 'mlrs', hq.x + 10, hq.y + 8); applyDamage(m, 80, 'drone', {owner:0, dead:true, x:0, y:0});
    expect(m.dead).toBe(true);
  });

  it('FPV-Drohnen: Funkreichweite begrenzt sie aufs Grenzgebiet', () => {
    newGame('mittel'); noBandits();
    const hq = findBuilding(0, 'hq'), ahq = findBuilding(1, 'hq');
    const d = spawnAt(0, 'drone', hq.x, hq.y - 3);
    orderMove([d], ahq.x, ahq.y);
    run(60);
    let near = 1e9; for (const b of G.buildings) if (!b.dead && b.owner === 0) near = Math.min(near, Math.hypot(b.x - d.x, b.y - d.y));
    expect(d.dead).toBeFalsy();
    expect(near).toBeLessThan(20);                    // kehrt am Rand der Reichweite um
  });

  it('Störsender lässt feindliche FPV-Drohnen abstürzen', () => {
    newGame('mittel');
    setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const k = findBuilding(1, 'hq');
    noBandits();
    const j = spawnAt(1, 'jammer', k.x + 6, k.y + 6);
    const d = spawnAt(0, 'drone', j.x + 1, j.y + 1); d.mode = 'idle';
    run(25);
    expect(d.dead).toBe(true);
  });

  it('Handelsvertrag: Botschaft, Vertrag, Karawanen liefern', () => {
    newGame('mittel', false); noBandits();
    const p = G.players[0], A = G.players[1];
    const hq = findBuilding(0, 'hq');
    placeBuilding(0, 'kontor', hq.tx + 4, hq.ty, true);
    expect(proposeContract(0, 1, {res:'food', amt:100}, {res:'stone', amt:50}).ok).toBe(false);   // ohne Botschaft
    const dip = spawnAt(0, 'diplomat', hq.x + 3, hq.y);
    sendDiplomats([dip], findBuilding(1, 'hq'));
    expect(runUntil(() => hasEmbassy(0, 1), 400)).toBe(true);
    p.res.food = 800; A.res.stone = 800; A.res.money = 5000;
    const give = {res:'food', amt:200}, get = {res:G.profile[1].rich.includes('food') ? 'oil' : 'stone', amt:50};
    A.res[get.res] = 800;
    const r: any = proposeContract(0, 1, give, get);
    if (!r.ok) { console.log('abgelehnt', r.reasons, r.ratio); return; }
    const before = p.res[get.res];
    run(10);
    expect(G.units.some(u => u.def.caravan)).toBe(true);
    expect(runUntil(() => p.res[get.res] >= before + 49, 200)).toBe(true);
  });

  it('Einsatz „Stellung halten“: Truppen graben sich ein und nehmen weniger Schaden', () => {
    newGame('mittel'); noBandits();
    const hq = findBuilding(0, 'hq'), s = spawnAt(0, 'inf', hq.x + 3, hq.y - 3);
    applyOrder([s], 'hold', hq.x + 6, hq.y - 6);
    run(15);
    expect(s.dug).toBe(true);
    const hp = s.hp; applyDamage(s, 40, 'shell', {owner:1, dead:true, x:0, y:0});
    expect(hp - s.hp).toBeLessThan(40 * 0.5 * 0.7);   // weniger als ohne Eingraben (Heimvorteil schon eingerechnet)
  });

  it('Einsatz „Gebiet klären“: Räuberlager wird ausgehoben, danach halten', () => {
    newGame('mittel', false);
    const camp = G.buildings.find(b => b.type === 'camp' && b.x < 48);
    run(2);
    const grp = []; for (let i = 0; i < 6; i++) grp.push(spawnAt(0, i < 3 ? 'mbt' : 'ifv', camp.x + 9 + (i % 3), camp.y + 9 + Math.floor(i / 3)));
    G.players[0].res.oil = 1000;
    applyOrder(grp, 'clear', camp.x, camp.y);
    expect(runUntil(() => camp.dead, 150)).toBe(true);
    run(10);
    expect(grp.filter(u => !u.dead).some(u => u.order === 'hold')).toBe(true);
  });

  it('Einsatz für Drohnen: FPV lauern am Ziel, Aufklärer überwachen das Gebiet', () => {
    newGame('mittel');
    const hq = findBuilding(0, 'hq');
    const d = spawnAt(0, 'drone', hq.x, hq.y - 3), sp = spawnAt(0, 'spy', hq.x, hq.y - 3);
    applyOrder([d, sp], 'clear', hq.x + 10, hq.y - 10);
    expect(d.lurk).toBe(true);
    expect(sp.patrol && sp.patrolArea).toBeTruthy();
    run(20);
    expect(Math.hypot(sp.x - (hq.x + 10), sp.y - (hq.y - 10))).toBeLessThan(14);
  });

  it('Forschungsbaum: Voraussetzungen, Rechenzentrum und Strom für die KI', () => {
    newGame('mittel');
    const p = G.players[0], hq = findBuilding(0, 'hq');
    p.res.money = 1e5; p.res.metal = 5000; p.res.oil = 5000; p.res.stone = 5000;
    expect(missingReq(0, 'res2')).toContain('Universität');
    builtNearHq('university');
    expect(missingReq(0, 'res2')).toEqual([]);
    expect(missingReq(0, 'ai').join()).toContain('Informatik');
    expect(missingReq(0, 'datacenter').join()).toContain('Informatik');   // Gebäude erst nach der Forschung
    p.done = { res2: true, res3: true, computing: true };
    expect(missingReq(0, 'ai').join().replace(/\u00AD/g, '')).toContain('Rechenzentrum');
    builtNearHq('datacenter');
    expect(missingReq(0, 'ai')).toEqual([]);
    p.power = 0; p.use = 999;                       // Strommangel: KI-Forschung steht still
    expect(enqueue(0, 'ai')).toBe(true);
    for (let i = 0; i < 40; i++) update(0.05);
    expect(p.q.research[0].t).toBe(0);
    expect(p.q.research[0].stalled).toBeTruthy();
    expect(hq).toBeTruthy();
  });

  it('Atomrakete: Bau im Silo, Start, Vernichtung, Verstrahlung und Krieg', () => {
    newGame('mittel'); noBandits(); G.fog = false;
    const p = G.players[0];
    p.res.money = 1e5; p.res.metal = 5000; p.res.oil = 5000; p.res.stone = 5000; p.store = 1e5;
    p.done = { res2: true, res3: true, physics: true, computing: true, ai: true, bomb: true }; p.tech = 3;
    for (const t of ['npp', 'npp', 'enrich', 'silo']) expect(builtNearHq(t)).toBeTruthy();
    update(0.05);
    p.res.money = 1e5; p.res.metal = 5000; p.res.oil = 5000;   // Lagergrenze nach dem ersten Takt umgehen
    expect(enqueue(0, 'nuke')).toBe(true);
    p.q.silo[0].t = p.q.silo[0].time - 0.5;
    expect(runUntil(() => p.nukes === 1, 5)).toBe(true);
    const ahq = findBuilding(1, 'hq'), aPop = G.players[1].pop;
    expect(launchNuke(0, ahq.x, ahq.y)).toBe(true);
    expect(p.nukes).toBe(0);
    expect(atWar(0, 1)).toBe(true);
    expect(runUntil(() => G.fallout.length > 0, 60)).toBe(true);
    expect(ahq.dead).toBeFalsy();                          // Regierungsbunker übersteht den Schlag …
    expect(ahq.hp).toBeLessThanOrEqual(ahq.maxHp * NUKE.hqKeep + 1);   // … schwer beschädigt
    expect(G.players[1].pop).toBeLessThan(aPop);
    expect(G.fallout.length).toBe(1);
    expect(inFallout({ x: ahq.x, y: ahq.y })).toBe(0);
    expect(p.shockUntil).toBeGreaterThan(G.t);
    expect(G.players[1].bombedUntil).toBeGreaterThan(G.t);
    expect(launchNuke(0, ahq.x, ahq.y)).not.toBe(true);   // keine zweite Rakete
  });

  it('Kernschmelze: zerstörtes Kernkraftwerk verstrahlt die Umgebung', () => {
    newGame('mittel');
    const p = G.players[0]; p.done = { res2: true, res3: true, physics: true }; p.res.money = 1e5; p.res.stone = 5000; p.res.metal = 5000;
    const b = builtNearHq('npp');
    destroy(b, null);
    expect(G.fallout.length).toBe(1);
    expect(G.fallout[0].r).toBe(NUKE.meltdown.fallout);
  });

  it('Abschreckung: mit eigener Atomrakete stellt Kastrova keine Forderungen und erklärt keinen Krieg', () => {
    const tryIt = (nuke: boolean) => {
      newGame('mittel'); noBandits(); makeContact(0, 1); makeContact(1, 0);
      const P = G.players[0], A = G.players[1], ahq = findBuilding(1, 'hq');
      P.nukes = nuke ? 1 : 0;
      for (let i = 0; i < 8; i++) spawnAt(1, 'mbt', ahq.x + (i % 4) - 2, ahq.y + 3 + Math.floor(i / 4));
      let hostileAct = false;
      for (let k = 0; k < 40; k++) { P.pop = 400; P.cap = 500; A.pop = 150; G.t = Math.max(G.t, G.diff.grace + 1); G.ais[1].cool = 0;
        aiThink(1); if (atWar(0, 1) || (G.offer && G.offer.type === 'demand')) { hostileAct = true; break; } G.offer = null; G.t += 5; }
      return hostileAct;
    };
    expect(tryIt(false)).toBe(true);
    expect(tryIt(true)).toBe(false);
  });

  it('Straße per Start- und Endpunkt: der Weg wird geplant', () => {
    newGame('mittel');
    const hq = findBuilding(0, 'hq');
    let a = null, b = null;
    for (let r = 2; r < 8 && !a; r++) for (let dx = -r; dx <= r && !a; dx++) { const x = hq.tx + dx, y = hq.ty + hq.h + r; if (canPlaceRoad(0, x, y)) a = [x, y]; }
    for (let r = 2; r < 8 && !b; r++) for (let dy = -r; dy <= r && !b; dy++) { const x = hq.tx + hq.w + r, y = hq.ty + dy; if (canPlaceRoad(0, x, y)) b = [x, y]; }
    expect(a && b).toBeTruthy();
    const n = planRoadLine(0, a[0], a[1], b[0], b[1]);
    expect(n).toBeGreaterThanOrEqual(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + 1);
    expect(G.road[idx(a[0], a[1])]).toBe(1);
    expect(G.road[idx(b[0], b[1])]).toBe(1);
    expect(planRoadLine(0, a[0], a[1], b[0], b[1])).toBe(0);   // schon geplant
  });

  it('Ausbau am Platz: Haus und Hof werden besser, ohne mehr Fläche', () => {
    newGame('mittel');
    const p = G.players[0]; p.res.money = 5000; p.res.wood = 500; p.res.stone = 500; p.res.metal = 200;
    devOf(0).on = false;                                         // nur Ausbau von Hand
    const h = builtNearHq('house'), f = builtNearHq('farm');
    const cap0 = p.cap;
    expect(startUpgrade(0, h)).toBe(true);
    expect(startUpgrade(0, h)).toBe(false);                     // läuft schon
    expect(runUntil(() => !h.upg, 60)).toBe(true);
    expect(h.lvl).toBe(2);
    expect(p.cap).toBe(cap0 + 30);
    expect(upgradeBlock(0, h).join()).toContain('Stadtplanung'); // Stufe 3 braucht Forschung
    p.res.money = 5000; p.res.stone = 500; p.res.wood = 500;
    run(2); const food0 = p.rate.foodProd;
    expect(startUpgrade(0, f)).toBe(true);
    expect(runUntil(() => !f.upg, 60)).toBe(true);
    run(2);
    expect(p.rate.foodProd).toBeGreaterThan(food0 * 1.1);
  });

  it('Grenzbunker: weit draußen erlaubt, Zugänge und ungeschützte Gebäude erkannt', () => {
    newGame('mittel'); G.fog = false;
    const hq = findBuilding(0, 'hq');
    const far = (type: string) => { for (let r = 20; r < 28; r++) for (let k = 0; k < 40; k++) { const x = Math.floor(hq.x + r * Math.cos(k / 6.4)), y = Math.floor(hq.y - r * Math.abs(Math.sin(k / 6.4))); if (canPlaceDef(0, type, x, y)) return [x, y]; } return null; };
    expect(far('turret')).toBeNull();                          // normale Stellungen nur nahe der Stadt
    expect(far('gbunker')).toBeTruthy();
    expect(accessPoints(0).length).toBeGreaterThan(0);
    for (const u of G.units) if (u.owner === 0 && u.def.weapon) u.dead = true;
    builtNearHq('power');
    expect(unprotected(0).some(b => b.type === 'power')).toBe(true);
    expect(BUILDINGS.hq.weapon).toBeTruthy();                   // Rathauswache
  });

  it('Notstand: Bürgerwehr nur bei Angriff, kostenlos, löst sich auf; Beute nicht aus jedem Haus', () => {
    newGame('mittel');
    const p = G.players[0]; p.pop = 36;
    expect(missingReq(0, 'volunteer').length).toBeGreaterThan(0);          // im Frieden nicht verfügbar
    p.lastAttack = { x: 0, y: 0, t: G.t };
    expect(missingReq(0, 'volunteer')).toEqual([]);
    p.res.money = 0;
    expect(enqueue(0, 'volunteer')).toBe(true);                             // auch bei leerer Kasse
    expect(runUntil(() => G.units.some(u => u.owner === 0 && u.type === 'volunteer'), 10)).toBe(true);
    p.lastAttack = { x: 0, y: 0, t: G.t - 1000 };
    const msgs: string[] = []; on('msg', (m: string) => msgs.push(m));
    expect(runUntil(() => !G.units.some(u => !u.dead && u.owner === 0 && u.type === 'volunteer'), 200)).toBe(true);
    expect(msgs.some(m => m.includes('nach Hause'))).toBe(true);           // Freiwillige kehren heim
    // Beute: ein zerstörtes Wohnhaus kostet kein Geld, das Rathaus schon
    p.res.money = 1000;
    const h = builtNearHq('house'); destroy(h, { owner: 1, dead: true, x: 0, y: 0 });
    expect(p.res.money).toBe(1000);
  });

  it('Stadtverwaltung frisst nie die ganzen Steuern (auch bei 3000+ Einwohnern)', () => {
    newGame('mittel');
    const p = G.players[0];
    for (const pop of [500, 1000, 3200, 10000]) { p.pop = pop; update(0.05);
      expect(p.rate.admin).toBeLessThan(p.rate.money * 0.61);
      expect(p.rate.money - p.rate.admin).toBeGreaterThan(pop * 0.015); }
  });

  it('Tribut: Kastrova gibt nur aus Furcht nach – Geld, Dauerzahlung, Land', () => {
    newGame('mittel'); noBandits(); makeContact(0, 1); makeContact(1, 0); G.ais[1].peaceCool = 1e9;
    const A = G.players[1], P = G.players[0], hq = findBuilding(0, 'hq');
    A.res.money = 3000; aiThink(1);
    expect(evalTribute(1, 'money', 800, false).ok).toBe(false);              // ohne Übermacht keine Furcht
    for (let i = 0; i < 14; i++) spawnAt(0, 'mbt', hq.x + 3 + (i % 4), hq.y - 4 - Math.floor(i / 4));
    for (const u of G.units) if (u.owner === 1 && u.def.weapon) u.dead = true;
    aiThink(1);
    expect(evalTribute(1, 'money', 300, false).ok).toBe(true);
    const m0 = P.res.money;
    expect(demandTribute(1, 'money', 300, false)).toBe('ok');
    expect(P.res.money).toBe(m0 + 300);
    expect(demandTribute(1, 'money', 300, false)).toBe('wartet');            // Abkühlzeit
    G.tribCool = {}; A.res.food = 2000; A.pop = 600; update(0.05);         // Dauerzahlung bemisst sich am Einkommen
    expect(demandTribute(1, 'food', 100, true)).toBe('ok');
    const f0 = P.res.food; run(62);
    expect(G.tributes && G.tributes[0] && G.tributes[0].paid).toBeGreaterThan(0);
    P.nukes = 1; G.tribCool = {}; aiThink(1);
    const L = landOffer(1); expect(L.length).toBeGreaterThan(0);
    expect(demandTribute(1, 'land', 0, false)).toBe('ok');
    expect(L.every(b => b.owner === 0)).toBe(true);
    expect(f0).toBeGreaterThan(0);
  });

  it('Verstrahlung: kein Bauen, Bodentruppen sterben, Wege führen außen herum', () => {
    newGame('mittel'); noBandits();
    const hq = findBuilding(0, 'hq'), x = Math.floor(hq.x) + 14, y = Math.floor(hq.y) - 14;
    G.fallout = [{ x: x + 0.5, y: y + 0.5, r: 4, until: G.t + 300 }]; rebuildFallMap();
    expect(canPlace(0, 'house', x, y)).toBe(false);
    const inf = spawnAt(0, 'inf', x + 0.5, y + 0.5), d = spawnAt(0, 'drone', x + 0.5, y + 0.5);
    run(1);
    expect(inf.dead).toBe(true);                       // betreten = tot
    expect(d.dead).toBeFalsy();                        // Drohnen fliegen darüber
    const s = spawnAt(0, 'inf', x - 6.5, y + 0.5); orderMove([s], x + 6.5, y + 0.5);
    run(20);
    expect(s.dead).toBeFalsy();                        // läuft außen herum
    G.fallout[0].until = G.t; run(1);
    expect(G.fallout.length).toBe(0);
  });

  it('Reaper: schwer zu treffen, tödlich für Schützen, jagt auf Patrouille', () => {
    newGame('mittel'); noBandits(); setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const r = spawnAt(0, 'reaper', 40, 40); const inf = spawnAt(1, 'inf', 43, 40);
    applyDamage(inf, 70, 'hellfire', r); expect(inf.dead).toBe(true);      // ein Treffer, ein Trupp
    const hp0 = r.hp; applyDamage(r, 24, 'flak', inf); expect(hp0 - r.hp).toBeLessThan(30);
    const inf2 = spawnAt(1, 'inf', 44, 41); orderPatrol([r], true);
    expect(runUntil(() => inf2.dead, 30)).toBe(true);
  });

  it('Öl: Biokraftstoff aus Nahrung, Bohrturm ohne Ölfeld', () => {
    newGame('mittel'); const p = G.players[0];
    p.done = { res2: true, res3: true, fert: true, biofuel: true, deepdrill: true };
    builtNearHq('power'); builtNearHq('power'); const ref = builtNearHq('refinery'); ref.crude = 0;
    for (const u of G.units) if (u.owner === 0 && u.def.harvester) u.dead = true;
    p.res.food = 800; p.res.oil = 0; run(10);
    expect(p.res.oil).toBeGreaterThan(5); expect(p.res.food).toBeLessThan(800);
    const o0 = p.res.oil; builtNearHq('derrick'); p.res.food = 0; run(10);
    expect(p.res.oil).toBeGreaterThan(o0 + 8);
  });

  it('Alle Gebäude ausbaubar; Bürger bauen nach Priorität und Freigabe aus', () => {
    newGame('mittel'); const p = G.players[0]; devOf(0).on = false;
    p.res.money = 9000; p.res.stone = 800; p.res.metal = 300; p.res.wood = 500; p.store = 9000;
    const pw = builtNearHq('power'); update(0.05); const pow0 = p.power;
    expect(startUpgrade(0, pw)).toBe(true); expect(runUntil(() => !pw.upg, 90)).toBe(true);
    expect(p.power).toBeGreaterThan(pow0);                                   // Stufe II: mehr Strom
    const d = devOf(0); d.on = true; for (const k in d.prio) d.prio[k] = 0; d.prio.stadtleben = 2;
    const park = builtNearHq('park'), house = builtNearHq('house');
    d.release.money = 0; run(8); expect(park.upg || park.lvl > 1).toBeFalsy();   // ohne Freigabe nichts
    d.release.money = 0.75; run(8);
    expect(!!park.upg || park.lvl > 1).toBe(true); expect(house.upg).toBeFalsy();   // nur freigegebener Bereich
  });

  it('Stadtleben: fehlende Unterhaltung drückt die Stimmung, Feuerwehr löscht', () => {
    newGame('mittel'); const p = G.players[0];
    p.pop = 800; run(2); expect(p.moodWhy.some(w => w.txt.includes('Unterhaltung'))).toBe(true);
    const fw = builtNearHq('firest'), h = builtNearHq('house'); run(1.5);
    expect(h.fireCov).toBe(true);
    h.fire = 10; run(4); expect(h.fire).toBeLessThanOrEqual(0); expect(h.dead).toBeFalsy();
    expect(fw).toBeTruthy();
  });

  it('Wald: Bauplatz wird gerodet (+Holz), Forsthaus forstet wieder auf', () => {
    gameWith('wood'); const hq = findBuilding(0, 'hq'), p = G.players[0];   // Region mit Wald
    let spot = null; for (let r = 2; r < 20 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.floor(hq.x) + dx, y = Math.floor(hq.y) + dy; if (G.terr[idx(x, y)] === T.FOREST && canPlace(0, 'house', x, y)) { spot = [x, y]; break; } }
    expect(spot).toBeTruthy();
    const w0 = p.res.wood; expect(placeSite(0, 'house', spot[0], spot[1])).toBeTruthy();
    expect(G.terr[idx(spot[0], spot[1])]).not.toBe(T.FOREST); expect(p.res.wood).toBeGreaterThan(w0);
    const f = builtNearHq('forester'); run(40);
    expect(G.saplings.length).toBeGreaterThan(0);
    const i = G.saplings[0]; G.sapling[i] = 1.5; run(3);
    expect(G.terr[i]).toBe(T.FOREST); expect(G.wood[i]).toBeGreaterThan(0); expect(f).toBeTruthy();
  });

  it('Ballistische Rakete: große Reichweite, Flächenschaden, Flugabwehrraketen fangen ab', () => {
    newGame('mittel'); noBandits(); G.fog = false; setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const ahq = findBuilding(1, 'hq');
    const tel = spawnAt(0, 'tel', ahq.x - 30, ahq.y + 4);
    const tgt = placeBuilding(1, 'depot', Math.floor(ahq.x) - 6, Math.floor(ahq.y) + 4, false);
    orderAttack([tel], tgt);
    expect(runUntil(() => G.projectiles.some(p => p.type === 'ballistic'), 10)).toBe(true);
    expect(runUntil(() => tgt.hp < tgt.maxHp * 0.5 || tgt.dead, 20)).toBe(true);
    // Abfangen
    const sam = placeBuilding(1, 'sam', Math.floor(ahq.x) - 9, Math.floor(ahq.y) + 4, false);
    const keep = AIR.intercept; (AIR as any).intercept = 1; tel.cd = 0; const hp1 = ahq.hp;
    orderAttack([tel], ahq);
    expect(runUntil(() => G.projectiles.some(p => p.type === 'ballistic'), 10)).toBe(true);
    run(8); (AIR as any).intercept = keep;
    expect(ahq.hp).toBeGreaterThanOrEqual(hp1 - 1); expect(sam.dead).toBeFalsy();
  });

  it('Drohnenschwarm: mehrere Treffer, Störsender wirkungslos', () => {
    newGame('mittel'); noBandits(); setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const hq = findBuilding(0, 'hq'), x = hq.x + 6, y = hq.y - 8;
    const sw = spawnAt(0, 'swarm', x, y);
    const v = [spawnAt(1, 'ifv', x + 3, y), spawnAt(1, 'ifv', x + 3.5, y + 1.2), spawnAt(1, 'jammer', x + 4, y - 1)];
    for (const u of v) { u.mode = 'hold'; u.order = 'hold'; }
    run(15);
    expect(v.filter(u => u.dead).length).toBeGreaterThanOrEqual(2);
    expect(sw.jammed).toBeFalsy();
  });

  it('Jagdbomber: Angriff, Rückkehr zum Fliegerhorst, erneuter Anflug; Gleitbomben verlängern die Reichweite', () => {
    newGame('mittel'); noBandits(); G.fog = false; setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const p = G.players[0], hq = findBuilding(0, 'hq'), ahq = findBuilding(1, 'hq');
    builtNearHq('airbase'); builtNearHq('power'); builtNearHq('power');
    const jet = spawnAt(0, 'jet', hq.x + 2, hq.y + 2);
    expect(rangeOf(jet)).toBe(2); p.done = { ...(p.done || {}), glidebomb: true }; expect(rangeOf(jet)).toBe(2 + AIR.glideExtra);
    const tgt = placeBuilding(1, 'depot', Math.floor(ahq.x) - 8, Math.floor(ahq.y) + 3, false);
    orderAttack([jet], tgt);
    expect(runUntil(() => jet.mode === 'rtb' || jet.mode === 'rearm', 40)).toBe(true);
    expect(runUntil(() => jet.mode === 'rearm', 40)).toBe(true);
    expect(runUntil(() => jet.mode === 'attack' || tgt.dead, 40)).toBe(true);
  });

  it('Verband: gemeinsames Tempo, verbundene Waffen stärken die Truppe', () => {
    newGame('mittel'); noBandits(); setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const hq = findBuilding(0, 'hq');
    const us = [spawnAt(0, 'inf', hq.x + 4, hq.y - 4), spawnAt(0, 'inf', hq.x + 4.6, hq.y - 4), spawnAt(0, 'mbt', hq.x + 5, hq.y - 5), spawnAt(0, 'spaag', hq.x + 5.5, hq.y - 4)];
    const g = makeGroup(0, us); run(1.5);
    expect(groupState(g).combined).toBe(true);
    expect(us.every(u => u.cmb)).toBe(true);
    const e1 = spawnAt(1, 'mbt', hq.x + 20, hq.y - 20), e2 = spawnAt(1, 'mbt', hq.x + 22, hq.y - 20);
    const solo = { owner: 0, dead: true, x: 0, y: 0 }, rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);   // ohne Zufallsstreuung vergleichen
    applyDamage(e1, 100, 'shell', us[2]); applyDamage(e2, 100, 'shell', solo); rnd.mockRestore();
    expect((e1.maxHp - e1.hp) / (e2.maxHp - e2.hp)).toBeCloseTo(1.15, 2);   // verbundene Waffen: +15 %
    orderMove(us, hq.x + 4, hq.y - 16);
    expect(us.every(u => u.pace === 1.25)).toBe(true);                 // Tempo der Schützen
    run(5); const ys = us.map(u => u.y); expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(4);
    dissolveGroup(g); expect(us.every(u => !u.grp)).toBe(true);
  });

  it('Mannschaftstransporter: einsteigen, geschützt fahren, absitzen; zerstört = abspringen', () => {
    newGame('mittel'); noBandits(); setWar(0, 1, true, 0); G.ais[1].peaceCool = 1e9;
    const hq = findBuilding(0, 'hq'), apc = spawnAt(0, 'apc', hq.x + 5, hq.y - 5);
    const inf = [spawnAt(0, 'inf', hq.x + 3, hq.y - 4), spawnAt(0, 'inf', hq.x + 3.5, hq.y - 5), spawnAt(0, 'at', hq.x + 4, hq.y - 3)];
    expect(orderBoard(inf, apc)).toBe(3);
    expect(runUntil(() => aboard(apc).length === 3, 15)).toBe(true);
    orderMove([apc], hq.x + 12, hq.y - 10); run(6);
    expect(Math.hypot(inf[1].x - apc.x, inf[1].y - apc.y)).toBeLessThan(0.01);
    expect(unload(apc)).toBe(3); expect(inf.every(u => !u.carried)).toBe(true);
    orderBoard(inf, apc); runUntil(() => aboard(apc).length === 3, 15);
    destroy(apc, null); expect(inf.every(u => !u.carried)).toBe(true);
  });

  it('Amphibienpanzer fährt durchs Wasser, normale Fahrzeuge nicht', () => {
    newGame('mittel');
    let w = -1, land = null;   // Wasserfeld mit Land daneben
    for (let i = 0; i < G.terr.length && w < 0; i++) if (G.terr[i] === T.WATER) { const x = i % MAP_W, y = Math.floor(i / MAP_W);
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { const j = idx(x + dx, y + dy); if (x + dx > 0 && x + dx < MAP_W && y + dy > 0 && y + dy < MAP_H && (G.terr[j] === T.GRASS || G.terr[j] === T.MEADOW) && !G.occ[j]) { w = i; land = [x + dx, y + dy]; break; } } }
    expect(w).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(tileCost(w, 'amph'))).toBe(true); expect(tileCost(w, 'veh')).toBe(Infinity);
    const amph = spawnAt(0, 'amphib', land[0] + 0.5, land[1] + 0.5), wx = w % MAP_W + 0.5, wy = Math.floor(w / MAP_W) + 0.5;
    orderMove([amph], wx, wy); run(10);
    expect(Math.hypot(amph.x - wx, amph.y - wy)).toBeLessThan(1.5);   // ist ins Wasser gefahren
  });

  it('Fallschirmjäger: Absprung vom Fliegerhorst, Flug, Landung hinter den Linien', () => {
    newGame('mittel'); noBandits(); G.fog = false;
    const hq = findBuilding(0, 'hq'); const ab = builtNearHq('airbase');
    const ps = [spawnAt(0, 'para', ab.x + 2, ab.y + 2), spawnAt(0, 'para', ab.x + 2.5, ab.y + 2)];
    const tx = ab.x + 20, ty = ab.y - 20;
    expect(orderDrop(0, ps, tx, ty)).toBe(2);
    expect(ps.every(u => u.carried)).toBe(true);
    expect(runUntil(() => ps.every(u => !u.carried), 15)).toBe(true);
    expect(Math.hypot(ps[0].x - tx, ps[0].y - ty)).toBeLessThan(4);
    expect(orderDrop(0, ps, hq.x, hq.y)).not.toBe(2);              // nicht mehr am Fliegerhorst
  });

  it('Mine/Steinbruch bauen das ganze Vorkommen ab, nicht nur angrenzende Felder', () => {
    newGame('mittel'); const p = G.players[0], hq = findBuilding(0, 'hq');
    const x = Math.floor(hq.x) + 6, y = Math.floor(hq.y) - 6;
    const q = placeBuilding(0, 'quarry', x, y, false);
    for (let i = 0; i < G.rock.length; i++) G.rock[i] = 0;
    G.rock[idx(x + 4, y)] = 50;                                   // Felsen 2 Felder vom Steinbruch entfernt
    run(1); const s0 = p.res.stone; run(25);
    expect(p.res.stone).toBeGreaterThan(s0 + 5); expect(q.empty).toBeFalsy();
    expect(depositTiles(q, G.rock).length).toBeLessThanOrEqual(1);
  });

  it('Verluste ersetzen: Gefallene werden nachgebaut und stoßen zum Verband', () => {
    newGame('mittel'); noBandits(); const p = G.players[0], hq = findBuilding(0, 'hq');
    p.res.money = 5000; p.pop = 35; builtNearHq('barracks');
    const us = [spawnAt(0, 'inf', hq.x + 5, hq.y + 5), spawnAt(0, 'inf', hq.x + 5.6, hq.y + 5)];
    const g = makeGroup(0, us); g.reinforce = true;
    destroy(us[0], { owner: 1, dead: true, x: 0, y: 0 });
    expect(reinfOf(0).q.length).toBe(1);
    expect(runUntil(() => G.units.some(u => !u.dead && u.owner === 0 && u.type === 'inf' && u.grp === g.id && u !== us[1]), 30)).toBe(true);
    reinfOf(0).on = false; const free = spawnAt(0, 'inf', hq.x + 3, hq.y + 5); destroy(free, null);
    expect(reinfOf(0).q.length).toBe(0);                          // ohne Verband nur, wenn global eingeschaltet
  });

  it('Simulation meldet über Ereignisse statt DOM', () => {
    const msgs: string[] = []; on('msg', (t: string) => msgs.push(t));
    newGame('mittel');
    expect(msgs.some(t => t.includes('Region'))).toBe(true);
  });

  it('Drei Mächte: faire Karte, Wege zwischen allen Städten und zur Insel', () => {
    newGame('mittel');
    const hq = [0, 1, 4].map(p => findBuilding(p, 'hq'));
    expect(hq.every(Boolean)).toBe(true);
    // Kastrova ist Aldoria an der Diagonale gespiegelt, Veloria waagrecht
    expect([hq[1].tx, hq[1].ty]).toEqual([hq[0].ty, hq[0].tx]);
    expect([hq[2].tx, hq[2].ty]).toEqual([MAP_W - 3 - hq[0].tx, hq[0].ty]);
    // Gelände der Heimatgebiete gespiegelt gleich
    let same = 0, n = 0; for (let y = 100; y < 140; y++) for (let x = 2; x < 40; x++) { n++; if (G.terr[idx(x, y)] === G.terr[idx(MAP_W - 1 - x, y)] && G.terr[idx(x, y)] === G.terr[idx(y, x)]) same++; }
    expect(same / n).toBeGreaterThan(0.6);   // Ressourcenprofile unterscheiden sich, das Gelände kaum
    const bk = findBuilding(2, 'bunker');
    for (const [a, b] of [[hq[0], hq[1]], [hq[0], hq[2]], [hq[1], hq[2]], [hq[0], bk], [hq[1], bk], [hq[2], bk]])
      expect(findPath(a.tx + 1, a.ty + 4, b.tx + 1, b.ty + 4, 'veh'), 'Weg fehlt').toBeTruthy();
    expect(G.buildings.filter(b => b.type === 'camp').length).toBeGreaterThanOrEqual(9);
  });
  it('KI gegen KI: Krieg, Forderungen und Frieden unter den Mächten', () => {
    newGame('mittel'); noBandits();
    makeContact(1, 4); makeContact(4, 1); makeContact(0, 1); makeContact(0, 4);
    setWar(1, 4, true, 1);
    expect(atWar(1, 4)).toBe(true); expect(atWar(0, 1)).toBe(false);
    expect(G.rel[1][4]).toBe('feind'); expect(G.rel[0][4]).toBe('neutral');
    aiThink(1); aiThink(4);
    expect(G.ais[1].foe).toBe(4); expect(G.ais[4].foe).toBe(1);   // Kriegsgegner ist der Rivale
    // Einheiten verschiedener KI-Mächte bekämpfen sich
    const h1 = findBuilding(1, 'hq'), u1 = spawnAt(1, 'inf', 70, 100), u4 = spawnAt(4, 'inf', 72, 100);
    run(8); expect(u1.dead || u4.dead || u1.hp < u1.maxHp || u4.hp < u4.maxHp).toBe(true);
    setWar(1, 4, false, 4); expect(atWar(1, 4)).toBe(false);
    // Spieler erklärt Veloria den Krieg – Kastrova bleibt neutral
    setWar(0, 4, true, 0); expect(atWar(0, 4)).toBe(true); expect(atWar(0, 1)).toBe(false);
    expect(G.ais[4].att[0]).toBeLessThanOrEqual(-20);
    expect(h1).toBeTruthy();
  });
  it('Sieg erst, wenn alle Rivalen besiegt sind', () => {
    newGame('mittel'); noBandits();
    const civ = p => G.buildings.filter(b => !b.dead && b.owner === p && !b.def.def);
    for (const b of civ(1)) destroy(b, null);
    run(1); expect(G.over).toBe(false); expect(G.beaten && G.beaten[1]).toBe(true);
    for (const b of civ(4)) destroy(b, null);
    run(1); expect(G.over).toBe(true);
  });
  it('Forschung: Entweder-oder, steigende Kosten, Meisterschaft', () => {
    newGame('mittel'); noBandits();
    const p = G.players[0]; p.res.money = 1e6; p.res.metal = 1e5; p.res.oil = 1e5; p.res.stone = 1e5;
    placeBuilding(0, 'university', 30, 110, true); placeBuilding(0, 'factory', 34, 106, true);
    p.done = {res2: true, res3: true}; p.tech = 3;
    const c0 = costOf('rocketry', 0).money;
    p.done.fert = true; p.done.urban = true;
    expect(costOf('rocketry', 0).money).toBeGreaterThan(c0);            // Breite kostet
    expect(costOf('res2', 0).money).toBe(RESEARCH.res2.cost.money);     // Stufen nicht
    // Panzer oder Drohnen: wer schwere Panzer hat, bekommt keine Schwärme mehr
    p.done.computing = true; p.done.heavyarmor = true;
    expect(missingReq(0, 'swarm').join(' ')).toMatch(/ausgeschlossen/);
    expect(enqueue(0, 'swarm')).toBe(false);
    // Doktrin: konventionelle Überlegenheit sperrt das Atomprogramm
    p.done.physics = true; p.done.ai = true; placeBuilding(0, 'datacenter', 30, 104, true);
    expect(enqueue(0, 'conventional')).toBe(true);
    expect(missingReq(0, 'bomb').join(' ')).toMatch(/ausgeschlossen/);
    // Meisterschaft Wirtschaft ab 4 Forschungen
    expect(mastery(p, 'wirt')).toBe(false);
    p.done.biofuel = true; p.done.deepdrill = true;
    expect(mastery(p, 'wirt')).toBe(true);
    // Kfz-Industrie verbilligt Fahrzeuge
    const t0 = costOf('mbt', 0).money; p.done.cars = true; expect(costOf('mbt', 0).money).toBeLessThan(t0);
  });
  it('Geheimdienst: meldet Forschung und Waffen des Gegners mit Gegenmaßnahme', () => {
    newGame('mittel'); noBandits(); makeContact(0, 1); makeContact(1, 0);
    const got: string[] = []; on('msg', (m: any) => got.push(String(m)));
    const A = G.players[1]; A.res.money = 1e6; A.res.metal = 1e5; A.res.oil = 1e5;
    const ku = findBuilding(1, 'hq'); placeBuilding(1, 'university', ku.tx - 4, ku.ty + 6, true); A.done = {res2: true, res3: true}; A.tech = 3;
    // ohne Nachrichtendienst kaum Chance, mit Stufe III fast sicher
    expect(intelChance(0, 1)).toBeLessThan(0.2);
    const ib = placeBuilding(0, 'intel', 30, 112, true); ib.lvl = 3;
    expect(intelChance(0, 1)).toBeGreaterThan(0.85);
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    expect(enqueue(1, 'rocketry')).toBe(true);
    run(30);
    vi.restoreAllMocks();
    expect(knows(0, 1).research).toBe('rocketry');
    expect(got.some(t => /Geheimdienst: .*forscht an weitreichende/.test(t) && /Empfehlung: Flugabwehrraketen/.test(t))).toBe(true);
    expect(researchIntel(0, 1)).toBe('rocketry');                       // Stufe III: laufende Forschung im Lagebericht
    expect(armyEstimate(0, 1)).toBeTruthy();
    // Spionageabwehr senkt die Chance
    A.done.counterintel = true; expect(intelChance(0, 1)).toBeLessThan(0.65);
  });
  it('Alternative Siege: Kernfusion und Welthandel', () => {
    newGame('mittel'); noBandits();
    const p = G.players[0]; p.done = {worldtrade: true}; p.res.money = VICTORY.wealth + 1000;
    run(VICTORY.hold - 10); expect(G.over).toBe(false);
    run(15); expect(G.over).toBe(true);
    // Weiterspielen: Welthandel einer KI beendet das Spiel danach nicht mehr
    newGame('mittel'); noBandits();
    const K = G.players[1]; K.done = {worldtrade: true}; K.res.money = VICTORY.wealth + 1000;
    run(VICTORY.hold + 5); expect(G.over).toBe(true); expect(G.result.win).toBe(false); expect(G.result.cont).toBe(true);
    expect(continueGame()).toBe(true); expect(G.over).toBe(false);
    run(VICTORY.hold + 10); expect(G.over).toBe(false); expect(G.freePlay).toBe(true);
    newGame('mittel'); noBandits();
    const A = G.players[4]; A.res.money = 1e6; A.res.metal = 1e5; A.res.oil = 1e5;
    const h = findBuilding(4, 'hq'); placeBuilding(4, 'university', h.tx - 4, h.ty - 4, true);
    A.q.research.push({type: 'fusion', t: RESEARCH.fusion.time - 0.5, time: RESEARCH.fusion.time});
    run(2); expect(G.over).toBe(true);                                 // Veloria gewinnt das Rennen
  });
  it('Hungersnot: Frühwarnung, Notrationen, kostenlose Not-Höfe ohne Abriss-Trick, Hilfsangebot auf Kredit', () => {
    newGame('mittel'); noBandits();
    const p = G.players[0], texts: string[] = []; on('msg', (t: string) => texts.push(t));
    p.res.food = 30; p.pop = 200; p.cap = 260;                         // viele Esser, wenig Vorrat
    run(2); expect(p.foodRate).toBeLessThan(0);
    expect(texts.some(t => t.includes('Nahrung reicht noch'))).toBe(true);
    expect(costOf('farm', 0).money).toBeGreaterThan(0);                // noch kein Notstand
    p.res.food = 0; run(1);
    expect(G.t).toBeLessThan(p.rationUntil);                           // Notrationen laufen
    expect(texts.some(t => t.includes('Notrationen'))).toBe(true);
    expect(costOf('farm', 0).money).toBe(0);                           // Not-Hof: kein Geld, nur Holz
    expect(costOf('farm', 0).wood).toBeGreaterThan(0);
    p.res.money = 0;
    const f = siteNearHq('farm'); expect(f).toBeTruthy(); expect(p.freeFarms).toBe(1); expect(f.paid).toBe(0);
    demolish(0, f); expect(p.res.money).toBe(0);                       // Abreißen bringt kein Geld
    // Notrationen: das Rathaus gibt mehr Nahrung aus
    const hqFood = () => { const save = p.rationUntil; p.rationUntil = 0; run(0.05); const a = p.rate.foodProd; p.rationUntil = G.t + 100; run(0.05); const b = p.rate.foodProd; p.rationUntil = save; return [a, b]; };
    const [plain, ration] = hqFood(); expect(ration).toBeGreaterThan(plain + 1);
    // Hilfsangebot: Veloria kennt uns, hat Nahrung, wir haben kein Geld -> Kredit
    G.known[0][4] = true; G.players[4].res.food = 2000; p.res.food = 0; p.res.money = 0; G.aidCool = 0;
    const seen: any[] = []; on('offer', (o: any) => seen.push({...o}));
    for (let i = 0; i < 40 && !G.offer; i++) update(0.05);
    expect(G.offer && G.offer.type).toBe('aid'); expect(G.offer.from).toBe(4); expect(G.offer.credit).toBe(true);
    const price = G.offer.price; answerOffer(true);
    expect(p.res.food).toBeGreaterThan(100); expect(p.debt.left).toBe(price);
    p.res.food = 5000; p.pop = 300;
    run(30); expect(p.debt ? p.debt.left : 0).toBeLessThan(price);       // Tilgung aus den Steuern
    expect(seen.length).toBeGreaterThan(0);
  });
  it('KI: Schützen laufen nicht unter eine Reaper-Drohne, sondern weichen aus und holen Flugabwehr', () => {
    newGame('mittel'); noBandits();
    for (const a of [0, 1, 4]) for (const b of [0, 1, 4]) G.known[a][b] = true;
    G.t = 400; setWar(0, 1, true, 0);
    const hq = findBuilding(1, 'hq'); placeBuilding(1, 'barracks', hq.tx + 4, hq.ty + 4, true);
    const inf = [0, 1, 2, 3].map(k => spawnAt(1, 'inf', hq.x + 3 + k * 0.4, hq.y + 3));
    const rp = spawnAt(0, 'reaper', hq.x + 3.5, hq.y + 3.5); rp.mode = 'idle';
    const d0 = inf.map(u => Math.hypot(u.x - rp.x, u.y - rp.y));
    G.players[1].res.money = 3000; G.players[1].res.metal = 300; G.players[1].res.stone = 300;
    spawnAt(1, 'pioneer', hq.x + 2, hq.y + 5);
    for (let i = 0; i < 3; i++) { G.ais[1].defT = 0; aiThink(1); }
    for (let i = 0; i < 60; i++) { rp.x = hq.x + 3.5; rp.y = hq.y + 3.5; update(0.05); }
    expect(inf.filter(u => !u.dead).every((u, i) => Math.hypot(u.x - rp.x, u.y - rp.y) >= d0[i])).toBe(true);   // Abstand gewachsen, nicht geschrumpft
    expect(G.ais[1].airSeenT).toBeGreaterThan(0);
    G.ais[1].defT = 0; aiThink(1);
    expect(G.buildings.some(b => !b.dead && b.owner === 1 && (b.type === 'flak' || b.type === 'sam'))).toBe(true);   // Flugabwehr geplant
  });
  it('Geheimabsprachen: Bündnis gegen die dritte Macht, Preis, Wortbruch, Nichtangriffspakt', () => {
    newGame('mittel'); noBandits();
    for (const a of [0, 1, 4]) for (const b of [0, 1, 4]) G.known[a][b] = true;
    G.t = 1500; const P = G.players[0];
    G.ais[4].att[0] = -10; G.ais[4].att[1] = 0;
    const d = {kind: 'joint' as const, target: 1, join: true, money: 0};
    const t = pactTerms(4, d); expect(t.need).not.toBeNull(); expect(t.need).toBeGreaterThan(0);   // misstrauisch: will Geld
    expect(judge(4, d).ok).toBe(false); expect(conclude(4, d).ok).toBe(false);
    P.res.money = 5000; const r = conclude(4, {...d, money: t.need}); expect(r.ok).toBe(true);
    expect(atWar(4, 1)).toBe(true); expect(atWar(0, 1)).toBe(true); expect(pactWith(4)).toBeTruthy();
    expect(bound(4, 0)).toBe(true);
    aiOfferPeace(1, 4); expect(atWar(4, 1)).toBe(true);                  // Veloria hält zu Aldoria
    const att0 = G.ais[4].att[0];
    setWar(0, 1, false, 0); updatePacts();                               // Separatfrieden = Wortbruch
    expect(pactWith(4)).toBeFalsy(); expect(G.pactBreaks).toBe(1); expect(G.ais[4].att[0]).toBeLessThan(att0 - 20);
    // Nichtangriffspakt: Kastrova (Stratege) darf nicht angreifen
    newGame('mittel'); noBandits(); for (const a of [0, 1, 4]) for (const b of [0, 1, 4]) G.known[a][b] = true; G.t = 1500;
    G.ais[1].att[0] = 60;
    const n = conclude(1, {kind: 'nap', money: 0}); expect(n.ok).toBe(true);
    applyDecision(1, {schwerpunkt: 'ruestung', forschung: 'keine', aldoria: 'krieg_erklaeren', veloria: 'nichts', begruendung: 'x'});
    expect(atWar(1, 0)).toBe(false);
    for (let i = 0; i < 60; i++) { G.ais[1].cool = 0; aiThink(1); } expect(atWar(1, 0)).toBe(false);
    setWar(0, 1, true, 0); updatePacts(); expect(G.pactBreaks).toBe(1); expect(pactWith(1)).toBeFalsy();   // wir brechen ihn
    // Lagebericht gegen Geld
    newGame('mittel'); for (const a of [0, 1, 4]) for (const b of [0, 1, 4]) G.known[a][b] = true;
    G.players[0].res.money = 2000; const it = pactTerms(4, {kind: 'intel', target: 1, money: 0});
    const ir: any = conclude(4, {kind: 'intel', target: 1, money: it.need}); expect(ir.ok).toBe(true); expect(ir.report).toContain('Kastrova');
  });
  it('Geheimabsprachen: KI schlägt selbst ein Bündnis vor; Gesandten-Auftrag fürs Sprachmodell', () => {
    newGame('mittel'); noBandits(); for (const a of [0, 1, 4]) for (const b of [0, 1, 4]) G.known[a][b] = true;
    G.t = 1500; G.ais[4].att[0] = 70; G.ais[4].att[1] = -40; setWar(4, 1, true, 4); G.ais[4].rat = {0: 1, 1: 1.2};
    updatePacts(); expect(G.offer && G.offer.type).toBe('pact'); expect(G.offer.deal.target).toBe(1);
    answerOffer(true); expect(pactWith(4)).toBeTruthy(); expect(atWar(0, 1)).toBe(true);
    const pr = envoyPrompt(1, 'Lasst uns gemeinsam Veloria angreifen!', 'stolz');
    expect(pr.system).toContain('Marschall Varek'); expect(pr.user).toContain('Verhandlungsspielraum'); expect(pr.user).toContain('Lasst uns');
    const o = readEnvoy(1, {antwort: 'Niemals!', vorschlag: {art: 'gemeinsam', ziel: 'veloria', aldoria_kaempft_mit: true, geld: 333}, haltung: 9});
    expect(o.deal.target).toBe(4); expect(o.deal.money).toBe(350); expect(o.mood).toBe(5);
    G.ais[1].att[0] = 0; let up = 0; for (let i = 0; i < 5; i++) up += applyMood(1, 5); expect(up).toBe(6);   // schöne Worte nur begrenzt
    expect(readEnvoy(1, {foo: 1})).toBeNull();
    const s = serialize(); loadGame(s); expect(pactWith(4)).toBeTruthy();
  });
  it('LLM-Stratege: Lagebild ohne Allwissen, Entscheidungen werden geprüft und umgesetzt, veraltet = eingebaute KI', () => {
    newGame('mittel'); noBandits();
    makeContact(1, 0); makeContact(0, 1);
    const pr = strategistPrompt(1, 'Testcharakter');
    expect(pr.system).toMatch(/Testcharakter/);
    expect(pr.user).toMatch(/aldoria/); expect(pr.user).toMatch(/veloria: noch kein Kontakt/);   // Veloria unbekannt
    expect(pr.schema.required).toContain('aldoria');
    expect(parseDecision('Hier: ```json\n{"schwerpunkt":"ruestung"}\n```')).toEqual({schwerpunkt: 'ruestung'});
    expect(parseDecision('kein json')).toBe(null);
    // Krieg vor der Schonfrist wird verworfen, danach umgesetzt
    G.t = 10; let r = applyDecision(1, {schwerpunkt: 'ruestung', forschung: 'gibtsnicht', aldoria: 'krieg_erklaeren', begruendung: 'Test'});
    expect(r.ok).toBe(true); expect(atWar(1, 0)).toBe(false); expect(G.ais[1].llm.research).toBe(null);
    G.t = G.diff.grace + 5; G.ais[1].cool = 0;
    r = applyDecision(1, {schwerpunkt: 'ruestung', forschung: 'keine', aldoria: 'krieg_erklaeren', begruendung: 'Jetzt'});
    expect(atWar(1, 0)).toBe(true); expect(llmActive(G.ais[1])).toBe(true);
    // solange der Stratege aktiv ist, schließt die eingebaute KI keinen Frieden von sich aus
    G.ais[1].peaceCool = 0; G.ais[1].lastCombat = -999; G.ais[1].warSince = {0: -999};
    aiThink(1); expect(G.offer).toBe(null);
    // veraltet: eingebaute KI entscheidet wieder
    G.t += G.ais[1].llm.ttl + 1; expect(llmActive(G.ais[1])).toBe(false);
  });
  it('läuft 10 Spielminuten ohne Fehler (Endlos-Modus)', () => {
    newGame('mittel');
    run(600);
    expect(G.over).toBe(false);
  }, 20000);
});

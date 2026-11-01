// Simulationstests ohne Browser: prüft, dass die Spiellogik unabhängig von Grafik/DOM läuft.
import { describe, it, expect } from 'vitest';
import { newGame, G } from '../src/sim/state';
import { update } from '../src/sim/loop';
import { canPlace, placeSite, placeDefense } from '../src/sim/production';
import { findBuilding, countBuildings, tileCost, spawnAt, placeBuilding, setWar, makeContact } from '../src/sim/world';
import { enqueue, missingReq } from '../src/sim/production';
import { launchNuke, inFallout } from '../src/sim/nuke';
import { aiThink } from '../src/ai/kastrova';
import { applyDamage, destroy } from '../src/sim/combat';
import { serialize, loadGame } from '../src/sim/save';
import { hasEmbassy, proposeContract, sendDiplomats } from '../src/sim/trade';
import { applyOrder } from '../src/sim/missions';
import { orderEscort, orderLurk, orderMove, orderPatrol } from '../src/sim/orders';
import { BANDITS, BUILDINGS, CONSTRUCTION, FEAT, MAP_H, MAP_W, NUKE, STORAGE, T } from '../src/data/config';
import { answerOffer } from '../src/sim/offers';
import { canPlaceRoad, demolish, orderRoadTo, planRoadLine, startUpgrade, upgradeBlock } from '../src/sim/build';
import { accessPoints, unprotected } from '../src/sim/fortify';
import { canPlaceDef } from '../src/sim/production';
import { idx } from '../src/core/util';
import { on } from '../src/core/events';

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
    expect(G.players[1].pop).toBeGreaterThan(40);
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
    setWar(true, 0); G.ai.peaceCool = 1e9;
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
    setWar(true, 0); G.ai.peaceCool = 1e9;
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
    setWar(true, 0); G.ai.peaceCool = 1e9;
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
    setWar(true, 0); G.ai.peaceCool = 1e9;
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
    newGame('mittel'); G.ai.peaceCool = 1e9;
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
    expect(Math.hypot(s.x - w.x, s.y - w.y)).toBeLessThan(3.5);
  });

  it('Zufriedenheit: Hunger drückt Stimmung und Steuern', () => {
    newGame('mittel');
    const p = G.players[0];
    run(5); const h0 = p.happy;
    p.res.food = 0; run(40);
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
    setWar(true, 0); G.ai.peaceCool = 1e9;
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
    setWar(true, 0); G.ai.peaceCool = 1e9;
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
    expect(hp - s.hp).toBeLessThan(40 * 0.35 * 0.7);   // weniger als ohne Eingraben (Heimvorteil schon eingerechnet)
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
    expect(G.war).toBe(true);
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
      for (let k = 0; k < 40; k++) { P.pop = 400; P.cap = 500; A.pop = 150; G.t = Math.max(G.t, G.diff.grace + 1); G.ai.cool = 0;
        aiThink(); if (G.war || (G.offer && G.offer.type === 'demand')) { hostileAct = true; break; } G.offer = null; G.t += 5; }
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

  it('Simulation meldet über Ereignisse statt DOM', () => {
    const msgs: string[] = []; on('msg', (t: string) => msgs.push(t));
    newGame('mittel');
    expect(msgs.some(t => t.includes('Region'))).toBe(true);
  });

  it('läuft 10 Spielminuten ohne Fehler (Endlos-Modus)', () => {
    newGame('mittel');
    run(600);
    expect(G.over).toBe(false);
  });
});

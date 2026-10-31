// Simulationstests ohne Browser: prüft, dass die Spiellogik unabhängig von Grafik/DOM läuft.
import { describe, it, expect } from 'vitest';
import { newGame, G } from '../src/sim/state';
import { update } from '../src/sim/loop';
import { canPlace, placeSite, placeDefense } from '../src/sim/production';
import { findBuilding, countBuildings, tileCost, spawnAt, placeBuilding, setWar } from '../src/sim/world';
import { destroy } from '../src/sim/combat';
import { orderEscort, orderLurk, orderMove, orderPatrol } from '../src/sim/orders';
import { CONSTRUCTION, FEAT, MAP_H, MAP_W, STORAGE, T } from '../src/data/config';
import { answerOffer } from '../src/sim/offers';
import { canPlaceRoad, demolish, orderRoadTo } from '../src/sim/build';
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
    expect(countBuildings(1)).toBeGreaterThan(5);
    const sc = G.profile[1].scarce;   // sind Holz UND Stein knapp, kauft die KI zu statt selbst abzubauen
    if (!(sc.includes('wood') && sc.includes('stone'))) expect(countBuildings(1, 'lumber', true) + countBuildings(1, 'quarry', true)).toBeGreaterThan(0);
    expect(G.players[1].pop).toBeGreaterThan(60);
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
    setWar(true, 0);
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
    setWar(true, 0);
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
    setWar(true, 0);
    G.fog = true; G.vis.fill(0);
    const m = spawnAt(0, 'mlrs', 30.5, 60.5), tg = placeBuilding(1, 'house', 30, 42, true);
    const p = G.players[0]; p.res.oil = 500;
    run(3);
    expect(m.target).toBeFalsy();                      // nicht aufgeklärt
    spawnAt(0, 'spy', 31, 44);
    run(3);
    expect(m.target).toBeTruthy(); void tg;
  });

  it('FPV-Drohne: lauert nur, wenn eingestellt', () => {
    newGame('mittel');
    setWar(true, 0);
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

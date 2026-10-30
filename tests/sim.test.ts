// Simulationstests ohne Browser: prüft, dass die Spiellogik unabhängig von Grafik/DOM läuft.
import { describe, it, expect } from 'vitest';
import { newGame, G } from '../src/sim/state';
import { update } from '../src/sim/loop';
import { canPlace, placeSite, placeDefense } from '../src/sim/production';
import { findBuilding, countBuildings, tileCost, spawnAt } from '../src/sim/world';
import { destroy } from '../src/sim/combat';
import { STORAGE } from '../src/data/config';
import { answerOffer } from '../src/sim/offers';
import { canPlaceRoad, demolish, planRoad } from '../src/sim/build';
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
const runUntil = (cond: () => boolean, maxSec: number) => { for (let i = 0; i < maxSec * 20 && !cond(); i++) { update(0.05); if (G.offer) answerOffer(true); } return cond(); };

describe('Simulation', () => {
  it('startet ein Spiel mit Rathäusern, Miliz, Bauarbeitern und Baustoffen', () => {
    newGame('mittel');
    expect(findBuilding(0, 'hq')).toBeTruthy();
    expect(findBuilding(1, 'hq')).toBeTruthy();
    expect(findBuilding(2, 'bunker')).toBeTruthy();
    expect(G.profile[0].scarce).not.toBe(G.profile[1].scarce);
    expect(G.units.filter(u => u.owner === 0 && u.def.worker).length).toBe(4);
    expect(G.players[0].res.wood).toBeGreaterThan(0);
    expect(G.rock.some(v => v > 0)).toBe(true);
  });

  it('Baustelle: bezahlt sofort, Arbeiter bauen sie fertig, erst dann zählt sie', () => {
    newGame('mittel');
    const w0 = G.players[0].res.wood, cap0 = G.players[0].cap;
    const s = siteNearHq('house');
    expect(s).toBeTruthy();
    expect(s.site).toBe(true);
    expect(G.players[0].res.wood).toBe(w0 - 40);
    update(0.05);
    expect(G.players[0].cap).toBe(cap0);                 // Baustelle bringt noch keinen Wohnraum
    expect(runUntil(() => !s.site, 90)).toBe(true);      // Arbeiter bauen sie fertig
    expect(G.players[0].cap).toBe(cap0 + 50);
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
    newGame('mittel');
    const l = siteNearHq('lumber'), q = siteNearHq('quarry');
    expect(l).toBeTruthy(); expect(q).toBeTruthy();
    runUntil(() => !l.site && !q.site, 120);
    const w = G.players[0].res.wood, st = G.players[0].res.stone;
    run(20);
    expect(G.players[0].res.wood).toBeGreaterThan(w);
    expect(G.players[0].res.stone).toBeGreaterThan(st);
  });

  it('Zufahrt: Straße wird automatisch geplant, ohne Anschluss arbeitet nichts', () => {
    newGame('mittel');
    const q = siteNearHq('quarry');
    expect(q.access).toBeGreaterThanOrEqual(0);
    expect(runUntil(() => !q.site && !!q.connected, 150)).toBe(true);
    const i = G.road.findIndex(r => r === 2);
    if (i >= 0) expect(tileCost(i, 'veh')).toBeLessThan(1);
    // Anschluss kappen: Steinbruch fördert nicht mehr
    for (let k = 0; k < G.road.length; k++) G.road[k] = 0;
    G.roadDirty = true; update(0.05);
    const touchesHq = q.connected;
    const st = G.players[0].res.stone; run(10);
    if (!touchesHq) expect(G.players[0].res.stone).toBeLessThanOrEqual(st + 0.01);
    expect(canPlaceRoad(0, 40, 10)).toBe(false);
    expect(planRoad(0, 40, 10)).toBe(false);
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
    expect(demolish(0, s)).toBe(true);
    expect(G.players[0].res.money).toBe(m0);
    expect(G.players[0].res.wood).toBe(w0);
    expect(G.occ[idx(s.tx, s.ty)]).toBe(0);
  });

  it('KI baut ihre Stadt selbstständig auf (mit Baustellen und Holz/Stein)', () => {
    newGame('mittel');
    run(300);
    expect(countBuildings(1)).toBeGreaterThan(5);
    expect(countBuildings(1, 'lumber')).toBeGreaterThan(0);
    expect(countBuildings(1, 'quarry')).toBeGreaterThan(0);
    expect(G.players[1].pop).toBeGreaterThan(60);
  });

  it('Verteidigung wird direkt platziert und kostet Geld', () => {
    newGame('mittel');
    const hq = findBuilding(0, 'hq'), m = G.players[0].res.money;
    let ok = false;
    for (let d = 4; d < 8 && !ok; d++) ok = placeDefense(0, 'trench', Math.floor(hq.x) + d, Math.floor(hq.y) - d);
    expect(ok).toBe(true);
    expect(G.players[0].res.money).toBe(m - 30);
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

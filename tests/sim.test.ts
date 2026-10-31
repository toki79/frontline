// Simulationstests ohne Browser: prüft, dass die Spiellogik unabhängig von Grafik/DOM läuft.
import { describe, it, expect } from 'vitest';
import { newGame, G } from '../src/sim/state';
import { update } from '../src/sim/loop';
import { canPlace, placeSite, placeDefense } from '../src/sim/production';
import { findBuilding, countBuildings, tileCost, spawnAt } from '../src/sim/world';
import { destroy } from '../src/sim/combat';
import { orderEscort, orderMove } from '../src/sim/orders';
import { CONSTRUCTION, MAP_H, MAP_W, STORAGE, T } from '../src/data/config';
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
    expect(countBuildings(1, 'lumber') + countBuildings(1, 'quarry')).toBeGreaterThan(0);
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

// Simulationstests ohne Browser: prüft, dass die Spiellogik unabhängig von Grafik/DOM läuft.
import { describe, it, expect } from 'vitest';
import { newGame, G } from '../src/sim/state';
import { update } from '../src/sim/loop';
import { enqueue, canPlace, doPlace, placeDefense } from '../src/sim/production';
import { findBuilding, countBuildings } from '../src/sim/world';
import { answerOffer } from '../src/sim/offers';
import { on } from '../src/core/events';

const run = (sec: number) => { for (let i = 0; i < sec * 20; i++) { update(0.05); if (G.offer) answerOffer(true); } };
function buildNearHq(type: string) {
  enqueue(0, type);
  for (let i = 0; i < 2000 && G.players[0].ready !== type; i++) update(0.05);
  const hq = findBuilding(0, 'hq');
  for (let r = 3; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.floor(hq.x) + dx, y = Math.floor(hq.y) + dy;
    if (canPlace(0, type, x, y)) return doPlace(0, type, x, y);
  }
  return false;
}

describe('Simulation', () => {
  it('startet ein Spiel mit Rathäusern, Miliz und Startregion', () => {
    newGame('mittel');
    expect(findBuilding(0, 'hq')).toBeTruthy();
    expect(findBuilding(1, 'hq')).toBeTruthy();
    expect(findBuilding(2, 'bunker')).toBeTruthy();
    expect(G.profile[0].scarce).not.toBe(G.profile[1].scarce);
  });

  it('Wohnhaus und Bauernhof lassen die Stadt wachsen', () => {
    newGame('mittel');
    expect(buildNearHq('farm')).toBe(true);
    expect(buildNearHq('house')).toBe(true);
    const pop0 = G.players[0].pop;
    run(60);
    expect(G.players[0].pop).toBeGreaterThan(pop0);
  });

  it('KI baut ihre Stadt selbstständig auf', () => {
    newGame('mittel');
    run(240);
    expect(countBuildings(1)).toBeGreaterThan(5);
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

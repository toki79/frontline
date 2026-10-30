// Einstieg: Module verdrahten, Hauptschleife starten.
import './style.css';
import { aiThink } from './ai/kastrova';
import { cam, clampCam, resize, toWorld, init as initCamera } from './render/camera';
import { render, renderMini } from './render/renderer';
import { update } from './sim/loop';
import { aiQuotes, needLevel, trade, tradeAI } from './sim/market';
import { answerOffer } from './sim/offers';
import { orderMove } from './sim/orders';
import { canPlace, doPlace, enqueue } from './sim/production';
import { G, newGame } from './sim/state';
import { findBuilding, setWar } from './sim/world';
import { advise, updateAdvisor, init as initAdvisor } from './ui/advisor';
import { handleTap, updateInfo, input, init as initInput } from './ui/input';
import { updatePanel, init as initPanel } from './ui/panel';
import { HUD_TIPS, tipFor, init as initTooltips } from './ui/tooltips';
import { init as initDialogs } from './ui/dialogs';
import { init as initMenus, startGame } from './ui/menus';
import { init as initMessages } from './ui/messages';

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && !G.paused && !G.over) {
    // Tastatur-Scrollen (Pfeiltasten)
    const k = input.keys, sp = 700 * dt / cam.zoom;
    if (k.has('arrowup')) cam.y -= sp; if (k.has('arrowdown')) cam.y += sp;
    if (k.has('arrowleft')) cam.x -= sp; if (k.has('arrowright')) cam.x += sp;
    clampCam();
    update(dt);
  }
  render();
  if (G) {
    G.uiT -= dt; if (G.uiT <= 0) { G.uiT = 0.2; updatePanel(); updateInfo(); }
    G.advT = (G.advT || 0) - dt; if (G.advT <= 0 && !G.paused) { G.advT = 1; updateAdvisor(); }
    G.miniT -= dt; if (G.miniT <= 0) { G.miniT = 0.15; renderMini(); }
  }
  requestAnimationFrame(frame);
}

initMessages(); initCamera(); initInput(); initPanel(); initTooltips(); initAdvisor(); initDialogs(); initMenus();
resize();
requestAnimationFrame(frame);

// Test-Schnittstelle (für automatische Browser-Tests): alle Simulationsfunktionen unter window.__fl und global
import * as world from './sim/world';
import * as production from './sim/production';
import * as costs from './sim/costs';
import * as combat from './sim/combat';
import * as offers from './sim/offers';
import * as units from './sim/units';
import * as dialogs from './ui/dialogs';
Object.assign(window as any, world, production, costs, combat, offers, units, { showOffer: offers.showOffer });
(window as any).__fl = { aiQuotes, tradeAI, needLevel, advise, tipFor, HUD_TIPS, get G() { return G; }, newGame, startGame, update,
  aiThink, enqueue, doPlace, canPlace, findBuilding, orderMove, handleTap, toWorld, cam, answerOffer, trade, setWar };

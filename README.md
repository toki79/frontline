# Frontlinie

Browser-Echtzeitstrategie im Grenztal von Belgor: Städtebau, Wirtschaft, Handel, Diplomatie und Krieg.
Zwei fiktive Nationen – die **Republik Aldoria** (Spieler) und die **Föderation Kastrova** (KI) – bauen ihre Städte auf.
Mitten im Fluss hält die neutrale **Grenzmiliz** die Insel mit dem Markt.

Läuft im Browser auf PC und iPhone (Touch-Steuerung). Keine Engine, keine Grafiken – alles wird per Canvas 2D gezeichnet.

## Schnellstart

```bash
npm install
npm run dev        # Entwicklungsserver mit Live-Reload (http://localhost:5173)
npm test           # Simulationstests (ohne Browser)
npm run build      # Typprüfung + dist/index.html als EINE Datei
```

`dist/index.html` läuft per Doppelklick, lässt sich als Artifact teilen oder auf GitHub Pages veröffentlichen
(Workflow liegt in `.github/workflows/pages.yml`, in den Repo-Einstellungen unter *Pages → Source: GitHub Actions* aktivieren).

## Aufbau

Die wichtigste Regel: **Simulation und Darstellung sind getrennt.**
`sim/`, `ai/`, `data/` und `core/` greifen nie auf DOM oder Canvas zu – sie laufen auch in Node (siehe `tests/`).
Meldungen und Dialoge schickt die Simulation über `core/events.ts`; die Oberfläche hört zu.

```
src/
  data/config.ts        Alle Spielwerte: Gelände, Schaden, Einheiten, Gebäude, Forschung, Wirtschaft, KI-Schwierigkeit
  core/                 util.ts (Mathe, Zufall, Rauschen) · events.ts (Ereignisbus Simulation → UI)
  sim/                  Spiellogik
    state.ts            Spielstand G, newGame()
    mapgen.ts           Kartengenerator (fair gespiegelt, Regionen mit Engpass/Überschuss)
    world.ts            Gelände, Einheiten/Gebäude anlegen, Sicht/Nebel, Wohnqualität, Beziehungen
    pathfinding.ts      A*-Wegfindung auf dem Feldraster
    orders.ts           Befehle (bewegen, angreifen, fördern …)
    production.ts       Ausbildung/Forschung, Baustellen setzen, Platzierregeln, Verteidigungsanlagen
    build.ts            Baustellen, Bauarbeiter, Straßen (Planung, Netz, Förderbonus), Abriss
    economy.ts          Steuern, Nahrung, Holz, Stein, Metall, Raffinerie, Export, Wachstum, Stadtstufen
    combat.ts           Zielwahl, Feuern, Schaden, Flächenschaden, Beute, Spielende
    units.ts            Bewegung, Tanklaster, Drohnen-Akku, Projektile, Effekte
    market.ts           Milizmarkt (Sättigung) und Handel mit Kastrova (Bedarfspreise)
    offers.ts           Forderungen und Friedensangebote der KI
    loop.ts             update(dt) – ein Simulationsschritt
  ai/kastrova.ts        KI: Lage einschätzen → bauen, handeln, forschen, verteidigen, fordern, überfallen
  ai/militia.ts         Grenzmiliz
  render/               Canvas-Zeichnung: draw.ts (Formen), renderer.ts (Karte, Nebel, Minikarte), terrain.ts, camera.ts
  ui/                   Bauleiste, Eingabe (Maus/Touch), Info-Texte, Berater, Diplomatie, Menüs, Dialoge
  main.ts               Verdrahtung und Hauptschleife
tests/sim.test.ts       Vitest: Simulation ohne Browser
```

## Inhalte erweitern

- **Neue Einheit:** Eintrag in `UNITS` (`data/config.ts`) + Zeichnung in `drawUnitShape` (`render/draw.ts`).
- **Neues Gebäude:** Eintrag in `BUILDINGS` + Fall in `drawBuildingShape`. Produktion/Wirkung ggf. in `sim/economy.ts`.
- **Neue Forschung:** Eintrag in `RESEARCH`, Freischaltung über `tech: n` an Einheit/Gebäude.
- **KI-Verhalten:** `aiThink()` und `aiPickBuilding()` in `ai/kastrova.ts`.

Konzept und Designentscheidungen: [`docs/KONZEPT.md`](docs/KONZEPT.md).

# Konzept & Designentscheidungen

**Genre:** Echtzeitstrategie mit Städtebau (Richtung *Rise of Nations*/*Siedler*), 2D von oben, Browser, Touch-tauglich.

**Szenario:** Zwei fiktive Nationen mit moderner, realistischer Ausrüstung (Grabenkampf, Drohnen, Artillerie) – bewusst keine realen Länder.

## Kernschleife
1. Stadt wächst von selbst, wenn **Wohnraum, Nahrung und Strom** reichen. Industrie in der Nähe senkt die Wohnqualität.
2. **Rohstoffe:** Geld (Steuern), Nahrung (Bauernhof), Holz (Holzfäller am Wald, holzt ihn ab), Stein (Steinbruch an Felsen),
   Metall (Mine an Erz), Öl (Raffinerie mit Kapazität, Tanklaster).
3. **Bauen vor Ort:** Gebäude werden als Baustelle gesetzt und sofort bezahlt; **Bauarbeiter** (am Rathaus ausgebildet)
   laufen hin und bauen – bis zu 4 je Baustelle. Erst fertige Gebäude liefern Strom, Wohnraum oder Waren.
4. **Straßen & Transport:** Betriebe liefern zur nächsten Sammelstelle (Rathaus/Lagerhaus); je länger der Weg, desto
   weniger kommt an. Straßen (geplant kostenlos, Stein beim Bau) verkürzen den Weg stark – vor allem auf weiten Strecken.
   Baustellen kosten beim Setzen nur Geld, Holz/Stein/Metall holen die Arbeiter beim Bauen; fehlt es, wartet die Baustelle.
   **Ungleiche Verteilung:** Jede Stadt hat zwei Rohstoffe reichlich, zwei kaum (Wälder, Felsen, Erz, Öl, grüne Wiesen);
   Kastrova genau umgekehrt. Höfe auf Wiese bringen vollen Ertrag, auf Steppe 40 %. Umkämpfte Vorkommen in den Ecken.
   **Knappheit statt Überfluss:** Unterhalt je Gebäude, Sold, Stadtverwaltung (wächst quadratisch mit der Einwohnerzahl),
   begrenzte Lager (Lagerhaus), teure Rüstungsbetriebe, lange Forschung.
   **Dichte Bebauung hat Nachteile:** Höfe brauchen freie Äcker, enge Wohnviertel senken die Wohnqualität, Feuer springt über.
5. **Regionen:** Jede Stadt hat pro Spiel einen Engpass und einen Überschuss – Handel lohnt sich.
6. **Soldaten** werden aus der Bevölkerung rekrutiert; Fahrzeuge brauchen laufend Öl; Fahrzeuglimit je Werk.
7. **Ziel:** Endlos (Stadtstufen Dorf → Weltstadt) oder Wettlauf auf 500 Einwohner; Niederlage nur militärisch.

## KI (Kastrova)
Kein Sprachmodell, sondern Regeln mit Bewertung: Bedarf, Kräfteverhältnis, Vorsprung des Gegners, Haltung.
Eskalation: **Marktanfrage → Forderung → Überfall** (gezielt aufs fehlende Gut) → Friedensangebot nach Beute.

## Krieg
Verteidigung ist bewusst günstiger als Angriff: Heimvorteil (−30 % Schaden, Heilung), Gräben (60 % Deckung),
robuste Befestigungen, Selbstreparatur, automatische Hilfe naher Truppen. Beute bei zerstörten Gebäuden.
Drohnen in zwei Flughöhen (tief: FPV; hoch: Spionage, Reaper) mit passenden Abwehrmitteln.

## Nächste Ideen
- Brücken und Straßen durch Wald (Rodung), nachwachsender Wald
- Straßen als Angriffsziel (Sabotage), Lastwagen für Baustoffe
- Diplomatie per Sprachmodell (freie Verhandlungen)
- Echte Grafiken (z. B. aus ComfyUI), Darstellung über PixiJS

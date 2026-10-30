# Konzept & Designentscheidungen

**Genre:** Echtzeitstrategie mit Städtebau (Richtung *Rise of Nations*/*Siedler*), 2D von oben, Browser, Touch-tauglich.

**Szenario:** Zwei fiktive Nationen mit moderner, realistischer Ausrüstung (Grabenkampf, Drohnen, Artillerie) – bewusst keine realen Länder.

## Kernschleife
1. Stadt wächst von selbst, wenn **Wohnraum, Nahrung und Strom** reichen. Industrie in der Nähe senkt die Wohnqualität.
2. **Rohstoffe:** Geld (Steuern), Nahrung (Bauernhof), Metall (Mine an Erz), Öl (Raffinerie mit Kapazität, Tanklaster).
3. **Regionen:** Jede Stadt hat pro Spiel einen Engpass und einen Überschuss – Handel lohnt sich.
4. **Soldaten** werden aus der Bevölkerung rekrutiert; Fahrzeuge brauchen laufend Öl; Fahrzeuglimit je Werk.
5. **Ziel:** Endlos (Stadtstufen Dorf → Weltstadt) oder Wettlauf auf 500 Einwohner; Niederlage nur militärisch.

## KI (Kastrova)
Kein Sprachmodell, sondern Regeln mit Bewertung: Bedarf, Kräfteverhältnis, Vorsprung des Gegners, Haltung.
Eskalation: **Marktanfrage → Forderung → Überfall** (gezielt aufs fehlende Gut) → Friedensangebot nach Beute.

## Krieg
Verteidigung ist bewusst günstiger als Angriff: Heimvorteil (−30 % Schaden, Heilung), Gräben (60 % Deckung),
robuste Befestigungen, Selbstreparatur, automatische Hilfe naher Truppen. Beute bei zerstörten Gebäuden.
Drohnen in zwei Flughöhen (tief: FPV; hoch: Spionage, Reaper) mit passenden Abwehrmitteln.

## Nächste Ideen
- Holz und Stein als Baustoffe, Baustellen mit sichtbaren Arbeitern
- Straßen (schnellere Förderung/Bewegung)
- Diplomatie per Sprachmodell (freie Verhandlungen)
- Echte Grafiken (z. B. aus ComfyUI), Darstellung über PixiJS

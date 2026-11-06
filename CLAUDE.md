# Hinweise für KI-Assistenten

- Sprache im Code-Kommentar und in der Oberfläche: **Deutsch**.
- **Simulation (`src/sim`, `src/ai`, `src/data`, `src/core`) darf kein DOM/Canvas verwenden.** Meldungen über `msg()` bzw. `emit()` aus `core/events.ts`.
- Spielwerte gehören in `src/data/config.ts`, nicht verstreut in die Logik.
- Vor jedem Commit: `npm run build` (inkl. Typprüfung) und `npm test` müssen grün sein.
- Hauptplattform ist der Laptop (MacBook, Maus/Trackpad und Tastatur). Touch muss weiter funktionieren (Hover nur als Zusatz).

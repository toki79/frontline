# Hinweise für KI-Assistenten

- Sprache im Code-Kommentar und in der Oberfläche: **Deutsch**.
- **Simulation (`src/sim`, `src/ai`, `src/data`, `src/core`) darf kein DOM/Canvas verwenden.** Meldungen über `msg()` bzw. `emit()` aus `core/events.ts`.
- Spielwerte gehören in `src/data/config.ts`, nicht verstreut in die Logik.
- Vor jedem Commit: `npm run build` (inkl. Typprüfung) und `npm test` müssen grün sein.
- Mobile zuerst: Jede Bedienung muss per Touch funktionieren (Hover nur als Zusatz).

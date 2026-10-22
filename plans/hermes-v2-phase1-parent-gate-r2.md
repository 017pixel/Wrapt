# Hermes V2: Phase-1-Parent-Gate, Runde 2

Stand: 16.10.2026. Gezielter Recheck von M1 aus
`hermes-v2-phase1-parent-review.md`, einschließlich der unmittelbaren
Nebenwirkungen im Dispatcher. Kein erneuter Gesamtaudit.

## Urteil: PASS für den geprüften Parent-Teil

M1 ist behoben. Keine offenen Blocker-, High- oder Medium-Findings im
beauftragten Parent-Scope. Die Freigabe umfasst die geprüfte Preference- und
Dispatcher-Grenze. Sie ersetzt keine Prüfung der noch parallel entstehenden
V2-Shell, Einstellungen oder Feature-Routen.

## Nachgewiesene Korrektur

`apps/web/src/components/hermes/HermesShell.tsx`, Zeilen 15 bis 26:

- Der Dispatcher berücksichtigt `props.active ?? useRouteActivity()`.
- Die letzte aktive URL-Auswahl wird lokal gespeichert. Eine geparkte
  Oberfläche übernimmt keine fremde Classic-/`path`-Auswahl der aktiven Seite.
- Eine aktive Hermes-Fläche wertet explizite Classic-Links weiterhin sofort aus.
- Gespeicherte Adminziele eines Panels behalten ihre Classic-Priorität.
- Das globale Feature-Flag wird unabhängig von Aktivität und gespeicherter
  Auswahl ausgewertet. Abschalten entfernt auch geparktes V2 unmittelbar.
- Die V1-Shell bleibt im Off-Zweig; der V2-Import bleibt lazy. Die Korrektur
  ergänzt keine globalen Listener oder weiteren Lifecycle-Ressourcen.

Die neuen Tests verwenden tatsächliche `MemoryRouter`-, `Routes`- und
`PersistentOutlet`-Komponenten mit dem echten Dispatcher und der echten
klassischen Shell. Beim Parken und Zurückkehren bleibt dieselbe klassische
iframe-Instanz erhalten. Die inverse V2-Variante bleibt trotz einer fremden
`path`-Query erhalten; anschließendes globales Abschalten zeigt sofort Classic.

## Eigene Prüfung

Folgender vom Parent bereitgestellte isolierte Lauf wurde selbst ausgeführt:

```bash
pnpm --filter @wrapt/web exec vitest run \
  --config /home/bbecker/projects/Wrapt/temp/hermes-v2/dispatcher-vitest.config.mjs \
  src/components/hermes/HermesShell.test.tsx
```

Ergebnis: eine Testdatei, 13 Tests erfolgreich. Die temporäre Konfiguration
wurde ebenfalls gelesen. Sie löst ausschließlich die zu diesem Zeitpunkt noch
fehlende V2-Shell virtuell auf; die Shell-Testdatei stellt deren sichtbaren Stub.
Die produktive Dispatcher-, Classic- und Parking-Logik wird nicht ersetzt.

Die weiterhin gültigen Preference-, Storage- und V1-Befunde aus Runde 1 wurden
durch diese gezielte Korrektur nicht verändert. Der historische M1-Befund der
ersten Reviewdatei ist mit diesem Gate geschlossen.

## Grenze der Freigabe

GLM-Dateien fehlten beim Lauf weiterhin als bekannter Zwischenstand. Kein
Finding daraus abgeleitet und keine Ersatzdatei im Produkt angelegt.
Vollständiger integrierter Typecheck, echte V2-Off-Grenze der neuen Routen,
E2E- und Browserprüfung bleiben beim Parent nach der Integration. Die grüne
Stub-Prüfung ist keine Aussage über deren spätere Implementierung.

Einziges neues Schreibartefakt dieses Rechecks ist diese Datei. Keine
Produktänderungen, weiteren Agents, Dienste, Previews, Neustarts, Commits,
Browserwerkzeuge oder Claude-CLI verwendet.

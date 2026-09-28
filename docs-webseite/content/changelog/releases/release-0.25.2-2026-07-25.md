# [0.25.2] - 2026-07-25

### Erstellt

- Filter für harmlose Browser-Meldungen im Crash-Report, erweiterbar über eine dokumentierte Liste
- Ignorierte Meldungen erscheinen im Verlauf des Berichts, statt spurlos zu verschwinden
- Wiederholte Verlaufseinträge werden zu `(N×)` zusammengefasst
- Unit-Tests für die Absturz-Erkennung (`crashReport.test.ts`)
- E2E-Test, der prüft, dass eine ResizeObserver-Meldung kein Pop-Up öffnet

### Verändert

- `ResizeObserver loop completed with undelivered notifications` gilt nicht mehr als Absturz — die Meldung ist laut Spezifikation harmlos und trat im Orbit (`@xyflow/react`) beim Zoomen auf
- Inhaltslose Cross-Origin-Meldungen (`Script error.`) und abgebrochene Anfragen (`AbortError`) lösen kein Pop-Up mehr aus
- Der Berichtsgenerator liest `location`, `navigator` und Viewport defensiv, statt ohne DOM selbst zu scheitern

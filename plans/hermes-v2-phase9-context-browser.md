# Phase 9: Rootprüfung des Sitzungskontexts

17.10.2026. M3 aus dem terminalen unabhängigen R2 ist bestätigt.
Dies ist ein Autoren-/Integrationsbeleg, kein unabhängiges Reviewurteil.

## Unveränderte gesunde Sollfälle

Neue Datei `tests/e2e/hermes-v2-session-context.spec.ts`, fünf Fälle:
Route und Standalone jeweils390/1440, tatsächlich gelieferte cwd/projectId/source
bei geschlossenem Drawer; zusätzlich Sitzungswechsel und Leerwahl bei390×500.
Vor der Kontextkorrektur: **0/5 bestanden, Exit1**, jeweils erwartete Anzeige fehlt.
Die vorherige Composerbereitschaft war gesund. Log:
`/tmp/wrapt-hermes-v2-phase9-context-initial-browser.log`.
Artefakte unter `temp/hermes-v2/generated/phase9-context-initial-browser/`.
Kein bestehender Test, Fake oder Timeout für diese Gegenproben geändert.

E2E-Typprüfung und gezielter ESLint der neuen Datei jeweils Exit0.
Root-MCP-Harness ebenfalls gezielter ESLint mit `--no-ignore` Exit0.

## Nachher und Browser

Frischer isolierter Webbuild Exit0. Produktionsdist unverändert.
**Dieselben fünf gesunden Sollfälle grün** im gezielten Lauf mit27/27 Fällen,
Exit0,1.0min. Weitere Fälle: tatsächliches schmales Orbitpanel, vier Breiten,
Lesebelege nach Scrollen, Ressourcenlayouts, Tastatur/reduced motion und
390×500 mit offener Freigabe, sichtbarer Arbeit, zehn Anhängen und echtem
klickbarem Hauptstop. Keine alten Assertions oder Fakes geändert.
Log `/tmp/wrapt-hermes-v2-phase9-context-targeted-browser.log`.

Vollständige Websuite:2178/2178 in298Dateien,37.52s,Exit0,korrekt8Workers.
Log `/tmp/wrapt-hermes-v2-phase9-context-web-all-tests.log`.
Autor separat:99 relevante Fälle, volle Typen, gezielter Lint/CSSparse/Architektur0.
Root zusätzlich E2Etypes0, neue E2E-/MCPdatei lint0, Architektur0.

Eigener Playwright-MCP mit frischer contractvalidierter Fixture, nur eigenerTab1.
Route/Standalone jeweils390×500 und1440×900, beliebig lange native Pfade und
Projektkennungen sowie rohe Vendorquelle: jeweils genau44px Kontextregion,
kein horizontaler Dokumentoverflow. Vollständiger Originaltext im DOM; echtes
Fokus/ArrowRight scrollt das Feld jeweils40px. Keine Message/Create/Stopwrites.
Vier Testbilder selbst angesehen; zusätzliche mobile Aufnahme mit kurzen Werten
im Chat gezeigt. Alle Daten sind eigene synthetische Testdaten, kein Coreturn.
`temp/hermes-v2/phase9-context-mcp-results.json` und `phase9-context-*.png`.

Storage exakt zurückgesetzt, eigenerTab geschlossen, nurTab0about:blank verbleibt.
Fixture disposed,0Viewer/Timer/Uploads/Ressourcenpending, HTTP-Routen entfernt.
Mangels unrouteWebSocket bleiben lediglich inerte Websockethandler zurück.
Keine Nutzer-Previews, Slots, Accounts oder Dienste verändert.

Neuer integrierter516erFreeze vor/nach gleich:
`temp/hermes-v2/generated/phase9-context-integrated-code-freeze.json`, SHA256
`b51608e165352e5d8e6b0bbd3aeaec7e871decd69b5a56cc1045bfbf3629f59f`.
Alte511/513Manifeste bleiben unverändert. Gegen513 nur zwei autorisierte
Bestandsquellen geändert; hinzu kommen neue Komponente, Unitdatei und E2Edatei.

Neuer unabhängiger R3 steht noch aus. Phase10/11 weiterhin gesperrt.

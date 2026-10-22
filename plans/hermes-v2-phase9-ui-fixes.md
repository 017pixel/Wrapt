# Phase9: Leseposition und lokale Touchziele

17.10.2026. Root korrigiert M2/L1 des unabhängigen
`hermes-v2-phase9-codex-ux-fallback-gate.md`. Der dafür erneut gestartete
GLM-Autor erreichte vor Änderungen sein Providerlimit. Übernahme gemäß
Original15.3/24.9, ausschließlich zwei kleine CSSkorrekturen. Keine weitere
Gestaltungsänderung. M1 besitzt den getrennten Codex-Auswahlfixbericht.

## Konkrete Korrekturen

M2: `.hermesv2-row` ist der positionierte Bezug des Lesemarkers. Der Marker
liegt ausdrücklich am unteren Zeilenende statt an der statischen Position im
gesamten Shellcontainer. Dies gilt gleichermaßen für Antworten, Fehler und
Notices. Der vorhandene Observer und seine Sichtbarkeits-/Ownerguards bleiben
erhalten. Lange Antworten benötigen weiterhin ihr tatsächlich sichtbares Ende.

L1: ausschließlich quiet-button-Ziele der eigenen V2-Toolbar und des
Standalonefooters erhalten mindestens44pxHöhe. Die Regel gilt auch für schmale
Container in breiten Fenstern. Gemeinsame globale Buttons und Hermes-Admin-CSS
bleiben erhalten. Bestehende Tokens und Flächen werden weiterverwendet.

## Quellen und Prüfungen

Produktquellen exakt:

- `hermes-v2.css`,298Zeilen,
  SHA256 `17db0565cedad6f69d2cecfca88ed1d0f4599ec1ecb311017eec48d20f96a2b5`.
- `hermes-v2-messages.css`,357Zeilen,
  SHA256 `f08d1dff8e6ba82285def967d844f452af67922365bf49705b2d736bcdf15dea`.

Neue Rootbrowserregressionen: vier Route-/Standalone-Lesepositionsfälle in
`hermes-v2-read-position.spec.ts` und ein zusätzlicher tatsächlicher
Orbit-Touchfall in `hermes-v2-panel-sessions.spec.ts`. Bestehende Fälle und
Assertions bleiben erhalten. Alle fünf neuen gesunden Sollfälle gegen alten
Build tatsächlich rot, Exit1. Gegen frischen korrigierten Build alle grün;
28/28gezielte Browserfälle einschließlich alter langer Drawerantwort, Organisation,
Polish und echter Panelpersistenz bestanden, Exit0.

MCP nur auf eigener Instanz19470, zuerst navigate/snapshot. Bei390/1440px
je ein echter Read-Ack für die gescrollte letzte Antwort, Marker innerhalb der
Zeile und des Chatclips. Klassisch/Einstellungen/Workbench sowie Routenfenster
je44px und tatsächlicher Zentrumhit; Input16px. Drei Screenshots selbst
angesehen,390pxBild im Chat gezeigt. Messungen in
`temp/hermes-v2/phase9-fixes-mcp-results.json`, Bilder `phase9-fixes-*.png`.

Frischer isolierter Webbuild Exit0, Vite1,56s. Produktionsindexmtime bleibt
16.10.13:59:15. Eigener E2E-Typcheck, scopedLint der neuen Tests und des
MCP-Skripts sowie Architekturprüfung Exit0. Voller aktueller Weblauf mit korrekt
übergebenem `exec vitest run --maxWorkers=8`:2167/2167in297Dateien, Exit0.
Gesamte180Hermesbrowserfälle anschließend separat in5,7min bestanden, Exit0.
Dies ersetzt das unabhängige erneute UX-Gate nicht.

## Erhaltene Fehlversuche und Grenzen

Erster Browserstart brach vor Tests wegen falsch benanntem External-Server-
Umgebungswert ab; mit WRAPT_E2E_EXTERNAL=true folgt der oben belegte rote Lauf.
Ein früher Webbuild meldete die inzwischen vom Codex korrigierte unzulässige
RTL-Testoption exact:true; Vite startete dabei nicht. Der erste Gesamt-Webaufruf
übergab die Workeroption hinter zusätzlichem `--`,2166grün/ein5sLazytimeoutrot.
Die installierte parseCLI-Funktion bestätigt die dabei ignorierte Option;
korrekter anschließender vollständiger Lauf grün. Keine Zeitlimits oder Assertions
geändert, fehlgeschlagene Logs bleiben erhalten.

Der erste vorbereitende MCP-Cleanupausdruck referenzierte localStorage irrtümlich
im Nodekontext und brach vor Mutation ab. Danach korrekter Cleanup über
page.evaluate: eigener Storage wiederhergestellt, Fixture disposed, null Viewer,
HTTP-Routen entfernt, eigener Tab geschlossen, Basistab0weiterhinabout:blank.
Inerte WebSocket-Fixturehandler haben keine laufenden Sockets oder Timer.
Automatische rote Browserausgaben byteerhaltend nach generated verschoben;
keine400Zeilenbaseline verändert. Server19470läuft unverändert weiter für Review.

Logs `/tmp/wrapt-hermes-v2-phase9-fixes-*.log` und
`/tmp/wrapt-hermes-v2-phase9-fix-initial-browser*.log` dokumentieren die Läufe.
Kein realer Coreturn, Dienstneustart, Nutzerpreview, Git oder Versionswechsel.
Neuer integrierter513erFreeze:
`temp/hermes-v2/generated/phase9-fixes-integrated-code-freeze.json`,
SHA256 `344f7a963f64b80dbc0406646ebb59fa55fdcd4a38e88f96a46ef7bc21e0a70a`.
Unabhängiges neues Gate steht aus; keine Selbstabnahme der Gesamtphase.

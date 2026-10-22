# Hermes V2: Abschluss des Implementierungsgoals

Stand: 18.10.2026. Lokal abgeschlossen. Alle Schlussbefunde unabhängig geschlossen,
Pflichtprüfungen und echter aktueller Hermes-Smoke bestanden.
Fortsetzung aus T3-Thread `8b791d34-9f14-4eb9-8d9c-0c7126d954e4`.
Der vollständige Auftrag und die Phasenbelege stehen in
`plans/hermes-v2-progress.md` und den dort genannten Berichten.

## Offene Phase-11-Fehler korrigiert

- P11-B1: Eine monotone Sessionkontextrevision entwertet die alte Anhangbindung
  nach beobachtetem Profil-/CWD-Wechsel, auch bei Rückkehr zum alten Wert.
- P11-B2: Anhänge und Ressourcen teilen den physischen HOME-Nachweis mit
  dev/ino und monotoner Generation. Ersatz am gleichen Pfad und beobachtetes
  Zurückbenennen machen einen alten Beleg nicht wieder gültig.
- P11-B3: Finale maskierte Verlaufsseiten und Snapshots halten das bestehende
  4-MiB-Clientbudget ein. Die Projektion erhält Nachrichten, IDs und Pagination.
  Kürzungshinweise und fehlende Vollständigkeitslesebelege verhindern falsche ACKs.

Autorenbelege: `hermes-v2-phase11-attachment-fixes.md` mit 317 Tests und
`hermes-v2-phase11-history-fixes.md` mit 172 Tests. Die unveränderten Originalrepros
bestätigen die korrigierten Ergebnisse und ihre gesunden Kontrollen. Das ersetzt
nicht die anschließende unabhängige Nachprüfung. Diese ist inzwischen mit PASS
abgeschlossen: `hermes-v2-phase11-backend-gate-r2.md`, 370 Regressionstests,
zwölf Originalreprofälle und 17 zusätzliche unabhängige Fälle, keine neuen Befunde.

Der Visualreview schließt C1/C2/C3 und meldet nur P11-V1 als Low: Memoryabschnitte
überlagern sich. Root korrigiert ausschließlich deren Flexschrumpfung. Der echte
DOMabstand wechselt von minus28,703125 auf plus20px in drei Größen; Quelle und
Nachweis stehen in `hermes-v2-phase11-memory-fix.md`. Der unabhängige UX-Check
nimmt diesen Fix zusammen mit den übrigen Bedienabläufen ab.

Der unabhängige UXreview schließt P11-V1 mit konstant20px Abstand und prüft die
Bedienabläufe. Sein einziges neues Low P11-U1 betrifft Escape nach Öffnung der
Befehlspalette per Button. Root reproduziert den Fehler und korrigiert Fokus
sowie Escape im gemeinsamen Composerbereich. Derselbe Repro ist auf Desktop,
Mobil und im Nur-Lese-Modus grün, Entwurf unverändert, null Sends. Beleg:
`hermes-v2-phase11-palette-fix.md`. Die vierte unabhängige Instanz schließt beide
Lows und alle Schlussbefunde: `hermes-v2-phase11-verification.md`. Sie führt
351 gezielte Tests und zwölf unveränderte Originalreprofälle aus, prüft deren
gesunde Gegenfälle sowie den gesamten früheren Findingsledger gegen aktuelle
Quellen. Kein neuer Befund; Freeze537/537 unverändert und Cleanup bestätigt.

Der anschließende echte Smoke deckt P11-R1 auf: Modellwahl überträgt den Anbieter
im falschen nativen Format. `hermes-v2-phase11-provider-fix.md` dokumentiert den
direkten Originalparser-Nachweis, die enge Korrektur auf --provider/--session,
3rote/2gesunde neue Vorfixfälle und105gezielte grüne Nachfixfälle. Neue unabhängige
Fixverifikation schließt P11-R1:83 Bestandstests und44 zusätzliche Kontrollen,
echter Originalparser/Consumer, Freeze538 unverändert. Bericht:
`hermes-v2-phase11-provider-gate.md`. Die ursprünglichen Gates bleiben erhalten.

## Prüfstand

Die Funktionsabnahme des Originalauftrags ist auf diese aktuellen Belege verteilt:

- Default-off, Migration, Tababgleich, V1-Rückweg, normale Route, Standalone und
  Panel-/Orbitwahl: Preference-/Host-/Routingtests sowie `hermes-v2.spec.ts`,
  `hermes-v2-panel-sessions.spec.ts` und `hermes-v2-session-context.spec.ts`.
- Verlauf, Streaming, Reasoning, Tools, Stop, gleiche Antworten und Reconnect:
  Gateway-/Client-/Historytests und `hermes-v2-chat.spec.ts`. Neuer Outputschutz
  zusätzlich durch unabhängige reale Manager-/GatewayClient-Repros geprüft.
- Freigaben, Rückfragen, Secrets, Doppelsenden, veraltete Antworten und sichere
  Wiederholung: Request-/Mutationstests und `hermes-v2-request*.spec.ts`.
- Sidebar, Needs-input, Working, Pin, Snooze, Settle, Suche, DnD, Undo und genaue
  Lesebelege: Organisationstests, `hermes-v2-sidebar.spec.ts` und
  `hermes-v2-read-position.spec.ts`. Der Kürzungsfix entzieht unvollständige ACKs.
- Modell-/Providerwahl, Befehle, Skills, Denktiefe und Dateien: Composer-/Katalog-/
  Attachmenttests und entsprechende Composer-/Upload-E2Es. Echter Datei-/Katalog-
  Smoke in `hermes-v2-phase6-runtime-smoke.md`, mit dessen ausdrücklich begrenztem Scope.
- Strukturierte Nebenaufgaben, Prozesse, Queue, Steer und eigener Zwischenauftrag:
  Worktests und vier Work-/Queue-E2E-Dateien. Echter eigener Zwischenauftrag in
  `hermes-v2-phase7-runtime-smoke.md`; native Teilabdeckung bleibt sichtbar.
- Cron, Skills, Memory, Pending, Diagnose, geschützte native Löschung und
  responsive Ressourcen: Ressourcentests und Ressourcen-/Cron-/Delete-E2Es.
  Echte lesende Ressourcenprüfung in `hermes-v2-phase8-runtime-smoke.md`.
- Auth, Origin, Pfade, Outputmaskierung, Claims, Bindungen und unbekannte
  Schreibergebnisse: unabhängige Backendgates und aktuelle370 Schutzregressionen.
- Performance, viele Sessions,4000 Nachrichten, Reconnect/Cleanup, Keyboard,
  Light/Dark, Reduced Motion und alle vier geforderten Breiten: Phase10-Berichte,
  neuer Visualreview und tatsächliche aktuelle E2E-/MCP-Messungen.
- Gemeinsame echte Hermesdaten mit CLI und klassischer Oberfläche: reale Belege
  aus Phase3 und `hermes-v2-classic-parallel-smoke.md`; abschließender aktueller
  eigener Hauptturn in `hermes-v2-final-runtime-smoke.md` erfolgreich.

- Standardkommando `VITEST_MAX_WORKERS=4 pnpm test`: zuletzt Exit 0,4665 Tests.
  Web2178, Server1868, Contracts160, Extension-Contracts454,
  Launcher 2, Dokumentation 3. Keine Testlimits oder Assertions aufgeweicht.
- Globales `pnpm exec eslint . --max-warnings=0`: Exit 0.
- `pnpm architecture:extensions`: Exit 0.
- Backend-TypeScript-Build mit separatem `/tmp`-Ausgabeordner: Exit 0.
- Abschließendes `pnpm typecheck`: Exit 0, einschließlich E2E-Typen.
- Vollständige Hermes-V2-Browserregression: 197/197, Exit 0 in 6,2 Minuten.
  Eigener isolierter Source-Server auf 19770, eigener Webbuild und eigene Daten;
  danach Server beendet und Ports 19770 bis 19900 wieder frei.
- Nach dem reinen Memory-CSSfix: 22/22 passende Ressourcen-/Layout-/Panelfälle,
  Exit 0; eigener zweiter Source-Server danach wieder beendet.
- Nach dem Tastaturfix: komplette4660 Standardtests, globale Typprüfung und
  ESLint erneut Exit0.55/55 unveränderte Composer-/Dialog-/Fokus-/Request-E2Es
  auf eigenem dritten Source-Server grün; danach eigene Testports wieder frei.
- Nach dem Anbieterfix:4665 Standardtests, globale Typen/ESLint und neuer
  isolierter Backendbuild erneut Exit0. Keine Webquelle geändert.
- Globaler Dateigrößencheck nach den generierten Reviewartefakten: Exit 0.
- Backendgate R2 grün; Visualreview abgeschlossen, dessen Low P11-V1 korrigiert.
- Unabhängiges UXgate und vierte Codexverifikation bestanden, alle neuen Befunde geschlossen.
- Erster echter Schluss-Smoke: vollständig als FAILED erhalten. Bestehendes
  QA-Modell meldet nativ HTTP401/abgelaufener OpenCode-Go-Schlüssel, kein Delta,
  ein Fehlerabschluss und14 persistierte Rows. Kein unklarer oder wiederholter Send.
  Auch der zweite echte Bezahlmodellturn bleibt nach HTTP402 FAILED.
- Abschließender echter Test mit kostenfreiem Modell aus dem Sitzungskatalog:
  PASS, ein Submit, acht Deltas, exakte persistierte Antwort und gleiche IDs
  nach Wiederverbindung. Ursprüngliches QA-Modell tatsächlich zurückgesetzt,
  beide Clients geschlossen. Details: `hermes-v2-final-runtime-smoke.md`.
  Globale Defaults und Zugangsdaten unverändert; kein erfolgreicher Test mit
  dem weiterhin abgelaufenen Standardschlüssel behauptet.

Der endgültige538-Dateien-Freeze liegt unter
`temp/hermes-v2/resume-20261018/generated/code-freeze-provider.json`.
Gegenüber `code-freeze-final.json` nur der native Modellwirewert,
ein angepasster alter Wiretest und fünf neue Anbieter-/Flagfälle.
Die ursprünglichen Manifeste und fehlgeschlagenen Belege bleiben erhalten.

## Dokumentation und Version

Featureversion 2.9.0, Contracts 0.19.0. Beide gehören zum noch unveröffentlichten
Featureabschluss. README, Einstellungen, Konfiguration, Architektur,
Sicherheitsgrenzen, Hermes-V2-Anleitung und Changelogs sind aktualisiert.
Das Flag bleibt standardmäßig aus; V1 und die gemeinsame Hermes-Datenbasis bleiben.

## Betriebsgrenzen

Native Workabdeckung ist teilweise, die Queue zeigt den nächsten gemeldeten
Eintrag. Nicht unterstützte Memory-/Skillfreigaben führen zur klassischen
Verwaltung. Natives Sitzungsdelete hat eine Bestätigung, aber keine Restore-API.
Organisationsaktionen haben weiterhin Rückgängig. Diese Grenzen sind dokumentiert.

Die HOME-Prüfungen sind keine atomare Sperre gegen unbeobachtete externe Änderungen
zwischen zwei FS-Nachweisen. Redaction unter maximaler 8-MB-Grenzlast kann den
Eventloop weiterhin ungefähr eine halbe Sekunde belegen. Auf sehr niedrigen
Displays bleibt Stop bei zusätzlichen Fehlerhinweisen per Scrollen/Tastatur erreichbar.

Der erste GLM-Visualversuch endete nach Serverstart ohne Abnahme. Er baute
versehentlich zusätzlich `apps/server/dist`; kein Dienst wurde neu gestartet.
Die tatsächliche visuelle Prüfung übernahm eine neue unabhängige Codex-Instanz.
Beide regulären DeepSeek-Endpunkte brachen den UX-Auftrag mit HTTP500 ab,
ohne Bericht oder Browserabnahme. Eine neue Codex-Instanz übernahm diese Rolle;
die fehlgeschlagenen Läufe zählen nicht als unabhängige grüne Gates.
Der Providerwechsel entspricht Original24.9; beide Rollen wurden tatsächlich
von getrennten neuen Instanzen geprüft, die vierte Verifikation nochmals separat.
Generierte alte JSON-Ausgaben und dieser Review-Webbuild liegen bytegleich unter
`generated`; ihre ursprünglichen Pfade funktionieren weiter als Symlinks.

Keine Commits, Pushes oder Dienstneustarts. Nutzerpreviews und ihre Zuordnungen
werden nicht verändert. Alle eigenen Testserver sind beendet,19470–19491 und
19770–19900 wieder frei. Browserfixtures sind bereinigt, Browser about:blank.
Die letzte Prozesskontrolle fand eine später gestartete zweite GLM-Testkopie
auf19470. Eigene isolierte CONFIG_DIR/HERMES_ENABLED=false und Launcher75293
eindeutig nachgewiesen, nur diesen Launcher regulär beendet und Ports nachgeprüft.
Alle538 eingefrorenen Quellen sowie beide Nutzerkonfigurationen, der
Produktions-Webindex und globale Hermes-Konfiguration/Zugangsdaten sind
abschließend bytegleich zu ihren erfassten Hashbaselines. Alle sieben aktuellen
delegierten Aufgaben terminal abgeschlossen, keine Kinder mehr aktiv.
Maschinenbeleg: `temp/hermes-v2/resume-20261018/generated/completion-evidence.json`.

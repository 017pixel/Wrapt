# Abschließende Abnahme des Performanceplans

Ergänzt den [Umsetzungsbericht](performance-implementation.md) und den
[Auditplan](../Performance%20Audits/PERFORMANCE_AUDIT_AND_IMPROVEMENT_PLAN.md).
Alle Zahlen stammen aus eigenen Dummy-Fixtures, nicht aus Nutzer-Previews oder
privaten Sessions. Browserzugriff ausschließlich über Playwright-MCP.

## Nachprüfung vom 22.10.2026, Wrapt 2.19.0

Der aktuelle Stand wurde in einer eigenen Quellkopie gebaut und auf Loopback-Port
24410 mit temporärer Datenbank geprüft. Nutzer-Previews und laufende Dienste
blieben unverändert. Die folgenden älteren Abschnitte beschreiben Wrapt 2.2.10;
ihre Werte sind keine Baseline für diesen Build.

`pnpm performance:smoke` verlangt `WRAPT_E2E_URL` und
`WRAPT_E2E_ISOLATED=true`, akzeptiert ausschließlich Loopback und liest keine
privaten Sessions. Drei Clients lesen je 40 Health-Antworten im Abstand von 25 ms.
Das Budget beträgt jeweils 100 ms für Health-p95 und Event-Loop-p99.

| Probe | Ergebnis |
| --- | ---: |
| Health, 120 Antworten, p50 / p95 | 3,29 / 6,84 ms |
| Event-Loop-p99 während dieser Probe | 22,81 ms |
| Echter Code-Plugin-Build | 1.940 ms |
| Health während des Builds, drei Clients, 152 Antworten, p50 / p95 | 2,99 / 34,37 ms |
| Langsamste einzelne Health-Antwort während des Builds | 304,86 ms |

Der Build-Test legt ausschließlich in der Testinstanz ein eigenes Plugin über
`POST /plugins/code/scaffold` an, baut es über `POST /plugins/code/:id/build` und
entfernt es anschließend. Währenddessen laufen drei Health-Leser im 25-ms-Takt.
Der Compiler läuft in einem eigenen Prozess. Die Perzentilbudgets gelten nicht
als Garantie für einzelne Antworten. Ein früherer Messlauf enthielt einen
Event-Loop-Ausreißer von 1,41 Sekunden bei noch synchroner Kompilierung; wegen
unterschiedlicher Begleitlast ist das kein kontrollierter Vorher-Nachher-Vergleich.

Mobilprofil: drei kalte Browserkontexte, 390 × 844 Pixel, CPU-Faktor 4,
150 ms Netzlatenz und 200.000 Bytes/s Downstream. Der Vergleich betrifft nur den
Startzustand dieses Arbeitsschritts, nicht den ursprünglichen Projektstand.

| Messpunkt | Vor sichtbarem Ladehinweis | Mit sichtbarem Ladehinweis |
| --- | ---: | ---: |
| First Contentful Paint | 5.732–5.876 ms | 2.708–2.728 ms |
| Dashboard sichtbar | 5.855–6.016 ms | 5.810–5.899 ms |

Der Hinweis verkürzt die leere Startphase. Er beschleunigt den vollständigen
Dashboard-Aufbau nicht. CLS liegt in den neuen Läufen bei 0,0062 bis 0,0219.
Der große gemeinsam genutzte Notiz-Chunk von rund 1,1 MB bleibt eine Buildwarnung;
das Warnlimit wurde nicht angehoben. Diese synthetischen Werte sind keine
Messung auf einem echten Smartphone oder über Tailscale.

Der isolierte Server startet den produktiven Terminal-Sync nicht. Seine Diagnose
meldet deshalb korrekt `lastSuccessAt: null`. Datenbanksperren und anschließende
Erholung sind separat mit echter temporärer SQLite-Datenbank geprüft.

Bestanden: 4.970 Vitest-Tests, fünf Launcher-/Dokumentationstests und 45
Chromium-E2E-Tests ohne Skip oder Flake. Server-Coverage: 83,87 % Zeilen,
79,71 % Statements, 71,35 % Branches und 80,68 % Funktionen. Die zuvor falsch
verschachtelten Server-Schwellen sind aktiv; die Qualitäts-Gate-Probe prüft
zusätzlich die tatsächlich geladene Server- und Webkonfiguration.
Typecheck, Lint ohne Warnungen, Dateigrößencheck und isolierter Gesamtbuild sind
grün. Desktop und Mobil wurden mit Playwright-MCP geprüft, ohne Konsolenfehler.
Rohdaten und Screenshots liegen unter `temp/verbesserungen-2026-10-22/`.

## Buildmetriken und Prozesswartezeiten

Drei kopierte Releases mit denselben 742 Dateien wie beim Audit. Je 20 Reads,
parallel echte HTTP-Health-Requests und WebSocket-Echo im 10-ms-Takt.

| Buildread | Median / p95 | Health-p95 | WS-p95 | Event-Loop-p99 |
| --- | ---: | ---: | ---: | ---: |
| Vorher synchron | 20,70 / 27,50 ms | 47,47 ms | 23,19 ms | 24,23 ms |
| Nachher kalt, Cache pro Read geleert | 20,44 / 29,79 ms | 2,57 ms | 1,66 ms | 4,25 ms |
| Nachher warm | 0,069 / 0,535 ms | 1,81 ms | 0,82 ms | 1,69 ms |

Kaltes Dateisystem-I/O bleibt erforderlich. Der warme Read prüft nur den
Releaseindex; parallele Reads, TTL, fehlende Varianten, Refresh, beschädigter
Index und atomarer Austausch sind separat durch fünf Tests gesichert.

Die tmux-Fixture führt keine Betriebssystembefehle aus. Der echte Manager
verwendet einen Fake-Runner mit fünf Sekunden Wartezeit je Setup. Mutationen
bleiben seriell, die Fixture umfasst 1/4/12 Sessions und je 20 Watchdogticks.

| Sessions | Gesamtwartezeit | Health-p95 | WS-p95 | EL-p99 | Abfragen pro normalem Tick vorher / nachher |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 5,01 s | 2,11 ms | 0,93 ms | 1,84 ms | 5 / 1 |
| 4 | 20,02 s | 1,19 ms | 0,60 ms | 1,97 ms | 17 / 1 |
| 12 | 60,04 s | 1,11 ms | 0,56 ms | 1,81 ms | 49 / 1 |

Echte Terminalintegration verwendet ausschließlich eigene temporäre PTYs und
tmux-Sockets. Async-Snapshots verwerfen verspätete Antworten nach Detach,
Reattach oder Epochwechsel. Der Multiplextransport erhält FIFO je Runtime;
langsames Attach blockiert andere Runtimes und Ping nicht.

## Notizbäume und Schreibbursts

Playwright prüft 100/1.000/5.000 Notizen, jeweils mit 10 und 100 Ordnern.
Jede Wurzel besitzt neun Kinder; All- und Ordneransicht bleiben vorhanden.

| Notizen | Geschlossene Baumzeilen | Alle geöffnet | Reduktion |
| --- | ---: | ---: | ---: |
| 100 | 20 | 200 | 90 % |
| 1.000 | 200 | 2.000 | 90 % |
| 5.000 | 1.000 | 10.000 | 90 % |

Schnelles Wiederöffnen während der Animation, Fokus-Rückgabe nach Collapse,
aktive Vorfahren und native Drag-and-drop-Verschachtelung funktionieren.
Mobil sind Kontextmenü-Umbenennung, Tastatur-Expand und Reduced Motion geprüft;
kein horizontaler Overflow. Vollständig offene 5k-Bäume benötigen in dieser
Fixture etwa 4,2 bis 4,4 Sekunden bis zu allen Zeilen. Die Optimierung begrenzt
geschlossene Bäume, verspricht keine billigen vollständig geöffneten Bestände.
Die Zeit bis zum DOMzustand ist kein React-Commit- oder INP-Messwert.

Für den Serialisierungsvergleich enthält ein eigener Kontrollbuild ausschließlich
die beiden früheren Autosave-/NoteEditor-Dateien aus HEAD. Alle übrigen Änderungen
bleiben gleich. Drei Dokumentgrößen, je 30 echte Tasten im Burst, Desktop/CPU4.
Alle Zeichen gelangen in die richtige Serverrevision. Die Instrumentierung
erfasst Markdownmanager-Serialisierung und Keydown bis Input, nicht INP.

| Größe | Aufrufe vorher / nachher | Serialisierungszeit im Burst Desktop vorher / nachher | CPU4 vorher / nachher |
| --- | ---: | ---: | ---: |
| 25 KB | 30 / 1 | 7,5 / 3,4 ms | 18,9 / 4,9 ms |
| 125 KB | 30 / 1 | 17,0 / 5,0 ms | 68,9 / 9,2 ms |
| 625 KB | 30 / 1 | 66,8 / 13,8 ms | 289,7 / 22,3 ms |

Bei 625 KB sinkt der Keydown-bis-Input-Median von 8,7 auf 6,5 ms am Desktop,
im CPU4-Profil von 37,7 auf 24,4 ms. Der einzelne verzögerte Save kann weiterhin
mehr als 16 ms benötigen. Navigation direkt nach Eingabe, native IME,
pagehide mit anschließendem Reload, verzögerte Savebestätigung und echte
Konfliktwahl erhalten den jüngsten Entwurf. Unit-Tests ergänzen saveNow/Unmount.

Zehn sichtbare Orbit-Notizen erzeugen bei zehn Savepausen zehn PUTs und null
zusätzliche Detailreads. Nur für diese Attribution werden die periodischen
3-s-Polls in der Browser-Fixture angehalten; deren Verhalten prüft M-001 separat.
Die Orbitliste ist dort kein aktiver Observer. Vier QueryObserver-Tests zeigen
zusätzlich einen Listenread und einen aktiven Suchread ohne fremde Detailreads.
Move, Rename, Revision, Konflikt sowie Ordner-/Archive-/Restore- und
Sortierverhalten sind durch Browser- beziehungsweise Datenbanktests abgedeckt.

## Code, Formeln, Maskottchen und Dashboard

Desktop und mobiles CPU4-Profil rendern alle 37 Codeblöcke mit denselben 188
Highlight-Tokens und zwei Formeln. Markdowncode und Formelquellen bleiben
erhalten. 41 Tests vergleichen Sprach-ASTs, Aliasse, Einbettungen und automatische
Spracherkennung mit dem bisherigen Lowlight. Ein erfolgreicher Sprachimport
dekoriert ohne Dokumentmutation, Cursorwechsel oder Autosave.

Ein abgefangener Pythonimport lässt den Text editierbar und speicherbar.
Chromium cached den fehlgeschlagenen Modulimport im Dokument; eine erneute
Eingabe lädt ihn nicht erneut. Nach bestätigtem Save und Reload erscheinen die
Tokens wieder. Dies ist eine Browsergrenze, kein lokaler Retry-Erfolg.
KaTeX bleibt wegen der synchronen installierten Extension im Bundle.
Der Ersttransfer für reine Textnotizen sinkt um 5,2 %, unter dem 10-%-Arbeitsziel;
Editorchunk allein minus 9,6 %. Features werden für dieses Ziel nicht gestrichen.

Acht native Maskottchen-Vorschauaktionen, Poke/Wake, schnelle Aktivierung,
Theme und Reduced Motion sind geprüft. Alle 26 PNGs dekodieren, einschließlich
Zzz/Confetti. Lokaler Bildretry und bewusst beschrifteter Reload nach gecachtem
Modulfehler sind separat geprüft. Drei kalte Desktop-Aktivierungen:
FCP 560 bis 564 ms, 26 Sprite-Requests. Mobil ist die Statusleiste wie bisher
verborgen, auch bei aktivierter Konfiguration null Sprite-Requests.

Finale Dashboardmessung: je drei kalte Kontexte, nach Routenmount weitere vier
Sekunden beobachten. Mobile CPU4, 1,6 Mbit/s Downstream, 150 ms CDP-Latenz.

| Profil, Maskottchen deaktiviert | FCP | CLS | Sprite-Requests |
| --- | ---: | ---: | ---: |
| Desktop | 528 bis 560 ms | 0,0077 bis 0,0080 | 0 |
| Mobil | 4.288 bis 4.336 ms | 0,00617 | 0 |

Separat: zwei Sekunden verzögerte Metriken/langer Servername CLS 0,0319,
mobile Metricsfehler 0,00014, 200-%-Viewport mit Reduced Motion 0,00036.
Screenshots zeigen Desktop, Mobil und Zoom ohne horizontalen Overflow.
Verbleibende Long Tasks bis rund 500 ms im mobilen Kaltstart werden nicht allein
Sprites zugerechnet. Dies sind synthetische lokale Profile, keine WAN-/Handywerte.

## Canvas-Gesten und persistente Inhalte

Der bestehende Gestenharness läuft über Playwright-MCP gegen den eigenen
Produktionsbuild: Pan, Wheelzoom, Pinch, Drag und Resize je sechs Sekunden,
fünf Wiederholungen pro Szenario. Kleine Fläche: zwölf echte Notizeditoren,
acht Labels. Stress: 80 echte Editoren, 60 Labels, ein opakes Sandbox-Dummyiframe.
Es nutzt keinen Preview-Gateway, Slot oder eigenen Devserver. Der Iframe enthält
eigenen Zustand und ersetzt ausschließlich das verbotene Preview-Testmaterial.

Alle zehn Läufe: p95 16,67 ms, minimale RAF-Abdeckung 98,69 %, keine Long Tasks.
Im Stresslauf kommen einzelne 33,33-ms-Frames vor. Testseitige COOP/COEP-Header
geben dem Messkontext präzise Zeitauflösung; Produktheader werden nicht verändert.
Ohne diese Instrumentierung rundet Chromium einzelne Frames auf 16,8 ms.
Iframe-DOM, einzelner Load, Eingabewert und JavaScriptzustand bleiben gleich.

Native Linienpunktdrags bestätigen Commit, Escape/Pointercancel ohne Save,
Undo/Redo. Der vorhandene XYFlow-Portal-Hit-Test-Fehler erforderte explizite
Pointerevents; eine gegen Zoom skalierte 44-px-Fläche erhält den bisherigen
sichtbaren Punkt. Parentwechsel erhält die Weltposition, alle acht Labels bleiben
ohne Überschneidung mit den Notizen. Größere Geometrie-/Listenercounts und
LostCapture sind zusätzlich durch Unit-Tests gesichert.

## Langsame WebSockets und Orbit-Backups

Eine eigene Loopback-TCP-Fixture überträgt Text, Binärdaten und ein normales
4-MB-Frame korrekt. Beim pausierten Empfänger überschreitet der Sendepuffer
2.031.968 B nicht; einmaliger Overload schließt mit 1013. Gemessener Prozess-RSS
wächst um rund 20 MB, inklusive Quelle, TCP und Frames. Das Pufferbudget ist
keine absolute Prozess-RSS-Garantie. Zwanzig Replayzeilen erscheinen geordnet.
Der installierte Hermesclient reconnectet auf 1013, sein PTY-Replayring bleibt
beim Detach bestehen; der Proxy verspricht keine unbegrenzte Historie.

Je 50 ausstehende Orbitrevisionen werden mit echtem Worker/fsync geordnet
gesichert. Nachher Outbox leer, current.json Revision 50.

| Dokument | Draindauer | Health-p95 | WS-p95 | Event-Loop-p99 |
| --- | ---: | ---: | ---: | ---: |
| 150 KB | 1,40 s | 3,34 ms | 1,56 ms | 2,66 ms |
| 1 MB | 5,17 s | 1,83 ms | 0,73 ms | 2,59 ms |
| Nahe 4 MB | 21,56 s | 1,21 ms | 0,60 ms | 2,22 ms |

Zwanzig Saves pro Größe, frühere Datenbankklasse aus HEAD versus Umsetzung:

| Dokument | Save-p50 vorher / nachher | Save-p95 vorher / nachher |
| --- | ---: | ---: |
| 150 KB | 5,08 / 1,64 ms | 8,01 / 2,11 ms |
| 1 MB | 22,71 / 12,30 ms | 240,45 / 216,49 ms |
| Nahe 4 MB | 317,22 / 257,82 ms | 538,85 / 449,65 ms |

Große Saves enthalten weiterhin synchrone SQL-/Validierungsarbeit und
WAL-Checkpoint-Ausreißer. Der Worker beseitigt den Backupanteil außerhalb des
Requestpfads, garantiert keine schnelle maximale Saveantwort. Kein fsync oder
Durabilitätsmerkmal wurde abgeschwächt. Ein zusätzlicher Crash nach durablem
Export vor SQLack lässt die Outbox beim Wiederanlauf dieselben Bytes bestätigen.
Sechs gezielte Drain-/Crash-/Recoverytests sichern diesen Zustand ab.

## Reproduktion und Grenzen

Temporäre Skripte und Rohresultate liegen unter
`/tmp/wrapt-performance-implementation/`. Relevante Namen:
`build-network-profile.mts`, `process-network-profile.mts`,
`notes-tree-scale.json`, `notes-burst-profile.js`,
`notes-save-regressions.js`, `notes-query-browser.js`,
`canvas-gestures.json`, `bridge-network-profile.mts` und
`backup-network-profile.mts`. Bei verlorenen Temp-Dateien liefern die beschriebenen
Seeds und die Featuretests die Grundlage für neue eigene Fixtures.

Die laufende Nutzerworkbench wurde nicht neu gebaut oder gestartet. Ergebnisse
gelten für isolierte kompilierte Produktionsartefakte. Reale SSH-/Hermesdienste,
private Chatdaten, Nutzerterminals und Nutzer-Previews waren kein Testmaterial.
M-022 bleibt aus Gründen der Crashsicherung unverändert; M-023 und seine
Rückkehr-/Speichergrenzen stehen im ursprünglichen Umsetzungsbericht.

## Abschlussprüfungen und Version

Wrapt 2.2.10, Contracts 0.18.0 für die additiven öffentlichen Diagnosefelder und
den gemeinsamen bestehenden Operationsgrenzwert. Browser-Speicherformate und
Keys bleiben gleich, SQLite-Migrationen sind additiv. Kein stiller Breaking Change.
Die Changelog-Archive halten alle bearbeiteten handgeschriebenen Dateien unter
400 Zeilen. Alle 127 bisherigen datierten Releasekörper bleiben bytegleich;
die Doku-Synchronisierung liest Archive und erhält die Veröffentlichungsmarker.

Bestanden: 1.002 Web-Tests, 432 relevante Server-Tests, 114 Vertragstests und
Dokumentationstests; außerdem `pnpm typecheck`, `pnpm lint` ohne Warnungen,
`pnpm architecture:file-lines` und `git diff --check`. Server- und Webbuild
gehen ausschließlich in temporäre Ausgabeverzeichnisse, beide Workerartefakte
sind enthalten. Browserabnahme folgt dem vorgeschriebenen Playwright-MCP-Ablauf.
Keine Commits, Pushes, Dienstneustarts oder Sub-Agents.

Die Doku baut im temporären Ausgabeverzeichnis: 19 Seiten, 51 Assets und
19 Markdown-Endpunkte; Release 2.2.10 ist enthalten. Der eigene Fixture-Wrapper
und sein Server sind beendet, Port 23300 ist frei, eigene Browserkontexte
sind geschlossen. Die zuvor vorhandenen Listener 3010/3101/3773 bleiben bestehen;
3010 und 3773 behalten die zuletzt dokumentierten Prozess-IDs.
Nutzer-Previews, Slots, Sessions und tmux wurden nicht mutiert.

# Umsetzung des Performanceplans

Der [Auditplan](../Performance%20Audits/PERFORMANCE_AUDIT_AND_IMPROVEMENT_PLAN.md)
enthält Nutzen, Risiken, Abhängigkeiten, Akzeptanzkriterien und den laufenden Stand
aller 23 Maßnahmen. Die Auditmessungen sind Vorherwerte, keine Nachherwerte.

## Betriebsgrenzen

Die Umsetzung verändert weder Nutzer-Previews noch Ports, Slots, Sessions oder
tmux-Sitzungen. Keine Devserver, produktiven Builds oder Dienstneustarts für
Tests. Isolierte Datenbank-, Datei- und Prozess-Fixtures enthalten Dummy-Daten.
Browserprüfungen laufen ausschließlich über Playwright-MCP. Ein späterer
Neustart benötigt eine ausdrückliche Nutzeranweisung.

## Neue Diagnosekonfiguration

`WEB_BUILD_METRICS_CACHE_MS` in `.env` steuert die Kontroll-TTL der Dateimetriken,
standardmäßig 60.000 ms, zulässig 1.000 bis 60.000 ms. Der Releaseindex wird bei
jeder Diagnose asynchron geprüft. Sein atomarer Wechsel invalidiert den Cache
sofort. Manuell entfernte Assets erscheinen spätestens nach der Kontroll-TTL.
`GET /api/v1/system/operational-metrics?refresh=true` leert ausschließlich diesen
Fachcache. HTTP-, Event-Loop- und sonstige Betriebsdaten bleiben frisch.

## Bisherige Prüfergebnisse

- M-001: Zwei Verbraucher über jeweils 60 Sekunden geparkt, keine Detailreads;
  Rückkehr revalidiert, Querydaten bleiben erhalten. Ein sichtbarer Observer
  derselben Notiz hält das Dreisekundenpolling aktiv.
- M-002: Zehn parallele Reads teilen einen Snapshot. Gemeinsame Dateien aus
  drei Releases werden einmal geprüft; warmer Read prüft nur den Index.
  TTL, manuelle Löschung, expliziter Refresh, beschädigter Index und atomarer
  Indexwechsel sind durch Tests abgedeckt.
- M-003/M-004: Referenzen benötigen keine Aktivitätsanalyse. Bekannte und
  unbekannte cwd, Suche und Summary bleiben korrekt. Zehn Detailreads teilen
  Discovery mit Liste/Referenzen; bekannte Pfade werden nicht erneut
  registriert. Externe Ordneränderungen nach TTL, Registrierung und frische
  Detail-Verfügbarkeit sind geprüft. Konfigurationswechsel erzeugen wie bisher
  beim Laden der Anwendungsabhängigkeiten einen neuen Service und damit Cache.
- M-007: Additive Indizes, alte Daten/Lookup bleiben erhalten. Forecasts vor
  und nach Indexentfernung identisch, drei Provider und 96-Sample-Cap geprüft.
  EXPLAIN verwendet SEARCH für Resetfilter und Retention. Die Migration wurde
  ausschließlich an temporären Datenbanken ausgeführt.
- M-020: Grenzfälle bis 10.001 Vorgängern mit Sequenzlücken behalten dieselben
  neuesten Reihen und Hashvorgänger. Retentionsfehler rollt auch den Insert
  zurück; die bestehenden Hashketten-/Outboxprüfungen bleiben grün.

Die erste Abnahmerunde bestand mit 39 Servertests und drei Pollingtests.
Weitere Browser- und Skalierungsabnahmen stehen bei den folgenden Schritten;
die [abschließende Messreihe](performance-verification.md) ergänzt sie.

## Weitere umgesetzte Schritte

Notiz-Saves setzen den Detailcache aus der Saveantwort und invalidieren nur
Liste/Suche beziehungsweise tatsächlich betroffene Geschwister. Excerpts werden
atomar aus dem unveränderten Markdown abgeleitet und können wiederhergestellt
werden. Der Editor sichert immutable Snapshots und serialisiert nach dem Burst.
Geschlossene Bäume mounten ihre Kinder erst bei Bedarf und behalten die bisherige
Collapseanimation. Eine geteilte Hindernissicht verhindert erneute Berechnungen
der Orbit-Labels bei reinen Contentänderungen; Draglistener bestehen nur beim Drag.

Das Capybara lädt sein Modul und externe PNGs erst nach Aktivierung. Dashboard-
Kennzahlen, Charts und Laufwerkszeilen behalten beim Laden passende Geometrie.
Gemessen auf der isolierten Browser-Fixture: CLS 0,015 Desktop und 0,018 mobil;
die Spriteauslagerung reduziert kalte Dashboard-JS von 373.387 auf 300.589 B
Brotli. Die mobile Kontroll-Fixture nutzt CPUfaktor 4 und 150 ms Netzlatenz:
FCP-Median 4.672 auf 4.284 ms. Das sind keine Messungen an einem echten Telefon.

Alle 37 bisherigen Notiz-Codegrammatiken einschließlich Aliasen und eingebetteten
Sprachen laden bei Bedarf. Der Paketalias erhält exakt die von Lowlight zuvor
benutzte Version; Quick Look nutzt weiterhin seine bestehende Version. Drei kalte
Textnotiz-Läufe: Editor 383.849 auf 346.879 B Brotli, gesamte JS 707.627 auf
671.067 B. Das 10-%-Ziel für den gesamten Ersttransfer ist noch nicht erreicht.
KaTeX bleibt im Bundle, weil die installierte Extension ihren Renderer synchron
bindet; ein gleichwertiger unterstützter Asyncloader wurde nicht gefunden.

Hermesfacts teilen kurze Caches, Remote-T3 pro Host/Datenbank einen laufenden
Read mit begrenzter Parallelität und Jitterbackoff. Lokale Polls laufen unabhängig.
Die Hermes-Brücke verwendet die bestehende begrenzte WebSocket-Brücke und meldet
Überlast. Ein normales einzelnes großes Frame darf einen leeren Sendepuffer nutzen.
Das installierte Hermes behandelt 1013 als wiederverbindbar und hält den PTY-
Replayring beim Detach. Der Proxy garantiert selbst keine unbegrenzte Historie.

Die Auditdiagnose prüft die volle Kette in einem Readonly-Worker. Bestehende fünf
Sekunden TTL, Mutationsinvalidierung und vollständige Prüfung älterer Zeilen
bleiben erhalten. Das additive optionale Feld `audit.checkedSequence` benennt
den konsistent geprüften Highwater; ein Ergebnis wird nach parallelen Mutationen
nicht als frischer Snapshot gecacht. Ein eigener 10k-Hashlauf benötigte vorher
43 bis 63 ms im Mainthread, der warme Buildread rund 0,04 ms.

Orbit-Saves behalten den atomaren SQL-/Outboxcommit. Ein chronologischer Worker
validiert und schreibt Sicherungen mit Datei-/Directory-fsync und atomaren Renames.
Erst danach löscht der Drain den Outboxeintrag. Ältere Jobs setzen `current.json`
nicht zurück; ungesicherte Revisionen sind von der Retention ausgenommen. Der
Shutdownflush ist begrenzt, verbleibende Jobs werden beim Start nachgeholt.
Crash vor Export, Diskfehler, 50 Pendingrevisionen und Shutdown wurden geprüft.

## Zusätzliche zentrale Einstellungen

| Umgebungswert | Standard | Wirkung |
| --- | ---: | --- |
| CODEX_SESSION_DISCOVERY_MS | 60.000 | Kontrolllauf über historische JSONL-Dateien |
| CODEX_SESSION_READ_BLOCK_BYTES | 65.536 | Byteblock beim inkrementellen Read |
| CODEX_SESSION_POLL_BYTES | 4.194.304 | Maximale neue Bytes pro Datei und Poll |
| CODEX_SESSION_READ_CONCURRENCY | 4 | Begrenzte Dateiparallelität |
| HERMES_STATUS_CACHE_MS | 1.000 | Maximal 2.000 ms Upstreamstatuscache |
| HERMES_COMMIT_CACHE_MS | 60.000 | Getrennter Commitcache |
| T3_REMOTE_POLL_CONCURRENCY | 4 | Maximal parallele Remotequellen |
| T3_REMOTE_POLL_MAX_BACKOFF_MS | 300.000 | Höchster Fehlerbackoff |
| HERMES_WEBSOCKET_BUFFERED_BYTES | 2.097.152 | Reguläres Sendepufferbudget |
| ORBIT_BACKUP_BATCH_SIZE | 5 | Maximale Jobs je Drainbatch |
| ORBIT_BACKUP_BATCH_MS | 25 | Zeitbudget zwischen Jobs |
| ORBIT_BACKUP_SHUTDOWN_MS | 5.000 | Höchster Shutdownflush |
| ORBIT_BACKUP_RETRY_MS | 5.000 | Wiederholungsintervall nach Schreibfehler |

Werte stehen zentral in `performance-settings.ts` und als Beispiele in `.env.example`.
Alle Maßnahmen sind bearbeitet. M-022 endet mit begründet verworfenem Ansatz;
M-010 erreicht die dokumentierte Bundleeinsparung, aber nicht das gesamte
10-%-Startziel. Ein produktiver Neustart wurde nicht ausgeführt; die laufende
Workbench liefert deshalb weiterhin ihren bisherigen Build.

## Große Snapshot-Fixtures

20 Samples pro Zustand, dieselben Daten und eine eingefrorene Forecast-Uhr;
5 % der Resetfenster aktiv, der Rest abgelaufen oder ohne Reset. Alle Forecasts
waren vor/nach bytegleich. Der alte Accountlookup bleibt weiterhin vorhanden.

| Zeilen | Ranking vorher / nachher, Median | Retention vorher / nachher, Median | Indexbau | zusätzliche DBbytes |
| --- | ---: | ---: | ---: | ---: |
| 141.625 | 182,8 / 19,2 ms | 10,3 / 0,003 ms | 0,16 s | 8,45 MB |
| 400.000 | 569,8 / 58,7 ms | 31,6 / 0,004 ms | 0,50 s | 23,95 MB |
| 1.000.000 | 1.702,9 / 142,7 ms | 88,9 / 0,003 ms | 1,40 s | 59,95 MB |

Die genaue Verteilung beeinflusst die Rankingzeit. Ein erster Kontrolllauf mit
abgelaufenen Fenstern desselben Tages zeigte zusätzlich, dass der bestehende
ISO-/SQLite-Datumsvergleich breiter filtert als beabsichtigt. Diese historische
Querysemantik wurde nicht still verändert. Die Abnahmetabelle verwendet eindeutig
abgelaufene Resetdaten; alle Messdatenbanken lagen unter eigenen Temp-Pfaden.

## Notizmetadaten und Auditretention

Je 20 Samples an eigenen SQLite-Dateien, identische Daten und API-Summarys.
Bei 1.000 Notizen wurde der Grenzwert von 20 ms auch im p95 eingehalten.

| Fixture | Listenzeit vorher / nachher, Median | Nachher p95 | Save Median | DBbytes / Excerptzeichen |
| --- | ---: | ---: | ---: | ---: |
| 26 Notizen, 131 KB Markdown | 2,59 / 0,12 ms | 0,14 ms | 0,27 ms | 200.704 / 5.200 |
| 1.000 Notizen, 17,64 MB Markdown | 213,68 / 11,28 ms | 12,66 ms | 0,31 ms | 18.624.512 / 200.000 |

Die Vorschauen waren vor/nach bytegleich und nach Content-Saves frisch. EXPLAIN
verwendet `notes_summary_order`. Die Auditretention bei 10.000 Reihen mit
Sequenzlücken benötigt ohne fällige Zeilen 0,091 ms statt 5,33 ms Median,
p95 0,101 ms; EXPLAIN bestätigt den DELETE über den Primärschlüsselbereich.

## Recoveryprofil vor einer möglichen Änderung

600 Dummy-Snippets, je 20 einzelne Bearbeitungen, Chromium über Playwright-MCP.
API-Saves wurden nur in der eigenen Browser-Fixture blockiert, um das Recovery
direkt nach dem letzten Tastendruck mit Hardreload zu prüfen. Alle vier Zustände
erhielten den letzten Entwurf. Kein Quota-Fehler trat in diesen Fixtures auf.

| Dokument | CPUfaktor | stringify p50 / p95 | setItem p50 / p95 | Anteil an Browser-Taskzeit |
| --- | ---: | ---: | ---: | ---: |
| 599.831 B | 1 | 3,2 / 4,3 ms | 1,7 / 2,0 ms | 2,62 % |
| 599.831 B | 4 | 14,3 / 16,6 ms | 7,7 / 9,3 ms | 2,23 % |
| 3.499.590 B | 1 | 9,5 / 11,8 ms | 18,3 / 19,1 ms | 10,87 % |
| 3.499.590 B | 4 | 40,6 / 50,6 ms | 78,3 / 83,0 ms | 8,35 % |

Die Aktivierungsbedingung von M-022 ist damit erfüllt: große Desktopwrites
überschreiten 10 % Taskzeit, unter CPU4 überschreiten alle 20 Writes 16 ms.
Der bestehende Effect schreibt bereits genau einmal pro einzelner Bearbeitung.
Eine Pause zwischen Tastendruck und Persistenz würde ein neues Verlustfenster
öffnen; geänderte Formate und einfache verzögerte Writes sind laut Plan nicht
freigegeben. Die Entscheidung muss diese Durabilitätsgrenze berücksichtigen.

Der Durabilitätsvergleich bestätigte das Verlustfenster im Browser: Direkt nach
der Bearbeitung von `Entwurf` zu `Entwurfz` erhielt der unveränderte unmittelbare
Write den letzten Buchstaben nach einem Hardreload. Ein ausschließlich in der
Test-Fixture um 1.200 ms verzögerter Write verlor ihn. Ein identischer Write je
Edit ist bereits der Normalfall; es gibt hier keinen redundanten Schreibburst.
M-022 endet deshalb mit begründet verworfenem Ansatz gemäß Abschnitt 8 des Plans.
Recoverykey, Format, `baseRevision` und Schreibzeitpunkt bleiben unverändert.

Beim Aufbau der M-023-Fixture überschritten 20 neu geöffnete Tools das bestehende
API-Limit von 50 Layoutoperationen je Request. Der Client überträgt deshalb
geordnete Batches, hält den vollständigen Recoverypuffer und entfernt nur den
bestätigten Präfix. Das Limit bleibt unverändert; große Puffer, Paralleländerung
und während eines Saves ergänzte Operationen sind durch drei Tests abgedeckt.

## Auditworker unter HTTP-/WebSocketlast

Eine eigene Loopback-Fixture mit zufällig zugewiesenem freien Port führt je
20 volle Diagnoseläufe aus. Parallel laufen Healthreads und Echo-Nachrichten im
10-ms-Takt. Die Tabellenwerte enthalten kalte Workerstarts; Warmcache und
korrekte Invalidierung sind separat durch die Worker-Tests geprüft.

| Auditzeilen | EL-p99 vorher / Worker | Health-p95 vorher / Worker | WS-p95 vorher / Worker | Diagnose p50 vorher / Worker |
| --- | ---: | ---: | ---: | ---: |
| 3.701 | 27,79 / 1,84 ms | 10,24 / 2,73 ms | 3,29 / 1,57 ms | 23,57 / 25,32 ms |
| 10.000 | 57,34 / 1,75 ms | 5,27 / 1,82 ms | 4,54 / 0,80 ms | 57,55 / 61,60 ms |

Die Prüfung wartet weiterhin auf das vollständige Resultat. Der erste kalte
Workerstart erhöht die maximale Diagnoselatenz, bei 10k auf rund 180 ms in diesem
Lauf. Die Hasharbeit spart keine Gesamtrechenzeit, hält aber den Serverthread
für andere Verbraucher frei. Keine Live-Datenbank wurde dafür manipuliert.

## Profil der Orbit-Terminals

Die eigene Produktions-Fixture benutzt Dummy-WebSockets im Playwright-MCP,
keine Devserver, Preview-Slots oder echten Nutzerterminals. Der echte xterm-
Renderer verarbeitet pro Runtime zehn geordnete ANSI-Frames je Sekunde. Alle
Toolnodes bleiben gemountet, zwei liegen im Canvasviewport. CPU-Sampling und
DOM-Mutationszähler stammen aus derselben Browserinstrumentierung vor/nach.

| Zustand vorher | Laufzeit | Browser-Taskzeit | Heap am Ende | Outputframes | Abos / xterm-DOM |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20 Tools | 306,96 s | 106,41 s | 169,6 MB | 61.260 | 20 / 20 |
| 96 Tools | 322,83 s | 321,79 s | 725,1 MB | 309.408 | 96 / 96 |
| 20 Tools nachher | 340,16 s | 37,85 s | 54,3 MB | 6.788 | 2 / 20 |
| 96 Tools nachher | 384,59 s | 57,22 s | 59,2 MB | 7.682 | 2 / 96 |

Auf die tatsächliche Laufzeit normiert sinkt die 20er-Mainthreadzeit um rund
68 %, beim 96er-Lauf um 85 %, oberhalb des 30-%-Ziels. Die längeren Nachherdaten werden deshalb nicht
als gleich lange absolute Summen verglichen. Alle Dummyquellen erzeugen weiter
Output; nur zwei sichtbare Browserabos verarbeiten laufende Frames.

Das 96er-Profil war nahezu durchgehend ausgelastet; Rendering, DOM-Updates und
GC sind im CPUprofil sichtbar. Der bestätigte Hintergrundanteil aktiviert M-023.
Ein gemeinsamer Intersection-/Auswahlindex mit 640 px Overscan pausiert nur die
entfernten Terminal-Abos. Neue Tools erhalten zuerst ihren vollständigen Sync;
Fokus, Auswahl und laufender Drag halten sie aktiv. Der bisherige Epoch-/Delta-
oder Snapshotpfad synchronisiert die Rückkehr. Keine Iframes werden entfernt,
umgehängt, pausiert oder neu geladen; Serverruntimes bleiben bestehen.

Der Server ordnet Terminalnachrichten je Runtime statt je Socket. Ein langsames
Attach hält andere Runtimes und Heartbeats frei; FIFO je Runtime und Zuordnung
von Fehlern bleiben erhalten. Eine kontrollierte WS-Fixture prüft diesen Fall.
Die Browserabnahme bestätigt aktuelle Ausgabe und identischen xterm-DOM bei
Rückkehr zu allen 96 Nodes. Kamerapan/Zentrieren, physischer Canvaspan mit
mittlerer Maustaste, Tastatureingabe, Paste und alter Scrollbuffer funktionieren.
Ein Rückkehrtrace zeigte zunächst Schriftmessungen in allen entfernten Panes;
deren Zoomanpassung wartet jetzt bis zur Aktivierung. Der aktuelle Zoom wird
dann auf die bestehende Instanz angewandt. Die erste Kamerabewegung sank dadurch
von rund drei Sekunden auf 0,4 Sekunden, ohne Iframes oder Scrollback zu ändern.

Ein Kontrollbuild in einer eigenen Quellkopie stellt ausschließlich die bisherige
Routenaktivität ohne Canvaspause wieder her. Geordnete Deltas füllen dort den
Rückstau. Vier Kontrollfälle benötigten 3,28 bis 4,94 s bis zu aktueller Ausgabe;
vier weitere mit vollem Scrollback 3,36 bis 6,21 s. Ein erster Versuch mit
künstlichen Sequenzlücken verfälschte die Anzeige durch Vollsyncs und wurde
verworfen. Er ist kein Nachweis eines Produktfehlers.

Die 96 Nachherfälle liegen bei p50 1,06 s und p95 2,10 s, mit einem seltenen
Ausreißer von 6,77 s bei großem Rückstau. Es gibt keine Instant-Rückkehrgarantie.
Der Heapvorteil der ruhenden Fixture ist ebenfalls kein dauerhaftes Limit:
nach Besuch aller Nodes mit erhaltenem 10k-Scrollback waren rund 1,6 GB belegt,
zwischenzeitlich 2,4 GB. Die vorhandenen Historien werden dafür nicht gekürzt.
Der Kontrolllauf verwendete keine Nutzer-Previews, Slots, Dienste oder tmux.

## Inkrementelle Codex-Verläufe

Eigene Dateien mit 1/10/100 MB aktivem Verlauf und 1.000/10.000 historischen
JSONL-Dateien. Je 20 Polls mit rund 4 KiB neuer Ausgabe pro aktivem Verlauf.
Alle 60 neuen Events je Fixture kamen genau einmal an; jeder Poll las insgesamt
12.240 B statt der bestehenden 111 MiB Verlauf. Die warmen Polls entdecken den
historischen Bestand nicht erneut. UTF-8, Teilzeilen, Ersatz, Truncation und
T3-Ausschluss sind zusätzlich durch die Reader-Tests geprüft.

| Historische Dateien | Cold Discovery | Warmer Poll Median / p95 | EL-p99 über gesamten Lauf | RSS-Zuwachs |
| --- | ---: | ---: | ---: | ---: |
| 1.000 | 52,8 ms | 6,81 / 13,42 ms | 3,76 ms | 13,0 MB |
| 10.000 | 250,2 ms | 6,37 / 10,31 ms | 4,43 ms | 11,8 MB |

Der kalte 10k-Lauf enthielt eine seltene Event-Loop-Spitze von 76,5 ms. Discovery
und Allokationen verschwinden durch asynchrone Reads nicht; es gilt deshalb
keine Garantie, dass jeder kalte Durchlauf unter 16 ms bleibt. Eine kontrollierte
fünfsekündige Readwartezeit ließ parallel 20 HTTP-Health-/WebSocket-Echopaare
durch, bevor der Reader seinen nächsten Datensatz abschloss.

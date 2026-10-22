# Phase 10, Paket B: Runtime und Backendlast

Stand 17.10.2026. Lesende Prüfwelle abgeschlossen. Ein offener Performancebefund B1.
Keine Produktänderung und keine unabhängige Selbstabnahme früherer Autorenfixes.
Eigene Harnesses, Erstlogs, Endlogs und JSONmesswerte liegen ausschließlich unter
`temp/hermes-v2/phase10-runtime-soak/`. Ausführung mit Node 26.5.1, echten Timern.

## Quellen und Grenzen

523/523 eingefrorene Quellen vor und nach allen Läufen byteidentisch.
Unverändertes Manifest `temp/hermes-v2/generated/phase10-integrated-code-freeze.json`:
SHA256 `879fb6d5f5e71574b02e46294419fdde763fab925f2e0472164b114b7820e3d6`.
Eigene Belege: `integrity-before.json`, `integrity-after.json`, `artifact-sha256.json`.
Keine alten Tests, Assertions, Berichte, Fakes oder Manifeste bearbeitet.
Keine Browser-/MCPnutzung, keine Anfrage an Rootserver19470, keine echten Coreturns,
Dienste, Accounts, Nutzerpreviews, Produktionsbuilds oder Gitaktionen.

Echte WebSocketverbindungen nur zur eigenen vorhandenen FakeGateway-Fixture,
Loopback mit OS-Port0. Verwendete Ports39513,46051,43209,37115,45965 sind geschlossen.
Auch fehlgeschlagene eigene Vorläufe schlossen ihre nativen Fakes in `finally`.
Die Clientseite verwendet echte GatewayClient-/ChatRuntime-/ResourceRuntimequellen
mit FakeSocket bzw. gehaltenem Fakefetch. Kein React-/Browserleistungsbeleg daraus.
Die Instrumentierung zählt reale Timer und Socket-/Dokumentlistener; keine Uhr vorgerückt.

## B1: synchrone Redaction blockiert bei erlaubter Grenzlast

Gesundes Soll: angenommene native Ausgaben sollen die gemeinsame Serverereignisschleife
nicht für Sekunden blockieren. Trigger im unveränderten echten Manager-/Nativepfad:
100 kurze bekannte Werte über100 tatsächliche `request.respond` gelernt, danach
`tool.complete` mit8387584 ASCIIbytes Rohoutput. Der ganze JSONframe bleibt unter
`upstreamBytes=8388608`. Kein Registry-, Guard-, Normalizer- oder Transportersatz.

`native-redaction.mts`, finale Ergebnisse in `native-redaction-results.json`:

| Rohoutputbytes | Bis gültiger Browserausgabe | Größte reale10ms-Tickerlücke |
| ---: | ---: | ---: |
| 65536 | 131,9ms | 131,9ms |
| 200000 | 401,3ms | 401,4ms |
| 8387584 | 11311,5ms | 11275,3ms |

Beim großen Fall11,58 CPUsekunden; Prozess-PeakRSS313,35MiB. Ausgabe65536Zeichen,
65756JSONbytes, gültiger Vertrag, exakte Session-ID, alle bekannten Werte maskiert.
Voriger vollständiger Vergleichslauf11,50s. Der Befund ist eine reproduzierbare
CPU-/Latenzschwäche am konfigurierten zulässigen Eingang, kein beobachtetes Secretleck.
Häufigkeit und typische Größen echter Coreausgaben wurden hier nicht ermittelt.
Erster10ms-Timer allein wäre beim großen WSframe nur nach36,3ms gefeuert, bevor
der ganze Frame ankam. Deshalb belegt die separat gemessene maximale Tickerlücke
die Blockade; der erste Timer wird ausdrücklich nicht als11s-Beleg ausgegeben.

Kleinste zu prüfende Fixrichtung nach Rootfreigabe: vollständige Treffer nativer
Stringsuche überlassen, vorhandene sichere Rohsuffix-/Präfixbelege weiter vereinigen.
Teilüberlappungen, periodische Langwerte, statische Intervalle, späte Secretkenntnis
und Streamtails müssen erhalten bleiben. Keine Vorabkürzung oder Budgetabsenkung.
Noch kein Produktfix umgesetzt; B1 an Root gemeldet und von Root zur späteren
gezielten Bearbeitung übernommen.

## Runtime, Lebensdauer und Mengen

`client-cycles`:120 tatsächliche Reconnectzyklen,125 geöffnete/geschlossene Sockets,
120 Unknownsubmits ohne Retry,120 doppelte Events ohne doppelte Nachricht.
60 im gleichen Epoch weiter offene Antworten bleiben unknown und sind gesperrt;
frischer Requestabschluss räumt sie auf.12 Owner-A→B→A-Fälle verwerfen gehaltene
Historyantworten. StrictMode-Release/Acquire sowie normaler und Standaloneowner
teilen denselben Socket. Flagoff öffnet keinen neuen Socket.
Viermal120 gewöhnliche Pendingreads: weiterer normaler Read abgewiesen, Hauptstop
über reservierte Kapazität gesendet, danach Reconnect räumt alle offenen Reads auf.
Lauf2,645s,1,039CPUsekunden; Timerpeak121 durch die bewusst gehaltenen Reads.

`client-timed`: separater echter62,400s-Lauf,65 Abbruch-/Autoreconnectrunden,
66Sockets,22 Unknownsubmits ohne Retry,65 erfolgreiche Duplikatkontrollen.
Zusätzlicher gehaltener Submit erreicht seinen tatsächlichen25s-RPCtimeout nach
25001,5ms; späterer gültiger ACK erzeugt keinen erneuten Send.
Kein Fakeclocklauf als Zeitbeleg. CPU0,988s; im Betrieb ein Dokumentlistener und
höchstens ein eigener Testsocket, nach Cleanup beide null, Timerpeak3.

`backend-cycles`:120 reale native Fake-WSabbrüche,122 native Verbindungen,
120 poolweit einmalige Claims bei zwei Managern,120 unbekannte Submits ohne Retry.
Registryeinträge und Autoritätskeys werden nach jedem Claim null.
Frischer laufender Prozess im regulären Snapshot hält beide Manager nach Flagoff;
frischer leerer Prozessread samt Settlement gibt beide Manager frei.
Kein `session.close`, `session.interrupt` oder `process.kill` ausgelöst.
Nur hier DI für schnelle120Zyklen: retryMax5ms, idle20ms, rpcTimeout1500ms.
Der separate Client-Echtzeitlauf nutzt die normalen tatsächlichen Retry-/RPCtimer.

`resource-cycles`:60 Hidden/Visible-Zyklen mit je zwei gehaltenen HTTPreads.
124Reads,123Abortsignale,123 nachträglich freigegebene Antworten,60 verifizierte
stale Antwortpaare. Hiddenrefresh erzeugt keinen Read. Ein gesendeter Pausewrite
wird beim Kontextverlust unknown; sein späterer ACK bestätigt nichts und löst
keinen Retry aus. Erneuter Write ohne bewussten Abgleich bleibt gesperrt.

`client-bounds`:21 tatsächliche Historyreads mit je maximal200 Vertragsrows,
Anzeige maximal4000Nachrichten und4194304 geschätzte Textbytes je Session.
250 Workpatches bleiben bei100Rows; Coverage zeigt den Verlust an.
2100 empfangene Hydrationevents bleiben bei höchstens1000 gepufferten Events;
Overflow erzwingt frischen Abgleich, danach Buffer und Bytezähler null.
130 nacheinander ausgewählte Sessions bleiben bei100 Cacheeinträgen.

`cleanup-controls`:32 gehaltene Nebenaufgabenstarts,33.Start abgewiesen;
140 echte Completionevents, je offenem Receipt höchstens128 konkrete IDs.
Ein frühes eigenes Settlement bleibt nach Verdrängung aus dem sichtbaren Roster
completed. Dispose bei10 offenen Starts und64 Reads räumt74 Pendingplätze auf.
Pending, Waiter, Leases, Sessionstore, Requestmarker, Receiptmarker,
Attachmentcontroller/-operationen/-timer, Sockets und Dokumentlistener danach null.
Streamkanäle erreichen genau256, weiterer Tail aktiviert begrenzte Unterdrückung;
`clear` entfernt Tail-, Werte- und Failuretabellen.

## Redactionbudgets und beobachteter Speicher

`redaction-load`:100 Registrywerte und separat exakt1048576 registrierte Zeichen;
zusätzlicher Wert wird abgewiesen, bestehender Schutz bleibt. Volltext8387584Bytes
wird auf200000 maskierte Zeichen begrenzt. Kurzer Wert mit1→3Maskenexpansion,
64 Raw-/Escaping-/Overlaptrennstellen in beiden Registrierungsreihenfolgen und
teilweise Überlappung erhalten ihre gesunden Sichtbarkeitskontrollen.
18 statische JSON-/Plaintextkontrollen trotz bekannter Teilkeys bleiben maskiert.
200 lange Tailversuche überschreiten weder1048576 gespeicherte Tailzeichen noch
256Kanäle; belegte Überlastung unterdrückt konservativ und löscht die Tails.

Finale dynamische Workredaction:100Prozesse plus Queue, unveränderter Eingang,
1039776Byte tatsächlicher Wrapper mit52Rows unter1048576Byte Browserbudget,
Coverage.truncated=true und exakte RoutingIDs. Die echte WebSocketSendQueue
nimmt20 bewusst gestauten200k-Maskenframes an und schließt beim nächsten mit1013;
10 gesunde direkte Frames werden vollständig gesendet, danach kein Queuetimer.
Redactionlauf10,925s/11,524CPUsekunden, PeakRSS262,00MiB. Der langsamste reine
Redactorfall braucht9,981s; das ist zusätzlich zum B1-Managerbeleg gemessen.

GC-Messwerte begründen keine harte Gesamt-RSSobergrenze und keinen Langzeitleaktest:
120Clientzyklen Heap+4,49MiB, RSS82,46→96,54MiB; separater62s-Lauf Heap+3,85MiB,
RSS100,10→99,07MiB, Peak109,66MiB. Backend Heap+4,26MiB, RSS107,16→164,22MiB.
Redaction Heap+0,78MiB nach GC, RSS100,00→213,54MiB. JIT, Loader, Fixture und
Allocator sind enthalten. Harte beobachtete Mengengrenzen stehen separat oben;
alle Läufe enden mit null offenen eigenen Timern/Sockets/Managern.

## Ausführung und unveränderte Kontrollen

Alle acht endgültigen ausführbaren Harnesses Exit0. Gemeinsamer Befehl je Name:
`node --expose-gc --import ./apps/server/node_modules/tsx/dist/loader.mjs temp/hermes-v2/phase10-runtime-soak/<Name>.mts`
Namen: client-cycles, client-timed, backend-cycles, resource-cycles, client-bounds,
cleanup-controls, redaction-load, native-redaction. Bei nativen Fakes zusätzlich
`TMPDIR=/home/bbecker/projects/Wrapt/temp/hermes-v2/phase10-runtime-soak/t`.
Logs/Ergebnisse tragen denselben Namen; Endergebnisse sind `*-results.json`.

`pnpm typecheck`0; Bereichslint Server-V2/Web-V2/V2-Contracts mit max-warnings0:0;
`pnpm architecture:file-lines`0. Eigene MTS via eslint --no-ignore:0;
eigene CLI-Typen mit ES2023/Bundler/React-JSX/Node-Typeroots:0.
Alle eigenen Handdateien maximal104Zeilen. Keine Baseline angehoben.

Eigene ungültige Erstharnesses sind getrennt in `*-initial.log` bzw.
`backend-cycles-policy-assumption.log` erhalten: nichtmonotone Fakecursor,
fehlende Approvalchoices, falscher ResourceView-Zugriff, übergroße Fakesessionliste,
fehlendes Receiptkind und falsche Erwartung mehrerer Masken bei überlappenden
Langtreffern sowie unzutreffender Fake-closeOnDisconnect-Default.
Nur eigene Eingaben/Erwartungen korrigiert; daraus kein Produktfinding konstruiert.
Alte unabhängige Negativ-/Explorationsfälle und Altgates nicht neu grün umgedeutet.
Kein erneuter vollständiger Altgatematrixlauf, keine neue Reviewfreigabe behauptet.

Eigene Ressourcen geschlossen. Quellen weiterhin523/523 byteidentisch eingefroren.
Root entscheidet über B1-Fix und die weitere Prüfwelle.

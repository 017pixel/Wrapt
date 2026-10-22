# Hermes V2 Phase 8: Backendfix nach R2

Stand: 17.10.2026. R2-H1 wurde gezielt korrigiert. Alle unten genannten lokalen
Prüfungen sind abgeschlossen. Produktcode für das unabhängige R3 eingefroren;
kein unabhängiges Gateurteil, keine Freigabe für Realsmoke oder Phase 9.
Grundlage: vollständiger `hermes-v2-phase8-backend-gate-r2.md` und unveränderte Repros.

## R2-H1: Vollständiger Rawstream vor jedem destruktiven Vorfilter

Der bekannte Streamvorfilter wurde entfernt. Der bereits validierte ursprüngliche
Delta-/Reasoningtext gelangt synchron aus `GatewayManager.applyEvent` über
Broadcast/Send als interner Funktionsparameter bis zum verbindungseigenen
Browserausgabepfad. Die normale typisierte Eventprojektion bleibt begrenzt;
ihr gekürzter Displaytext ersetzt den Rawbeleg für diesen nativen Stream nicht.
Keine zusätzlichen Wirefelder, Secretregistry, Rawcaches oder persistenten Daten.
Der ursprüngliche Upstreamtext und Eventobjekte werden nicht verändert.

Im bestehenden `SecretRedactor.stream` wird zuerst der vollständige Rawchunk mit
dem vollständigen bisherigen Channeltail zusammengeführt. Bekannte Volltreffer,
überlappende kurze Werte, Langwertpräfixe und zentrale statische Schutzintervalle
werden am unveränderten Combined bestimmt und vereinigt. Erst danach entstehen
Masken, statische Anzeige und die höchstens 200000 Zeichen lange Browserausgabe.
Die finale begrenzte Browserredaction und Schemaprüfung bleiben bestehen.

Damit bleiben beide belegten Varianten geschützt:

- Ein erster 200400-Zeichen-Chunk verliert seine 500 Secretzeichen vor dem
  Streamabgleich nicht mehr. Der Folgetext beginnt korrekt an Position500;
  das vollständige Secret wird erkannt und PUBLIC-END bleibt sichtbar.
- Ein vollständig bekannter Kurzpräfix wird vor dem Abgleich mit einem längeren
  bekannten Secret nicht ersetzt. Beide Registrierungsreihenfolgen verbinden
  den unveränderten Präfix mit dem Folgechunk und maskieren den gesamten Wert.

Vorhandene `secretStreams`, `secretBufferBytes`, Registrygrenzen und konservative
Überlastunterdrückung bleiben unverändert. Keine unbeschränkten Buffer.
Der vorhandene Hydrierungsbuffer hält weiterhin echte Raw-Upstreamevents und
zählt deren tatsächliche Bytes. Beim Flush gilt derselbe Ausgabepfad.
Snapshot-/History-/Replayanzeigen behalten den zuvor geprüften finalen Präfixschutz.

## Channel- und Cleanupgrenzen

Streamtails bleiben getrennt nach Manager, Browserverbindung, Sitzung, Turn und
Text-/Reasoningkanal. Nur die privaten Channelsegmente werden eindeutig kodiert;
Routingkennungen und alle gesendeten IDs bleiben exakt. Dadurch löscht Cleanup
für eine Sitzung auch keine längere ID mit gleichem Präfix und Trennzeichen.

Ein neuer Turn, eine beendete Subscription, eine neue Lease oder ein beendeter
Transport verwirft nur die zugehörigen alten Streamtails. Messagecomplete,
Connectionrelease und Managerdispose behalten ihre begrenzten Cleanupwege.
Eine fortlaufende Lease hält ihre Rawpräfixe während erneuter Hydrierung;
andere Browserverbindungen und Principals behalten ihre eigenen Tails.
Bekannte Secretwerte werden bei diesen Tail-Cleanups nicht vergessen.

## Unveränderte gesunde Repros

Eigene bytegleiche Kopien und sämtliche neuen Ergebnisse liegen unter
`temp/hermes-v2/phase8-backend-fixes-r2/`. Originale und alte Ergebnisse blieben erhalten.

| Prüfung | Ergebnis |
| --- | --- |
| R2 stream-overlap | **8/8**, vier bisher rote Sollgruppen geschlossen |
| R2 stream-crop | **24/24**, sechs bisher rote Sollgruppen geschlossen |
| Root chat-stream-prefix | **4/4**, bisher rote große bekannte Variante geschlossen |
| Alter Phase7-R3 overlap-controls | **24/24 Gruppen und alle 1858 Streamtrennstellen** |
| Gesamte qualifizierte R2-Matrix | **84/84**, zuvor 74 gesund und zehn rote gesunde Sollgruppen |
| Unveränderte R1-Gategruppen | **71/71** |
| Bisherige Root-H1/H2-Kontrollen | **18/18**, Plaintext6, Tool10, Completed2 |
| Unveränderte R5-Kontrollen | **234/234**, sieben Runner |

Die 84 R2-Gruppen bestehen aus Raw16, HOME5, Delete6, Permission5,
Chat/History/Replay20, Streamoverlap8 und Streamcrop24.
Die R5-Gruppen bleiben Metadaten8, Budget27, Verhalten53, Präfix48,
Settlement8, Await80 und Behavior10.

Die Repros verwenden echte Antworten auf Secretrequests, echte Fake-WebSockets,
normale Managerausgaben und finale schema-valide Browserframes. Normale
Nachbartexte PUBLIC-END und exakte Sitzungskennungen bleiben erhalten.
Große geprüfte Rawframes liegen unter dem jeweiligen Upstreambudget; das
Ausgabelimit wird eingehalten. Die 1858 alten Trennstellen umfassen Raw-/Unicode-/
Escapingvarianten, Kurzwerte an Präfix/Mitte/Suffix, beide Reihenfolgen,
teilweise Überlappung sowie echte Kapazitäts-/Registrykontrollen.

Die vier explorativen Doppel-JSONstringproben wurden ebenfalls unverändert
ausgeführt: **Exit1,0/4 gesund**. Beide Vergleichsfälle ohne Learn scheitern
weiter identisch. Sie bleiben außerhalb der 84 qualifizierten Gruppen und
werden ausdrücklich weder als grün noch als behobene Streamregression gezählt.
Historische defekte Bugassertionen und der bekannte widersprüchliche
Lifecycle-Timeout wurden nicht in gesunde Ergebnisse umgedeutet.

## Dauerhafte additive Regressionen und Pflichtchecks

Neu sind 50 Streamgrenzfälle und 13 Lifecyclefälle, insgesamt **63** zusätzliche
Tests. Sie prüfen Message/Reasoning, Raw-/JSONescaping, beide Overlapreihenfolgen,
kleine/große Chunks, unbekannte gesunde Sichtbarkeit und statische Rohregeln.
Die Lifecyclefälle prüfen vollständige 500/700-Zeichen-Tails, getrennte Kanäle,
Browser/Principals, exakte Sitzungspräfixe, Turn/Complete, Unsubscribe/Resubscribe,
Unmount/Dispose, echte Transport-/Epochwechsel, echte Hydrierung mit Rawflush,
Replay ohne doppelte Deltas und beide bestehenden Überlastgrenzen.

| Pflichtcheck | Ergebnis |
| --- | --- |
| Vollständige Hermes-Suite, cache=false | **844/844**,82 Dateien, alle 781 bisherigen unverändert |
| V2-Contracts, vier unveränderte Testdateien | **23/23** |
| Isolierter Contractsbuild | grün, 19/19 Runtime-JS-Ausgaben bytegleich zu Packageexports |
| Volles pnpm typecheck einschließlich Web/E2E | grün |
| Servertypen separat | grün |
| Scope-ESLint, max-warnings=0 | grün |
| pnpm architecture:file-lines | grün, keine Baselineänderung |

Logs: `freeze-run.log`, `final-controls-run.log`, `final-r1-run.log`,
`final-root-run.log`, `final-r5-run.log`, jeweilige Einzelprotokolle und Ergebnisdateien.
Alle verwendeten Runner sind terminal. Fakes, Sockets, SQLite, Dateihandles und
FS-Hooks werden durch ihre unveränderten bzw. neuen eigenen Fixtures geschlossen.
Die einzige neue Fixturewartebedingung korreliert native Sequenz und Epoch gemeinsam.

## Exakter Diff und Freeze

Öffentliche Contracts und HTTP-/Eventshapes sind unverändert.
Gegenüber dem 216er Manifest: **210 Quellen byteidentisch, sechs geändert, drei neu**.

Geändert unter `apps/server/src/hermes/v2/`: `normalize-values.ts` entfernt den
destruktiven Streamvorfilter; `normalize-events.ts` hält die normale typisierte
Eventprojektion; `manager.ts` reicht den originalen Stream intern weiter und
grenzt Tail-Cleanup ab; `browser-output.ts` führt den Rawabgleich vor der
Anzeigegrenze aus; `secret-redactor.ts` klassifiziert statische Intervalle am
unveränderten Combined; `operations.ts` beendet Tails an den exakten Leasegrenzen.

Neu: `stream-test.fixture.ts`, `stream-raw-boundaries.test.ts`,
`stream-lifecycle.test.ts`. Alle neun geänderten/neuen Handdateien bleiben unter 400
Zeilen; Manager 388. `source-diff.json` enthält pro Datei Vorher-/Nachher-SHA und Zeilenzahl.

Neues Manifest: `temp/hermes-v2/phase8-backend-fixes-r2/code-freeze.json`, **219 Quellen**.
SHA-256: `c723553ab04b2ebd44248433ca6cc5a0b4ec9af6286cf24a50a6f86050791e9a`.
`freeze.py --verify` bestätigt zusätzlich **2104/2104** geschützte Altartefakte,
**91/91** alte Tests/Fixtures und **94/94** bytegleiche Repro-/Support-/Runnerkopien.
Das alte 216er Manifest bleibt unangetastet mit SHA
`7530f85494cc2cc2e6a971c0504cc62d932d175b6f855bbfb0db37cd53226b18`;
das frühere 209er Manifest und alle alten Berichte/Assertions bleiben unverändert.

Keine Client-/UI-/Root-E2E-Datei bearbeitet. Keine echte Coremutation,
Hermes-CLI-, Dienst-, Preview-, Account- oder Gitaktion. Keine neuen Agents.
Nur eigene Fakes, temporäre Dateien/SQLite und Loopbackverbindungen.
Version/Changelog, Realsmokes und Gesamtfreigabe bleiben Root.
Produktcode eingefroren; unabhängiges R3 ausstehend.

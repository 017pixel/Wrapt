# Phase 3: gezielte Clientkorrekturen

Stand: 2026-10-16. Drei bestätigte Medium-Clientbefunde und der ergänzte
Queue-Gegenfall korrigiert. UI-API unverändert. Keine UI-, Server-, Contracts-,
Dienst-, Browser- oder Gitänderungen durch diesen Teilauftrag.

## Receipt und History

`message.submit.data.userRowId` verbindet ausschließlich die konkrete beim
Send erzeugte OptimisticRow mit der belegten Userrow. Eine bereits geladene
Historyrow derselben rowId bleibt der autoritative Repräsentant einschließlich
logicalId. Der laufende Turn übernimmt diese konkrete Identität.

Das Receipt erzeugt keine neue Zeile, wenn seine ursprüngliche OptimisticRow
inzwischen durch eine Snapshot-Barriere ersetzt wurde. Gleichlautende echte
Rows mit anderen IDs bleiben getrennt. Keine Text-Deduplizierung, keine
Assistant-/Tool-Zuordnung aus dem User-Receipt. Vorhandene Owner-/Draftguards
bleiben wirksam; verspätete Ergebnisse löschen keinen inzwischen anderen Draft.

Bei `status:queued` verschwindet ausschließlich die konkrete OptimisticRow.
Der Zustand bleibt Queue und wird nicht als bestätigte History erfunden.
Belegte ältere Userrows mit gleichem Text bleiben erhalten. Entfernte
optimistische Turnreferenzen werden ebenfalls bereinigt.

## Modellkontext

`model.select` erfasst vor dem Send Socket-/Snapshotgeneration und die lokale
Auswahlbeobachtung. `session.updated` erhöht eine interne selectionRevision,
auch bei gleichem Wert oder erneuter null-Beobachtung. Snapshot erhöht sie
ebenfalls. Die interne Revision verändert den öffentlichen UI-Vertrag nicht.

Nach Await darf ein altes Modellresultat eine spätere autoritative Auswahl
nicht ersetzen. Ein entwertetes Resultat löst weder Mutation noch unnötigen
Folgeabgleich aus. Ein Resultat im unveränderten Kontext wird weiterhin
übernommen; keine Mutation wird automatisch wiederholt.

## Bindung von Readresultaten

`chat-response-guards.ts` prüft nach RPC-Korrelation und Generationsprüfung:

- session.subscribe: snapshot.session.id entspricht angeforderter Stored-ID.
- history.read: data.sessionId entspricht angeforderter Stored-ID.

Core-Aliase werden serverseitig auf die angeforderte Stored-ID projiziert.
Ein anderer Core-Titel ändert diese Identität nicht. Der Browser erlaubt
keine geratenen Aliaszuordnungen. createSession hat keine erwartete Session-ID
und darf die neu serverbestimmte ID weiterhin übernehmen.

Ein Widerspruch beendet die Browserverbindung als PROTOCOL_MISMATCH, sichtbar
im Connection-/Sessionzustand. Fremde Inhalte werden nicht übernommen;
vorher belegte eigene Inhalte bleiben. Schreibbarkeit und Ladezustände werden
geschlossen, Auto-Retry stoppt. Expliziter Reconnect ist möglich. Andere
möglicherweise gesendete Mutationen behalten beim Close ihren Unknownstatus.

## Nachweise

`chat-client-fixes.test.ts`: 14 neue Regressionen. Sie decken Receipt vor/nach
History, UID-Erhalt, echte gleiche Texte, Ownerwechsel, Snapshot-Barriere,
Queue, verspätetes Modellresultat nach Snapshot bzw. session.updated,
erneute null-Auswahlbeobachtung, gültiges Modellresultat, falsche Subscribe-/
History-ID, gültige Stored-ID-Projektion und neue Create-ID ab.

Zusammen mit den 64 bisherigen Tests: 78/78 in sechs Testdateien grün.
Gezieltes ESLint: PASS. architecture:file-lines: PASS, 1743 Dateien geprüft.
Alle geänderten Produktdateien bleiben unter 400 Zeilen, größte 268 Zeilen.
Web-Typecheck ausgeführt: keine Fehler im Client-Scope, aktuell blockiert durch
parallel bearbeitete UI-Tests. Surface.test.tsx meldet fehlendes container und
unknown()-Argumente; NewSessionDialog.test.tsx meldet einen unvollständigen
Project-Listenmock und .catch auf einem Resolverobjekt. Parent ist informiert;
Gesamtcheck nach UI-Freeze nötig. Diese fremden Dateien wurden nicht editiert.

Reproduktion: `pnpm --filter @wrapt/web exec vitest run` mit Featurepfaden zu
chat-client-fixes.test.ts, chat-state.test.ts, gateway-client.test.ts,
chat-runtime.test.ts, chat-runtime-races.test.ts und useHermesV2Chat.test.tsx.
Außerdem `pnpm --filter @wrapt/web typecheck`, gezieltes ESLint auf die
chat-/gateway-/Hookdateien und `pnpm architecture:file-lines`.

Der unabhängige Bootstrap-Befund gehört zum separaten Parent-Backendfix.
Browserintegration und unabhängiger R2-Recheck bleiben beim Parent; dieser
Bericht ersetzt weder den unabhängigen Review noch das vollständige Phase-3-Gate.

# Phase 3: unabhängiges Client-/State-/Hook-Gate R3

Stand: 2026-10-16, Autoren-Freeze nach phase3-client-fixes-r2.
**Urteil: PASS im geprüften nonvisuellen Client-Scope.**
Keine offenen konkret reproduzierten High-/Medium-Findings. R1 und R2 sind in
diesem Scope geschlossen. Kein vollständiges Phase-3-/Gesamtfeature-PASS.

## Scope und Verfahren

Originalanlage mit CoreChat/State/Phase 3, verbindliche Chatübergabe und
Designreviews sowie eigene R1-/R2-Gates bleiben die Grundlage. Autorenantworten
phase3-client-fixes und phase3-client-fixes-r2 vollständig gelesen und mit den
aktuellen gateway-/chat-/Owner-/Store-/Hookmodulen abgeglichen.

88 Tests in sieben vorhandenen Client-Testdateien selbst ausgeführt. Die beiden
externen R2-Dateien unverändert erneut ausgeführt, jetzt 16/16 grün einschließlich
der früher roten gesunden Assertions. Zusätzlich zwölf neue unabhängige R3-Fälle.
Keine Produkt-, Browser-, Dienst-, Git- oder echten Coreänderungen. Testartefakte
liegen ausschließlich unter /tmp; einzige neue Projektdatei ist dieser Bericht.

## R2-M1 geschlossen: Operationsuser bleibt vom fremden Turn getrennt

Quellen: chat-state.ts:6, :76, :81 und :86; chat-events.ts:7 und :78;
chat-actions.ts:136 mit Verarbeitung des konkreten Submitreceipts.

ChatTurn besitzt keine Userreferenz mehr. optimisticUser verändert ausschließlich
seine lokale Operationsrow. message.started und Completion können diese Row nicht
auf die Userrow eines beliebigen Classic-Turns umbenennen. Erst ein positiver
Submitreceipt bindet exakt die ursprüngliche Operations-ID an seine belegte Userrow.
Queue entfernt nur diese Operations-ID. Completion bindet weiterhin die über den
Turn bekannte Assistant-Zeile, ohne aus Userdaten Tool- oder Assistantbelege abzuleiten.

Selbst geprüfte gesunde Abläufe:

- Fremder Classicabschluss mit Userrow 41 und Assistantrow 42 vor eigener
  queued/null-Antwort: eigene Operationsrow verschwindet, belegte Classicrow bleibt.
- Derselbe Ablauf vor eigener streaming/43-Antwort: ausschließlich der eigene
  Pendingtext erhält Row 43, Classicrow 41 bleibt einschließlich History-UID erhalten.
- Eigene Completion vor Receipt 42, mit History/UID sowohl davor als auch danach:
  bis zum Receipt keine geratene Userbindung, danach genau die belegte echte Userrow.
- Zwei Owners derselben Session senden gleichzeitig gleiche Texte, Antworten kommen
  in anderer Reihenfolge: zwei Operations-IDs, Queuecleanup und positiver Receipt
  betreffen jeweils nur ihren Submit. Kein Owner übernimmt den Draft des anderen.
- Snapshot zwischen Completion und spätem Receipt, Owner wechselt nach B und schreibt
  neuen Draft: keine alte Row wird rekonstruiert, Auswahl und neuer Draft bleiben.
- Zwei echte gleichlautende Userrows mit verschiedenen UIDs bleiben getrennt;
  belegte Historykopien derselben UID werden vereinigt. Kein Textvergleich als Identität.
- Unknown bleibt trotz fremdem beziehungsweise übernächstem Turn unbekannt.
  Completion löst weder implizites Bestätigen noch erneutes Senden aus.

Die zusätzlichen Prüfungen halten nötige Folge-Reads gezielt zurück. Ein späterer
Snapshot kann deshalb keinen zuvor falschen Zwischenzustand als scheinbaren PASS verdecken.

## R2-M3 geschlossen: innere Liveevent-ID wird vor jeder Projektion gebunden

Quellen: chat-response-guards.ts:14; chat-runtime.ts:201 und :241.

assertEventSession prüft session.updated vor Eventpuffer, Reduktion und Listenprojektion.
Außen A mit innen B schließt sichtbar als PROTOCOL_MISMATCH/incompatible. Belegte
Inhalte, Cursor, Auswahlrevision und Metadaten bleiben unvermischt; Schreibbarkeit endet.
Ein vom Reducer verworfenes altes Event erzeugt auch keine Sidebar-/Abgleichnebenwirkung.

Selbst geprüft: ID-Widerspruch bei zwei Owners sowohl während ausstehendem Subscribe
als auch in synchronisierter Session, keine Fremdprojektion, kein Folgeschreiben,
60 Sekunden kein Retry und nur ein vorhandener Socket. Bereits gesendete Mutation
bleibt beim Protokollclose unknown; spätes Echo und Mutationsreplay werden nicht übernommen.
Gültige ältere Sequenz beziehungsweise fremde alte Epoch verändern weder Session noch
Sidebar oder Auswahlrevision. Entwertete Frames des alten Sockets werden ignoriert.

## Frühere R1-Fixes bleiben geschlossen

- Direkter Receiptpfad vor/nach History erhält die echte Userrow und deren UID;
  Snapshot verhindert alte Zeilenauferstehung, neue Ownerdrafts bleiben erhalten.
- Alte Modellechos nach Snapshot oder session.updated überschreiben keine neuere
  Auswahl. Auch erneute gleiche/null-Beobachtung bildet eine Revisionsbarriere.
  Ein altes Bestätigungsresultat verändert keinen neuen Draft; kein Folge-Read oder
  Mutationsretry. deferred, confirmation und confirmed im unveränderten Kontext geprüft.
- Innere Subscribe-/History-ID ist an die angefragte Stored-ID gebunden. Mit zwei
  Owners kein Fremdtext und kein Folgewrite; gültige bereits serverseitig zurück-
  projizierte Stored-ID bleibt unabhängig vom Coretitel erlaubt. Unknown bleibt erhalten.

Bootstrap-Minimalfix bleibt geschlossen und wurde hier nicht neu gestaltet.
88 Bestandstests bestätigen weiterhin Owner-/Generations-/Draftguards, StrictMode,
20 aktive Leases an einem Socket, Flag-off mit v2-disabled, Budgets/Stopreserve/Drain,
Read-/Snapshotbarrieren, Unknown ohne automatische Mutationswiederholung und Grenzen.

## Selbst ausgeführte Checks

- Gezieltes Vitest auf chat-state.test.ts, gateway-client.test.ts,
  chat-runtime.test.ts, chat-runtime-races.test.ts, useHermesV2Chat.test.tsx,
  chat-client-fixes.test.ts und chat-causality.test.ts: **88/88 grün**.
- `pnpm --filter @wrapt/web exec vitest run --config /tmp/hermes-v2-phase3-gate-r2.suOqGL/vitest.config.mjs`:
  unveränderte healthy.test.ts und edges.test.ts, **16/16 grün**.
- `pnpm --filter @wrapt/web exec vitest run --config /tmp/hermes-v2-phase3-gate-r3.9lZ2DB/vitest.config.mjs`:
  neue causal-health.test.ts mit gesunden Assertions, **12/12 grün**.
- `pnpm --filter @wrapt/web typecheck`: grün.
- `pnpm typecheck`: grün einschließlich Contracts, Server, Web und E2E-Typen.
- Gezieltes ESLint aller chat-*.ts, gateway-*.ts, useHermesV2Chat.ts und dessen
  Hooktest mit `--max-warnings=0`: grün.
- `pnpm architecture:file-lines`: grün, 1745 Dateien vor Hinzufügen dieses Berichts.

Damit 116 ausgeführte gesunde Testfälle in dieser Runde. Die frühere parallele
UI-Test-Typecheckblockade besteht im geprüften Stand nicht mehr.
Parentbelege zu echtem Kaltstart/Submit/Stop/Reload, parallelem CLI/Classic und Browser
aus phase3-runtime-smoke sind ergänzend. Ich habe keine eigene echte Laufzeitprüfung
vorgenommen; UI/CSS und verbleibende Featurephasen gehören zu ihren separaten Gates.

Reviewer-Freeze nach Bericht. Keine Produktänderung durch diesen Review.

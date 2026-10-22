# Phase 3: Autorantwort zu den R2-Gegenfällen

Stand: 2026-10-16. Beide Clientgegenfälle korrigiert, Produktcode erneut
eingefroren. Öffentliche UI-API unverändert. Keine Server-, UI-, Contracts-,
Dienst-, Browser- oder Gitänderungen durch diesen Teilauftrag.

## A: Useridentität von Turnidentität getrennt

Der bisherige Fehler entstand vor dem Queued-Cleanup: Die Annahme, der nächste
Turn gehöre zum eigenen Submit, übertrug dessen Pending-User auf einen fremden
Classic-Abschluss. Die spätere Bereinigung fand die ursprüngliche ID nicht mehr.

`ChatTurn` enthält jetzt keine Userreferenz. `optimisticUser` erzeugt nur die
lokale Operationsrow und verändert keinen Assistant-Turn. message.started,
Deltas und Completion korrelieren Assistant-Inhalte anhand der echten turnId.
Sie können einen eigenen Pending-User weder übernehmen noch umbenennen.

Nur ein positives `message.submit.userRowId` verbindet die ursprüngliche
Operationsrow mit einer physischen Userrow. Bereits geladene History derselben
rowId bleibt einschließlich UID autoritativ. Ein autoritativer Snapshot darf
transiente Rows ersetzen; ein danach eintreffendes Receipt retaggt keine
anderen Rows. Für Completion.userRowId fehlt die Operation→Turn-Brücke, deshalb
wird daraus kein Usertext einer Pendingoperation auf diese Row übertragen.

Completion mappt bei persistedTurn.complete:true weiterhin die tatsächlich
über turnId belegte Assistant-Zeile. Tools erhalten daraus keine Rowzuordnung.
Queued-Cleanup entfernt ausschließlich die originale lokale Operations-ID,
niemals belegte historische Rows oder gleichlautende fremde Inhalte.

Zwei ältere Tests hatten eine Userzuordnung allein aus dem nächsten Turn
vorausgesetzt. Ihre positiven Usernachweise verwenden jetzt explizite
Submitreceipts; Persisted-/History-/Queue-Assertions bleiben erhalten. Frühere
interne turn.userId-Assertions prüfen stattdessen die fehlende Turnkopplung.

## B: Event-ID vor jeder Projektion geprüft

`assertEventSession` verlangt bei session.updated die Gleichheit von äußerem
event.sessionId und innerem payload.session.id. Der Runtime prüft dies vor
Pufferung, Reduktion, Auswahlrevision und Sidebarprojektion.

Ein Widerspruch führt wie der RPC-Guard zu sichtbarem PROTOCOL_MISMATCH und
schließt die Browserverbindung. Keine fremden Metadaten, Auswahl oder Cursor
werden übernommen. A-/B-Owner behalten ihre Auswahl und belegten Inhalte;
Schreibbarkeit endet, Auto-Retry stoppt. Bereits möglicherweise gesendete
Mutationen bleiben unknown, ohne Replay.

Zusätzlich erfolgen nach einem vom Reducer verworfenen alten Event keine
Sidebar-/Abgleichnebenwirkungen mehr. Auswahlrevision und Sequenz bleiben
unverändert. Entwertete Socketframes erreichen die Projektion weiterhin nicht.

## Nachweise

`chat-causality.test.ts`: zehn neue Regressionen:

- Fremder Classic-Abschluss vor eigenem queued/null bzw. streaming/43-Receipt.
- Eigener Abschluss vor Receipt, mit vorher geladener History und UID.
- Snapshot zwischen Abschluss und spätem eigenem Receipt.
- Unknown-Submit plus fremder Abschluss und kein implizites erneutes Senden.
- Auch der übernächste Turn bestätigt keinen unbekannten Pending-User.
- Falsche äußere/innere Event-ID bei zwei Ownern, ohne Metadaten-/Auswahlleak.
- Event-ID-Prüfung während ausstehendem Subscribe vor dem Puffer.
- Protokollschluss mit gesendeter Mutation, unknown und ignoriertem Spätecho.
- Gültiges Event, alte Sequenz ohne Sidebarprojektion und alter Socketframe.

Eigene Suite: 88/88 Tests in sieben Dateien grün, einschließlich 78 Bestand.
Unveränderte externe R2-Repros aus `/tmp/hermes-v2-phase3-gate-r2.suOqGL`:
16/16 grün, beide edges plus healthy. Reviewer über Kausalvertrag und neuen
Stand direkt informiert; dies ersetzt seinen gesonderten R3-Recheck nicht.

Web-Typecheck: PASS. Gezielt ESLint: PASS. architecture:file-lines: PASS
(1745 Dateien). Alle eigenen Produkt-/Testdateien bleiben unter 400 Zeilen.
Keine echten Hermes-Aufrufe oder Browserprüfung aus diesem Teilauftrag.

Reproduktion: gezieltes Vitest auf chat-causality.test.ts sowie die sechs
vorherigen Clienttestdateien; zusätzlich Vitest mit unveränderter externer
R2-viteconfig. `pnpm --filter @wrapt/web typecheck`, gezieltes ESLint auf
chat-/gateway-/Hookdateien und `pnpm architecture:file-lines`.

Browserintegration und unabhängiges Phase-3-Gate bleiben beim Parent.

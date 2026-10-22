# Hermes V2 Phase 11: unabhängiges Backend-/Security-Schlussgate

Stand 17.10.2026. **Urteil: NEEDS FIX, drei neue Medium-Befunde offen.**
Kein reproduzierter Blocker/High, kein belegtes Secretleck. Kein Gesamtfeature-PASS.
Der frühere Phase10-B1 ist für seinen ursprünglichen Trigger unabhängig geschlossen.
Die verbleibenden rund0,5s synchroner Grenzlast sind ausdrücklich keine Latenzgarantie.

## Auftrag, Unabhängigkeit und Freeze

AGENTS und sprachstil gelesen. Den vollständigen2273-Zeilen-Prompt gelesen:
Originalauftrag, vollständiger Findingsledger, Rollenregeln und beide B1-Berichte.
Phase2-R5-, Phase6-Fresh- und Phase8-R3-Gates samt tatsächlichen Quellen nachgelesen;
ihre PASS-Aussagen nicht als eigene aktuelle Abnahme übernommen.
Backend/Contracts read-only. Keine Autoreninstanz, keine Subagents oder Browser.
Eigene Belege ausschließlich `temp/hermes-v2/phase11-backend-review/`, unten Reviewtemp.

Maßgebliches Manifest `temp/hermes-v2/generated/phase11-final-code-freeze.json`:
SHA256 `ccb74567febc5c93bc75e23c5fd2bad7f07d8e67f6ad213414b630d77babb140`.
Vor und nach dem Review **528/528Quellen identisch**, Integritätsdateien im Reviewtemp.
Originale Gates/Assertions/Manifeste/Repros unverändert. Fünf wiederverwendete
Runtimeharness-/Fixturedateien byteidentisch kopiert, SHAvergleich dokumentiert.

## P11-B1, Medium: Attachmentcapture überlebt beobachtetes Profil-/CWD-A-B-A

Gesundes Soll: Ein beobachteter Sessionkontextwechsel entwertet die alte Bindung
auch nach Rückkehr. Vor Send `not_sent`/null Nativewrites; nach möglichem Submit
`unknown`, ohne neue persistierte Anhangsrowzuordnung oder automatischen Retry.

`attachments/binding.ts:16` bis45 erfasst Abo-/Scopegeneration und Endwerte,
aber keine `record.contextRevision`. `session-context.ts` erhöht diese monoton;
`work/binding.ts` nutzt sie bereits. Endwertgleichheit belebt den Attachmentcapture.

Frischer `context-aba.mts` hält echte FS-lstat-Awaits, keine erfundenen Statwerte.
Während Staging bzw. HOME-Nachcheck nach echtem `prompt.submit` kommen zwei echte
`session.info`-Events über Fake-WebSocket an. Profil bzw.CWD A→B→A erhöht die
Revision0→2. Trotzdem zweimal `ready` mit einem `file.attach`, zweimal bestätigter
Submit mit `userRowId:1` und neuer gespeicherter Rowzuordnung. Je genau ein Send.
Beide unveränderten gesunden Kontrollen bestehen. `context-aba-results.json` und
`context-aba-final.log` enthalten alle sechs Fälle. Kein Nutzerpfad betroffen.

## P11-B2, Medium: neues reguläres HOME am selben Pfad wird akzeptiert

Gesundes Soll: Ein vor dem Nativewrite nachweisbar ausgetauschtes HOME entwertet
die ursprüngliche Uploadbindung; kein Schreiben in die neue Verzeichnisidentität.

`attachments/scope-check.ts:8` bis10 vergleicht Realpath, Directorytyp und Symlink,
aber keine ursprüngliche dev/ino-Identität. Der Capture friert diese ebenfalls
nicht ein. Die stärkere Ressourcenbindung in `resources/context.ts` existiert,
wird für diesen Attachmentpfad jedoch nicht verwendet.

`home-inode.mts` hält den echten letzten CWD-lstat im Staging. Danach altes eigenes
HOME umbenennen, am gleichen Pfad ein neues reguläres Verzeichnis erstellen,
Await lösen. Unterschiedliche echte Inodes, unverändertes Profil/CWD, kein Symlink.
Ergebnis `ready`, ein `file.attach`; eigene Bytes liegen im neuen HOME, altes leer.
Die Kontrolle mit unverändertem HOME bleibt erfolgreich. Keine atomare Sperre
gegen einen unbeobachtbaren Wechsel nach dem letzten Nachweis verlangt.
Belege `home-inode-results.json` und `home-inode-final.log`. Keine Leckbehauptung.

## P11-B3, Medium: maskierte History/Snapshots überschreiten Clientbudget

Gesundes Soll: Gültige angenommene History bleibt nach Redaction clientkompatibel.
Nötige Kürzung/Teilabdeckung muss ehrlich sein; IDs, Lesebelege und Bedeutung von
Offset/returned/hasMore dürfen nicht durch stille Seitenverluste verfälscht werden.

`normalize-history.ts:21` begrenzt einzelne Felder. `browser-output.ts:30` bis36
begrenzt den tatsächlichen Gesamtframe nur für `work.read`. Die gültigen übrigen
Frames gehen unbeschränkt zum Transport. Der echte Client sperrt bei mehr als
4194304Bytes (`gateway-client.ts:166`). Dies ist eine Empfangs-, keine1MiB-Sendgrenze.

Frische echte Managerrepros:25Assistentrows mit je100000Q, native Antwort2501668Bytes,
also unter dem bestehenden4MiB-Dashboardbudget. Secret Q über tatsächliches
`request.respond` gelernt, weder Registry noch Normalizer ersetzt. Schema gültig.

| Ausgabe | Ohne Learn, Client online | Mit Learn, Client incompatible |
| --- | ---: | ---: |
| history.read | 2505069Bytes | 5005069Bytes |
| session.subscribe-Snapshot | 2505560Bytes | 5005560Bytes |

`history-budget.mts` und `snapshot-budget.mts` reichen die tatsächlichen Managerframes
in den unveränderten echten GatewayClient über FakeSocket. Beide gesunden Kontrollen
bleiben online. Ergebnisse und Cleanup0 stehen in den jeweiligen JSONdateien.
Kein Secretleck; reproduzierbare Sperre einer gültigen History nach Maskenwachstum.

## Unabhängig bestätigter Phase10-B1 und neue Schutzkontrollen

Unveränderter `native-redaction.mts`, echte Timer, echte Manager-/Native-WS-Pfade,
eigener Loopback-Port0.100Werte über tatsächliche Requestantworten gelernt.
65536Bytes:11,3ms;200000Bytes:22,3ms;8387584Bytes:553,3ms bis Browserframe.
Große reale10ms-Tickerlücke507,5ms statt ursprünglicher11275,3ms. Alle100Werte
maskiert, Session-ID exakt, gültiger65536-Zeichen-/65756-Byte-Ausgabeframe.
Danach Manager/native Clients/Timer0. PeakRSS272312KiB ist keine harte Speichergrenze.

Unveränderter `redaction-load.mts` Exit0:100Werte/1048576Registrierungszeichen,
atomare Budgetablehnung,64Raw-/Escape-/Overlaptrennstellen,18statische Kontrollen,
Tailüberlastung konservativ unterdrückt.8MB-Matcher364,5ms, langer periodischer
Fall286,7ms. Finaler Workwrapper1039776Bytes/52Rows; gestaut20Frames, danach1013;
zehn gesunde Frames vollständig, Queuetimer0. Erlaubte Budgets nicht gesenkt.

Neuer `redactor-oracle.mts` Exit0:3200Vergleiche gegen eigenen naiven vollständigen
Intervallscan,252Streamteilungen, längster gleicher Start, überlappende Starts,
Raw-/JSONescaping, Regexmetazeichen, UTF16/Surrogathälften und64/65-Grenze.
Separater65536-Zeichen-periodischer Wert in524303Zeichen:45,2ms, Sichtbarkeit gesund.
Kein bloßer Vergleich mit einer alten Produktversion.

Neuer `late-resource.mts` Exit0: bereits gekürzter Cronprompt, echte gehaltene
letzte HOME-Awaitgrenze, danach zwei tatsächliche Secretantworten mit Kurz-/Langwert.
Final `PUBLIC|***`, Rawstruktur vor Maskierung geschützt, statische Credentials
verschwinden, Zusatztext/Scope/Job-ID bleiben. Gesunde Kontrolle ohne Learn besteht.
Unveränderter `cleanup-controls.mts` Exit0:32Starts,140Completions,74Pendingplätze;
Pending/Waiter/Leases/Stores/Requests/Receipts/Anhänge/Sockets/Timer/Listener danach0.

## Übriger geprüfter Scope und tatsächliche Befehle

Auth/Origin/Flag, lokale Authority, strikte RPC-Operationsmenge und Routingbindungen
gegen Routen/Contracts/Upstream gelesen und mit gezielten bestehenden Tests geprüft.
Poolweite Claims, tokengebundener Unlock, Serialisierung/Sendzeugen, Epoch-/Transport-
wechsel, `not_sent`/`unknown` und kein unbekannter Autoretry bestehen diese Kontrollen.
Anhangsowner, Downloads, Fingerprints, HTTPbodylimits und echte Awaitregressionen
bestehen die Bestandsfälle; die zusätzlichen P11-B1/B2 bleiben davon getrennt offen.
Cronjob-/Profil-/CWDbindung, native Extras/409/OneShot/unknown, Ressourcenstat/Symlinks,
Pendingteilabdeckung, sichere Deletevorschau/Kaskade/Cleanupgenerationen sowie
Rowreuse/UID-/principalgebundene Lesebelege in Quellen und Bestandstests geprüft.
Keine zweite Coreinstanz/Hermesdatenbank, Cronengine, Skillregistry oder Memorywriter.

Ausgeführt, Logs jeweils im Reviewtemp:

- `pnpm --filter @wrapt/server test <gezielte44Dateien> --maxWorkers=2`:523/523, Exit0.
  Selektoren: routes/presend/protocol-errors/request-registry/security-mutations/
  security-output/security-encodings/security-prefix-overlap/raw-output-regressions/
  stream-raw-boundaries/secret-search; attachments/ und resources/;
  organization/{row-identity,review-regressions,identity-coverage};
  work/{final-budget,guards,late-prefix-overlap}, jeweils `.test.ts`.
- `pnpm --filter @wrapt/server test src/hermes/client-stream.test.ts --maxWorkers=2`:
  8/8, Exit0.4MiB-Streaminggrenze, Cancel/UTF8 und kein Retry unbekannter Writes;
  einmaliger401-Authrefresh bleibt als ausdrückliche Ablehnungswiederholung erhalten.
- `pnpm --filter @wrapt/contracts test hermes-v2 --maxWorkers=2`:46/46, Exit0.
- `pnpm typecheck`, `pnpm architecture:file-lines`:je Exit0.
- `pnpm exec eslint apps/server/src/hermes/v2 packages/contracts/src/hermes-v2*.ts --max-warnings=0`:Exit0.
- Eigene MTS je `node --import ./apps/server/node_modules/tsx/dist/loader.mjs <Reviewtemp>/<Name>.mts`;
  alte Last-/Cleanupharnesses zusätzlich `--expose-gc`, TMPDIR ausschließlich Reviewtemp/t.
- Beobachtungsharnesses Exit0 belegen den Trigger. `finding-assertions.mts` dagegen
  ausdrücklich **Exit1: sieben verletzte Sollerwartungen, fünf gesunde Kontrollen**.

Erhaltene eigene ungültige Vorläufe: Oracle-Streamvergleich benutzte zunächst die
absichtlich kürzende Textfunktion; danach voller Bound als gesunde Erwartung.
Cleanup fehlte zunächst die bytegleiche client-fixture-Kopie. Beide Erstlogs bleiben;
kein Produktfinding/Grün daraus abgeleitet, keine fremde Assertion geändert.

## Grenzen, Cleanup und Übergabe

Frühere echte Chat-/CLI-/Classic-/Datei-/Work-/Ressourcensmokebelege gelesen, nicht neu
ausgeführt. Insbesondere Phase8 war lesend, kein Cron-/Deletewrite-Smoke. Der finale
echte Hauptturn gehört Root nach geschlossenen Schlussgates und steht weiter aus.
Native Workabdeckung observed-partial, Queue next-only und fehlender Core-CAS bleiben
ehrliche Grenzen. Bestätigte native Löschung ohne Restore-API ist als begründete
Undo-Ausnahme akzeptabel; kein künstlicher Restore oder direkter Hermes-DBwriter nötig.
Gezielte Invalidierungsreads geparkter Flächen sind kein periodisches UIpolling;
die Original12.3-Grenze bleibt angemessen, Featureflagoff muss clientseitig ruhig bleiben.

Alle eigenen Prozesse terminal, Fake-WS/Fastify/SQLite/Filehandles geschlossen,
FS-Hooks restauriert, Timer in instrumentierten Läufen0. Eigene TMP-Fixtures entfernt.
Keine echten Core-/CLI-/Nutzerdatenaktionen, Dienste, Previews, Accounts, Git,
Produktionsbuilds, Neustarts oder Versionswechsel. Eigene Handdateien höchstens104Zeilen.
Freeze abschließend528/528identisch. Root besitzt Fixes und die unabhängige Nachprüfung
von P11-B1/B2/B3; die hier roten Erwartungen bleiben als unveränderte Belege erhalten.

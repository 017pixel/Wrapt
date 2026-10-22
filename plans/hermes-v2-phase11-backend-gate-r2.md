# Hermes V2 Phase 11: unabhängiges Backend-Schlussgate R2

Stand 18.10.2026. **PASS für P11-B1, P11-B2 und P11-B3.**
Alle drei ursprünglichen Medium-Befunde unabhängig geschlossen. Kein neuer konkret
reproduzierter Produktbefund im geprüften Scope. Kein Gesamtfeature-PASS.
Der globale Dateizeilencheck bleibt wegen fremder Reviewartefakte rot.

## Auftrag und Integrität

Neue Reviewinstanz, keine Autorenabnahme. AGENTS.md, sprachstil, vollständigen
Originalauftrag mit 1687 Zeilen, Findingsledger, Backendauftrag, Reviewwelle,
Backendkontext, ursprüngliches Backendgate und beide Phase11-Fixberichte gelesen.
Auch die beiden Attachmentvorbereitungen sowie tatsächliche Quellen und Tests
der neuen HOME-, Kontextrevisions- und Historyausgabepfade gelesen.

Backend/Contracts read-only. Maßgebliches Manifest:
`temp/hermes-v2/resume-20261018/generated/code-freeze.json`, 537 Quellen,
SHA256 `7a891ef9c7c99b6b7bcfc693616ff644974855daa25b53afad095ddde6166e29`.
Vor und nach Prüfung **537/537 identisch**, Manifesthash unverändert.
Eigene Belege unter `temp/hermes-v2/resume-20261018/backend-review/`, unten Reviewtemp.

Die vier Originalrepros, Environment und Cleanup-/Clientfixture wurden bytegleich
in `generated/mirror/temp/hermes-v2/repros/` kopiert. Eigene Symlinks auf die
Projektmodule erhalten ihre relativen Imports. Keine Reprozeile geändert.
`integrity-before.json` und `integrity-after.json` bestätigen auch die sieben
Original-/Kopienhashes. Alte rote Assertions und ursprüngliche Berichte bleiben
unverändert. Beobachtungsrepros allein gelten nicht als grüne Bugabnahme:
eigene `repro-assertions.py` prüft ihre tatsächlichen Werte gegen das gesunde Soll.

## P11-B1: geschlossen

`attachments/binding.ts` friert die vorhandene monotone `contextRevision` ein.
Der ursprüngliche `context-aba.mts` wurde unverändert auf aktuellen Quellen
ausgeführt. Gesunde Stage ready mit genau einem file.attach; gesunder Submit
bestätigt userRowId 1 mit genau einem prompt.submit und neuer Rowzuordnung.

Beide echten Profil-/CWD-Events A-B-A werden an gehaltenen FS-Awaits verarbeitet,
Revision 0 auf 2. Vor file.attach jeweils `not_sent`, null Nativewrites und
user_row null. Nach prompt.submit jeweils `unknown`, genau ein Submit und keine
neue Rowzuordnung. Kein automatischer Retry. Alle sechs Fälle erfüllen das Soll.
Die 27 additiven Kontexttests bestehen außerdem Capture, partielle/identische
Events sowie Vor-/Nachsendgrenzen und den Erhalt älterer sicherer Rowbelege.

## P11-B2: geschlossen

`home-proof.ts` hält dev/ino und monotone Generation gemeinsam pro ScopeResolver;
Attachment- und ResourceContext verwenden denselben Besitzer. Synchroner Guard
und beobachtete asynchrone Identitätsverluste entwerten alte Captures dauerhaft.

Unveränderter `home-inode.mts`: gesunde Kontrolle ready/file.attach 1. Physisch
neues reguläres HOME am selben Pfad mit nachweislich anderem Inode ergibt
`not_sent`, null file.attach, beide Attachmentverzeichnisse leer. Damit wird der
ursprüngliche nachweisbare Austausch vor Nativewrite sicher abgefangen.

Eigener `home-review.mts`, sieben Fälle, Exit 0:
echte gehaltene FS-Awaits nach file.attach, vor prompt.submit und nach Submit,
jeweils gesunde Kontrolle und durch Ressourcencontext beobachtetes HOME-A-B-A.
Vor Submit `not_sent`/null neue Submits, nach möglichem Send `unknown`, jeweils
ein file.attach und erhaltene native Datei. Bei zweitem Submit nach früherem
sicheren Erfolg bleibt ausschließlich Row 1 belegt; gesund entstehen Rows 1/2.
Auch die Gegenrichtung besteht: Attachmentcapture beobachtet Ersatz-HOME,
danach Rückkehr; alter Ressourcentoken ergibt HTTP409/null Writes, frischer
stabiler Token erlaubt genau einen bestätigten Pausewrite im synthetischen Core.

Die 29 neuen HOMEtests und unveränderten HOME-/Ressourcenregressionen bestehen.
Insbesondere echte Ersatzstats nach Rückkehr, fehlendes/symbolisches HOME,
CAS, Scopegeneration, aktive Requests, Dateierhalt und Deletecleanup bleiben
geschützt. Gesunde Identität erhöht die Ressourcentokengeneration nicht.

## P11-B3: geschlossen

`browser-output.ts` maskiert History-/Snapshotfelder vor der finalen
`history-output-budget.ts`-Projektion. Diese misst den vollständigen JSONframe
in UTF8 gegen 4194304 Bytes. Zeilen bleiben erhalten; neue Kürzung ist sichtbar
und entzieht betroffenen Rows den Vollständigkeitslesebeleg.

Unveränderte Originalrepros über tatsächlichen Manager und GatewayClient:
native Antwort jeweils 2501668 Bytes, alle 25 Nachrichten bleiben erhalten.
History gesund 2505069 Bytes, maskiert 4194294; Subscribe gesund 2505580,
maskiert 4194280. Alle vier Clientzustände `online`, Schema gültig und Timer 0.
Snapshotgrößen enthalten laufabhängige Metadaten; keine starre Zeitwertbehauptung.

Eigener `history-review.mts`, zehn Fälle, Exit 0:
History mit Offset 3/Limit25 und Subscribe mit30 Rows, jeweils früh oder erst
nach tatsächlichem Dashboardread/Normalisierung am gehaltenen HOME-lstat
gelerntes Q über request.respond einer zweiten synthetischen Session.
Alle exakten Row-/logischen-/Anzeige-IDs bleiben erhalten. History behält
offset3/returned25/hasMore true; Auswahl entspricht nativem order=latest.
Final4194296 bzw.4194291 Bytes, sichtbare Kürzung, kein Q und keine falschen
Lesebelege. Kleine vollständige Rows behalten Text und echte Lesebelege.
Native Inhalte bleiben bytegleich; spätes Learn verändert die rohen Cachetexte
nicht. Früh maskierte Caches behalten nur ihr bestehendes Normalisierungsfeldlimit,
keine finale Gesamtquote. Unicode-/Escapezusätze bleiben gültig.

Kleine History-/Subscribe-/Create-/Pushframes bleiben nach echtem Browser-Sendpfad
strukturell identisch. Nicht kürzbare Requestmetadaten erzeugen für Create einen
kleinen korrelierten RATE_LIMITED/unknown-Fehler, für Push id null/not_sent;
Quellrequests bleiben vollständig. Die14 neuen Bestandstests prüfen zusätzlich
exakt4MiB/ein Byte darüber, UTF8/JSONescaping/Surrogate, Inflight/Korrekturen,
Snapshotvarianten, Immutabilität und ehrliche Lesebelege an echten Awaitgrenzen.

## Tatsächliche Läufe

- Vier Originalrepros je `node --import ./apps/server/node_modules/tsx/dist/loader.mjs
  <Reviewtemp>/generated/mirror/temp/hermes-v2/repros/<Name>.mts`, jeweils Exit0.
  Sechs Kontext-, zwei Inode- und vier History-/Snapshotfälle; eigene Ergebnis-
  assertions Exit0. Logs und JSONs in Reviewtemp/generated.
- Bytegleicher `cleanup-controls.mts`, Exit0:32 Starts,140 Completions,
  74 Pendingplätze; anschließend Pending/Waiter/Leases/Stores/Requests/Receipts/
  Attachmentmaps/Sockets/Timer/Listener jeweils0.
- Eigene `home-review.mts`7/7 und `history-review.mts`10/10, Exit0.
- `pnpm --filter @wrapt/server test <26 gezielte Dateien> --maxWorkers=2`:
  **370/370**, Exit0. Vollständiger Selektor im `generated/targeted-tests.log`.
  Enthalten:70 neue Fixfälle sowie300 unveränderte direkte Schutzregressionen
  für HOME/Submit/History/Autorisierung, Ressourcen-CAS/Cron/Deletecleanup,
  Evidence/Rowidentität, Presend, Mutationssicherheit, Raw-/Encoding-/Overlap-
  und Streammaskierung sowie Workguards/finales Budget. Keine volle Suite doppelt.
- `pnpm typecheck`: Exit0 einschließlich Contracts, Server, Web und E2E.
- `pnpm architecture:file-lines`: Exit1 wegen vier fremder Visualartefakte unter
  `temp/hermes-v2/phase11-visual-codex-20261018/`: `install-fixture.generated.js`
  22114, `browser-results.json`881, `freeze-before.json`530, `freeze-after.json`530.
  Unverändert gelassen. Root besitzt deren Bereinigung und globalen Nachlauf.
- Derselbe unveränderte Checker mit `WRAPT_FILE_LINES_ROOT=apps/server/src/hermes/v2`
  und Originalbaseline:181 Dateien, Exit0. Eigene Handdateien separat unter400.
  Globales ESLint und Standardregression gehören dem Root und wurden nicht doppelt ausgeführt.

Eigene ungültige Erstläufe bleiben erhalten: Paging zunächst fälschlich vom
ältesten Ende erwartet; frühe Normalisierung zunächst fälschlich ohne ihr
200000-Zeichen-Limit erwartet; inverse CAS-Fixture zunächst ohne native
Sessiondetailrow und damit ohne erfolgreiches Abo. Nur neue eigene Harnesses
korrigiert, echte Abobestätigung ergänzt. Kein Produktfinding und kein Grün
aus diesen Fehlversuchen abgeleitet; keine alte Assertion abgeschwächt.

## Dateien, Cleanup und Grenzen

Neu: dieser Bericht sowie Reviewtemp/{integrity.py,run-repros.py,
repro-assertions.py,home-review.mts,history-review.mts}. Generierte Belege und
bytegleiche Kopien ausschließlich unter Reviewtemp/generated. Keine Produktänderung.
Alle eigenen Node-/Vitestprozesse beendet, Fake-Core-/Fastify-/SQLite-/FS-Handles
geschlossen, instrumentierte Timer/Fakeclients/Poolmanager0, FS-Hooks restauriert.
Eigenes TMPDIR einschließlich Compiler-/Testcaches entfernt; Logs bleiben erhalten.

Kein Browser, keine Subagents, echten Core-/CLI-/Nutzerdaten, Accounts, Dienste,
Previews, Ports/Slots/Sessions des Nutzers, Git, Produktionsbuilds, Restarts oder
Versionen verändert. Echte QA und abschließender Hauptturn bleiben beim Root.
Frühere echte Smokes und Autorenläufe wurden nicht als eigene Abnahme ausgegeben.

Unbeobachteter physischer Austausch nach letztem FS-Nachweis beziehungsweise
vollständig unbeobachtetes A-B-A zwischen Prüfungen bleibt ohne Core-CAS außerhalb
der zugesagten atomaren Garantie. Native observed-partial/next-only-Lücken und
fehlende Restore-API bleiben bestehen. Die bekannte synchrone Redactionlast um
0,5s wurde hier nicht neu vermessen und ist weiterhin keine Latenzgarantie.

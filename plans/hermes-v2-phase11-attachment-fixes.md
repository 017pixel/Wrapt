# Hermes V2 Phase 11: Attachment-Fixes P11-B1 und P11-B2

Stand 18.10.2026. P11-B1 und P11-B2 im autorisierten Scope implementiert.
Autorenprüfung, keine unabhängige Schlussabnahme und kein Gesamtfeature-PASS.
P11-B3 bleibt außerhalb dieses Auftrags. Keine Versionsänderung.

## Vorgaben und Scope

AGENTS.md, sprachstil, vollständigen Originalauftrag (1687 Zeilen),
`temp/hermes-v2/final-review-findings.md`, vollständiges Backendgate und beide
Vorbereitungen unter `temp/hermes-v2/phase11-attachment-aba-fix/` gelesen.
Die aktuelle Freigabe ersetzt deren frühere Wartestatus.
Keine Subagents, keine Scopeausweitung. Alte Repros, Assertions, Tests, Berichte
und Vorbereitungen unverändert. Eigene Belege liegen ausschließlich unter
`temp/hermes-v2/phase11-attachment-fixes/`, unten Fix-Temp.

## Produktänderungen

- `apps/server/src/hermes/v2/attachments/binding.ts`: Beim Capture die vorhandene
  `contextRevision` einfrieren und im inneren Guard prüfen. Damit entwerten echte
  Profil-/CWD-Events A-B-A auch Captures, deren Endwerte wieder gleich sind.
  Direkt nach Scopebestätigung den physischen HOME-Beleg einfrieren, vor dem
  ersten weiteren Await. Der bestehende äußere Guard prüft ihn an den vorhandenen
  Vor-/Nachsendgrenzen, vor `sessions.writable` und vor SQL-Zuordnung.
- `apps/server/src/hermes/v2/home-proof.ts`, neu: Gemeinsamer kanonischer
  HOME-Nachweis mit Directory-/Symlinkprüfung, dev/ino, synchronem letzten Guard,
  asynchroner Nachprüfung und monotoner Generation. Ein WeakMap-Besitzer pro
  ScopeResolver hält die Generation gemeinsam für Ressourcen und Anhänge.
  WeakMap-gebundene Scopeobjekte lassen auch die bestehenden asynchronen
  HOME-Prüfungen beobachtete Ersatzinoden oder Identitätsverluste weitertragen.
  Zurückbenennen des ursprünglichen Verzeichnisses belebt alte Captures nicht.
- `apps/server/src/hermes/v2/attachments/scope-check.ts`: Attachment-spezifisches
  GatewayError-Mapping um den gemeinsamen Nachweis. Die bestehende
  `requireAttachmentHome(scope)`-Signatur bleibt erhalten.
- `apps/server/src/hermes/v2/resources/context.ts`: Verwendet denselben HOME-Beleg.
  Frische Dashboardprofilprüfung, aktiver Request, Featureflag, CWD-Prüfung,
  Ressourcentoken und ResourceError-Mapping bleiben Ressourcenverantwortung.
- `apps/server/src/hermes/v2/resources/host.ts`: Die bisherige separate private
  HOME-Identitäts-/Generationshaltung entfällt zugunsten des gemeinsamen Besitzers.

Keine öffentliche API-, Schema- oder Persistenzänderung. Keine zusätzliche native
Mutation. Die vorhandene MutationOutcome-Logik liefert vor Send `not_sent`, nach
möglichem Send `unknown`. Nach Kontextverlust entsteht weder ein neuer Readybeleg
noch eine neue Anhangsrowzuordnung. Native Dateien und frühere sichere Rowbelege
bleiben erhalten. Es gibt keinen automatischen Wiederholungsversuch.

## Additive Tests

- `apps/server/src/hermes/v2/attachments/context-boundaries.fixture.ts`, neu:
  Gemeinsamer Testhelfer hält echte lstat-/open-Ergebnisse an fachlichen Grenzen.
  Keine erfundenen Statwerte und kein Ersatz eines Produktguards.
- `apps/server/src/hermes/v2/attachments/context-revision.test.ts`, neu, 27 Fälle:
  Capture, vor/nach file.attach, vor/nach prompt.submit; jeweils gesund,
  partielles Event, identisches Event, echte Profil- und CWD-A-B-A-Events.
  Auf die verarbeiteten echten WebSocket-Events wird vor Awaitfreigabe gewartet.
  Zusätzliche Wiederverwendung eines bereits sicher zugeordneten Anhangs nach
  späterem Profil-/CWD-A-B-A erhält den ursprünglichen Rowbeleg.
- `apps/server/src/hermes/v2/attachments/home-identity.test.ts`, neu, 29 Fälle:
  Dieselben fünf Awaitgrenzen mit gesundem HOME, regulärem Verzeichnisersatz,
  beobachtetem A-B-A durch zweiten Attachmentcapture, Ressourcencontext oder
  bestehende HOME-Prüfung. Zusätzlich echter zurückgegebener Ersatzstat nach
  bereits wiederhergestelltem HOME, fehlendes/symbolisches HOME sowie Erhalt
  einer früheren sicheren Rowzuordnung nach HOME-A-B-A im Submitnachcheck.

Die Tests prüfen Nativeaufrufzahlen, `not_sent`/`unknown`, Uploadstatus,
Dateiinhalt/-erhalt, keine Writes ins neue HOME, SQL-Zuordnungen und unveränderte
Revision/Ablaufzeit bereits sicherer Uploadrows. Gesunde Identität erzeugt keine
neue Ressourcentokengeneration.

## Unveränderte Originalrepros als eigene Kopien

`context-aba.mts`, `home-inode.mts` und `environment.mts` im Fix-Temp sind
byteidentische Kopien aus `phase11-backend-review/`. Beide Repros Exit0.
Ihre gesunden Assertions und Cleanupprüfungen bleiben unverändert.
Die Repros beobachten die Befundfälle; deren korrigierte Sollwerte wurden
zusätzlich explizit aus den neuen Ergebnisdateien geprüft (`repro-checks.json`).

`context-aba-fixed.log` und `context-aba-results.json`, sechs Fälle:

- Gesundes Staging ready, genau ein file.attach. Profil-/CWD-A-B-A erhöht
  Revision 0 auf 2: jeweils `not_sent`, null file.attach, user_row null.
- Gesunder Submit bestätigt userRowId 1, genau ein Submit. Profil-/CWD-A-B-A
  nach möglichem Submit: jeweils `unknown`, genau ein Submit, user_row null.

`home-inode-fixed.log` und `home-inode-results.json`, zwei Fälle:
Gesunde Kontrolle ready mit einem file.attach. Unterschiedliche echte Inodes
am gleichen regulären HOME-Pfad: `not_sent`, null file.attach, altes und neues
Attachmentverzeichnis leer. Kein Nutzerpfad betroffen.
Beide instrumentierten Repros enden mit Timern0, Fakeclients0, Poolmanagern0
und restaurierten FS-Hooks.

## Ausgeführte Prüfungen

- Bestand zuerst: `pnpm --filter @wrapt/server test src/hermes/v2/attachments/
  src/hermes/v2/resources/ --maxWorkers=2`, 229/229, Exit0 (`existing-first.log`).
- Neue Dateien einzeln: 27/27 und 29/29, jeweils Exit0.
- Finaler gemeinsamer Lauf: `pnpm --filter @wrapt/server test
  src/hermes/v2/attachments/ src/hermes/v2/resources/
  src/hermes/v2/work/guards.test.ts --maxWorkers=2`, 317/317 in 30 Dateien,
  Exit0 (`regressions.log`). Enthält unveränderte Ressourcen-Token-, HOME-A-B-A-,
  Await-, Deletecleanup-, Attachmentdownload-/History-/Autorisierungsfälle.
- `pnpm typecheck`: Exit0, einschließlich Contracts, Server, Web und E2E.
- ESLint für alle acht eigenen Produkt-/Testquellen mit `--max-warnings=0`:
  Exit0 (`eslint-final.log`).
- `pnpm architecture:file-lines`: Exit1 wegen fremder generierter Visualartefakte:
  `temp/hermes-v2/phase11-visual-final-20261018/web-out/build-manifest.json`
  mit2299 und dort `assets/noteQueryUpdates-DJNeLNYR.js` mit469 Zeilen.
  Unverändert gelassen. Keine eigene Datei verletzt das Limit.
- Derselbe unveränderte Dateizeilenchecker zusätzlich mit
  `WRAPT_FILE_LINES_ROOT=apps/server/src/hermes/v2` und Originalbaseline:
  Exit0 (`file-lines-scope.log`). Die acht eigenen Quellen haben17 bis120 Zeilen.

## Integrität, Cleanup und Grenzen

`integrity-before.json` und `integrity-after.json` sichern die gelesenen Originale
und bestehenden Attachment-/Ressourcenquellen. Ausschließlich die vier oben
genannten bestehenden Produktquellen wurden verändert. Alte Tests, Assertions,
Repros, Originalberichte und Vorbereitungen bleiben bytegleich. Neue Produkt-
und Testquellen mit Hash/Zeilenzahl stehen in `implementation-manifest.json`.
Eigene Fake-WS/Fastify/SQLite/Filehandles terminal geschlossen, FS-Hooks
restauriert und eigenes TMPDIR nach den Prüfungen entfernt.

Keine echten Core-/CLI-/Nutzerdaten, Accounts, Dienste, Previews oder Gitaktionen.
Keine Produktionsbuilds, Neustarts oder Versionsänderungen. Unbeobachtbares
A-B-A zwischen zwei Prüfungen beziehungsweise physischer Austausch nach dem
letzten FS-Nachweis bleibt ohne atomare Core-CAS außerhalb der zugesagten
Garantie. Die unabhängige Nachprüfung und das Gesamtgoal bleiben beim Root.

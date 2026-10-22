# Phase 6 Backend: gezielte Gatekorrekturen

Stand: 16.10.2026. Scope ausschließlich M1A/M1B/M2 aus dem unabhängigen Backendgate.
Öffentliche Contracts, Opt-ins und Client-API bleiben unverändert.

## Bestätigung vor dem Fix

Das Gate sowie alle drei Originalrepros vollständig gelesen und unverändert ausgeführt:
`profile-repro.mts`, `home-repro.mts`, `history-profile-repro.mts` unter
`temp/hermes-v2/phase6-backend-review/`.
Alle drei zeigten jeweils die gesunde Kontrolle und anschließend den beschriebenen Fehler.
Ihr Exit 0 bestätigte das erwartete Fehlverhalten und wurde nicht als gesunder Check gewertet.
Originalrepros, fremde Assertions und alte Berichte wurden nicht geändert.

## M1A: frische Profilidentität

- `GatewaySessions.writable` übernimmt `session.activate.info.profile_name` tatsächlich.
  Fehlender oder unbrauchbarer Profilstempel wird zu unbekannt, statt den alten Recordwert
  als aktuellen Nachweis weiterzuverwenden. Die Übernahme erfolgt vor folgenden Awaitgrenzen.
- Attachment-Capture prüft den frischen Wert gegen das bestätigte Scopeprofil. Rechecks
  prüfen dieselbe Bindung nach jedem asynchronen Vorlauf. Änderungen oder fehlende Belege
  vor dem nativen Send bleiben `not_sent`; nach möglicher Annahme bleiben sie `unknown`.
- Explizite Profilinformationen aus `session.info` aktualisieren ebenfalls den internen
  Record. Ein späterer beobachteter Kontextwechsel bleibt dadurch während weiterer Awaits
  sichtbar. Partielle Events ohne Profilfeld erfinden keine neue Identität.
- Neue gesunde Tests: anderes/fehlendes Profil vor Capture und nach Capture vor Stage,
  Ready-Anhang mit Profilwechsel vor Submit sowie Wechsel nach Nativeannahme aus frischer
  Activateantwort und Sessioninfoevent. Ohne Wechsel funktionieren Stage, Submit und Download.

## M1B: bestätigtes HOME

- Neues kleines `attachments/scope-check.ts` prüft den eingefrorenen kanonischen Homepfad
  erneut per realpath und lstat. Ein umgebundener Symlink wird nicht als neuer Root übernommen.
- Capture und Recheck prüfen HOME vor und nach nativen/Dateisystem-Awaits. Zusätzlich
  verlangt `safeRoot`, dass sein bestätigter Anchor beim erneuten Auflösen exakt gleich bleibt.
  Stage/Submit dürfen damit nicht mehr unter dem alten Scope auf ein anderes HOME schreiben.
- Status und Download validieren HOME ebenfalls. Download prüft nach Öffnen erneut und
  schließt das Dateihandle bei Kontextabweichung. Vorhandene stat-/Rootprüfungen bleiben erhalten.
- Tests benutzen getrenntes eigenes HOME und Workspace. Sie ersetzen HOME vor Capture,
  vor Stage, während des Activate-Awaits und nach möglicher Nativeannahme. Vorher null Stage-
  Mutationen und `not_sent`; nachher `unknown`, keine IDfreigabe und Originaldatei erhalten.
  Ein bereits Ready-Anhang erlaubt nach Austausch weder Statusfreigabe noch Download/Submit.
  Ohne Austausch bleiben ursprünglicher Root und privater Download gültig.

## M2: tatsächliche Historyseitenidentität

- Der interne Historycallback erhält den bereits gelesenen `raw.profile` derselben Seite.
  Der Manager reicht diesen Stempel an die Anhangsprojektion weiter, statt Recordprofil zu raten.
- Projektion und dauerhafte UID-Zuordnung erfolgen nur bei exakt bestätigtem Seitenprofil
  und unverändertem Home-/Scopekontext. Fehlender/fremder Stempel erzeugt weder Karte noch UIDpin.
- Der Callback ist intern asynchron, damit HOME vor der SQL-Projektion tatsächlich geprüft
  werden kann. Der vorhandene normalisierte Ausgabe-/Snapshotpfad bleibt derselbe.
- Neue Managerregressionen prüfen direkte History und Subscribe/Snapshot mit fehlendem
  oder fremdem Profil. SQL behält die UID zunächst null; der spätere korrekte Read erhält
  seine eigene Karte und pinnt ausschließlich die richtige UID. Eine schon gepinnte UID
  rechtfertigt keine Karte auf einer fremden Profilseite. Fremde Owner erhalten keine Karte.

## Dateien und Checks

- Geändert: `session-service.ts`, `manager.ts`, `normalize-events.ts`,
  `attachments/binding.ts`, `attachments/files.ts`, `attachments/service.ts`.
- Neu: `attachments/scope-check.ts`, `profile-binding.test.ts`, `home-binding.test.ts`,
  `history-scope.test.ts`. Kein Contract-, Web-, UI-, E2E-, Versions- oder Configedit.
- Neue eigene Regressionen: **19/19 grün**.
- Alle 54 unveränderten unabhängigen positiven Kontrollgruppen erneut grün:
  boundary 22, HTTP/files 10, composer 13, store 6, runtime 3.
- `pnpm --filter @wrapt/server exec vitest run --cache=false src/hermes`:
  **399/399**, 42 Dateien. Alle bisherigen 380 Fälle bleiben grün.
- `pnpm --filter @wrapt/contracts exec tsc -p tsconfig.json`: grün, kein Entfernen von Dist.
- Gezielte Composer-/Organization-Contracttests: **6/6 grün**.
- `pnpm --filter @wrapt/server exec tsc -p tsconfig.json --noEmit`: grün.
- `pnpm exec eslint apps/server/src/hermes/v2 packages/contracts/src/hermes-v2*.ts --max-warnings=0`: grün.
- `pnpm typecheck`: Contracts/Server grün; Gesamtbefehl durch laufende fremde Webtests
  blockiert (`HermesV2ComposerArea.test.tsx`, `composer-ui.test.ts`). Kein Gesamtgrün;
  E2E-Typecheck wurde im Gesamtbefehl dadurch nicht erreicht. Root ist informiert.
- `pnpm architecture:file-lines`: alle eigenen Dateien im Limit; Gesamtbefehl aktuell
  durch parallele `hermes-v2-chat.css` mit 405 Zeilen blockiert. Keine Webänderung hier.
- Alle eigenen Dateien bleiben unter 400 Zeilen; Manager unverändert 397. Keine Baseline erhöht.

## Grenzen und Freeze

Die alten akzeptierten Grenzen bleiben bestehen: kein atomarer Classic-/CLI-CWD-/Idle-/Storage-
CAS, keine garantierte Vision-/PDF-Turnbindung oder unveränderliche Dateisnapshotgarantie.
Die Korrekturen prüfen vorhandene Identitätsbelege und bereits erkennbare Kontextabweichungen;
sie versprechen keine globale Sperre gegenüber gleichzeitig autorisierten externen Akteuren.
Native Dateien werden bei Fehler/Unknown/Unmount/TTL weiterhin nicht gelöscht.
Keine echten Core-Aufrufe, Dienste, Browser, Nutzerdaten-, Git- oder Agentoperationen.
Alle Tests verwenden ausschließlich eigene temporäre Fake-Runtimes, Dateien und SQLite.

Produktdateien jetzt ausdrücklich für das unabhängige R2-Review eingefroren.
Weitere Änderungen ausschließlich nach konkreter Root-Freigabe. Kein selbst erteiltes Gate-PASS.

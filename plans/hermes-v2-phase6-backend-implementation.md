# Phase 6: Backend und Contracts

Stand: 16.10.2026. Implementiert und für unabhängiges Review eingefroren.
Kein selbst erteiltes Gate-PASS; Root verantwortet Client/UI, Browser und reale Integration.
Verbindliche Client-API: `plans/hermes-v2-phase6-interface.md`.

## Umsetzung

- `composer=1` am bestehenden V2-WebSocket ist strikt opt-in. Nur diese Verbindungen
  erhalten ihre tatsächliche UUID sowie neue Composer-/Katalog-/Anhangsprojektionen.
  Alte Clients erhalten die zusätzlichen optionalen Felder tatsächlich nicht.
- Native Commands projizieren kanonische Zeilen mit belegten Alias-/Argument-/Subcommanddaten.
  Aliase werden nicht als zweite ausführbare Zeile ausgegeben. Quick-/Pluginüberschattung
  wird ohne Beachtung der Großschreibung geprüft. Kein freier Command-/RPC-Tunnel.
- Modelle behalten bestehende Auswahl-/Kostenbestätigungs-/Deferred-Semantik.
  Hermes-Effortleiter und beobachtete Modellfähigkeiten bleiben getrennt.
- `session.title` verwendet ausschließlich die gebundene native Live-ID. `pending` bleibt
  sichtbar; erfolgreiche Änderungen invalidieren die Sessionkataloge aller Principals.
- `reasoning.select` prüft frischen Katalog und aktuelle Auswahl sowie erneut den letzten
  bestätigten Idle-/Modellzustand unmittelbar vor dem Send. Ausschließlich
  `config.set {key:reasoning,scope:session}`. Native Effort-/Wirebeobachtung bleibt vom
  angefragten Wert getrennt; Lazy-Agent kann `unconfirmed` bleiben. Approvals sind lesbar.
- Multipart ist ausschließlich im V2-Routenkind registriert. Auth, Origin, Featureflag,
  tatsächliche Connection, Composeroptin und Sessionabo werden vor dem Body geprüft.
- Ein Upload ist an Principal, bestätigten Profil/Home-Scope, Stored/Canonical-ID,
  Live/Epoche/Transport, Subscriptiongeneration und realpath-CWD gebunden. Asynchrone
  Vor-/Nachprüfungen verhindern neue Mutationen nach Close, Flagoff oder Bindungswechsel.
- Begrenzte Bodylesung erfolgt außerhalb der Sessionqueue. Native `file.attach` und
  Submit benutzen dieselbe bestehende Sessionqueue. Stop wird durch einen langsamen
  HTTP-Body nicht blockiert. Abbruch und Bodydeadline zerstören den unvollständigen Stream.
- Ausschließlich generierte native Dateinamen und begrenzte Base64-Daten. Rückgabe wird
  gegen zulässige Stagingroots, native Referenz, tatsächliche Bytes und Dateistat geprüft.
- Upload-UUID ist per SQL-CAS idempotent. `receiving/ready/not_sent/unknown` und privater
  Statusread ermöglichen bewusste Klärung. Keine automatische Mutationwiederholung.
  Eine unklare native Wirkung schützt die Runtime bereits vor Freigabe der Stagequeue.
- Eigentumsmetadaten und positive Userrow-Verknüpfungen liegen lazy in der vorhandenen
  Wrapt-SQLite. Keine Bytes, Prompts oder Transkripte werden dort abgelegt. Bekannte Secrets
  werden vor Metadatenablage und erneut bei Browser-/HTTP-Ausgabe maskiert.
- Submit prüft alle IDs, Bindungen und Dateien vor dem einen nativen Prompt mit bestätigten
  absoluten `@file`-Referenzen. Historykarten entstehen nur bei positivem eigenem Userrow-
  Receipt; spätere UID-Abweichung verhindert eine erneute Zuordnung. Wiederverwendung
  eines Anhangs erhält die belegten Karten mehrerer Userrows. Kein Textmatching.
- Downloads verwenden ausschließlich eigene opaque IDs und validieren erneut Scope,
  erlaubtes CWD, Root/realpath, O_NOFOLLOW/fstat sowie dev/ino/size/mtime/ctime.
  Antwort ist octet-stream/attachment/nosniff/no-store. Dateihandles schließen bei Fehlern.
- Uploadplätze sind mit individuellen Tokens freigegeben. Mehrfacher oder verspäteter
  Release kann eine nachfolgende Reservierung desselben Principals nicht entfernen.

## Dateimap

- Contracts: neue `hermes-v2-composer.ts`, `hermes-v2-attachments.ts` und gezielte
  additive Änderungen an Messages/Sessions/Events/Catalog sowie bestehendem Subpathbarrel.
  Kein Wachstum des großen `index.ts`, keine Packageversion-/Changelogänderung.
- Transport: `binding-guard.ts` extrahiert die ursprüngliche Guardlogik verhaltensgleich;
  `operation-queue.ts` trägt typisierte Rückgaben. `manager.ts` bietet den kleinen Stageport,
  Subscriptiongeneration und den Pool-Fanout. Manager bleibt bei 397 physischen Zeilen.
- Composer: `composer-operations.ts`, `composer-projection.ts`, `normalize-settings.ts`,
  `normalize-command-metadata.ts`; Einbindung in Operations, normalisierte Events/Snapshots,
  Kataloge, Browserprojektion, Pool und bestehende V2-Routen.
- `attachments/`: eigene Policy, Bindung, Bodylesung, Dateiprüfung, Metadatenstore,
  fachlicher Service und gekapselte HTTP-Routen. Keine zusätzliche allgemeine Dateiinfrastruktur.
- Eigene Tests: Composer/Contracts, Queryoptin und sieben fachliche Anhangstestdateien;
  isolierte `phase6-test.fixture.ts` erweitert ausschließlich den synthetischen Fake-Core.

## Prüfungen

- `pnpm --filter @wrapt/contracts exec tsc -p tsconfig.json`: grün, Dist nicht entfernt.
- `pnpm --filter @wrapt/contracts exec vitest run src/hermes-v2-composer.test.ts src/hermes-v2-organization.test.ts`:
  6/6 grün.
- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 380/380, 39 Dateien grün.
  Alle 325 bisherigen Hermesfälle bleiben erhalten; 55 neue Fälle kommen hinzu.
- Enthalten: Auth/Origin/Fremdconnection, Legacyprojektion, Aliasüberschattung,
  Titelpending, letzter Modell-/Idlewechsel, Lazy/Wire, Flagoff/Close/Abo-A→B→A,
  Live/Epoche/Transport/Profile/CWD-Symlinkwechsel, Unknown nach Nativeannahme,
  Runtimehaltung bis belegtem Settlement, Größen-/Multipart-/Bodydeadlinegrenzen,
  langsamer HTTP-Body bei Stop, Idempotenz/CAS/Restart/TTL/Kapazität, private History,
  positive/null Receipts, Dateiaustausch/Symlink/Byteabweichung/Referenzfälschung.
- `pnpm --filter @wrapt/server exec tsc -p tsconfig.json --noEmit`: grün.
- `pnpm exec eslint apps/server/src/hermes/v2 packages/contracts/src/hermes-v2*.ts --max-warnings=0`: grün.
- `pnpm architecture:file-lines`: grün, keine Baseline erhöht.
- `pnpm typecheck`: Contracts und Server grün; Gesamtabschluss durch parallel noch
  bearbeitete Web-Composer-Dateien blockiert. Root hat die konkreten Typfehler erhalten;
  diese Dateien wurden hier nicht geändert. Vollständiger Recheck folgt nach Webfreeze.
- Eine eigene neue Testassertion wurde korrigiert: Bei absichtlich manipulierten nativen
  Bytes muss die manipulierte Datei erhalten bleiben. Die vorherige Erwartung des alten
  Inhalts widersprach der ausdrücklichen Nichtlöschregel. Prüfung auf `unknown` und fehlende
  Freigabe blieb erhalten. Externe Repros und historische Assertions wurden nicht verändert.

## Belegte Grenzen

- Limits zentral: 4 MiB/Datei, zehn Referenzen/Submit, ein Upload/Principal, zwei gesamt,
  60 Sekunden Bodydeadline, 64/512 offene Reservierungen, 512/4096 Anhangsmetadatenrows.
  Ungenutzt 24 Stunden, nach Verwendung 90 Tage. TTL betrifft Wrapt-Metadaten.
- Explizites `file.attach` kann einen kalten Agentbuild auslösen. Es ist eine nutzerinitiierte
  Wirkung. Quellen: installierte `methods_prompt.py:976–1000`,
  `prompt_attachments.py:157–244`. Keine globale Storage-Umschaltung.
- Native Dateien werden bei Cancel/Unmount/Unknown/TTL nicht gelöscht. Core garantiert
  weder automatische Dateiaufbewahrung noch eine Diskquota oder einen späteren Dateisnapshot.
- Native `prompt_turn.py`/`agent/context_references.py` konsumieren dieselbe Promptreferenz.
  Absolute Pfade sind nachweislich auch in nativer Userhistory sichtbar; kein allgemeines
  Geheimhaltungsversprechen. Anhangskarten verwenden trotzdem ausschließlich eigene Rowbelege.
- Keine bewiesene native Vision-/PDF-Turnbindung. Die API meldet ehrlich `file-reference`.
- Gegen autorisierte parallele Classic-/CLI-Akteure besitzt Core keinen atomaren expected-CWD-,
  if-idle- oder Staging-CAS. Erkannte Abweichungen werden verworfen beziehungsweise nach
  möglicher Annahme als unknown behandelt. Ein unveränderlicher Dateisnapshot wird nicht behauptet.
- Keine realen Core-Aufrufe, Browser, Dienste, Previews, Gitoperationen oder Unteragenten.
  Tests verwenden ausschließlich eigene temporäre Dateien/SQLite und Fake-Loopback-Gateways.

Produktdateien eingefroren. Weitere Änderungen erst nach Root-Freigabe für konkrete Reviewbefunde.

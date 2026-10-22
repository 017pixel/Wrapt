# Phase 6 Backend: Nachsendbindung und Statusabschluss

Stand: 17.10.2026. Ausschließlich M1-Nachsend und L1 aus dem frischen Zusatzreview.
Originalauftrag, AGENTS, R1/R2/R3-Gates und frühere Fixantworten vollständig gelesen.
Öffentliche Contracts, Client-API und Featureumfang unverändert. Keine Phase-7-Arbeit.
Dieser Autorenbericht erteilt kein unabhängiges Gate-PASS.

## Reproduktion und M1-Nachsend

Die Originale `submit-postcheck.mts` und `status-context.mts` unter
`temp/hermes-v2/phase6-backend-review-r2/fresh-20261017/` unverändert vor dem Fix ausgeführt.
Drei Nachsendfälle erzeugten trotz fremdem/null-Profil oder umgebundenem HOME einen
Erfolgsbeleg und SQL-Zuordnung. L1 gab trotz inzwischen bestätigtem anderem Scope ready zurück.
Die jeweils gesunden Gegenvarianten bestanden bereits vorher.

`AttachmentService.resolveForSubmit` gibt zusätzlich einen internen asynchronen Nachcheck
derselben Capturebindung zurück. Er beginnt mit dem bestehenden synchronen Assert,
prüft das eingefrorene HOME und führt den Assert danach nochmals aus. Kein neuer
Activate-/writable-Aufruf kann einen bereits beobachteten Profilverlust überschreiben.

`operations.ts` führt diesen Check nach dem tatsächlichen prompt.submit-Await und
vor `used`, Rowpersistenz und Erfolgsprojektion aus. Nach seinem Await folgt nochmals
der synchrone Assert direkt vor SQL. Das bestehende MutationOutcome ordnet eine
erkannte Abweichung nach möglicher Annahme als unknown ein; der Manager hält die
Runtime geschützt. Kein Retry, kein zusätzlicher Core-RPC, keine Dateilöschung.

Fremdes oder explizit unbekanntes Profil erzeugt keine neue sichere Anhangs-/Rowzuordnung.
Frühere bereits bestätigte Rowbelege bleiben erhalten. Unverändertes Defaultprofil und
partielle session.info ohne Profilfeld erlauben weiterhin genau einen erfolgreichen Submit.

## L1 und beobachtete Scopegeneration

Der Statusread vergleicht nach dem HOME-FS-Await nochmals den ursprünglich bestätigten
Scope und dessen vorhandene ScopeResolver.revision. Ein inzwischen anderer Scope liefert
409/STALE_REQUEST ohne alte Anhangskarte.

Auch AttachmentBinding erfasst diese bestehende Beobachtungsrevision beim Capture.
Sein synchroner Assert verlangt weiterhin dieselbe Generation. Damit kann ein regulär
beobachteter A-B-A-Wechsel alte Vorsend-/Nachsendbindungen und Statusreads nicht wiederbeleben.
Die erneute Bestätigung derselben Identität erhöht die Revision nicht und bleibt gültig.
Keine neue persistierte Generation und kein behaupteter atomarer Core-CAS.

## Dauerhafte Regressionen und Dateien

Geändert: `apps/server/src/hermes/v2/operations.ts`,
`attachments/binding.ts`, `attachments/service.ts`.
Neu: `attachments/submit-postcheck.test.ts`, `attachments/status-context.test.ts`.
Keine bestehenden Tests oder Repros geändert, keine breite Formatierung.

16 neue gesunde Fälle mit eigenem Fake-Core, eigenen temporären Dateien/SQLite:

- Fünf Promptantwortfälle: unverändert, partielles Infoevent, fremdes Profil,
  explizites null-Profil, HOME vollständig durch eigenen Symlink ersetzt.
- Sechs Fälle an der echten HOME-lstat-Antwort des neuen Nachchecks: gleiche
  Scopebestätigung, anderer Scope, beobachtetes A-B-A, fremdes/null-Profil, partielles Event.
  Nur die Rückgabe eines echten FS-Ergebnisses wird gehalten, keine Statdaten erfunden.
- Wiederverwendung nach erstem sicherem Receipt erhält dessen Row1-Zuordnung unverändert,
  während der zweite Submit bei Kontextverlust unknown bleibt und keine Row2 verknüpft.
- Vier Statusvarianten: unverändert, gleiche Bestätigung, anderer Scope und A-B-A.

Die Nachsendfälle prüfen genau einen Upload/Prompt pro Versuch, erhaltene native Bytes,
keine neue SQL-Zuordnung und bei fehlendem Receipt unveränderte Revision/TTL.

## Prüfungen

Eigene Protokolle und Runner ausschließlich unter `temp/hermes-v2/phase6-backend-fixes-r3/`.

- Gesamte Hermes-Suite mit `--cache=false`: **424/424**, 46 Dateien grün.
  Alle bisherigen **408** Fälle plus 16 neue Fälle erhalten.
- Composer-/Organization-Contracts: **6/6** grün.
- Alle **138/138** unveränderten externen Kontrollgruppen grün:
  R1 54, R2 32, R3 52, einschließlich Secret-/Owner-/Legacy-/Unknown-/Runtimehaltung.
- Alle vier frischen Zusatzskripte unverändert grün, insgesamt **56/56** Gruppen:
  submit-postcheck 5, status-context 2, binding-healthy 23, history-healthy 26.
  Die zuvor vier scheiternden gesunden negativen Sollassertionen bestehen jetzt ebenfalls.
- Alle sechs alten Fehlerrepros erneut unverändert ausgeführt. Die beiden R2-Historyrepros
  bestehen. Die drei R1-Repros erwarten ausdrücklich die inzwischen verhinderten Bugs
  und enden deshalb mit Exit1; ihre gesunden Kontrollen bestehen. `home-fs-boundary`
  zeigt null Stage/null Dateien/not_sent; Exit1 weiterhin nur wegen seiner bekannten
  unbedingten Native-Datei-Vorassertion. Kein solcher Exit wird als gesunder Check gezählt.
- Contracts erfolgreich nach eigenem `dist/contracts` gebaut, Package-dist unberührt.
- Expliziter Server-Typecheck und fachlich begrenztes ESLint einschließlich Contracts
  mit `--max-warnings=0`: grün.
- Gesamt-`pnpm typecheck` einschließlich Web und E2E sowie
  `pnpm architecture:file-lines`: vollständig grün. Keine Baseline geändert.
- Abschließender SHA-256-Abgleich der 555 Baselineartefakte: nur die drei genannten
  Produktdateien verändert. Bestehende Backendtests, Contracts, Altberichte und externe
  Repros vollständig unverändert. Alle fünf eigenen Handdateien unter400 Zeilen.

## Grenzen und Freeze

Die akzeptierten Core-CAS-/Dateisnapshotgrenzen bleiben bestehen. Der Nachcheck bewertet
lokal erkennbare Abweichungen und beobachtete Scopegenerationen. Er garantiert keine
atomare Sperre gegen autorisierte externe FS-/Classic-/CLI-Änderungen nach dem letzten
Nachweis und keine native Vision-/PDF-Turnbindung. Metadaten-TTL löscht keine Coredateien.

Produktcode und neue Regressionen ausdrücklich eingefroren; SHA-256-Stand in
`code-freeze.json`. Weitere Produktänderungen nur nach konkreter neuer Rootfreigabe.
Keine echten Core-/CLI-/Nutzerdaten-/Browser-/Dienst-/Git-/Preview-/Accountaktionen
und keine weiteren Agents. Nur eigene Fakes, temporäre SQLite und Loopbackverbindungen.
Versions-/Changelogpflege liegt beim Root-Orchestrator außerhalb dieses Backendscopes;
der Skill Versionierungen wurde gelesen und die Übergabe ausdrücklich gemeldet.
Phase 7 beginnt erst nach neuem Root-Gate.

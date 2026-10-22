# Hermes V2 Phase 2: unabhängiges Security-Gate

**Entscheidung: needs fixes. Zwei High-, zwei Medium-Findings offen.**
App-Registrierung und produktive Integration bleiben gesperrt. Die grünen
Fake-Tests decken die unten reproduzierten Grenzen bisher nicht ab.

Stand: 16.10.2026, shared Checkout. Geprüft wurden alle neuen Module in
`apps/server/src/hermes/v2/*`, `packages/contracts/src/hermes-v2*.ts` und der
zusätzliche Package-Subpath. Keine Produktdatei geändert. Nur dieser Bericht
und ein unabhängiger temporärer Fake-Reproducer wurden geschrieben.

Verbindliche Grundlage: Originalauftrag, `hermes-v2-inventory.md`,
`hermes-v2-backend-handoff.md`, `hermes-v2-protocol-research.md` sowie der nach
der Codeprüfung erneut gelesene `hermes-v2-phase2-implementation.md`.
Installierte Hermes-Quelle bestätigt:
`07908be267f54f498230b3aae0f27c3f27d8c973`, Desktop-Vertrag 8.
Keine echten Hermes-Requests, Sessions, Dienste, Nutzerpreviews oder Commits.

## H1: Secret-Redaction endet an der Principal-Grenze

Belege: `manager.ts:34`, `manager.ts:308`, `operations.ts:55`, `pool.ts:27`.
Jeder Principal-Manager besitzt einen eigenen `SecretRedactor`. Eine beantwortete
Secret-/Sudo-/Vault-Anfrage registriert den Wert ausschließlich beim absendenden
Manager. Hermes verteilt dieselbe Sessionausgabe an weitere Principal-Manager,
deren Redactor den Wert nicht kennt.

Unabhängig reproduziert: zwei Principals abonnieren dieselbe Fake-Session;
Principal A beantwortet einen Secret-Request. Anschließend sendet der Fake ein
`tool.complete` mit einem frei gewählten Dummy-Wert im `result_text`. A erhält
`***`, B erhält den kompletten Dummy-Wert. Es genügt eine normale Toolausgabe,
die keiner generischen API-Key-/Password-Heuristik entspricht. Derselbe Pfad
betrifft spätere History-/Snapshot-Antworten über den zweiten Manager.

Folge: eingegebene Secrets gelangen trotz der zugesagten Redaction in fremde
Browsermessages. Der gemeinsame Hermes-Datenbestand hebt die ausdrückliche
Vorgabe gegen Secret-Echos nicht auf.

Korrektur: die flüchtige Kenntnis beantworteter Secretwerte muss alle lokalen
Ausgabepfade desselben Hermes-Backends abdecken, auch zwischen Principals.
Stream-Puffer weiterhin pro Browser/Session/Turn trennen; begrenzte Aufbewahrung
und Cleanup erhalten. Keine Secretwerte in Claims, Notifications oder Persistenz.
Pflichttest: zwei echte Manager, Secretantwort über A, Tool-/Stream-/History-Echo
an A und B, einschließlich aufgeteilter Chunks.

## H2: Eigene Runtime gilt nach Epochwechsel weiter als sicher trennbar

Belege: `manager.ts:58`, `manager.ts:270`, `session-service.ts:79`,
`session-service.ts:179`, `pool.ts:48`.
`owned=true` entsteht bei Create und überlebt einen Epochwechsel. Der Reconnect
verwirft Live-ID und Sequenz und führt Resume aus, setzt `owned` jedoch nicht
zurück. Resume in einem neuen Backend kann eine zwischenzeitlich von Classic
angelegte Live-Session wiederverwenden. Deren Disconnect-Flag ist unbekannt.

Unabhängig reproduziert: Create und Submit, neuer Fake-Epoch, erfolgreicher
Resume mit laufendem Turn. Der Record bleibt `owned=true`. Nach `v2-disabled`
liefert `retainRuntime=false`; der Pool trennt den letzten Upstream sofort.

Die Auswirkung auf echte Arbeit folgt aus der gelesenen installierten Quelle:
`tui_gateway/methods_session.py:885` übernimmt beim Live-Reuse das angefragte
`close_on_disconnect:false` nicht neu. `session_lifecycle.py:1032` entfernt eine
clientlose Session mit geerbtem `true` sofort. Der Fake belegt den falschen
Disconnect, die mögliche Turn-Beendigung ist aus diesem Quellcode abgeleitet.
Ein echter Hermes-Turn wurde dafür ausdrücklich nicht gestartet.

Korrektur: der Nachweis eines eigenen False-Flags gehört zur konkreten
Upstream-Epoche und Live-ID. Nach Epochwechsel oder unbekanntem Live-Reuse
konservativ wie fremde Runtime behandeln und bis belegtem Settlement halten.
Pflichttest: eigene Session in Epoche 1, Classic-Reuse mit True-Flag in Epoche 2,
letzter Classic-Socket weg, V2 deaktivieren. Der Turn muss weiterlaufen und erst
nach tatsächlichem Abschluss darf der lokale Schutzsocket verschwinden.

## M1: Verlorene Request-Antwort hinterlässt einen dauerhaften Claim

Belege: `request-registry.ts:48`, `request-registry.ts:55`,
`request-registry.ts:82`, `request-registry.ts:94`, `operations.ts:54`.
Der Claim ist nur ein Boolean. Respond setzt ihn vor dem Send und besitzt keinen
Recovery-Pfad. Ein gleicher Epoch, Disconnect, Detach oder bestätigtes erneutes
Auftauchen in `open_requests` löst ihn nicht. `unlock` wird nur für Clarify-Locks
aufgerufen, nicht für normale Antworten.

Unabhängig reproduziert: Fake verwirft die erste Approval-Response und trennt
den Socket, bevor sie settled. Nach Reconnect bestätigt das Backend denselben
Request weiterhin als offen. Ein bewusster neuer Antwortversuch mit frischer
Operations-ID erhält trotzdem `REQUEST_CLAIMED`; keine Response erreicht den
Fake. Browser-Neuanmeldung am selben Manager behebt den Claim ebenfalls nicht.

Folge: eine offene Nutzerfrage kann nach Transportverlust dauerhaft blockieren.
Das verletzt die explizite Vorgabe, keinen ewigen Claim-Lock zurückzulassen.

Korrektur: Claim-Owner und Sendegeneration erfassen; nach beendetem alten
Transport und autoritativem Open-Request-Abgleich einen expliziten neuen Versuch
ermöglichen. Keine automatische Mutation wiederholen und keinen Claim während
eines weiterhin laufenden fremden Sends freigeben.
Pflichttests: verlorene Antwort, gleicher Epoch, noch offen, manueller neuer
Versuch erfolgreich; Classic-Settlement und parallele Principals bleiben eindeutig.

## M2: Submit startet nach dem Ende des Browser-Abos

Belege: `manager.ts:49`, `manager.ts:77`, `operations.ts:35`,
`operations.ts:86`, `session-service.ts:147`.
Die Subscription wird vor dem asynchronen Schreib-Preflight geprüft. Nach dessen
REST-/Activate-Awaits prüft Submit sie vor dem eigentlichen Mutationssend nicht
erneut. `release` entfernt zwar Verbindung und Abo, bricht die laufende Operation
jedoch nicht ab.

Unabhängig reproduziert: nach erfolgreichem Subscribe wird während der
Preflight-Antwort von `session.activate` der Browser mit `v2-disabled`
freigegeben. Anschließend erreicht trotzdem ein neuer `prompt.submit` den Fake;
zu diesem Zeitpunkt existieren weder Browserconnection noch Session-Abo.

Folge: das Deaktivieren kann noch neue Arbeit auslösen, obwohl diese bis dahin
nicht an Hermes gesendet war. Es geht um den Send nach Abmeldung; bereits
gestartete Turns sollen entsprechend der Vorgabe weiterlaufen.

Korrektur: nach asynchronen Preflights unmittelbar vor jedem Mutationssend die
Verbindung, aktive Subscription und aktuelle Sessionbindung erneut prüfen oder
einen passenden Cancellation-/Generation-Guard verwenden. Insbesondere Submit,
Steer, Stop, Modellwahl und Create auf diesen Ablauf prüfen.
Pflichttest: Browserclose/Flag-off während verzögertem Preflight; kein nachfolgender
Mutationssend, kein Stop/Close eines bereits vorher laufenden fremden Turns.

## Prüfungen und bestätigte Grenzen

- Aktueller eigener Lauf `pnpm --filter @wrapt/server exec vitest run src/hermes/v2`:
  **43 Tests, fünf Dateien, grün**.
- Unabhängiger Reproducer:
  `/tmp/hermes-v2-security-gate.IBwwVq/repro.ts`, ausführbar mit
  `pnpm --filter @wrapt/server exec tsx /tmp/hermes-v2-security-gate.IBwwVq/repro.ts`.
  Vier Findings reproduziert; Assertions erwarten das derzeit fehlerhafte Verhalten.
  Zusätzlich positive Kontrollen: zwei Principal-Manager senden bei konkurrierender
  Antwort genau eine Upstream-Response; CWD-Ablehnung nach Resume schützt im zuletzt
  aktualisierten Code die fremde laufende Runtime.
- `pnpm typecheck`, gezielter ESLint-Lauf mit `--max-warnings=0` und
  `pnpm architecture:file-lines` erfolgreich. Keine Runtime-Registrierung vorhanden.
- Same-Origin und erlaubte Workbench-Identität werden vor Upgrade geprüft.
  Browserverträge sind strikt, Upstream-Methoden fachlich eingegrenzt. Keine
  freie Command-/Shell-/Config-/Profil-Durchleitung gefunden. Modellwahl wird gegen
  den aktuellen Katalog geprüft und ausschließlich mit `--session` gebildet.
- CWD-Realpath, exakte Stored-ID, Descendant- und Live-CWD-Prüfung sind vorhanden;
  schreibende Requestantworten/Locks passieren diese Grenze vor dem Claim.
  Kein Lease-Takeover gefunden. Clarify-Freitext ist gemäß Hermes-Vertrag zulässig;
  fremde QIDs, geänderte Locks und nicht angebotene Approval-Choices werden abgewiesen.
- Poolweiter synchroner Claim verhindert den normalen lokalen Doppel-Send. Classic
  kann weiter zwischen Preflight und Send gewinnen; `sent` behauptet keine Annahme.
  Unbekannte Desktopmethoden erhalten `-32601`, auch ohne Sessionmapping.
- History liegt in der Replay/Activate-Sequenzklammer. Live-Sequenzen werden
  dedupliziert; neuer Epoch führt zum Snapshot. Begrenztes Replay kann fehlende
  Toolzustände nicht vollständig rekonstruieren. Es gibt keinen Mutation-Retry.
- Persistierte Abschluss-Row-IDs und Attention-Cursor werden projiziert;
  `completedAt` bleibt ohne belegten Ursprungszeitpunkt null. Kein Server-now
  wird als ursprünglicher Abschluss ausgegeben.
- Pending-RPCs, Sessions, Manager, Browseroperationen, Snapshot-Puffer und
  Secret-Puffer haben Grenzen; Timeouts/Heartbeat/Backoff werden entsorgt.
  Browserqueue und Fastify-Cleanup nutzen vorhandene Mechanismen.
  Navigation sendet kein `session.close` oder `session.interrupt`.

## Verbleibende Abnahme

Alle vier Findings beheben und unabhängig nachprüfen, bevor der Parent registriert.
Danach erst den separat autorisierten echten Hermes-Smoke durchführen: gleicher
installierter Core, eigene Testsession, Classic-/Terminal-Parallelität und
Disconnect-Folgen. Fake-Ergebnisse belegen keine reale Runtime-Kompatibilität.
Die bekannten Grenzen bleiben: gemeinsamer Hermes-Datenbestand, Filesystem-TOCTOU,
Hermes-Orphan-Reaper trotz False-Flag, begrenztes Replay und fehlende sichere passive
Skill-Expansion. UI, Organisation, echte Dienste und das Gesamtprojekt waren nicht
Gegenstand dieses Gates.

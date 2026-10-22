# Phase 4: Backend und Verträge

Stand: 16.10.2026. Implementierung abgeschlossen und für das unabhängige Review eingefroren.
Das ist ein Implementierungscheckpoint, kein vorweggenommenes Security- oder Laufzeit-Gate.

## Ergebnis

- Organisation, Read-ACKs, Notices, Pins, Snooze, Settle, Undo und paginierte Mitgliedschaft sind implementiert.
- Gemeinsame Quellen/Fakten und private Organisation/ACKs liegen in der vorhandenen Wrapt-SQLite.
  Öffnen und Schemaanlage erfolgen erst beim berechtigten V2-Zugriff, nicht beim Import oder Default-off.
- Der neue REST-Summarykatalog verwendet ausschließlich den read-only Profilpfad mit bestätigtem
  `current`-Profil. CLI-Default `active`, `custom` und ein unbestätigter Homekontext autorisieren nichts.
- Die bestehenden Transport- und Sicherheitsregressionen bleiben grün. Keine echten Core-Aufrufe,
  Dienste, Browser, Nutzer-Sessions, Gitoperationen, Settings oder Previewzustände wurden verändert.

## Dateimap und Integration

- `packages/contracts/src/hermes-v2-organization.ts`: Organisation, Fakten, Read, Actions, Konflikte,
  Membership, Notices und Undo. `hermes-v2-summary.ts`: SummaryPage, Lookup und belegte Activity.
- `hermes-v2-sessions.ts` und `hermes-v2-events.ts`: additive optionale `readEvidence`-Felder;
  Export über den bestehenden kleinen `@wrapt/contracts/hermes-v2`-Subpath, kein großes Barrelwachstum.
- `apps/server/src/hermes/v2/organization/`: fachliche Module für Schema/Repository, Views,
  Quellen/Lineage, Evidence/ACKs, Actions, Queries, Projektion, Scope, Summary/Activity,
  Reconciliation, Service und REST-Routen mit eigenen Fake-/Integrationstests.
- `browser-output.ts` und `operation-queue.ts`: zunächst verhaltensgleicher Manager-Split.
  Manager, Pool und Session-Service verbinden Ausgabeprojektion und Invalidierungen.
- `apps/server/src/app/routes.ts`: Übergabe der vorhandenen `settings.databasePath` und des
  konfigurierten Hermes-Home. Keine zusätzliche Datenbank oder Runtime wird angelegt.
- Manager hat 395 physische Zeilen; alle neuen/geänderten Featuredateien bleiben unter 400.

## API

- GET `/hermes/v2/sessions`: Seite bis 100, Offset, page-local `q` für Titel/ID/CWD und
  serverseitig validierte `projectId`; `hasMore`, `nextOffset` und ehrliche Suchabdeckung.
- POST `/hermes/v2/sessions/lookup`: maximal 100 IDs, zwei Reader, feste Profilbindung,
  `missingSessionIds` für fehlende oder fremdprofilige Einträge.
- GET `/hermes/v2/organization`: Batch bis 100.
- GET `/hermes/v2/organization/members`: private pinned/snoozed/settled-Seiten mit
  Owner-/Scope-/Gruppen-/Membershiprevision-gebundenem Cursor, bei Pins auch Pinrevision.
- GET `/hermes/v2/organization/notices`: paginierte generische historische Fehlerhinweise;
  erneut ausstellbare Fehlerbelege, verlorene Antwortinhalte ausschließlich als Lücke.
- POST `/hermes/v2/organization/read`, `/action`, `/reorder`, `/undo`: strikte Domänenschemas.
  Action liefert genau die Zielsession, Reorder/Undo die berechtigt betroffenen aktuellen Views.
  CAS-Konflikt liefert 409 mit aktuellem Stand. Keine automatische Mutationswiederholung.
- Alle REST-Routen verlangen bestehende Authentifizierung und Same-Origin-Prüfung und senden
  `Cache-Control: no-store`. Browser können Owner, Profil oder Quellen nicht frei vorgeben.
- WS `?readEvidence=1` schaltet optionale Belege ein. Alte Clients erhalten die bisherigen Shapes.

## Kausale und persistente Regeln

- 256-Bit-Handles frieren die konkrete Source-Menge der vollständigen tatsächlichen Row-/Eventausgabe
  ein. Keine spätere Erweiterung, kein MAX-/Präfix-Read und kein ACK durch Snapshotempfang.
  Der Zeuge wird explizit über Snapshot-Zodkopien und Replay-Toolprojektion getragen.
- ACK vor späterem Fakt ist erlaubt. Gemischte ungültige/abgelaufene Batches ändern nichts.
  Owner-/Scope-/Sessionbindung, Ablauf und Grenzen werden vor dem atomaren Read geprüft.
- UID-Kopien, explizite finale SQLite-Rowzeugen und bestätigte Kompressionslinien verbinden dieselbe
  Antwort. Gleicher Text ist kein Identitätsbeleg. Gerichtete Merge-Abdeckung bestätigt keine
  transitiv gefundenen Inhalte. Fehlerquellen bleiben von Antworten getrennt.
- Direkte bereits ausgegebene absorbed UIDs werden auch vor späterem Fakt inhaltsfrei erfasst.
  Neu entdeckte UIDs vergrößern alte Handles nicht. Row-ID-Reuse setzt Identity-unknown.
- Baseline erzeugt keine alte Attention. Fehlender Anchor, unbekannte Identität und nicht auflösbare
  Live-/Historyüberlappung bleiben sichtbare Coverage-Lücken, ohne erfundene neue Abschlüsse.
- Echte Fakten und neue Abdeckung wecken alle betroffenen Principal-Projektionen. ACKs, Organisation
  und Undo bleiben privat. Metadata-Invalidierung erreicht auch Manager ohne Session-Abo.
- Bewusstes Snooze/Settle organisiert bekannte ungelesene Antworten ohne ACK. Spätere Fakten oder
  Abdeckung wecken dauerhaft, auch nach Read; erst eine neue Organisationsaktion setzt die Grenze.
  Ungelesene Entscheidungsfehler und offene Requests behalten Vorrang. Snooze verweigert offene Requests.
- SQL-Views verwenden COUNT/EXISTS und begrenzte Latest-Projektion statt gesamter Faktarrays und
  N+1-ACK-Abfragen. Ein älterer ungelesener Fehler bleibt gegenüber einer gelesenen Antwort sichtbar.
- `BEGIN IMMEDIATE`, Row-/Pinrevisionen und vollständige Pinmengen schützen CAS/Reorder.
  Undo ist zehn Sekunden gültig und stellt weder ACKs noch Fakten zurück.

## Grenzen und Aufwand

- Evidence: 15 Minuten, 4096 pro Owner, 16384 gesamt, 64 Sources pro Handle; Readresultat bis 4096.
  Handles/Undo sind flüchtig, private ACKs und Fakten dauerhaft. Keine Antwort-/Fehlertexte werden gespeichert.
- Reconciliation: höchstens 64+64 Rows pro Sitzung, zwei Worker, 512 Dirty-IDs, Singleflight pro Session.
  Ereignisse/Attach und explizite Summaryseiten treiben sie an; keine zweite Pollschleife oder neue Sockets.
  Initiale Priorität sind höchstens 512 bekannte Metadatensitzungen plus die begrenzte Summaryseite.
  Das ist keine Garantie, jeden beliebig alten Offlineabschluss vollständig gefunden zu haben.
- Native Katalogtiefe maximal 5000, HTTP-Antwortgrenze 4 MiB. Native `limit+offset`-Reads und Pinbackfills
  können mehr als 100 Rows lesen; Browserseiten bleiben bis 100, Offset wächst um angefordertes Limit.
  Am Tiefenlimit bleibt Coverage partial. Weitere Suchseiten verlangen eine explizite Benutzeraktion.
- Activity nutzt nur vorhandene Online-Manager. Bekanntes Profil/liveID/Epoch nutzt Snapshot/Requests
  ohne Token-Replay. Ungebundene Kandidaten: höchstens 20 Replay-Nachweise je Abruf, zwei gleichzeitig,
  je maximal 512 vorhandene Replayframes. Danach unknown/partial statt zusätzlicher Abos/Resumes/Agentbuild.
- `session.active_list` liefert waiting/starting/working/idle. Turnstart nur mit echtem Feldbeleg;
  Subagent-/Backgroundcounts bleiben null. CLI ohne bestätigten Kontext bleibt unknown.
- Epoch-/Replayverlust macht cursor-only Antworten unverfügbar; generische Fehlernotices bleiben
  nach TTL/Restart mit frischen Fehlerbelegen lesbar. Wiederverfügbarkeit kann erneut wecken.
- Konfiguration/Version/Changelog liegen gemäß Elternauftrag außerhalb dieses Schreibscopes.

## Prüfung

- `pnpm --filter @wrapt/contracts exec tsc -p tsconfig.json`: grün, vor abhängigen Prüfungen.
- `pnpm --filter @wrapt/contracts exec vitest run src/hermes-v2-organization.test.ts`: 3/3 grün.
- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 304/304 grün in 28 Dateien,
  davon 50 V1, 178 bestehende V2- und 76 neue Organisationsregressionen.
- Abgedeckt: kausale Reads/TTL/Restart, ACK-vor-Fakt, Alias-/Mergegrenzen, Row-Reuse, Notices,
  dauerhafter Wake, private ACKs/Org, CAS/Reorder/Undo, 128-Row-Gap, zwei Worker/Queue/Singleflight,
  Flag-off-Pause, Auth/Origin/Profile/Traversal/Übergröße und tatsächlicher Manager-Snapshot-Read-Pfad.
- `pnpm typecheck`: grün einschließlich Server, Web, Contracts und E2E-Typen.
- Server- und Contracts-ESLint der geänderten Featuredateien: grün.
- `pnpm architecture:file-lines`: grün, 1821 Dateien geprüft, keine Baseline erhöht.

Produktdateien sind ab diesem Checkpoint eingefroren. Frisches unabhängiges Backend-/Securityreview
und echte Laufzeit-/Browserprüfung übernimmt Root; Phase 5 wurde nicht begonnen.

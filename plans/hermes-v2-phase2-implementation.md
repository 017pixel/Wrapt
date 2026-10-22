# Hermes V2: vorbereiteter Phase-2-Kerntransport

Stand: 16.10.2026. Ausschließlich isolierte Backendmodule, Contracts und Fake-
Tests umgesetzt. Keine Registrierung in App/Dependencies, keine produktive
Verbindung, kein Dienst/Preview/Neustart, keine Web-/V1-/ACP-Änderung und kein Commit.
Runtime-Integration bleibt bis Phase-1-PASS und unabhängigem Security-Gate gesperrt.

## Dateien und Schnittstellen

Neue Contracts unter `packages/contracts/src/hermes-v2*.ts`:

- `hermes-v2.ts`: eigener Feature-Barrel, Export `@wrapt/contracts/hermes-v2`.
- `hermes-v2-sessions.ts`: Stored-ID, Auswahl, Summary, Message, Inflight, Usage.
- `hermes-v2-requests.ts`: strikt getrennte Approval/Clarify/Secret/Setup-Formen.
- `hermes-v2-catalog.ts`: sichere Modell-/Command-/Subagent-/Prozessprojektionen.
- `hermes-v2-events.ts`: Snapshot und normalisierte fachliche Events.
- `hermes-v2-messages.ts`: strikte Client-/Server-Envelope und Domainoperationen.
- `packages/contracts/package.json`: ausschließlich zusätzlichen Subpath exportiert;
  bestehender großer `index.ts` unverändert.

Neue Servermodule unter `apps/server/src/hermes/v2/`:

- `routes.ts`, `pool.ts`, `manager.ts`: explizite Registrierung, Principal-Singleton,
  Browser-Abos/Fanout, Lifecycle und Fastify-Cleanup ohne Import-Sideeffects.
- `upstream.ts`, `upstream-schemas.ts`: lokaler authentifizierter Legacy-WS,
  Ready/Capabilities, Korrelation, Payloadgrenzen, Timeouts, Backoff und Heartbeat.
- `session-service.ts`, `cwd-policy.ts`: exakte Stored-/Live-/Compression-Zuordnung,
  reale Rootprüfung, Create/Resume/History, schreibende CWD-Wiederholungsprüfung.
- `operations.ts`: List/Create/Subscribe/Unsubscribe/History/Submit/Stop/Steer,
  Catalog/Model/RequestReply/Lock/SubagentsRead; keine freie RPC-Durchleitung.
- `request-registry.ts`, `request-validation.ts`: poolweite atomare Claims,
  Principal/Connection/Stored-ID/Live-ID/Epoche, Choice-/QID-/Methodenprüfung.
- `normalize-{values,sessions,history,events,catalog}.ts`, `snapshot-tools.ts`:
  Feldprojektion, tatsächliche persistierte Row-IDs und strukturierte Tool-Replays.
- `background-state.ts`: Entsorgung erst bei belegtem Ende fremder Lauf-/Nebenarbeit.
- `secret-redactor.ts`: flüchtige Redaction einschließlich aufgeteilter Stream-Chunks.
- `policy.ts`, `errors.ts`, `types.ts`: zentrale Grenzen, sichere Fehler und Typen.
- `fake-gateway.fixture.ts` und fünf benachbarte Testdateien.

## Frontend-Vertrag

Shared-Exporte: `hermesV2ClientMessageSchema`, `hermesV2ServerMessageSchema`,
`hermesV2SnapshotSchema`, `HermesV2ClientMessage`, `HermesV2ServerMessage`,
`HermesV2Snapshot`, `HermesV2Event`, `HermesV2Request`, `HermesV2Selection`.

Browser sendet `{v:1,id:<UUID>,op, ...Fachparameter}`; `sessionId` bezeichnet
stets eine Stored-ID. Keine Live-ID/Profile/CWD/config-/shell-Felder vom Browser.
Server liefert Result mit gleicher ID und op, Connection-Status sowie Events.
Zusätzliche Servermessage `type:"snapshot"` ersetzt den Zustand beim Reconnect
atomar; nicht noch einmal alte Deltas auf dessen Inflight-Text anwenden.

Messages haben `rowId` aus `row_id`, `_row_id` oder echter numerischer REST-`id`.
Toolmessages tragen `toolId/toolName/toolStatus` und begrenzten Input/Output.
`message.completed` enthält optional `persistedTurn` mit `userRowId`,
`assistantRowId` und `complete` aus Hermes' tatsächlich bestätigten DB-Adressen.
Keine Textvergleichs-Deduplizierung oder erfundene Queue-/Reasoning-Fähigkeit.

## Spätere Parent-Integration

`registerHermesV2Routes(app, options)` registriert ausschließlich auf ausdrücklichen
Aufruf `/hermes/v2/gateway`; App-Prefix später `/api/v1` hinzufügen. Optionen sind
injizierte Authority/Enabled/Identity, bestehender Dashboardclient mit internem
Token, Rootpfade, Projektauflösung und optionale Policy-Overrides.

Optional `pool: new GatewayPool(options)` injizieren. Dieselbe Instanz bietet
`publishMetadataInvalidation(principal, sessionId, revision)` für die spätere
Organisationspersistenz. Der Fastify-onClose-Hook entsorgt den Pool idempotent.
Keine globale Singleton-Variable und kein neuer Hermes-Prozess.

`onAttention` erhält Principal/Stored-ID, Art, stabile `eventId` und vorhandenen
Cursor `(epoch,liveId,seq)`. Bevorzugt wird `row:<final_assistant_row_id>`.
`completedAt` bleibt ohne belegten Upstream-Zeitpunkt null; kein Server-now als
behaupteter ursprünglicher Abschluss. Parent hält gemeinsame Attention-Fakten
und principal-private Read-/Organisations-Wasserzeichen getrennt.

## Sicherheits- und Lifecycle-Verhalten

- Auth und Same-Origin vor Upgrade; strikte Domain-Schemas, Größen-/Queuegrenzen.
- Upstream nur Loopback; Token weder Browsermessage noch Error/Log.
- Session-CWD vor Attach, nach Resume und direkt vor Mutation einschließlich
  Approval/Clarify-Lock erneut validiert. Fremde/fehlende Pfade nur lesend.
- CWD-Wechsel im Resume-Ergebnis sperrt Schreiben, bewahrt jedoch die beobachtete
  fremde laufende Runtime. Keine Lease-Übernahme oder Flagänderung fremder Sessions.
- Subscribe-Fehler entfernen neue Abos. Unsubscribe entfernt nur zugehörige
  Request-Views; andere Sessions und Compression-Aliase bleiben funktionsfähig.
- Vor Request-Claim Open-Requests resynchronisieren; parallel gewinnt lokal nur
  ein Claim. Classic kann nach dem Preflight noch gewinnen: Ergebnis heißt sent,
  anschließend erneuter Settlement-Abgleich statt unbelegtem accepted.
- Kein command.dispatch/slash.exec/Skillbuilder, keine Config-/Shell-Abkürzung.
  Modelle gegen aktuellen Katalog prüfen; Server erzeugt ausschließlich --session.
- Snapshot liest History innerhalb der Replay/Activate-Sequenzklammer. Bei
  zwischenzeitlicher Completion neu lesen, bevor der Cursor bestätigt wird.
- Browser-Flag-off beendet Abos sofort. Eigene false-Sessions können getrennt
  werden; fremde laufende/unklare Arbeit behält nur die Runtime-Verbindung bis
  belegtem Settlement. Auch Disconnect während Resume ist geschützt.
- Keine automatische Wiederholung einer Mutation bei unbekanntem Ausgang.

## Prüfungen

Erfolgreich ausgeführt:

```sh
pnpm --filter @wrapt/contracts exec tsc -p tsconfig.json
pnpm --filter @wrapt/server typecheck
pnpm exec eslint apps/server/src/hermes/v2 packages/contracts/src/hermes-v2*.ts
pnpm --filter @wrapt/server exec vitest run src/hermes/v2
pnpm architecture:file-lines
```

Aktueller gezielter Testlauf: **43 Tests in fünf Dateien erfolgreich**.
Echte temporäre Loopback-WebSockets/Fastify gegen Fake-Hermes, keine Nutzersessions.
Getestet: Auth/Origin, malformed/oversize, verbotene Raw-Felder, Token-/Secret-
Redaction und Chunkgrenzen, zwei Tabs/Principals, Requests vor Mapping, unbekannte
Desktoprequests, Claims/Choices/QIDs/Classic-Stale, Symlink-/CWD-Wechsel,
History/Completion-Race, Historyseiten, Tool-/Request-Replay, neue Epoche,
keine Submit-Wiederholung, Modellbestätigung/Flag-Injection, 20 Working-Sessions,
Bootstrap-Disconnect und Nebenarbeit sowie Fastify-/Timer-Cleanup.
Neue Dateien bleiben unter 400 Zeilen; keine historische Baseline erhöht.

## Offene Gates und begrenzte Fähigkeiten

- Unabhängiges Backend-/Security-Review und App-Integration stehen aus.
- Echter Hermes-Handshake/Turn/Stop/Parallelitäts-Smoke dieses Adapters steht aus;
  der frühere lesende Phase-0-Smoke ersetzt diese Abnahme nicht.
- Snapshot erfordert eine stabile Sequenzklammer; nach fünf laufend veränderten
  Versuchen folgt ein sichtbarer, wiederholbarer Read-Fehler statt Datenverlust.
- Legacy-Replay ist begrenzt. Toolkarten werden aus vorhandenen strukturierten
  Ereignissen rekonstruiert; verlorene Toolzustände werden nicht erfunden.
- History liefert höchstens 200 projizierte Zeilen; große einzelne Toolblöcke
  begrenzt. Kein eigener vollständiger Transcriptcache oder Suchindex.
- Kein vollständiger Queuevertrag, keine sichere passive Skill-Scaffold-Expansion.
  Quick-/Plugin-Kommandos bleiben ehrlich gesperrt; spätere Skillinvocation
  ausschließlich als Agent-Prompt. Uploads/Cron/Organisations-UI folgen separat.
- Unklare fremde Nebenarbeit wird ohne Pollschleife konservativ gehalten, bis
  ein strukturierter Abschluss oder erneuter Snapshot den Zustand belegt.
- close_on_disconnect:false bleibt der dokumentierten Hermes-Orphan-Reaper-
  Semantik unterworfen; keine absolute Runtime- oder Mandantentrennungsgarantie.
- Versions-/Changelog-Anhebung erfolgt durch den Parent beim vollständigen Feature.

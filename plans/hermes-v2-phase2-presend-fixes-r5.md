# Phase 2: Vorsendgrenze und Claimfreigabe, R5

Stand 2026-10-16. Ausschließlich die beiden Medium-Befunde aus
`hermes-v2-phase2-protocol-error-gate-r4.md` bearbeitet. R1–R4 bleiben verbindlich.
Keine Runtime-Registrierung, Contracts-/V1-/Web-Änderungen oder echten Hermes-Calls.

## R4-M1: sichere Unterscheidung vor/nach Sendannahme

Lokale ws-Version 8.21.3 direkt gelesen:

- `apps/server/node_modules/ws/lib/websocket.js:448–478`: OPEN-Prüfung, dann Sender.
- `lib/sender.js:351–413,500–505,550–571`: Queue-/Kompressionszähler und Framewrite.
  Ein Frame kann aus zwei socket.write-Aufrufen bestehen. Ein beliebiger Throw
  aus socket.send beweist daher allein NICHT, dass nichts angenommen wurde.
- `lib/websocket.js:120–123`: bufferedAmount enthält Socket-/Senderwarteschlange.

Der kleine `send-boundary.ts` serialisiert zuerst. Fehler dabei sind `not_sent`.
Für synchrone Sendablehnung werden Callbackbeobachtung, bufferedAmount und der
bytesWritten-Zähler des tatsächlich verwendeten Node-Sockets verglichen.
Nur unveränderte, verfügbare Zeugen ohne Callback erlauben `not_sent`.
Ein Throw nach Original-send, geänderte Zähler oder fehlender Zeuge bleiben `unknown`.
Callbackfehler nach möglicher Annahme, Timeouts, ungültige Resultate und spätere
Folgefehler behalten `unknown`. Kein automatischer Retry wurde eingeführt.

RPC-Pending wird bei Vorsendfehler entfernt. Create/Resume fangen den typisierten
not_sent-Fehler auf und geben ihre Schutzreservierung wieder frei. Ein abgewiesenes
Create erzeugt deshalb weder Phantom-Runtime noch dauerhaft verbrauchte Kapazität.

Response wartet nun begrenzt auf den lokalen Write-Callback. Das ist keine Hermes-
Annahmebestätigung: Erfolg heißt weiterhin nur `sent`. Writefehler/Timeout bleiben
unknown; Serialisierung und belegte Vorsendablehnung bleiben not_sent.
Unbekannte Serverrequests werden weiterhin mit -32601 beantwortet; ihr asynchroner
Writefehler benutzt den bestehenden geschützten Protokollfehlerpfad.

## R4-M2: nur eigenen Response-Claim freigeben

`request.respond` fängt Send-/Folgefehler operationsweit ab. Ausschließlich bei
`outcome=not_sent` ruft es `registry.unlock(requestKey,answer.token)` auf.
Ein neuerer Claimtoken bleibt bestehen. Bei unknown gilt unverändert die bestehende
Recovery über Transportende und autoritativen Open-Requests-Abgleich.
Clarify-Lock behält seine bereits tokengebundene Freigabe und nutzt dieselbe
korrigierte Sendgrenze. Kein automatisches Wiederholen einer Antwort.

## Dateien und Regressionen

- Neu: `apps/server/src/hermes/v2/send-boundary.ts` (31 Zeilen), `presend.test.ts` (163).
- Angepasst: upstream.ts, mutation-outcome.ts, operations.ts, manager.ts sowie
  der interne Response-Mock in security-mutations.test.ts.
- 13 neue Tests: Submit-Vorsendablehnung, Create-Send-/Serialisierungsfehler,
  maxSessions:1-Kapazitätsrückgabe und Flag-off-Cleanup, Clarify-Lock-Retry,
  Response-Send-/Serialisierungs-/bekannter not_sent-Fehler, Tokenwechsel-Race,
  Submit-Callbackfehler/Throw nach Annahme und entsprechende Response-Fehler.
  Tests verlangen gesunden Zustand und bewussten neuen Versuch ohne Auto-Retry.
- R4-Inline-Repro erneut mit gesunden Assertions ausgeführt, nur Fakes:
  sync-send → not_sent, null Responses; bewusster Retry → genau eine gesendete Response.
  known-not-sent → dasselbe Ergebnis. Der Request bleibt nicht REQUEST_CLAIMED.

## Prüfungen und Freeze

- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 22 Dateien, 224 Tests grün.
- `pnpm typecheck`: grün für Extension-Contracts, Contracts, Server, Web und E2E.
- `pnpm exec eslint apps/server/src/hermes/v2 --max-warnings=0`: grün.
- `pnpm lint`: grün.
- `pnpm architecture:file-lines`: grün; Manager 391 Zeilen, alle Scope-Dateien unter 400.

Die Sendzeugen sind bewusst an die geprüfte lokale ws-/Node-Implementierung gebunden.
Wenn der Node-Socket-Zeuge fehlt, wird konservativ unknown gemeldet. Physische
Netz-/Core-Abbrüche und übrige dokumentierte Runtimegrenzen bleiben bestehen.
Versionierung/Changelog bündelt der Parent für das noch unveröffentlichte Gesamtfeature.
Produktdateien sind jetzt ausdrücklich für den unabhängigen gezielten R5-Recheck
eingefroren. Die unabhängige Feature-Recherche verändert anschließend nur ihren Plan.

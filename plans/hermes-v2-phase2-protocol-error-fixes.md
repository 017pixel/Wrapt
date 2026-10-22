# Phase 2: Protokollfehler nach Send und Runtime-Schutz

Stand: 2026-10-16. Gezielter Backend-Fixbatch nach Security-R3-PASS.
Produktregistrierung und echte Hermes-Aufrufe bleiben außerhalb dieses Scopes.
R1/R2/R3-Schutz für Secrets, Claims, Bindungen und Mutationsguards bleibt verbindlich.

## Ergebnisentscheidungen

1. `MutationOutcome` verfolgt jede Browseroperation über alle nachgelagerten Reads.
   Nach möglicherweise gesendeter Mutation bleibt das Ergebnis `unknown`, auch wenn
   erst Result-Schema, CWD-Prüfung, Snapshot oder Request-Abgleich fehlschlägt.
   Das gilt für Create/Resume, Submit, Stop, Steer, Modell, Clarify-Lock und Response.
   Vor dem ersten Mutationssend erkannte Preflight-Fehler bleiben `not_sent`.
   Fehlendes RPC-Resultat und Fehlerantwort nach Mutationssend sind ebenfalls `unknown`.
   Es gibt keinen automatischen Wiederholungsversuch.
2. Create/Resume reservieren VOR Send einen begrenzten Runtime-Schutzplatz.
   Aus der Rohantwort werden nur validierte Live-/Stored-IDs übernommen, bevor
   Desktop-Vertrag oder weitere Result-Felder geprüft werden. Ein Schemafehler kann
   deshalb keinen bereits angehängten fremden Viewer ungeschützt zurücklassen.
   Resume-Reuse bleibt fremd; bestehende `close_on_disconnect`-Flags werden nie geändert.
   Fehlende oder widersprüchliche IDs behalten ihren begrenzten Schutzplatz.
3. Schutz endet erst nach belegtem Settlement derselben Epoch/Live-Bindung:
   exakte Active-List-Zuordnung, Status idle, keine offenen Requests, ausschließlich
   abgeschlossene Subagents/Prozesse, stabiler Replay-Wasserstand und erneuter
   Active-List-Nachweis. Unbekannte Statuswerte, widersprüchliche IDs und defekte
   Antworten reichen nicht. Hauptturn-Abschluss allein reicht ebenfalls nicht.
   Erfolgreicher Nachweis bereinigt auch die lokalen Running-/Request-/Background-Fakten.
   Abgleich ist ereignisgetrieben und pro Manager single-flight; keine zweite Pollschleife.
4. Leere `session_id` ist für die tatsächlich installierten globalen Ereignisse erlaubt:
   sessions/skin/pet/cron/platforms/projects/pairing.changed, bot_relay.outbox.pending,
   session.reclaimed, approval.cancelled, connection.update, display.status/lease und
   display.install.log/done. Gateway-ready bleibt ebenfalls kompatibel.
   `sessions.changed` invalidiert die Liste; andere unterstützungsfremde Globalinhalte
   werden ignoriert und nicht in Browserdaten kopiert. Leere IDs bei echten
   Message-/Tool-/Subagent-/Error-Ereignissen bleiben ungültig.
5. Upstream-Parser, Manager-Normalizer und inkompatible Heartbeat-Antworten benutzen
   denselben Fehlerpfad. Er sperrt Browseroperationen und setzt die Verbindung auf
   incompatible. Möglicherweise laufende gebundene Sessions verlieren jede
   Eigentumsannahme und bleiben samt Schutzreservierungen verbunden.
   Der quarantänisierte Socket erlaubt ausschließlich gateway.ping, active_list,
   events.since, subagent.list und process.list für Settlement. Kein neuer Resume,
   Submit, Modellwechsel oder Request-Response kann ihn umgehen. Unbekannte
   Serverrequests erhalten weiterhin -32601. Normale Browserereignisse werden gesperrt.
   Ohne möglicherweise laufende Runtime wird der fehlerhafte Socket beendet.

## Belege aus installiertem Core

Checkout: `/home/bbecker/.hermes/hermes-agent`, Desktop-Vertrag 8.

- `tui_gateway/session_lifecycle.py:1001–1045`: Disconnect entfernt den Viewer;
  letzter Viewer mit bestehendem `close_on_disconnect=true` kann die Runtime reapen.
- `tui_gateway/methods_session.py:425,657`: Neuerzeugung übernimmt das Flag;
  ein Reuse liefert keine belastbare Zusicherung, dass eine fremde Session umgestellt wurde.
- `tui_gateway/server.py:746–761`: `_broadcast_global_event` baut den Frame mit
  `session_id=""`, einschließlich globaler Watcher- und Verwaltungsereignisse.
- `tui_gateway/change_watcher.py:285–302,331`: vollständiger installierter Watchkatalog.
- `methods_display.py:45,209,223`, `methods_display_watch.py:102,147`,
  `methods_connectors.py:412`, `session_lifecycle.py:476,506`: weitere Globalframes.

## Geänderte Dateien

- Neu: `mutation-outcome.ts`, `attachment-protection.ts`.
- Operationen/Transport: `manager.ts`, `operations.ts`, `session-service.ts`,
  `upstream.ts`, `upstream-schemas.ts`, `errors.ts`.
- Fake: `fake-gateway.fixture.ts` bietet gezielte Resultmanipulation und setzt den
  tatsächlichen Fake-Running-Zustand bei Start/Completion. Viewer-Disconnect kann
  weiterhin fremde True-Flag-Sessions abbrechen, damit der Repro aussagekräftig bleibt.
- Regressionen: `protocol-errors.test.ts`, `protocol-events.test.ts`.
- Keine Contracts-Form, V1-/Web-Datei, Runtime-Konfiguration oder Registrierung geändert.

## Prüfungen

- Originaler isolierter Parent-Repro, erneut ausgeführt:
  `node --import ./apps/server/node_modules/tsx/dist/loader.mjs /tmp/wrapt-hermes-v2-postsend-repro.mjs`.
  Angenommener Submit liefert PROTOCOL_MISMATCH/unknown und läuft weiter;
  inkompatibler fremder Resume behält nach Flag-off einen Viewer und running=true.
- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 21 Dateien, 211 Tests grün.
  Davon 49 gezielte neue Fälle für Post-Send, fehlende/beschädigte Resume-Antworten,
  unbekannte IDs, CWD, offene Requests/Hintergrundarbeit, sämtliche belegten Globaltypen,
  Parser-/Normalizer-/Heartbeatfehler sowie Fehler mitten in Submit/Resume.
- `pnpm --filter @wrapt/server typecheck`: grün.
- `pnpm typecheck`: grün, einschließlich Contracts, Server, Web und E2E-Typen.
- `pnpm exec eslint apps/server/src/hermes/v2`: grün.
- `pnpm lint`: grün.
- `pnpm architecture:file-lines`: grün. Manager 391 Zeilen, alle neuen Module unter 400.

## Grenzen und Freeze

Flag-off beendet Browsertraffic sofort. Bei unbewiesenem fremdem Zustand bleibt nur
der serverseitige Schutztransport erhalten. Bei fehlender Identität oder dauerhaft
inkompatiblen Lifecycle-Antworten ist automatisches Freigeben nicht belegbar und
unterbleibt. Die Anzahl ist durch maxSessions/maxManagers begrenzt; neue Anbindungen
werden bei ausgeschöpfter Kapazität abgelehnt. Es gibt keinen TTL-Abbruch fremder Arbeit.

Netzverlust, Gegenstellen-Abbruch und WS-Library-Abbruch wegen hartem maxPayload
können die Verbindung physisch beenden. Eine absolute Runtime-Garantie gibt es dafür
nicht. Explizites App-onClose/Pool-dispose bleibt globaler Cleanup.

Dieser Produktstand ist jetzt ausdrücklich für den unabhängigen gezielten
Security-R4-Recheck eingefroren. Keine Integration oder echten Calls erfolgt.
Versionierung/Changelog des gesamten noch unveröffentlichten Features führt der Parent.

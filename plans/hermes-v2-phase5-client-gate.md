# Hermes V2: unabhängiges Phase-5-Clientgate

Stand: 16.10.2026. **Urteil: needs fixes ausschließlich im nonvisuellen Client-Scope.**
Ein bestätigtes Medium-Finding, vier reproduzierte Varianten derselben Ursache.
Kein UI-, Komponenten-, CSS-, DOM-, Browser-, Backend- oder Gesamtfeature-PASS.
Phase3ClientR3, Phase4ClientR8, BackendR4 und UXR2 behalten ihre getrennten Grenzen.

## Prüfgrenze und tatsächlicher Änderungsstand

Originalauftrag insbesondere Phase 5, Kapitel 6/11/13, Tests und DoD sowie
requests-handoff und phase5-client-implementation vollständig abgeglichen.
AGENTS.md und sprachstil angewandt. Keine weiteren Agents.
Produktpfade unten relativ zu apps/web/src/components/hermes/v2/.

Hash-Diff gegen den unabhängigen R8-Freeze: geändert sind chat-actions.ts,
chat-owners.ts, chat-runtime.ts, chat-types.ts, useHermesV2Chat.ts sowie
chat-runtime-races.test.ts und useHermesV2Chat.test.tsx. Neu sind chat-requests.ts,
chat-request-response.ts, ihre beiden Tests, chat-request-lifecycle.test.ts und
chat-request-test-fixtures.ts. chat-store.ts und chat-events.ts unverändert.
Die Änderungen selbst und ihre Aufrufer gelesen, keine Gitoperation ausgeführt.

Operations, RequestRegistry, Requestvalidation und öffentliche Zod-Verträge nur
lesend als Schnittstellen geprüft. 84 Backend-/Contractsdateien stimmen mit dem
Backend-R4-Freeze überein. 47 Organisations-/Sidebar-/alte Reprodateien stimmen
mit dem R8-Freeze überein. Keine breite Phase-4-Neuentwicklung oder Backendfreigabe.

## M1, Medium: vor dem ersten Await fehlt der Bereitschaftsguard

Quelle: chat-requests.ts:56 und :63 bis :70, current() ab :114 sowie prepare():127.
Der erste current()-Aufruf prüft Auswahl, Owner, Sichtbarkeit, Flag und Anfrage.
loading, writable, Synchronisierung und Onlinezustand prüft er nicht. Der Eintrag
wird angelegt und der Draftfehler gelöscht, bevor prepare() erstmals wartet.
Die Bereitschaftsprüfung bei :69 und :133 erfolgt erst nach der Vorbereitung.

Repro: temp/hermes-v2/phase5-client-review/initial-guards.test.ts:37 und :58,
jeweils für respond und lockRequest. Echte ChatRuntime-/GatewayClientpfade,
öffentliche Zod-Snapshots und synthetischer TestGateway, keine Methodenmock-Ersetzung.

- Readonly: tatsächlicher offener Request liegt im synchronisierten Snapshot mit
  writable=false. Aktion starten, noch vor ihrer ersten Fortsetzung denselben
  Request durch einen schreibbaren Pushsnapshot bestätigen, Promise abwarten.
- Laufender Resync: offenen Request laden, regulären erzwungenen Subscribe-Read
  zurückhalten. Bei loading=true die Aktion starten, den Read anschließend mit
  derselben weiterhin offenen Anfrage abschließen.

Erwartet: Beide Aktionen verwerfen den bereits anfangs nicht handlungsfähigen
Zustand vor dem ersten Await als not_sent. Null Antwort-/Lockframes; kein späteres
Senden dieses Klicks. Ein ausdrücklich neuer Klick nach aktuellem Abgleich bleibt erlaubt.
Ist: In allen vier Varianten wird genau ein request.respond- beziehungsweise
request.lock-Frame gesendet. Ein bei Readonly/Abgleich begonnener Klick wird nachgeholt.
Das verletzt die ausdrücklich vereinbarte erste Guardgrenze. Die erneute Prüfung
direkt vor Send und die verbindliche Serverprüfung bleiben dabei vorhanden.

Korrekturziel: Bereits vor Eintrag/Fehlerlöschung und erstem Await die vollständige
aktuelle Bereitschaft prüfen; den bestehenden letzten Guard erhalten. Eigene grüne
Gegenrichtungen für einen neuen Klick nach Writable-Beleg oder Reconnect erhalten.
Die vier gesunden Null-Send-Assertions stehen unverändert rot zur Nachprüfung bereit.

## Bestätigte Gegenrichtungen und erhaltene Verträge

- Synchrone Sperre nach key+epoch, Root-/Tip-Projektion, Respond/Lock-Kollision und
  unabhängige zweite Anfrage bestehen. requestStates enthält nur key/epoch/status.
- Nach autorisiertem Send behält der ursprüngliche Runtime die gemeinsame Aktion.
  Zwölf eigene Varianten für Respond/Lock, gleiche/verschiedene Alias-ID und
  success/not_sent/unknown nach Ausstieg von A erhalten Bs richtigen Zustand.
- Drei eigene gleichnamige Ersatzeinträge mit identischem Key und identischer
  Epoche überstehen alte success/not_sent/unknown-Fortsetzungen unverändert.
- Respond mit weiterhin offenem Snapshot bleibt pending. Lock ohne frischen
  lockedAnswers-Beleg bleibt gesperrt; null und letzter Lock sind berücksichtigt.
  Kein lokaler Antwortwert wird als Bestätigung projiziert.
- Secretverlust hält ausschließlich flüchtige Transportwerte. Tatsächliche
  GatewayPending-Einträge enthalten nur op/resolve/reject/timer. Draft, Viewmodel
  und Store bleiben ohne Dummysecret und Retryantwort; ausdrückliches resendUnknown
  erzeugt keinen Secret-Replay. Offline gestartete Aktionen senden in den geprüften
  Drop/Reconnect-Fällen ebenfalls nicht nach; ein neuer aktueller Klick funktioniert.
- Bestandsfälle bestätigen letzte Guards für Cancel, Owner-/Session-/Epochenwechsel,
  Hidden/Parken/Dokumentsichtbarkeit, Flag-off/OffOn, Grenzen, Dispose, StrictMode,
  Reconnect/Resync und ausbleibende tokengetriebene Owner-/Sidebar-Neupublikation.

Die präzisierte eigene Phase-3-Secretregression ist fachlich richtig: Ihr Request
liegt jetzt tatsächlich offen im öffentlich validierten Snapshot. Unknown wird im
gemeinsamen requestStates erwartet, draft.unknown und unknownSend bleiben leer.
Die bisherige Assertion gegen Replay nach Reconnect bleibt erhalten. Das neue
unabhängige Secret-Repro prüft zusätzlich den echten Pending-Metadatenspeicher.
Keine externen Altassertionen oder Altberichte verändert.

## Tatsächlich ausgeführte Prüfungen

- 25 nonvisuelle Featuredateien: **308/308 grün**, einschließlich der 51 neuen Fälle.
  Ausführung im Webverzeichnis mit chat-*.test.ts, gateway-client.test.ts,
  organization-*.test.ts, sidebar-domain und beiden Chat-/Sidebar-Hooktests.
- Alle 16 unveränderten Phase-4-Reprodateien: **172/172 grün**, ausgeführt mit deren
  bestehender temp/hermes-v2/phase4-client-review/vitest.config.mjs.
- Zwei neue unabhängige Dateien: **26 grün, 4 rot von 30**, sämtliche roten Fälle M1.
  Reproduktion: pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase5-client-review/vitest.config.mjs --reporter=verbose.
- Vollständiges pnpm typecheck zuletzt **grün**, einschließlich Contracts, Server,
  Web und E2E. Der erste Lauf scheiterte ausschließlich an vier angekündigten
  GLM-UIfixturestellen. Nach deren paralleler Korrektur vollständig wiederholt;
  keine UI-Datei selbst repariert oder damit visuell freigegeben.
- Separates pnpm typecheck:e2e sowie gezieltes ESLint der nonvisuellen Chat-/Gateway-/
  Organisations-/Sidebar-Dateien und beiden Hooks mit --max-warnings=0 **grün**.
- pnpm architecture:file-lines zuerst **grün** (1912 Dateien). Abschließender Lauf
  **rot**, ausschließlich wegen Roots parallel erzeugter Browserfixture
  temp/hermes-v2/install-browser-fixture.generated.js mit 7197 Zeilen. Fremdes
  generiertes Artefakt unberührt; kein zusätzlicher Clientbefund. Alle eingefrorenen
  Clientdateien und eigenen handgeschriebenen Repros unter 400 Zeilen, eigene Tests
  76/98 Zeilen; Bericht unter 160. Kein abschließendes globales Architekturgrün.
  282 Produkt-/Vertrags-/Altbericht-/Reprodateien während des Reviews unverändert.
  Die parallel gepflegte Root-Fortschrittsdatei ist ausdrücklich ausgenommen.

Alle neuen temporären Repros, Logs und Hashbelege liegen ausschließlich unter
temp/hermes-v2/phase5-client-review/. Einzige neue dauerhafte Datei ist dieser Bericht.
Keine Produktänderung, Browser, Dienste, Ports, Previews, Tmux, Slots, Nutzerdaten,
echten Coreaufrufe, echten Secrets, Gitoperationen oder weiteren Agents.

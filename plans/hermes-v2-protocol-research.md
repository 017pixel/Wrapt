# Hermes V2: Protokoll-Recherche

Stand: 16.10.2026. Phase 0, ausschließlich Recherche. Keine Dienste gestartet,
beendet oder neu gestartet; keine neue Hermes-Installation, Datenbank oder Home-Struktur.

## Entscheidung

V2 verbindet den Wrapt-Server mit dem **bereits laufenden Dashboard-Backend** über
`ws://127.0.0.1:9119/api/ws`. Dieses Backend enthält denselben `tui_gateway` wie
`hermes serve`. Ein zusätzlicher Serve-Prozess ist für diesen Rechner unnötig.
Hermes bleibt Eigentümer von Sessions, Transkripten und Ausführungen.

Installierter Checkout: `/home/bbecker/.hermes/hermes-agent`, sauberer Git-Status,
Commit `07908be267f54f498230b3aae0f27c3f27d8c973` vom 09.10.2026.
Konfiguriertes Home: `/home/bbecker/.hermes`; Python: `venv/bin/python` im Checkout.
`hermes-dashboard.service` und `hermes-gateway.service` sind aktive User-Units.
Dashboard bindet ausschließlich `127.0.0.1:9119`. Im installierten Server ist
`DESKTOP_BACKEND_CONTRACT = 8` definiert; die Paketversion `0.0.0` ist kein
geeigneter Kompatibilitätsmarker.

**Wichtig:** Der konfigurierte Messaging-Gateway-Dienst und der `tui_gateway`
im Dashboard sind verschiedene Prozesse, aber verwenden dieselbe Installation
und Datenbasis. Nie denselben gespeicherten Chat in zwei unabhängigen Prozessen
zum Schreiben übernehmen. Die Hermes-Leases schützen diese Grenze.

## Lokaler Vertrag und Quellen

Alle folgenden Methoden-/Eventtabellen stammen aus dem installierten Checkout,
direkt aus den Pydantic-Verträgen und den zugehörigen Handlern, nicht aus einer
vermuteten Desktop-API. `?` bezeichnet optional; `sid` eine Live-Session-ID,
`storedId` die dauerhafte Hermes-Session-ID. Beide IDs getrennt halten.

| Bereich | Installierte Quelldateien unter dem Checkout |
| --- | --- |
| Deklarierte Verträge | `tui_gateway/contracts/{sessions,prompt_voice,common,events,server_requests}.py` |
| Discovery/Model-Verträge | `contracts/{tools_commands,config_free_tier_control,profiles_vault_complete_foreign_subagents}.py` unter `tui_gateway/` |
| Session/Create/Resume/History/Replay | `tui_gateway/methods_session.py`, `session_history.py`, `event_replay.py` |
| Unterbrechen/Steuern | `tui_gateway/methods_session_interrupt.py`, `methods_prompt.py` |
| Transport/Fanout | `tui_gateway/ws.py`, `transport.py`, `session_transports.py` |
| Requests | `tui_gateway/server_requests.py`, `methods_prompt.py`, `agent_callbacks.py` |
| Commands/Skills | `tui_gateway/methods_tools.py`, `methods_slash.py`, `slash_worker.py`, `hermes_cli/commands.py` |
| Models | `tui_gateway/methods_complete.py`, `methods_config_set.py`, `model_switch.py`, `hermes_cli/model_switch.py` |
| Cron | `tui_gateway/methods_tools.py`, `hermes_cli/web_routers/cron.py` |
| Memory | `hermes_cli/web_routers/ops.py`, `memory_providers.py`; kein Memory-RPC im TUI-Katalog |
| Anhänge | `tui_gateway/methods_prompt.py`, `prompt_attachments.py` |
| Subagents/Prozesse | `tui_gateway/methods_subagents.py`, `tool_progress.py`, `methods_tools.py` |
| WS-Upgrade/Auth | `hermes_cli/web_server_chat.py`, `web_routers/chat_ws.py`, `web_server.py` |
| Fremde Live-Owner | `hermes_cli/shared_session_attach.py`, `tui_gateway/session_lifecycle.py` |
| Generierter TS-Vertrag | `apps/shared/src/gateway-contract.generated.ts`, `gateway-events.ts` |

## Transport, Handshake und Auth

Frames sind JSON-RPC 2.0. Stdio ist NDJSON; der aktuelle WS-Handler parst je
WebSocket-Message ein JSON-Objekt (abschließende Newlines sind unproblematisch).
Keine NDJSON-Batches in einer ausgehenden WS-Message senden.
Nach Upgrade kommt eine Notification:

```json
{"jsonrpc":"2.0","method":"event","params":{"type":"gateway.ready","payload":{"heartbeat":true,"change_events":true,"replay_epoch":"…","skin":{}}}}
```

Danach pro Verbindung `client.capabilities {server_requests:true}` aufrufen.
Ohne diese Anmeldung beantwortet Hermes offene Nutzerfragen sofort als
unbeantwortbar, statt auf eine ältere UI zu warten. `ping {}` ergibt `{pong:true}`;
`gateway.capabilities {}` ergibt `{per_session_exclusive_submit:boolean}`.
Das ist **keine** vollständige Liste verfügbarer RPCs und keine Protokollversion.
Der separate WS-Heartbeat `gateway.ping {}` ergibt `{ok:true}` direkt im
Transport-Readloop, auch wenn der RPC-Dispatcher beschäftigt ist.

Loopback-Auth erwartet `?token=<Dashboard-Session-Token>` beim WS-Upgrade.
Wrapt besitzt bereits `apps/server/src/hermes/token.ts` mit `HermesSessionToken`.
Token ausschließlich auf dem Server laden und verwenden; Upstream-URL niemals
loggen oder im Browser ausliefern. Bei Neustart Token invalidieren/neu laden.
Der Backend-Handshake prüft zusätzlich Host, Origin und lokalen Client.

Gated Hermes-Instanzen verwenden andere Regeln: kurzlebige WS-Tickets, interne
Credentials oder verifizierte Session-Access-Tokens. Ein Loopback-Token ist dort
absichtlich ungültig. Diesen Unterschied als Diagnosefehler behandeln.

## Methodenmatrix: Sessions und Chat

| Methode | Parameter | Ergebnis / Semantik |
| --- | --- | --- |
| `session.create` | `cwd?`, `model?`, `provider?`, `reasoning_effort?`, `title?`, `profile?`, `idempotency_key?`, `close_on_disconnect?` | `{session_id,stored_session_id,message_count,messages,info}`; neue dauerhafte Hermes-Session |
| `session.list` | `title?`, `limit?`, `profile?`, `include_hidden?` | `{sessions:[{id,resolved_id?,title,preview,source,started_at,message_count,_lineage_root_id?}]}`; gespeicherte Chats; keine Offset/Cursor-Pagination |
| `session.active_list` | `profile?`, `current_session_id?` | `{sessions:[{id,session_key,current,title,preview,model,status,started_at,last_active,message_count}]}`; nur live in diesem Backend |
| `session.resume` | `session_id:storedId`, `lazy?`, `defer_history?`, `omit_messages?`, `eager_build?`, `close_on_disconnect?` | `{session_id,messages,message_count,info,resumed?,session_key?,stored_session_id?,running?,status?,inflight?,queued?,open_requests?,pending_approval?}` |
| `session.activate` | `session_id:sid`, `omit_messages?`, `cols?` | Live-Snapshot wie Resume; hängt Client an bestehende Session |
| `session.history` | `session_id:sid`, `profile?` | `{count,messages}`; kein paginierter History-Vertrag |
| `session.events.since` | `session_id:sid`, `last_seen?` | `{events,latest_seq,truncated,count,epoch,open_requests}` |
| `session.title` | `session_id:sid`, `title?` | `{title,session_key?,pending?}`; ohne Titel abfragen |
| `session.usage` | `session_id:sid` | Token-/Kontext-/Kosten-/Subagent-Zähler; Felder optional |
| `session.status` | `session_id:sid` | `{output:string}`; formatierter Text, kein strukturierter Working-Snapshot |
| `prompt.submit` | `session_id:sid`, `text`, `queued?` | `{status:streaming\|queued\|steered\|redirected,user_row_id?}`; normale Turns nicht automatisch nach Transportfehler wiederholen |
| `session.steer` | `session_id:sid`, `text` | `{status,text}`; Korrektur an laufenden Turn |
| `session.interrupt` | `session_id:sid` | `{status,interrupted?,turn_isolation?}`; Hermes entscheidet über Unterbrechung |
| `prompt.background` | `session_id:sid`, `text` | `{task_id}`; Ergebnis als `background.complete` |
| `session.close` | `session_id:sid` | `{closed,messages?}`; aktive Session schließen, kein notwendiger UI-Navigationsschritt |
| `session.delete` | `session_id:storedId`, `profile?` | `{deleted}`; destruktiv, aktive Writer werden abgewiesen |

`session.open` und `session.connect` existieren im installierten Vertrag nicht.
`session.resume` findet einen Live-Chat im selben Profil und verwendet ihn wieder;
`session.activate` benötigt bereits dessen Live-ID. `session_transports.py` hält
eine additive FanoutTransport-Mitgliedschaft. Zweiter Tab ersetzt den ersten
nicht. Wechsel des fokussierten Chats schließt dessen laufende Arbeit nicht.

Die kompakte RPC-Sessionliste liefert weder vollständige CWD-/Provider-Angaben
noch den vollständigen globalen Working-Zustand. Bestehende Wrapt-REST-Summaries
ergänzend verwenden; keine fehlenden Agent-Zustände aus Text erraten.

## Events und Wiederaufbau

Envelope: `{jsonrpc:"2.0",method:"event",params:{type,session_id?,seq?,payload?}}`.

| Event | Payload / Verwendung |
| --- | --- |
| `message.start` | kein Payload; Beginn eines Assistant-Abschnitts |
| `message.delta` | `{text,rendered?,verbose?}`; ausschließlich `text` als Inhalt übernehmen |
| `reasoning.delta`, `thinking.delta`, `reasoning.available` | `{text,…}`; nur gelieferten sichtbaren Inhalt zeigen |
| `message.interim` | `{text,already_streamed}`; verhindert doppeltes Anhängen |
| `message.complete` | `{text?,usage?,status?,reasoning?,error?,recoverable?,partial?,persisted_turn?}`; authoritative Abschluss |
| `tool.generating` | `{name}`; besitzt **keine tool_id**, daher nicht als fertigen Toolcall speichern |
| `tool.start` | `{tool_id,name,args?,args_text?,context?,preview?,labels?}` |
| `tool.complete` | `{tool_id,name,args?,duration_s?,result?,summary?,result_text?,inline_diff?}`; mit Start über tool_id zusammenführen |
| `session.info` | Model/Provider, CWD, running, turn_started_at, stored_session_id, version, desktop_contract, usage, … |
| `status.update` | `{kind,text}`; Statushinweis, keine vollständige State-Machine |
| `session.usage`, `session.title` | Usage bzw. `{title,…}` aktualisieren |
| `request.cancel` | `{id,method,reason}`; exakt passende Request-Card entfernen |
| `error` | `{message}`; technische Fehler redigieren |
| `sessions.changed`, `cron.changed` | globale Invalidierung, Summary/Job-Liste neu laden |
| `subagent.spawn_requested/start/progress/thinking/tool/complete` | strukturierte Goal-/Task-/Subagent-Daten, IDs teilweise optional |
| `background.complete`, `btw.complete` | `{task_id,text,question?}` |
| `connection.request/update` | eigener strukturierter Operation-Flow; aktuelle Connection-UI ist nicht nur ein `connection`-srq |

History-Zeilen enthalten `role,text?,content?,tool_call_id?,row_id?,timestamp?,
display_kind?,display_metadata?,name?,args?,reasoning?`. `display_kind:hidden`
nicht als Usernachricht darstellen; Prozessmarker anhand strukturierter Metadaten
rendern. Durable `row_id` für spätere Edit/Regenerate-Funktionen bewahren.

Replay verwendet monotone Sequenzen pro **Live-ID und Prozess-Epoche**. Dedupe
auf `(epoch,sid,seq)`, nicht nur Text. Ring ist begrenzt: 512 Events / 4 MiB je
Session, 64 Sessions / 64 MiB insgesamt. Bei `truncated:true` oder neuer Epoche
History und Live-Snapshot nachladen. `inflight` enthält Usertext, bisherigen
Assistanttext, Streaming, Korrekturen und ggf. Fehler; kein vollständiges
verlorenes Tool-Lifecycle-Protokoll. Offene Fragen aus `open_requests` reparieren.
Tokens nicht noch einmal über eine bereits rekonstruierte Inflight-Basis hängen.

## Server→Client Requests: exakte Antwortformen

Request-IDs sind Strings `srq-<12 hex>`. Alle Parameter enthalten `session_id`.
Antwort als JSON-RPC **Response mit derselben ID**, nicht als neues RPC:

```json
{"jsonrpc":"2.0","id":"srq-example","result":{"choice":"once"}}
```

| Methode | Zusätzliche Parameter | Erlaubte Antwort |
| --- | --- | --- |
| `approval` | `request_id,command,description,choices`, optional `allow_session,allow_permanent,tool_name,…` | `{choice:"once"\|"session"\|"always"\|"deny",all?}`; UI nur tatsächlich angebotene choices erlauben |
| `clarify` | `questions:[{qid,question,choices?,multi_select}],answers?` | `{answers:{[qid]:string\|null}}`; `{}` bricht ab; multi_select bleibt im Vertrag ein Stringwert |
| `sudo` | `command` | `{value:string}`; leer = übersprungen |
| `secret` | `env_var,prompt,metadata?` | `{value:string}` |
| `vault.unlock_prompt` | `backend,display_name` | `{value:string}` |
| `vault.code` | `site?,hint?` | `{value:string}` |
| `vault.save_login` | `origin,site` | `{value:string}` mit JSON `{identifier,password}` |
| `setup_choose` | `kind,question,options?,multi_select?,preselected?` | `{picked?:string\|string[]\|null,label?,said?}` |
| `terminal.read`, `preview.read` | `start?,count?` | `{value:string}` mit JSON-Text; nur echte verfügbare Oberfläche |
| `window.read`, `preview.act`, `tour` | methodenspezifisch | `{value:string}`; für V2 zunächst nicht implementieren |
| `display.install.sudo` | methodenspezifisch | Masked value; zunächst nicht implementieren |

Unbekannte Methoden mit JSON-RPC-Error `-32601` ablehnen. Für nicht sichtbare
Desktopfenster gibt es `4404` als besondere Decline-Semantik; nicht blind alle
Nutzerfragen so beantworten. `clarify.lock {request_id,question_id,answer}`
liefert `{status,remaining?}` und ermöglicht frühe Locks, `null` überspringt.
Legacy-Methoden `approval.pending/received/respond` existieren zusätzlich.

**Sicherheitsgrenze:** `server_requests.resolve_response` akzeptiert die erste
Antwort und verwirft spätere/stale IDs; es erzwingt selbst keine vollständige
Response-Schemavalidierung oder Wrapt-Principals. Wrapt muss pro Nutzer/Session
die erlaubten offenen IDs sowie choices/qids prüfen. Nach Antwort einer anderen
Oberfläche können lokale Karten kurz stale sein; UI deaktivieren und resyncen.
Secrets nur flüchtig halten, nach Submit löschen; keine Response-Payloads loggen.

## Models, Commands, Anhänge und Nebenflächen

| Methode | Parameter / Ergebnis | Grenze |
| --- | --- | --- |
| `model.options` | `{session_id?,refresh?,include_unconfigured?,explicit_only?}` → `{providers:[{slug,name,models,capabilities?,pricing?,authenticated?,…}],model?,provider?}` | Serverprojektion auf Pickerfelder; keine Credentials durchreichen |
| `config.get` | `{key,session_id?}` → keyabhängige Werte | nur eng erlaubte Keys, **kein beliebiges full/config/env** |
| `config.set` | `{key:"model",value:"provider:model --session",session_id}` → `{key,value,scope,confirm_required?,confirm_message?,deferred?}` | `--session` verhindert globale Hermes-Persistenz, deren Default profilabhängig sein kann |
| `config.set` | `key:"reasoning"\|"fast",value,session_id,scope:"session"` | nur wenn Modellkatalog Fähigkeit bestätigt |
| `commands.catalog` | `{session_id?}` → `{pairs,sub,canon,commands,categories,skills,skill_count,warning?}` | dynamische Skills inklusive; Katalog bedeutet nicht „jede Aktion blind ausführen“ |
| `complete.slash` | `{text,session_id?}` → `{items,replace_from?}` | vorhandene Argument-/Skill-Completion |
| `command.dispatch` | `{session_id,name,arg?}` → `{type,output?,message?,display?,target?,status?}` | `type:skill` bedeutet message über normalen prompt.submit senden |
| `slash.exec` | `{session_id,command}` → Dispatch-/Ausgabefelder | Legacy-SlashWorker; UI-lokale Lifecyclebefehle explizit abbilden |
| `image.attach_bytes` | `{session_id,content_base64,filename?}` → `{attached,path?,count?,name?,width?,height?}` | serverseitiges Größenlimit vor Base64-Dekodierung |
| `file.attach` | `{session_id,data_url,name?}` → `{attached,name,path,ref_path,ref_text,uploaded}` | keine frei vom Browser angegebenen Host-Dateipfade |
| `pdf.attach` | `{session_id,content_base64,filename?,first_page?,last_page?}` | PDFs werden zu Bildseiten; getrennte Limits |
| `subagent.list` | `{session_id}` → `{subagents,delegations}` | Live-Roster, keine Fantasie-/Logzustände |
| `subagent.steer` | `{session_id,subagent_id,text}` → `{status,subagent_id,text}` | queued ist Annahme, keine garantierte Zustellung |
| `subagent.interrupt` | `{session_id,subagent_id}` → `{found,subagent_id}` | exakte Session-/Transport-/Generations-Autorität |
| `subagent.tail` | `{session_id,subagent_id}` → `{available,text,truncated,subagent_id}` | maximal letzte 16 KiB, nur gewähltes Detail laden |
| `process.list/kill` | Session und ggf. Prozess-ID → strukturierter Snapshot | nie pauschales `process.stop` für einzelnen Chat verwenden |
| `cron.manage` | `{action,name?,schedule?,prompt?,repeat?,deliver?,…}` → `{success?,jobs?,job?,error?,…}` | vorhandene Wrapt-Cron-REST-Integration bevorzugen |
| `skills.manage/reload` | verwalteter Katalog/Reload | bestehende Wrapt-Skillsseite integrieren |

Cron-REST unterstützt List/Detail/Runs/Create/Edit/Pause/Resume/Trigger/Delete
unter `/api/cron/jobs`. `/api/memory` liefert Providerstatus und Dateigrößen,
keinen vollständigen Memory-Editor oder Pending-Writes-Katalog. Bestehende
REST-/Adminflächen verwenden und diese Lücke nicht mit einem zweiten Store füllen.
Kein dediziertes Queue-List/Cancel-RPC im installierten Legacy-Vertrag. Resume
liefert nur `queued:{user}`; vollständige FIFO-Anzeige nicht vortäuschen.

## Drift zum aktuellen Upstream

Zusätzlich geprüftes upstream-main: `9c002cb941de1e1708294d0cd58e060b6a417b5e`
vom 16.10.2026, 14:09 UTC. `contracts/canonical*.py` deklariert inzwischen
einen getrennten nativen `hermes-gateway-v1`-Vertrag. Namen wie `prompt.submit`,
`session.resume` und `session.events.since` können dort andere Shapes haben.
Neu sind durable Admission-Receipts, Generation-Fencing, `prompt.receipt/cancel`,
`prompt.resolve_unknown` und `session.mutate`. Nicht mit dem installierten
Legacy-Vertrag vermischen. Update weder durchführen noch automatisch fordern.
Für den jetzigen Release Legacy-Adapter explizit prüfen, unerwartete Canonical-
Snapshots verständlich ablehnen; spätere Adapterversion separat implementieren.

Primärquellen zum Vergleich: [TUI-Anleitung](https://github.com/NousResearch/hermes-agent/blob/main/tui_gateway/AGENTS.md),
[Integration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md),
[Canonical](https://github.com/NousResearch/hermes-agent/blob/9c002cb941de1e1708294d0cd58e060b6a417b5e/tui_gateway/contracts/canonical.py),
[Canonical-Sessions](https://github.com/NousResearch/hermes-agent/blob/9c002cb941de1e1708294d0cd58e060b6a417b5e/tui_gateway/contracts/canonical_sessions.py),
[Desktop](https://github.com/NousResearch/hermes-agent/blob/07908be267f54f498230b3aae0f27c3f27d8c973/website/docs/user-guide/desktop.md).

## Sichere Umsetzung und echter Smoke-Test

1. Authentifizierte Wrapt-WS-Route mit Same-Origin-Upgrade und Payload-Limits;
   enger Methoden-/Parameter-Allowlist statt generischem privilegiertem RPC-Proxy.
2. Pro authentifiziertem Wrapt-Principal ein wiederverwendbarer Upstream-Manager;
   Browser-Tabs abonnieren Sessions. Niemals Upstream-Session beim UI-Unmount schließen.
3. Upstream-Neuverbindung mit Backoff, capabilities, History/Snapshot/Replay;
   Browser-Disconnect darf laufende Arbeit anderer Tabs nicht unterbrechen.
4. Servervalidierte CWD-Projektgrenze; `profile`, interne Surface-/Display-/Hidden-
   Parameter und freie Commands nicht ungeprüft vom Browser übernehmen.
5. Model, Approvals und Secrets nur über explizite fachliche Adapteroperationen.
6. Realer Smoke gegen vorhandenes 9119-Backend: Token intern laden, Ready/Ping/
   Catalog/Models lesen, neue klar benannte Smoke-Session im bestehenden Home
   erstellen, eine harmlose Nachricht senden, Streaming/History prüfen.
7. Zweiten Socket an dieselbe Session hängen, Reconnect/Replay/Stop prüfen;
   keine bestehenden Nutzer-Sessions als Testmaterial übernehmen.
8. Terminal-Hermes parallel mit separater Smoke-Session; gemeinsame gespeicherte
   History sichtbar prüfen. Gleichzeitiger Zugriff auf exakt denselben Live-Chat
   nur über kooperativen Shared-Runtime-Handshake; fremde Leases niemals entfernen.
9. Klassische UI bleibt erreichbar. Eigene Testsession nach Abschluss gezielt
   schließen; Löschen nur bei sicher identifizierter selbst erstellter Session.

Research hat keinen Modellturn oder Live-WS-Test ausgeführt. Tatsächliche
Handshake-/Turn-Kompatibilität des laufenden Prozesses bleibt ein Phase-2-Gate;
Dateistand und laufender Prozess können nach Hermes-Updates auseinanderliegen.

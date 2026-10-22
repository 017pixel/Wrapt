# Hermes V2: implementierungsfertiger Backend-Vertrag

Stand 16.10.2026. Grundlage: `hermes-v2-inventory.md`, PASS-Gate Runde 2,
erstes Review H3/H4/M2–M6 und installierte Protokollmatrix. Dieses Dokument
bereitet Phase 2 vor. Die unabhängigen Module und Fake-Tests dürfen parallel
vorbereitet werden; Registrierung und Runtime-Integration bleiben bis zum
vollständigen Phase-1-PASS und dem separaten Sicherheitsreview gesperrt.

## Scope und Dateien

Implementierung ausschließlich in neuen `apps/server/src/hermes/v2/*`, neuen
`packages/contracts/src/hermes-v2*.ts`, Export in `packages/contracts/package.json`
und kleiner Registrierung in `apps/server/src/app/routes.ts`. Jede Datei <400
Zeilen. Kein alter Contracts-Barrel, ACP-Code oder Runtime-Konfiguration wächst.
UI-Metadaten und deren SQLite-Tabelle implementiert der Parent separat.

Contracts-Subpath `@wrapt/contracts/hermes-v2`: `types:./src/hermes-v2.ts`,
`default:./dist/hermes-v2.js`. Feature-Barrel exportiert aus
`hermes-v2-messages.ts`, `hermes-v2-sessions.ts`, `hermes-v2-events.ts`,
`hermes-v2-requests.ts`, `hermes-v2-catalog.ts`. Gemeinsame Typen per `z.infer`.
Keine neue Abhängigkeit nötig: Zod 4, ws, vorhandene Sendqueue/Identity/Pfadprüfung.

Servermodule, jeweils fachlich getrennt:

- `routes.ts`: Upgrade/Auth, Parse/Dispatch, Socket-Abos und Browser-Sendqueue.
- `pool.ts`: Singleton pro Principal, globale Obergrenze, Shutdown, optionale Hooks.
- `manager.ts`: Verbindungszustand, Subscription-/Session-Koordination.
- `upstream.ts`: WS/Token, JSON-RPC-Korrelation, Timeouts, Heartbeat, Backoff.
- `upstream-schemas.ts`: tatsächlich benötigte Legacy-Reply-/Event-Schemas.
- `session-service.ts`: Create/Resume/Mapping/CWD und History-Laden.
- `cwd-policy.ts`: exakte IDs, reale Roots, vor/nach Attach und vor Mutation.
- `request-registry.ts`: offene Requests, sichtbare Clients, atomare Claims.
- `request-validation.ts`: Methoden-/Choice-/QID-spezifische Antworten.
- `normalize-{sessions,history,events,catalog}.ts`: explizite Projektionen.
- `operations.ts`: fachliche Operationen auf engem Upstream-Methodensatz.
- `policy.ts`: zentrale Protokoll-/Sicherheitslimits, vorhandene Settings lesen.
- Benachbarte Unit-/Integrationsdateien, eigene Fake-WS-Gateway-Fixture.

## Browser-Endpunkt und Envelope

Einziger neuer Chattransport: `/api/v1/hermes/v2/gateway`; registrierter Pfad
`/hermes/v2/gateway` unter bestehendem `/api/v1`-Prefix. Same-Origin-WS-Upgrade
via `isWebSocketOriginAllowed`, Principal via `resolveWorkbenchUser` mit
bestehenden Optionen. Feature-Flag ist browserlokale Auswahl, keine Autorisierung.
Hermes muss serverseitig enabled sein. Principal nie aus Payload/Query lesen.

Alle Browserobjekte `z.strictObject`; unbekannte Keys/Operationen ablehnen.
IDs: nichtleere ASCII-Kennung `[A-Za-z0-9._:-]`, maximal 200; zusätzliche exakte
Stored-ID-Auflösung siehe CWD. `id` ist browserseitige UUID pro Operation.
`sessionId` bezeichnet **immer Stored-ID**, niemals eine frei wählbare Live-ID.

```ts
type ClientMessage = { v: 1; id: string } & Operation;
type ServerMessage =
  | { v: 1; type: "connection"; state: ConnectionState; epoch: string | null }
  | { v: 1; type: "result"; id: string; op: OperationName; data: OperationResult }
  | { v: 1; type: "error"; id: string | null; code: ErrorCode;
      message: string; retryable: boolean; outcome: "not_sent" | "unknown" }
  | { v: 1; type: "event"; event: V2Event };
```

In Zod sind Result-Varianten nach `op` diskriminiert: kein unbekanntes freies
`data`. `ConnectionState`: connecting, online, reconnecting, offline, incompatible.
Fehlercodes: INVALID_MESSAGE, FORBIDDEN, PROJECT_FORBIDDEN, SESSION_NOT_FOUND,
SESSION_UNAVAILABLE, STALE_REQUEST, REQUEST_CLAIMED, UNSUPPORTED_COMMAND,
MODEL_CONFIRM_REQUIRED, RATE_LIMITED, GATEWAY_OFFLINE, PROTOCOL_MISMATCH,
PAYLOAD_TOO_LARGE, OPERATION_FAILED. Nur generische/redigierte Fehlermeldungen;
keine Error-Stacks, Upstream-URLs, Configwerte oder Secret-Antworten ausgeben.

| `op` | Zusätzliche Felder | Result `data` |
| --- | --- | --- |
| `sessions.list` | `query?:string<=200`, `limit?:1..100` | `{sessions:SessionSummary[],hasMore:boolean}`; hasMore ist Anzeige weiterer Liste, kein erfundener Cursor |
| `session.create` | `projectId:string|null,title?:string<=200,selection?:ModelSelection` | `{snapshot:SessionSnapshot}` |
| `session.subscribe` | `sessionId`, `cursor?:{epoch,seq}` | `{snapshot:SessionSnapshot}`; Replay wird atomar in Snapshot integriert |
| `session.unsubscribe` | `sessionId` | `{unsubscribed:true}`; beendet nur dieses Browser-Abo |
| `history.read` | `sessionId,limit?:1..200,offset?:0..1000000` | `{sessionId,messages:Message[],offset,returned,hasMore}` |
| `message.submit` | `sessionId,text:string(1..200000),mode?:"normal"|"queue"` | `{status:"streaming"|"queued"|"steered"|"redirected",userRowId:number|null}` |
| `session.stop` | `sessionId` | `{status:string}` aus installiertem Interrupt-Enum projizieren |
| `session.steer` | `sessionId,text:string(1..200000)` | `{status:string}` |
| `catalog.read` | `sessionId` | `{commands:Command[],models:ModelCatalog}` |
| `model.select` | `sessionId,selection:ModelSelection,confirmed?:boolean` | `{selection,deferred:boolean,confirmation:string|null}` |
| `request.respond` | `sessionId,requestKey,epoch,response:RequestResponse` | `{status:"sent"|"settled"}`; keine unbelegte Annahme „Hermes akzeptiert“ |
| `request.lock` | `sessionId,requestKey,epoch,questionId,answer:string|null` | `{remaining:string[],settled:boolean}` |
| `subagents.read` | `sessionId` | `{subagents:Subagent[],background:BackgroundProcess[]}` |

Nur subscribed Sessions dürfen mutiert werden. Create abonniert die neue
Session automatisch. Jede Sessionroute prüft erneut bekannte Stored-/Live-Zuordnung.
Phase 2 enthält Transport/Contracts; UI-komplette Commands/Anhänge/Subagent-Control
werden später als weitere **fachliche** Operationen ergänzt, kein raw RPC-Escape.

## Exakte normalisierte Daten

Zeitwerte als Unix-Millisekunden, unbekannte Werte `null`, IDs stabil; keine
zeitbasiert geratenen Laufzustände. Schemaarrays haben Mengen-/Stringlimits.
ModelSelection = `{provider:string<=100,model:string<=200}`; keine Flags im Modell.
Provider/Modell müssen aus dem aktuellen serverseitigen Katalog stammen.

```ts
type SessionSummary = {
  id: string; title: string; preview: string; source: string;
  model: string | null; provider: string | null; cwd: string | null;
  projectId: string | null; messageCount: number; updatedAt: number | null;
  running: boolean | null; startedAt: number | null; draft: boolean;
};
type SessionSnapshot = {
  session: SessionSummary; epoch: string; cursor: number;
  writable: boolean; blockedReason: string | null;
  selection: ModelSelection | null; reasoningEffort: string | null;
  running: boolean | null; turnStartedAt: number | null;
  inflight: Inflight | null; queuedText: string | null;
  requests: UserRequest[]; messages: Message[];
};
type Inflight = {
  user: string; assistant: string; streaming: boolean;
  displayKind: string | null; displayText: string | null;
  corrections: string[]; error: string | null; recoverable: boolean;
};
type Message = {
  id: string; rowId: number | null;
  role: "user" | "assistant" | "tool" | "system";
  text: string; reasoning: string | null; timestamp: number | null;
  toolId: string | null; toolName: string | null;
  input: string | null; displayKind: string | null;
};
```

Initialer Snapshot lädt höchstens die jüngsten 200 Historyzeilen über vorhandenes
Dashboard-REST `/api/sessions/<exactId>/messages?limit=200&order=latest`, nicht die
unbegrenzte TUI-History. Dort existieren echte `offset/limit/order`-Parameter.
Weitere Seiten über `history.read`; row_id-Dedupe bei neu eintreffenden Zeilen.
Interne hidden-Marker nicht rendern; display_metadata auf display_text projizieren.
Für JSON-Toolinputs/-outputs nur begrenzten serialisierten Text ausgeben; `rendered`
und rohe HTML-/Base64-Objekte nicht an UI weiterreichen. Kein Inhalt wird als HTML
vertrauenswürdig markiert. Derselbe Normalizer für Snapshot/History/Replay.

Message-ID: bevorzugt `row:<rowId>`, Toolkarten `tool:<tool_id>`, pro laufendem Turn
serverseitig stabiler `turnId`; fehlende Live-ID niemals über Nachrichtentext dedupen.
Fallback-History-ID über Stored-ID + Historyposition + Rolle, nicht Date.now().

Command = `{key,label,description,kind:"builtin"|"skill"|"unsupported",
action:"new"|"resume"|"stop"|"model"|"help"|"queue"|"steer"|"title"|"skill"|null,
argumentHint:string|null,disabledReason:string|null}`.
`pairs/canon/categories/skills/commands` dienen nur Discovery, keine Ausführung.
ModelCatalog = `{providers:[{id,label,available,models:[{id,label,reasoningEfforts:
string[],fast:boolean,priceInput:string|null,priceOutput:string|null}]}],current:
ModelSelection|null}`. Explizite Feldprojektion entfernt `api_url`, `auth_type`,
`key_env`, Credentials, Rohconfig und interne Usage-/Routingobjekte.

## Events und Reconnect-Snapshot

V2Event hat `{sessionId:string|null,epoch:string,seq:number|null,type,payload}`.
Bekannte fachliche Typen mit je eigenem strikt validiertem Payload:

| V2-Typ | Upstream | Payload |
| --- | --- | --- |
| `message.started` | message.start | `{turnId}` |
| `message.delta` | message.delta | `{turnId,text}` |
| `reasoning.delta` | reasoning.delta/thinking.delta | `{turnId,text}` |
| `message.interim` | message.interim | `{turnId,text,alreadyStreamed}` |
| `message.completed` | message.complete | `{turnId,text,reasoning,status,error,recoverable,usage}` |
| `tool.generating` | tool.generating | `{name}`; noch keine Tool-ID |
| `tool.started` | tool.start | `{toolId,name,input,preview}` |
| `tool.completed` | tool.complete | `{toolId,name,output,durationMs,error}` |
| `session.updated` | session.info/title/usage | vollständige sicher projizierte Sessioninfo bzw. diskriminierte Änderung |
| `request.opened` | srq-Request | `UserRequest` |
| `request.closed` | request.cancel / bestätigter Open-Request-Resync | `{requestKey,reason}` |
| `subagent.updated` | strukturierte subagent.* | `{id,parentId,goal,status,model,startedAt,durationMs,toolCount,lastTool}` |
| `background.completed` | background.complete/btw.complete | `{taskId,text}` |
| `sessions.invalidated` | sessions.changed | `{}` |
| `metadata.invalidated` | Parent-Callback | `{sessionId,revision}` |
| `session.error` | error/Protokollfehler | `{code,message}` |

Neue Epoche macht alte Live-IDs/Sequenzen/Request-Claims ungültig. Jede aktive
Stored-ID erneut lazy resumieren, aktuelle CWD prüfen, Live-ID remappen. Keine
Mutation wiederholen. Gleichbleibende Epoche: session.events.since nutzen;
truncated/neue IDs führen zu Snapshot statt unvollständigem Replay.

Racefreier Bootstrap: Sessionoperationen pro Stored-ID seriell; während Attach
Liveframes puffern; Epoche/letzte Seq bestimmen; History + Inflight + Open-Requests
lesen; Replay bis zur Snapshot-Grenze in Serverzustand falten; einmal Snapshot
senden, danach ausschließlich neuere Frames. Keine Delta-Replays zusätzlich auf
bereits identischen Inflight-Text anwenden. Inflight ist nicht der gesamte
Toolverlauf; fehlende Toolzustände als unbekannt darstellen.

## Session- und CWD-Autorisierung

`pool` wird genau einmal bei Routenregistrierung erstellt; `get(principal)`
liefert denselben Manager für Normalroute, Panel und Standalone. Manager hält
`storedId -> {liveId,epoch,cwd,draft,running,requests,subscribers}` und die inverse
Map. Das ist flüchtiger Transportzustand, keine eigene Chatdatenbank.

1. Create: projectId über vorhandenen ProjectService auflösen; null nutzt den
   vorhandenen Default-CWD. Realpath des Verzeichnisses und aller erlaubten Roots
   prüfen; existierende `terminal/restore.ts::validateCwd` wiederverwenden.
2. Resume: Browser-ID nicht als Titel/Prefix akzeptieren. Dashboard-Detail muss
   exakt dieselbe ID zurückgeben. Bekannte Compression-Tips ausschließlich aus
   geprüften Hermes-Lineage-Feldern/Descendant-Antwort ableiten und vor Attach
   deren CWD separat prüfen. Unbekannte/fehlende CWD sperrt Schreibzugriff.
3. `session.resume` immer mit `lazy:true,omit_messages:true,
   close_on_disconnect:false`; kein eager_build/Auto-Continue für ungeprüfte CWD.
   Resultierende ID, `info.cwd`, stored-ID und `desktop_contract === 8` prüfen.
4. Vor Submit/Steer/Model/Attachment/Skill erneut gespeicherte und Live-CWD
   prüfen; Live-Snapshot über `session.activate {omit_messages:true}` aktualisieren,
   wieder realpath validieren. CWD-Wechsel während Classic-Nutzung berücksichtigen.
5. Bei Ablehnung keine Lease löschen/übernehmen, keinen fremden Turn stoppen.
   Eindeutige readonly/blocked-Antwort; laufende fremde Arbeit bleibt bestehen.

Readonly-Sessions erhalten Summary/History ausschließlich über lesende REST-
Aufrufe, keinen ungeprüften Resume. Snapshot bleibt writable:false; Requests und
Livezustand bleiben unbekannt/leer, kein erfundenes Idle. Titel-Aliase sind verboten.

Das ist eine Pfadgrenze der Workbench, keine Betriebssystem-Sandbox. Symlinks
können nach Prüfung geändert werden; dieses TOCTOU-Risiko dokumentieren.
Der gemeinsame Hermes-Datenbestand ist keine private Mandantentrennung.

## Request-Registry und sichere Antworten

UserRequest = diskriminierte Union, gemeinsame Felder
`{key,epoch,sessionId,method,createdAt}`; Raw-srq-ID bleibt serverintern.
Approval enthält `{command,description,choices:(once|session|always|deny)[]}`;
Clarify `{questions:[{id,text,choices:string[],multiple:boolean}],lockedAnswers}`;
Secret/Sudo/Vault `{label,hint}` ohne Secretwerte. Unbekannte Desktop-Bridges
mit JSON-RPC -32601 beantworten, niemals freie Browser-/Terminalaktionen ausführen.

RequestResponse ist strikt diskriminiert nach kind: approval `{choice}`, clarify
`{answers:Record<qid,string|null>}|{cancel:true}`, secret `{value:string<=65536}`,
setup `{picked:string|string[]|null}`. Keine beliebigen result/error-Objekte.
Methodenbindung kommt aus Registry, nicht aus browserseitiger Behauptung.

Poolweiter Broker hält für `(upstreamOrigin,epoch,liveId,srqId)` den Settlement-
Claim; Sichtbarkeit zusätzlich pro Principal/Browserconnection/Stored-ID.
Damit verhindern auch zwei Principal-Manager lokale doppelte Responses auf den
gemeinsamen Hermes-Core. Schlüssel niemals als Berechtigungsnachweis behandeln.

Vor Claim: aktive berechtigte Subscription, Epoche, offene ID, Methodenschema,
Choice in Originalchoices und QIDs/Options/gelockte Antworten prüfen. Dann ohne
await atomar `open -> claimed(connection,principal)`; erst danach Upstream senden.
Secretantwort weder im Claim noch in Events/Notifications speichern; keine Logs.
Nach Send sofort Open-Requestbestand nachladen; „nicht mehr offen“ bedeutet
settled, nicht nachgewiesen durch diese UI akzeptiert. Classic kann vorher gewinnen.
Requestresponse niemals automatisch wiederholen; Disconnect lässt kein ewiges
Claim-Lock zurück. request.lock bekommt dieselbe Prüfung und Claim-Serialisierung.

## Commands: nachgewiesene Approval-Umgehung vermeiden

`methods_tools.py:1093` dispatcht quick > plugin > bundle > skill > builtin.
Quick-exec verwendet direkt `subprocess.run(...,shell=True)`, Plugins laufen
direkt. Deshalb **kein** `command.dispatch` oder `slash.exec` als freie V2-Operation,
auch nicht nur nach Prüfung eines Skillnamens im Katalog: Kollisionen und
Configänderungen würden den scheinbaren Skill in direkte Ausführung umleiten.

Auch `build_skill_invocation_message` ist kein passiver Expander: skill_view kann
Abhängigkeiten installieren/Secrets anfordern; Skillpreprocessing kann Inline-Shell
ausführen. Daher nicht in einem scheinbar lesenden Helper aufrufen.

Phase 6: sichere Builtins über Domainoperationen: new/resume/stop/model/help,
queue/steer, title. Andere Katalogeinträge bis zur sicheren Semantik disabled.
Skills wählt der Nutzer aus Hermes-Discovery; V2 sendet deren Namen plus seine
Anweisung als normalen Agent-Prompt, der das vorhandene skill_view-Tool verwendet.
Diese reduzierte Invocation und fehlende direkte Inline-Shell-/Quick-/Plugin-
Command-Ausführung sichtbar dokumentieren; keine Kompatibilität vortäuschen.
Falls echte Scaffold-Expansion unabdingbar wird: separate passive Upstream-API
benötigt; nicht per Logparser oder eigener Runtime ersetzen.

Models: Sessionauswahl auf Katalogpaar begrenzen, Sonderzeichen/Whitespace in
Kennungen verweigern; serverseitig `provider:model --session` bilden. Kein vom
Browser geliefertes Flag. Hermes confirmation_required unverändert als explizite
Bestätigung zurückmelden, erst bewusste zweite Operation mit confirmed ausführen.

## Lifecycle, Limits und Integration

Token über vorhandenes `deps.hermesClient.token` intern laden, URL aus bestehender
Hermes-Konfiguration. Ready: replay_epoch/heartbeat/change_events validieren;
danach client.capabilities. desktop_contract erst im Sessioninfo-Snapshot prüfen.

Policy zentral: Browserframe <=1 MiB, Upstreamframe <=8 MiB; bounded Arrays/
Textprojektionen; 128 Pending-RPCs, 100 Sessions/Manager, 32 Manager global,
Browser-Sendqueue <=4 MiB. Überlast explizit ablehnen/1013 schließen. Anhangupload
später separat begrenzen, nicht Base64 in normales message.submit einschleusen.
RPC-Timeout aus hermes.requestTimeoutSeconds; Handshake max gleicher Frist.
Pro Browserconnection höchstens 256 bereits verwendete Operations-IDs merken;
Duplikate ablehnen, niemals dieselbe Mutation erneut an Hermes senden.
Heartbeat alle 15 s, nach 30 s ohne pong reconnect. Backoff 0.5/1/2/4/8/15 s
mit Jitter. Keine Mutation bei Reconnect automatisch erneut senden.

Flag off beendet sofort Browsertransport, Polls, Abos und Reconnect-Timer;
`transport.dispose("disabled")` schließt mit Grund `v2-disabled`. Kein zukünftiger
V2-Hook mountet bei false. Andere Geräte mit eigenem aktiviertem Flag bleiben aktiv.
Der letzte Browserdisconnect entfernt sämtliche Browser-Abos aus dem Manager.
Navigation (`v2-navigation`) darf den Upstream bei laufender Arbeit behalten,
idle höchstens 60 s zum schnellen Wiederanbinden; anschließend entsorgen.

**Nachgewiesene Grenze:** close_on_disconnect:false bedeutet nur „nicht sofort
schließen“. ws.py:459 delegiert an session_lifecycle.py:1000: letzter Client wird
auf den Drop-Transport gelegt und der Orphan-Reaper gestartet. Dessen Prüfung
(:878–985) verschiebt bei frischer Turnaktivität/Delegations/Loop weiter, beendet
idle Sessions und kann stale/undurchsichtige Turns selbst interrupten. Source-
Defaults server.py:139–154: 20 s Prüftakt, 600 s Aktivitätsschwelle, überschreibbar.
Gesunde Arbeit läuft ohne Wrapt-Socket eigenständig weiter; false ist keine
unbedingte Weiterlaufgarantie. Auf eine globale Hermes-Konfigänderung verzichten.

Noch kritischer: Resume-Reuse methods_session.py:885–899 setzt das bestehende
close_on_disconnect-Flag nicht neu; nur neue Records (:657) übernehmen false.
Eine Classic-Live-Session kann daher true behalten und beim letzten Socket sofort
geschlossen werden (:1032). Das Flag ist im Reply nicht erkennbar. Für eigene
frisch erstellte false-Sessions darf explicit-disable den Upstream entsorgen;
Hermes übernimmt den beschriebenen eigenen Watchdog. Bei wiederverwendeter/
unbekannter laufender Session behält der sichere Fallback bis Settlement eine
serverseitige Runtime-Verbindung, ohne Browsertraffic/UI-Polls/neue Arbeit. Idle entsorgen.
„Alle Upstream-Sockets sofort weg und jede fremde Livearbeit garantiert erhalten“
ist nicht gleichzeitig belegbar; verbindliche Entscheidung: Datenintegrität hat Vorrang.

Belege im installierten Commit: tests/tui_gateway/test_tui_gateway_server.py,
`test_close_sessions_for_transport_closes_flagged_repoints_rest` (:20010),
`test_ws_orphan_reap_defers_running_turn_with_fresh_activity` (:6069),
`test_ws_orphan_activity_gate_unreadable_summary_stays_eligible` (:6185).
Nur Quell-/Testcode gelesen, keine Nutzersession und keinen Live-Turn getestet.
Bei voller Poolobergrenze nur idle Manager evicten. Kein dauernder Reconnect
ohne Abos/Arbeit. Timer clear/unref, Pending-RPCs rejecten, Queues leeren;
Fastify onClose entsorgt ohne Reconnect und ohne session.close/interrupt-RPCs.

Optionale Parent-Hooks `onAttention({principal,sessionId,kind,completedAt})` und
`publishMetadataInvalidation(principal,sessionId,revision)`; keine Secretpayloads,
keine zweite Notification-Tabelle, keine Sessiontranskripte persistieren.

## Prüfungen und verbleibende Grenzen

Fake-Gateway: Ready/List/Create/Resume/Streaming/Request/Replay/Stop; zwei Browser
am selben Principal erzeugen einen Upstream-Socket; zweiter Principal separaten
Manager, globaler Requestclaim bleibt eindeutig. Browserclose/Flag-off sendet
kein close/interrupt; Resume false plus fremdes geerbtes true getrennt testen.

Securitytests: fehlende/fremde Identität, fehlende/fremde Origin, raw shell/config/
profile/hidden/truncate-Keys, übergroße/malformed Frames, unbekannter Contract,
fehlende CWD, Symlink-Ausbruch, Pfadwechsel zwischen Attach/Submit, Title-Alias,
falsche Response-Methode/Choice/QID, alter Claim/neue Epoche, zwei Antworten,
Classic gewinnt vorher, Secret weder Log noch Broadcast, Token nie Browser.

Resilienztests: verlorene Submit-Antwort -> outcome unknown ohne Wiederholung;
neue Epoche, abgeschnittenes Replay, doppelte Events, Inflight ohne doppelte
Tokens, limitierte Queue, Timercleanup, Fastify-Shutdown, 20 laufende Sessions.

Echter Smoke erst nach Gate: bestehendes Backend verwenden, neue eigene
eindeutig benannte Session im erlaubten Projekt, harmloser Prompt, History/
Streaming/Stop/zweiter Socket/Reload. Keine Nutzer-Session stoppen/löschen, keine
Dienste/Previews starten oder neu starten. Terminal/Classic parallel separat
prüfen; gleiche Live-Session nur über kooperativen Runtime-Attach.

Keine offene reversible Architekturfrage. Grenzen: fehlende passive sichere
Skill-Expansion, keine vollständige Legacy-Queue, gemeinsame Hermes-Daten,
Filesystem-TOCTOU, unbekannte Toolzustände nach abgeschnittenem Replay und
Response-Settlement ohne zuverlässige Upstream-Antwortbestätigung.

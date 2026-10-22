# Hermes V2 Phase 8: feste öffentliche Schnittstelle

Stand17.10.2026. Root hat Phase8 ausdrücklich freigegeben. Contracts sind additiv
unter `@wrapt/contracts/hermes-v2` implementiert. Keine freie native Proxyroute.

`Pending.createdAt` und `CronRuns.runs[].startedAt` sind Epochmillisekunden;
native Sekunden/ISO werden normalisiert, unbekannte Werte bleiben `null`.

## Gemeinsamer HTTPvertrag

Basis `/api/v1/hermes/v2`. Authentifizierter Wraptbenutzer, erlaubter Origin und
Featureflag bei sämtlichen Endpunkten. Cache-Control:no-store. GET benötigt kein
Chatabo, keine Connection-ID und erzeugt keine neue Coreruntime oder Verbindung.
Browser liefert weder Profil noch HOME noch Rohpfad. Jede Erfolgsantwort enthält
`scope`, eine opaque64hex-Bindung an frisch bestätigten Profil/HOME-Kontext samt
beobachteter Generation. Mutationen senden genau den scope ihres frischen Reads.
Nach Scopewechsel neuen Read und bewusste neue Bestätigung verlangen.

Fehlerhülle `HermesV2ResourceError` / `hermesV2ResourceErrorSchema`:
`{code,message,outcome:"not_sent"|"rejected"|"unknown",retryable:false}`.
not_sent: keine mutierende Nativeanfrage; rejected: definitive native Ablehnung;
unknown: mögliche Annahme, aber keine sichere Bestätigung. Keine automatische
Mutationswiederholung. Bei unknown erst bewusst neu lesen, keinen Erfolg simulieren.
HTTP400 Eingabe,403 Flag/Origin/Auth,404 fehlendes Ziel,409 Konflikt/staler Kontext,
503 unbestätigte Quelle/Unknown/Upstream. Konkrete Codes stehen im Enum.

Alle Reads sind mit fetch-AbortSignal abbrechbar. Client verwirft Antworten nach
lokaler Owner-/Bereichs-/Generationsänderung und beendet Reads bei hidden/closed/off.
Ein Abort nach möglichem mutierendem Send ist kein Storno und keine Retryfreigabe.
Die Serverprüfung bestätigt den Ressourcenprofilkontext nach relevanten Awaits frisch.

## Cron

- GET `/cron/jobs` → HermesV2CronList, Schema hermesV2CronListSchema.
- GET `/cron/jobs/:id` → HermesV2CronDetail, hermesV2CronDetailSchema.
- GET `/cron/jobs/:id/runs?limit=20` → HermesV2CronRuns, hermesV2CronRunsSchema.
  Limit1…100, Default20. Liste maximal100 Jobs, Coverage über truncated.
- POST `/cron/jobs`: HermesV2CronCreate / hermesV2CronCreateSchema.
- PUT `/cron/jobs/:id`: HermesV2CronUpdate / hermesV2CronUpdateSchema.
- POST `/cron/jobs/:id/pause` oder `/resume`: HermesV2ResourceAction `{scope}`.
- POST `/cron/jobs/:id/trigger`: `{scope,confirm:true}` (hermesV2CronConfirmSchema).
- DELETE `/cron/jobs/:id`: ebenfalls `{scope,confirm:true}` als JSONbody.
- Alle Mutationen → HermesV2CronMutation / hermesV2CronMutationSchema:
  `{scope,outcome:"confirmed",operation,jobId,job}`; job=null bei Delete.
  jobId bestätigt immer das konkrete Ziel, bei Create die konkret erzeugte job.id.

Createfelder exakt name,prompt,schedule,repeat,paused,projectId. projectId vorhandene
Wrapt-Projektkennung (auch Slugs wie wrapt oder chappie)|null,
serverseitig auf erlaubten realpath-CWD aufgelöst. repeat positive Zahl/String/null,
native Syntax/Validierung, keine eigene Schedulerengine. Updatebody
`{scope,updates:{...Teilmenge derselben Felder}}`, kein leeres updates.
Job.schedule liefert native Eingabesyntax: Cronexpr, absolutes OneShot-run_at oder
every-Nm; menschliches schedule_display bleibt readonly in additional.
Keine zusätzlichen nativen Felder zurückserialisieren. Job.additional ist nur lesbar.
Job.execution unterscheidet agent/script/unknown und noAgent; Promptänderung garantiert
bei Script-/no_agent-Jobs keine Agentwirkung. repeat/ completedRuns getrennt anzeigen.
Zeit-/Status-/Workdirfelder können null sein. valid/truncated kennzeichnen Teilbelege.
Ein Trigger kann pausierte Jobs force-resumen/claimen; native409 ehrlich anzeigen.
Ein OneShot kann nach Quittung verschwunden sein. Receipt ist keine Präsenzgarantie.
Nach bestätigter Mutation Liste/Detail bewusst neu lesen; keine Upload-/Cronkopie inSQLite.

## Memory, Pending und Skills

- GET `/memory` → HermesV2Memory / hermesV2MemorySchema. Providerstatus und genau
  MEMORY.md/USER.md aus bestätigtem HOME. `builtinOnly:true`, kein Providerexport.
- GET `/pending` → HermesV2Pending / hermesV2PendingSchema. Max100 echte native
  Records, memory/skills, status pending|unknown, coverage bounded|partial.
  `review:{supported:false,adminPath:"/hermes"}`. Keine Approve-/Rejectmutation.
  matchedEntryComplete und truncated beachten; gekürzte Payload ist kein voller Beleg.
- GET `/skills` → HermesV2ResourceSkills / hermesV2ResourceSkillsSchema.
- GET `/skills/detail?name=…` → HermesV2ResourceSkillDetail / entsprechendes Schema.
  Nur aktueller exakt gelisteter Name. Contentread ohne Browserpfad. slashCommand ist
  bei fehlendem native Katalogbeleg null. Provenance hub/bundled/external/agent/unknown.
  Sämtliche nativen Details readOnly:true, kein globaler Toggle. editorPath=`/ki-skills`.
  Bestehender persönlicher Editor und dessen Adminrechte bleiben zuständig.

Gemeinsamer HermesV2ResourceText / hermesV2ResourceTextSchema:
`{text,status,bytes,truncated}`, status available|empty|missing|unreadable|unknown.
Memory64KiB je Datei, Pending64KiB/Record, maximal2 parallele Dateireads. Symlinks,
Dateiwechsel und ungültige Records ergeben keine Freigabe oder stillen Leerzustand.
Known-Secretredaction vor Kürzung einschließlich überlappender Werte und später
bekannter Präfixe. Identitäten exakt; Markdown/Logs nur untrusted Text.

## Diagnose und vorhandene globale Verbindung

GET `/diagnostics` → HermesV2Diagnostics / hermesV2DiagnosticsSchema. Tatsächlicher
V2-Verbindungszustand oder unavailable, schmaler Dashboardstatus, passiver Updatestatus,
begrenzte Agentlogzeilen und redigierter Update-Logtail. Keine doctor/acpCheck-/CLI-/
Service-/Updateaktion, kein Configdump. Copydiagnostics aus diesem Objekt erzeugen.

Vorhandene V2-WebSocketquery erhält zusätzlich `resources=1`. Kein neuer Socket,
Chatowner, Poller oder Watcher. Nur mit diesem ausdrücklichen Opt-in gibt es
`resources.invalidated` als normalen HermesV2Event:
`sessionId:null,seq:null,payload:{resource:"cron"|"sessions",sessionIds:string[]}`.
cron.changed liefert resource cron und sessionIds=[] über die vorhandene Verbindung.
Globale Events vor Chatleasefilter beobachten. Reconnect/off beendet Ressourcenreads;
beim erneuten Öffnen einmal neu lesen. Legacyframes ohne Opt-in bleiben unverändert.

## Bestätigtes natives Sitzungsdelete

GET `/sessions/:id/deletion` → HermesV2SessionDeletionPreview /
hermesV2SessionDeletionPreviewSchema: `{scope,requestedSessionId,title,deletable,reason,
effect:"compression-chain"}`. Kein Subscribe/Lease. Unknown/running/offene Requests/
ungeklärte Hintergrundarbeit sperren Delete. Exakte volle Stored-ID, keine Prefixsuche;
reservierte Routen wie empty sind gesperrt. Vorschau vor Bestätigung frisch lesen.

DELETE `/sessions/:id`: HermesV2SessionDelete / hermesV2SessionDeleteSchema,
`{scope,confirm:"delete-compression-chain"}`. Erneut alle Belege prüfen.
Bestätigungstext nennt Kompressionskette und delegierte Unteraufgaben. Native
Branch-/Resetgespräche bleiben eigenständig. Die löschbare Vorschau bindet `scope`
zusätzlich an Owner und volle ID; einmaliger Verbrauch, maximal fünf Minuten gültig.
`scope` bleibt bei unverändertem Profil/HOME stabil; ein neuer Preview erneuert die Freigabe.
Antwort HermesV2SessionDeleted / hermesV2SessionDeletedSchema:
`{scope,outcome:"confirmed",requestedSessionId,alreadyAbsent,
confirmedAbsentSessionIds,affectedIdsComplete:false,effect:"compression-chain"}`.
Nur konkret bestätigte Abwesenheiten stehen in confirmedAbsentSessionIds; keine
abgeleiteten Branch-/Delegationskinder und keine Vollständigkeitsbehauptung. Native
Quittung liefert selbst nur ok/already_absent. Der angefragte volle Schlüssel wird
bei sicherem Erfolg bestätigt. Andere Kettenzeilen über erneuten Katalogread abgleichen.

Erst nach confirmed exakte bestätigte eigene Auswahl/Lease/cache entfernen; bei409/
unknown erhalten. Kataloginvalidierung erfolgt serverseitig zusätzlich. Globales
resources.invalidated sessions führt die konkret bestätigten IDs. Native409 wird
nie durch Stop/Kill umgangen. Keine eigene HermesDB-/Dateilöschung.

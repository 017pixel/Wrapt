# Feature-API-Handoff für spätere Phasen 5–8

Stand 2026-10-16, abgeschlossene Read-only-Recherche. Keine Produkt-Freigabe.
Nur installierte Quellen gelesen, keine Requests, Datenbank-/Runtimezugriffe oder Turns.
Transport bleibt während des unabhängigen R5-Rechecks unverändert eingefroren.
Core-Checkout in allen Belegen: `/home/bbecker/.hermes/hermes-agent`.

## Bereits belegte Grenzen

- `approval_mode` und `approvals.mode` sind GLOBAL, auch bei angegebener Session-ID.
  Ein Session-Approval-Modus manual/smart/off ist upstream nicht verfügbar.
- `config.set key=yolo,scope=session` ist ein echter persistierter Session-Bypass,
  aber kein Ersatz für die drei Approval-Modi. Abschalten erzwingt keine Approvals,
  wenn globales off oder Prozess-YOLO aktiv bleibt. Kein automatisches Einschalten.
- Reasoning-Effort ist wirklich sessionbezogen; seine Anzeigewörter show/hide/full/clamp
  verändern dagegen globale Display-Konfiguration. Nur explizite Effort-Werte zulassen.
- `model.options` liefert reasoning/can_disable_reasoning, ausdrücklich KEINE Effort-Liste.
  Der vorhandene V2-Normalizer setzt reasoningEfforts deshalb korrekt auf [].
- Native Memory-Pending-Writes existieren, aber nur CLI-/Slash-/Command-Review,
  keine dedizierte REST-/WS-Domain-API zum Approve/Reject. command.dispatch bleibt gesperrt.

## Anhänge

`tui_gateway/methods_prompt.py:887–1011`, `prompt_attachments.py:17–235`:

| Native Operation | Parameter und Ergebnis | Tatsächliche Grenze |
| --- | --- | --- |
| image.attach_bytes | session_id,content_base64 (Alias data),filename?,ext? → attached,path,count,bytes,Metadaten,text | 25 MiB decoded; PNG/JPEG/GIF/WebP/BMP-Familie; Dateiendung kann Magic überstimmen, zusätzliche serverseitige Magic-Prüfung nötig |
| pdf.attach | session_id,content_base64 oder path,filename?,first_page?,last_page? → pages_attached,pages[],count,text | 50 MiB, höchstens 25 Seiten, pdftoppm vorausgesetzt; Render-Timeout 120 s |
| file.attach | session_id,data_url,name? (auch path upstream) → attached,name,path,ref_path,ref_text,uploaded | beliebiger MIME/bare Base64; in diesem Handler KEINE decoded Größenobergrenze |
| image.detach | session_id,path → detached,count | entfernt nur Queue-Verweis, löscht die Datei nicht |

`file.attach` kopiert externe Hostdateien oder staged Bytes. Dateiname wird bereinigt,
neue Dateien mit xb kollisionsfrei angelegt; Teilfehler entfernt nur die neu erstellte Datei.
Speicherort profile_home/attachments, bei attachments.storage=workspace auch
<gültiger Session-CWD>/.hermes/attachments; Bilder unter profile_home/images.
Workspace-Storage wird bei nichtlokalem Backend nicht blind verwendet.
Es gibt keine belegte automatische Upload-TTL oder Löschung beim Detach/Sessionende.

REST `hermes_cli/web_routers/files.py:415–498,630–722`, `web_models.py:89–96`:

- POST /api/chat/image-upload JSON `{data_url,filename?}`, optional profile →
  `{ok,path,name,bytes,mime_type}`; echte Magic-Allowlist, 25 MiB; HERMES_HOME/images.
  Ist noch keine Zuordnung zur Live-Session und hängt kein Bild an einen Prompt.
- POST /api/files/upload JSON `{path,data_url,overwrite:true}` → `{ok,entry,path,…}`.
  POST /api/files/upload-stream multipart `file,path,overwrite` ist wirklich streaming,
  1-MiB-Chunks, 100-MiB-Dateigrenze, atomarer Tempfile-Rename und Cleanup bei Abbruch.
- Generische Dateirouten akzeptieren absolute Hostpfade, im normalen Home-Modus ohne
  Locked Root. Diese Oberfläche darf keine V2-Freigabe beliebiger Browserpfade werden.
- GET /api/files/read?path=… liefert `{name,path,size,mime_type,data_url,…}`,
  mit Sensitive-Denylist und Live-SQLite-Schutz. GET /api/media ist zusätzlich auf
  Bilder unter images/screenshots/cache begrenzt. Kein beliebiger Download-Tunnel.
- Der existierende /hermes-Proxy streamt HTTP und leitet GET/POST/PUT/PATCH/DELETE weiter,
  ist aber die breite Expertenverwaltung. Nicht direkt als V2-Upload-Autorisierung nutzen.
  `HermesDashboardClient` kann JSON get/post/put/delete, serverseitiges Token und 4-MiB-
  Antwortgrenze; er bietet noch keinen Multipart-Stream oder begrenzten Binärdownload.

Wichtige Concurrency-Grenze: image.attach_bytes/pdf.attach verändern eine gemeinsame
`session.attached_images`-Queue. prompt.submit übernimmt sie später beim Turnstart;
ein konkurrierender Classic-/anderer Principal-Submit kann dazwischenkommen.
`PromptSubmitParams` hat KEIN öffentliches image_paths/attachment_ids-Feld.
Interne image_paths-Argumente sind keine Client-API. Quellen: prompt_voice.py:26–53,
prompt_turn.py:117–174, session_auto_continue.py:420–443.
Keine falsche Zuordnungsgarantie durch bloße Serialisierung eines V2-Managers behaupten.

## Sessionbezogene Einstellungen

Quellen: methods_config_set.py:270–305,307–355,495–514;
server.py:2360–2406; hermes_constants.py:996–1023; inventory.py:539–585.

- Effort: config.set `{session_id,key:"reasoning",value:"low",scope:"session"}` →
  `{key:"reasoning",value:"low"}`. Erlaubte native Stufen minimal/low/medium/high/
  xhigh/max/ultra, außerdem none/false/disabled zum Deaktivieren. Keine freie Config.
  Session vorhanden halten, CWD-/Binding-/Flag-/Connectionguards direkt vor Send.
  Eine stale nichtleere Session-ID schreibt für diese Keys NICHT global.
- Ohne Session oder bei scope=global würde derselbe Handler global schreiben.
  show/on/hide/off/full/all/clamp/collapse/short sind Displaybefehle und auszuschließen.
- agent.reasoning_config/create_reasoning_override werden sessionbezogen gesetzt,
  lebender Agent wird persistiert und session.info emittiert. Lazy-Agent ohne Build
  kann die angenommene Auswahl noch nicht als wirksamen Agentwert zurückmelden.
- session.info hat reasoning_effort und reasoning_effort_wire; letzteres zeigt die
  tatsächlich geklemmte Route-Stufe. Kein native Bestätigungsdialog für Effort.
- model.options capabilities.reasoning ist teils optimistisch true bei unbekanntem
  Katalog. supported_efforts wird ausdrücklich nicht weitergereicht. UI darf nicht
  alle Hermes-Stufen als nachgewiesene Modellstufen bezeichnen. Kataloglücke offen.
- approval_mode/approvals.mode → _write_config_key("approvals.mode",…): NICHT anbieten.
  yolo nur als klar benannter Session-Bypass mit expliziter Warnbestätigung, falls
  der Auftrag dies später zulässt. Result `{key:"yolo",value:"1"|"0",scope:"session"}`;
  session.info yolo ist effektives OR aus Session-, Global- und Prozesszustand.

## Native Cron-API

Quelle: web_routers/cron.py:600–735; web_models.py:310–333;
web_server_cron.py:244–283,116–173. Bestehenden Scheduler ausschließlich weiterverwenden.

| REST | Payload / Result |
| --- | --- |
| GET /api/cron/jobs?profile=… | direktes Jobarray; default all aggregiert und dedupliziert IDs zugunsten default |
| GET /api/cron/jobs/:id?profile=… | Jobobjekt |
| GET /api/cron/jobs/:id/runs?limit=20&profile=… | `{runs,limit}`, Limit auf 1…100 geklemmt |
| POST /api/cron/jobs?profile=… | CronJobCreate → Jobobjekt |
| PUT /api/cron/jobs/:id?profile=… | `{updates:{…}}` → aktualisiertes Jobobjekt |
| POST /api/cron/jobs/:id/pause oder /resume | kein Body nötig → Jobobjekt |
| POST /api/cron/jobs/:id/trigger | kein Body nötig → Jobobjekt; 409 wenn bereits geclaimed/laufend |
| DELETE /api/cron/jobs/:id | kein Body → `{ok:true}` |
| GET /api/cron/delivery-targets?profile=… | `{targets:[{id,name,home_target_set,home_env_var},…]}` |

CronJobCreate: schedule erforderlich, prompt/name optional strings, deliver="local",
repeat=null|positive Zahl|"once"|"forever"|Zahlstring, paused=false, paused_reason?,
skills?,model?,provider?,base_url?,script?,context_from?,enabled_toolsets?,workdir?,no_agent=false.
Agentjob benötigt prompt oder skills oder script. no_agent verlangt script.
Scripts werden nur unter profile_home/scripts aufgelöst; workdir wird als Text
übernommen, daher zusätzliche Wrapt-Root/Realpath-Prüfung nötig.
Run-now kann pausierten Job force-resumen und claimen; nicht als garantiert
statusneutrale Einmalausführung darstellen. One-shot kann sich nach Lauf entfernen.
Profile-ID serverseitig binden; kein Browserprofilwechsel, keine ungeprüften Updates.
Kleinste V2-Eingabemenge: name,prompt,schedule,repeat,paused,workdir aus Projekt-ID;
native vorhandene Zusatzfelder im Detail sichtbar lassen, bei Bearbeitung erhalten.
base_url/script/no_agent/enabled_toolsets/rohe context_from nicht frei tunneln.
Kein scheduler.fire-Webhook, eigener Timer oder Shellrunner in Wrapt.

V1 `hermesCronJobSchema` enthält nur id/name/schedule/enabled/nextRunAt/lastRunAt/
lastStatus/adminPath. `HermesSessionService.cron()` ist reines Listing und verliert
editierbare Felder/Profile. Daher neue additive V2-Cron-Verträge statt V1-Missbrauch.

## Memory und Skills

`web_routers/ops.py:488–550`: GET /api/memory liefert
`{active,providers,builtin_files:{memory:byteCount,user:byteCount}}`.
Kein Memorytext, keine Pending-Liste. Providerstatus enthält name/description/
available/configured/status/setup; Setup nur sicher projizieren, keine Secrets.
PUT /api/memory/provider verändert profilweite Konfiguration; POST /api/memory/reset
löscht Dateien. Beide sind keine benötigte V2-Read-/Pending-Funktion.

Tatsächliche builtin Dateien: HERMES_HOME/memories/MEMORY.md und USER.md.
Leseprojektion kann bestehende feste Dateirouten oder begrenzten lokalen Read nutzen,
aber nur serverseitig ermittelte zwei Namen, keine frei gelieferten Browserpfade.
Externe Memoryprovider besitzen eigene Inhalte; builtin Dateien sind kein vollständiger
Export von Honcho/anderen Providern. Große Inhalte explizit begrenzen/als gekürzt markieren.

Pending ist real: tools/write_approval.py:1–120 staged
HERMES_HOME/pending/{memory,skills}/<8hex>.json mit
`{id,subsystem,action,summary,origin,created_at,payload}`; origin foreground/background_review.
Memory-Payload kann Ziel, komplette matched_entry und destructive Batchoperationen enthalten.
`apply_memory_pending` (tools/memory_tool.py:326–344) benutzt nativen Store und verweigert
destruktive Legacy-Writes ohne gepinnte matched_entry. Nicht in TypeScript nachbauen.
CLI-Review in write_approval_commands.py:35–148; TUI methods_tools.py:1008–1091 führt
diesen Handler nur hinter command.dispatch/slash aus. Kein dediziertes Review-RPC.
Deshalb Pending-Read als begrenzte Projektion derselben Dateien möglich;
Approve/Reject ehrlich unsupported/Classic-Einstieg, bis sicherer Domain-Endpunkt existiert.
Kein eigener Pending-Store, keine direkte Löschung als behauptete native Reject-API.

Hermes REST Skills: web_routers/skills.py:343–416:
GET /api/skills → Array mit enabled,usage,provenance (hub/bundled/external/agent) plus
Skillmetadaten; GET /api/skills/content?name=… → `{name,content,path}`.
PUT /api/skills/toggle `{name,enabled,profile?}` schreibt globale Disabled-Liste.
Kein V2-Session-Skilltoggle. Auswahl für Agent-Prompt bleibt normale kataloggebundene
Skillanweisung; keine Inline-Expansion/command.dispatch und keine Installation.

Wrapt hat bereits SkillEditor.tsx, /api/v1/skills/tree und /skills/file?path=…,
Hermes-Kategorien, globale Regeln, Symlink-Baum und Revisionstoken-Autosave.
Die Seite verwaltet den persönlichen Repo-Bestand, nicht automatisch alle installierten
bundled/hub Skills. Details aus bestehendem Repo über vorhandenen Editor öffnen;
weitere Hermes-Katalogdetails über strikt namensgebundene REST-Readprojektion.
Kein zweiter Editor, keine Kopie offizieller/Hub-Skills ins persönliche Repository.

## Verbindliche kleinste spätere Umsetzung

### Anhänge ohne falsche Turn-Zuordnung

Erste sichere Variante: native file.attach mit Bytepayload für Dateien inklusive
Bilder/PDF als Dateireferenz, danach das echte ref_text in genau den zugehörigen
normalen String-Prompt einfügen. Keine gemeinsame attached_images-Queue anfassen.
Core expandiert @file unter CWD oder seinen Staging-Roots, inklusive Sensitive-Guard;
Binärdateien werden referenziert statt blind als Text eingelesen. Quelle:
agent/context_references.py:287–320,487–546 und prompt_turn.py:700–721.
Das ist eine Dateianhang-Funktion. Keine automatisch gerenderte PDF-/native Vision-
Zuordnung behaupten. Diese zusätzlich gewünschte Fähigkeit benötigt ein echtes
atomisches Core-Attachment-pro-Turn-Feld oder einen belegten gleichwertigen Vertrag.
Ein normales @image:-Vorkommen ist laut session_history.py:51–72 Persistenzmarkup;
es ist KEIN öffentlich dokumentierter Ersatz für die Bildqueue. Kein erfundenes image_paths.

Vorgeschlagener enger Browservertrag: POST /hermes/v2/attachments mit Session-ID,
Browser-Connection-ID und genau einem multipart File; Antwort opaque attachmentId,
name,bytes,mime,kind. Browser liefert weder Hostpfad noch ref_text noch Profile.
Die bisherige WS-Connection-Nachricht liefert noch keine Browser-Connection-ID.
Für HTTP-Zuordnung ist eine additive opaque Kennung im authentifizierten Frame
nötig; sie ersetzt keine Authentifizierung und wird serverseitig gegen Principal,
aktuelle Verbindung, Abo und Epoche geprüft. Keine frei behauptete Client-ID vertrauen.
Bestehende strikte Connection-Frames erhalten: neue Kennung nur nach expliziter
additiver Clientfähigkeit/Opt-in projizieren, ältere Clients behalten ihren Shape.
message.submit bekommt optionale attachmentIds[], serverseitig auf maximal zehn begrenzt.
Die IDs gehören Principal + kanonischer Stored-ID + geprüfter Live/Epoch/CWD-Bindung.
Vor Upload, nach Bodyaufnahme und direkt vor native file.attach/Submit erneut alle
CWD-/Connection-/Flag-/Subscription-/Liveguards prüfen. Bei Bindungswechsel neu bestätigen.
Initiale Vorschlagsgrenze 4 MiB decoded pro Datei, zehn Referenzen pro Nachricht;
serverseitige zentrale Policy, keine still behauptete Core-Grenze. @fastify/multipart
ist bereits installiert; V2-Routen liegen außerhalb des bestehenden API-Kindscopes
mit dessen Multipartregistrierung und benötigen eigene eng begrenzte Registrierung. Multipart streamend
begrenzen, Base64-Gesamtgröße VOR RPC auf Adapter-/Core-Framebudget prüfen.
Core nimmt bis 384 MiB WS an (web_server.py:449,1268); das erhöht NICHT Wrapts Budgets.
Dateiendung/MIME sind Anzeigehinweise; Bildvorschau nur nach Magic-/Decoderprüfung.
Keine HTML/SVG/PDF-Ausführung unter App-Origin, Downloads als attachment/octet-stream.

Kleinste dauerhafte Eigentumsprojektion in bestehender Wrapt-Metadatenbank:
opaque ID, Principal, Stored-ID, eigener erzeugter Pfad, stat-Identität, Name/Bytes,
erstellt/verwendet. Keine Dateibytes, Prompts, Secrets oder zweite Transcriptdatenbank.
So bleiben Browserreload und Download-Autorisierung belegbar. Native Coredateien bleiben
Source of Truth. Wiederverwendung wird nach aktuellem CWD/Session-Abo autorisiert.
Download akzeptiert nur diese IDs und prüft realpath, Dateiidentität und erlaubten
Staging-/Workspace-Unterpfad erneut; niemals freien /api/files/read-Proxy anbieten.
Wrapt entfernt abgebrochene eigene temporäre Uploadteile. Bereits in Hermes gestagte
Dateien bei Cancel/Unmount NICHT löschen: Classic/History könnte sie referenzieren.
Unverwendete Core-Stagingdateien besitzen keine belegte sichere TTL, deshalb zunächst
Aufbewahrung plus Größen-/Ratenbegrenzung, kein geratenes Rekursiv-Cleanup.

### Einstellungen

Additive reasoning.select-Domainaktion, ausschließlich native Stufen und explizit
scope=session. Anfangs nur bei idle, da der Setter keine Deferred-/Bestätigungssemantik
für laufende Turns verspricht. Aktuellen Modellkatalog und alle Mutationsguards prüfen.
catalog.read darf boolesche Reasoningfähigkeit/canDisableReasoning und eine getrennt
als Hermes-Ladder deklarierte Stufenliste liefern. reasoningEfforts[] weiterhin nicht
mit erfundenen modellspezifischen Stufen füllen. Requested und reasoning_effort_wire
getrennt anzeigen; unbekannte Fähigkeit darf nicht als garantiert unterstützt erscheinen.
Keine zusätzlichen Effort-Kostenbestätigungen des Cores erfinden. Bestehende explizite
Modellbestätigung unverändert behalten. Approvals zunächst nur effektiven Modus/Bypass
anzeigen und globale Änderung ehrlich an die vorhandene Expertenverwaltung verlinken.
Keinen Session-Manual/Smart/Off-Dropdown oder automatischen YOLO-Toggle hinzufügen.

### Cron, Memory und Skills

Cron über schmale authentifizierte V2-REST-Routen mit festem serverseitigem Profil;
HermesDashboardClient wiederverwenden, nur feste Pfade und typisierte Felder zulassen.
Job-IDs aus aktueller nativer Liste/Detail binden, Workdir aus erlaubter Projekt-ID
auflösen, vor Create/Edit/Run erneut prüfen. Gemeinsamer Core bedeutet keine erfundene
Mandantentrennung der Jobs. Delete/Run bestätigen, Doubleclick sperren, kein Auto-Retry
bei unbekanntem HTTP-Ausgang. Native Create hat keinen belegten Idempotency-Key.
Schedule an Hermes geben, keine eigene Cron-Auswertung: native Beispiele every 30m,
0 9 * * *, ISO-Zeitpunkt; Zeitzone stammt aus Hermes (cron/jobs.py:787–830).
Liste/Detail frisch nach Mutationen laden, cron.changed als Invalidierung verwenden;
keine zusätzliche dauerhafte Pollschleife. All-Profile-Default ausdrücklich vermeiden.

Memory-Read: feste builtin Dateien direkt aus dem bereits ermittelten Hermes-Home
mit begrenztem sicheren Dateiread, initial 64 KiB je Datei, read-only und gekürzt markiert.
Symlinks/außerhalb des festen memories-Roots fail-closed; keine freien Dateiparameter.
Pending-Read derselben Core-Dateien, initial maximal 100 Records à 64 KiB, höchstens zwei
parallele Reads, validierte 8hex-IDs/Subsystem/Action/Zeit/Origin. JSON-Fehler/verschwundene
Records als unbekannt behandeln, niemals als bereits genehmigt. matched_entry vollständig
innerhalb des Limits oder explizit unvollständig anzeigen. Keine automatische Freigabe.
Native Approve/Reject bleibt in dieser Installation disabled mit vorhandenem Classic-
Einstieg, bis ein dedizierter Core-Endpunkt existiert. Keine Python-CLI-/Shellbrücke als Ersatz.
Sämtliche Memory-/Pending-/Cron-/Attachment-Anzeigetexte durch denselben poolweiten
Secretredactor projizieren; IDs/Envelope unverändert. Keine bekannten Secretwerte in DB.
Memory/Pending nur bei aktiv geöffneter Fläche lesen, manuell aktualisieren; keine neue
Watch-/Polling-Engine. Skills verwendet bestehenden Editor und native Katalogdetails.

## Späterer Dateiscope und Prüfkriterien

Codex-Welle: additive neue packages/contracts/src/hermes-v2-attachments.ts, -settings.ts, -cron.ts,
-knowledge.ts über vorhandenen Subpath, keine großen Barrels erweitern. Danach neue
Server-v2 attachments/routes/store, settings-operations, cron-routes/projection,
knowledge-routes/projection mit jeweiligen Tests; vorhandenen DashboardClient als
injizierten Writer verwenden. Kleine gezielte Manager-/Normalizer-/Routes-Integration
erst nach separater Freigabe; jede Datei unter 400 Zeilen, Einstellungen zentral.
Memory-Dateileser bekommt nur feste injizierte Roots, Cron-Writer feste Profilidentität.
Uploadmetadaten in vorhandener Datenbank mit Migration, niemals neue Hermes-State-DB.

GLM-Welle danach: Composer-Dateikarten, Reasoningauswahl, Cron-Liste/Form/Bestätigungen,
Memory/Pending-Drawer und SkillEditor-Verlinkung, jeweils mit echten Domainverträgen.
Vorhandene HermesV2Shell/Design-/Mobile-Tokens benutzen. Unsupported Aktionen ehrlich
disabled; keine Attrappen-Erfolge. Feature off beendet jede Browser-Abfrage/Subscription.

Pflichttests: Uploadoversize vor Base64, MIME/Magic-Mismatch, Traversal/Symlinkwechsel,
fremder Principal/Session/Connection, CWD-/Epochwechsel während Upload, Cancel/Reconnect,
zwei Tabs plus Classic-Queue ohne Bilddiebstahlbehauptung, unbekannter Sendausgang und
Historyreload/Downloadrechte. Effort ohne globale Display-/Configwrites, stale Session,
requested≠wire und unbekannter Katalog; globaler Approvalmodus bleibt read-only.
Cron Create/Edit/Pause/Resume/Delete/409/Run-paused/One-shot, exakte updates-Hülle,
Profilkollision, ungültiges Schedule, Workdir-Escape, 4-MiB-Clientantwortgrenze und kein Retry.
Memory/Pending mit externem Provider, kaputten/alten/unpinnten Records, Truncation,
Secret-Echos und fehlendem nativen Approve-Endpunkt; bestehende Skill-Editorrechte erhalten.
UI separat per Playwright und eigener Testinstanz, niemals Nutzerpreviews verändern.

Nur dieser Report wurde in der Recherche geschrieben. Alle Produktdateien bleiben
eingefroren; die beschriebenen Phasen sind nicht zur Implementierung freigegeben.

Nachtrag 16.10.: prompt_attachments.py:187ff akzeptiert bei file.attach ausdrücklich
beliebige MIME-Typen. Bilder/PDF können daher ehrlich als Dateireferenzen gestagt
werden; das ersetzt weiterhin keine atomare native Vision-/PDF-Seitenzuordnung.

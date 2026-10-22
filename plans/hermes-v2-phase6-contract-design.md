# Phase 6: additive Verträge und Backendzuschnitt

Vorbereitung vom 16.10.2026, nur Quellen gelesen, keine Produktfreigabe vor Phase-5-Gate.
Original Kap. 7/13/Phase 6 und beide Handoffs berücksichtigt; Core: `/home/bbecker/.hermes/hermes-agent`.
`real-catalog-proof.json`: 197 Commands/100 Skills,5 Provider/207 Modelle nur im Startprofil.

## Opt-in und öffentliche Shapes

Neue Composerprojektionen nur bei WS `?composer=1`, kombinierbar mit `readEvidence=1`.
Die strikte Queryprüfung erweitern. Dann enthält jedes bestehende Connectionframe
zusätzlich `connectionId: z.string().uuid()` der tatsächlichen Browser-WS-Verbindung.
Ohne Opt-in bleiben Connection-, Katalog-, Snapshot- und Eventshapes exakt bisherig.
Neue Felder im neuen Zod-Vertrag optional definieren reicht für alte strikte Clients
allein nicht: die Ausgabe muss sie für diese Verbindungen tatsächlich weglassen.
IDs/Enums niemals durch den Textredactor schicken; neue Anzeigen gezielt maskieren.

Folgende TS-Shapes jeweils als `z.strictObject`, keine freien Records/Configkeys:

```ts
type Effort = "none"|"minimal"|"low"|"medium"|"high"|"xhigh"|"max"|"ultra";
type ComposerSettings = {
  reasoning: { effort: string|null; wire: string|null };
  approvals: { mode: "manual"|"smart"|"off"|null;
    effectiveBypass: boolean|null; scope: "global"; editable: false };
};
// Neue WS-Operationen, jeweils plus bestehendem {v:1,id:uuid,sessionId:Id}:
type TitleInput = { op:"session.title"; title:string };
type TitleResult = { title:string; pending:boolean };
type EffortInput = { op:"reasoning.select"; effort:Effort; selection:Selection };
type EffortResult = { requested:Effort; observed:ComposerSettings;
  observation:"observed"|"unconfirmed" };
type Attachment = { id:string; name:string; bytes:number; mime:string;
  kind:"file-reference"; expiresAt:number };
type UploadStatus = { uploadId:string; state:"receiving"|"ready"|"not_sent"|"unknown";
  attachment:Attachment|null };
```

Id/Epoch/Selection übernehmen bestehende Schemas. Title trim/nonempty/max200;
Effort nur obiger Enum, beobachtete Effort-/Wirestrings max40/null. Attachment-ID
`/^[a-f0-9]{64}$/`, Upload-ID UUID, Name max200, MIME max100, Zeit integer Server-ms,
Bytes integer 1..4194304. `message.submit` additiv `attachmentIds?: ID[]` bis10,
eindeutig; Text darf nur mit mindestens einer ID leer sein. Bisherige Status-/Rowreceipts bleiben.
Snapshot und `session.updated.payload` erhalten optional `composer:ComposerSettings`.
Nicht auslesbare Werte sind null. Der bestehende `reasoningEffort` bleibt kompatibel.

## Katalog und Einstellungen

Command additiv optional `aliases:string[<=100]`, `argumentMode:"options"|"text"|"mixed"|null`,
`subcommands:string[<=100]`, `desktopSubcommands:string[<=100]|null`, Strings jeweils max200.
Aliases nur aus validiertem `canon[alias]===canonicalKey`; keine extra ausführbaren Aliaszeilen.
`sub` ist nach Registryname ohne Slash aufgebaut, Metadaten `commands` nach Slashkey.
Beide auf den kanonischen Eintrag beziehen. Quick-/Pluginüberschattung case-insensitiv
auch für Aliase beachten. Skills nur bei echtem `skills[key]`, ohne Überschattung.
`argumentHint` aus belegten Subcommands/Mode begrenzt formulieren; exakte `args_hint`
fehlen im Wire. Keine Syntax aus Beschreibungstext herausraten oder Skillinhalt expandieren.
Unsupported bleibt disabled. Skillwahl setzt die ausdrücklich erkennbare Agentanweisung
in den Composer. Kein `command.dispatch`, `slash.exec`, `cli.exec` oder Shelltunnel.
Quelle: `methods_tools.py:400–537`, `contracts/tools_commands.py:194–226`, `hermes_cli/commands.py:352–371`.

Modell additiv `reportedReasoning?:boolean|null`, `canDisableReasoning?:boolean|null`;
Catalogresult additiv `hermesEfforts?:Effort[]`. Bestehendes `reasoningEfforts:[]` nicht
als Modellladder erfinden: `inventory.py:539–585` gibt supported_efforts absichtlich nicht aus;
reasoning=true kann dort optimistischer Default sein. `none` nur bei bestätigtem canDisable=true.
Hermes-Ladder entsprechend kennzeichnen, nicht als garantierte Modellfähigkeit.

`session.title` sendet ausschließlich `{session_id:liveId,title}` über MutationOutcome.
Native Antwort `{title,pending}` strikt prüfen, Titel tatsächlich übernehmen und Sessionkatalog
invalidieren; keine Wrapt-Kopie als Titel-Source-of-Truth. Native Infoevents weiter nutzen.
Kein globaler atomarer Titel-CAS ist vorhanden; eigene Queue ist keine Classic-Sperre.
Quelle: `methods_session.py:1207–1258`, `contracts/sessions.py:310–321`.

Effort prüft frischen Sessionmodellkatalog, erwartetes Selectionpaar und belegtes Idle
unmittelbar vor Send. Nur `{session_id:liveId,key:"reasoning",value:effort,scope:"session"}`.
Keine Displaywörter on/off/show/hide/full/clamp, kein scope=global oder YOLO-Setter.
Native `{key:"reasoning",value}` bestätigen, frisches `session.activate/info` normalisieren.
Receipt requested ist akzeptierter Wunsch; beobachteter Agentwert/Wirewert kommen nur aus
`reasoning_effort`/`reasoning_effort_wire`. Lazy-Agent kann leer bleiben, dann unconfirmed.
Keine zusätzliche Kostenbestätigung erfinden; bestehende Modellbestätigung/deferred bleibt.
Approval nur native `approval_mode` und effektives `yolo` anzeigen, nie Session-Manual/Smart/Off.
Belege: `methods_config_set.py:270–355,495–514`, `server.py:2356–2406`, `hermes_constants.py:996–1023`.

## Upload und Bindungskoordination

Eigene Multipartregistrierung ausschließlich in einem Kind von V2-routes, nicht am
Approot/anderen API-Scope. @fastify/multipart ist bereits installiert (10.1.1).
POST `/hermes/v2/attachments?sessionId=Id`, Header `X-Hermes-V2-Connection-Id:uuid`
und `X-Hermes-V2-Upload-Id:uuid`, genau ein Multipartteil `file`, keine Textfelder.
Auth/Same-Origin/Opt-in/Flag und tatsächliche Verbindung VOR Body lesen prüfen.
GET `/hermes/v2/attachments/uploads/:uploadId` liefert eigenen UploadStatus zur
bewussten Statusklärung nach verlorener Antwort, ohne erneutes file.attach.
GET `/hermes/v2/attachments/:id` lädt ausschließlich über opaque ID herunter.
REST-Fehler `{code,message,outcome:"not_sent"|"unknown",uploadId?:uuid}` ohne Rohfehler/Pfade.

Ein kleines Attachmentmodul bekommt einen schmalen internen Port, keine Manager-Privatfelder:
`capture(owner,connectionId,sessionId)`, `stage(binding,bytes,name,outcome)`,
`resolveForSubmit(binding,ids)`; ausschließlich diese Domänenaktionen, kein beliebiges RPC.
Pool schlägt vorhandenen Manager nach (`managers.get`), niemals get/create/connect/resume.
Capture friert Connectionobjekt, Recordidentität, Subscriptiongeneration, Stored-/Canonical-ID,
liveId, Epoch, Transport-ID, bestätigtes Profil/Home und realpath-CWD ein.
Erfolgreiches neues Subscribe/Create beginnt eine Generation; Unsubscribe/Release beendet sie.
A→B→A ist eine neue Generation. Ohne tatsächliches Abo keine Uploadfreigabe.

Nach jedem Await prüfen: aktive Originalconnection, Generation, erlaubter Flagzustand,
derselbe Record/live/Epoch/Transport/Canonicalkontext; zusätzlich CWD vor/nach Body,
vor native Attach und vor Submit neu mit bestehender writable-Prüfung und realpath validieren.
Snapshot-CWD ist bisher kein garantierter Realpath und genügt allein nicht.
Finales Stage/Submit läuft in derselben SessionOperationQueue wie die vorhandenen WS-Aktionen;
Aufnahme eines langsamen HTTP-Bodys hält die Sessionqueue noch nicht besetzt.
Für jede Uploadmutation queuedOperations/Runtimehalt und MutationOutcome beibehalten.
Manager vor Erweiterung verhaltensgleich von mutationGuard nach `binding-guard.ts` entlasten;
kleine Closure injiziert enabled/disposed, keine Freigabe des gesamten deps-Objekts.

## Dateien, Eigentum und Grenzen

Defaults zentral in Attachmentpolicy: 4MiB/Datei,10 Referenzen,1 Upload/Principal und2 gesamt,
60s Bodydeadline,64 offene Uploadreservierungen/Owner und512 gesamt. IDs256bit zufällig.
Unbenutzte Submitberechtigung24h, verwendete Eigentums-/Downloadprojektion90Tage;
höchstens512 Eigentumsrows/Owner und4096 gesamt, Kapazität vor Staging reservieren.
TTL/Cleanup betreffen Wrapt-Metadaten und eigene temporäre Teile, niemals native Coredateien.
Core besitzt keine belegte sichere Staging-TTL; kein Gesamt-Diskquota-Versprechen.

Multipart streamend begrenzen (files1,fields0,parts1, kleine Headergrenze), beim ersten
Oversize abbrechen, Tempteile immer entfernen. Erst nach Größenprüfung Base64 bilden.
4MiB ergeben5592408 Base64zeichen, unter dem bestehenden8MiB-Upstreambudget;
vollständige serialisierte RPC-Größe trotzdem VOR Send prüfen. Browser-1MiB-WS-Limit bleibt.
Native Methode nur `file.attach {session_id:liveId,data_url,name:generierterSafeName}`.
Kein path-Input, keine gemeinsame attached_images-Queue. Sie kann über `_sess_building`
einen kalten Agentbuild starten: explizite Uploadmutation, kein passiver Katalogread.
Native Antwort attached/uploaded/path/ref_path/ref_text streng prüfen; Dateiname aus opaqueID
mit begrenzter sicherer Extension. Anzeigename getrennt bereinigen und poolweit maskieren.

Stagingroots aus bestätigtem Profilehome/attachments beziehungsweise geprüftem
CWD/.hermes/attachments vorprüfen; Ergebnispath anschließend realpath/stat/regular-file
und Größe prüfen. Nur eigene Uploadbytes, kein generischer Dateiproxy.
Die native Dateireferenz validieren und für Submit denselben geprüften absoluten Pfad
mit belegter @file-Quotierung verwenden; relative Pfade dürfen bei CWD-Wechsel nicht retargeten.
Unrepräsentierbare Pfadquotierung ablehnen. Text plus Referenzen vor Send auf Gesamtlimit prüfen.
Quelle: `methods_prompt.py:976–1000`, `prompt_attachments.py:83–129,157–244`,
`agent/context_references.py:287–320,487–546`, `prompt_turn.py:700–721`.

Eigentum ausschließlich zusätzliche Tabelle in vorhandener OrganizationRepository-SQLite:
ID,Owner,Scope,Stored/Canonical,live/Epoch,CWD,Upload-ID,Zustand,Revision,interner Pfad/Ref,
stat dev/ino/size/mtime/ctime,bereinigter Name/MIME,created/used/expiresAt,positive userRowId falls vorhanden.
Keine Bytes/Prompts/Secrets und keine zweite DB. Reservierung/Ready/Unknown per SQL-CAS;
Principal+Upload-ID eindeutig, doppelte Versuche führen nie nochmals native Stage aus.
Download: Owner+Scope+opaqueID, neu realpath/Dateiidentität und zulässigen Root prüfen,
Descriptor mit O_NOFOLLOW öffnen und fstat erneut vergleichen, nur octet-stream,
Content-Disposition attachment,nosniff,no-store. Keine App-Origin-HTML/SVG/PDF-Ausführung.
Submit prüft alle IDs vor Mutation, echte Canonical/live/Epoch/CWD-Bindung und stat erneut.
Neue Browserconnection darf eigene IDs bei gleicher Runtimebindung bewusst erneut verwenden;
Core-Neustart/CWD-Wechsel verlangt neue Uploadbestätigung, kein automatisches Rebinding.
Historykarten nur bei positivem user_row_id/anderem konkreten Beleg verbinden, nie per Textheuristik.

Nach beweisbarem Vorsendfehler not_sent; nach möglicher Annahme einschließlich Corefehler,
Timeout, ungültigem Resultat oder fehlgeschlagenem Nachcheck unknown. Keine automatischen Retries,
kein Coredatei-Löschen bei Cancel/Unmount. Unbekannte Uploads sind nicht submitfähig.
Lücke wie bei bestehenden Mutationen: bereits autorisierte Classic-/CLI-Akteure können parallel
CWD/Storage ändern; lokale Queue ist keine Prozesssperre. Core hat kein expectedCwd/ifIdle/nofollow-CAS.
Vor-/Nachchecks erkennen Abweichungen: unknown,keine IDfreigabe. Keine Dateisnapshotgarantie;
absolute Referenzen verhindern Retargeting. Niemals attachments.storage global umschalten.
Native Vision/PDF-Zuordnung bleibt ohne atomaren Promptvertrag unsupported; Binärdateien sind Referenzen.
REST-Alternative: feste serverkonstruierte `<profileHome>/attachments/wrapt/<ID>` über
`/api/files/upload-stream`, danach dieselbe belegte absolute @file-Bindung, ohne Agentbuild/CWD-Zielwahl.
`files.py:630–722` nutzt Tempfile/Rename; `web_server_files.py:144–192` prüft env/Home-Root, nicht Session.
Das engere feste Ziel ist eine sinnvolle spätere Option; es braucht aber einen neuen festen Token-
Multipartwriter und Rootnachweis. Bestehender DashboardClient kann das nicht, kein freier Pfadproxy.

## Umsetzung nach Gate

Contracts: neue hermes-v2-composer.ts/-attachments.ts, kleine optionale Erweiterungen in
messages/events/catalog und vorhandenem V2-Subpath, kein index.ts-Wachstum.
Backend: `composer-operations.ts`, `normalize-command-metadata.ts`, `normalize-settings.ts`,
`binding-guard.ts`, `attachments/{routes,service,binding,store,files,policy}.ts` plus Tests;
kleine Hooks in Operations/Pool/Session-Service/Browserprojektion, alle Dateien unter400.
Tests: echtes Katalogshape/Aliasüberschattung; title pending; Effort nur session/idle,
requested≠wire/lazy/defaultfalse/keine Globalwrites; alte Opt-in-lose Frames exakt;
Auth/Origin/fremde Conn/Owner/Scope/Abo, Unsubscribe→Resubscribe, Flagoff nach Await,
Oversize vor Base64/RPC, CWD/Epoch/Transport/Symlink/stat-Wechsel,2Tabs,Cancel,Reopen,
Duplicate-Upload-ID/CAS/Unknown ohne Retry, TTL/Downloadheader und unveränderte Bildqueue.
Nur dieser Entwurf geschrieben. Produkt-/Runtimefreeze bleibt bis ausdrücklicher Phase-6-Freigabe.

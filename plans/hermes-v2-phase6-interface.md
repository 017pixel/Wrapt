# Phase 6: feste Client-/Backend-Schnittstelle

Verträge im bestehenden `@wrapt/contracts/hermes-v2`-Subpath. Ab diesem Checkpoint
für parallele Clientarbeit stabil. Implementierungsstatus ist kein unabhängiges Gate.

## Opt-in

WS `/api/v1/hermes/v2/gateway?readEvidence=1&composer=1`.
`composer=1` ist optional und strikt. Nur dann enthalten Connectionframes die tatsächliche
`connectionId:uuid` sowie die unten genannten neuen Katalog-/Composer-/Historyfelder.
Ohne Opt-in werden additive Felder tatsächlich ausgelassen, nicht nur optional typisiert.
Connection-ID wechselt bei jeder Browser-WS und autorisiert allein nichts.

## Exportierte Schemas und Typen

- `hermesV2EffortSchema` / `HermesV2Effort`: none/minimal/low/medium/high/xhigh/max/ultra.
- `hermesV2ComposerSettingsSchema` / `HermesV2ComposerSettings`:
  `{reasoning:{effort:string|null,wire:string|null},approvals:{mode:manual|smart|off|null,
  effectiveBypass:boolean|null,scope:'global',editable:false}}`.
- `hermesV2AttachmentIdSchema`: 64 kleine Hexzeichen, serverseitige 256-Bit-ID.
- `hermesV2AttachmentSchema` / `HermesV2Attachment`:
  `{id,name,bytes,mime,kind:'file-reference',expiresAt}`; Name≤200,MIME≤100,
  Bytes1..4194304,Zeit integer Server-ms. Kein Pfad/ref_text/Providercredential.
- `hermesV2UploadStatusSchema` / `HermesV2UploadStatus`:
  `{uploadId:uuid,state:'receiving'|'ready'|'not_sent'|'unknown',attachment:Attachment|null}`.
- `hermesV2AttachmentErrorSchema`:
  `{code:string,message:string,outcome:'not_sent'|'unknown',uploadId?:uuid}`.

## WS-Domänenoperationen

Alle behalten `{v:1,id:uuid,sessionId:Id}` sowie vorhandene Result-/Errorenvelopes.

| op | Eingabe zusätzlich | data im Resultat |
| --- | --- | --- |
| session.title | title,trim/nonempty/≤200 | `{title,pending:boolean}` |
| reasoning.select | effort:Effort,selection:Selection | `{requested:Effort,observed:ComposerSettings,observation:'observed'|'unconfirmed'}` |
| message.submit | text,mode? wie bisher,attachmentIds?:ID[1..10] | bisher `{status,userRowId}` |

Attachment-IDs müssen eindeutig sein. Text darf nur mit mindestens einer ID leer sein.
Keine automatische Wiederholung einer Mutation. Unknown bleibt bis bewusster Klärung bestehen.
Effort ist sessionbezogen und idle-only, erwartet das aktuelle Provider-/Modellpaar.
`requested` ist akzeptierter Wunsch; `observed.reasoning` stammt aus echter Sessioninfo.
Bei Lazy-Agent kann observation unconfirmed bleiben. Wire muss von effort getrennt angezeigt werden.
`none` nur anbieten, wenn das aktuelle Modell canDisableReasoning ausdrücklich true meldet.
Approvals sind global und ausschließlich lesbar. Kein Manual/Smart/Off-Setter/YOLO.
Title pending ist kein garantiert bereits persistierter Titel. Kein globaler Classic-CAS.

## Projektionen

Snapshot erhält optional `composer:ComposerSettings`; dieselbe optionale Eigenschaft
steht in `session.updated.payload`. Bestehendes reasoningEffort bleibt kompatibel.
Katalogcommands erhalten optional:
`aliases:string[≤100],argumentMode:'options'|'text'|'mixed'|null,subcommands:string[≤100],
desktopSubcommands:string[≤100]|null`. Strings≤200, Aliase sind Suchbegriffe derselben
kanonischen Zeile, keine Duplikate. argumentHint wird weiterhin benutzt.
Modelle erhalten optional `reportedReasoning:boolean|null,canDisableReasoning:boolean|null`.
Katalogdata erhält optional `hermesEfforts:Effort[]`. Bestehendes reasoningEfforts=[]
bleibt leer, es gibt upstream keine bestätigte modellbezogene Effortliste.
Skills bleiben erkennbare Agentanweisung im Composer. Nicht heimlich senden/expandieren.
Unsupported-Commands bleiben disabled; keine freien Command-/RPC-Endpunkte.
Historische Userrows erhalten optional `attachments:Attachment[]` ausschließlich bei
positiv belegtem nativen userRowId des eigenen Submitreceipts. Kein Textmatching.
Absolute @file-Pfade können in nativer Userhistory weiterhin sichtbar sein; keine
allgemeine Pfadgeheimhaltung behaupten. Download verwendet ausschließlich opaque IDs.

## HTTP-Anhänge

POST `/api/v1/hermes/v2/attachments?sessionId=Id`:
`X-Hermes-V2-Connection-Id:uuid`, `X-Hermes-V2-Upload-Id:uuid`, genau ein Multipartteil
`file`, keine weiteren Formfelder. Erfolg200 mit UploadStatus state=ready.
Upload-ID pro absichtlichem Versuch erzeugen, bei unbekanntem Ergebnis nicht neu hochladen.
GET `/api/v1/hermes/v2/attachments/uploads/:uploadId` liest eigenen Status ohne Mutation.
GET `/api/v1/hermes/v2/attachments/:id` liefert autorisierten Download:
octet-stream/attachment/nosniff/no-store, keine Inlinebilder/PDF-Ausführung.
Normale Workbench-Auth und Same-Origin gelten; CORS-/Path-/Profil-/Ownertunnel fehlen bewusst.
Fehler400/403/404/409/413/429/503 mit AttachmentError. Timeout nach möglichem Staging ist unknown.

An Upload gebunden: tatsächliche Originalconnection, laufende Subscriptiongeneration,
Principal, bestätigter Profil/Home-Scope, Stored/Canonical-ID, live/Epoch/Transport und
realpath-CWD. A→B→A während Upload ist stale. Flagoff/Close verbietet neue Mutationen.
Uploadstatus ist eigentumsgebunden; eine Verbindung-ID fremder Tabs genügt nicht.
Neue eigene Connection kann IDs bewusst wiederverwenden, wenn Canonical/live/Epoch/CWD
unverändert passen. Neue Runtime/CWD verlangt erneutes Anhängen; kein stilles Rebinding.

Limits:4MiB/Datei,10IDs/Submit,1 laufender Upload/Principal,2 gesamt,60s Bodydeadline,
64 offene Reservierungen/Owner,512 gesamt,512 Eigentumsrows/Owner,4096 gesamt.
Unbenutzt24h,verwendete Downloadprojektion90Tage. TTL löscht keine nativen Coredateien.
Ein expliziter Upload kann im Core einen kalten Agentbuild starten. Kein passiver Read.
Dateien sind @file-Referenzen, keine garantierte native Vision-/PDF-Turnbindung.
Cancel/Unmount entfernt nur eigene unvollständige Uploadteile. Keine Coredateien löschen.
Native Storage/CWD-CAS gegenüber autorisierten Classic-/CLI-Akteuren fehlt;
bei erkannter Abweichung unknown statt Erfolgsbehauptung. Kein globales Storageumschalten.

Client-/UI-Autoren ändern diese Contracts nicht parallel. API-Abweichungen an Root melden.

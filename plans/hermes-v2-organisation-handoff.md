# Hermes V2: Organisation, Belege und Sidebar

Verbindliche Vorbereitung für Phase 4, Stand 16.10.2026. Grundlage sind
Originalauftrag, Organisationsreview/R2 sowie `hermes-v2-attention-reconciliation-research.md`
und `hermes-v2-organisation-evidence-addendum.md`. Dieser Stand ersetzt die dort
beanstandeten Cursor-/Offline-Zusagen. Keine Produktimplementierung oder Registrierung,
auch keine Metadatenmutation, vor Phase-3-Gate und unabhängigem Entwurfsreview.

## Datenhoheit und unterstützte Grenzen

Hermes besitzt Sessions, Nachrichten, Laufzustände und offene Requests. Wrapt hält
nur inhaltsfreie Belege, Organisation, ACKs und Abdeckung in seiner vorhandenen SQLite.
Keine Transcriptkopie, Secret-/Approval-Antwort, direkte Hermes-DB-Anbindung,
Upstream-Patches oder zweite Hermes-Instanz. Alle Quelllesungen nutzen bestehende APIs.

Faktenarten sind `live-turn-end`, `new-answer` und `decision-error`.
Ein echtes `message.complete` belegt ein Live-Turnende, nicht automatisch Erfolg
oder vollständige Persistenz. `persisted_turn.complete` und finale Assistant-Row
belegen die entsprechende persistierte Zuordnung, keine beliebigen Tool-Rows.
REST-Summaries enthalten keine finale Row-/Turn-ID. Ein belegbar neuer terminaler
`stop`-Antwort-Row darf „Neue Antwort“ melden, niemals allein „Agent fertig“ oder
`running=false`. Toolcalling-, Verification-, Scaffold-, Summary-, Commentary-,
leere/reasoning-only Rows sind keine solchen Antwortbelege. Bekannte Nichtfinal-
Gründe wie `length`, `incomplete`, `verification_required`, `verify_hook_continue`
und `kanban_terminal_required` werden ausgeschlossen; unbekannte Gründe bleiben offen.

Recovery ohne Finish-Reason und unbekannte Writer/Imports bleiben unbestätigt.
`is_active`, permissives `session_lifecycle_statuses` und Nachrichtenzähler beweisen
keinen Turnabschluss. Fehlende universelle durable Turn-Receipts, fehlende Anchors
und verlorene Invalidierungen sind unterstützte Abdeckungslücken, keine erfundenen
Completions. Dafür ist keine zusätzliche Nutzerfreigabe erforderlich; UI und Tests
zeigen „Abgleich unvollständig“. Reale Laufzustände bleiben unabhängig davon sichtbar.

## Identität und verbindliches Datenmodell

Server bildet `source_scope` aus konfiguriertem Core und tatsächlich bestätigtem
Profile-/Storekontext. Browser kann weder diesen Scope noch Profil/Principal wählen.
Immutable UUID-Source-IDs bezeichnen innerhalb dieses Scopes und des bewiesenen
Session-/Branchkontexts entweder eine logische `message_uid` oder ein vollständiges
Live-Ereignis `(epoch,liveId,seq)`. Eine Row-ID allein ist kein dauerhafter Schlüssel.
Ohne sichere UID-/Eventidentität wird kein dauerhafter Read-Beleg ausgestellt.

`messages.id` ist die echte physische Row-Adresse, kein angenommenes `row_id`-Feld.
Gleiche UID belegt Kopien/Rewrites. `absorbed_message_uids` belegt gerichtete
Abdeckung durch eine Merge-Projektion, keine Gleichheit mehrerer echter Abschlüsse.
Nur passende Assistant-/Fehlerbelege verbinden, niemals User-Merges zu Turnenden machen.
Root/Tip nur entlang belegter Compression-Continuation verbinden; Branch/Fork bleibt
getrennt. Keine automatische Übernahme privater Organisation auf andere Stored-IDs.

Row-/Event-Aliase benötigen explizit `persisted_turn.final_assistant_row_id` im
bestätigten Quellkontext und nachgewiesene UID. `user_row_id`, letzter Assistant,
Textgleichheit, Zeitnähe oder höheres MAX(id) genügen nicht. Bei cursor-only ohne
Row-Zeuge bleibt die spätere History-Überlappung ungeklärt; keinen zweiten bestätigten
Turnabschluss erzeugen. Neue Row-ID/alte UID ist keine neue Antwort. UID-Konflikt,
Row-Reuse ohne UID oder unbewiesener Storewechsel ergibt `identity-unknown`.
Immutable Source-IDs und akzeptierte ACKs werden dabei niemals auf neue Inhalte umgebogen.
Neue Belegart derselben bewiesenen Antwort wertet deren bestehenden Fakt auf;
keine zweite Attention oder neuer Wake allein durch stärkere Evidenz.

Tabellen, jeweils nur Kennungen/Zahlen/Enums, keine Nachrichteninhalte:

- `hermes_v2_sources`: Source-ID, Scope, exakte Stored-/Branchzuordnung, Art,
  UID/Eventschlüssel und bewiesene Row-Referenzen; eindeutige Source-Identität.
- `hermes_v2_attention_facts`: Fact-ID, Source-ID, Art, monotoner Change-Cursor,
  serverseitiges `observed_at`, belegtes `completed_at` nullable. Beobachtungszeit
  dient Sortierung, wird niemals als ursprüngliche Abschlusszeit ausgegeben.
- `hermes_v2_source_links`: bewiesene Gleichheit beziehungsweise gerichtete
  Projektionsabdeckung. Keine automatisch wachsende transitive Read-Abdeckung.
- `hermes_v2_read_acks`: eindeutiges `(owner_id,source_id)` samt ACK-Zeit.
  ACK vor Fact-Ingest ist damit bereits darstellbar, ohne Nachrichten zu speichern.
- `hermes_v2_session_metadata`: `(owner_id,source_scope,stored_session_id)`,
  `revision` ab 0, nullable ganzzahliger `pin_rank`, `snoozed_until/snoozed_at/settled_at`,
  `organization_cursor`, `organization_coverage_revision`, `updated_at`.
  Kein `last_read_attention` als Read-Ersatz.
- `hermes_v2_pin_lists`: `(owner_id,source_scope)`, monotone Listenrevision.
- `hermes_v2_reconciliation`: Scope/Stored-ID, logischer Anchor, bekannte Source-IDs,
  `baseline|anchored|gap|identity-unknown`, stabile Abdeckungsrevision und Grundcode.

Offene Abdeckung ist kein Nachrichten-/Completion-Fakt. Neue ungeklärte Materialien
erhöhen die Abdeckungsrevision; unveränderter Gap bei erneutem Scan tut dies nicht.
Alle Org-Aktionen laufen unter `BEGIN IMMEDIATE` mit erwarteter Revision, Konflikt
409 plus aktuelle eigene Metadaten. Fakt-Ingest und ACK sind stattdessen monotone,
idempotente Mengenvereinigungen unter derselben Transaktion, kein verwerfbares Row-CAS.
Neue Fakten/ACKs/semantische Aliasänderungen erhöhen konservativ betroffene bestehende
Metadatenrevisionen. Events dürfen bei einer parallelen Org-Aktion nicht verloren gehen.

## Konkrete Read-Belegschnittstelle

Der öffentliche Snapshot hat aktuell keine Attention-/Live-ID-Belegbrücke. Phase 4
ergänzt `readEvidence: string | null` an normalisierten Assistant-Messages aus
Snapshot/History sowie an `message.completed` und entscheidungsbedürftigen Fehlern.
Kein gemeinsamer Snapshot-Maximumbeleg. Ausgabe nur bei explizitem WS-Opt-in
`?readEvidence=1`; ältere V1-Clients erhalten unveränderte strikt validierte Frames.
Neue Schemas akzeptieren das optionale nullable Feld, ohne es als Pflicht für Chat
vorauszusetzen. Capability und REST-Historyprojektion müssen gemeinsam geprüft werden.

`readEvidence` ist ein kryptographisch zufälliger 256-Bit-Handle, kein codierter
Principal, Profilname oder Inhalt. Eine kleine speichergebundene Evidence-Registry
ordnet ihn serverintern Auth-Owner, Scope, exakter Session und einer bei Ausgabe
eingefrorenen Source-ID-Menge zu. TTL 15 Minuten, maximal 4096 Handles pro Owner,
16384 insgesamt, maximal 64 Source-IDs pro Handle. Erst abgelaufene, dann älteste
Handles entfernen; Übergröße ergibt null/ungeklärte Abdeckung, niemals breiteren Read.
Limits zentral in `organization/policy.ts`, Tokens weder loggen noch persistieren.

Registry-Handle ist der gleichwertige kleine Mechanismus statt eines Signers.
Keine zusätzliche Signer-/Snapshotgeneration nötig: kein veränderlicher Cursor wird
signiert, Source-IDs werden nie neu belegt, ein alter Handle bestätigt nur alte Quellen.
Neustart leert die Registry; alte Handles sind ungültig. Socketrotation allein muss
exakte alte Belege nicht entwerten. UI-Owner-/Auswahlgeneration verhindert dennoch
Reads aus verspäteten oder geparkten Renderpfaden. Keine angebliche universelle
Store-Inkarnationskennung aus unzureichenden REST-Feldern erfinden.

Projektor stellt Sources und Handle aus exakt derselben Quellprojektion bereit,
die den sichtbaren Row-/Eventpayload erzeugt, vor dessen Ausgabe. Keine nachträgliche
unabhängige Metadatenabfrage. Ingest des Fakts darf danach erfolgen. Nur ungekürzte,
vollständig darstellbare Assistant-/Fehlerprojektionen tragen einen vollen Beleg.
Bei Merge wird die im ausgegebenen Inhalt belegte Source-Menge bereits hier fixiert;
später zusätzlich gefundene absorbed UIDs erweitern diesen alten Handle nicht.

`read` übernimmt nach Auth/Scope-/Session-/TTL-Prüfung ausschließlich die Source-IDs
der übergebenen Handles. Aktiver sichtbarer Chat sendet nur tatsächlich angewendete,
dargestellte Antworten/Fehler; nicht Summary, Sidebar, Baseline, Inflight-Fragment,
abgeschnittener Inhalt oder geparkter/versteckter Tab. Fehlender Beleg bleibt ungelesen.
Ungültiges Batch atomar mit `READ_EVIDENCE_EXPIRED`/`READ_EVIDENCE_INVALID` ablehnen;
frische belegte Chatprojektion laden, keinen pauschalen ACK-Fallback anbieten.

ACK vor Ingest bleibt bei exakt dieser Source. Späterer Fakt derselben bewiesenen
Quelle gilt gelesen, anderer späterer Fakt nicht. Bei Gleichheitsalias darf allein
dieselbe bewiesene logische Antwort gelesen gelten; gerichtete Merge-Kanten erzeugen
keinen neuen ACK. Weder größter dargestellter Fact-Cursor noch aktueller Metadata-
Cursor oder HTTP-Zeit bestätigen ungerenderte frühere oder später entstandene Fakten.
Change-/Org-Cursor sind keine Read-Grenze; Phase 4 implementiert keine Präfixoptimierung.

### Rückweg nach Belegablauf oder verlorenem Replay

GET `/organization/notices?sessionId=...` projiziert im aktiven Chat höchstens
100 eigene historische Hinweise aus inhaltsfreien Fakten; Pagination über Cursor.
Ein `historical-decision-error` enthält stabile Notice-ID, beobachtete/belegte Zeit,
den festen Text „Historischer Agent-Fehler. Details sind nicht mehr verfügbar.“
und einen frischen `readEvidence`-Handle mit exakt seiner Fehlerquelle. Das ist
kein rekonstruierter Fehlertext und bestätigt keinen offenen Hermes-Request.
Fehlerquellen besitzen einen eigenen semantischen Namespace zum Eventschlüssel;
sie werden niemals mit Assistant-/Antwortquellen gleichgesetzt. Ihr Notice-ACK
bestätigt ausschließlich diesen Entscheidungsfehler, auch bei späterem Row-Alias.
Handle-Ausgabe ist wie bei Chatprojektionen Owner-/Scope-/Session-gebunden.
Sidebar/Notice-Liste laden allein erzeugt keinen ACK; nur dargestellter aktiver Chat.

Für verlorene Antwortinhalte gibt es keinen Ersatz-Read über generischen Text.
Eine ausschließlich eventbasierte Antwort ohne Row-Zeugen, deren Original nach
Epochenwechsel oder nachgewiesener Replay-Eviction nicht rekonstruierbar ist,
bleibt unbestätigt. Der Server projiziert `unavailable-content` ohne Read-Handle
und eine an diese Quelle gebundene Abdeckungslücke. Diese nicht darstellbare
Quelle erzeugt vorerst keine zusätzliche relevante Antwort-Attention neben der
sichtbaren Lücke; ihr ACK bleibt unverändert. Bewusste Org-Aktion kann die bekannte
Lückenversion organisieren. Wieder belegbar verfügbare Inhalte erhöhen die
Abdeckungsrevision und werden erneut ungelesen relevant. Fehlende neueste Rows
allein beweisen keine Eviction; ältere vorhandene History bleibt nachladbar.

## Fachliche TS-Verträge und geplante Routen

```ts
type FactKind = "live-turn-end" | "new-answer" | "decision-error";
type Coverage = "baseline" | "anchored" | "gap" | "identity-unknown";
type FactView = {
  id: string; kind: FactKind; unread: boolean; relevant: boolean;
  observedAt: number; completedAt: number | null;
};
type OrganizationView = {
  sessionId: string; revision: number; pinRevision: number; pinRank: number | null;
  snoozedAt: number | null; snoozedUntil: number | null; settledAt: number | null;
  effectiveSnoozedUntil: number | null; effectiveSettledAt: number | null;
  organizationCursor: number; organizationCoverageRevision: number;
  attention: { unreadCount: number; requiresAttention: boolean; latest: FactView | null };
  coverage: { state: Coverage; revision: number; reason: string | null };
  serverNow: number;
};
type ReadProjection = { readEvidence?: string | null };
type ReadAck = { sessionId: string; evidence: string[] }; // 1..64, je <=128 Zeichen
type ReadResult = {
  revision: number; acknowledgedSources: number; pendingSources: number;
  readFactIds: string[]; serverNow: number;
};
type Organize = {
  sessionId: string; expectedRevision: number;
  action: "pin" | "unpin" | "snooze" | "wake" | "settle" | "unsettle";
  snoozedUntil?: number; // ausschließlich bei snooze
};
type Reorder = {
  expectedPinRevision: number;
  entries: { sessionId: string; expectedRevision: number }[];
};
type Undo = { handle: string }; // Auth-Owner serverseitig, TTL 10 Sekunden
type ReadError = { code: "READ_EVIDENCE_EXPIRED" | "READ_EVIDENCE_INVALID" };
type HistoricalNotice = {
  id: string; kind: "historical-decision-error" | "unavailable-content";
  observedAt: number; completedAt: number | null; readEvidence: string | null;
}; // Fehlerhinweis bestätigt nur Fehlerquelle; unavailable-content immer null.
```

Zod-strikte fachliche Varianten, UUIDs/IDs/Arraygrößen validieren. REST geplant unter
`/api/v1/hermes/v2/organization`: GET Metadaten batchweise mit maximal 100 IDs,
POST `/read`, `/action`, `/reorder`, `/undo`. Mutierend Same-Origin und normale
Workbench-Identität. Weder Owner/Scope/Profile noch freie Source-/Fact-IDs werden als
Read-Ersatz angenommen. `read` ist add-only ohne erwartete Revision; Org-Aktionen
und Undo behalten CAS. GET liefert `OrganizationView[]`, höchstens 100 Einträge;
Attention-Zähler werden über alle relevanten Fakten berechnet, nicht über eine
abgeschnittene Beispielmenge. `ReadResult.readFactIds` höchstens 4096 IDs.
Resultate enthalten nur eigene und berechtigt sichtbare Daten.

## Reconciliation und gemeinsame Invalidierung

Erstkontakt: neueste 64 Rows nur als Baseline; keine alten Antworten neu publizieren,
keine privaten Reads vorziehen, echte vorhandene Livefakten nicht verdrängen.
Bei Start, Reconnect, Wiederöffnen nach Flag-off und bestehendem globalem
`sessions.changed` bekannte organisierte/sichtbare Sessions priorisieren. Summaries
seitenweise lesen, sind nur Änderungsanlass. Neueste 64 Rows, bei fehlendem Anchor
eine zweite Seite zu 64; nie weiter bis Transcriptanfang. Nur nach wiedergefundenem
logischem Anchor belegbar neue Source-Identitäten als `new-answer` prüfen. Unknown
oder fehlender Anchor bleibt Gap; keine MAX(id)- oder Timestamp-Completionheuristik.

Core-weit single-flight, zwei History-Worker, maximal 512 deduplizierte Dirty-IDs.
Überlauf setzt einen erneuten begrenzten Summary-Durchgang und sichtbare offene
Abdeckung, verwirft nicht still die Verantwortung. Weiterarbeit nur über denselben
ereignisgesteuerten Scheduler, keine periodische Pollschleife, zusätzliche Sockets,
Resumes oder komplette Histories. Globale Invalidierung enthält keine IDs und ist
lossy; Offline- oder In-place-Änderungen ohne Signatur können unentdeckt bleiben.

Nach Commit private Änderungen via `publishMetadataInvalidation(principal,id,revision)`.
Gemeinsame Fact-/Abdeckungsänderungen erreichen alle berechtigten betroffenen Manager,
auch Summary-only/Snoozed; Metadaten pro Principal anschließend separat laden.
Neue Principals sehen gemeinsame Fakten, niemals fremde ACKs/Pins/Snoozes/Undo-Handles.
Kein Browsertraffic bei Flag-off; Abgleich beim erneuten Öffnen stellt begrenzte
Abdeckung her, keine universelle Offline-Agent-Fertig-Garantie.

## Zustandsauflösung, Zeit und Organisationsaktionen

Gruppenansicht: Pinned, Needs input, Active, Working, Snoozed, Settled. Resolver:

1. Offener Request oder nicht bestätigter Entscheidungsfehler: Needs input.
2. Relevanter nicht exakt bestätigter Live-/Antwortfakt oder neuer ungeklärter
   Abdeckungshinweis: Needs input, ehrlich nach Belegart beschriftet.
3. Effektiv zukünftiger Snooze; danach effektiv Settled; danach Pin-Modifikator.
4. Echter laufender Turn/Subagent/Background: Working; sonst Active mit unknown,
   falls der Laufzustand nicht belegt ist. Eine Session genau einmal, Pin bleibt.

Snooze/Settle merken Serverzeit und aktuellen `organization_cursor` sowie bekannte
Abdeckungsrevision. Neue Fakten nach dieser Grenze entwerten Organisation dauerhaft,
auch nach Read. Belegte ursprüngliche Abschlusszeit vor der Aktion bleibt alt;
bei unentscheidbar späten/gleich datierten Fakten konservativ sichtbar bleiben.
Alter Gap bleibt als Hinweis sichtbar, eine bewusste Org-Aktion bestätigt aber
dessen bekannte Attention-Version. Neuer späterer Fakt/Gap weckt erneut. Ein danach
neu gesetzter Snooze/Settle wirkt wieder; keine Bewegung durch Token-/Toolfrequenz.

Pin/Unpin ändern nur Pin-Metadaten. Snooze verlangt Zukunft, höchstens ein Jahr,
mit offenem Request ablehnen; `snoozed_at=now`, Ziel setzen, Settled entfernen.
Wake/Unsettle entfernen Snooze/Settled, Pin erhalten. Settle setzt `settled_at=now`,
entfernt Snooze, stoppt Hermes nie und verbirgt keine offenen Requests/Fehler.
Reorder prüft atomar volle aktuelle Pin-Mitgliedschaft, alle Row-Revisionen und
Pin-Listenrevision; doppelte/fremde Metadaten-IDs ablehnen, ganzzahlige Ränge vergeben.
Pin/Unpin/Reorder und deren Undo erhöhen die Listenrevision. Undo ist Owner-gebunden,
kurzlebig und nur bei unveränderten betroffenen Revisionen möglich; Reorder-Undo
prüft Listenrevision. Read/Facts/Aliase können Undo konservativ verhindern, Konflikt
verständlich anzeigen. Restore setzt niemals ACKs, Fakten oder Abdeckung zurück.
Undo-Registry begrenzen: 100 Handles pro Owner, 1000 insgesamt, TTL 10 Sekunden.

Working sortiert absteigend nach echtem Turnstart, Needs input nach belegter Ereigniszeit,
sonst ausdrücklich Beobachtungszeit; Active nach Aktivität, Snoozed nach Wake-Zeit,
Settled nach Org-Zeit, IDs brechen Gleichstände. Serverzeit plus monotone Browserdauer;
ein gemeinsamer Timer, keine Zeilentimer. Snooze-Presets 30 min, 1 h, heute Abend
20 Uhr/nächster Abend, morgen 9 Uhr, Custom mit Zeitzone/DST-Kalenderprüfung.
Drop-Ziele nur Pinned/Active/Settled; Active-Drop entfernt jeweilige Organisation,
nie einen Request. Snoozed nur Quelle; Working/Needs input keine manuellen Ziele.

## Module, UI und Pflichtnachweise

Contracts featurelokal `hermes-v2-organization.ts`, koordinierte optionale
Chatprojektion im Feature-Subpath, kein großer Contracts-Barrel. Server unter
`hermes/v2/organization/`: `sources`, `facts`, `acks`, `evidence`, `projection`,
`reconcile`, `repository`, `actions`, `routes`, `policy` plus fachliche Tests.
Projection wird später am echten Normalisierungs-/Ausgabepfad koordiniert;
aktueller onAttention-Hook allein kann die Read-Belegbrücke nicht ersetzen.
Web: State/Client/Hook getrennt von Sidebar/Row/Shelf/Actions/Snooze-Sheet. Alle Dateien
unter 400 Zeilen. Shelf-Collapse versioniert browserlokal, Suche Titel/ID/CWD gegen
echten Katalog, Settled begrenzt laden. Menü-/Tastaturalternative für jedes DnD,
44-px-Touchziele, mobil Bottom Sheet, Requests/Auswahl trotz Collapse erreichbar.

Tests vor Integration: alle Prioritäten, Pin+unseen, neue/alte Settled-/Snoozefakten,
Working+Request, dauerhafter Wake nach Read und neues Snooze, keine doppelten Zeilen.
Snapshot A → Fakt B → Read(A) liest nur A, B vor/nach Ingest, gleiche Millisekunde;
nur späterer Fakt dargestellt lässt früheren ungelesen; ACK vor Fact und spätere
Gleichheits-/Mergekanten lesen ausschließlich belegte Quellen. Keine Metadata-Max-ACKs.
Handles falsch/abgelaufen/anderer Owner/Session, Replay idempotent, Registrylimits,
Restart, neue Socket-/Auswahlgeneration, gekürzte/versteckte/geparkte Projektionen.
Reiner Livefehler ohne Row, Owner B ohne alten Handle, TTL/Eviction/Restart:
frischen historischen Fehlerhinweis darstellen und exakt bestätigen; andere
Quellen/Requests bleiben ungelesen/offen. Verlorener Antwortinhalt wird als Lücke
organisierbar, nie gelesen; Wiederverfügbarkeit weckt erneut. Späteres Error-/Row-
Mapping darf einen Notice-ACK niemals auf ungesehene Antwortinhalte ausweiten.
Gemischt gültig/ungültiger ACK-Batch bleibt atomar; alte Clients ohne Opt-in
erhalten keine neuen Felder, alle Snapshot-/History-/Eventprojektionen nutzen denselben Belegpfad.
UID-Kopie/neue Row-ID, directed absorbed Coverage, Row-Reuse/Restore ohne UID,
Root/Tip gegen Branch, cursor-only ohne Alias, gleichlautende echte Antworten.
Baseline ohne Attention, stop-Antwort ohne Agent-Fertig, Verification/Toolcalls
ausgeschlossen, Recovery ohne Finish unknown, Anchor fehlt nach 128 Rows, lost Event,
CLI ohne Dashboard-Runtime, Workerlimit/Dirty-Überlauf und keine neue Pollschleife.
Zwei Principals mit gemeinsamen Fakten/privaten ACKs; Pin-Reorder gegen Pin/Unpin,
CAS-Konflikt, Undo nach Read/Fact/Wake, Ablauf und Restart; DST/Wake/legale Drops.
Komponenten/Browser später: 50+ Sessions, 20 Working, 390/768/1024/1440 px, Keyboard,
Touch, Suche/Collapse/Undo, zwei Tabs und Flag-off ohne V2-Traffic. Kein Phase-4-Code jetzt.

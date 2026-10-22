# Phase 4: nonvisueller Webteil

Stand: 16.10.2026. Implementiert und für die unabhängige Prüfung eingefroren.
Grundlagen: Originalauftrag Phase 4, Organisation-Handoff, Evidence-Gate R4 und
Phase-4-Interfaceentscheidungen. Keine Freigabe des gesamten Phase-4-Produkts.

## Stabile UI-Schnittstelle

`sidebar-types.ts` veröffentlicht `HermesV2Sidebar`, `HermesV2SidebarOptions`,
`UseHermesV2Sidebar`, Rows/Groups/Search/CAS-/DnD-/Snooze-/Undo-Typen sowie
`HermesV2ReadView`. `useHermesV2Sidebar.ts` implementiert diesen Hook.
Options: `ownerId`, optional `sessionId`, `active`, `visible`, `projectId`.
Die tatsächliche Auswahl und alle Entwürfe bleiben beim vorhandenen Chatowner.
Der Sidebarhook erstellt weder einen Chatowner noch einen zweiten Socket.
Alle Promise-void-Aktionen resolven und zeigen Fehler im Viewmodel.

`readView.generation` ist eine ausschließlich vom Runtime ausgestellte opake
Referenz. UI reicht sie mit explizit sichtbaren, vollständig dargestellten
Row-/Notice-Handles an `onVisibleEvidence(generation, handles)` zurück.
Generation wird bei Owner-/Auswahl-/Snapshot-/Sichtbarkeitswechsel ersetzt.
Messages tragen optionale `readEvidence`, historische Notices und tatsächliche
Livefehler erscheinen in `readView.notices`. Kein neues globales activeId.

## Module und Verantwortung

- `sidebar-resolver.ts`: deterministische Priorität, Sortierung, Pin als
  Modifikator, unbekannte Counts/Startzeiten, genau eine Gruppe pro Session.
- `sidebar-time.ts`: explizite Zeitzone, DST-Lücke/Fold samt Offsetentscheidung,
  Kalenderpresets; monotone Serveruhr und ein gemeinsamer Darstellungstimer.
- `sidebar-dnd.ts`: ausschließlich Pinned/Active/Settled, vollständige Pinmenge
  samt allen Row-Revisionen und Listenrevision; keine gefilterte Reorder-Menge.
- `sidebar-preferences.ts`: kleine browserlokale Collapse-Preference,
  `wrapt.hermes-v2-sidebar.v1`, Version 1, strenge Booleans und Tab-Sync ohne Echo.
- `organization-client.ts` / `organization-response.ts`: direkte öffentliche
  Zod-Verträge, same-origin REST, echter begrenzter Streamreader mit Cancel/Abort,
  4 MiB, Timeout, Antwortzuordnung und feste deutsche Domänenfehler.
- `organization-state.ts`: begrenzte gemeinsame Caches, monotone Metadaten,
  native Beobachtungsbarriere gegen spätere alte REST-Seiten, stabile Rowreferenzen.
- `organization-queries.ts`: echte 100er-Katalogseiten, ehrliche q-Teilabdeckung,
  Membershipcursor/Revision, Lookup fehlender Titel, begrenztes Singleflight.
- `organization-actions.ts`: CAS, Snooze, legale Drops, vollständiges Pinladen,
  konservatives Undo, keine automatische Wiederholung einer Mutation.
- `organization-runtime.ts`, `organization-owner.ts`, `sidebar-empty.ts`,
  `organization-policy.ts`: Besitzer/Lifecycle, Invalidierung, Viewmodels/Limits.
- `chat-read-evidence.ts`: exakte sichtbare Read-Batches, historische Hinweise,
  Ablauferneuerung, Auswahl-/Sichtbarkeitsbarrieren und Cleanup.

Additive Chatänderungen: `chat-types`, `chat-messages`, `chat-state`, `chat-events`,
`chat-runtime`, `chat-store`, `chat-owners`, `chat-actions`, `gateway-client`.
Keine Komponenten/CSS/Shells/Settings/Contracts/Server/Root-E2Es geändert.

## Fachliches Verhalten

Resolver vertraut `requiresAttention`, Coverage-Grenze und effektiver Organisation.
Ungelesene Antwort allein hebt bewusstes Snooze/Settle nicht auf. Neue relevante
Fakten/Abdeckung können Organisation serverseitig dauerhaft entwerten; Read setzt
Snooze/Settle niemals lokal wieder ein. Offene echte Requests bleiben vorrangig.
Belegte aktive Sub-/Backgroundcounts dürfen Working begründen; unbekannte Werte
bleiben null. Kein Turnstart aus Runtimecreation, kein session.status/Resume.

Initial lädt jede Membershipgruppe nur ihre erste Seite, auch eingeklappt, damit
Needs-input-Overrides sichtbar werden. Weitere Katalog-/Membershipseiten entstehen
durch Benutzeraktionen. Reorder lädt auf ausdrückliche Vorbereitung die vollständige
Pinmenge bis maximal 1000. Katalogtiefe 5000, gemeinsame Cachegrenze 8200;
Teilabdeckung und erreichte Grenzen werden sichtbar. Kein Transcriptcache zusätzlich
zum vorhandenen Chat und keine eigene browserseitige Attention-Datenbank.

Create/Rename/Snapshot-Upserts des Chatclients erreichen die Sidebar ohne weiteres
Core-sessions.changed. Automatischer alter sessions.list-Katalogtraffic wird während
Sidebarbesitz unterdrückt; dessen explizite bestehende API bleibt verfügbar.
Metadata-Invalidierung kommt vor dem Chat-Leasefilter an, auch für ungeleaste alte
Snoozed-/Settled-Sessions. Invalidierung während laufendem GET verlangt frischen GET.
Token-/Reasoning-/Tooldeltas publizieren keine Sidebar-Änderung.

WS-Opt-in `readEvidence=1` benutzt denselben Gatewayclient. Eine schon laufende
Verbindung rotiert kontrolliert nach dessen bestehender Mutations-/Budgetregel.
Flag-off abortet REST, entfernt Listener/Timer und beendet den Chat mit dem echten
Closegrund `v2-disabled`, ohne Stopmutation oder Folgeverkehr. StrictMode wird
mit vorhandener Owner-/Microtask-Lebensdauer behandelt.

## Exakte Reads

Kein ACK bei Snapshotempfang, Baseline, Sidebar-/Noticeabruf oder Inflight.
Nur angewandte vollständige Assistant-Rows, Livefehler und erlaubte historische
Fehlerhinweise können sichtbare Handles liefern. Unavailable-content hat keinen
Handle und ausdrücklich keine Aussage über gelesenen verlorenen Antwortinhalt.
Vor jedem Batch: aktuelle Owner-/Auswahl-/Snapshot-/Sichtbarkeitsgeneration prüfen,
alle Handles gegen die tatsächlich angewandte Projektion prüfen, maximal 64 senden.
Gemischte ungültige Batches werden lokal vollständig verworfen. Kein MAX-Cursor.

A→B-Auswahl und spätes A-Ergebnis können B weder lesen noch dessen Batch blockieren.
Bei Handleablauf wird die betroffene echte Historyseite beziehungsweise Notice-
Projektion erneuert; erst ein neuer sichtbarer Callback bestätigt neue Handles.
Gescheiterte Erneuerung bleibt sichtbar und lässt einen ausdrücklichen Retry zu.
Geblockte Handles werden auf noch angewandte Projektionen gepruned; ACK-Cache,
Notices, Owner, Queries und übrige Maps sind begrenzt beziehungsweise werden entsorgt.

## Prüfungen

Alle 138 Tests in 13 fachlichen Dateien grün: 88 bestehende Phase-3-Regressionen
und 50 neue Phase-4-Tests. Neue Dateien:

- `sidebar-domain.test.ts`: 10 Fälle, Priorität/Nulls/DST/monotone Uhr/Tab-Sync.
- `organization-client.test.ts`: 6 Fälle, echte Streamgrenze/Timeout/Antwortbindung.
- `organization-runtime.test.ts`: 9 Fälle, 20 Leases/StrictMode/Katalog/CAS/Undo/Flag.
- `organization-races.test.ts`: 8 Fälle, 101 Pins bei Suchfilter/Revisionkonflikt,
  spätes GET/Invalidierung/Reenable/native Umbenennung/Pinpermutationen.
- `chat-read-evidence.test.ts`: 13 Fälle, Sichtbarkeit/A→B/kleinerer Cursor,
  exakte Teilmenge/späte Fakten/atomarer Batch/TTL/Fehlernotices/64er-Batches,
  hängender alter ACK und Fehler bei frischer Belegerneuerung.
- `useHermesV2Sidebar.test.tsx`: 4 Fälle, echtes StrictMode/Chatowner/Draft/Flag-off.

Pflichtchecks: gezieltes ESLint grün; vollständiger Web-Typecheck im vorigen Lauf
grün. Der letzte Lauf trifft ausschließlich einen parallelen UI-Zwischenfehler:
doppelter SidebarDropTarget-Import in `HermesV2SidebarRow.tsx` Zeilen 2/6, Root gemeldet.
`pnpm architecture:file-lines` grün. Alle neuen/veränderten Dateien unter 400 Zeilen.
Fixtures validieren echte öffentliche WS-Frames; kein Testescape im Produkt.

## Übergabe und Grenzen

Scope eingefroren. Root besitzt Integration, Browser/E2Es und das tatsächliche
Phase-4-Gate; GLM besitzt UI/Observer. Keine Dienste/Browser/echten Hermes-Aufrufe,
Commits oder zusätzlichen Agenten verwendet. Upstream-Abdeckung bleibt ausdrücklich
begrenzt: keine universelle Offline-Completion-/Idle-Zusage, keine geratenen Counts.
Versionierungen-Skill berücksichtigt: neue Storageform versioniert; Changelog und
Produktversion bleiben gemäß Teilauftrag bei der abschließenden Root-Integration.

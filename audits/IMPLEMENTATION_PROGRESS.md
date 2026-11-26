# Umsetzung der Audits vom 18.11.2026

Stand: 19.11.2026. Eine Zeile je Finding. Grundlage: `audits/DECISIONS_2026-11-19.md`.

## Fortschritt

| ID | Status | Notiz | Dateien |
| --- | --- | --- | --- |
| F-01 | erledigt | Verlauf und Konfliktsicherungen mit 8-MB-Budget je Notiz, 100er-Grenze, Wartung beim Start und stündlich; Bytes in `/system/operational-metrics` sichtbar | notes/knowledge.ts, notes/database.ts, app/routes.ts, contracts/operational-metrics.ts
| F-02 | erledigt | Backoff 1/2/4/8/16/30 s, nach 5 Fehlversuchen interrupted mit SESSION_INTERRUPTED, Reset nach 60 s stabil, sauberer Exit startet nicht neu, manueller Restart setzt Zähler zurück | terminal/process.ts, terminal/Manager.ts, terminal/Manager.test.ts
| F-03 | erledigt | Reclaim nur eigener Projekt-Storage oder affinitätsfreier Slot, sonst 409 PREVIEW_SLOT_NOT_OWNED; storage_project_id migriert (v5); UI erklärt deaktivierten Reset | previews/database.ts, previews/reset.ts, previews/slots.ts, previews/routes.ts, contracts/preview-sessions.ts, web queryErrorGuide.ts, previewSlotRecovery.ts
| F-04 | erledigt | Statisches Frontend wird immer registriert; dist beim Start angelegt; 503-Seite mit Handlungsanweisung; Build greift ohne Neustart; restart-frontend prüft echten HTTP-200 | app/static.ts, static.test.ts, scripts/lib-restart.sh, scripts/restart-frontend.sh
| F-05 | erledigt | Draft-Revision wird verglichen; älterer Draft überschreibt Serverstand nicht, Konfliktbanner mit zwei Aktionen | stores/fileManager.ts, FileManagerSync.tsx, FileManagerPanel.tsx, index.css
| F-06 | erledigt | Gemeinsamer Retry-Controller mit Backoff 1–30 s, Endzustand nach 5 Fehlern, Pause im versteckten Tab, sichtbare Wiederholung; enge Schleifen entfernt | lib/saveRetry.ts, FileManagerSync.tsx, TerminalWorkspaceSync.tsx, stores, TerminalWorkspaceNotice.tsx
| F-07 | erledigt | Presence pro Client getrennt, leerer Report löscht nur den eigenen Client, TTL-Prune zentral; Client sendet stabilen Header | notifications/database.ts, notifications/routes.ts, web useViewPresence.ts, apiClient transport/notifications
| F-08 | erledigt | Aktiver Account wird mit 409 ACCOUNT_ACTIVE geschützt | usage/account-service.ts
| F-09 | erledigt | Gemeinsamer Safe-Parse mit Quarantänetabelle; Terminal, Dateimanager, Workspace-Register, Preview-Kandidaten, Skill-Jobs und Notiz-Tags abgesichert; Terminal-Reset-Route | utils/jsonQuarantine.ts, terminal/database.ts, terminal/routes.ts, filesystem/fileManagerService.ts, workspaces/database.ts, previews/database.ts, skills/skillEditorJobs.ts, notes/knowledge.ts
| F-10 | erledigt | Globales JSON-Limit 1 MB; Notizinhalt 8 MB + 1 MB Overhead per Route; Import 64 MB und Multipart unverändert | app/buildApp.ts, notes/routes.ts, app/bodyLimit.test.ts
| F-11 | erledigt | Fastify-Codes für 413/415/400 mit klaren API-Codes gemappt | utils/api-errors.ts, api-errors.test.ts
| F-12 | erledigt | Gemeinsamer Build-Graph mit extension-contracts, plugin-sdk, contracts und Icons; doppelter Build im Update entfernt | scripts/lib-restart.sh, restart-*.sh, update-and-restart.sh
| F-13 | erledigt | Nur echte Portnummern gelten; portloser gespeicherter Dienst blockiert den Fallback nicht | previews/runtimePorts.ts, runtimePorts.test.ts
| F-14 | erledigt | Gemeinsamer Fingerprint-Helper in Contracts inkl. requestedSlotId; Client erneuert Schlüssel und wiederholt PREVIEW_IDEMPOTENCY_CONFLICT einmal | contracts/preview-sessions.ts, previews/slots.ts, web usePreviewRuntimeSession.ts
| F-15 | erledigt | Expliziter Slotwunsch lehnt fremde Sessions ab; geteilte Kontexte behalten eine stabile Session-ID | previews/slots.ts, previews/routing.ts, slots.test.ts
| F-16 | erledigt | Listener einzeln mit allSettled; fehlgeschlagene Slots als unavailable gemeldet; Lifecycle warnt statt abzubrechen; harter Fehler nur ohne jeden Listener | previews/gateway.ts, previews/slots.ts, previews/routes.ts, app/lifecycle.ts, contracts/preview-sessions.ts
| F-17 | erledigt | Dirty-Guard läuft vor dem Restart-Request; Abbruch sendet keinen Auftrag | SystemRestartControls.tsx, SystemRestartControls.test.tsx
| F-18 | erledigt | Atomarer Duplicate-Endpunkt serverseitig; Client nutzt ihn statt drei Requests | notes/database.ts, notes/duplicateNote.ts, notes/routes.ts, web NotesWorkspace.tsx, apiClient/notes.ts
| F-19 | erledigt | FTS5-Index mit Triggern, Rebuild beim Start, sicheres Präfix-Matching, Vollscan-Fallback; aktive Notizen und Backlink-Kandidaten in je einer Query | notes/searchEngine.ts, notes/database.ts, notes/knowledgeRoutes.ts
| F-20 | erledigt | Aggregation über vollständigen Pfad; kollisionssichere Beschriftung mit Elternordner | usage/database.ts, database.test.ts
| F-21 | erledigt | Kapazität nutzt die Eigentümerregel der Allokation; fremde Affinitäten zählen weder frei noch wiederverwendbar | previews/slots.ts, capacity.test.ts
| F-22 | erledigt | Byte-Länge statt Zeichenzahl beim Skill-Save | skills/skillEditorFiles.ts, skillEditorService.test.ts
| F-23 | erledigt | 409 mit Backoff, sonstige 4xx einzeln isoliert und sichtbar gemeldet; Retry-Aktion in den Einstellungen | settingsSync/engine.ts, settingsSync/status.ts, SettingsSync.tsx, SettingsSyncBanner.tsx, Settings.tsx, engine.test.ts
| F-24 | erledigt | Deeplink ändert den Hauptport nicht mehr; andere Ziele öffnen eine eigene Live-Session, Fehler sind sichtbar | views/PreviewHubProject.tsx
| F-25 | erledigt | audits/ und config/*.local.json werden ignoriert; Qualitäts-Fixture prüft beides; Gate grün | scripts/architecture/check-file-lines.mjs, scripts/test-quality-gates.mjs
| F-26 | erledigt | Promise-Kette pro Hermes-Socket serialisiert Nachrichten | hermes/routes.ts, hermes/socketQueue.ts, socketQueue.test.ts
| F-27 | erledigt | Verifier weist Retention-Lücke mit truncated/retainedFromSequence aus; Dashboard-Text präzisiert | observability/audit-verification.mjs, audit.ts, contracts/operational-metrics.ts, DashboardTechnicalPanels.tsx, audit-truncation.test.ts
| M-001 | erledigt | PluginRuntime wird lazy über einen stabilen Loader geladen; kein statischer App-Import mehr | extensions/pluginRuntimeSync.tsx
| M-002 | erledigt | Fonts vom Inlining ausgenommen (unicode-range lädt nur benötigte Subsets) | apps/web/vite.config.ts
| M-003 | erledigt | App/CrashDialog/ErrorBoundary statisch importiert; Artwork- und Error-Start in eigene Vorabmodule ausgelagert | main.tsx, lib/startupArtwork.ts, lib/startupErrors.ts
| M-004 | erledigt | tmux-Scan single-flight mit 3-s-Cache; Create/Close/Restart invalidieren; ?refresh=true erzwingt neu | terminal/Manager.ts, terminal/restore.ts, terminal/routes.ts, Manager.test.ts
| M-005 | erledigt | Temperatur und Disks je 30 s gecacht; Load/Memory bleiben bei 5 s; Refresh leert alle Caches | services/systemService.ts, system/routes.ts, systemService.test.ts
| M-006 | erledigt | Excerpt liest bei großen Notizen nur 16 KB Präfix; Fallback auf Vollscan bei führendem Codeblock oder Treffer außerhalb | notes/excerpt.ts, excerpt.test.ts
| M-007 | erledigt | Verlaufsliste nur Metadaten, Einzelversions-Endpunkt, Restore per ID (siehe F-01) | contracts/notes-knowledge.ts, notes/knowledgeRoutes.ts, web NoteKnowledgePanel.tsx
| M-008 | erledigt | Aktive Notizen und Backlinks ohne N+1 bzw. mit SQL-Vorfilter | notes/database.ts, notes/knowledgeRoutes.ts
| M-009 | erledigt | Detail-Poll mit sinceRevision/unchanged; Save mit response=summary; Client-Cache hält den Vollstand | contracts/notes.ts, notes/routes.ts, apiClient/notes.ts, summaryRoutes.test.ts
| M-010 | erledigt | Preview-Status 1,5 s single-flight gecacht; Mutationen invalidieren; Polls pausieren im Hintergrundtab (React Query) | previews/DevServerManager.ts, DevServerManager.test.ts
| M-011 | erledigt | Port-Cache 15 s, Service-Cache 30 s; Dashboard-Ports/Dienste pollen 15 s (Entscheidung 2) | config/settings.ts, config/wrapt.example.json, config/wrapt.local.json
| M-012 | erledigt | Diagnoseprüfungen parallel mit Einzel-Timeouts, Gesamtergebnis 60 s gecacht; POST .../run erzwingt neu | hermes/routes.ts
| M-013 | erledigt | Ungenutzter Index usage_snapshot_lookup per Migration entfernt | usage/database.ts, snapshot-indexes.test.ts
| M-014 | erledigt | Baum auf 40 Seiten begrenzt, „Ansicht gekürzt" sichtbar; Poll auf 10 s und ohne Hintergrund | apiClient/filesystem.ts, FileManagerPanel.tsx, contracts/filesystem-contracts.ts
| M-015 | erledigt | FTS5 statt Vollscan mit Fallback (siehe F-19) | notes/searchEngine.ts
| M-016 | erledigt | Event-Loop-Auflösung 1 ms statt 20 ms | observability/metrics.ts
| M-017 | verworfen | Entscheidung 3/17: Favicon bleibt unverändert. | – |
| M-018 | erledigt | KaTeX-CSS wandert vom Entry-CSS in den Notizeditor | notes/index.css, NoteEditor.tsx
| M-019 | erledigt | Hermes-Status mit 5-s-Frischfenster und Stale-While-Revalidate; ACP-Felder bleiben live; Aktionen invalidieren | hermes/status-service.ts, status-service.test.ts
| M-020 | erledigt | Nur Messung dokumentiert: 80 Deklarationen in 19 CSS-Dateien, keine Laufzeitmessung möglich, keine Änderung | audits/M-020_BACKDROP_MESSUNG.md

## Gruppen

1. Datenrisiken: F-01, F-09, F-05, F-08
2. Endlosschleifen und Recovery: F-02, F-06, F-16, F-03
3. Betrieb: F-04, F-12, F-17, F-25
4. Korrektheit: F-10, F-11, F-13, F-14, F-15, F-18, F-20, F-21, F-22, F-23, F-24, F-26, F-27, F-07
5. Performance P1: M-001 bis M-006
6. Performance P2/P3: M-007 bis M-016, M-018, M-019, M-020 (nur Messung)

## Prüfungen (19.11.2026)

| Prüfung | Ergebnis |
| --- | --- |
| `pnpm typecheck` | grün (extension-contracts, plugin-sdk, contracts, server, web, e2e) |
| `pnpm lint` | grün |
| `pnpm architecture:file-lines` | grün (2347 Dateien) |
| `pnpm test:quality-gates` | grün (inkl. Audit-/Local-Config-Fixture) |
| Server-Suite | 267 Dateien, 2057 Tests grün |
| Web-Suite | 315 Dateien, 2344 Tests grün |
| Contracts-Suite | 26 Dateien, 166 Tests grün |

## Bewusste Einschränkungen

- **M-020:** Nur Quellzählung möglich; ohne isolierten Browserlauf kein Frame-/INP-Messwert. Deshalb keine CSS-Änderung. Dokumentiert in `audits/M-020_BACKDROP_MESSUNG.md`.
- **M-014:** Statt ETag/If-None-Match wurde der Baum auf 40 Seiten begrenzt und der Poll auf 10 s gesenkt. Eine serverseitige Cursor-Paginierung im Panel bleibt offen, falls die Grenze in der Praxis erreicht wird.
- **M-012:** Die Workbench hat keine eigene Hermes-Diagnoseoberfläche; der explizite Refresh ist über `POST /hermes/diagnostics/run` erreichbar. Ein UI-Knopf würde eine neue Diagnoseseite erfordern und wurde nicht ergänzt.
- **F-19:** Die Notizliste liefert bereits nur Summaries ohne Volltext; eine zusätzliche UI-Paginierung war für die Akzeptanz nicht nötig. Suche (FTS5) und Backlinks (SQL-Vorfilter) skalieren jetzt ohne Vollscan.
- **Notifications:** Der Gelesen-Status bleibt bewusst global (Einzelbenutzer-Verhalten). Nur Presence ist pro Sicht/Client getrennt.

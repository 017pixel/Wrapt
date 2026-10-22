# Hermes V2 Phase-1-UI: Implementierungsbericht (GLM)

Stand: 16.10.2026, JS-Task `hermes-v2-phase1-ui-glm` (fortgesetzter Neustart nach
manueller Unterbrechung). Verbindliche Basis: `plans/hermes-v2-inventory.md,
plans/hermes-v2-progress.md`, Auftrag `WRAPT_HERMES_V2_IMPLEMENTATION_GOAL.md`.
Scope: exklusiv die unten gelisteten Dateien; Parent-Dateien unangetastet.

## Umgesetzte Dateien (alles < 400 Zeilen)

- `apps/web/src/components/hermes/v2/HermesV2Shell.tsx` (214) + Test (102)
  + `hermes-v2.css` (249):
  - Flag off: nur Aktivierungskarte (operable Switch, Experimentell-Label,
    Einstiegslink), kein `data-hermes-ui=v2`, keine Chatfläche, keine Transports.
  - Flag on: native Fläche mit Wrapt-Tokens, Root trägt genau EIN
    `data-hermes-ui=v2` (Standalone-Wrapper dupliziert nicht mehr).
  - Varianten `route|panel|orbit`, `minimal`, `active`, `standalone` laut
    Dispatcher; `panel?.hermesAdminPath` Hinweis-Attribut. Named export
    `HermesV2Shell` bleibt für den Lazy-Dispatcher.
  - Mobiler Drawer (<= 640px per Container-Query): zugeklappt via
    `transform: translateX(-102%)`, Chat immer sichtbar; Toolbar-Button
    „Sitzungen" mit `useId`-gespeisten `aria-expanded`/`aria-controls`
    (mehrere geparkte Instanzen möglich); Schließen über Toggle, Backdrop und
    Escape; Backdrop nur sichtbar, wenn offen (`pointer-events`).
  - Standalone: kompakte Toolbar bleibt wegen `minimal=false` erhalten, eigene
    Viewport-Regeln, Fenstertitel, „Zur Workbench"-Fußzeile; kein App-Chrome.
  - Session-ID: klassischer Link via `hermesV2ClassicHref(session)`; Fenster-
    link via `hermesV2StandaloneHref(session)` mit `target="_blank"
    rel="noopener noreferrer"`. Ohne Flag keine V2-Verbindungen (Phase 3).
  - CSS: keine neuen Hex-Farben (nur `var(--color-*)` und color-mix auf dem
    Basis-Token), KEIN `text-transform`/Sperrung, `prefers-reduced-motion`
    deaktiviert Übergänge; Animationen nur transform/opacity.
- `apps/web/src/views/HermesV2Route.tsx` (14) + Test (47): beide Page-Exports
  (`HermesV2Route`, `HermesV2StandaloneRoute`) rendern dieselbe Shell.
- `apps/web/src/views/settings/HermesV2Settings.tsx` (52) + Test (49): Easter-
  Egg-Karte mit `role="switch"`, Anker `#settings-hermes-v2`, Toggle persistiert
  über `setHermesV2Enabled`, bei aktivem Flag direkter Einstieg. Styling nur
  über globale Settings-/Utility-Klassen, keine Abhängigkeit von `hermes-v2.css`.
- `apps/web/src/lib/hermesV2Routes.ts` (52) + Test (51): Pfade ohne Basename
  (`/hermes-v2`, `/hermes-v2/standalone`, `/hermes-agent`), Session-IDs immer
  URL-kodiert (`%2F`), Standalone-URL mit robustem Basispfad inkl. Fallback für
  Umgebungen ohne `window.location.origin` (Tests/jsdom).
- `apps/web/src/extensions/hermesV2Builtins.ts` (109) + Test (97): Registry
  contract of inventory — Route `/hermes-v2` (`full-bleed`, persistent, topbar,
  ohne breadcrumbs, mobileNavigation) und `/hermes-v2/standalone` (standalone,
  unpersistent, ohne topbar/mobileNavigation), Pages mit Lazy-Loader
  (`loadRouteWithRecovery`, Stale-Chunk-Retry, chunk `hermes-v2`), keine
  Navigation-Registrierung, Bootstrap idempotent über `builtinContributions`.
- Einbindung: `SettingsEasterEggs` rendert `HermesV2Settings` (vor Dashboard-
  Artwork); `settingsSearch.ts` um Eintrag `hermes-v2` erweitert (Tab
  `easter-eggs`, Anker `settings-hermes-v2`, Aliase inkl. „Hermes 2").
- Nicht gestreut: `routeModules.ts`, `legacyPageRoutes.ts`, `index.css`,
  App-Navigation — bewusst null Wachstum (prefetch `none`).

## Verifikation

- `@wrapt/web`-Typecheck grün (`npx tsc -p tsconfig.json --noEmit` im
  apps/web-Kontext, Exit 0). Ergebnisse inkl. EOPT: `active`/`panelAdminPath`
  explizit `| undefined`.
- Gezieltes ESLint über alle meine Dateien: keine Befunde. Repo-weite Lint-
  Fehler in `temp/`-Lauferskripten stammen vom Parent-Bereinigungslauf und sind
  dort bearbeitet worden.
- Eigene Testsuite: 6 Dateien, 28 Tests grün
  (`HermesV2Shell`, `HermesV2Route`, `HermesV2Settings`, `hermesV2Routes`,
  `settingsSearch`, `hermesV2Builtins`).
- Regressions grün: `HermesShell`-Dispatcher 13, `appPreferences`,
  `SettingsEasterEggs`, `routeHost`, `pageRouteRegistry`, `routeModules`,
  `notesBuiltins`/`legacyNavigation`.
- Die Fehlerfälle aus `temp/hermes-v2/phase1-first-mobile.png` (absolute Sidebar
  verdeckt den Chat) sind durch den semantischen Drawer mit CSS-Grundzustand
  „zugeklappt" behoben; die Standalone-Toolbar ist wieder sichtbar.
- Parent hat `HermesV2Integration.test.tsx` mit echtem Dispatcher bereits 2/2
  grün; Browserrebuild, Screenshots und Visual-Review übernimmt das Parent-Gate.

## Offene Punkte

- Chat bleibt bewusst sauberer nativer Leerzustand („Chat folgt"), Sessionliste
  ohne Fake-Daten; Transports erst Phase 2/3. Der `?session=`-Deep-Link ins
  Standalone-Fenster ist reine URL-Semantik, bis der Chat angebunden ist.
- `useId` erzeugt IDs mit Doppelpunkten; Tests vergleichen deshalb Attribute
  statt Selektoren.
- Repo-weites Lint bleibt vorübergehend rot in `temp/` (Parent-Skripte) und bei
  Contracts; meine Dateien sind einzeln fehlerfrei.

Verbrannte Phasen: Phase-1-UI abgeschlossen; nach Parent-Gate (Browserrebuild
und Review) go für Phase 2.

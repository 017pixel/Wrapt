# Hermes V2: Phase-1-Gate, GLM Visual Review (leser: leere native Shell)

Stand: 16.10.2026. Unabhängiges READ-ONLY-Review im geteilten Checkout
`/home/bbecker/projects/Wrapt`. Keine Produktdatei geändert, keine Dienste,
Previews oder Nutzerzustände angefasst; einziges Schreibartefakt ist diese
Datei. Grundlage: `plans/hermes-v2-inventory.md`,
`plans/hermes-v2-phase1-ui-implementation.md`,
`plans/hermes-v2-phase1-deepseek-review.md`, AGENTS.md, Skills
`design-system-guide` + `mobile-design`. Scope: Flag, Settings, Normalroute,
Standalone, leere native Shell; fehlender Chat (Phase 3) wird nicht gewertet.

## Urteil: PASS

DeepSeek-Blocker H1 ist behoben, die A11y-Findings M1 implementiert und live
verifiziert. Quelle, Tests, Build und Browser stimmen zusammen; die vier
Abnahmebreiten und Standalone sind sauber. Ein Befund betrifft die helle
Rollenkonfiguration, liegt aber global im Theme-Preset und nicht im V2-Code
(siehe L1 mit Evidenzgrenze).

---

## DeepSeek-Findings, nachgeprüft

**H1 — TS2375 `panelAdminPath` — BEHOBEN.**
`HermesV2Shell.tsx:109` deklariert `panelAdminPath?: string | undefined`
(analog `active?: boolean | undefined`, Zeile 110). Nachbau des Beweises:
`pnpm --filter @wrapt/web typecheck` → **Exit 0** (16.10., nach allen Fixes).

**M1 — Drawer-Fokusführung — BEHOBEN UND LIVE VERIFIZIERT.**
Neu: Hook `useHermesV2Drawer.ts` (32 Zeilen, Container-basiert per
ResizeObserver) plus wiederverwendetes `lib/useModalFocus.ts` (Fokus-Falle,
Escape, Sibling-Inert, Fokus-Restore). Belegt im Browser
(`http://127.0.0.1:19470/wrapt/hermes-v2`, eigener Playwright-Tab, Viewport
390×844, Flag im eigenen Browserprofil gesetzt):

- Zugeklappt: Sidebar `translateX(-306px)` (−102 % von 300 px),
  `aria-hidden="true"`, Drawer-Layer `inert=true` — der Off-Screen-Bereich ist
  für AT unsichtbar, der DeepSeek-Punkt „nur CSS-verschoben" ist erledigt.
- Öffnen per Toggle: Sidebar wird `role="dialog"` + `aria-modal="true"`,
  `aria-hidden` entfernt, `inert=false`, Fokus auf dem Schließen-Button
  (`data-modal-autofocus`), Toggle meldet `aria-expanded="true"`.
- Escape schließt: `aria-hidden="true"` zurück, `inert=true`, `role` entfernt,
  **Fokus wieder auf dem Toggle** (`document.activeElement === toggle`, live
  geprüft).
- Schwesterelemente werden beim Öffnen per `inert`/`aria-hidden` abgesenkt und
  im Cleanup exakt restored (`useModalFocus.ts:28–37,74–81`).

## Live-Browserprüfung (eigener Playwright-Lauf, eigener Tab)

Server `http://127.0.0.1:19470/wrapt/hermes-v2` (Pfad unter `/wrapt/…`, korrekt
via Basename). Viewport im Lauf 1280×720 und 390×844.

- **Flag off (frisches Profil):** nur Aktivierungskarte (`.hermesv2-activation`,
  Switch `aria-checked="false"`), **null** `[data-hermes-ui="v2"]`. Kein V2-
  Traffic sichtbar; die zwei Console-Errors sind `503 /api/v1/hermes/status`
  der isolierten Testinstanz (kein Hermes-Gateway), kein V2-Codepfad.
- **Flag on:** genau **ein** `data-hermes-ui="v2"`-Marker. Desktop 1280:
  Sidebar statisch (`transform: none`), Toggle `display:none` — Spalte normal
  sichtbar, kein Drawer-Müll im Desktop-Baum.
- **Standalone** `/wrapt/hermes-v2/standalone` (390×844): `.hermesv2-standalone`
  mit `data-shell-mode="compact"`, Fenstertitel „Hermes V2 · Wrapt", kompakte
  Toolbar sichtbar, „Zur Workbench"-Fußzeile sichtbar, ein Marker.
- **Touch-Ziele:** Toggle „Sitzungen", Schließen-Button und beide Quiet-Buttons
  der Chatfläche live **je 44 px hoch** gemessen.
- Die gelieferten Assets sind die korrigierte Fassung: das inert/aria-hidden-
  Verhalten existiert nur im neuen Code (`useHermesV2Drawer`); der alte Build
  von 15:29 könnte es nicht ausliefern. Der Health-`webBuildId`-Marker ist
  damit bestätigt als veraltete Sicht; die reale Auslieferung entspricht dem
  Stand nach dem A11y-Fix.

## Screenshots (temp/hermes-v2/, nach erster Korrektur)

- `phase1-1440x900.png` — Desktop dunkel: Navigation, Sitzungsspalte, Toolbar,
  leere Chatfläche mit echten Einstiegen. Sauber, Sidebar normal sichtbar.
- `phase1-1024x768.png` — Tablet: identisches Layout, keine
  Zwischenbreiten-Fehler.
- `phase1-768x1024.png` — kompakt: App-Sidebar eingeklappt, Sitzungsspalte
  als eigene Spalte, Chatfläche voll lesbar.
- `phase1-390x844.png` — mobil: Drawer zugeklappt, Toolbar-Toggle mit
  Fokus-Ring, Chat immer sichtbar. Das behobene Erst-Screenshot-Problem
  (absolute Sidebar verdeckte den Chat) ist weg.
- `phase1-standalone-mobile.png` — Standalone mobil: kompakte Toolbar,
  Fußzeile innerhalb der Fläche, kein App-Chrome.
- `phase1-light-1440x900.png` wie beauftragt **nicht als Codebug gewertet**
  (zu früh vor ThemeRuntimePaint); bewertet wird `phase1-light-manual.png`
  — siehe L1. `phase1-first-mobile.png` ist der bekannte Vor-Korrektur-Stand
  und wurde nicht gewertet.

## Design-Regeln (design-system-guide + mobile-design)

- **Tokens:** `hermes-v2.css` nutzt ausschließlich `var(--color-*)`/
  `--space-*`/`--radius`/`--text-*` plus einem `color-mix` auf dem Basis-Token;
  kein Hex im V2-Code (Grep: nur Kommentar). Fällt damit automatisch unter
  jede konfigurierte Rolle — korrekter Ansatz.
- **Verbotene Muster:** kein `text-transform`, kein Pill-Radius, keine
  Gradients, keine Emojis (Grep leer).
- **Motion:** nur `transform`/`opacity`, 200 ms ease-out,
  `prefers-reduced-motion: reduce` setzt beide Übergänge auf `none`
  (`hermes-v2.css:251–256`) — Pflicht erfüllt.
- **Safe Areas:** Standalone-Toolbar `max(var(--space-2), env(safe-area-inset-top))`,
  Fußzeile analog (`hermes-v2.css:18–19`); `useResponsiveShell` +
  `useVisualViewportVariables` aktiv im Standalone (Shell Z. 81–82,
  `data-shell-mode/-input-mode/-orientation/-short-height` am Root).
- **Typo/Hierarchie:** Sentence Case durchgehend, Heading-Ordnung korrekt,
  kein All-Caps.
- **Fokus:** Fokus-Ring am Toggle im 390er-Screenshot sichtbar; modale
  Führung via `useModalFocus` (siehe M1). Kein Hamburger als Hauptnavigation —
  der Drawer ist ein echter Dialog mit Alternativen (Backdrop, Escape,
  Schließen-Button).

## Befunde

**L1 — Light-Rolle: Quiet-Button-Chips dunkel mit dunkler Schrift
(∇ Verifikation beim Parent, kein V2-CSS-Fehler).**
`phase1-light-manual.png` zeigt Sidebar und Toolbar korrekt hell, aber die
Buttons „Klassische Hermes-Oberfläche", „Eigenes Fenster öffnen" und „Zur
Workbench" bleiben als dunkle Chips mit unlesbarer dunkler Schrift.
Evidenzgrenze: `.quiet-button` sitzt global in `index.css:1417–1421` und nutzt
`var(--color-ink-850)`; das Theme-Runtime mappt
`--color-ink-850 → colors.surfaceOverlay` (`themeRuntime.ts:37`) und schreibt
alle Variablen **atomar** auf `documentElement` (`applyAppearanceTheme`). Ein
Teilauftrag (Hintergrund hell, Chips dunkel) ist über diesen Pfad technisch
nicht möglich — die helle Preset-Konfiguration des Parents hat `surfaceOverlay`
also tatsächlich dunkel gelassen. Das ist ein globaler Preset-Defekt (betrifft
jede Quiet-Button-Fläche unter dieser Rolle), nicht die V2-Shell. V2 erfüllt
seine Pflicht (nur Tokens, keine eigene Farbwelt); behoben werden muss die
Preset-Rolle `surfaceOverlay` — mindestens so hell, dass `--color-text`
darauf lesbar bleibt.

**N3 (unverändert, Nice-to-have).** `HermesV2Settings.tsx:34` nutzt weiter den Inline-Stil `style={{ fontSize: "var(--text-xs)" }}` statt einer Utility-Klasse. Kosmetisch, kein Gate-Faktor.

- **N1/N2 (DeepSeek) erledigt.** Der „Ganzseitig öffnen"-Link ist in der Route-Variante durch „Eigenes Fenster öffnen" (`target="_blank" rel="noopener noreferrer"`, Shell Z. 194–201) ersetzt und erscheint in Standalone nicht mehr (Z. 191). Der Drawer nutzt jetzt `box-shadow: var(--shadow-raised)` neben der Haarlinie (`hermes-v2.css:237`).

## Qualitätsgrenzen und Rahmen

- **Typecheck:** `pnpm --filter @wrapt/web typecheck` Exit 0 (eigenen Lauf).
- **Dateigrößen:** Shell 214, CSS 256, Hook 32, useModalFocus 87, Settings 52,
  Route 14, Routes 52 Zeilen — alle unter 400.
- **Phase-1-Trennung:** keine Chat-/Transport-Imports im Web-Phase-1-Code;
  `?session=` bleibt reine URL-Semantik (Phase-3-Vorbehalt).
- **Browser-Abgrenzung:** eigener Playwright-Tab, Parent-Tab 0 nicht
  angerührt; Flag nur im localStorage des eigenen Browserprofils umgelegt,
  kein Nutzer-/Serverzustand verändert; keine Dienste gestartet oder gestoppt.
- Light-Theme-Aussagen stützen sich auf das Parent-Screenshot-Artefakt plus
  statischer Token-Analyse; ein eigener Light-Durchlauf hätte die Preset-
  Rollen des Parents verändert und wurde deshalb unterlassen.

## Ergebnis

Phase-1-Scheibe bestätigt die DeepSeek-Nachbesserung vollständig (H1 + M1),
ist live an vier Breiten, Standalone, Reduced Motion und 44-px-Zielen sauber
und verletzt keine Design-Regel. **PASS für das Phase-1-Visual-Gate.** Einzige
Nacharbeit: L1 im Theme-Preset (`surfaceOverlay` der hellen Rolle) beim Parent
beheben und den Light-Screenshot erneut ziehen — Blocking nur für die
Light-Dokumentation, nicht für die V2-Shell oder das Go zu Phase 2.

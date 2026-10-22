# Hermes V2: Phase-1-Gate, DeepSeek-Review (Flag / Routen / native leere Shell)

Stand: 16.10.2026, Review gegen den **aktuellen** Quellstand im geteilten Checkout
`/home/bbecker/projects/Wrapt`. Geprüft wurden die zuletzt geschriebenen Fassungen
(Shell 15:41, CSS 15:33, Builtins/Routes 15:37/15:34, Settings 15:34). GLM hat während
der Prüfung weiter geschrieben (mtimes 15:27–15:41); die Prüfung lief nach einer
Stabilisierungsphase von >60 s ohne Schreibzugriff. Read-only, keine Produktdatei geändert.

Scope: neue `HermesV2Settings`, Routenhelfer + Registry + Route, `HermesV2Shell` + CSS +
Tests, Parentintegration (`HermesShell`, `App.tsx`). Ausdrücklich **nicht** gewertet:
fehlende Chatfunktion (Phase 3). Keine Unteragenten, kein Git, keine Dienste.

## Urteil: 1 Blocker, sonst Gate-grün

Fachlich erfüllt die Phase-1-Scheibe den Auftrag (Default off, eigene Routen, leere native
Shell, Fallback-Link, Session-Deeplinks, kein V2-Hook/Traffic bei off). Es steht aber ein
**Typecheck-Fehler** im neuen Shell-Modul, der das Gate per `pnpm typecheck` rot macht.

---

## High

**H1 — `pnpm --filter @wrapt/web typecheck` schlägt fehl (TS2375).**

```
src/components/hermes/v2/HermesV2Shell.tsx(31,6): error TS2375:
  Type '{ ...; panelAdminPath: string | undefined; }' is not assignable to
  '... panelAdminPath?: string; ...' with 'exactOptionalPropertyTypes: true'.
```

- Übergabe: `apps/web/src/components/hermes/v2/HermesV2Shell.tsx:35`
  `panelAdminPath={panel?.hermesAdminPath}` (Typ `string | undefined`).
- Empfangsprop: ebd. Zeile 103 `panelAdminPath?: string;` — ohne `| undefined`.
  Der Autor hat dasselbe Muster bei `active?: boolean | undefined` (Zeile 104) korrekt
  gelöst, hier aber nicht.
- Beleg: eigener Lauf `pnpm --filter @wrapt/web typecheck` → exit 2 (15:44). AGENTS.md
  verlangt vor Abschluss einen grünen Typecheck; damit ist das Phase-1-Gate blockiert.
- Fix trivial: Prop auf `panelAdminPath?: string | undefined` erweitern oder Aufruf nur
  bei vorhandenem Wert spreaden.

## Medium

**M1 — Sitzungs-Drawer: keine Fokusführung, Off-Screen-Bereich bleibt für AT sichtbar.**

- Zustand: `apps/web/src/components/hermes/v2/HermesV2Shell.tsx:110` `drawerOpen` initial
  `false` (korrekt, Screen startet zugeklappt).
- Beim Zuklappen wird die Spalte nur per CSS verschoben
  (`apps/web/src/components/hermes/v2/hermes-v2.css:231,234` `translateX(-102%)`), sie
  bleibt im Accessibility-Tree. `aria-hidden` wird nur im **offenen** Zustand auf `"false"`
  gesetzt (Shell Z. 143) und im geschlossenen gar nicht (also sichtbar).
- Beim Öffnen wird der Fokus nicht in die Spalte gesetzt, beim Schließen (Escape/Backdrop)
  nicht auf den Toggle zurückgegeben; kein Fokusfang.
- Backdrop ist ein `<button aria-label="Sitzungsspalte schließen">` (Shell Z. 150–157),
  das auch auf Desktop im Baum steht (nur `pointer-events:none`, `opacity:0`,
  `tabIndex=-1`), dort aber keine Aktion hat.
- Phase-1-mild (die Spalte enthält nur Text), aber für das spätere Chat-Zeitalter bereits
  jetzt sauber lösbar: `aria-hidden`/`inert` im geschlossenen Zustand, Fokus auf Toggle
  beim Schließen.

## Nice to have

**N1 — Redundanter Link in Standalone.** In der schon vollflächigen Standalone-Ansicht
zeigt die leere Chatfläche „Ganzseitig öffnen" → `/hermes-v2`
(`HermesV2Shell.tsx:191–192`). In der ohnehin fokussierten Fläche ist der Link irreführend.

**N2 — Sessionsspalte mobil ohne Ebenentrennung.** Der Drawer nutzt nur `border-right`
(`hermes-v2.css:230`); über Content hebt er sich kaum ab. Border-only ist konform zur
Design-Regel, für ein Overlay wäre ein enger Token-Schatten (`--shadow-raised`) die
üblichere Abgrenzung. Kein Blocker.

**N3 — Inline-Stil statt Token-Klasse.** `HermesV2Settings.tsx:34`
`style={{ fontSize: "var(--text-xs)" }}` mischt Inline-CSS in Tailwind-Komponenten;
`text-xs` wäre konsistent.

---

## Nachgewiesen erfüllt (mit Beleg)

- **Default off / strikte Validierung.** `appPreferences.ts` V2 nur bei `=== true`; Test
  `appPreferences.test.ts:92–103` deckt `undefined/null/"true"/1/{}/[]` und kaputtes JSON.
- **Migration ohne Datenverlust.** Version 1→2 erhält `defaultPage`, ergänzt
  `hermesV2Enabled`; `appPreferences.test.ts:75–80`. Storage-Key stabil
  `wrapt.app-preferences.v1`.
- **Kein Tab-Echo / Listener-Cleanup.** Storage-Event wird ohne Re-Persistenz eingelesen,
  Listener im React-Effect an-/abgemeldet (`appPreferences.ts` `subscribe…`,
  `App.tsx` `useEffect(subscribeAppPreferencesStorage, [])`); Tests 105–141.
- **Flag off = null V2-Ressourcen.** `HermesShell.tsx:26` liefert V1; der lazy V2-Chunk wird
  nur bei `enabled && !classic` gerendert (`Z. 27–31`). Kein V2-Hook/Transport bei off;
  direkte V2-URL mountet nur die Aktivierungskarte ohne Chathaken (Test
  `HermesV2Route.test.tsx:16–24`).
- **Classic hat Vorrang.** `?ui=classic` und `?path=…` gewinnen (`HermesShell.tsx:17,25`);
  Dispatcher-/Park-Logik grün (`HermesShell.test.tsx`, 9 Tests).
- **Eigene Route-Registrierung, Legacy unangetastet.** `hermesV2Builtins.ts` nutzt eigenen
  Owner `wrapt.hermes-v2` über `pageRouteRegistry.replaceOwner`; keine Legacy-Datei
  erweitert; Kollisionen werden explizit abgewiesen (`hermesV2Builtins.test.ts:91–96`).
  Route-Vertrag entspricht dem Inventory (`full-bleed`/`persistent`/`topbar`/**rides**,
  Standalone `standalone`/nicht persistent, `mobileNavigation:false`).
- **Session-Deeplinks sicher.** Classic-Link übernimmt `session` URL-kodiert
  (`hermesV2Routes.ts:17–21`, Test `ordner%2Fid`); Standalone-Link kodiert ebenfalls und
  öffnet `target="_blank" rel="noopener noreferrer"` (`HermesV2Shell.tsx:194–201`).
- **`data-hermes-ui="v2"` eindeutig.** Genau ein Marker (kein doppeltes `main`+`section`
  mehr), Tests zählen `countV2Markers === 1` (`HermesV2Shell.test.tsx:45–55,93–101`).
- **Kein `uppercase`, Reduced Motion, mobiler Drawer.** Shelf-Titel ohne
  `text-transform` (`hermes-v2.css:32–37`); `@media (prefers-reduced-motion)` deaktiviert
  Übergänge (Z. 244–248); Drawer zugeklappt + Toggle + Backdrop + Escape
  (`HermesV2Shell.tsx:119–171`, CSS 209–242), Tests 56–91.
- **Settings-CSS unabhängig.** `HermesV2Settings.tsx` nutzt nur globale Klassen
  (`settings-toggle-row/-switch/-thumb`) und Tailwind-Utilities; `text-faint` ist ein
  gültiges Projekt-Utility (mehrfach verwendet). Damit ist die frühere Abhängigkeit von
  `hermes-v2.css` (nur im Shell-Chunk) aufgelöst.
- **Tests grün.** Eigener Lauf `vitest run` über die 8 in-scope Testdateien:
  **8 Dateien, 55 Tests, alle bestanden** (15:43). `check-file-lines.mjs` OK; keine neuen
  Dateien >400 Zeilen (Shell 214, Builtins 109, Route/Helper klein).
- **Phase-1/Phase-2-Trennung.** Web-Phase-1-Code importiert keine Hermes-V2-Contracts oder
  Servermodule (nur `import "./hermes-v2.css"`). Der neue Contracts-Subpath
  `./hermes-v2` (`packages/contracts/package.json`) wird von Phase-1-Web nicht benutzt.

## Browser-/Build-Grenze (klar markiert)

Eigener Playwright-MCP-Lauf an `http://127.0.0.1:19470/` (isoliertes E2E-Server-Prozess,
`WRAPT_E2E_WEB_OUT_DIR=/tmp/wrapt-hermes-v2-web-XLkOcP`) lieferte **HTTP 500** mit
JSON-`INTERNAL_ERROR` (kein HTML), `webBuildId` entspricht dem Build von **15:29**.
Dieser Build ist **älter** als die geprüfte finale Shell (15:41), wird von diesem Browser
nicht ausgeliefert und enthält den Typecheck-Fehler ohnehin nicht. Die UI-Aussagen dieses
Reports stützen sich deshalb **auf den aktuellen Quellstand und die Tests**, nicht auf
einen Live-Screenshot. Der alte Screenshot `temp/hermes-v2/phase1-first-mobile.png`
(15:29) zeigt den **Vor-Korrektur-Stand** (Spalte immer offen) und ist kein Nachweis der
aktuellen Fassung. Eine echte Browser-Abnahme der finalen Shell bleibt beim Parent.

## Nicht Teil dieses Reviews

Fehlende Chatfunktion (Phase 3), Server-/Gateway-Adapter (`apps/server/src/hermes/v2/`,
Phase 2), Protokoll-/Security-Gate (separates Codex-Review).

## Artefakt

Einziges neues Schreibartefakt dieser Prüfung ist diese Datei. Keine Produktänderung, kein
Git, keine Dienste, keine Dienste neugestartet, keine Nutzer-Previews berührt.

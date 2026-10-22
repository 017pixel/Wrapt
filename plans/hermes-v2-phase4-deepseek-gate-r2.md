# Hermes V2 Phase 4: unabhängiges DeepSeek-UX-Gate R2 (Sidebar/Organisation)

Stand 16.10.2026. Frische Prüfung der eingefrorenen Sidebar-/Organisations-UX
nach den M1-/M2-Korrekturen. Kein Gesamtfeature-PASS, keine Phase 5 bis 11.
Keine Produktdatei, kein Dienst, kein Browser, kein Server, keine Ports, keine
Previews/Tmux/Slots/Nutzersessions, kein Commit, keine Subagents. Gelesen:
Vorgängerbericht `phase4-deepseek-gate.md`, Antwort `phase4-ux-fixes.md`,
Originalauftrag Kap. 5/10/12, handoff, evidence-gate-r4,
phase4-interface-decisions, ui-/web-/backend-implementation,
phase3-deepseek-gate-r3, phase4-client-gate R1 bis R3, Browsernachweis, sowie
AGENTS.md, sprachstil, design-system-guide und mobile-design.

Revisionstand: HEAD `f6a45419`, Arbeitsbaum, UI laut Root final eingefroren.

## Urteil: PASS für den Sidebar-/Organisations-UX-Scope

M1 und M2 sind behoben und unabhängig nachvollzogen. Kein neues H/M, keine
Regression der zuvor bestätigten Fixes. Das vorläufige M3 bleibt zurückgezogen.
Kein Gesamtfeature-, Backend-, Client- oder Browser-PASS.

## M1 (war Medium): angeheftete, arbeitende Sitzung jetzt ehrlich

Behoben. `sidebar-format.ts:24-25` wertet im `default`-Zweig die belegte
Activity aus: `activity === "working"` ergibt „Arbeitet". `HermesV2SidebarRow.tsx:34`
hängt die Laufzeit an `activity === "working" && durationMs !== null`, nicht mehr
an der Gruppe. Die Pinned-Gruppe bleibt Organisationsebene; der Root wählte damit
die im Vorgängerbericht genannte zulässige Richtung (Status/Laufzeit in der
Pinned-Zeile statt Umhängen der Gruppe).

Eigenes Repro auf DOM-Ebene, ausgeführt:
`temp/hermes-v2/phase4-ux-review/r2/r2-pinned-working.test.tsx` — 2/2 grün. Eine
Pinned-Zeile mit `activity:"working"`, `durationMs:60000` liefert
`data-shelf="pinned"`, Statuswort „Arbeitet", sichtbare `.hermesv2-duration`, kein
„Ruhend"; eine nur gepinnte Idle-Zeile bleibt ehrlich „Ruhend" ohne Laufzeit. Der
Autor-E2E `tests/e2e/hermes-v2-sidebar.spec.ts:74-83` prüft genau das im echten
Browser-DOM. Screenshot `phase4-pinned-working-1440.png` zeigt die Pinned-Zeile
„Angeheftet / Arbeitet / vor 1 m"; `phase4-drawer-390.png` zeigt die gepinnte
Idle-Zeile weiter als „Angeheftet / Ruhend".

Der externe Nutzer-Repro `temp/hermes-v2/phase4-ux-review/representative.test.ts`
ist unverändert und läuft jetzt 2 grün / 1 rot: „Arbeitet" grün, rot bleibt allein
`expect(row.group === "working")` (Zeile 30). Das ist die abgelehnte
Alternativrichtung und kein gültiges Gate für die gewählte Fixrichtung, also kein
Produktmangel.

## M2 (war Medium): eigene Zeit mobil 16 px

Behoben an der Ursache. `hermes-v2-sidebar.css:254` setzt für `.hermesv2-input`
`font-size: max(16px, var(--text-base))`. `.hermesv2-input` wird ausschließlich
von den Datums-/Zeitfeldern des Snooze-Sheets genutzt
(`HermesV2SnoozeSheet.tsx:96,101`). Der Autor-E2E
`tests/e2e/hermes-v2-sidebar.spec.ts:246-280` fokussiert jetzt beide echten Felder
und prüft die berechnete Schriftgröße ≥ 16 statt CSS-Quelltext; Screenshot
`phase4-snooze-custom-390.png` zeigt Datum und Uhrzeit mit exakter Wake-Zeit. Ich
habe keinen eigenen Browser gestartet (Auftrag). Diese Zeile ruht auf Quelle plus
Autoren-E2E plus Root-Browsernachweis, nicht auf eigener Messung.

## M3 bleibt zurückgezogen

Unverändert: `container-type: inline-size` erzeugt keinen Fixed-Containing-Block,
der Root-Browserlauf hat das Row-Menü in der normalen Wrapt-Route ausgerichtet
bestätigt, und `phase4-menu-bottom-390.png` zeigt das hochgeklappte Menü der
letzten erledigten Zeile vollständig im Viewport.

## Altbefunde und Root-Frühfindings

Alle im Vorgängerbericht als behoben geführten Punkte halten: Menü „Nach unten"
wirklich getauscht (`sidebar-row-commands.ts:69`), Pin-Aktion aus `row.pinned` in
allen Gruppen (`:56-60`), Dropziele nur Pinned/Active/Settled
(`sidebar-dnd.ts:5`), Undo ohne eigene Uhr (`organization-runtime.ts:197`,
`HermesV2UndoNotice.tsx`), Lesebelege nur am kleinen Endmarker je Row
(`useHermesV2ReadObserver.ts`, `.hermesv2-read-end`), Read-Unterdrückung unter
Drawer/Neues-Sitzung/Snooze (`HermesV2Shell.tsx:180`), Suchfeld 16 px
(`hermes-v2-sidebar.css:23`). Diese Dateien sind seit der letzten Runde
unverändert; ich habe sie am Code bestätigt, nicht erneut browser-verifiziert.

## Eigene Prüfungen (ausgeführt)

- 224/224 v2-Tests grün (`vitest run src/components/hermes/v2`, 24 Dateien).
- Eigene R2-Repros 2/2 grün; externer Nutzer-Repro 2 grün / 1 rot wie oben.
- `pnpm --filter @wrapt/web typecheck` grün.
- Gezieltes `eslint apps/web/src/components/hermes/v2 --max-warnings=0` grün.
- `pnpm architecture:file-lines` grün (1840 Dateien, Limit 400).

## Design, Tokens, Barrierefreiheit

v2-CSS ohne `text-transform: uppercase`, ohne Pillen (`999`/…), ohne Gradients,
ohne Hex-Farben; Boxshadow nur als Token (`--shadow-raised`) plus statischer
Inset-Ring für das aktive Drop-Ziel, ohne Animation. Reduced Motion ist gesetzt.
Alle verwendeten Tokens (`--text-*`, `--space-*`, `--color-*`, `--radius`,
`--shadow-raised`, `--font-mono`) sind in `index.css` definiert. Suchfeld 1 rem,
Zeitfelder ≥ 16 px, Touch-Ziele ≥ 44 px, keine horizontale Verschiebung in den
gesichteten Bildern.

## Low (nicht blockierend, kein Gate)

- `hermes-v2-chat.css` trägt tote Phase-3-Selektoren der gelöschten Sessionliste
  (`.hermesv2-session-list/-row/-dot/-title/-meta/-foot/-hint/-reload`, alle null
  Referenzen im TS/TSX) und definiert `.hermesv2-session-search`/`.hermesv2-sessionpanel`
  doppelt (36 px in chat.css gegen 44 px in sidebar.css). Die Sidebar-CSS lädt
  später und gewinnt, heute kein sichtbarer Fehler; bei nächster CSS-Berührung
  aufräumen.
- Der externe Nutzer-Repro dokumentiert mit Zeile 30 nur noch die abgelehnte
  Richtung. Für künftige Läufe als bewusst liegen gelassen markieren, damit der
  rote Fall nicht als Produktgate gelesen wird.

## Grenzen

- Kein Browser/Server/E2E gestartet (Auftrag). M1 zusätzlich von mir auf
  DOM-Ebene (jsdom) geprüft; M2 nur über Quelle, Autoren-E2E und Root-Nachweis.
- Nur UI/UX. Client- und Backend-Gates laufen separat; keine Backendfreigabe.

## Nächster Schritt

Kein UI/UX-Nachbessern nötig. Offen bleiben allein Client-/Backend-Gates und die
abschließende Root-Integration.

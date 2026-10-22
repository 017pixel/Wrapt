# Hermes V2 Phase 4: unabhängiges DeepSeek-UX-/UI-Gate (Sidebar/Organisation)

Stand 16.10.2026, ca. 20:05. Geprüft ist nur Sidebar-/Organisations-UX der
eingefrorenen Phase 4. Kein Gesamtfeature-PASS, keine Phase 5 bis 11. Keine
Produktänderung, kein Browser/Server, keine Dienste/Ports/Previews/Tmux/Slots,
keine Nutzersessions, kein Commit, keine Subagents. Gelesen: AGENTS.md,
sprachstil, design-system-guide, mobile-design, Originalauftrag, handoff,
evidence-gate-r4, phase4-interface-decisions, ui-/web-/backend-implementation,
phase3-deepseek-gate-r3, phase4-client-gate/-fixes und
phase4-browser-evidence.

Revisionstand: HEAD `f6a45419`, Arbeitsbaum, UI laut Root final eingefroren.
Die Nachweise in `plans/hermes-v2-phase4-browser-evidence.md` (36/36 E2Es, vier
Breiten, Reduced Motion, Custom-Light) sowie die aktuellen Screenshots
`snooze-390` und `menu-bottom-390` sind in dieses Urteil eingerechnet.

## Urteil: needs fixes

Zwei offene Medium-Findings (M1, M2). Kein High bewiesen. Das zuvor vorläufige
Finding M3 ist nach Prüfung der Containment-Frage und deinem In-Shell-Nachweis
zurückgezogen. Der UI-Scope ist nach Behebung von M1 und M2 PASS-fähig.

## M1 (Medium): gepinnte, arbeitende Sitzung zeigt „Ruhend“ und verbirgt die Laufzeit

Ort: `sidebar-format.ts:14-27` (`statusWord`), Wirkung mit
`sidebar-resolver.ts:16-17`. Datei zuletzt 18:55, also unverändert.
Repro: `temp/hermes-v2/phase4-ux-review/representative.test.ts`, zwei rote Fälle.

`resolveSidebarRow(session, metadata("a",{pinRank:0}), activity({state:"working", turnStartedAt: now-60000}), now)`
liefert `group:"pinned"`, `activity:"working"`, `durationMs:60000`. `statusWord`
gibt trotzdem „Ruhend“ zurück, und nur `group === "working"` rendert `durationMs`.

Nutzerfolge: Ein angehefteter Thread, der nachweislich arbeitet, erscheint als
ruhend und verschwindet aus dem In-Arbeit-Signal samt Laufzeit. Der Resolver
setzt Pin bewusst vor Working (Test `sidebar-domain.test.ts:19`), die
Statuswortlogik widerspricht damit der eigenen Zusage „Pin als Modifikator auch
in Working/Snoozed/Settled“ (ui-implementation). Fixrichtung: entweder Working
vor Pin gruppieren oder „Arbeitet“ und Laufzeit auch in der Pinned-Zeile ehrlich
zeigen. Der Root-E2E kombiniert Pin und Working nicht, daher unentdeckt.

## M2 (Medium): eigene Datum-/Uhrzeit-Inputs im Snooze-Sheet bleiben mobil 13 px

Ort: `hermes-v2-sidebar.css`, `.hermesv2-input { font-size: var(--text-base) }`,
genutzt ausschließlich von `HermesV2SnoozeSheet.tsx:96,101` (date/time). Die
Datei wurde um 19:46 angepasst (Snooze-Padding, sr-only-Legende), diese Regel
blieb unverändert.
Beleg: `index.css` setzt mobil `--text-base: 13px` (erst ab 1024 px: 15 px).
Alle übrigen V2-Eingaben erzwingen `max(16px, …)` (Composer
`hermes-v2-chat.css:260`, Suchfeld `:308` bzw. `1rem`, Select `:365`).

Nutzerfolge: Fokussiert man im mobilen Snooze-Sheet unter „Eigene Zeit“ das
Datums- oder Zeitfeld, zoomt iOS Safari die Seite (Auto-Zoom bei unter 16 px).
Das widerspricht der Abnahmezeile „16px Inputs“ und der Autorenangabe
„Zeit-Eingaben rendern mit 1rem“. Repro: 390 px, Snooze-Sheet, „Eigene Zeit“,
Datumsfeld fokussieren. Fix: `max(16px, var(--text-base))`.

## M3 zurückgezogen

Das vorläufige Finding (Row-Menü in der In-Shell-Route um den App-Shell-Versatz
verschoben, wegen `container: hermesv2 / inline-size` plus Portal in
`.hermesv2-drawer-layer`) halte ich nicht aufrecht. MDN `container-type` führt
für `inline-size` aktuell nur Style- und Inline-Size-Containment, kein
Layout-Containment, also keinen Fixed-Containing-Block. Dein Browserlauf hat die
normale Wrapt-Route bei 1440/390 direkt geprüft und das Menü am Trigger
ausgerichtet bestätigt, ebenso 44×44 am Handy. Damit entfällt der Befund.

## Bestätigte Fixes (im Code und an den Screenshots nachvollzogen)

- MoveDown tatsächlich getauscht (`sidebar-row-commands.ts:69` plus
  `planSidebarDrop`-Einfügepunkt).
- Pin-Modifikator steuert Aktionen aus `row.pinned` (Anheften/Lösen) in allen Gruppen.
- Eindeutige Heading-IDs über `useId`; aktive Row trotz Collapse genau einmal
  erreichbar (`visibleRows`/`listHidden`).
- Snooze-DST-Fold: Alternativen mit unterscheidbarem UTC-Label und explizitem
  `offsetMinutes`; `snooze-390.png` zeigt Presets, Auswahl und exakte Zeit.
- Undo ohne eigene Uhr (`organization-runtime.ts:192`, `HermesV2UndoNotice.tsx`).
- Read-Unterdrückung unter Drawer, Neues-Sitzung und Snooze-Modal über
  `chatReadActive`/`sidebarDialogOpen` (`HermesV2Shell.tsx:171-180`); Modalrolle
  liegt jetzt auf `.hermesv2-drawer-layer` (`:199-201`).
- Katalog-„Mehr laden“ auch ohne Suchtext, mit ehrlicher Abdeckung.
- Menü und Collapse nutzen More/Chevron mit unverändertem `aria-label`/`title`.
  `menu-bottom-390.png` zeigt das Menü am rechten Zeilenrand, über der letzten
  erledigten Zeile, beide Aktionen sichtbar. Das ältere `menu-bottom-1440.png`
  mit abgeschnittenen „Aktionen“ ist damit überholt.
- Vier Breiten, Drawer, Reduced Motion und Custom-Light ohne sichtbaren Mangel,
  kein horizontaler Überlauf, Composer 16 px.

## Eigene Prüfungen

- 224/224 v2-Tests grün (`vitest run src/components/hermes/v2`), keine sichtbare
  Regression der Phase-3-Fälle.
- Eigene drei UX-Repros: ein grün, zwei rot (M1).
- ESLint v2 grün, `architecture:file-lines` grün (1834 Dateien, Limit 400).
- `pnpm typecheck` rot, aber ausschließlich in
  `apps/server/src/hermes/v2/organization/review-regressions.test.ts`, einer um
  19:48 erstellten Datei des parallel laufenden Backendreviews. Kein UI-/Web-Bezug,
  hier nicht gewertet, betrifft aber die repo-weite Grünannahme.

## Grenzen und Abgrenzung

- Kein Browser/Server gestartet (Auftrag). Meine Checks sind Source-, Spec- und
  Testbasiert; die Browser- und E2E-Ergebnisse stammen von dir.
- Nur UI/UX-Scope. Client/State und Backend haben eigene Gates; keine
  Backendfreigabe. Die Regel „Chat liest unter allen Overlays nichts“ habe ich im
  Code plausibel nachvollzogen, nicht browser-verifiziert.
- Der E2E-Helferfehler (expandierte versehentlich das erste Zeilenmenü) ist als
  Testhelfer-Korrektur plausibel, keine Produktumgehung.

## Nächster Schritt

M1 und M2 beheben, dann ist der Sidebar-/Organisations-UI-Scope nach meiner
Sicht PASS-fähig. Reine Status-/Fontkorrekturen, kein neues Feature.

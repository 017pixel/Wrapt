# Hermes-V2 Phase 9 — UI-Implementierung (Phase-6/7-Lows, Polish, sichtbare Spalte)

Autor: Phase9-UI-Agent. Umsetzung der beauftragten sichtbaren UI-Fixes nach
Designplan; Produktion nicht gebaut, Root-E2Es unverändert, Freeze der
Produktquellen nach Abschluss. Alle Flächen ausschließlich Wrapt-Tokens,
keine neuen Farben, keine Gradients, Touch-Ziele ≥ 44 px, Texteingaben ≥ 16 px.

## Umgesetzte Fixes

### Phase 6 (Composer/Modell/Anhänge)

- L1 Entwurfserhalt (`HermesV2ComposerArea.tsx`): `applySlashPick` führt
  Abschlussteils `chat.setDraft(argument)` nur bei echter Slashzeile aus
  (`slash.startsSlash ? restHead(slash.rest).argument : null` ⇒ Ziel ohne
  Slash bleibt erhalten). Der gesprochene Befehlseinstieg über explizite
  Palette nimmt den erfassten Text als Argument auf (Skillanweisung,
  `/queue`-/`/steer`-Hinweis mit „Text steht im Sendefeld"), ohne den
  Entwurf je zu überschreiben; Enter wählt weiterhin die aktive Option
  (von Root-E2E verlangt, kein startsSlash-Gate am Enter).
  Zusätzlich: Der „Klassische Hermes-Oberfläche öffnen"-Link der Notiz
  läuft jetzt über `<Link>` statt rohem `<a href>` — der Router fügt den
  Basispfad an (`/wrapt/hermes-agent?ui=classic&session=…`), bestehendes
  Router-Muster wie Surface/RequestDeck, keine neue URL-API.
- L2 Modellsperre (`HermesV2ComposerToolbar.tsx`): Der „Modell wählen"-
  Einstieg ist gesperrt ohne Snapshot, bei read-only und beim Laden;
  Grund erreichbar als `title` plus eine eigene zeilenumbrechende
  `role="status"`-Notiz (Notiz-ID über `useId`, `aria-describedby` am
  Button). Neue Klasse `.hermesv2-composer-toolbar-note` (composer.css).
- L3 Anhänge (`HermesV2AttachmentChips.tsx`, `useComposerAttachments.ts`):
  Chips-Reichweite bleibt; übersprungene Anzahl geht als
  `onPickFiles(files, oversizeSkipped)` an den Hook, die Notiz
  „Maximal 10 Anhänge pro Nachricht; N übersprungen." veröffentlicht der
  Hook am Batchstart; `splitAttachmentLimit` wird auch beim Datei-Drop in
  der Area benutzt statt unbeschränkter Vollauswahl. Der End-Clear von
  `gatherAttachmentFiles` läuft als Wrapper und lässt die Notiz bei
  übersprungenen wie späteren Fehlern stehen;
  Slot-/Verbergen-/Parken-Abbruchnotizen bleiben sichtbar.
  Eigene Batchepoch (`epochRef`), die nur ein echter Batchstart neu setzt —
  ein zurückgehaltener Upload der früheren Auswahl schreibt die Notiz des
  Neubatches nicht.
- L4 Suchfeld-Zurücksetzen (`HermesV2ModelPicker.tsx`): `useEffect` setzt
  `query` beim Schließen (`!open`) zurück; offener Dialog bewahrt die
  laufende Suche; Hooks vor dem Early return.
- Composer-Eingabe (`hermes-v2-chat.css`): `.hermesv2-composer-input`
  `min-height: 44px` (Root-Messung 1440/1024/768 = 42 px); 16-px-Schrift
  war bereits gesichert.

### Phase 7 (Arbeit/Sidebar)

- L1 Sperrnotiz (`HermesV2WorkSendActions.tsx`): Zeile behält disabled +
  titles, ergänzt eine einzige sichtbare `role="status"`-Zeile unter der
  Aktionszeile (nicht in der horizontal scrollenden Leiste) und
  `aria-describedby` mit einer `useId` auf allen vier Buttons.
  `.hermesv2-work-send-note` in work.css.
- L2 Zeilenstatus (`work-panel-rows.tsx`, `work-format.ts`): Statuswort
  bekommt eine ID und wird per `aria-describedby` an den Aufklappknopf
  gebunden (Subagent + Prozess). Neuer ehrlicher Prozessstatus
  `processStateView` bei unbekannten strukturierten Werten roh bleiben
  (label = Rohwert, `data-status="unknown"`, nie „läuft/fertig" raten);
  bekannte Werte gesprochen („läuft", „beendet", „unterbrochen", …).
- L3 Shelf (`HermesV2SidebarShelf.tsx`): `aria-controls` nur bei
  nicht-versteckter Liste; eingeklappte Gruppen ohne sichtbare Row
  verweisen nirgendwohin.

### Sichtbare Sitzungsspalte (Panel/Orbit) + Standalone

- Drawer in jeder Variante (`HermesV2Surface.tsx`, `hermes-v2.css`):
  `useHermesV2Drawer(true, …)`, Sphere-Ebene immer gerendert; die
  Orbit-Versteckregeln `.hermesv2.is-orbit .hermesv2-sidebar/-drawer-toggle`
  entfernt. Der Öffner „Sitzungen" (exakter Name, Root-E2E-Locator)
  sitzt in der Toolbar jeder Variante.
- Minimal-Einbettung: `.hermesv2.is-minimal .hermesv2-toolbar { display: none }`
  ersetzt durch kompakte Regel — nur der Experimentell-Hinweis weicht;
  Sitzungsöffner, Klassisch, Fenster bleiben bedienbar (echter
  500-px-Orbitöffner ist minimal+kompakt).
- „Fenster"-Link (Name exakt „Fenster" beibehalten): sichtbar für
  panel/orbit/route; nur standalone aus.
- Standalone-Fußzeile: eigene Zeile außerhalb der areabody-Bedingung —
  Einstellungen (Link `/settings`, Routerbasis) + Zur Workbench für alle
  Bereiche (Cron/Skills/Memory/Diagnose) gleichzeitig; kein neuer
  Navigationsebene, keine neue URL-API.
- Hook-Modal für Panels: `useHermesV2Drawer` mit `enabled=true` und
  echtem `useModalFocus` — Fokus/Escape/Readguard auch in Panels.

### Dialog-/Toolbar-Polish

- `.hermesv2-modellliste`: eigenes `padding: var(--space-4)` (die globale
  `.modal-content`-Paddingregel greift nur in schmalen Ständen).
- `.hermesv2-model-search`: `min-height: 44px; font-size: max(16px,
  var(--text-sm))`.
- Toolbar-Buttons: `white-space: nowrap` (einzeilige Buttons).

## Eigene Tests (neu/erweitert)

- `useComposerAttachments.test.ts` (neu): echte gehaltene Upload-Promises
  — alter Batch überschreibt Neubatchnotiz nicht (übersprungen stehen
  bleibt), Neubatch ohne Überspringen räumt ab, Abbruchnotiz der
  weiterhin aktuellen Auswahl bleibt sichtbar, Abbruchnotiz des
  laufenden Batches überlebt keinen Neubatch.
- `HermesV2ComposerArea.test.tsx`: freier Entwurf bleibt über den
  Befehlseinstieg erhalten (Zielindex aus tatsächlicher
  `data-slash-key`-Reihenfolge, wie Root-Polish `aria-selected` erfasst);
  Klassiklink der Notiz über Routerbasispfad (`/wrapt/hermes-agent?…`);
  bestehende Assertions unangetastet.
- `HermesV2ModelPicker.test.tsx`: erneutes Öffnen startet ohne alte Suche.
- `HermesV2WorkSendActions.test.tsx`: Sperrnotiz sichtbar, Notiz-ID an
  Buttons beschrieben, konkreter Sperrgrund.
- `HermesV2WorkPanel.test.tsx`: Prozessstatus gesprochen bei bekanntem
  Wert; unbekannter strukturierter Wert roh + `data-status="unknown"`;
  Status beschreibt den Zeilenknopf.
- `HermesV2Sidebar.test.tsx`: `aria-controls` nur zu erreichbaren Listen.
- `HermesV2SurfacePanels.test.tsx` (neu): Panel und Orbit (inkl. minimal)
  stellen den Sitzungsöffner bereit, Drawer-Ebene mit inert geschlossen;
  Drawer öffnen/schließen im Panel; Rückwege-Klassisch/Fenster je
  Variante, Standalone ohne Fensterlink mit Einstellungen-/Workbench-
  Fußzeile. Kein Nachbau der Auswahlruntime (Root-Callerprüfungen
  bleiben in temp/hermes-v2/phase9-host-review-r2-20261017).
- `composer-area-fixtures.tsx`: Routerkontext mit optionaler Basis
  (`MemoryRouter` mit `initialEntries` unter `/wrapt`).

## Pflichtchecks (echte Exits)

- Vitest gezielt (9 Dateien, 80 Tests): Exit 0 — /tmp/opencode/phase9-targeted-tests.log
- Vitest hermes/Workbench/Orbit/Terminal (123 Dateien, 1192 Tests):
  Exit 0 — /tmp/opencode/phase9-full-hermes-tests.log wie final
  /tmp/opencode/phase9-v2-final-tests.log (Root sah denselben Exit)
- `pnpm typecheck`: Exit 0 — /tmp/opencode/phase9-typecheck-2.log
- Arch `pnpm architecture:file-lines`: Exit 0 — /tmp/opencode/phase9-arch.log
- Lint scoped auf alle von mir berührten TS/TSX-Dateien: Exit 0 (0
  Fehler; CSS von ESLint ignoriert) — /tmp/opencode/phase9-lint-scoped.log
- Globales `pnpm lint`: ursprünglich Exit 1 allein durch 1031 Fehler in
  `temp/hermes-v2/**` (alte Review-/Angriffsharnesses, 344 Dateien, u. a.
  erzeugte Browserbundles). Root hat gepardet: enges eslint-ignore für
  `temp/hermes-v2/**` plus Kommentare (Harnesschecks mit `--no-ignore`),
  Harnessskripte separat `--no-ignore --max-warnings=0` Exit 0 —
  /tmp/wrapt-hermes-v2-phase9-global-lint.log. Keine Produkt- oder
  Testurteile durch temp; keine Ignore-Ausweitung vom UI-Agent.

## Fixierungs-Manifest (sha256)

```
4a26e4a4991ce8de97f52d175c7c8326817e6f8bb0b4b9cfddd025facfbe97be  HermesV2ComposerArea.tsx
33c74e1d02bb432a310c2a2d980f789732a08d832e2cfaae418fee5c4aee0757  HermesV2ComposerToolbar.tsx
36734c5a14a150f01317816c249518408b4bad70090c40acaf92c8f46ea0c9ad  HermesV2ModelPicker.tsx
b7c6cccdef6edd7c430f2a328020751e72f4c4e1dbf542ebe0081d0127b8cd62  HermesV2AttachmentChips.tsx
0362b2f8728cd6da6594373693bbbe68acab3d74035f3257d945a39324b0e09b  useComposerAttachments.ts
f5d5fb25fba9b4e8d8c6d17ec63b10018381f61c12cb37f566ace808596d5d3c  HermesV2WorkSendActions.tsx
be2a8fce5da9d161287699c810704ae3542ec02dca6e29c5611e60f792186aba  work-panel-rows.tsx
e057527b92f20d50840882be2c97fb71110a1dea85b2f108fdf78e1dbbcc2eeb  work-format.ts
951aad5471adc76dcc8dc6bc48b32903792604d8002f2ac49cbdfe34caa06024  HermesV2SidebarShelf.tsx
406c7744130aa22a0679498d61cc47ef284600dfae4ec07ba34fe58dfcbb9cef  HermesV2Surface.tsx
330b82a68a02bdcb4496bf35c54fcce9c101a7a14735718b61390a4844f05872  hermes-v2.css
dce5d540e1e9bde085b47640060e30cb2cbc832f2b74a99daa696cdd3b2b6e0e  hermes-v2-composer.css
d8bc160c76111d86927d2fde7b933ee91294f65cd10b6658a31bf6fafa77c7e4  hermes-v2-dialogs.css
408e42ed1e94131d3304fa865f5ac6afa6a9c6056ac814143c56102ea507dbd0  hermes-v2-work.css
69e353895c6eb29bb4ce84386fc937752264f6731ca3c018725a09ca9cde97f6  hermes-v2-chat.css
81e715cbd79f0549a7a57991d37078134eba4087677c931a6126bd32ca18798a  HermesV2ComposerArea.test.tsx
8d356643f2089c1347a3e57b95aeb74f28ebebe6babeba03e873a9d8c27f897f  HermesV2ModelPicker.test.tsx
00b4dd5dcb128cc3a1188c5dddc9d90db134f74c455b3e4f99540604719769c5  HermesV2WorkSendActions.test.tsx
7aac67d99d2222627290bbfde9a9f5f264f7554a43e4636a99708dc716a47510  HermesV2WorkPanel.test.tsx
e93ec3e76b41814a53f698d2dea6b27443b5e0f092cfdceb7aa8582a4c8946df  HermesV2Sidebar.test.tsx
e58d5458cc20e8dc07f893b24f5b7cd4c5b54f2f3c4df65aee326b9a853818ca  useComposerAttachments.test.ts
39c1d8b4e3588d9f6a691787a076fd47604efe0a778e3f3656cc8f1a2f7d2634  HermesV2SurfacePanels.test.tsx
70aa9fe66b1cb25abccc6a66fd964b33731ee7aa2dbb2d2bfb760c428c394b96  composer-area-fixtures.tsx
```

## Freeze

Produkt- und Testquellen aus der obigen Liste sind ab dieser Zeile
eingefroren; Root übernimmt frischen Build, 7 eigene Browserregressionen
und danach 175 Hermesfälle/MCP. Änderungen an der NOT-FIXING-Liste
(HermesClassicShell, HermesV2Shell, shell-selection, ToolPanel,
Orbit-Host, chat-*/resource-*, Server, Contracts, Root-E2Es) wären als
Fremdänderung zu behandeln.

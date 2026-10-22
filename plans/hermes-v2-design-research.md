# Hermes V2 Design-Research (Phase 0, Agent C)

Read-only Recherche am aktuellen Checkout. Keine Produktdateien geändert.
Quellen: `apps/web/src/index.css`, `apps/web/src/visual-system.css`, `components/hermes/*`,
`views/settings/*`, `App.tsx` + Route-Registry, `stores/*`, `lib/*`, Git-Historie
(`7005b7ec`, `026bd3ec`, `9f7508ee`), Server-Contracts, Skills design-system-guide,
mobile-design, sprachstil.

## 1. Kernbefunde Ist-Stand

1. **Einzige sichtbare Hermes-Fläche** ist heute die offizielle SPA im iframe:
   `components/hermes/HermesShell.tsx` (Varianten `route | panel | orbit`) und
   `HermesAdminFrame.tsx` (iframe unter `/hermes`, Routen-Brücke per postMessage,
   `safeHermesPath`-Validierung). Route: `/hermes-agent` (`legacyPageRoutes.ts`,
   Owner `wrapt.hermes`, `mobileNavigation: true`, persistent).
2. **Native Chat-Existiert-bereits-Schicht auf dem Server**: `/api/v1/hermes/chat`
   (WebSocket, Protokoll v1) mit `session.create/attach/detach`, `message.send`,
   `task.cancel`, `approval.respond`, `model.set`; Server-Events `session.ready`,
   `message.appended/delta/complete`, `thought.delta`, `tool.update`,
   `approval.requested/resolved`, `commands.available`, `task.state`, `usage`,
   `error`. Same-Origin + Tailscale-Identität sind im Handshake erzwungen
   (`apps/server/src/hermes/routes.ts`). Contracts liegen vollständig in
   `packages/contracts/src/index.ts` (`hermesMessageSchema` inkl. `toolCalls`,
   `hermesApprovalSchema`, `hermesSlashCommandSchema`, `hermesTaskSchema`, …).
3. **Alte native UI (Git-Historie)** enthielt `HermesChatSurface`, `HermesMessageList`
   (marked + DOMPurify), `HermesComposer` (Autosize-Textarea, Enter/Shift+Enter,
   Slash-Suggestions, Stop-Button), `HermesSessionSidebar` (Suche, Delete mit
   ConfirmDialog, Drawer-Modus), `HermesToolCallCard` (`<details>`, Status-Punkt,
   Copy, Exit-Code), `HermesApprovalCard` (Restlaufzeit, nur vom Backend gelieferte
   Optionen), `useHermesChat` (Socket + Reconnect-Backoff + Dedupe).
   Entfernt in `9f7508ee` zugunsten der offiziellen SPA; Ursache war die
   Produktentscheidung „nur offizielle SPA", nicht technische Defekte.
   `026bd3ec` hatte bereits einen `uiMode`-Umschalter (native/offiziell) im
   `stores/hermes.ts` — direkter Präzedenz für das V2-Flag.
4. **Kein globales Light-Theme**: `themeRuntime.ts` überschreibt Accent- und
   Flächen-Tokens pro Appearance-Theme ( dunkle Basis bleibt); Design bleibt dunkel.
5. **Responsive-Policy zentral**: `lib/useResponsiveShell.ts` liefert
   `compact | tablet | desktop` (compact ≤767 px oder Phone-Landscape, tablet ≤1180 px
   bzw. Coarse-Pointer ≤1366 px), `inputMode: touch|fine`, Orientation,
   `--app-viewport-height`/`--keyboard-inset` via `useVisualViewportVariables`.
   Touch erzwingt 44 px Ziele über `data-input-mode="touch"` im App-Shell.
6. **Standalone-Routen sind ein Standard-Muster**: `standaloneRoute()` in
   `legacyPageRoutes.ts` (z. B. `/terminal/fenster/:runtimeId`) rendert ohne
   App-Shell-Topbar (`routeHost.tsx` trennt `shell === "standalone"` heraus).
7. **PersistentOutlet hält Routen alive**, auch geparkt. V2 darf deshalb nur bei
   `routeActive` (Muster `useRouteActivity()` wie in `HermesShell.tsx`) verbinden.
8. **Bestehende WebSocket-Clients als Vorbilder**: `terminal/transport/TerminalTransport.ts`
   (multiplexter Socket, Heartbeat, exponentieller Backoff, Status-Listener) und
   `NotificationCenter.tsx`.

## 2. Token-Fundament (verbindlich, einzige Quelle `index.css` `@theme`)

| Rolle | Tokens |
| --- | --- |
| Opake Flächen | `--color-ink-950` Basis, `ink-900` Karte/Sidebar, `ink-875`, `ink-850` Overlay/Dialog |
| Transparenz-Auflagen | `ink-800` 4 %, `ink-750` 6 %, `ink-700` 8 %, `ink-600` 12 %, `--color-line`, `--color-line-soft` |
| Text | `--color-text`, `--color-muted`, `--color-faint` |
| Akzent | `--color-accent` (+ `-soft`, `-line`, `-contrast`), Primäraktion gefüllt blau |
| Status | `--color-ok/-warn/-bad` (+ `-soft`), `--color-info` |
| Typo | `--text-2xs … --text-hero` (ab 1024 px +2 px), `--font-sans` DM Sans, `--font-mono` JetBrains Mono, `tabular-nums` für Zahlen |
| Radius | `--radius: .25rem` große Flächen, `--radius-sm/md: 2px` Buttons/Kleinteile, `--radius-pill` nur für funktionale Punkte |
| Space | `--space-1 … --space-16` (4-px-Rhythmus) |
| Motion | `--ease-standard cubic-bezier(.16,1,.3,1)`, `--ease-emphasized`, `--duration-fast 120ms`, `-base 180ms`, `-slow 320ms` |
| Elevation | `--shadow-raised/-overlay/-popover`, Glas-Ebene für schwebende Leisten |
| Fokus | `--focus-ring-color` + globaler `:focus-visible`-Ring (Spezifität 0) |

Regeln: keine neuen Hex-Werte in Komponenten (Prüfung: `grep -oE '#[0-9a-fA-F]{3,8}'
apps/web/src/index.css` darf nur `@theme`, die drei bewussten Weißflächen und den
`.hermes-shell`-Block treffen). Der teal-farbene `.hermes-shell`-Tokenblock bleibt
exklusiv dem Rahmen der offiziellen SPA. **V2 ist eine Wrapt-Fläche auf der Ink-Palette**,
Hermes-Branding nur über `HermesIcon` (`components/icons`, existiert in Product- und
Workbench-Variante) und dezente Statusdetails. Keine Gradients, keine Emojis, keine Pills,
kein `uppercase`-Spam (bestehende kleine Meta-Labels wie `.dash-subheading` sind die
Projekt-Sprache und dürfen für Shelf-Header weitergeführt werden).

## 3. Komponenten- und Datei-Map (Neubau, alles ≤400 Zeilen)

Feature-Ordner: `apps/web/src/components/hermes/v2/`. Feature-CSS in einer Datei
`hermes-v2.css` (nur Tokens). Store und Lib nach bestehendem Muster in `stores/` bzw. `lib/`.

| Datei | Verantwortung | Zeilenziel |
| --- | --- | --- |
| `v2/HermesV2Shell.tsx` | Layout Sidebar + Chat (+ optional Inspector), Drawer-Schaltung, Offline/Verbindungs-Banner, Übergabe `active` | ~200 |
| `v2/HermesV2Sidebar.tsx` | Shelfs Pinned/Needs input/Active/Working/Snoozed/Settled, Suche, Aktionen, Drag & Drop (Phase 4) | ~300 |
| `v2/HermesV2SessionRow.tsx` | Kompakte Zeile: Statuspunkt, Titel, Dauer, Modell, Aktionenmenü, Touch ≥44 px | ~150 |
| `v2/hermesV2SidebarState.ts` | Reiner, testbarer Zustandsresolver (Shelf-Zuordnung + deterministische Sortierung) | ~200 |
| `v2/HermesV2Chat.tsx` | Nachrichtenliste, Streaming-Anker, leere Zustände (`EmptyState`-Muster) | ~250 |
| `v2/HermesV2Message.tsx` | Rolle/Meta, Markdown (marked + DOMPurify, Muster aus alter `HermesMessageList`), Copy, Retry | ~200 |
| `v2/HermesV2ToolCallCard.tsx` | Tool-Streaming-Merge (`tool.update`), Status, Input/Output eingeklappt, Mono-Output, Redaction | ~200 |
| `v2/HermesV2ThinkingBlock.tsx` | Einklappbarer Reasoning-Block, nur bei geliefertem Inhalt | ~80 |
| `v2/HermesV2ApprovalCard.tsx` | Approval-Card: nur die vom Backend gelieferten Optionen, Restlaufzeit | ~120 |
| `v2/HermesV2SecretRequest.tsx` | Masked Input, kein Persistieren/Loggen (Phase 5, nur wenn Backend liefert) | ~120 |
| `v2/HermesV2Composer.tsx` | Autosize-Textarea (16 px Schrift gegen iOS-Zoom), Enter/Shift+Enter, Send/Stop, Draft je Session | ~300 |
| `v2/HermesV2SlashPalette.tsx` | Palette unter dem Composer, fuzzy Suche, Keyboard-Navigation, Argument-Hints | ~200 |
| `v2/HermesV2ModelPicker.tsx` | provider:model Auswahl aus `/hermes/models`, sessionbezogen (`model.set`) | ~150 |
| `v2/hermes-v2.css` | Feature-Styles, ausschließlich `var(--*)` | ~350 |
| `stores/hermesV2.ts` | UI-Metadaten (s. §5), zustand/persist, versioniert | ~250 |
| `components/hermes/v2/useHermesV2Chat.ts` | Transport-Hook (Interface §6); Basis: `useHermesChat` aus Git-Historie + `TerminalTransport`-Muster | ~300 (Codex) |
| `stores/hermesV2Chat.ts` | Reducer/Chat-Zustand inkl. Reconnect-Dedupe (Codex, Phase 3) | ~300 (Codex) |

Angepasste Bestandsdateien (klein, kein Umbau):

| Datei | Änderung |
| --- | --- |
| `views/HermesRoute.tsx` | Flag-Lese schaltung: V2 aktiv → `HermesV2Shell`, sonst heutige `HermesShell` |
| `extensions/legacyPageRoutes.ts` | Owner `wrapt.hermes` um Standalone-Route `/hermes-agent/app` (V2-Fokusmodus) und Alias-Route `/hermes-agent/verwaltung` (offizielle SPA) erweitern |
| `views/settings/SettingsEasterEggs.tsx` | zweite Card „Hermes V2" (§7) |
| `lib/settingsSearch.ts` | Such-Eintrag `hermes-v2` mit Anchor `settings-hermes-v2` |
| `lib/apiClient/hermes.ts` | nur falls neue serverseitige Endpunkte entstehen (Backend-Thread) |
| `packages/contracts/src/index.ts` | V2-Erweiterungen zuerst in Contracts (Regel AGENTS.md) |

## 4. Layout- und Responsive-Verhalten

Grundlayout Desktop: linke V2-Sidebar (persistent, 280–320 px, Breite via
`usePaneWidth`-Muster), mittlere Chat-Fläche mit Lesegrenze (~46 em) für Text,
Composer unten fixiert, optionaler Inspector als rechts angedocktes Panel (Phase 7+).

| Breite | Shell-Modus (`useResponsiveShell`) | V2-Verhalten |
| --- | --- | --- |
| 390 (Phone) | `compact`, touch | Sidebar als Drawer (`role="dialog"`, kein Modal-Backdrop-Konflikt mit App-Topbar), Chat voll breit, Composer sticky am unteren Rand mit `env(safe-area-inset-bottom)`, Inputs 16 px (kein iOS-Zoom), Approval-Cards immer im Chat-Fluss sichtbar, nie hinter Drawer, Touch-Ziele ≥44 px |
| 768 (Tablet hoch) | `tablet`, touch | wie 390 (Drawer-Sidebar), zusätzlich dichtere Rows; App-Topbar bleibt (Standard-Shell) |
| 1024 (Tablet quer / kleines Desktop) | `tablet` (≤1180) oder `desktop` | Sidebar persistent ab >900 px (Muster Notes `isDrawerSidebar`), Inspector nur auf Wunsch |
| 1440 (Desktop) | `desktop` | Dreispalten-Satz, Sidebar resizable, Inspector andockbar; Streaming erzeugt keine horizontalen Verschiebungen (Overflow-Container + `min-width: 0`) |

Standalone-Route `/hermes-agent/app`: `standaloneRoute` ohne App-Shell; eigene
kompakte Toolbar (Connection-Status, Sidebar-Toggle, Link zurück in die Workbench,
Link „Hermes Verwaltung"). Gleiche Komponenten, gleicher Store, gleiches CSS.

## 5. State-Aufteilung (Hermes-Salz vs. Wrapt-Metadaten)

Hermes-owned (nur anzeigen): Sessions, Messages, ToolCalls, Approvals, Commands,
Models, Tasks, Usage, Cron. Wrapt-owned UI-Metadaten, client-lokal:

```ts
// stores/hermesV2.ts — key "wrapt.hermes-v2.v1", version: 1
interface HermesV2PreferencesState {
  v2Enabled: boolean;                       // Easter-Egg-Flag, default false
  setV2Enabled(value: boolean): void;
  pinnedOrder: string[];                    // Session-IDs in Pin-Reihenfolge
  snoozed: Record<string, string>;          // sessionId -> ISO wake time
  settled: Record<string, string>;          // sessionId -> ISO settledAt
  unseenAt: Record<string, string>;         // sessionId -> ISO letzte gesehene Aktivität
  collapsedShelves: Record<ShelfKey, boolean>;
  sidebarCollapsed: boolean;
  // migrate(): alte/ungültige Einträge verwerfen, Sessions dürfen unbekannt sein
}
```

Snooze/Settled/Pin/Unseen sind reine Darstellungsmetadaten und dürfen Hermes-Daten
nicht verändern (Brief §5.5/§5.6). Lösch- und Resume-Semantik bleibt bei Hermes
(`DELETE /hermes/sessions/:id` mit `ConfirmDialog`, Resume über `session.attach`).

Sidebar-Zustandsresolver (rein, unit-testbar):

```ts
export type ShelfKey = "needs-input" | "active" | "working" | "snoozed" | "settled";
export type HermesV2RowState =
  | "working" | "waiting_input" | "idle_unseen" | "idle_seen"
  | "snoozed" | "settled" | "error";
export interface HermesV2Row {
  session: HermesSession;             // aus Contracts, unverändert
  state: HermesV2RowState;
  pinned: boolean;
  workingSince: string | null;        // hermesTasks.runtimeSeconds -> Dauer
  wakeAt: string | null;
}
export function resolveShelf(row: HermesV2Row, now: number): ShelfKey;
// Priorität: needs-input > snoozed > settled > pinned oben im Active >
// working > active. waiting_input entsteht aus approval.requested/task.state,
// error aus Session-Status "failed" + letztem Ergebnis.
```

Lücken, die der Backend-Thread klären muss (UI darf sie nicht erfinden):
`waiting_input` ist nur sichtbar, solange ein Socket verbunden ist; `needs-input`
für nicht verbundene Sessions braucht einen serverseitigen Zustand oder Poll.
Secrets/Sudo/Clarify fehlen im Protokoll v1 (nur `approval` existiert).

## 6. Transport-Hook-Interface (Vorschlag für Codex, Phase 2/3)

```ts
export interface HermesV2ChatApi {
  connected: boolean;
  session: HermesSession | null;
  messages: readonly HermesMessage[];
  toolCalls: ReadonlyMap<string, HermesToolCall>;   // laufende + fertige Calls
  approvals: readonly HermesApproval[];
  commands: readonly HermesSlashCommand[];
  usage: HermesUsage | null;
  taskState: "idle" | "running" | "cancelling";
  send(content: string, clientMessageId: string): void;
  stop(): void;                                     // task.cancel
  respondApproval(requestId: string, option: "allow_once" | "allow_session" | "deny"): void;
  setModel(model: string): void;
  retryLast(): void;
}
// connect nur wenn: v2Enabled && routeActive (Muster HermesShell frameActive).
// Reconnect: Backoff wie TerminalTransport, Dedupe über message.id bzw.
// clientMessageId, Replay über session.attach + session.ready(replayComplete).
```

## 7. Settings-Integration (Empfehlung)

**Flag client-lokal persistieren**, nicht serverseitig: V2 ist eine Darstellungswahl
dieses Browsers, genau wie Sidebar-/Layout-Preferences (`stores/appPreferences.ts`,
`sidebarPreferences.ts` als Muster). Vorteile: kein neuer API-Endpunkt, kein
Settings-Server-Contract, Flag-off garantiert null Zusatztraffic überall, Rollback
= Toggle. Der persist-Store aus §5 trägt `v2Enabled`.

Card in `SettingsEasterEggs.tsx` nach dem Capybara-Muster (zweite `Card` in der
Section): Titel „Hermes V2", Untertitel „Experimentelle native Hermes-Oberfläche",
`settings-toggle-row` mit `role="switch"` + `settings-toggle-switch` (44 px Row),
Beschreibungssatz, sekundärer `Link` „Hermes V2 öffnen" (nur wenn aktiv),
Hinweis „Experimentell" als kleine `muted`-Zeile. Wirkung sofort: `HermesRoute`
liest den Store; kein Reload nötig (Route re-rendert, wenn die Route aktiv ist).
Eintrag in `settingsSearch.ts` mit `tab: "easter-eggs"`, `anchor: "settings-hermes-v2"`.
Testmuster: `SettingsEasterEggs.test.tsx` erweitern (default off, Persistenz,
off = alte Route).

## 8. Motion (nur transform/opacity, Tokens)

| Anlass | Umsetzung |
| --- | --- |
| Sidebar-Neuordnung | Sortierung nur bei Shelf-Wechsel/zuletzt gestarteter Arbeit, nie pro Token; FLIP-artig via transform |
| Shelf auf/zu | `grid-template-rows 0fr→1fr` oder max-height, `--duration-base`, `--ease-standard` |
| Message arrival | `opacity 0→1` + `translateY(8px)`, `--duration-base` |
| Streaming-Cursor | dezenter Opacity-Blink, in `@media (prefers-reduced-motion: no-preference)` gekapselt (Muster `.dash-pulse`) |
| Tool-Card öffnen | Inhalt fade + translate, Statuspunkt wechselt Farbe ohne Animation |
| Popover/Picker | `scale(.98)→1` + fade, `--duration-fast` |
| Drawer (mobil) | `translateX`, `--duration-slow`, Backdrop `opacity` |
| Route-Wechsel | dezent; `lib/viewTransition.ts` existiert, Standard `::view-transition`-Regeln in index.css |

`prefers-reduced-motion: reduce` ist global in `index.css` (Zeilen 720–727) abgedeckt;
Feature-Animationen zusätzlich selbst kapseln. Animation verzögert nie Agent-Aktionen
(Send/Stop/Approval immer sofort, ohne Warte-Animation).

## 9. Wiederverwendbare Bausteine (bestehend, nicht neu bauen)

`Card`, `EmptyState`, `ConfirmDialog`/`ModalDialog` (`modal-sheet`), `quiet-button`,
`quiet-button-primary`, `icon-button`, `settings-toggle-switch`/`-row`,
`query-skeleton`/`.dash-skeleton` (Skeleton statt Spinner), `.dash-empty`,
`useMediaQuery`, `useResponsiveShell` + `useVisualViewportVariables`, `usePaneWidth`,
`useRouteActivity`, `useViewPresence`, `hashTabs`, Markdown-Pipeline `marked` +
`DOMPurify` (Muster `QuickLook.tsx`/alte `HermesMessageList`), `highlight.js`-Sets aus
`QuickLook`, `TerminalTransport`-Muster für Socket-Lifecycle, `HermesIcon`.

## 10. Risiken und offene Punkte

1. Protokoll v1 kennt kein Clarify/Secret/Sudo und kein Subagent-Streaming;
   Flächen dafür erst bauen, wenn der Backend-Thread Lieferschaft bestätigt.
2. `needs-input`/`unseen` ohne offene Verbindung erfordert Server-Zustand oder Poll;
   Entscheidung im Backend-Research, UI-Resolver bleibt davon unabhängig.
3. Zwei Tabs + Standalone gleichzeitig: `openConnection/closeConnection` im
   ACP-Manager muss Refcounting vertragen (Backend-Thread prüfen).
4. Alte UI-Tests (hermes.spec, hermes-mobile.spec) prüfen V1-Flows; V2-Tests
   ergänzen statt umschreiben (Phase 1: Flag-Default, Route-Wechsel, kein Socket bei off).
5. Dateigrenze 400 Zeilen: `HermesV2Sidebar` und Composer früh nach fachlicher
   Verantwortung splitten (Shelf-Kopf/Zeile/Actions separat), `pnpm
   architecture:file-lines` vor Abschluss.

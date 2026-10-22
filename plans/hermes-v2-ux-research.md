# Hermes V2 UX Research (Phase 0, read-only)

Auftrag: T3 Code Sidebar/State/Motion/DnD/Snooze gegen aktuelle Quellen prüfen, die von
Hermes V2 gewünschte Sidebar in eine präzise Zustandsmaschine übersetzen und Abnahmetests
formulieren. Keine Implementierung, keine Dienst- oder Preview-Änderung.

## 0. Meta

- Wrapt Repo: `/home/bbecker/projects/Wrapt`, Branch-Stand nur gelesen, nichts geändert.
- T3 Code lokal: `/home/bbecker/github-repo-clones/t3code`, Checkout `30cc788975500a8c00d32a50f348174d1ce578d1` (2026-10-07).
- T3 Code Upstream, per `git fetch` verifiziert: `origin/HEAD` = `cfafb4bb54d244e4612f5681aad3832ea64cb0fb` (2026-10-16). Alle unten zitierten Aussagen stammen aus `origin/HEAD`, nicht aus dem älteren Checkout.
- Zwischen Checkout und HEAD liegen relevante Commits an genau diesen Dateien (`2d31acb975` Sidebar-Renders, `e536bfd33b` Warten-Status, `f4df794777` Subagent-Approval kehrt zurück, `b0ee7dd48f` Drag-Abbruch). Deshalb gilt HEAD als Quelle.
- Nicht-Ziele: Wrapt-Hermes-Backend-Matrix (Agent A/B), Design-Token-Inventar (Agent C), Implementierung.

## 1. Geprüfte T3-Quellen

| Quelle | Rolle | Für V2 relevant |
| --- | --- | --- |
| `apps/web/src/components/Sidebar.tsx` | Rendering, Rows, Shelves, Aktionen, Toasts | Sektionen, Row-Aktionen, A11y-Attribute, Collapse/Paging |
| `apps/web/src/components/Sidebar.logic.ts` | Reine Logik: Sektion, Status, Drop-Plan, Sortierung, A11y-Label | Kern der Zustandsmaschine |
| `apps/web/src/components/Sidebar.drag.ts` | dnd-kit Kollision, Sortierstrategie | Zulässige Drop-Ziele, Preview |
| `apps/web/src/components/Sidebar.pointer.ts` | Eigener Pointer-Sensor | Gesten-Abbruch, Klick-Unterdrückung |
| `apps/web/src/components/Sidebar.motion.ts` | Web-Animations-Layout-Übergänge | 150 ms, Reduced Motion, Fade-Budget |
| `apps/web/src/components/Sidebar.snooze.ts` | Snooze-Labels | Presets, Wake-Text |
| `packages/client-runtime/src/state/threadSettled.ts` | Snooze/Settle-Invarianten | `effectiveSnoozed`, Hand-Raise, Presets |
| `packages/client-runtime/src/state/threadInbox.ts` | Working-Fold, Inbox-Sortierung | Working-Zustand, Rückkehr-Tracker |
| `packages/client-runtime/src/state/threadSort.ts` | Sortier- und Pin-Order-Schlüssel | Fractional Index, Pinned/Active-Sort |
| `apps/web/src/hooks/showThreadUndoNotice.ts` | Undo-Sammelbenachrichtigung | 5 s Fenster, Gruppierung |
| `docs/user/thread-sidebar.md` | Nutzerdoku | Erwartetes Verhalten, offizielle Formulierung |

## 2. T3-Ist-Zustand

### 2.1 Sektionen und Reihenfolge

UI-Reihenfolge aus `createSidebarSortingStrategy` (`Sidebar.drag.ts`):
`Pinned` -> Pin-Divider -> `Active` -> `Working` -> `Snoozed` -> `Settled`.
Pinned hat keinen Header im Ruhezustand. `Working`, `Snoozed`, `Settled` sind Shelves und starten
eingeklappt (`Sidebar.tsx`, `useLocalStorage`-Keys `settled-expanded`, `snoozed-expanded`,
Working-Working-Beta). Ausnahme: Der offene Thread per Route bleibt sichtbar, auch wenn sein Shelf
eingeklappt ist, damit eine Route nie hinter dem Shelf verschwindet.

### 2.2 Sektionsauflösung (Überlagerung, nicht exklusiv)

```
resolveSidebarThreadSection({ snoozed, settled, pinned }):
  snoozed -> "snoozed"
  settled -> "settled"
  pinned  -> "pinned"
  sonst   -> "active"
```

Wichtig: Snooze und Settle sind Überlagerungen über den aktiven Zustand. Ein Thread bleibt im
Datenmodell aktiv; Snooze unterdrückt nur die Sichtbarkeit. `pinned` ist ein Modifier, keine
eigene Lebensphase.

### 2.3 Statusauflösung

```
resolveSidebarThreadStatus(thread):               // erste Regel gewinnt
  pendingApprovals || pendingSubagentRequest=approval  -> "approval"
  hasPendingUserInput || pendingSubagentRequest=user_input -> "input"
  runtime.status in {preparing,queued,starting,running,waiting} -> "working"
  runtime.status = idle                                   -> "waiting"
  runtime.status = failed -> lastErrorClass=usage_limit ? "limited" : "failed"
  sonst                                                   -> "ready"
```

Deterministische Statuspriorität (`THREAD_STATUS_PRIORITY`):
`Pending Approval 5 > Awaiting Input 4 > Working/Connecting 3 > Waiting 2.5 > Plan Ready 2 > Completed 1`.

Top-Status pro Row (`resolveSidebarV2TopStatus`): `working, waiting, approval, input, failed, limited`
schlagen `woke` schlägt `done` (unseen) schlägt `null`.

### 2.4 Sortierung

- Pinned: fractionale Index-Schlüssel (`pinOrderKey`, base-26), ein Schreibvorgang pro Move, server-owned. Keyless Threads (vor Reordering gepinnt) sinken ans Blockende.
- Active: entweder manuelle `activeOrderKey` (arrangiert) oder Zeit-Sortierung; Anker ist `createdAt`, bei Reentry `unsettledAt`. Mit Working-Beta wird Active zeitlich nach "zuletzt zurückgekommen" sortiert und Drag im Active ist gesperrt.
- Working: nach "zuletzt vom Nutzer gesendet", Run-Enden verschieben die Zeile nicht.
- Settled: nach `settledAt`, sonst jüngstem Message-/Turn-Stamp, absteigend.
- Inbox (Working-Beta): `sortInboxThreadsByReturn` mit lokalem `createInboxReturnTracker`.

### 2.5 Snooze als Überlagerung

`effectiveSnoozed` = `snoozedUntil` in der Zukunft UND kein "raised hand".
`threadRaisedHandWhileSnoozed` schlägt den Wecker vorzeitig, wenn:
Approval/User-Input offen, frische Fehler nach dem Snooze, oder ein Run nach dem Snooze abgeschlossen wurde.
Ein Wecker ist reine Ableitung, kein Server-Event. `threadWokeAt` liefert den "Woke"-Zeitpunkt;
besucht der Nutzer, erlischt der Indikator. Presets: 1 h, 3 h, This evening (nur vor 18 Uhr),
Tomorrow (9:00), Next week (Montag 9:00); Kollision Tomorrow/Next week am Sonntag fällt zusammen.
Custom erlaubt Datum/Uhrzeit oder Dauer und lehnt Vergangenheit sowie DST-ungültige Zeiten ab.
`canSnooze` verbietet Snooze, solange Approval/Input offen oder ein Turn-Start unadoptiert ist.

### 2.6 Settle

Manuell (`settledOverride="settled"`) oder automatisch (Inaktivität, PR gemerged/closed).
Settle räumt Pin und Active-Position auf, stempelt `settledAt`. Un-settle setzt `unsettledAt`,
sodass der Thread oben einsortiert und bis neuer Aktivität nicht wieder auto-settlet.
Manuelles Settle verwirft unbeantwortete Async-Fragen und schließt wartende Terminals.

### 2.7 Unseen und Visits

`hasUnseenCompletion` = `latestRun.completedAt > lastVisitedAt`. `lastVisitedAt` ist server-autoritativ,
wenn der Server Visits führt; `markUnread` kann ihn bewusst zurückspulen. Das lokale Wasserzeichen
greift nur bei Servern ohne Visit-Tracking.

### 2.8 Undo

Ein Fenster, 5000 ms (`showThreadUndoNotice`). Aufeinanderfolgende Aktionen gleicher Art teilen
eine Meldung und werden zusammen zurückgenommen. Claims verhindern Doppel-Undo. `mod+z` löst das
zuletzt angezeigte Undo aus, solange kein Textfeld fokussiert ist (`docs/user/keybindings.md`).

### 2.9 Drag and Drop

`resolveSidebarDropTarget` liefert nur `pinned | active | settled`; `working` und `snoozed` geben
`null`, also keine freien Drop-Ziele. Verb (`resolveSidebarDropVerb`): `pin, unpin, settle,
unsettle, wake`. Reorder innerhalb einer Sektion zeigt kein Badge; Sektionswechsel zeigt Badge mit Icon.
Sweep: Settle/Un-settle/Wake über Bereich per Drag und `Escape` bricht ab. Pointer-Sensor
(`Sidebar.pointer.ts`) bricht bei `Escape`, Fenster-`blur`, `pagehide`, `resize`, verlorenem
Button und Tab-Wechsel ab und unterdrückt den Folgeklick.

### 2.10 Motion

`Sidebar.motion.ts` nutzt Web Animations API, `duration: 150`, `ease-out`. Nur `transform` und
`opacity`. Entfernte Zeilen faden über einen inerten Klon. Fade-Budget: mehr als 40 gleichzeitig
gefadete Zeilen schalten die Animation für dieses Update ab (Kosten). `prefers-reduced-motion`
via `matchMedia` deaktiviert die Bewegung. Nach Drag-Release glätten alle Zeilen (`release()`) in
ihre Zielposition, ohne eine zweite Transition.

### 2.11 Live-Abos und Performance

`useSidebarRowSubscriptionLease` hält eine Zeile nur live, wenn aktiv oder per
IntersectionObserver (160 px Overscan) nahe am Viewport. Prewarm-Limit: 3 Detail-Abos gleichzeitig.
Settled-Tail paginiert: initial 10, je "Show more" 25.

### 2.12 Accessibility (Ist)

`resolveSidebarRowAccessibility` setzt `label = Titel, Status, Projekt` und `aria-current="page"`
für den aktiven Thread. Jede Row ist `role="button"`, verschachtelte Aktionen haben eigene Labels.
Live-Meldungen laufen über `role="status"` und `sr-only`. Es gibt kein `listbox`/`option`-Muster;
Tastatursteuerung läuft über Shortcuts (`resolveAdjacentThreadId`, `mod+1..9`, `mod+z`).

## 3. Hermes V2: Zielzustandsmaschine

### 3.1 Zwei Achsen strikt trennen

Hermes-owned (Lifecycle, aus Events): `working`, `waiting_input`, `idle`, `failed`, `limited`.
Wrapt-owned (Organisation, UI-Metadaten): `pinned`, `pinned_order`, `snoozed_until`, `settled_at`,
`unseen_watermark`, `collapsed_shelves`, `density`, `standalone`. Kein Schreiben von Wrapt-Metadaten
in Hermes-Sessiondaten.

### 3.2 Basiszustände

| Zustand | Bedingung | Sektion |
| --- | --- | --- |
| `needs_input` | offener Approval/Clarify/Secret/Sudo/Vault Request oder Fehler mit Entscheidung | Needs input |
| `working` | laufender Turn, Background Work, laufende Subagents, Watch | Working |
| `unseen` | Turn nach `lastVisitedAt` abgeschlossen, kein offener Request | Active, markiert |
| `idle_seen` | fertig/ruhend, gesehen, nicht snoozed/settled | Active |
| `snoozed` | `snoozed_until > now` und kein raised hand | Snoozed |
| `settled` | `settled_at` gesetzt | Settled |
| `failed`/`limited` | Fehler bzw. Provider-Limit | Active, markiert (Needs input, wenn Entscheidung nötig) |
| Modifier `pinned` | `pinned_order` gesetzt | Pinned (über Active) |

### 3.3 Ereignisse

Hermes: `run.started`, `tool.*`, `run.completed`, `run.failed`, `request.opened`,
`request.answered`, `subagent.started/finished`, `queue.changed`, `reconnect`, `history.loaded`.
Wrapt: `pin`, `unpin`, `settle`, `unsettle`, `snooze(until)`, `wake`, `visit`, `mark_unread`,
`shelf.toggle`, `drop(plan)`, `undo`.

### 3.4 Deterministische Übergänge

```
classify(s, now):                                   // Reihenfolge ist verbindlich
  1 requestOffen(s)                        -> needs_input
  2 snoozeAktiv(s.snoozed_until, now) && !raisedHand(s, now) -> snoozed
  3 settled(s.settled_at)                  -> settled
  4 laufend(s)                             -> working
  5 completedAt > lastVisitedAt(s)         -> unseen (innerhalb Active)
  6 sonst                                  -> idle_seen

raisedHand(s, now):                                    // bricht Snooze auf, löscht Felder nicht
  approval|input offen
  || (Fehler frisch nach snoozed_at)
  || (Latest-Run abgeschlossen nach snoozed_at)

on run.completed:
  seen bleibt  -> idle_seen
  neu          -> unseen, Rueckkehr an Inbox-Kopf; bei "wake-on-completion" Snooze aufheben
on request.opened: immer -> needs_input (Snooze-Sperre, kein Snooze solange offen)
on visit(thread):  setze lastVisitedAt = now (server, autoritativ)
on mark_unread:    setze lastVisitedAt zurueck (Server)
on snooze(until):  nur wenn canSnooze, sonst Ablehnung mit Grund
on wake:           snoozed_until = null, Thread kehrt in den Kopf von Active
on settle:         pinned_order = null, active_order = null, settled_at = now
on unsettle:       settled_at = null, unsettled_at = now (oben einsortieren)
```

### 3.5 Priorität, verbindlich

```
Anzeigereihenfolge:
  Pinned (immer oben, eigene Ordnung)
  Needs input        (Approval/Clarify/Secret/Sudo/Vault/Entscheidungsfehler)
  Active
    unseen zuerst, sonst idle_seen; innerhalb nach Rueckkehrzeit bzw. manueller Ordnung
  Working (Shelf, unter Active)
  Snoozed (Shelf)
  Settled (Shelf)
Status innerhalb einer Row: approval > input > failed/limited > working > waiting > unseen > idle
```

Diese Ordnung ist die Wrapt-Empfehlung. Sie weicht von der T3-Reihenfolge ab, weil die Vorgabe
`Needs input` über `Active` will; T3 faltet `approval/input` in die Active-Liste und markiert nur.
Das ist die wichtigste bewusste Designentscheidung dieses Papers und in Abnahmetest A1 zu fixieren.

### 3.6 Wrapt-Metadaten und Persistenz

- Server-owned (überlebt Reload, mehrere Tabs, Geräte): `pinned_order` (fractionales Schlüsselformat wie T3), `snoozed_until`, `settled_at`, `unsettled_at`, `last_visited_at`.
- Client-lokal (versioniert, wie `wrapt.app-preferences.v1`): Shelf-Collapse, Dichte, Standalone-Präferenz.
- Snooze-/Settle-Berechnung ist rein (kein Timer-Event). Wake passiert, indem `snoozed_until` in der Vergangenheit liegt.

## 4. Wake-on-Completion und mehrere Tabs

T3 macht UI-Metadaten server-owned und leitet Wecker ab. Damit konvergieren Tabs von selbst.
Kritischer Punkt für Wrapt: Wrapt hat keine solche Thread-Metadaten-Datenbank für Hermes-Sessions.
Ohne gemeinsamen Speicher divergieren zwei Tabs.

- Zweck: Hermes V2 bleibt UI über Hermes-Daten. `pinned_order`, `snooze`, `settled` gehören in eine
  klar getrennte Wrapt-Tabelle (SQLite, `~/.local/share/wrapt/`), keyed per Hermes-Session-ID. Das ist
  Wrapt-owned UI-Metadaten und laut Auftrag erlaubt (§1.3 des Briefs).
- Multi-Tab-Konvergenz: Metadaten-Änderungen über Server schreiben und per WebSocket/BroadcastChannel
  an andere Tabs verteilen, damit Pin/Snooze/Settle in beiden Tabs identisch sind.
- `unseen`: `last_visited_at` server-owned halten, dazu ein lokales Wasserzeichen als Fallback
  (wie T3 `resolveThreadLastVisitedAt`). Nur `mark_unread` darf zurückspulen.
- Wake-on-completion: Bei `run.completed` mit neuem Ergebnis entscheidet die Regel, ob der Thread
  aus `Working`/`Snoozed` zurückkehrt. Kein Polling nötig, das ist Event-getrieben.

## 5. Drag and Drop und Undo, Akzeptanzverhalten

- Drop-Ziele: nur `Pinned`, `Active`, `Settled` als freie Ziele. `Needs input` und `Working` sind
  Status, kein Drop-Ziel. `Snoozed` nimmt nichts an, weil Snooze eine Wake-Zeit braucht; aus
  `Snoozed` heraus darf gezogen werden (Wake).
- Verben mit Icon und Badge am angehobenen Element: Pin, Unpin, Settle, Un-settle, Wake. Reorder in
  derselben Sektion ohne Badge. Sektionslabels nur während des Drags, ohne Zeilenverschiebung.
- Pfeiltasten/Move up/down als tastatur- und mobile-taugliche Alternative.
- Undo: ein Fenster, 5 s, gruppiert pro Aktionsart, `mod+z`. Umfasst Pin/Unpin/Settle/Un-settle/Snooze/Wake und optional Archiv/Delete.

## 6. Accessibility

- Row: `role` passend wählen; für eine navigierbare Liste entweder `role="option"` in `listbox` oder
  `role="button"` wie T3, dann aber konsistent und mit `aria-current="page"` für den offenen Thread.
- Label: `Titel, Status, Projekt`. Status als Textlabel, nicht nur Farbe (Farbsehschwäche).
- `aria-busy` während Titel-Regenerierung, `role="status"` für Live-Ereignisse (Woke, Fehler).
- Alle Drag-Aktionen brauchen ein Menü-Äquivalent. `Escape` bricht Drag ab, Fokus kehrt zur Zeile.
- Sichtbare Fokusringe, Trefferfläche ab 44 px auf Touch.
- Shelves als echte Disclosures (`aria-expanded`), nicht nur optisch.

## 7. Mobile

- Sidebar wird Drawer, Chat bleibt primär, Composer immer bedienbar, Approvals nie hinter dem Drawer.
- Drag auf Touch ist fehleranfällig. T3 löst das mit "Arrange threads"-Modus und Move up/down.
  Für Wrapt V2 übernehmen: langer Druck oder expliziter Arrange-Modus, dazu Menü-Alternativen.
- Touch-Ziele ab 44 px, keine Hover-only-Aktionen, kein horizontales Scrollen für Kerninhalt.
- Bottom Sheets für Snooze/Custom-Datum statt modaler Dialoge.

## 8. UX-Abnahmetests

Zustandsmaschine (Unit, rein):
- A1 `needs_input` schlägt alles, auch bei `working` (Request während Turn).
- A2 Offener Request verhindert Snooze (`canSnooze=false`).
- A3 `run.completed` nach `lastVisitedAt` ergibt `unseen`, sonst `idle_seen`.
- A4 `snooze` in der Zukunft bei fehlendem Hand-Raise ergibt `snoozed`; ab `now` nicht mehr.
- A5 Frischer Fehler nach `snoozed_at` bricht Snooze auf, alter nicht.
- A6 Abgeschlossener Run nach `snoozed_at` bricht Snooze auf und meldet `woke`.
- A7 `unsettle` setzt `unsettled_at` und sortiert oben; Auto-Settle setzt nicht sofort wieder zurück.
- A8 `mark_unread` setzt `lastVisitedAt` zurück und zeigt wieder `unseen`.
- A9 Pinned-Reorder erzeugt genau einen Schlüssel-Schreibvorgang zwischen Nachbarn.
- A10 Aufeinanderfolgende gleiche Aktionen teilen ein Undo; ein zweiter Klick stellt nicht doppelt her.
- A11 Nach 5000 ms ist Undo abgelaufen und die Aktion festgeschrieben.

Interaktion (Komponente/E2E):
- B1 Pin via Menü und via Drag ergeben dieselbe Sektion und Ordnung.
- B2 Drag aus `Snoozed` weckt; Drag nach `Snoozed` ist unmöglich (kein Ziel, kein Badge).
- B3 Drop-Wechsel zeigt korrektes Verb (Pin/Unpin/Settle/Un-settle/Wake) und führt es aus.
- B4 `Escape` während Drag bricht ab, keine State-Änderung, Fokus bleibt.
- B5 Sweep Settle über Bereich settlet genau Origin bis Ziel.
- B6 Zwei Tabs: Pin in Tab A erscheint ohne Reload in Tab B.
- B7 Neues Ergebnis während Snooze holt den Thread hoch und zeigt `Woke`; Besuch löscht `Woke`.
- B8 Beim Eintreffen eines Events reagiert der Status in unter 1 s sichtbar.
- B9 `prefers-reduced-motion` schaltet Layout-Transitionen ab, Aktion bleibt sofort sichtbar.
- B10 50+ Sessions bleiben bedienbar; Settled lädt in 10er/25er-Schritten.
- B11 390 px: Sidebar als Drawer, Approval bleibt erreichbar.
- B12 Tastatur: durch Zeilen navigieren, Zeile öffnen, Aktion auslösen, Undo per `mod+z`.

## 9. Lizenz

T3 Code ist MIT (`LICENSE`: "MIT License, Copyright (c) 2026 T3 Tools Inc."). Kopieren von Teilen ist
erlaubt, wenn Copyright- und Lizenzhinweis mitgeliefert werden. Prüfen, ob das Wrapt-Repo eine
Drittanbieter-Hinweisdatei besitzt; sonst anlegen (`THIRD_PARTY_NOTICES` / `LICENSES`).

Empfehlung aus dem Brief: Verhalten nachbauen, nicht kopieren. Die tragenden Ideen (Snooze als
Überlagerung, fractionale Pin-Order-Schlüssel, Drop-Plan-Funktion, Reduced-Motion-Gate) sind Muster,
keine urheberrechtlich schützbare Formulierung. Konkreter Code wie `pinOrderMidpoint` ist kurz und
formal; bei direkter Übernahme Copyright-Zeile beilegen. Reine Neuimplementierung der Adapter- und
Zustandsschicht vermeidet die Frage vollständig und ist hier ohnehin nötig, weil Hermes andere Events
liefert als T3.

## 10. Nicht belegte Annahmen und offene Punkte

- Unbelegt: dass Hermes strukturierte Subagent- und Queue-Events liefert. Das ist Agent B (Gateway-Audit).
  Ohne diese Daten bleiben Subagent-/Queue-Flächen leer, keine Log-Parsing-Notlösung bauen.
- Unbelegt: dass Hermes ein "request.opened"-Event mit stabiler ID über Reconnect liefert. Nötig für
  `needs_input`-Wiederherstellung; über Reconnect-Tests verifizieren.
- Offen: Wrapt besitzt derzeit keine Thread-Metadaten-Datenbank für Hermes. Die vorgeschlagene
  Wrapt-Tabelle ist eine Empfehlung, keine bestätigte Architektur.
- Offen: Ob das V2-Feature-Flag server- oder client-owned wird. Ist es rein client-lokal, verhält
  sich "mehrere Tabs" je Tab unterschiedlich; Entscheidung gehört in Phase 1.
- Falsch waere: T3 als exklusiven Client anzunehmen. Terminal-Hermes und die offizielle SPA laufen
  parallel; Metadaten müssen sich auch mit einem externen Sessionende vertragen.
- Abweichung mit Absicht: Reihenfolge der Sektionen weicht von T3 ab (§3.5). Der Brief verlangt
  `Needs input` vor `Active`, T3 tut das nicht. Das ist zu bestätigen, bevor Phase 4 startet.

## 11. Quellen

T3 Code, Upstream `https://github.com/pingdotgg/t3code`, `origin/HEAD cfafb4bb54d244e4612f5681aad3832ea64cb0fb`:
- `apps/web/src/components/Sidebar.tsx`, `Sidebar.logic.ts`, `Sidebar.drag.ts`, `Sidebar.pointer.ts`, `Sidebar.motion.ts`, `Sidebar.snooze.ts`
- `packages/client-runtime/src/state/threadSettled.ts`, `threadInbox.ts`, `threadSort.ts`
- `apps/web/src/hooks/showThreadUndoNotice.ts`
- `docs/user/thread-sidebar.md`, `docs/user/keybindings.md`
- `LICENSE`

Wrapt, lokal gelesen (nur Bestand):
- `AGENTS.md`, `apps/web/src/components/hermes/HermesShell.tsx`, `HermesAdminFrame.tsx`
- `apps/web/src/views/settings/SettingsEasterEggs.tsx`, `settingsTabs.ts`, `apps/web/src/lib/settingsSearch.ts`
- `apps/web/src/stores/appPreferences.ts`, `sidebarPreferences.ts`
- `apps/server/src/hermes/routes.ts`
- `CHANGELOG.md` (Stand 2.8.0)

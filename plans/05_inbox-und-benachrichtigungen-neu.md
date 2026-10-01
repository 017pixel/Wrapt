# Plan: Zentrales Benachrichtigungs- und Inbox-System

## Ziel und Umfang

Die kleine Benachrichtigungs-Box oben rechts wird zu einer eigenen Workspace-Seite
„Inbox" mit Sidebar-Eintrag und rotem Ungelesen-Badge. Alle wichtigen Ereignisse
aus Hermes, T3 Code, den KI-CLI-Terminals (OpenCode, Codex, Claude) und
langlaufenden Terminal-Prozessen laufen dort in einer übersichtlichen, nach
Quellen getrennten Ansicht zusammen. Die Toasts werden kleiner, dezenter und
wegwischbar. Benachrichtigungen lösen sich automatisch auf, wenn die Aktion
erledigt wurde, auch wenn der Nutzer sie vorher selbst durchgeführt hat.
Zusätzlich kommt Web-Push, damit Benachrichtigungen auch bei geschlossener oder
nicht aktiver Workbench ankommen.

## Bestandsaufnahme (Ist-Zustand)

- Inbox und Toasts sind eine einzige kleine Komponente (`NotificationCenter.tsx`), bekommen Events nur per 15-s-Polling, keine Animation, keine Swipes.
- Die SQLite-Tabelle `notifications` existiert bereits (source, kind, severity, title, body, link, remoteId, read_at, acknowledged_at), wird aber nur von Hermes befüllt (`result-sync.ts`). „gelöscht" gibt es als Zustand nicht in der UI.
- Bug: Hermes-Update meldet „0.19.1 → 0.19.1", weil keine Versions-Gleichheitsprüfung existiert. Und: Jede kurze Chat-Antwort erzeugt eine Benachrichtigung („OK", „Hey Benjamin…").
- T3 ist ein blinder HTTP-/WS-Proxy, aber T3 schreibt seinen Zustand in eine eigene SQLite-DB (`~/.t3/userdata/state.sqlite`), darin stehen `pending_approval_count`, `pending_user_input_count`, `has_actionable_proposed_plan`, `settled_at` (pro Thread) und ein Event-Log `orchestration_events`. Damit lassen sich „Agent needs input", „Plan ready" und „Complete" exakt abbilden.
- OpenCode legt `~/.local/share/opencode/opencode.db` mit Session- und Event-Tabellen an; Codex schreibt Session-Dateien unter `~/.codex/sessions/` und `goals_1.sqlite`. Beide sind serverseitig lesbar.
- Das Terminal hat bereits ein `terminal.exited`-Event mit Exit-Code (kein Exit-Notification bisher).

## Umsetzung

### 1. Datenmodell erweitern (Contracts + SQLite)

- `notificationSchema` bekommt neue Felder:
  - `category`: `hermes | coding-agent | terminal` (steuert die Spalten/Filter)
  - `sourceIcon`: `t3 | hermes | opencode | codex | claude | terminal | workbench` (steuert das Quellen-Icon je Eintrag)
  - `state`: `active | resolved | dismissed` — statt hartem Löschen
  - `deletedAt`, `resolvedAt` (nullable)
  - `meta`: JSON für Zusatzinfos (Session-ID, Thread-ID, Exit-Code, Dauer)
  - `report`: optionales JSON mit Fehlerbericht (Fehlermeldung, Stacktrace, Verlauf/Logs, Kontext) für Fehler-Benachrichtigungen
- Neue Endpunkte: `DELETE /api/v1/notifications/:id` (dismiss), `POST /api/v1/notifications/mark-all-read`, `GET /api/v1/notifications/:id/report` (voller Fehlerbericht zum Kopieren).
- Aufräumjob: aufgelöste (resolved) Benachrichtigungen werden nach 48 h endgültig gelöscht; gelesene nach 48 h; ungelesene aktive bleiben.
- **Lesen nur manuell:** Das Öffnen der Inbox markiert nichts automatisch als gelesen. Gelesen wird nur durch Antippen eines Eintrags oder Swipe. Ein „Alle gelesen"-Button markiert alles.
- **Kein Verlauf:** Erledigte (resolved) und gelöschte Einträge verschwinden komplett aus der Inbox. Die Datenbank behält sie nur bis zur 48-h-Löschung.

### 2. Quellen und Benachrichtigungs-Logik (Server)

**Hermes** (`result-sync.ts` überarbeiten):
- Kurze Chat-Antworten (unter ~2 min, keine Tool-Nutzung) erzeugen keine Benachrichtigung mehr.
- Benachrichtigung bei: Cron-Aufgaben fertig/fehlgeschlagen, längeren Web-/ACP-Sessions (> 2 min oder mit Tool-Calls), Updates.
- Update-Bug fixen: Wenn `previousVersion === newVersion`, keine Erfolgs-Benachrichtigung erzeugen (nur Log). Deferral-Fall korrekt behandeln.
- `remoteId`-Dedup beibehalten.

**T3 Code** (neuer `t3-status-sync`-Dienst):
- Liest read-only die T3-SQLite `projection_threads` + `orchestration_events` mit einem Cursor über die Event-Sequenz (wie `HermesResultSync`).
- Erzeugt Benachrichtigung bei Statuswechsel: „Agent braucht Input", „Plan ist bereit" (approve nötig), „Aufgabe abgeschlossen", Fehler/abgebrochen.
- **Zeit-/Tool-Schwelle auch für T3:** „Aufgabe abgeschlossen" wird nur gemeldet, wenn der Agent mindestens ~2 Minuten lief oder Tools benutzt hat. Mini-Aufgaben unter 30 Sekunden erzeugen keine Benachrichtigung (Schwellen in der Config).
- **Auto-Auflösung:** Ist bei einem Poll die Aktion schon erledigt (z. B. Plan wurde approven, Input wurde gegeben, Thread ist settled), wird die offene Benachrichtigung auf `resolved` gesetzt und verschwindet aus der Ungelesen-Liste. Der Ungelesen-Zähler spiegelt damit immer die echte Lage.
- Nachweislich robust: T3-Update-Warnung aus AGENTS.md beachten (Schema-Änderungen bei Nightly), Lesen erfolgt daher defensiv mit Fehler-Toleranz (kein Crash, falls T3 gerade migriert oder DB gesperrt ist).

**OpenCode / Codex / Claude (Terminal-Agenten):**
- Anbindung über zwei Wege:
  - `opencode.db` (Sessions + Events) bzw. Codex-Session-Dateien als Statusquelle („läuft", „wartet auf Input", „fertig").
  - Terminal-Events (`terminal.exited` mit Exit-Code) als verlässliche Ergänzung.
- Benachrichtigung bei: Agent fertig (nach mindestens 3 min Laufzeit), wartet auf Input, Fehler/Exit-Code ≠ 0.
- Auto-Auflösung wie bei T3: Ist die Session beendet oder die Antwort gegeben, bevor der Nutzer die Inbox öffnet, wird `resolved`.

**Terminal allgemein (Shell, Downloads, Updates):**
- Jeder Terminal-Prozess, der mindestens 3 min läuft und dann endet, erzeugt „Befehl abgeschlossen" (mit Exit-Code und Laufzeit). Kurze Befehle bleiben still.
- Schwelle (3 min) kommt in die Config (`workbench.local.json`), ebenso die Hermes-Schwellen.

**Echtzeit-Zustellung:**
- Neuer WebSocket-Kanal `/api/v1/notifications/ws` (nach dem Muster Terminal/Hermes) — Frontend bekommt neue Benachrichtigungen sofort statt nach 15 s Polling. Polling bleibt als Fallback.

### 3. Web-Push (auch wenn Tab zu)

- Service Worker im Web-Build + VAPID-Schlüsselpaar (server- und clientseitig), Opt-in über die Einstellungen (nur für Tailscale-Identität, Same-Origin).
- Push nur für `severity: warning | error` und für „Agent braucht Input" / „Plan bereit" (Konzentrations-relevante Ereignisse), nicht für jeden Erfolg.
- Auf dem Handy erscheint es als System-Benachrichtigung, Klick öffnet die Workbench-Inbox.

### 4. Inbox-Seite (Frontend)

- Neue Route `/workbench/inbox`, Sidebar-Eintrag unter „Dashboard" in der Workspace-Sektion, mit rotem Badge (1–99+).
- Die Glocke oben rechts bleibt als Schnellzugriff (öffnet die Inbox-Seite), die kleine Popover-Box entfällt.
- **Desktop/Tablet (breit):** drei Spalten „Hermes", „Coding-Agents", „Terminal und System" mit je eigenem Header, Ungelesen-Zähler und „Alles gelesen". Nicht-wichtige gelesene Einträge kollabiert.
- **Mobile/Tablet schmal:** ein chronologischer Stream mit Filter-Chips (Alle, Hermes, Agents, Terminal), Quellen-Icon je Eintrag, Swipe-Gesten.
- **Quellen-Icons je Benachrichtigung:** Jede Benachrichtigung zeigt links das Icon ihrer Quelle, damit auf einen Blick sichtbar ist, wofür sie ist. Die Icons sind die bereits vorhandenen Brand-Icons aus `WorkbenchIcons.tsx`: T3 Code (`T3CodeIcon`), Hermes (`HermesIcon`), OpenCode (`OpenCodeIcon`), Codex (`CodexIcon`), Terminal (`TerminalIcon`). Für Claude Code wird das offizielle Icon aus dem Paket `@lobehub/icons` verwendet: `<ClaudeCode.Color size={56} />` (Import: `import { ClaudeCode } from "@lobehub/icons"`). Das Paket muss dafür als Dependency in `apps/web` ergänzt werden (aktuell nicht installiert). Die Zuordnung kommt über ein neues Feld `sourceIcon` (`t3 | hermes | opencode | codex | claude | terminal | workbench`) im Benachrichtigungs-Schema. Die Spalten-Chips auf Mobile filtern nach denselben Quellen und zeigen das jeweilige Icon statt Text.
- **Swipe-Gesten überall:** rechts nach links = gelesen markieren, links nach rechts = löschen (dismiss). Mit Maus per Drag auf Desktop (gleiche Geste, Pointer-Events), Touch-Ziele ≥ 44 px.
- Design strikt nach Workbench-Tokens (`@theme` in `index.css`), keine neuen Hex-Farben, keine Gradients, DM Sans / JetBrains Mono.

### 5. Toasts neu

- Deutlich kleiner und dezenter, oben rechts, Slide-in von rechts mit leichter Staffelung (max. 3 gleichzeitig, darunter kompakt scrollbar).
- Anzeigedauer 2–3 s, schließen per kleinem Kreuz oder Wegwischen nach rechts (Swipe/Drag).
- Klick auf den Toast öffnet die zugehörige Aktion/Seite und markiert gelesen.
- Nur wichtige Ereignisse werden Toast (gleiche Regel wie Push): Input nötig, Plan bereit, Fehler, abgeschlossene lange Aufgaben. Hermes-Updates und kurze Erfolge: nur Inbox, kein Toast.

### 7. Dynamische Deep-Links (Klick öffnet die richtige Stelle)

Jede Benachrichtigung ist klickbar (Klick auf den Eintrag oder einen Öffnen-Button mit Icon) und führt direkt zum passenden Ort — der Link wird beim Erzeugen der Benachrichtigung serverseitig mitgegeben:

- **T3 Code:** Deep-Link auf den konkreten Thread: `/t3/{environmentId}/{threadId}`. Die `environmentId` wird von der Workbench serverseitig gelesen (liegt in `~/.t3/userdata/environment-id`), die `threadId` kommt aus dem T3-Status-Sync. Der T3-Proxy leitet auf den Chat, in dem der Agent Input braucht oder fertig ist.
- **Hermes Agent:** `/workbench/hermes-agent?session={sessionId}` (existiert schon).
- **Terminal (Shell, Downloads):** Öffnet den Terminal-Tab mit der Session `/workbench/terminal?session={sessionId}` — der Terminal-Tab wird dabei gezielt aktiviert (Session-Tab suchen und fokussieren).
- **OpenCode:** `/workbench/opencode?session={sessionId}` mit Aktivierung der passenden Instanz und Session.
- **Codex:** `/workbench/codex?session={sessionId}` analog.
- **Claude Code:** Claude Code läuft als Terminal-Tab (Kind `claude`) in der Terminal-Ansicht, nicht als eigene Route. Der Link führt daher in die Terminal-Ansicht und aktiviert den Session-Tab mit dem passenden Session-Parameter (gleicher Mechanismus wie bei Terminal-Shells, ggf. mit zusätzlichem Kind-Parameter zur gezielten Tab-Auswahl).

Die Links werden bei jeder Benachrichtigung dynamisch mitgesetzt (Feld `link`), damit nichts hartkodiert wird. Gibt es keine passende Ansicht (z. B. Session schon geschlossen), führt der Link zum Einstieg der jeweiligen Seite, ohne Fehler.

### 8. Fehlerberichte (Crash-Report-Konzept in die Inbox)

Das Frontend hat bereits ein Crash-Report-System (`crashReport.ts` + `CrashReportDialog.tsx`): Bei Abstürzen erscheint ein Dialog mit Fehlermeldung, Stacktrace, Verlauf (Breadcrumbs) und einem kopierbaren Bericht samt Arbeitsanweisung für einen KI-Agenten. Das Konzept wird auf das Benachrichtigungssystem ausgeweitet:

- **Fehler-Benachrichtigungen tragen einen Bericht** (Feld `report` im Schema): Fehlermeldung, Kontext (Projekt, Route, Dienst), letzte Schritte/Logs und die Umgebung (Version, bootId). Aufbau analog zum bestehenden Crash-Report-Text.
- **Quellen:** Das Crash-Report-System bleibt als Quelle erhalten (Frontend-Abstürze erzeugen zusätzlich eine Fehler-Benachrichtigung mit Bericht). Dazu kommen serverseitige Fehler (Hermes-Update fehlgeschlagen, Terminal-Prozess mit Exit-Code ≠ 0, T3-Thread mit Fehler), deren Bericht der Server aus den verfügbaren Logs/Daten zusammensetzt (redigiert wie bisher, keine Secrets).
- **UI in der Inbox:** Fehler-Einträge bekommen einen „Fehlerbericht"-Button (Icon), der einen Dialog wie den heutigen CrashReportDialog öffnet: kopierbarer Text mit Anweisung für den Coding-Agenten.
- **Direkt zu T3 (Fehler beheben lassen):** Der Dialog hat zusätzlich einen Button „Mit T3 Code beheben". T3 unterstützt keinen Deep-Link für einen neuen Thread mit vorbefülltem Prompt (geprüft im Quellcode von `pingdotgg/t3code`: Routen sind nur `/{environmentId}/{threadId}` und `/draft/{draftId}`, Drafts sind rein clientseitig, keine URL-Parameter für Prompts). Daher: Der Button kopiert den vorgefertigten Prompt (Bericht samt Arbeitsanweisung) automatisch in die Zwischenablage und öffnet T3 Code im passenden Projekt (`/t3/{environmentId}`). Der Nutzer fügt den Prompt im neuen Chat nur noch ein und approven. Das Kopieren passiert transparent mit Hinweis im Dialog („Prompt kopiert — in T3 Code einfügen").
- Fehler bleiben in der Inbox sichtbar, bis sie manuell als gelesen markiert oder gelöscht werden; das alte „Fehler bestätigen"-Konzept entfällt.

### 6. Einstellungen

- Neue Sektion „Benachrichtigungen": Push-Opt-in (Browser-Abo), Toasts an/aus, pro Quelle wählbar, welche Ereignisse Toast bzw. Push auslösen. Werte aus `workbench.local.json`.

## Prüfung

- `pnpm typecheck` und `pnpm lint` nach jeder Stufe.
- Unit-Tests für den neuen `t3-status-sync` (Cursor-Logik, Auto-Auflösung), die Hermes-Filter (kurz vs. lang) und den 48-h-Prune.
- Manuell: echte T3-Session laufen lassen, Input anfordern, Plan approven, prüfen dass die Benachrichtigung verschwindet; langes Terminal-Kommando beenden; Hermes-Cron-Task abschließen; Push auf Handy testen.

## Umsetzungsreihenfolge

1. Contracts + Datenbank erweitern (Kategorie, State, Report, Endpunkte, 48-h-Prune)
2. Echtzeit-Kanal (WS) + Frontend-Umbau Toasts
3. Inbox-Seite mit Sidebar-Eintrag, Badge, Spalten/Stream, Swipe-Gesten
4. Hermes-Filter + Update-Bug
5. T3-Status-Sync mit Auto-Auflösung
6. Terminal-Benachrichtigungen (ab 3 min) + OpenCode/Codex-Anbindung
7. Fehlerberichte (Report-Dialog in der Inbox, „Mit T3 Code beheben")
8. Web-Push + Einstellungen
9. Tests, Browser-Verifikation (Desktop/Mobile/Tablet), Abschluss

## Offene Entscheidungen

- Ob die T3-Status-Labels in der Workbench-Sidebar zusätzlich live angezeigt werden sollen (z. B. kleiner Punkt am „T3 Code"-Eintrag) — Vorschlag: erstmal nicht, Inbox reicht.
- Ob auch Hermes-Success (Cron fertig) als Push kommen soll oder nur Fehler — Vorschlag: nur Fehler + Input-/Plan-Events.
- T3-Deep-Link geprüft: Neuer Thread mit vorbefülltem Prompt ist nicht möglich (nur bestehende Threads via `/{environmentId}/{threadId}`). „Mit T3 Code beheben" nutzt daher Zwischenablage + Umgebungs-Link.

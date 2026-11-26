# Project Audit and Improvement Plan

Projekt: Wrapt
Laufdatum: 2026-11-18
Auditart: Overall-Audit (Bugs, Edge Cases, Logik, Datenintegrität, Architektur, UX, Tests, Deployment)
Kein Security-Audit. Security-Verdachtsfälle stehen ausschließlich als kurze Verweise in Abschnitt 6.

## 1. Executive Summary

Wrapt ist insgesamt in einem für ein selbst gehostetes Einzelbenutzer-Projekt ungewöhnlich
reifen Zustand. Die Trennung von Server, Web, Contracts und Extension-Contracts ist klar,
die Verträge werden an vielen Grenzen tatsächlich validiert, und die Testbasis ist mit
2.009 bestandenen Server- und 2.310 bestandenen Web-Tests sehr breit. Die in den letzten
Wochen ergänzten Funktionen (Notizen mit Verlauf und Aufgaben, Preview-Slots mit
Storage-Affinität, Terminal-Workspace V2 und Hermes V2) haben aber mehrere Stellen
hinterlassen, an denen Aufräum-, Wiederholungs- und Recovery-Pfade nicht zu Ende gedacht
sind. Genau dort liegen die wichtigsten Risiken.

Die größten Risiken sind:

1. **Unbegrenzt wachsender Notizverlauf.** Jede Inhalts- oder Titeländerung kopiert den
   vollständigen Notizinhalt in `note_history`; pro Notiz bleiben 100 Fassungen. Bei einer
   Notiz mit dem erlaubten Maximum von 2.000.000 Zeichen kann eine einzige Notiz mehrere
   hundert Megabyte Datenbankvolumen erzeugen. Zusätzlich sammeln sich bis zu 100
   vollständige Konfliktsicherungen. Das ist kein theoretisches Randproblem: Der Editor
   speichert alle 800 ms entprellt, sodass 100 Fassungen bei einer großen Notiz in wenigen
   Minuten entstehen können.
2. **Terminal-Respawn ohne Rückoff-Fenster.** Beendet sich ein Codex-, OpenCode- oder
   Claude-Prozess sofort nach dem Start (abgelaufene Anmeldung, falsche Argumente,
   fehlende Konfiguration), startet der Server ihn über die weiterhin existierende
   tmux-Sitzung sofort wieder. Es gibt weder Versuchszähler noch Backoff noch eine harte
   Obergrenze. Das erzeugt Prozess- und Benachrichtigungsstürme.
3. **Preview-Recovery kann fremden Browser-Storage löschen.** `POST
   /api/v1/previews/slots/reclaim` wählt einen ungebundenen Slot mit Storage-Affinität,
   ohne den anfragenden Benutzer oder das Projekt zu berücksichtigen. Bei aktiviertem
   `slotResetEnabled` kann damit der localStorage/SessionStorage/IndexedDB-Bereich eines
   anderen Projekts oder einer anderen erlaubten Identität zurückgesetzt werden.
4. **Das Frontend wird nur beim Serverstart statisch registriert.** Fehlt `apps/web/dist`
   beim Start, wird `@fastify/static` nie registriert. Ein späterer
   `restart-frontend.sh`-Lauf baut zwar erfolgreich und meldet über `webBuildId` Erfolg,
   die laufende Workbench liefert aber weiterhin 503 für `/wrapt/`. Der in der Doku
   beschriebene „Frontend-Neustart ohne Dienstneustart" ist in diesem Zustand falsch.
5. **Persistierte JSON-Dokumente werden an mehreren Stellen ungeschützt geparst.**
   Ein beschädigtes oder aus einer älteren Version stammendes Terminal-Workspace-,
   Dateimanager-, Workspace-Registry- oder Preview-Graph-Dokument führt zu dauerhaften
   500ern. Die Clients wiederholen den Abruf teils im Sekundentakt, ohne dass es einen
   sichtbaren Reparaturweg gibt.

Weitere wichtige technische Schulden:

- Der globale Fastify-`bodyLimit` ist auf den größten Upload-Wert (standardmäßig 200 MB)
  plus 1 MB gesetzt. Jede JSON-API kann damit bis zu ~201 MB puffern, bevor die
  fachlichen Limits greifen.
- Der Settings-Sync bricht nach dem ersten 4xx dauerhaft ab; der Dateimanager- und
  Terminal-Sync haben dagegen gar keinen Backoff und können bei anhaltenden Fehlern in
  eine enge Wiederholungsschleife geraten.
- Die Plugin-SDK- und Icon-Builds fehlen in den Restart-/Update-Skripten, obwohl sie im
  Root-Build enthalten sind.
- Mehrere UI- und Serverpfade gehen von einem Einzelbenutzer aus, obwohl
  `tailscale.allowedUsers` mehrere Identitäten zulässt. Das ist dokumentiert, erzeugt
  aber an einigen Stellen (Notification-Presence, Slot-Reclaim, Account-Löschung)
  inkonsistente Zustände statt einer bewussten Einschränkung.

Kurzfristig sollten vor allem die Datenmenge des Notizverlaufs, der Terminal-Respawn,
die Preview-Recovery und die statische Frontend-Registrierung korrigiert werden. Danach
folgen Persistenz-Robustheit, Body-Limits, Build-Graph und die Sync-Schleifen. Die
langfristigen Themen sind eine zentrale, asynchrone Datenzugriffsschicht, eine
kompaktere Historienablage und eine saubere Trennung von „Preview-Ziel" und
„persistierter Hauptdienst".

## 2. System Overview

### Architektur

- **Monorepo:** pnpm-Workspace mit `apps/server` (Fastify 5, Port 3010, SQLite über
  `node:sqlite`), `apps/web` (React 19, Vite, statisches `dist/`), `packages/contracts`
  (Zod) und `packages/extension-contracts` (Manifeste/Schemas des Extension-Systems).
  Zusätzlich `packages/plugin-sdk` für das Code-Plugin-System.
- **Server:** Fastify mit zentralen Hooks für Identität, Same-Origin bei Mutationen,
  Rate-Limit, Kompression, Audit und Fehlermapping. Viele Fachbereiche öffnen jeweils
  eine eigene `DatabaseSync`-Verbindung auf dieselbe Wrapt-SQLite.
- **Web:** React-Router mit einer Route-Registry aus Extensions. Besuchte Routen bleiben
  in einem persistenten Outlet gemountet; inaktive Routen werden mit `inert` und
  `visibility:hidden` geparkt. Das ist die Grundlage dafür, dass Terminals, iframes und
  WebSockets Seitenwechsel überleben.
- **Terminal:** xterm.js im Browser, ein multiplextes JSON-WebSocket, `node-pty` und ein
  dedizierter tmux-Supervisor. Der Server hält einen autoritativen Headless-Terminal-
  Zustand und ein Delta-Journal; der Client kann per Sequenz/Epoche schnell
  wiederverbinden.
- **Preview:** 60 interne Fastify-Listener auf Loopback, die pro Slot einen Devserver
  weiterleiten. Slot-Zustände, Sessions, Bindings, Affinitäten und Storage-Snapshots
  liegen in der Wrapt-SQLite; Tailscale Serve veröffentlicht die Slots auf getrennten
  HTTPS-Ports. Service-Graphen, Devserver-Verwaltung (tmux), Diagnose, Bridge und
  Storage-Reset sind separate Module.
- **Externe Dienste:** T3 Code (`127.0.0.1:3773`), OpenCode Web (`127.0.0.1:3774`),
  code-server (`127.0.0.1:8080`), Hermes-Dashboard (Loopback), CodexBar als
  Usage-Adapter. Alle Zugriffe laufen über serverseitige Adapter/Proxys.

### Datenflüsse

1. **Einstellungen:** Browser-Store → `ui_settings` (pro Identität, ganzes JSON-Dokument
   mit Schlüsselrevisionen) und REST/WebSocket. Serverweite Werte liegen in
   `config/wrapt.local.json` und werden über `settings.config-changed` invalidiert.
2. **Notizen:** Markdown im `notes.content`, Excerpt für Listen, `note_history` als
   Trigger-basierte Vollkopie, `note_conflict_backups` für verworfene Schreibversuche,
   `note_knowledge` für Projekt/Tags. Der Editor schreibt entprellt und mit
   Revisionsprüfung.
3. **Terminal:** Browser-WebSocket → `TerminalManager` → `node-pty` → tmux. Jede
   Ausgabe fließt in History, Headless-Terminal, Journal und SQLite-Registry. Beim
   Start werden Registry, tmux und persistente Sitzungen abgeglichen.
4. **Preview:** Session-Öffnung reserviert Slots und Bindings transaktional, veröffentlicht
   danach einen unveränderlichen Routing-Snapshot. Der Gateway-Listener liest pro Request
   genau diesen Snapshot. Storage-Snapshots werden verschlüsselt in SQLite abgelegt.
5. **Benachrichtigungen:** Syncs lesen T3-/OpenCode-/Codex-/Terminal-Zustände, schreiben
   redigierte Einträge in `notifications` und lösen optional Web-Push aus. Presence
   markiert sichtbare Chats als gelesen.
6. **Nutzung:** CodexBar- und OpenCode-Daten werden in `usage_snapshots`, `daily_usage`,
   `model_usage`, `project_usage` und `reset_credits` projiziert.

### Vertrauensgrenzen und sensible Bereiche

- Tailscale-Identität und Same-Origin sind die äußere Grenze; lokaler Loopback-Zugriff
  ist optional. Das ist Security-Thema und wird hier nicht vertieft.
- Besonders sensible Datenflüsse für diesen Audit: Notizverlauf, Preview-Storage,
  Terminal-Registry, Account-Symlinks, persistierte UI-/Workspace-Dokumente und die
  Löschpfade für Projekte, Dateien und Accounts.
- Die Workbench ist ausdrücklich ein privater Einzelbenutzer-Arbeitsplatz. Mehrere
  erlaubte Identitäten teilen Notizen, Dateien und Benachrichtigungen. Mehrere Tabs und
  Geräte derselben Identität sind dagegen ein normaler, unterstützter Fall.

## 3. Audit Scope and Method

### Untersuchte Bereiche

| Bereich | Geprüfte Dateien / Systeme | Methode | Status | Einschränkung / Restrisiko |
| --- | --- | --- | --- | --- |
| Projekt- und Agentenregeln | `AGENTS.md`, `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/configuration.md`, `docs/previews-for-agents.md`, `docs/troubleshooting.md`, `docs/terminal.md`, `docs/notes.md`, `docs/technical-audit-2026-10-04.md`, `CHANGELOG.md` | vollständig gelesen | geprüft | Dokumentation kann hinter dem Code zurückliegen; Widersprüche sind unten notiert. |
| Server-Kern | `apps/server/src/app/**`, `api/**`, `config/**`, `services/**`, `projects/**`, `workspaces/**`, `observability/**`, `utils/**` | Lesen, grep, gezielte Tests | teilweise geprüft | Nicht jede Route und jeder Adapter wurde Zeile für Zeile verfolgt. |
| Notizen | `apps/server/src/notes/**`, `packages/contracts/src/notes*.ts`, `apps/web/src/components/notes/**` | Lesen, Datenfluss, gezielte Tests | geprüft | Keine realen großen Notizbestände getestet. |
| Notifications | `apps/server/src/notifications/**`, `apps/web/src/lib/useViewPresence.ts`, `NotificationCenter.tsx`, `SettingsNotifications.tsx` | Lesen, Datenfluss | geprüft | Push-Zustellung an echte Geräte nicht ausgeführt. |
| Usage/Accounts | `apps/server/src/usage/**`, `adapters/codexbar/**`, `adapters/opencode/**`, `apps/web/src/views/Usage.tsx` | Lesen, SQL- und Zeitlogik | teilweise geprüft | Keine echten Accountwechsel oder CodexBar-Läufe ausgeführt. |
| Dateisystem | `apps/server/src/filesystem/**`, `apps/web/src/components/files/**` | Lesen, Pfad- und Fehlerpfade | teilweise geprüft | Keine echten Uploads, Löschungen oder großen Verzeichnisse getestet. |
| Skills-Editor | `apps/server/src/skills/**`, `apps/web/src/components/skillEditor/**` | Lesen, Mutations-/Git-Pfade | teilweise geprüft | Keine echten Git-Commits/Pushes ausgeführt. |
| Terminal | `apps/server/src/terminal/**`, `packages/contracts/src/terminal.ts`, `apps/web/src/stores/terminalWorkspace.ts`, `components/terminal/**` | Lesen, Zustands-/Respawn-Analyse, gezielte Tests | geprüft | Kein echter tmux-/PTY-Lauf mit abstürzendem CLI. |
| Previews | `apps/server/src/previews/**`, `packages/contracts/src/preview-*.ts`, `apps/web/src/components/preview/**`, `views/PreviewHub*.tsx` | Lesen, Transaktions-/Slot-/Routing-Analyse, gezielte Tests | geprüft | Keine aktiven Nutzer-Previews verändert oder getestet; Flags in der lokalen Config sind derzeit aus. |
| Hermes | `apps/server/src/hermes/**`, `apps/web/src/components/hermes/**` | Lesen ausgewählter Pfade | teilweise geprüft | V2-Organisation, ACP-Lebenszyklus und echte Hermes-Sitzungen nicht vollständig verfolgt. |
| Extensions/Plugins | `apps/server/src/extensions/**`, `plugins/**`, `packages/plugin-sdk/**`, `packages/extension-contracts/**` | Lesen ausgewählter Pfade, Build-/Runtime-Verkettung | teilweise geprüft | Kein Plugin installiert, aktiviert oder ausgeführt. |
| Web | `App.tsx`, `AppShell.tsx`, Stores, Settings, Notes, FileManager, Preview, Terminal, Query-/Sync-Schichten | Vollständige Web-Tests, statische Analyse der wichtigsten Flüsse | teilweise geprüft | Keine echte mobile Hardware, kein Screenreader, kein visueller Browserlauf gegen die laufende Instanz. |
| Contracts | `packages/contracts/src/**`, `packages/extension-contracts/src/**` | Lesen, Schema-Grenzen, Tests | geprüft | Keine Property-/Fuzz-Tests ausgeführt. |
| Tests/CI/Deploy | `package.json`, `.github/workflows/**`, `vitest.config.ts`, `playwright.config.ts`, `scripts/**`, `deploy/systemd/**` | Lesen, Checks ausführen (soweit read-only) | geprüft | Keine E2E-Läufe, keine Builds nach `apps/*/dist`, keine Dienste gestartet/neu gestartet. |
| Live-Zustand | `GET /api/v1/health` | read-only curl | geprüft | Nur Health/Readiness, keine schreibenden API-Aufrufe. |

### Ausgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `pnpm typecheck` | Bestanden: extension-contracts, plugin-sdk, contracts, server, web, e2e. |
| `pnpm lint` | Bestanden (eslint, keine Ausgabe). |
| `pnpm architecture:file-lines` | **Fehlgeschlagen:** `config/wrapt.local.json` hat 412 Zeilen (Limit 400). Die Datei ist gitignoriert und wird vom Checker trotzdem gescannt. Details in F-25. |
| Gezielte Server-Tests (`notes`, `settings`, `notifications`, `previews`, `terminal`) | 52 Tests bestanden. |
| Vollständige Server-Suite | 2.009 von 2.010 Tests bestanden. Der Test `src/plugins/code-process.test.ts > beendet endlos laufenden Plugin-Code nach dem Zeitlimit` schlug unter Volllast fehl; die Datei allein lief anschließend mit 4/4 bestanden. Das ist ein Flake-Hinweis, kein reproduzierbarer Produktfehler. |
| Vollständige Web-Suite | 2.310 von 2.310 Tests bestanden. |
| `GET /api/v1/health` | HTTP 200, Status `ok`, Version 3.1.4, `bootId` und `webBuildId` vorhanden. |
| `GET /api/v1/health/readiness` | HTTP 401 ohne Identität; das ist erwartbar, weil die Route nicht in den ungeschützten Health-Pfaden liegt. |
| Git-Status | Nur lesend geprüft. Während des Audits sind unabhängig vom Audit neue Änderungen im Arbeitsbaum aufgetaucht (u. a. `apps/web/src/components/AppShell.tsx`, Workspace-Komponenten, CSS, Tests). Diese Änderungen wurden nicht von diesem Audit erzeugt und nicht bearbeitet. |

### Nicht ausgeführt

- Keine Builds, die `apps/web/dist` oder `apps/server/dist` schreiben.
- Keine Restart-Skripte, keine Restart-API, keine systemd-Befehle, keine Prozesskills.
- Keine aktiven Preview-Sessions, Devserver, Slots oder Ports verändert.
- Keine schreibenden Datenbankzugriffe, Seeds, Migrationen oder Löschungen.
- Keine Git-Operationen, die Arbeitsbaum oder Index verändern.
- Keine E2E-Suite, kein echter Browserlauf gegen die laufende Workbench, keine mobilen
  Geräte, keine echten Push-Zustellungen.
- Keine Hermes-/T3-/OpenCode-/Codex-Kommunikation, keine Accountumschaltung.

### Annahmen

- Der Audit bewertet den Arbeitsbaum zum Laufzeitpunkt. Wegen paralleler Änderungen
  können sich Zeilennummern in Web-Dateien nach dem Audit verschieben; die Fundstellen
  sind deshalb zusätzlich über Datei und Funktion benannt.
- „Mehrere Benutzer" meint die in `tailscale.allowedUsers` erlaubten Identitäten. Das
  Projekt dokumentiert bewusst fehlende Mandantentrennung; trotzdem müssen
  Presence, Slot-Affinität und Account-Löschung konsistente Zustände erzeugen.
- Die Preview-Flags in `config/wrapt.local.json` stehen aktuell auf `false`
  (`gatewayV2Enabled`, `bridgeEnabled`, `diagnosticsEnabled`, `slotResetEnabled`,
  `storageSyncMode: off`). Findings zu diesen Pfaden sind entsprechend als
  „bei aktivierter Funktion" markiert.
- Die Workbench läuft als User-systemd-Dienst und wird über Tailscale Serve
  veröffentlicht; direkte Loopback-Tests sind nur eingeschränkt aussagekräftig.

## 4. Detailed Findings

### [F-01] Notizverlauf und Konfliktsicherungen wachsen ohne Byte-Obergrenze

**Kategorie:** Datenintegrität / Performance / Speicherwachstum

**Schweregrad:** High

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/notes/knowledge.ts:7-15` (Trigger `notes_history_update`)
- `apps/server/src/notes/database.ts:58-75` (Tabelle `note_conflict_backups`)
- `apps/server/src/notes/database.ts:257-285` (`saveContent`, Konfliktsicherung)
- `apps/server/src/notes/database.ts:328-343` (`pruneConflictBackups`, `writeMetadataConflictBackup`)
- `packages/contracts/src/notes.ts:10` (`NOTE_CONTENT_MAX_CHARACTERS = 2_000_000`)

**Betroffene Funktionen oder Komponenten:** `NoteKnowledgeDatabase`, `NotesDatabase.saveContent`,
`NotesDatabase.pruneConflictBackups`, `NoteEditor`/`useNoteAutosave`.

**Problembeschreibung:** Jede Änderung an `notes.content` oder `notes.title` legt vor dem
Update eine vollständige Kopie des alten Inhalts in `note_history` ab. Pro Notiz bleiben
die letzten 100 Zeilen. Zusätzlich werden bei Revisionskonflikten bis zu 100 vollständige
Inhalte in `note_conflict_backups` gespeichert. Es gibt weder eine Byte-Obergrenze noch
eine Kompression, eine Altersgrenze oder eine Bereinigung beim Archivieren. Bei einer
Notiz mit dem erlaubten Maximum von 2.000.000 Zeichen sind 100 Fassungen allein im
günstigsten UTF-8-Fall etwa 200 MB, im schlechtesten Fall ein Vielfaches davon. Der
automatische Speichertakt liegt bei 800 ms; 100 Fassungen entstehen bei einer großen
Notiz daher in weniger als zwei Minuten.

**Technische Ursache:** Die Retention ist ausschließlich zeilenbasiert
(`ORDER BY id DESC LIMIT 100`). `note_history` hat keinen Größencheck, keine
Kompression und keine projektweite Quote. `note_conflict_backups` begrenzt ebenfalls nur
die Anzahl, nicht die Bytes. Notizen werden nicht hart gelöscht, sondern nur archiviert;
`ON DELETE CASCADE` greift daher im Normalbetrieb nie.

**Auslöser:** Große Notiz, viele Autosaves, viele Titeländerungen oder wiederholte
Konflikte zwischen zwei Tabs. Auch ein einzelner großer Konfliktdatensatz kann die
Datenbank bereits deutlich vergrößern.

**Beispielszenario:** Eine Notiz mit 1,5 MB Markdown wird in zwei Tabs bearbeitet. Tab A
tippt 30 Sekunden, Tab B speichert zwischenzeitlich. Der Editor erzeugt dutzende
Verlaufseinträge und mindestens eine Konfliktsicherung. Die SQLite-Datei wächst um
mehrere hundert Megabyte; WAL und Checkpoints benötigen zusätzlichen Platz. Irgendwann
schlägt der nächste Schreibvorgang mit `SQLITE_FULL` fehl. Davon sind nicht nur Notizen,
sondern auch Terminal-Registry, Einstellungen und Preview-Slots betroffen, weil alle
dieselbe SQLite-Datei verwenden.

**Auswirkungen:** Schleichender Datenbank- und Plattenverbrauch, längere Checkpoints,
WAL-Wachstum, im Extremfall Ausfall aller schreibenden Funktionen. Die Verlaufsfunktion
ist für Nutzer kaum vorhersehbar teuer.

**Warum es leicht übersehen wird:** Die sichtbare Grenze „100 Versionen" wirkt harmlos.
Tests verwenden kleine Inhalte. Die Trigger-Logik ist in `note_knowledge` versteckt und
nicht Teil der normalen Notiz-API. Es gibt keine Metrik für die Größe von
`note_history` oder `note_conflict_backups`.

**Empfohlene Lösung:** Eine echte Byte- und Zeitbudgetierung einführen:
1. Pro Notiz und global ein Byte-Budget für `note_history` (z. B. 4 MB pro Notiz,
   256 MB global) und für Konfliktsicherungen (z. B. 8 MB pro Notiz, 64 MB global).
2. Vor dem Insert prüfen; bei Überschreitung die ältesten Einträge löschen oder die
   ältesten Inhalte komprimieren. Eine Fassung mit unverändertem Inhalt nicht erneut
   speichern (Hash über `content`).
3. Eine periodische Wartung (beim Start und danach stündlich) sowie eine Bereinigung
   beim Archivieren einer Notiz vorsehen.
4. Optional nur Metadaten-Historien für reine Titeländerungen speichern und den
   vollständigen Inhalt nur bei tatsächlicher Inhaltsänderung sichern.
5. Eine Operational-Metric `notes.historyBytes` und `notes.conflictBackupBytes`
   veröffentlichen.

**Betroffene Architekturentscheidungen:** Die Historie liegt bewusst in derselben
SQLite wie alle anderen Daten. Diese Entscheidung kann bleiben, braucht aber dieselbe
Budgetierung wie Preview-Logs oder Audit-Einträge.

**Alternativen:** (a) Verlauf in separate Dateien pro Notiz auslagern, (b) nur Diff-
Snapshots speichern, (c) Verlauf standardmäßig nur für die letzten 24 Stunden halten.
Variante (a) erhöht die Anzahl der Dateien und die Backup-Komplexität; (b) ist
fehleranfälliger bei Markdown-Sonderfällen; (c) reduziert den Nutzen der Funktion.

**Trade-offs:** Weniger historische Fassungen oder zusätzliche Kompressionskosten. Eine
Byte-Grenze kann bei sehr großen Notizen dazu führen, dass ältere Versionen früher
verschwinden; das ist besser als ein voller Datenträger, muss aber in der UI erklärt
werden.

**Implementierungsschritte:**
1. `NoteKnowledgeDatabase` um `historyBytes(noteId)` und eine zentrale
   `pruneHistory(noteId, budgetBytes)`-Methode erweitern.
2. Den Trigger nicht ändern (er ist atomar und bewährt), sondern direkt nach dem
   Trigger-Insert im selben Aufrufpfad aufräumen; alternativ einen zweiten Trigger oder
   eine periodische Wartung ergänzen.
3. `note_conflict_backups` um `bytes` erweitern und beim Insert sowie beim Prune
   berücksichtigen.
4. Beim Archivieren einer Notiz deren Verlauf optional auf ein kleines Budget reduzieren.
5. Metriken und eine kleine Diagnoseanzeige ergänzen.
6. Tests mit 2-MB-Inhalten, 150 schnellen Saves, Titel-only-Änderungen und zwei
   parallelen Tabs schreiben.

**Tests:** Vor der Änderung einen Test schreiben, der nach 120 Saves die Summe der
`length(content)` in `note_history` und `note_conflict_backups` prüft. Nach der Änderung
muss die Summe unter dem konfigurierten Budget bleiben, ohne dass die letzte Fassung
verloren geht. Zusätzlich ein Test für das Archivieren und für einen abgebrochenen
Prune.

**Akzeptanzkriterien:** Keine Notiz kann allein durch normalen Editor-Gebrauch mehr als
das konfigurierte Byte-Budget an Verlauf erzeugen. Die aktuelle Fassung und die letzte
Konfliktsicherung bleiben erhalten. `note_history` und `note_conflict_backups` werden
beim Start und regelmäßig gewartet. Die Werte sind als Metrik sichtbar.

**Abhängigkeiten:** Keine. Die Änderung kann unabhängig von Preview-, Terminal- oder
UI-Arbeiten umgesetzt werden.

**Geschätzter Umfang:** Medium

**Risiko bei der Umsetzung:** Medium (Datenlöschung im Verlauf muss konservativ und
nachvollziehbar sein).

### [F-02] Terminal-Respawn ohne Backoff oder Versuchsgrenze

**Kategorie:** Logik / Stabilität / Ressourcenverbrauch

**Schweregrad:** High

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/terminal/process.ts:126-164` (`onExit`, `handlePtyExit`)
- `apps/server/src/terminal/TmuxSupervisor.ts:169-173` (`respawn`)
- `apps/server/src/terminal/TmuxSupervisor.ts:151-168` (`applySessionOptions` mit
  `remain-on-exit on`)
- `apps/server/src/terminal/Manager.test.ts:195-215` (Test erwartet bereits
  wiederholtes Wiederanhängen)

**Betroffene Funktionen oder Komponenten:** `createProcessRuntime.handlePtyExit`,
`attachPty`, `TmuxSupervisor.respawn`, `TerminalStatusSync`.

**Problembeschreibung:** Wenn ein beaufsichtigter Prozess endet, prüft der Server, ob die
tmux-Sitzung noch existiert. Wegen `remain-on-exit on` ist das nach einem sofortigen
Prozessende fast immer der Fall. Der Server ruft dann sofort `respawn-pane -k` auf,
verbindet ein neues PTY und wartet auf dessen Ende. Endet der neue Prozess wieder sofort,
beginnt der Zyklus erneut. Es gibt keinen Zähler, keine Verzögerung und keine Schwelle,
ab der die Sitzung als `interrupted` sichtbar stehen bleibt.

**Technische Ursache:** `handlePtyExit` behandelt jeden Exit als „Gateway getrennt,
Runtime lebt weiter". Das ist für einen gesunden Langläufer richtig, unterscheidet aber
nicht zwischen einem versehentlich getrennten PTY und einem dauerhaft fehlschlagenden
CLI-Prozess. Der Test in `Manager.test.ts` bestätigt diese Semantik ausdrücklich.

**Auslöser:** Codex/OpenCode/Claude beendet sich direkt nach dem Start, z. B. wegen
fehlender Anmeldung, ungültiger Argumente, eines kaputten globalen Profils oder eines
nicht mehr vorhandenen Arbeitsverzeichnisses. Auch ein Shell-Startbefehl, der sofort
mit Fehler endet, kann betroffen sein.

**Beispielszenario:** Der Codex-Account wird extern abgemeldet. Ein bereits offenes
Codex-Terminal wird neu gestartet. Codex beendet sich mit Exit-Code 1. Der Server
respawned sofort, Codex beendet sich wieder, usw. Innerhalb von Sekunden entstehen
hunderte Prozessstarts, tmux-Aufrufe und Benachrichtigungen. Die Workbench wird träge,
die Benachrichtigungsliste füllt sich, und der Nutzer sieht keinen klaren Endzustand.

**Auswirkungen:** CPU- und Prozesslast, tmux-/PTY-Leaks, Log- und Benachrichtigungsflut,
unnötige Last auf dem gesamten Host. Ein einzelner fehlerhafter Agent kann die
Workbench für andere Terminals und Previews ausbremsen.

**Warum es leicht übersehen wird:** Der Pfad ist als „Reconnect nach Supervisor-Abriss"
gedacht und funktioniert bei einem gesunden Prozess korrekt. Der bestehende Test
akzeptiert sogar mehrere Exits nacheinander. Ohne einen real abstürzenden CLI-Prozess
fällt die fehlende Grenze nicht auf.

**Empfohlene Lösung:** Pro Session einen Respawn-Zustand führen:
- `consecutiveRespawns`, `firstRespawnAt`, `lastExitCode`, `lastExitAt`.
- Nach dem ersten Exit sofort respawnen (bestehendes Verhalten), nach dem zweiten
  innerhalb eines kurzen Fensters mit 1–2 s Verzögerung, danach exponentiell bis z. B.
  30 s.
- Nach drei Fehlversuchen innerhalb von fünf Minuten die Sitzung auf `interrupted`
  setzen, den Supervisor-Pane nicht weiter respawnen und in der UI einen klaren
  „Prozess beendet, erneut starten"-Zustand anbieten.
- Nur ein sauberer Exit (Code 0) oder ein ausdrücklich vom Nutzer ausgelöster Restart
  darf den Zähler zurücksetzen. Ein erfolgreicher neuer Start mit stabiler Laufzeit
  (z. B. 30 s ohne Exit) setzt ihn ebenfalls zurück.
- `TerminalStatusSync` sollte in diesem Zustand höchstens eine Fehlermeldung pro
  Session und Zeitfenster erzeugen.

**Betroffene Architekturentscheidungen:** Die Trennung von PTY-Gateway und tmux-Runtime
bleibt richtig. Es fehlt eine Lebenszyklus-Policy oberhalb des einzelnen Prozesses.

**Alternativen:** (a) `remain-on-exit off` und Session sofort beenden, (b) nur manuelles
Restart anbieten, (c) eine feste Verzögerung von z. B. 5 s ohne exponentielle Steigerung.
(a) verliert den bequemen Reconnect, (b) verschlechtert die UX bei echten Gateway-
Abrissen, (c) ist einfach, aber weniger robust gegen dauerhafte Fehler.

**Trade-offs:** Ein kurzer zusätzlicher Startverzug bei einem echten Gateway-Abriss. Die
UI muss zwischen „Runtime lebt, Gateway getrennt" und „Prozess ist dauerhaft
fehlgeschlagen" unterscheiden.

**Implementierungsschritte:**
1. Respawn-Zustand in `TerminalSession` ergänzen (nicht in SQLite persistieren, außer
   für Diagnose).
2. `handlePtyExit` um Fenster-/Zählerlogik erweitern; `setTimeout` mit `unref` verwenden.
3. Nach Erreichen der Schwelle `status = "interrupted"` setzen, persistieren und ein
   `terminal.exited`/`terminal.restarting` mit Grund senden.
4. `restartSession` (expliziter Nutzer-Reset) setzt den Zähler zurück.
5. Tests mit einem Fake-PTY, das sofort wiederholt endet, und einem, das nach 30 s
   stabil läuft.

**Tests:** Neuer Test „stoppt automatische Respawns nach drei sofortigen Exits und
meldet `SESSION_INTERRUPTED`". Bestehender Respawn-Test bleibt für einen einmaligen
Exit grün. Zusätzlicher Test für expliziten Restart nach der Schwelle.

**Akzeptanzkriterien:** Ein dauerhaft fehlschlagender CLI-Prozess erzeugt höchstens drei
Automatikstarts in fünf Minuten. Danach bleibt die Sitzung sichtbar unterbrochen und
kann manuell neu gestartet werden. Keine Endlosschleife, kein unbegrenztes
Benachrichtigungswachstum.

**Abhängigkeiten:** Keine. Die Änderung betrifft nur den Terminal-Lebenszyklus.

**Geschätzter Umfang:** Medium

**Risiko bei der Umsetzung:** Medium (ein zu aggressiver Stopp könnte echte
Reconnect-Fälle verschlechtern; deshalb den ersten Exit weiterhin sofort behandeln).

### [F-03] Preview-Recovery kann fremden Storage zurücksetzen

**Kategorie:** Datenintegrität / Zustandsübergang / Mehrbenutzer-Isolation

**Schweregrad:** High

**Sicherheit der Einschätzung:** Confirmed (Logik), abhängig von `slotResetEnabled`

**Betroffene Dateien:**
- `apps/server/src/previews/routes.ts:212-224` (`POST /previews/slots/reclaim`)
- `apps/server/src/previews/slots.ts:573-595` (`beginReclaim`)
- `apps/server/src/previews/reset.ts:37-110` (`claim`, `begin`, `verify`)
- `apps/web/src/lib/previewSlotRecovery.ts:29-50` (`recoverOnePreviewSlot`)

**Betroffene Funktionen oder Komponenten:** `PreviewSlotService.beginReclaim`,
`PreviewResetService.begin`, `reclaimPreviewSlot`, `withPreviewSlotRecovery`.

**Problembeschreibung:** `POST /previews/slots/reclaim` authentifiziert den Aufrufer,
übergibt aber keine Benutzer-ID an `beginReclaim`. `beginReclaim` wählt den ersten
ungebundenen Slot mit
- `state === "free"` und gesetztem `storageOwnerKey`, oder
- `state === "quarantined"`,

und startet dort einen Storage-Reset. Der Slot kann zu einem anderen Projekt oder einer
anderen erlaubten Identität gehören. Der anschließende Reset läuft im Browser des
Aufrufers und leert localStorage, sessionStorage, Cache Storage, IndexedDB und Service
Worker dieser Slot-Origin. Der Aufruf erfolgt automatisch, sobald ein Preview-Start
`PREVIEW_SLOTS_EXHAUSTED` meldet und `slotResetEnabled` aktiv ist.

**Technische Ursache:** `beginReclaim` hat keinen `userId`-Parameter. Die Auswahl filtert
nur nach „ungebunden" und Affinität, nicht nach Eigentümer. Die Route prüft nur die
Identität, nicht die Zugehörigkeit des Slots. `PreviewResetService.verify` prüft die
Nonce, aber die stammt aus demselben Aufruf und belegt keine Eigentümerschaft.

**Auslöser:** Preview-Kapazität ist erschöpft, während irgendwo ein freier Slot mit
Storage-Affinität eines anderen Projekts oder Benutzers existiert. Der Nutzer startet
eine neue Preview; die automatische Recovery greift.

**Beispielszenario:** Projekt A hat eine Preview benutzt und wieder geschlossen. Der
Slot bleibt mit Storage-Affinität für A frei. Projekt B startet eine neue Preview,
alle anderen Slots sind belegt. Die Recovery wählt den freien A-Slot und leert die
A-Origin. Beim nächsten Öffnen von A sind Login-Zustand, Theme und lokale
Anwendungseinstellungen der Preview verschwunden.

**Auswirkungen:** Datenverlust im Preview-Kontext (nicht in den Wrapt-Kerndaten, aber
für Entwicklungsarbeit relevant), unerwartete Logouts, verlorene lokale Testdaten.
Bei mehreren erlaubten Identitäten ist es zusätzlich eine unerwünschte
Benutzerüberschreitung.

**Warum es leicht übersehen wird:** Die Reset-Logik ist bewusst „fail-closed" und
gründlich; die Auswahl des Slots wirkt wie ein reines Kapazitätsproblem. Der
Einzelbenutzer-Fall verdeckt die fehlende Eigentümerprüfung. Die lokale Config hat
`slotResetEnabled: false`, sodass der Pfad im Alltag derzeit nicht ausgeführt wird.

**Empfohlene Lösung:** `beginReclaim(userId)` einführen und nur Slots berücksichtigen,
deren Affinität nachweislich zu diesem Benutzer gehört (z. B. über einen persistierten
`storageOwnerUserId` oder eine Zuordnung von `storageOwnerKey` zu Benutzer/Projekt).
Quarantänierte Slots nur nach expliziter Admin-/Reparaturaktion zurücksetzen. Die Route
muss bei fehlender Berechtigung mit einem klaren Code antworten, statt einen fremden
Slot zu wählen.

**Betroffene Architekturentscheidungen:** Storage-Affinität ist derzeit nur ein
Hash aus Projekt/Port/Profil. Für Eigentümerprüfungen fehlt die Benutzerdimension.

**Alternativen:** (a) Recovery nur mit freien Slots ohne Affinität, (b) Admin-Queue für
Quarantäne, (c) ein expliziter Bestätigungsdialog vor jedem Reset. (a) reduziert die
Erfolgsquote, (b) verlagert die Arbeit, (c) ist sinnvoll als zusätzliche Sicherung,
ersetzt aber keine Eigentümerprüfung.

**Trade-offs:** Weniger automatische Recovery, dafür kein stiller Datenverlust. Bei
Einzelbenutzer-Installationen kann eine projektbezogene Freigabe den Komfort erhalten.

**Implementierungsschritte:**
1. `PreviewSlotService.beginReclaim(userId)` und `PreviewRepairService` entsprechend
   erweitern.
2. In der Affinität `storageOwnerUserId` persistieren (Migration mit Default `null`).
3. Die Kandidatenauswahl auf eigene Affinitäten beschränken.
4. Die Route bei fremden/unklaren Slots mit `409 PREVIEW_SLOT_NOT_OWNED` antworten
   lassen.
5. Die UI-Meldung verständlich machen; optional eine Bestätigung für den eigenen Reset
   anbieten.
6. Tests mit zwei Benutzern, zwei Projekten und einem freien fremden Slot.

**Tests:** Test „reclaim ignoriert fremde Affinität und liefert 409". Test „eigener
freier Slot wird weiterhin zurückgesetzt". Test „Quarantäne-Slot ohne Eigentümer kann
nicht per Nutzer-Route zurückgesetzt werden".

**Akzeptanzkriterien:** Kein Nutzer kann durch eine Preview-Recovery den Storage eines
anderen Nutzers oder eines nicht ausdrücklich freigegebenen Projekts löschen. Der
eigene Recovery-Pfad funktioniert weiterhin.

**Abhängigkeiten:** Affinitäts-Schema-Migration; UI-Text.

**Geschätzter Umfang:** Medium

**Risiko bei der Umsetzung:** Medium (Migration und bestehende Slots mit unbekanntem
Eigentümer müssen konservativ behandelt werden).

### [F-04] Statisches Frontend wird nur beim Serverstart registriert

**Kategorie:** Deployment / Betrieb / Fehlerbehandlung

**Schweregrad:** High

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/app/static.ts:24-27` (`hasWebBuild` wird einmalig geprüft)
- `apps/server/src/app/buildApp.ts:65-70` (Aufruf beim Start)
- `scripts/restart-frontend.sh:1-16` (baut nur, startet den Dienst nicht neu)
- `apps/server/src/system/restart.ts:176-205` (`webBuildId` aus mtime)

**Betroffene Funktionen oder Komponenten:** `registerStaticHosting`,
`registerApplicationRoutes`/NotFound-Handler, `restart-frontend.sh`,
`verify_frontend_marker`.

**Problembeschreibung:** `registerStaticHosting` prüft beim Start einmalig, ob
`apps/web/dist/index.html` existiert. Nur dann wird `@fastify/static` registriert. Fehlt
die Datei zu diesem Zeitpunkt, bleibt `hasWebBuild` für die gesamte Prozesslaufzeit
`false`. Der NotFound-Handler liefert danach für jede HTML-Navigation
„Frontend-Build ist noch nicht vorhanden" (503), auch wenn ein späterer Build die Datei
anlegt. `restart-frontend.sh` baut nur `dist` und prüft `webBuildId`; dieses Signal wird
aus `statSync(index.html)` gelesen und ändert sich unabhängig davon, ob der laufende
Server die Dateien ausliefert. Der Neustart meldet daher Erfolg, obwohl die Oberfläche
weiterhin 503 liefert.

**Technische Ursache:** Die Existenzprüfung und die Plugin-Registrierung sind
Startzeit-Entscheidungen. Der Build-Marker wird getrennt von der tatsächlichen
HTTP-Auslieferung geprüft. `restart-frontend.sh` startet den Dienst bewusst nicht neu.

**Auslöser:** Erster Start vor dem ersten Frontend-Build, fehlgeschlagener Build beim
ersten Start, manuelles Löschen/Neuaufbauen von `dist` während der Dienst läuft, oder
ein Deploy, bei dem der Dienst vor dem Frontend-Build startet. Besonders relevant für
frische Installationen und Recovery nach einem fehlgeschlagenen Build.

**Beispielszenario:** Auf einem frischen Host startet `wrapt.service`, bevor
`pnpm build` fertig ist. Der Server läuft, liefert aber 503. Der Nutzer führt
`bash scripts/restart-frontend.sh` aus. Das Skript baut erfolgreich, `webBuildId`
ändert sich, und die UI lädt automatisch neu. Der Browser erhält erneut 503. Ein
Dienstneustart behebt das Problem, wird vom Skript aber nicht ausgeführt.

**Auswirkungen:** Die Workbench ist nicht benutzbar, obwohl der Dienst „gesund" ist.
Das Restart-Feedback ist irreführend. Ein Update-/Deployment-Ablauf kann in diesem
Zustand hängen bleiben.

**Warum es leicht übersehen wird:** In der vorhandenen Installation existiert `dist`
bereits; der Normalfall funktioniert. Der Marker-Test prüft nur die Datei-mtime, nicht
die HTTP-Antwort. E2E-Tests bauen vor dem Serverstart.

**Empfohlene Lösung:** `@fastify/static` immer registrieren, auch wenn das Verzeichnis
fehlt, und im Request dynamisch prüfen:
- Existiert `index.html`? Dann ausliefern.
- Sonst 503 mit klarer Meldung und einem Retry-Hinweis.
Alternativ beim ersten erfolgreichen Build die statische Route dynamisch nachregistrieren;
das ist mit Fastify schwieriger und fehleranfälliger. Zusätzlich sollte
`restart-frontend.sh` nach dem Build einen echten HTTP-Check auf `/wrapt/` machen
(Status 200 und `index.html`) und bei 503 entweder den Dienst neu starten oder deutlich
fehlschlagen.

**Betroffene Architekturentscheidungen:** Frontend-Build und Serverprozess sind bewusst
getrennt; die statische Registrierung muss diese Trennung respektieren.

**Alternativen:** (a) `restart-frontend.sh` immer den Dienst neu starten lassen, (b) den
Server beim Start auf einen vorhandenen Build warten lassen, (c) ein separater
Static-Proxy. (a) kostet kurze Downtime und beendet laufende KI-Sitzungen, (b) kann den
Start blockieren, (c) ist für ein statisches Verzeichnis unnötig komplex.

**Trade-offs:** Eine immer registrierte statische Route liefert bei fehlendem Build
weiterhin 503, aber mit korrekter, dynamischer Erholung. Der zusätzliche HTTP-Check im
Skript kostet Sekunden.

**Implementierungsschritte:**
1. `registerStaticHosting` unabhängig von `hasWebBuild` registrieren; die Existenzprüfung
   in den NotFound-/Static-Handler verlagern.
2. Den 503-Text um „Frontend-Build fehlt, `bash scripts/restart-frontend.sh` ausführen"
   ergänzen.
3. In `restart-frontend.sh` nach dem Build `curl -fsS http://127.0.0.1:PORT/wrapt/`
   prüfen; bei 503 den Dienst neu starten oder mit Fehler abbrechen.
4. Test: `buildApp` mit leerem Temp-`dist`, danach `dist/index.html` anlegen, Request
   auf `/wrapt/` muss 200 liefern.
5. E2E-/Smoke-Test für den Frontend-Restart.

**Tests:** Neuer Server-Test mit temporärem Web-Dist, das erst nach dem App-Aufbau
angelegt wird. Neuer Skript-/E2E-Test, der nach `restart-frontend` einen echten
`/wrapt/`-Request prüft.

**Akzeptanzkriterien:** Ein späterer Frontend-Build wird ohne Serverneustart
ausgeliefert. `restart-frontend.sh` meldet nur Erfolg, wenn `/wrapt/` tatsächlich
200 liefert. Ein fehlender Build führt zu einer verständlichen 503-Seite, nicht zu
einem dauerhaften „Nicht gefunden".

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-05] Dateimanager stellt einen alten lokalen Draft über einen neueren Serverstand

**Kategorie:** Datenintegrität / Multi-Device / UX

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/web/src/components/files/FileManagerSync.tsx:30-52` (Initialisierung)
- `apps/web/src/stores/fileManager.ts:116-128` (`restoreDraft`)
- `apps/web/src/components/files/FileManagerSync.tsx:54-90` (Speichern)

**Betroffene Funktionen oder Komponenten:** `FileManagerSync`, `useFileManagerStore.restoreDraft`,
`initializeRemote`, `saveFileManagerState`.

**Problembeschreibung:** Der lokale Draft enthält `{ document, revision }`. Beim Laden
wird jedoch nur `draft.document` validiert; `draft.revision` wird ignoriert. Danach ruft
`restoreDraft(parsed.data, response.revision)` den lokalen Stand mit der **neuen**
Serverrevision auf. Der Store ist `dirty`, und der nächste Save schreibt den lokalen
Stand mit `expectedRevision = response.revision`. Damit überschreibt ein älterer lokaler
Draft die Änderungen eines anderen Geräts ohne Konflikt.

**Technische Ursache:** Die Revision des Drafts wird beim Speichern zwar mitgeschrieben,
beim Wiederherstellen aber nicht verglichen. Der Server sieht nur den neuen
Erwartungswert und akzeptiert den Schreibvorgang.

**Auslöser:** Gerät A hat einen nicht bestätigten Dateimanager-Zustand (z. B. Offline
oder abgebrochener Save). Gerät B ändert Favoriten, Verlauf oder Ansicht. Gerät A lädt
die Seite neu; der Draft wird übernommen.

**Beispielszenario:** Auf dem Laptop werden drei Favoriten hinzugefügt, während das
Netzwerk kurz weg ist. Auf dem Desktop wird ein anderer Favorit entfernt und die
Ansicht auf Kacheln gestellt. Der Laptop lädt neu, übernimmt seinen alten Draft mit
der aktuellen Serverrevision und schreibt ihn zurück. Die Desktop-Änderungen sind weg.

**Auswirkungen:** Verlust von Favoriten, Verlauf, Sortierung und Ansichtseinstellungen.
Kein Konfliktbanner, keine Möglichkeit, den neueren Stand zu wählen.

**Warum es leicht übersehen wird:** Der Draft-Mechanismus wurde für Offline-Sicherheit
eingeführt und funktioniert im Ein-Gerät-Fall. Die Revision wird gespeichert, wirkt
aber nur dekorativ. Tests prüfen das Speichern, nicht das Überschreiben durch einen
älteren Draft.

**Empfohlene Lösung:** Beim Laden beide Revisionen vergleichen:
- Serverrevision `0` und lokaler Draft vorhanden → lokalen Draft als Ausgangspunkt
  verwenden (Erststart).
- Serverrevision gleich Draft-Revision → Draft anwenden und speichern.
- Serverrevision größer als Draft-Revision → lokalen Draft nicht automatisch anwenden;
  einen Konfliktzustand mit „Lokalen Stand prüfen / Serverstand übernehmen" anzeigen oder
  den Draft nur für UI-Zustände (nicht für serverseitige Autorität) verwenden.
- Serverrevision kleiner als Draft-Revision → Draft ist aus der Zukunft/inkonsistent;
  verwerfen und neu laden.

**Betroffene Architekturentscheidungen:** Der Dateimanager-Zustand ist serverseitig
autoritativ; lokale Drafts dürfen diese Autorität nicht still überschreiben.

**Alternativen:** (a) Drafts nur lokal halten und nie automatisch senden, (b) einen
expliziten Merge für Favoriten/Verlauf anbieten, (c) Drafts nach einer festen Zeit
verfallen lassen. (a) verliert Offline-Komfort, (b) ist aufwendig, (c) verhindert nicht
den Fall direkt nach einem Neustart.

**Trade-offs:** Ein zusätzlicher Konfliktdialog. Bei reinen UI-Präferenzen kann ein
automatischer Merge sinnvoll sein; bei Favoriten und Verlauf ist Nachfragen sicherer.

**Implementierungsschritte:**
1. `restoreDraft(document, draftRevision, serverRevision)` einführen und die
   Revisionslogik zentral in den Store legen.
2. `FileManagerSync` liest `draft.revision` und ruft die neue Methode auf.
3. Bei Konflikt einen sichtbaren Zustand im Store ergänzen; die UI zeigt zwei Aktionen.
4. Den Draft erst nach erfolgreichem Server-Save löschen.
5. Tests mit zwei Revisionen und einem älteren Draft.

**Tests:** Unit-Test für alle vier Revisionsfälle. Integrationstest mit zwei
Browserkontexten oder simulierten Serverantworten. E2E-Test „älterer Draft
überschreibt neueren Serverstand nicht".

**Akzeptanzkriterien:** Ein Draft mit älterer Revision kann keinen neueren Serverstand
mehr still überschreiben. Der Nutzer sieht den Konflikt und kann bewusst entscheiden.
Ohne Serverstand funktioniert die lokale Wiederherstellung weiterhin.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-06] Terminal- und Dateimanager-Sync wiederholen sich bei Fehlern ohne Backoff

**Kategorie:** Fehlerbehandlung / Performance / UX

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/web/src/components/terminal/TerminalWorkspaceSync.tsx:96-146`
- `apps/web/src/components/terminal/TerminalWorkspaceSync.tsx:143-150`
- `apps/web/src/stores/terminalWorkspace.ts:138-139` (`markSyncError`)
- `apps/web/src/components/files/FileManagerSync.tsx:54-90`
- `apps/web/src/stores/fileManager.ts:164` (`markSyncError`)

**Betroffene Funktionen oder Komponenten:** `TerminalWorkspaceSync`, `FileManagerSync`,
`markSyncError`, `markSaving`, `reconcileSaved`.

**Problembeschreibung:** Beide Sync-Komponenten haben einen Effekt, der beim Setzen von
`saving=true` einen Request startet. Im Fehlerfall ruft `markSyncError` nur
`saving=false` und setzt `dirty` nicht zurück. Dadurch wird der Effekt erneut
ausgelöst, weil `saving` von `true` auf `false` wechselt. Der nächste Request startet
nach dem kurzen Debounce erneut. Bei einem anhaltenden 500er, einem Serverneustart oder
einem Netzwerkfehler entsteht so eine enge Schleife. `TerminalWorkspaceSync` erhöht
`conflictAttemptsRef`, nutzt den Wert aber nie zur Begrenzung; der 409-Zweig versucht
drei Rebase-Runden und stößt danach über `markSaving(false)` wieder denselben Effekt an.

**Technische Ursache:** Der Effekt modelliert „saving=false" als „bereit für den
nächsten Versuch", ohne einen Fehler-/Backoff-Zustand zu unterscheiden. Es gibt keinen
`retryAt`, keinen Maximalzähler und keine Pause bei verstecktem Tab.

**Auslöser:** Serverfehler, SQLite-Busy, abgebrochener Request, 5xx, Netzwerkausfall,
wiederholte 409-Konflikte. Bei `FileManagerSync` genügt ein einmaliger Save-Fehler
nach zuvor erfolgreicher Initialisierung.

**Beispielszenario:** Der Server ist kurz nicht erreichbar. Der Terminal-Workspace
versucht alle ~1,4 Sekunden erneut, der Dateimanager alle ~0,5 Sekunden. Bei 20 offenen
Tabs entstehen dutzende Requests pro Sekunde. Der globale Rate-Limiter antwortet
schließlich mit 429; die UI zeigt weiter nur „konnte nicht gespeichert werden", und die
eigentliche Ursache geht unter.

**Auswirkungen:** Unnötige Server- und Batterielast, volle Logs, Rate-Limit-Fehler, die
andere Funktionen treffen, und ein dauerhaft unruhiger Fehlerzustand. Im Offline-Fall
kann der Nutzer die Seite nicht sinnvoll weiterverwenden.

**Warum es leicht übersehen wird:** Der Netzwerkfehler wird abgefangen und als Toast
angezeigt; der wiederholte Request ist nicht sichtbar. Tests decken einzelne
Erfolgs-/Fehlerfälle ab, aber keine anhaltende Fehlerphase mit Timern.

**Empfohlene Lösung:** Einen gemeinsamen kleinen Retry-Controller für beide Syncs
einführen:
- Zustände `idle`, `saving`, `retry-wait`, `blocked`.
- Exponentielles Backoff (1 s, 2 s, 4 s, … max. 30 s) und ein Versuchszähler.
- Reset des Zählers nur nach einem erfolgreichen Save oder einer echten Nutzeränderung.
- Keine automatischen Requests, solange `document.visibilityState === "hidden"`.
- Nach N Fehlversuchen in der UI eine klare Aktion „Erneut versuchen" anbieten; der
  lokale Puffer bleibt erhalten.
- 409-Konflikte separat behandeln (Rebase + einmaliger Retry), nicht als generischen
  Fehler.

**Betroffene Architekturentscheidungen:** Beide Syncs duplizieren dieselbe
Speicher-/Konfliktschleife. Ein gemeinsamer Controller reduziert die Abweichung.

**Alternativen:** (a) Nur `setTimeout` mit fester Verzögerung, (b) Server-Sent Events
statt Polling, (c) manuelles Speichern. (a) ist minimal, aber weniger robust; (b) ist
ein größerer Umbau; (c) verschlechtert die UX.

**Trade-offs:** Längere Verzögerung bis zur Wiederherstellung nach einem kurzen
Netzwerkfehler. Ein sichtbarer Fehlerzustand ist ehrlicher als eine stille Schleife.

**Implementierungsschritte:**
1. Einen `createSaveRetryController` in `apps/web/src/lib` anlegen.
2. `TerminalWorkspaceSync` und `FileManagerSync` auf den Controller umstellen.
3. `markSyncError` um `retryAt`/`attempt` erweitern oder den Controller allein zuständig
   machen.
4. Sichtbare Retry-Aktion und Status in beiden UIs ergänzen.
5. Tests mit Fake-Timern: 5xx, 409, Netzwerkfehler, Tab versteckt, erfolgreicher Retry.

**Tests:** Unit-Tests für Backoff und Reset. Integrationstest mit einem Fake-API-Client,
der dauerhaft 500 liefert; nach 10 Sekunden müssen höchstens eine Handvoll Requests
entstanden sein. E2E-Test „Seite bleibt offline bedienbar und synchronisiert nach
Rückkehr".

**Akzeptanzkriterien:** Bei anhaltendem Fehler entsteht höchstens ein Request pro
Backoff-Stufe. Der lokale Zustand bleibt erhalten. Ein erfolgreicher Retry setzt den
Zähler zurück. Im versteckten Tab wird nicht automatisch weiterversucht.

**Abhängigkeiten:** Keine; kann unabhängig von F-05 umgesetzt werden.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-07] Notification-Presence ist prozessglobal statt pro Benutzer/Sicht

**Kategorie:** Datenintegrität / Mehrbenutzer / Zustandsübergang

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/notifications/database.ts:221-223` (`setPresence` ersetzt das Array)
- `apps/server/src/notifications/database.ts:264-286` (`presenceMatchesMeta`)
- `apps/server/src/notifications/routes.ts:44-47` (`PUT /notifications/presence`)
- `apps/web/src/lib/useViewPresence.ts:122-160` (Sender)

**Betroffene Funktionen oder Komponenten:** `NotificationDatabase.setPresence`,
`presenceMatches`, `useViewPresence`, `NotificationCenter`.

**Problembeschreibung:** `this.presence` ist ein einzelnes Array pro
`NotificationDatabase`-Instanz. Jeder Aufruf von `setPresence` ersetzt es vollständig.
Die Route übergibt nur die Presence-Liste, keine Benutzer-ID. Zwei Tabs oder zwei
erlaubte Identitäten überschreiben sich daher gegenseitig. Ein leerer Report
(`[]`) löscht die Presence aller anderen Verbindungen. `setPresence` markiert
Benachrichtigungen anhand der zuletzt gemeldeten Sicht als gelesen. Welche Sicht
gewinnt, hängt vom letzten Heartbeat ab, nicht vom tatsächlich sichtbaren Client.

**Technische Ursache:** Presence ist als „eine Ansicht pro Prozess" modelliert, obwohl
die Oberfläche mehrere Tabs, Geräte und Identitäten unterstützt. Die Datenbank speichert
Benachrichtigungen global; Presence braucht trotzdem eine Quelle pro Sicht.

**Auslöser:** Zwei offene Tabs, ein Tab im Hintergrund mit Heartbeat, oder zwei erlaubte
Identitäten. Besonders sichtbar, wenn ein Tab auf einer Route ohne konkrete Chat-Referenz
`[]` meldet und damit die Presence des anderen Tabs löscht.

**Beispielszenario:** Tab A zeigt einen T3-Thread, Tab B die Startseite. Tab B sendet
eine leere Presence und löscht die Presence von A. Neue Nachrichten im T3-Thread gelten
nun als ungelesen und lösen Push aus, obwohl A den Thread sichtbar offen hat. Umgekehrt
kann eine Sicht von A eine Benachrichtigung als gelesen markieren, die B nie gesehen hat.

**Auswirkungen:** Falsche Ungelesen-Zähler, unerwartete Push-Nachrichten, verlorene
Benachrichtigungen im Benachrichtigungsverlauf. Bei mehreren Identitäten ist die
Zuordnung vollständig unklar.

**Warum es leicht übersehen wird:** Im Einzelbenutzer-/Ein-Tab-Fall funktioniert das
Markieren zuverlässig. Der Heartbeat und die TTL verdecken das Überschreiben. Die
Notification-Liste ist nicht als eigene Inbox sichtbar, sodass falsche Read-Zustände
selten auffallen.

**Empfohlene Lösung:** Presence pro Benutzer und Client speichern:
- `Map<userId, Map<clientId, { items, lastSeenAt }>>` im Speicher, TTL pro Eintrag.
- `PUT /notifications/presence` übergibt die aufgelöste `userId` und optional eine
  stabile `clientId`.
- `setPresence` ersetzt nur den Eintrag dieses Clients; ein leerer Report entfernt nur
  diesen Client, nicht alle.
- Die Read-Markierung berücksichtigt alle aktiven Sichten desselben Benutzers (oder
  bewusst nur die eigene) und niemals fremde Benutzer.
- Ein periodisches Prune entfernt abgelaufene Clients.

**Betroffene Architekturentscheidungen:** Die globale Inbox bleibt bestehen; Presence
ist ein flüchtiger Sichtzustand und darf nicht global sein.

**Alternativen:** (a) Presence nur clientseitig und Read-Markierung explizit per Klick,
(b) eine serverseitige Session pro Tab, (c) Presence ganz entfernen. (a) verliert
automatisches Gelesen-Markieren, (b) ist mehr Aufwand, (c) verschlechtert die UX.

**Trade-offs:** Mehr Speicher pro Tab/Benutzer, aber nur wenige kleine Objekte. Die
Read-Semantik muss dokumentiert werden (globaler Verlauf, aber sichtabhängiges Gelesen).

**Implementierungsschritte:**
1. `PresenceEntry` um `userId`/`clientId` erweitern; Datenstruktur verschachteln.
2. Route und Contract um eine optionale Client-ID ergänzen.
3. `setPresence` und `presenceMatchesMeta` auf den passenden Eintrag beschränken.
4. TTL-Aufräumen zentralisieren.
5. Tests mit zwei Benutzern, zwei Tabs und leerem Report.

**Tests:** Unit-Test „Presence von Tab B löscht Tab A nicht". Test „Read-Markierung
eines Benutzers beeinflusst anderen Benutzer nicht". Test „abgelaufene Presence wird
entfernt".

**Akzeptanzkriterien:** Zwei Tabs derselben Identität können gleichzeitig
unterschiedliche Sichten melden, ohne sich zu überschreiben. Ein leerer Report eines
Tabs löscht keine anderen Sichten. Fremde Benutzer werden nie durch Presence eines
anderen beeinflusst.

**Abhängigkeiten:** Contract-Änderung; UI muss eine stabile Client-ID senden (die
Settings-Sync-Client-ID kann wiederverwendet werden).

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-08] Löschen des aktiven Accounts lässt den Shared-Home-Symlink auf gelöschte Zugangsdaten zeigen

**Kategorie:** Datenintegrität / Zustandsübergang / Accountverwaltung

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** High Confidence

**Betroffene Dateien:**
- `apps/server/src/usage/account-service.ts:275-281` (`remove`)
- `apps/server/src/usage/database.ts:316` (`deleteAccount`)
- `apps/server/src/usage/database.ts:321-329` (`active_accounts`)
- `apps/server/src/usage/account-switch.ts:47-63` (`activeProfilePath`, `repair`)

**Betroffene Funktionen oder Komponenten:** `AccountService.remove`,
`UsageDatabase.deleteAccount`, `AccountSwitch.activeProfilePath`, `AccountList`
(UI blockiert aktive Accounts).

**Problembeschreibung:** `remove` prüft nicht, ob der Account der aktive Account des
Werkzeugs ist. Es entfernt den CodexBar-Eintrag (bei Codex), optional die
Claude-Provider-Aktivierung und anschließend die Datenbankzeile. `active_accounts`
wird per `ON DELETE CASCADE` ebenfalls entfernt. Der Symlink im gemeinsamen Home
(`~/.codex/auth.json`, `~/.claude/.credentials.json`,
`~/.local/share/opencode/auth.json`) bleibt jedoch unverändert und zeigt weiterhin auf
die Datei des gelöschten Accounts. Ein danach gestarteter CLI-Prozess verwendet diese
Zugangsdaten weiter. Die UI zeigt gleichzeitig keinen aktiven Account mehr.

**Technische Ursache:** Löschen und Aktivieren sind getrennte Operationen. Die
Löschroutine hat keine Regel für „aktiv" und keinen Zugriff auf den Symlink-Zustand.
Die UI verhindert das Löschen des aktiven Accounts nur in der Oberfläche; die API
selbst hat keinen Guard.

**Auslöser:** Direkter `DELETE /api/v1/accounts/:id`-Aufruf durch einen Admin, ein
älterer Client, ein Plugin oder ein paralleler Aktivierungsvorgang, bei dem der
Account nach der UI-Prüfung noch aktiv wird. Auch ein extern beschädigter Symlink kann
zu einem inkonsistenten `active`-Status führen.

**Beispielszenario:** Ein Nutzer löscht den Codex-Account über einen älteren Client
oder per API. Die Registry ist leer, aber `~/.codex/auth.json` zeigt weiterhin auf
`~/.wrapt-profiles/codex/<gelöschte-id>/auth.json`. Ein neuer Codex-Prozess startet
mit den alten Zugangsdaten; der Nutzer wundert sich, warum der „gelöschte" Account
weiterhin aktiv ist.

**Auswirkungen:** Inkonsistenter Accountzustand, unerwartete Nutzung eines eigentlich
entfernten Profils, Verwirrung bei Abrechnung/Limits. Im schlimmsten Fall werden
Aktivierungs- und Reparaturpfade gegeneinander ausgeführt.

**Warum es leicht übersehen wird:** Die UI disabled den Löschen-Button für aktive
Accounts. Der Backend-Pfad wirkt dadurch abgesichert, ist es aber nicht. Tests prüfen
Admin-Gates, nicht die Symlink-Konsistenz nach dem Löschen.

**Empfohlene Lösung:** Im Backend eine der beiden Regeln erzwingen:
1. Aktive Accounts dürfen nicht gelöscht werden (`409 ACCOUNT_ACTIVE`), oder
2. Das Löschen eines aktiven Accounts schaltet zuerst atomar auf einen anderen Account
   um bzw. entfernt den Symlink und beendet laufende Prozesse; erst danach wird die
   Datenbankzeile gelöscht.
Zusätzlich sollte `remove` den Account über `serialized(provider)` und gemeinsam mit
dem Symlink-Zustand prüfen. Ein Reparaturlauf beim Start kann verwaiste Symlinks
erkennen und melden.

**Betroffene Architekturentscheidungen:** Der Symlink ist die Wahrheit für den aktiven
Account; die Datenbank ist nur die Absicht. Löschen muss beide Zustände berücksichtigen.

**Alternativen:** (a) aktive Accounts immer blockieren, (b) automatisch den ersten
verbleibenden Account aktivieren, (c) den Symlink entfernen und den Nutzer neu anmelden
lassen. (a) ist am sichersten, (b) kann unerwartet den falschen Account aktivieren,
(c) ist ehrlich, erfordert aber eine erneute Anmeldung.

**Trade-offs:** Blockieren ist einfach und sicher, verhindert aber das Aufräumen eines
aktiven Profils ohne vorherigen Wechsel. Automatisches Umschalten ist komfortabler,
aber komplexer und muss laufende Codex-Prozesse berücksichtigen.

**Implementierungsschritte:**
1. `remove` mit `serialized(account.provider, ...)` und einer Prüfung auf
   `activeProfilePath` erweitern.
2. Bei aktivem Account entweder 409 zurückgeben oder einen expliziten
   `switchToAccountId`/`clear`-Pfad ausführen.
3. Den Symlink nach dem Löschen verifizieren; bei Abweichung einen Recovery-Eintrag
   schreiben.
4. UI-Meldung an die gewählte Semantik anpassen.
5. Tests mit aktivem und inaktivem Account, Codex/Claude/OpenCode und einem
   parallelen Aktivierungsversuch.

**Tests:** Test „DELETE aktiver Account liefert 409 oder entfernt den Symlink".
Test „inaktiver Account lässt den aktiven Symlink unverändert". Test „Recovery meldet
verwaisten Symlink".

**Akzeptanzkriterien:** Nach dem Löschen eines Accounts kann kein neuer CLI-Prozess
mehr die Zugangsdaten des gelöschten Accounts verwenden, außer der Nutzer hat bewusst
einen anderen Account aktiviert. Der `active`-Status in der API ist danach konsistent.

**Abhängigkeiten:** Keine; UI-Text muss angepasst werden.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Medium (Accountwechsel beendet ggf. laufende Prozesse).

### [F-09] Beschädigte persistierte JSON-Dokumente führen zu dauerhaften 500ern

**Kategorie:** Datenintegrität / Fehlerbehandlung / Upgrade-Robustheit

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/terminal/database.ts:294-298` (`readWorkspace`, `JSON.parse`)
- `apps/server/src/terminal/database.ts:282-291` (`getWorkspace`, V1-Migration)
- `apps/server/src/filesystem/fileManagerService.ts:370-374` (`readState`)
- `apps/server/src/workspaces/database.ts:44-48` (`getRegistry`)
- `apps/server/src/previews/database.ts:514-526` (`candidates`, `serviceGraph`)
- `apps/server/src/notes/knowledge.ts:18-20` (`metadata`/Tags)

**Betroffene Funktionen oder Komponenten:** `TerminalDatabase.getWorkspace`,
`FileManagerService.state`, `WorkspaceRegistryDatabase.getRegistry`,
`PreviewSlotDatabase.candidates/serviceGraph`, `NoteKnowledgeDatabase.metadata`.

**Problembeschreibung:** Mehrere persistierte JSON-Spalten werden ungeschützt mit
`JSON.parse` gelesen; einige davon validieren das Ergebnis anschließend mit einem
strengen Zod-Schema. Ist eine Zeile beschädigt (manuelle Bearbeitung, ältere
inkompatible Version, abgebrochene Migration oder ein Downgrade), wirft der Parser bei
**jedem** Request. Es gibt keinen Fallback, keine Quarantäne und keine
Reparaturmöglichkeit über die UI. Die Web-Clients wiederholen den Abruf teilweise im
Sekundentakt.

**Technische Ursache:** Die Schreibpfade validieren vor dem Speichern, die Lesepfade
vertrauen der Datenbank. Das ist bei einer ausschließlich von der Anwendung
beschriebenen SQLite meist ausreichend, aber nicht bei Versionswechseln, manuellen
Eingriffen oder externen Prozessen. `ui_settings` zeigt bereits, wie ein robuster
Fallback aussehen kann (`parseDocument` mit leerem Dokument); die anderen Tabellen
folgen diesem Muster nicht.

**Auslöser:** Beschädigtes `terminal_workspaces.document_json`,
`file_manager_state.document_json`, `workspace_registries.document_json`,
`preview_service_candidates.payload`, `preview_service_graphs.edges`,
`note_knowledge.tags` oder `skill_editor_jobs.payload/result`. Auch ein
Schema-Downgrade nach einer neueren Version kann ein formal gültiges JSON erzeugen, das
die ältere App nicht mehr parsen kann.

**Beispielszenario:** Ein Nutzer kopiert eine ältere `wrapt.sqlite` über die aktuelle,
oder ein externes Werkzeug schreibt in `terminal_workspaces`. Beim Öffnen der
Terminalseite erhält der Browser dauerhaft 500. `TerminalWorkspaceSync` lädt mit
exponentiellem Retry immer wieder, die Seite bleibt im Ladezustand. Ein manueller
Eingriff in die Datenbank ist nötig.

**Auswirkungen:** Einzelne Funktionen sind dauerhaft unbenutzbar; die UI zeigt
scheinbar einen Netzwerkfehler. Bei Terminal/Dateimanager betrifft es die gesamte
Oberfläche des Werkzeugs. Die repetitive Client-Schleife verstärkt die Last.

**Warum es leicht übersehen wird:** SQLite schreibt atomar; ein von der Anwendung
erzeugter Datensatz ist normalerweise gültig. Die Tests verwenden ausschließlich
gültige Dokumente. Es gibt keine „beschädigte Daten“-Testfälle.

**Empfohlene Lösung:** Einen gemeinsamen Codec-/Recovery-Helfer einführen:
- `safeJsonParse<T>(raw, schema, fallback)` mit Zod-Validierung und aussagekräftigem
  Log.
- Bei ungültigen Daten die Zeile in eine Quarantänetabelle verschieben (oder als
  `*_broken` markieren) und den Standardzustand liefern.
- Eine Diagnose-/Reparaturroute anbieten, die den beschädigten Rohwert anzeigt und
  bewusst verwerfen lässt.
- Beim Start eine kurze Integritätsprüfung der kritischen Dokumente durchführen.
- Für Terminal/FileManager einen klaren 409/422-Code statt 500 liefern, damit die UI
  „Layout zurücksetzen" anbieten kann.

**Betroffene Architekturentscheidungen:** Mehrere Module haben eigene JSON-Codecs.
Eine kleine gemeinsame Bibliothek reduziert die Abweichung.

**Alternativen:** (a) Nur try/catch und Default zurückgeben, (b) Schema-Versionen
explizit migrieren, (c) beschädigte Zeilen automatisch löschen. (a) kann Daten
verlieren, ohne sie zu sichern; (b) ist langfristig richtig, aber aufwendig; (c) ist
riskant ohne Backup.

**Trade-offs:** Zusätzlicher Code und eine Quarantänetabelle. Ein stiller Fallback kann
eine echte Datenbeschädigung verschleiern; deshalb muss er geloggt und sichtbar gemacht
werden.

**Implementierungsschritte:**
1. Gemeinsamen Helfer und Quarantäne-Tabelle anlegen.
2. Alle oben genannten Lese stellen umstellen; Rückgabetypen beibehalten.
3. Beim Terminal-Workspace einen expliziten Reset-Endpunkt anbieten.
4. Beim Dateimanager und Workspace-Register den Standardzustand mit Warnung liefern.
5. Tests mit kaputtem JSON, falscher Version und gültigem JSON.

**Tests:** Pro Bereich ein Test mit absichtlich ungültigem `document_json`. Die API
muss einen definierten Zustand liefern, nicht 500. Ein zweiter Request muss denselben
Zustand liefern. Ein Reparatur-/Reset-Test muss die Quarantäne leeren.

**Akzeptanzkriterien:** Keine beschädigte JSON-Zeile kann eine ganze Funktion dauerhaft
mit 500 blockieren. Der Rohwert bleibt für die Diagnose erhalten. Ein bewusster Reset
ist möglich.

**Abhängigkeiten:** Keine; kann schrittweise pro Modul umgesetzt werden.

**Geschätzter Umfang:** Medium

**Risiko bei der Umsetzung:** Low

### [F-10] Globaler bodyLimit erlaubt bis zu ~201 MB große JSON-Anfragen

**Kategorie:** Performance / Stabilität / Ressourcenverbrauch

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/app/buildApp.ts:39` (`bodyLimit`)
- `apps/server/src/config/settings.ts:118-122` (Galerie-/Dateimanager-Limits)
- `apps/server/src/app/routes.ts:42-45` (Multipart-Limits)
- `apps/server/src/app/routes.ts` (Notes-Import mit eigenem `bodyLimit`)

**Betroffene Funktionen oder Komponenten:** Fastify-Instanz, alle JSON-Routen,
Multipart-Scope.

**Problembeschreibung:** Der globale `bodyLimit` ist
`Math.max(fileGalleryMaxFileBytes, fileManagerMaxUploadBytes) + 1_048_576`. Mit den
Standardwerten (Galerie 100 MB, Dateimanager 200 MB) sind das ca. 201 MB. Dieser Wert
gilt für **alle** JSON-Anfragen, nicht nur für Uploads. Die fachlichen Limits
(Notizinhalt 2 MB, UI-Settings 128 KB pro Wert/512 KB pro Dokument, Notiz-Import 64 MB)
greifen erst nach dem vollständigen Buffern durch Fastify. Ein einziger fehlerhafter
Client oder ein versehentlich großer Request kann hunderte Megabyte Heap belegen.

**Technische Ursache:** Upload-Größen und JSON-Body-Größen wurden in einer einzigen
globalen Einstellung vermischt. Die Uploads laufen aber über Multipart-Routen mit
eigenen Limits. Die JSON-Routen brauchen nur die kleinen fachlichen Grenzen.

**Auslöser:** Ein Client sendet eine große JSON-Payload an `/settings/ui`, `/notes/...`,
`/terminal/workspace` oder eine andere API. Auch ein fehlerhaftes Plugin oder ein
manipulierter Browser-Client kann das auslösen. Bei mehreren Tabs summiert sich der
Speicher.

**Beispielszenario:** Ein Notiz-Editor sendet versehentlich ein 100-MB-Dokument an
`PUT /notes/:id/content`. Fastify puffert es vollständig, bevor Zod die 2-MB-Grenze
ablehnt. Der Node-Prozess hat kurzzeitig >100 MB zusätzlich im Heap; bei parallelen
Requests kann er in den Swap oder in ein OOM-Szenario geraten.

**Auswirkungen:** Speicherdruck, Latenzspitzen, mögliche OOM-Neustarts. Der
Rate-Limiter hilft nicht, weil ein einzelner Request genügt. Eine Fehlermeldung kommt
erst nach dem teuren Buffern.

**Warum es leicht übersehen wird:** Der Wert wirkt wie eine Upload-Konfiguration. Im
Normalbetrieb sind die JSON-Payloads klein; das Problem zeigt sich nur bei fehlerhaften
Clients oder unter Last.

**Empfohlene Lösung:** Den globalen JSON-`bodyLimit` auf einen kleinen Wert setzen
(z. B. 1–2 MB). Für die wenigen größeren Routen ein per-Route-`bodyLimit` verwenden:
- `/notes/import`: `NOTES_ARCHIVE_MAX_BYTES`
- `/api/v1/notes/:noteId/content`: `NOTE_CONTENT_MAX_CHARACTERS` plus JSON-Overhead
- `/filesystem/state` und `/terminal/workspace`: dokumentierte kleine Grenzen
- Multipart-Routen: eigene `request.file()`-Limits, unverändert.
Den Galerie-/Dateimanager-Upload nicht über den globalen JSON-Limit laufen lassen.

**Betroffene Architekturentscheidungen:** Fastify erlaubt globale und per-Route
Limits; die aktuelle Mischung ist zu grob.

**Alternativen:** (a) Streaming-JSON-Parser, (b) Reverse-Proxy-Limit, (c) nur
Client-Validierung. (a) ist für diese Datenmengen unnötig, (b) verlagert das Problem,
(c) ist unsicher.

**Trade-offs:** Größere Notes-Importe brauchen weiterhin ein explizites Limit; die
Konfiguration wird etwas ausführlicher.

**Implementierungsschritte:**
1. Globalen `bodyLimit` auf 2 MB setzen.
2. Jede Route mit legitimen größeren Bodies mit `{ bodyLimit: ... }` versehen.
3. Multipart-Routen auf ihre bestehenden Limits prüfen.
4. Tests für 413 an einer normalen JSON-Route und Erfolg an der Notes-Import-Route.

**Tests:** Test „2,1 MB an `/settings/ui` liefert 413, ohne den Heap zu füllen".
Test „Notes-Import bis 64 MB funktioniert weiterhin". Test „Upload-Limit bleibt
unabhängig".

**Akzeptanzkriterien:** Keine JSON-Route akzeptiert mehr als ihr fachliches Limit.
Uploads funktionieren unverändert. 413-Antworten sind schnell und verständlich.

**Abhängigkeiten:** F-11 (Fehlermapping) sollte zusammen umgesetzt werden, damit 413
verständlich ankommt.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-11] Fastify-4xx-Fehler werden zu einem generischen Validierungsfehler

**Kategorie:** Fehlerbehandlung / UX / API-Vertrag

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/utils/api-errors.ts:93-150` (`toApiError`)
- `apps/server/src/app/hooks.ts:12-28` (zentraler Error-Handler)

**Betroffene Funktionen oder Komponenten:** `toApiError`, `setErrorHandler`,
alle Routen mit Framework-Fehlern (Body-Limit, Multipart, Content-Type).

**Problembeschreibung:** `toApiError` behandelt zuerst `AppError`, `ZodError`,
Hermes-Fehler, Terminal-Fehler, SQLite-Busy und explizit 429. Danach fällt jeder andere
Fehler mit `statusCode` zwischen 400 und 499 auf
`{ status, code: "VALIDATION_ERROR", message: "Die Anfrage ist ungültig." }`. Damit
verlieren Fastify-Fehler wie `FST_ERR_CTP_BODY_TOO_LARGE` (413) oder ein
Multipart-Limit ihre konkrete Bedeutung. Der Client zeigt „Die Anfrage ist ungültig",
obwohl die Datei zu groß war oder der Content-Type nicht unterstützt wird.

**Technische Ursache:** Die generische 4xx-Fallback-Regel ist zu breit. Sie soll
unbekannte Clientfehler abfangen, überschreibt aber bekannte Framework-Codes.

**Auslöser:** Überschreitung des globalen Body-Limits, Multipart-Datei zu groß,
falscher Content-Type, zu viele Multipart-Felder, ungültige JSON-Syntax.

**Beispielszenario:** Ein Nutzer lädt eine 250-MB-Datei in den Dateimanager. Fastify
erkennt das Limit und antwortet mit 413. Die UI erhält
`VALIDATION_ERROR`/„Die Anfrage ist ungültig" und bietet keine Erklärung, dass die
Datei zu groß ist.

**Auswirkungen:** Unklare Fehlermeldungen, unnötige Supportfälle, falsche
Wiederholungsversuche. Der Request-ID bleibt erhalten, aber der Code hilft nicht.

**Warum es leicht übersehen wird:** Die eigenen `AppError`-Fälle sind gut abgedeckt.
Framework-Fehler treten nur an den Rändern auf und werden in Tests oft direkt am
Multipart-Parser geprüft, nicht über den zentralen Handler.

**Empfohlene Lösung:** Vor dem generischen 4xx-Fallback bekannte Fastify-Codes
abbilden:
- `FST_ERR_CTP_BODY_TOO_LARGE` → 413 `PAYLOAD_TOO_LARGE`
- `FST_REQ_FILE_TOO_LARGE` → 413 `FILE_TOO_LARGE`
- `FST_ERR_CTP_INVALID_MEDIA_TYPE` → 415 `UNSUPPORTED_MEDIA_TYPE`
- `FST_ERR_CTP_INVALID_JSON_BODY` → 400 `INVALID_JSON`
- Multipart-Limits → 413 mit Feldnamen.
Die Meldung muss für Endnutzer verständlich sein, ohne interne Details zu leaken.
Unbekannte 4xx weiterhin generisch behandeln.

**Betroffene Architekturentscheidungen:** Die zentrale Fehlertaxonomie ist richtig;
sie braucht nur die Framework-Ebene.

**Alternativen:** (a) Fastify-Standardfehler durchreichen, (b) pro Route eigene
Handler, (c) nur den Body-Limit-Fall speziell behandeln. (a) kann technische Details
zeigen, (b) dupliziert Logik, (c) lässt andere 4xx weiter unklar.

**Trade-offs:** Etwas mehr Mapping-Code. Die API-Codes müssen dokumentiert und stabil
gehalten werden.

**Implementierungsschritte:**
1. Die Fastify-Fehlercodes in `toApiError` abbilden.
2. Tests für Body-Limit, Multipart-Limit und ungültigen Content-Type ergänzen.
3. Die Web-Fehleranzeige prüfen, ob sie die neuen Codes verständlich darstellt.

**Tests:** `POST /files` mit zu großer Datei → 413 und `FILE_TOO_LARGE`. `PUT
/settings/ui` mit zu großem JSON → 413 und `PAYLOAD_TOO_LARGE`. `POST` mit
`text/plain` an eine JSON-Route → 415.

**Akzeptanzkriterien:** Größen- und Formatfehler sind vom Nutzer als solche erkennbar.
Kein Framework-Fehler wird mehr als „Anfrage ungültig" verdeckt.

**Abhängigkeiten:** F-10.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-12] Restart- und Update-Skripte bauen Plugin-SDK und Icons nicht mit

**Kategorie:** Deployment / Build-Graph / Developer Experience

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `scripts/lib-restart.sh:207-216` (`build_contracts`)
- `scripts/update-and-restart.sh:26-33`
- `package.json:15` (Root-Build mit `plugin-sdk` und `build:icons`)
- `apps/server/src/plugins/code-build.ts:96` (nutzt
  `packages/plugin-sdk/dist/index.js` zur Laufzeit)

**Betroffene Funktionen oder Komponenten:** Restart-Skripte, Update-Skript,
Plugin-Runtime, Web-Icons.

**Problembeschreibung:** Der Root-Build baut `build:icons`, `extension-contracts`,
`plugin-sdk`, `contracts`, Server und Web. `restart-backend.sh`,
`restart-frontend.sh`, `restart-all.sh` und `update-and-restart.sh` rufen nur
`build_contracts` auf; dieses baut ausschließlich `extension-contracts` und
`contracts`. `plugin-sdk` und `build:icons` fehlen. Änderungen am Plugin-SDK bleiben
damit im gebauten `dist` veraltet, obwohl der Server neu startet. Auf einem frischen
Checkout kann `packages/plugin-sdk/dist` fehlen; dann schlägt die Plugin-Runtime fehl,
obwohl `restart-backend` „erfolgreich" war. `update-and-restart.sh` baut
`extension-contracts` zusätzlich doppelt (einmal explizit, einmal über
`build_contracts`).

**Technische Ursache:** Die Build-Reihenfolge wurde im Root-Skript ergänzt, aber nicht
in die gemeinsame Restart-Funktion übernommen. Die Skripte gehen davon aus, dass
`pnpm install`/`pnpm build` bereits alles gebaut hat.

**Auslöser:** Änderung an `packages/plugin-sdk/src`, an Icon-Quellen oder ein frischer
Checkout, bei dem nur ein Restart-Skript läuft. Auch ein Update, das eine
Plugin-SDK-Änderung enthält, aber keinen vollständigen Root-Build ausführt.

**Beispielszenario:** Ein Entwickler ändert `packages/plugin-sdk/src/index.ts` und
führt `bash scripts/restart-backend.sh` aus. Der Server wird neu gebaut und gestartet,
aber `packages/plugin-sdk/dist/index.js` bleibt alt. Ein Plugin, das die neue API
verwendet, schlägt zur Laufzeit fehl. Die Build-Ausgabe zeigt keinen Fehler, weil der
Server das SDK nur als Typ importiert.

**Auswirkungen:** Schwer auffindbare Laufzeitfehler in Plugins, veraltete Icons,
inkonsistente Builds zwischen `pnpm build` und dem dokumentierten Restart-Workflow.

**Warum es leicht übersehen wird:** Der Server-Typecheck und der Server-Build laufen
erfolgreich, weil die Typen aus `src` kommen. Der Runtime-Pfad verwendet aber `dist`.
Die Skripte sind Bash und werden nicht von `pnpm typecheck` geprüft.

**Empfohlene Lösung:** Eine gemeinsame Build-Funktion im Root (z. B.
`pnpm build:workspace-deps`) einführen oder `build_contracts` um
`@wrapt/plugin-sdk` und `build:icons` erweitern. `update-and-restart.sh` soll dieselbe
Funktion verwenden, nicht die doppelte Einzelzeile. Optional einen
`pnpm build:check`-Test ergänzen, der prüft, dass alle Workspace-Pakete mit
`dist`-Export vor dem Serverstart gebaut sind.

**Betroffene Architekturentscheidungen:** Der Build-Graph ist im Root-Skript korrekt,
in den Betriebsskripten aber dupliziert und unvollständig.

**Alternativen:** (a) Restart-Skripte rufen immer `pnpm build` auf (langsamer), (b) ein
gemeinsames Shell-Helper, (c) ein Node-Build-Orchestrator. (a) ist einfach, aber baut
unnötig Web/Server mit; (b) ist minimal; (c) ist langfristig sauberer.

**Trade-offs:** Etwas längere Restart-Läufe, dafür konsistente Artefakte. Ein
vollständiger Root-Build bei jedem Backend-Restart wäre teurer.

**Implementierungsschritte:**
1. `build_workspace_dependencies()` in `lib-restart.sh` einführen:
   `extension-contracts`, `plugin-sdk`, `contracts`, `build:icons`.
2. Alle Restart-/Update-Skripte darauf umstellen.
3. Die doppelte Zeile in `update-and-restart.sh` entfernen.
4. Einen Smoke-Test ergänzen, der nach einem simulierten Build prüft, dass
   `packages/plugin-sdk/dist/index.js` und die Icons existieren.

**Tests:** Shell-/CI-Test, der die Skripte mit einem Mock-`pnpm` ausführt und die
erwarteten Build-Aufrufe prüft. Zusätzlich ein echter isolierter Build in temporärem
Verzeichnis (nicht im Live-`dist`).

**Akzeptanzkriterien:** Nach jedem dokumentierten Restart-/Update-Lauf sind
`plugin-sdk/dist`, `contracts/dist`, `extension-contracts/dist` und die Icons
konsistent mit den Quellen. Ein frischer Checkout kann mit einem Restart-Skript
erfolgreich starten.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-13] Gespeicherter Hauptdienst ohne Port blockiert die Preview-Veröffentlichung

**Kategorie:** Logik / Preview / Zustandsübergang

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/previews/runtimePorts.ts:4-12` (`selectedRuntimeMainPort`)
- `apps/server/src/previews/DevServerManager.ts:310-330` (`publish`)
- `apps/server/src/previews/DevServerManager.ts:140-180` (`status`)

**Betroffene Funktionen oder Komponenten:** `selectedRuntimeMainPort`,
`PreviewDevServerManager.status/publish`.

**Problembeschreibung:** `selectedRuntimeMainPort` prüft, ob der gespeicherte
`mainServiceId` in `profile.services` existiert. Wenn er existiert, aber `port === null`
ist, ist `servicePort` `null` (nicht `undefined`). Die Bedingung
`if (servicePort !== undefined) return servicePort;` gibt dann `null` zurück und
überspringt den Fallback auf `mainPort` oder `mainServiceId`. Ein zuvor gespeicherter
Hauptdienst, der später keinen Browser-Port mehr hat (z. B. `port: null` in
`preview.config.json` oder Rollenwechsel zu `database`), blockiert damit die
Veröffentlichung, obwohl ein anderer Dienst einen gültigen Port besitzt.

**Technische Ursache:** `null` und `undefined` werden nicht unterschieden. Der
gespeicherte Dienst ist vorhanden, aber unbrauchbar; die Funktion behandelt das als
gültige Antwort.

**Auslöser:** Bearbeiten von `preview.config.json` (Port auf `null`), Wechsel der
Dienstrolle, oder eine ältere gespeicherte Präferenz, die auf einen nun portlosen
Dienst zeigt.

**Beispielszenario:** Ein Projekt hatte `web` als Hauptdienst auf Port 5173. Der Nutzer
ändert die Konfiguration, sodass `web` nur noch ein Worker ohne Port ist und `api` den
Browser-Port übernimmt. Die gespeicherte Präferenz zeigt weiter auf `web`. `status`
liefert `mainPort: null`; „Im neuen Tab öffnen" antwortet mit
`PREVIEW_RUNTIME_MAIN_SERVICE_MISSING`.

**Auswirkungen:** Preview lässt sich nicht öffnen, bis der Nutzer manuell einen neuen
Hauptport wählt oder die Präferenz löscht. Die Ursache ist für Nutzer nicht erkennbar.

**Warum es leicht übersehen wird:** Der Normalfall „gespeicherter Dienst existiert und
hat einen Port" funktioniert. Tests decken `port: null` bei der Profilerkennung ab,
aber nicht die Kombination mit einer gespeicherten Hauptdienst-Präferenz.

**Empfohlene Lösung:** Nur echte Ports akzeptieren:
```
const servicePort = ...?.port;
if (typeof servicePort === "number") return servicePort;
```
Danach `mainPort` und `profile.mainServiceId` als Fallback prüfen. Zusätzlich beim
Laden der Präferenz prüfen, ob der Dienst noch einen Port hat, und die Präferenz
bereinigen.

**Betroffene Architekturentscheidungen:** Hauptdienst-Präferenz und aktuelle
Profilerkennung sind getrennte Zustände; die Präferenz muss gegen das aktuelle Profil
validiert werden.

**Alternativen:** (a) Präferenz bei jeder Profiländerung löschen, (b) `mainServiceId`
nur speichern, wenn der Dienst einen Port hat, (c) den ersten portfähigen Dienst
automatisch wählen. (a) verliert die Auswahl, (b) ist eine gute zusätzliche
Validierung, (c) kann überraschen.

**Trade-offs:** Ein automatischer Fallback kann eine bewusste Auswahl überschreiben;
deshalb sollte die UI den tatsächlich verwendeten Hauptdienst anzeigen.

**Implementierungsschritte:**
1. Die `undefined`/`null`-Prüfung korrigieren.
2. Beim Speichern der Präferenz nur Dienste mit Port zulassen.
3. Beim Status einen Hinweis liefern, wenn die gespeicherte Präferenz ungültig ist.
4. Test mit einem portlosen gespeicherten Dienst und einem gültigen Alternativdienst.

**Tests:** Unit-Test `selectedRuntimeMainPort` mit `mainServiceId` auf `port: null`,
`mainPort` gesetzt und Fallback. Integrationstest `launch` nach Konfigurationsänderung.

**Akzeptanzkriterien:** Ein portloser gespeicherter Dienst verhindert die
Veröffentlichung nicht, wenn ein anderer gültiger Hauptdienst existiert. Die
gespeicherte Präferenz wird sichtbar korrigiert oder als ungültig markiert.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-14] Preview-Idempotenzschlüssel wird trotz geänderter Slot-Anforderung wiederverwendet

**Kategorie:** Logik / Preview / API-Vertrag

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/web/src/components/preview/usePreviewRuntimeSession.ts:101-119`
  (Client-Fingerprint)
- `apps/server/src/previews/slots.ts:369-398` (Server-Fingerprint)
- `packages/contracts/src/preview-sessions.ts` (`requestedSlotId`, `idempotencyKey`)

**Betroffene Funktionen oder Komponenten:** `usePreviewRuntimeSession`, `openSessionOnce`,
`PreviewSessionRequest`.

**Problembeschreibung:** Der Client bildet seinen Idempotenz-Fingerprint aus
`sessionKey`, `projectId`, `targetPort`, `isolate` und `storageProfileId`.
`requestedSlotId` fehlt. Der Server nimmt `requestedSlotId` in den Fingerprint auf. Wenn
sich `requestedSlotId` ändert, während der Client denselben Idempotenzschlüssel
weiterverwendet, erkennt der Server eine andere Anfrage mit demselben Schlüssel und
antwortet mit `409 PREVIEW_IDEMPOTENCY_CONFLICT`. Der Client behandelt nur
`PREVIEW_SLOT_CHANGED` und `PREVIEW_SLOTS_EXHAUSTED`, nicht diesen Code.

**Technische Ursache:** Client und Server definieren „dieselbe Anfrage" unterschiedlich.
Der Client betrachtet den Slotwunsch als nachgelagertes Detail, der Server als Teil der
Identität.

**Auslöser:** Ein Deep-Link mit `?slot=...` wird geöffnet, während die Komponente bereits
eine Session für denselben Preview-Zielzustand hält; oder die gewünschte Slot-ID ändert
sich nach einem Reload/Recovery, ohne dass der Client einen neuen Schlüssel erzeugt.

**Beispielszenario:** Ein Nutzer öffnet eine Preview über einen Link mit Slot 3. Der
erste Request scheitert und wird mit demselben Idempotenzschlüssel für Slot 4
wiederholt. Der Server sieht denselben Schlüssel mit anderem Fingerprint und antwortet
409. Die UI zeigt „Idempotenzschlüssel bereits verwendet" statt die Preview zu öffnen.

**Auswirkungen:** Preview bleibt in einem nicht selbsterklärenden Fehlerzustand. Der
Nutzer muss die Seite neu laden, um einen neuen Schlüssel zu erhalten.

**Warum es leicht übersehen wird:** Im normalen Ablauf bleibt `requestedSlotId` während
einer Session konstant. Der Server-Test deckt nur die Änderung von `primaryPort` ab,
nicht `requestedSlotId`. Der Client-Fingerprint ist leicht zu übersehen, weil er an
anderer Stelle definiert ist.

**Empfohlene Lösung:** `requestedSlotId` in den Client-Fingerprint aufnehmen oder bei
jeder Änderung von `requestedSlotId` einen neuen Idempotenzschlüssel erzeugen. Zusätzlich
sollte der Client `PREVIEW_IDEMPOTENCY_CONFLICT` als „Anfrage neu aufsetzen" behandeln
und einmalig mit neuem Schlüssel wiederholen. Server und Client sollten denselben
Fingerprint-Vertrag verwenden; idealerweise wird ein gemeinsamer Helper in
`@wrapt/contracts` definiert.

**Betroffene Architekturentscheidungen:** Idempotenz ist ein API-Vertrag, derzeit aber
auf beiden Seiten separat implementiert.

**Alternativen:** (a) Server-Fingerprint ohne `requestedSlotId`, (b) Client sendet
keinen Idempotenzschlüssel bei Slot-Änderungen, (c) gemeinsamer Helper. (a) kann
versehentlich verschiedene Slot-Anforderungen als identisch behandeln; (b) ist
fehleranfällig; (c) ist die sauberste Lösung.

**Trade-offs:** Ein zusätzlicher Feldvergleich; keine funktionalen Nachteile.

**Implementierungsschritte:**
1. `requestedSlotId` in den Client-Fingerprint aufnehmen.
2. Bei jeder Änderung von `requestedSlotId` den Idempotenzschlüssel zurücksetzen.
3. `PREVIEW_IDEMPOTENCY_CONFLICT` im Client einmalig mit neuem Schlüssel wiederholen.
4. Test auf beiden Seiten mit identischem Fingerprint.

**Tests:** Client-Test „requestedSlotId ändert sich → neuer Idempotenzschlüssel".
Server-Test „gleicher Schlüssel, gleicher Fingerprint → dieselbe Session". E2E-Test
„Deep-Link mit Slot-Wechsel öffnet Preview".

**Akzeptanzkriterien:** Ein Slot-Wechsel erzeugt keinen 409-Idempotenzfehler. Eine
echte Wiederholung derselben Anfrage liefert weiterhin dieselbe Session.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-15] Explizit angeforderter Slot kann eine bestehende isolierte Session mitbenutzen

**Kategorie:** Logik / Preview-Isolation / Routing

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/previews/slots.ts:476-508` (`allocateSlots`, `requestedSlotId`)
- `apps/server/src/previews/slots.ts:470-474` (`findSharableSession` nur bei `!isolate`)
- `apps/server/src/previews/routing.ts:95-130` (`buildRoutingSnapshot`,
  `sessionId: null` bei mehreren Sessions)

**Betroffene Funktionen oder Komponenten:** `PreviewSlotService.allocateSlots`,
`buildRoutingSnapshot`, `assertSlotAccess`.

**Problembeschreibung:** Wenn `requestedSlotId` gesetzt ist, prüft `allocateSlots` nur:
- Slot ist nicht quarantäniert/resetting,
- Affinität erlaubt die Wiederverwendung,
- `slot.targetPort` ist `null`, gleich dem gewünschten Port, oder der Slot war zuvor
  Teil derselben Session.

Es wird **nicht** geprüft, ob der Slot bereits an eine andere Session gebunden ist.
Damit kann eine zweite Session mit `isolate: true` denselben Slot erhalten, wenn der
Zielport gleich ist. `findSharableSession` wird bei `isolate: true` bewusst
übersprungen. Im Routing-Snapshot entstehen zwei Sessions für denselben Slot; bei
unterschiedlichen Fingerprints wird `sessionId` auf `null` gesetzt. `assertSlotAccess`
überspringt bei `sessionId === null` die Token-Prüfung vollständig. Die Isolation, die
`isolate` verspricht, ist damit nicht gewährleistet.

**Technische Ursache:** Die Slot-Auswahl behandelt `requestedSlotId` als starken
Wunsch, ohne die bestehende Bindung zu berücksichtigen. Die Routing-Eindeutigkeit wird
erst später im Snapshot erkannt, aber nicht als Fehler behandelt.

**Auslöser:** Zwei Sessions mit gleichem Zielport, von denen eine `requestedSlotId`
explizit auf den belegten Slot setzt. Ein Deep-Link mit `?slot=` oder ein Retry nach
einer Slot-Empfehlung kann das auslösen.

**Beispielszenario:** Session A nutzt Slot 7 für Port 5173. Ein zweiter Tab öffnet eine
Preview mit `requestedSlotId: 7`, `targetPort: 5173`, `isolate: true` und demselben
Storage-Profil. Der Server bindet beide Sessions an Slot 7. Der Snapshot wählt eine
Session als Routing-Ziel; die andere sieht dieselbe Origin, aber ohne eindeutige
Session-ID und ohne Token-Prüfung. Lokale Speicher- und HMR-Zustände vermischen sich.

**Auswirkungen:** Verletzte Isolationserwartung, unklare Routing-Zuordnung, potenziell
falsche Dependency-Mappings. Der Token-Schutz greift in diesem Fall nicht.

**Warum es leicht übersehen wird:** Der Normalfall ohne `requestedSlotId` wählt freie
Slots und ist korrekt. Die Tests decken `isolate` und geteilte Sessions ohne expliziten
Slotwunsch ab. Der Konflikt entsteht erst durch die Kombination aus vorhandener Bindung
und explizitem Wunsch.

**Empfohlene Lösung:** Bei `requestedSlotId` zusätzlich prüfen:
- `!bound.has(requested)` oder der Slot gehört ausschließlich zur selben Session und
  besitzt denselben Binding-Fingerprint,
- `isolate` verbietet jede fremde Session grundsätzlich.
Wenn die Bedingung nicht erfüllt ist, mit `409 PREVIEW_SLOT_CHANGED` antworten und dem
Client einen freien Slot anbieten. Im Routing-Snapshot einen Konflikt als Fehler
behandeln, nicht still `sessionId: null` setzen.

**Betroffene Architekturentscheidungen:** Slot-Bindung und Routing-Snapshot müssen
dieselbe Eindeutigkeitsregel verwenden.

**Alternativen:** (a) `requestedSlotId` nur als Hinweis behandeln und bei Konflikt
ignorieren, (b) eine separate Slot-Lease pro Session, (c) Sharing grundsätzlich nur
ohne `isolate`. (a) ist weniger vorhersehbar, (b) ist ein größerer Umbau, (c) ist die
aktuelle Absicht und sollte konsequent erzwungen werden.

**Trade-offs:** Ein expliziter Slotwunsch kann abgelehnt werden; das ist besser als
eine stille Fehlzuordnung.

**Implementierungsschritte:**
1. In `allocateSlots` die Bindung und den Fingerprint prüfen.
2. `isolate: true` gegen jede andere Session sperren.
3. Im `buildRoutingSnapshot` bei mehreren Sessions einen Diagnosefehler erzeugen.
4. Tests mit zwei Sessions, gleichem Port, explizitem Slot und `isolate` true/false.

**Tests:** Test „isolate=true lehnt belegten requestedSlotId ab". Test „isolate=false
darf nur bei identischem Fingerprint teilen". Test „Routing-Snapshot bleibt eindeutig".

**Akzeptanzkriterien:** Ein Slot ist nie gleichzeitig zwei isolierten Sessions
zugeordnet. Bei nicht teilbaren Kontexten gibt es einen definierten 409 statt eines
mehrdeutigen Snapshots.

**Abhängigkeiten:** F-14 (Idempotenz/Fingerprint) sollte gemeinsam betrachtet werden.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-16] Ein belegter Preview-Slot-Port verhindert den Start der gesamten Workbench

**Kategorie:** Deployment / Stabilität / Fehlerbehandlung

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/previews/gateway.ts:637-646` (`start` bricht bei einem Fehler ab)
- `apps/server/src/app/lifecycle.ts:24-31` (Aufruf beim Start)
- `apps/server/src/app/buildApp.ts:20-55` (Startkette)
- `config/wrapt.example.json` (`previews.slotPorts`)

**Betroffene Funktionen oder Komponenten:** `PreviewGateway.start`,
`PreviewSlotService.startListeners`, `startBackgroundServices`.

**Problembeschreibung:** `PreviewGateway.start` bindet nacheinander alle 60
Slot-Listener. Scheitert ein einziger `listen()` (z. B. `EADDRINUSE` durch einen
verwaisten Prozess oder eine falsche Portkonfiguration), werden alle bereits
gebundenen Listener wieder geschlossen und der Fehler wird weitergereicht.
`startBackgroundServices` fängt ihn nicht ab. `buildApp` schlägt fehl, der Server
startet nicht. Die Workbench ist damit wegen eines Preview-Ports vollständig nicht
erreichbar.

**Technische Ursache:** Preview-Listener sind ein optionales Feature, werden aber wie
eine harte Startvoraussetzung behandelt. Es gibt keine teilweise Aktivierung und keine
sichtbare Diagnose im laufenden System.

**Auslöser:** Ein alter Wrapt-Prozess, ein manuell gestarteter Dienst oder ein
Preview-Devserver belegt einen der konfigurierten `slotPorts`; eine Portänderung in der
Config kollidiert mit einem anderen Dienst; ein Listener schlägt aus
Ressourcenmangel fehl.

**Beispielszenario:** Nach einem unsauberen Shutdown hält ein verwaister Prozess Port
3901. `wrapt.service` startet, bindet 3901 nicht, schließt die anderen 59 Listener und
beendet sich mit einem Fastify-Fehler. systemd startet den Dienst erneut, der Fehler
wiederholt sich. Die Workbench ist offline, obwohl nur ein Preview-Slot betroffen ist.

**Auswirkungen:** Vollständiger Ausfall der Workbench inklusive Terminal und Dateien.
Die Fehlermeldung steht nur im Journal, nicht in der UI.

**Warum es leicht übersehen wird:** Im Normalbetrieb sind die Ports frei. Die
Port-Kollisionsprüfung in `config/wrapt-config.ts` prüft nur die Konfiguration
untereinander, nicht belegte Prozesse. Tests binden freie Ports.

**Empfohlene Lösung:** Den Start robust machen:
- Listener einzeln binden; Fehler pro Slot sammeln.
- Mindestens einen Listener starten; fehlende Slots als `unavailable` im Status
  führen.
- Den Serverstart nicht abbrechen, solange Kernfunktionen verfügbar sind.
- Eine Diagnose „Slot X belegt durch Prozess Y" anzeigen.
- Optional einen Retry mit Backoff für fehlgeschlagene Slots.
Wenn ein kompletter Start ohne Slots nicht möglich ist, eine klare
Konfigurationsfehlermeldung mit Port und Prozess ausgeben, nicht nur einen Stacktrace.

**Betroffene Architekturentscheidungen:** Preview ist ein eigenständiger Dienst; sein
Ausfall sollte die Workbench nicht mitnehmen.

**Alternativen:** (a) Vor dem Start alle Ports prüfen und den Dienst mit einer
klaren Meldung beenden, (b) Slots dynamisch aus einem Pool vergeben, (c) Preview als
separaten Prozess starten. (a) ist eine minimale Verbesserung, (b) ist ein größerer
Umbau, (c) ist langfristig sauber.

**Trade-offs:** Ein teilweise verfügbares Preview-System ist besser als ein
Totalausfall, erfordert aber eine sichtbare Statusanzeige.

**Implementierungsschritte:**
1. `PreviewGateway.start` auf `Promise.allSettled` pro Listener umstellen.
2. Fehlgeschlagene Slots in `PreviewSlotService` als nicht verfügbar markieren.
3. `startBackgroundServices` darf bei Preview-Fehlern nur warnen.
4. Eine Diagnose in `/api/v1/system/operational-metrics` und im Doctor ergänzen.
5. Test mit einem absichtlich belegten Port.

**Tests:** Test „Start mit einem belegten Slot-Port startet die übrigen Listener und
die App". Test „Status zeigt den belegten Slot". Test „vollständig fehlende
Konfiguration liefert eine verständliche Meldung".

**Akzeptanzkriterien:** Ein einzelner belegter Preview-Port verhindert nicht den
Workbench-Start. Der betroffene Slot ist sichtbar nicht verfügbar. Die Ursache ist
diagnostizierbar.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Medium

**Risiko bei der Umsetzung:** Medium (teilweise gestartete Listener müssen sauber
aufgeräumt werden).

### [F-17] Restart-Dirty-Bestätigung kommt erst nach dem Neustart

**Kategorie:** UX / Datenverlust-Risiko / Ablauf

**Schweregrad:** Medium

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/web/src/components/SystemRestartControls.tsx:83-99`
- `apps/web/src/lib/reloadGuard.ts:1-14`

**Betroffene Funktionen oder Komponenten:** `useSystemRestart.run`, `RestartProgress`,
`editorsHaveUnsavedChanges`.

**Problembeschreibung:** `run` löst zuerst den Neustart aus, wartet auf den Abschluss
und prüft **danach** `editorsHaveUnsavedChanges()`. Erst wenn der Nutzer im
Bestätigungsdialog „Abbrechen" wählt, wird nur das automatische Reload verhindert. Der
Server und alle laufenden KI-Sitzungen sind zu diesem Zeitpunkt bereits neu gestartet.
Die Oberfläche bleibt auf dem alten Stand, die Terminals/Verbindungen können tot sein.
Der Dialog suggeriert eine Schutzmaßnahme, die tatsächlich zu spät kommt.

**Technische Ursache:** Die Dirty-Prüfung ist an den Reload gekoppelt, nicht an die
destruktive Aktion. Der Restart wird bereits mit `trigger()` gesendet, bevor der Guard
läuft.

**Auslöser:** Ein Nutzer klickt „Backend neu starten" oder „Beides", während eine
Notiz, ein Plugin oder ein Skill-Editor ungespeicherte Änderungen hat.

**Beispielszenario:** Ein Nutzer hat eine Notiz mit ungespeicherten Änderungen offen
und startet das Backend neu. Der Server beendet laufende Sitzungen. Nach dem Neustart
erscheint die Dirty-Warnung. Der Nutzer klickt „Abbrechen", um seine Arbeit zu retten,
aber die Sitzung ist bereits beendet; die Seite zeigt einen veralteten Stand.

**Auswirkungen:** Irreführende Sicherheit, möglicher Verlust von laufenden
KI-Sitzungen und Editorzuständen, Verwirrung über den tatsächlichen Serverzustand.

**Warum es leicht übersehen wird:** Der Dialog funktioniert im Test, weil dort der
Restart gemockt wird. Die Reihenfolge „Trigger → Warten → Guard" ist im Code nicht
sofort als Problem erkennbar.

**Empfohlene Lösung:** Die Dirty-Prüfung **vor** `trigger()` ausführen:
```
if (editorsHaveUnsavedChanges() && !confirmDirty()) { setPhase(idle); return; }
const response = await trigger();
...
if (result.ok) reload();
```
Zusätzlich sollte der Text klarstellen, dass ein Neustart laufende KI-Sitzungen
beendet, und die Bestätigung als echte Vorabprüfung formulieren. Ein optionaler
„Trotzdem fortfahren"-Dialog mit Liste der betroffenen Editoren wäre hilfreich.

**Betroffene Architekturentscheidungen:** Der Reload-Guard ist ein Client-Schutz; er
muss vor der destruktiven Aktion greifen, nicht danach.

**Alternativen:** (a) Kein Reload, nur Hinweis, (b) Restart in eine Warteschlange
legen, bis alle Editoren gespeichert sind, (c) automatisches Speichern erzwingen.
(a) ist zu schwach, (b) ist komplex, (c) kann fehlschlagen.

**Trade-offs:** Ein zusätzlicher Klick vor dem Neustart. Das ist für eine destruktive
Aktion angemessen.

**Implementierungsschritte:**
1. Guard vor `trigger()` verschieben.
2. Den Dialogtext und die Aktionen anpassen.
3. Test mit einem registrierten Dirty-Guard und gemocktem Restart.

**Tests:** Unit-Test „Restart wird bei ungespeicherten Änderungen und Abbruch nicht
ausgelöst". Test „nach Bestätigung wird der Restart ausgelöst". E2E-Test mit einer
Notiz mit ungespeichertem Inhalt.

**Akzeptanzkriterien:** Bei ungespeicherten Änderungen wird kein Restart-Request
gesendet, solange der Nutzer nicht bestätigt. Nach Abbruch bleibt der Serverzustand
unverändert.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-18] „Seite duplizieren“ ist eine mehrstufige Client-Operation ohne Rollback

**Kategorie:** Datenintegrität / UX / Fehlerbehandlung

**Schweregrad:** Low

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/web/src/components/notes/NotesWorkspace.tsx:126-154` (`handleDuplicate`)
- `apps/web/src/lib/apiClient/notes.ts` (`createNote`, `saveNoteContent`, `updateNote`)

**Betroffene Funktionen oder Komponenten:** `handleDuplicate`, Notiz-API.

**Problembeschreibung:** Duplizieren erzeugt zuerst eine neue Notiz, speichert dann
den Inhalt und setzt anschließend das Icon. Schlägt der Inhaltsspeicher oder das
Icon-Update fehl, bleibt die neue Notiz mit Titel, aber ohne vollständigen Inhalt
zurück. Ein Rollback oder eine Kompensation fehlt. Cover-Asset, Favorit, Sortierung und
Untergeordnete werden nicht mitkopiert; das ist teilweise beabsichtigt, aber der
Teilzustand wird nicht erklärt.

**Technische Ursache:** Drei separate HTTP-Aufrufe mit unterschiedlichen
Fehlerdomänen; der Client behandelt sie als eine Transaktion, obwohl der Server keine
Transaktion anbietet.

**Auslöser:** Netzwerkfehler zwischen den Aufrufen, Serverneustart, Revisionskonflikt
beim Inhalt oder ein ungültiges Icon. Auch ein sehr großer Inhalt kann am 2-MB-Limit
scheitern.

**Beispielszenario:** Der Nutzer dupliziert eine 1,8-MB-Notiz. `createNote` gelingt,
`saveNoteContent` scheitert am Body-Limit oder an einem kurzen Netzwerkfehler. Die
Liste zeigt eine neue „Kopie", die nur den Titel enthält. Der Nutzer muss sie manuell
löschen.

**Auswirkungen:** Verwirrende halbe Duplikate, zusätzliche Aufräumarbeit, mögliche
Verwechslung mit einer echten Notiz.

**Warum es leicht übersehen wird:** Der Erfolgsfall funktioniert; der Fehler wird nur
als allgemeine Meldung angezeigt. Es gibt keinen Test für einen Fehler zwischen den
Aufrufen.

**Empfohlene Lösung:** Entweder einen serverseitigen `POST /notes/:id/duplicate`-Endpunkt
mit einer Transaktion anbieten (empfohlen) oder im Client bei einem Fehler die bereits
erstellte Notiz wieder archivieren/löschen und den Fehler klar melden. Metadaten, die
kopiert werden sollen, explizit definieren und dokumentieren.

**Betroffene Architekturentscheidungen:** Notiz-Erstellung und Inhaltsspeicherung sind
getrennte Endpunkte; für eine Kopie ist eine atomare Serveroperation sinnvoll.

**Alternativen:** (a) Client-Rollback, (b) serverseitige Transaktion, (c) Duplizieren
nur als leere Seite anbieten. (a) ist einfach, aber nicht atomar bei Netzwerkabbruch;
(b) ist robust; (c) ist eine UX-Verschlechterung.

**Trade-offs:** Ein neuer Endpunkt und Contract. Dafür keine halben Kopien.

**Implementierungsschritte:**
1. Contract und Route für `duplicate` definieren.
2. Serverseitig in einer Transaktion kopieren: Inhalt, Icon, Cover, relevante
   Metadaten; Untergeordnete bewusst nicht oder optional.
3. Client auf den neuen Endpunkt umstellen; bei Fehler keine lokale Teilkopie.
4. Tests mit großem Inhalt und erzwungenem Fehler.

**Tests:** API-Test „Duplizieren ist atomar". Client-Test „Fehler erzeugt keine
sichtbare halbe Kopie". E2E-Test mit großer Notiz.

**Akzeptanzkriterien:** Nach einem fehlgeschlagenen Duplizieren existiert keine
unvollständige Kopie. Die Kopie enthält die dokumentierten Felder vollständig.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-19] Notizliste, Suche und Backlinks skalieren linear mit allen Inhalten

**Kategorie:** Performance / Skalierung

**Schweregrad:** Low

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/notes/database.ts:135-141` (`list` ohne Limit)
- `apps/server/src/notes/database.ts:143-174` (`search` lädt alle Treffer inkl.
  `content`)
- `apps/server/src/notes/knowledge.ts:27-34` (`history`, `backlinks` über alle Notizen)

**Betroffene Funktionen oder Komponenten:** `NotesDatabase.list/search`,
`NoteKnowledgeDatabase.backlinks/history`, `NotesWorkspace`, `NoteKnowledgePanel`.

**Problembeschreibung:** `list()` liefert alle Notizen ohne Pagination. `search()` lädt
alle nicht archivierten Notizen inklusive vollständigem Markdown in den Speicher und
rankt sie in JavaScript. `backlinks()` durchläuft bei jedem Öffnen des
Eigenschaftenpanels alle aktiven Notizen und führt einen regulären Ausdruck auf dem
gesamten Inhalt aus. Es gibt keine Obergrenze, keinen Index für Volltext und keine
Inkrementalisierung.

**Technische Ursache:** Die Datenmengen wurden für den Einzelbenutzer mit wenigen
Notizen ausgelegt. SQLite-FTS oder eine excerpt-basierte Suche existieren bereits
teilweise (`excerpt`), werden aber nicht für die Suche genutzt. `backlinks` ist eine
lineare In-Memory-Suche.

**Auslöser:** Viele Notizen (z. B. 2.000), große Inhalte, oder häufiges Öffnen des
Eigenschaftenpanels. Die Suche kann den Event-Loop blockieren, weil sie synchron im
Request läuft.

**Beispielszenario:** Ein Nutzer importiert 1.000 Notizen mit jeweils 100 KB. Die
Seitenleiste lädt alle Summaries, die Suche lädt bei jedem Tastendruck alle Inhalte,
und das Eigenschaftenpanel scannt alle 100 MB. Die UI fühlt sich träge an; andere
Requests warten, weil der Node-Event-Loop blockiert ist.

**Auswirkungen:** Langsame Suche, hoher Speicherverbrauch, blockierte HTTP-/WebSocket-
Verarbeitung. Bei weiterem Wachstum kann die Workbench unbenutzbar werden.

**Warum es leicht übersehen wird:** Die vorhandene Excerpt-Spalte und die
Revisionssuche wirken wie eine Optimierung; die Suche nutzt sie aber nicht. Tests
verwenden wenige Notizen.

**Empfohlene Lösung:** 
1. `list()` paginieren (z. B. 200 Einträge) oder zumindest eine harte Obergrenze
   einführen; die UI lädt weitere Seiten.
2. Suche auf SQLite-FTS5 oder auf `excerpt` + Titel begrenzen; bei Bedarf
   inkrementell nachladen.
3. Backlinks beim Speichern pflegen (Tabelle `note_backlinks`) statt bei jedem Lesen
   alle Inhalte zu scannen.
4. Verlauf nur bei Bedarf laden (bereits `history` pro Notiz, aber ohne Limit).
5. Ergebnisse und Scans mit einem Zeitbudget versehen.

**Betroffene Architekturentscheidungen:** Notizen sind derzeit „kleine lokale Daten";
die Importfunktion erlaubt aber 1.000 Seiten. Die Architektur muss diese Grenze
respektieren.

**Alternativen:** (a) Nur Excerpt-Suche, (b) FTS5, (c) externe Suchindexierung.
(a) ist einfach, aber weniger genau; (b) ist naheliegend; (c) ist für Einzelbenutzer
überdimensioniert.

**Trade-offs:** FTS5 benötigt Schema-/Migration und Synchronisation. Eine
Backlink-Tabelle benötigt Pflege bei Inhaltsänderungen.

**Implementierungsschritte:**
1. Messwerte für `list`, `search`, `backlinks` mit 1.000 Notizen erheben.
2. FTS5-Tabelle und Trigger oder explizite Pflege einführen.
3. Backlink-Tabelle und Pflege beim Speichern.
4. Pagination im Contract und in der UI ergänzen.
5. Tests mit großen Bibliotheken.

**Tests:** Performance-Test mit 1.000 Notizen à 100 KB; Suche unter 200 ms, Liste
unter 100 ms. Backlink-Aktualisierung nach Inhaltsänderung. Pagination-Test.

**Akzeptanzkriterien:** Keine Notiz-Operation lädt alle vollständigen Inhalte
unbeschränkt. Die Suche bleibt bei 1.000 Notizen reaktionsschnell. Backlinks sind
aktuell, ohne alle Notizen zu scannen.

**Abhängigkeiten:** F-01 (Verlaufsspeicher) sollte vorher oder gleichzeitig angegangen
werden.

**Geschätzter Umfang:** Medium

**Risiko bei der Umsetzung:** Medium (FTS-Migration und Backlink-Konsistenz).

### [F-20] Nutzungsprojekte werden über den Basisnamen vermischt

**Kategorie:** Datenintegrität / Berechnung / UX

**Schweregrad:** Low

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/usage/database.ts:18-22` (`projectKeyBasename`)
- `apps/server/src/usage/database.ts:196-221` (Aggregation `projectsByName`)

**Betroffene Funktionen oder Komponenten:** `UsageDatabase.dashboard`,
`projectKeyBasename`.

**Problembeschreibung:** Projektzeilen aus CodexBar und OpenCode werden über den
Basisnamen des Pfads zusammengefasst. Zwei unterschiedliche Projekte mit gleichem
Ordnernamen (z. B. `/kunde-a/app` und `/kunde-b/app`) landen in einer Zeile. Tokens und
Kosten werden addiert, der angezeigte Name stammt von der Zeile mit den meisten Tokens.
Die Zuordnung ist damit falsch, obwohl die Datenbank die vollständigen Pfade kennt.

**Technische Ursache:** Die Normalisierung wurde eingeführt, um denselben Projektnamen
über Provider hinweg zu vereinheitlichen. Sie verwendet aber nur den letzten
Pfadbestandteil und hat keine Kollisionsprüfung.

**Auslöser:** Zwei Projekte mit gleichem Verzeichnisnamen unter verschiedenen Eltern-
pfaden, oder ein Projekt, das in zwei Providern mit unterschiedlicher Pfadschreibweise
auftaucht.

**Beispielszenario:** Zwei Kundenprojekte heißen beide `web`. Die Nutzungsübersicht
zeigt ein einziges `web` mit der Summe beider Kosten. Der Nutzer kann nicht erkennen,
welcher Kunde wie viel verbraucht hat.

**Auswirkungen:** Falsche Kosten- und Tokenzuordnung, falsche Projekt-Rankings,
möglicherweise falsche Entscheidungen über Limits.

**Warum es leicht übersehen wird:** Die Normalisierung ist als bewusste
Provider-Zusammenführung dokumentiert. Kollisionen sind bei wenigen Projekten selten.

**Empfohlene Lösung:** Den vollständigen kanonischen Pfad als Schlüssel verwenden und
für die Anzeige eine separate, kollisionssichere Beschriftung bilden (z. B.
`kunde-a/app`). Optional eine Alias-Tabelle für bewusst zusammengehörige Pfade
anbieten. Bei der Aggregation Provider nur zusammenführen, wenn der Pfad exakt gleich
ist.

**Betroffene Architekturentscheidungen:** Projektidentität in der Nutzung sollte
derselben kanonischen Pfadidentität folgen wie der Projekt-Service.

**Alternativen:** (a) Nur Namen anzeigen, aber nicht aggregieren, (b) vollständige
Pfade immer anzeigen, (c) Alias-Konfiguration. (a) ist unübersichtlich, (b) ist
einfach und korrekt, (c) ist komfortabel, aber mehr Aufwand.

**Trade-offs:** Längere Anzeigenamen; dafür korrekte Zahlen.

**Implementierungsschritte:**
1. Aggregationsschlüssel auf den normalisierten vollständigen Pfad umstellen.
2. Anzeigenamen aus Eltern-/Projektname bilden, bei Kollision den Elternpfad ergänzen.
3. Tests mit zwei gleichen Basisnamen.

**Tests:** Unit-Test mit `/a/web` und `/b/web`; erwartet zwei Zeilen. Test mit
identischem Pfad über zwei Provider; erwartet eine Zeile.

**Akzeptanzkriterien:** Unterschiedliche Projekte mit gleichem Basisnamen werden nicht
vermischt. Gleiche Pfade über Provider hinweg werden weiterhin zusammengeführt.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-21] Preview-Kapazitätsvorschau zählt fremde Affinitäten als wiederverwendbar

**Kategorie:** Logik / UX / Preview

**Schweregrad:** Low

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/previews/slots.ts:293-307` (`capacity`)
- `apps/server/src/previews/slots.ts:460-468` (`usable`/`mayReuseSlot`)

**Betroffene Funktionen oder Komponenten:** `PreviewSlotService.capacity`,
`PreviewSessionCapacity`, Service-Graph-UI.

**Problembeschreibung:** `capacity` zählt einen Slot als wiederverwendbar, wenn sein
`targetPort` in den gewünschten Ports liegt und er nicht quarantäniert ist. Die
Storage-Affinität und der Eigentümer werden nicht geprüft. Ein fremder Slot mit
gleichem Port wird daher als verfügbar gemeldet, obwohl `openSession` ihn wegen
`mayReuseSlot` ablehnt. Die UI kann „fits: true" anzeigen, der anschließende Start
scheitert aber mit `PREVIEW_SLOTS_EXHAUSTED`.

**Technische Ursache:** Die Vorschau kennt keinen Benutzer/Eigentümer und verwendet
eine andere Regel als die tatsächliche Slot-Allokation.

**Auslöser:** Ein freier Slot mit fremder Storage-Affinität und gleichem Zielport; der
Nutzer speichert einen Service-Graphen und startet danach die Preview.

**Beispielszenario:** Projekt A hat Slot 3 für Port 5173 freigegeben, die Affinität
bleibt bestehen. Projekt B möchte ebenfalls Port 5173 nutzen. Die Kapazitätsvorschau
zählt Slot 3 als wiederverwendbar und meldet „passt". Beim Start wird Slot 3 wegen der
fremden Affinität abgelehnt.

**Auswirkungen:** Irreführende Kapazitätsanzeige, unnötige Fehlversuche, mögliche
Recovery-Schleife.

**Warum es leicht übersehen wird:** Die Vorschau ist eine reine Zählung; die
Affinitätslogik liegt in einer anderen Methode. Tests prüfen die Grundzählung, nicht
die Eigentümerdimension.

**Empfohlene Lösung:** `capacity` um einen optionalen Benutzer/Eigentümer erweitern und
dieselbe `usable`-Regel wie `allocateSlots` verwenden. Fremde Affinitäten als
„nicht wiederverwendbar" zählen, aber als „belegt" anzeigen. Alternativ die Vorschau
serverseitig aus derselben Allokationsfunktion ableiten.

**Betroffene Architekturentscheidungen:** Kapazitätsvorschau und Allokation müssen
dieselbe Regel verwenden.

**Alternativen:** (a) Vorschau entfernen, (b) nur freie Slots zählen, (c) eine
Trockenlauf-Allokation anbieten. (a) verschlechtert die UX, (b) ist konservativ, (c)
ist am genauesten.

**Trade-offs:** Eine konservative Vorschau kann weniger Optimismus zeigen; das ist
besser als ein Fehlstart.

**Implementierungsschritte:**
1. `capacity` mit `userId`/`ownerKey` aufrufen.
2. `mayReuseSlot` für jeden Kandidaten anwenden.
3. Tests mit eigener/fremder Affinität und Quarantäne.

**Tests:** Unit-Test „fremde Affinität wird nicht als wiederverwendbar gezählt". Test
„eigene Affinität bleibt wiederverwendbar". Test „Quarantäne zählt nicht".

**Akzeptanzkriterien:** Die Vorschau meldet nur Slots, die der aktuelle Nutzer
tatsächlich verwenden kann. `fits` stimmt mit dem nachfolgenden `openSession` überein.

**Abhängigkeiten:** F-03 (Eigentümerdimension) ist Voraussetzung für eine vollständige
Lösung.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-22] Skill-Editor prüft Zeichen statt Bytes

**Kategorie:** Validierung / Edge Case

**Schweregrad:** Low

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/skills/skillEditorFiles.ts:204-215` (`writeFile`)
- `apps/server/src/skills/skillEditorFiles.ts:165-176` (`readFile` prüft Bytes)
- `apps/server/src/config/settings.ts` (`skillEditor.maxFileBytes`)

**Betroffene Funktionen oder Komponenten:** `SkillFileStore.writeFile`,
`SkillFileStore.readFile`.

**Problembeschreibung:** `writeFile` prüft `input.content.length` (UTF-16-Zeichen)
gegen `maxFileBytes` (Bytes). Ein Text mit vielen Umlauten, Emojis oder CJK-Zeichen
kann die Byte-Grenze überschreiten, obwohl die Zeichenanzahl unter dem Limit liegt.
Die Datei wird geschrieben; beim nächsten Öffnen lehnt `readFile` sie mit
`SKILLS_FILE_TOO_LARGE` ab. Der Editor hat dann eine Datei gespeichert, die er nicht
mehr öffnen kann.

**Technische Ursache:** `.length` ist keine Byte-Länge. Der Lese pfad verwendet
`details.size` (Bytes), der Schreibpfad nicht.

**Auslöser:** Mehrbyte-Inhalte nahe der konfigurierten Grenze, z. B. ein langer
deutscher Text mit vielen Umlauten oder ein Markdown-Dokument mit Emojis.

**Beispielszenario:** Das Limit beträgt 64 KB. Der Nutzer speichert 60.000 Zeichen mit
vier Byte pro Zeichen. Die Datei ist 240 KB groß, wird aber akzeptiert. Beim nächsten
Öffnen erscheint „Datei zu groß für den Editor".

**Auswirkungen:** Inkonsistenter Editorzustand, nicht mehr bearbeitbare Datei,
möglicher Datenverlust, wenn der Nutzer die Datei extern reparieren muss.

**Warum es leicht übersehen wird:** ASCII-Tests bestehen; `.length` wirkt wie eine
Größenprüfung. Der Unterschied zwischen Zeichen und Bytes ist bei UTF-8 leicht zu
übersehen.

**Empfohlene Lösung:** `Buffer.byteLength(input.content, "utf8")` verwenden und
denselben Wert im Fehlerdetails-Feld ausgeben. Zusätzlich die Grenze im Client
spiegeln, damit der Save frühzeitig blockiert wird.

**Betroffene Architekturentscheidungen:** Keine.

**Alternativen:** Limit in Zeichen statt Bytes definieren (weniger konsistent mit
Dateigrößen); keine.

**Trade-offs:** Keine nennenswerten.

**Implementierungsschritte:**
1. Byte-Prüfung einbauen.
2. Test mit Mehrbyte-Inhalt.
3. Client-Hinweis anpassen.

**Tests:** Test mit `"ä".repeat(limit)` und einem Emoji; erwartet 413. Test mit
ASCII-Inhalt unter dem Limit; erwartet Erfolg.

**Akzeptanzkriterien:** Keine Datei kann über den Skill-Editor geschrieben werden, die
anschließend wegen ihrer Bytegröße nicht mehr gelesen werden kann.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-23] Settings-Sync blockiert nach einem 4xx dauerhaft alle weiteren Änderungen

**Kategorie:** Fehlerbehandlung / UX / Datenintegrität

**Schweregrad:** Low

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/web/src/lib/settingsSync/engine.ts:210-221` (`pushPending` Catch)
- `apps/web/src/lib/settingsSync/engine.ts:219-221` (`pushBlocked`)

**Betroffene Funktionen oder Komponenten:** `createSettingsSync.pushPending`,
`pending`/`meta.pending`.

**Problembeschreibung:** Jeder 4xx-Fehler setzt `pushBlocked = true`. Danach werden
keine weiteren Einstellungsänderungen mehr gesendet, auch wenn sie nichts mit der
fehlerhaften Änderung zu tun haben. Es gibt keine sichtbare Fehlermeldung und keinen
Reset außer einem vollständigen Reload. Der lokale Wert bleibt im `localStorage`, aber
andere Geräte erhalten ihn nicht. Ein einzelner 413 (zu großes Layout) oder ein
Schemafehler blockiert damit die gesamte Einstellungssynchronisation.

**Technische Ursache:** 4xx wird pauschal als „nicht wiederholbar" behandelt. Das ist
für einen dauerhaften Validierungsfehler richtig, aber der gesamte Batch wird
blockiert; außerdem fehlt die Nutzerinformation.

**Auslöser:** Eine einzelne Einstellung überschreitet `maxValueBytes` oder das
Gesamtdokument `maxDocumentBytes`; ein älterer Client sendet einen unbekannten
Schlüssel; ein serverseitiger Schemafehler.

**Beispielszenario:** Ein großes Layout-Dokument überschreitet 512 KB. Der Server
antwortet 413. Der Client blockiert. Der Nutzer ändert danach die Akzentfarbe; sie wird
lokal angezeigt, aber nie auf ein anderes Gerät synchronisiert. Nach einem Reload
funktioniert es wieder, bis der nächste 413 auftritt.

**Auswirkungen:** Stille Divergenz zwischen Geräten, verwirrende „Einstellung wird
nicht übernommen"-Erfahrung.

**Warum es leicht übersehen wird:** Der Fehler ist selten; die meisten Einstellungen
sind klein. Der Client loggt nichts und zeigt keinen Fehler.

**Empfohlene Lösung:** 4xx differenzieren:
- 409: Konflikt/Rebase, erneut versuchen.
- 413: die betroffene Einstellung aus dem Batch entfernen, Fehler sichtbar melden,
  übrige Änderungen weiter senden.
- 400/422: ungültigen Schlüssel/Wert isolieren, nicht den ganzen Sync blockieren.
Zusätzlich einen sichtbaren Sync-Fehlerzustand und einen „Erneut versuchen"-Knopf
anbieten. `pending` muss nach einem dauerhaften Fehler bereinigt oder als blockiert
markiert werden, damit die UI nicht endlos „ausstehend" zeigt.

**Betroffene Architekturentscheidungen:** Der Settings-Sync ist ein Best-Effort-Kanal;
ein einzelner Fehler darf nicht alle Einstellungen blockieren.

**Alternativen:** (a) Nur 413 isolieren, (b) alle 4xx weiterhin blockieren, aber
sichtbar machen, (c) Einstellungen einzeln senden. (a) ist minimal, (b) ist ehrlicher,
(c) erhöht die Request-Zahl.

**Trade-offs:** Mehr Fehlerbehandlung im Client; dafür bleibt die Synchronisation
funktionsfähig.

**Implementierungsschritte:**
1. Fehler nach Status/Betrag klassifizieren.
2. Die fehlerhafte Änderung aus `pending` entfernen und den Fehler melden.
3. Restliche Änderungen weiter senden.
4. Einen sichtbaren Sync-Status in den Einstellungen ergänzen.
5. Tests mit einem 413 und einer zweiten gültigen Änderung.

**Tests:** Unit-Test „413 blockiert andere Einstellungen nicht". Test „409 wird
erneut versucht". Test „sichtbarer Fehlerzustand".

**Akzeptanzkriterien:** Ein einzelner ungültiger Wert verhindert nicht die
Synchronisation der übrigen Einstellungen. Der Nutzer sieht, welche Einstellung
abgelehnt wurde.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-24] Preview-Deeplink verändert den gespeicherten Hauptport und ignoriert Fehler

**Kategorie:** Logik / UX / Preview

**Schweregrad:** Low

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/web/src/views/PreviewHubProject.tsx:95-105`
- `apps/web/src/views/PreviewHubProject.tsx:180-210` (`openDirect`)
- `apps/server/src/previews/DevServerManager.ts:270-305` (`saveMainPort`)

**Betroffene Funktionen oder Komponenten:** `PreviewHubProject`,
`savePreviewDevServerMainPort`, `openDirect`.

**Problembeschreibung:** Beim Öffnen eines Deeplinks `?preview=<id>` mit einem Ziel,
das nicht der aktuelle Hauptport ist, ruft die Komponente automatisch
`savePreviewDevServerMainPort` auf. Das verändert eine **persistierte globale
Präferenz** allein durch das Ansehen einer URL. Der Promise hat keinen `.catch`;
schlägt der Aufruf fehl (z. B. Port nicht in `allowedProjectPorts` oder Dienst nicht
erkannt), entsteht eine unbehandelte Rejection. `configuredPreviewApplied` verhindert
einen erneuten Versuch für dieselbe Auswahl. `openDirect` prüft `existingPublicUrl`
nur, wenn `status.mainPort === targetPort`; bei einer fehlgeschlagenen
Präferenzänderung wird die Preview über den alten Hauptslot geöffnet und der
Zielpfad angehängt.

**Technische Ursache:** „Ausgewähltes Preview-Ziel" und „persistierter Hauptdienst"
werden vermischt. Die URL-Auswahl ist flüchtig, die Hauptport-Änderung dauerhaft.

**Auslöser:** Deeplink auf eine konfigurierte Preview, die nicht der aktuelle
Hauptport ist; Dienst nicht in der erkannten Laufzeit; Serverfehler beim Speichern;
gleichzeitige Änderung auf einem anderen Gerät.

**Beispielszenario:** Ein Projekt hat die Hauptpreview auf 5173 und eine zweite
konfigurierte Preview auf 4173. Ein Link `?preview=docs` zeigt auf 4173. Beim Öffnen
wird der Hauptport auf 4173 geändert. Der Nutzer wollte nur die Docs-Preview ansehen,
aber die Standard-Preview ist jetzt dauerhaft 4173. Wenn der Save fehlschlägt, öffnet
sich außerdem die 5173-Slot-URL mit dem Docs-Pfad und zeigt die falsche Anwendung.

**Auswirkungen:** Unerwartete Konfigurationsänderung, falsche Preview-Inhalte,
unhandled Promise Rejection im Browser.

**Warum es leicht übersehen wird:** Im Erfolgsfall sieht es wie eine praktische
Automatisierung aus. Die Fehlerbehandlung fehlt; der `configuredPreviewApplied`-Ref
verdeckt Wiederholungen.

**Empfohlene Lösung:** Das ausgewählte Preview-Ziel getrennt vom Hauptport behandeln:
- `saveMainPort` nur auf ausdrückliche Nutzeraktion im „Hauptziel"-Menü.
- Für ein Preview-Ziel die passende Slot-Session direkt öffnen (ggf. eigener
  Session-Key/Port), ohne die globale Präferenz zu ändern.
- `.catch` ergänzen und den Fehler sichtbar machen.
- `openDirect` darf nur dann die Hauptslot-URL verwenden, wenn das Ziel tatsächlich
  der Hauptdienst ist; sonst muss eine eigene Session/Slot-Veröffentlichung erfolgen.

**Betroffene Architekturentscheidungen:** Hauptdienst-Präferenz und Preview-Ziel sind
verschiedene Konzepte.

**Alternativen:** (a) Hauptport bei Deeplink nur temporär überschreiben, (b) separate
Session pro konfigurierter Preview, (c) Deeplink nur erlauben, wenn das Ziel bereits
Hauptport ist. (a) ist verwirrend, (b) ist sauber, (c) ist restriktiv.

**Trade-offs:** Mehr Sessions/Slots für mehrere konfigurierte Previews; dafür keine
stille Änderung der Standardkonfiguration.

**Implementierungsschritte:**
1. Die automatische `saveMainPort`-Mutation aus dem Auswahl-Effekt entfernen.
2. Ein eigenes Preview-Ziel mit eigenem Session-Key öffnen.
3. Fehlerbehandlung ergänzen.
4. Tests mit zwei konfigurierten Previews und einem fehlschlagenden Save.

**Tests:** UI-Test „Deeplink ändert den Hauptport nicht". Test „Fehler beim Öffnen
zeigt eine Meldung". E2E-Test mit zwei Previews.

**Akzeptanzkriterien:** Das Ansehen eines Deeplinks verändert keine persistierte
Hauptport-Präferenz. Das ausgewählte Ziel wird korrekt geöffnet. Fehler sind sichtbar.

**Abhängigkeiten:** F-13 (Hauptport-Fallback) sollte vorher oder gleichzeitig
korrigiert werden.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Medium (mehrere Preview-Ziele und Slots müssen sauber
getrennt werden).

### [F-25] Der File-Length-Gate scheitert lokal an gitignorierter Config und prüft Audit-Dateien

**Kategorie:** Tooling / Developer Experience / CI-Konsistenz

**Schweregrad:** Informational

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `scripts/architecture/check-file-lines.mjs:21-31` (`SOURCE_EXTENSIONS` enthält
  `.json`, `.md`; `IGNORED_DIRECTORIES` enthält weder `config/*.local.json` noch
  `audits`)
- `scripts/architecture/check-file-lines.mjs:98-124` (`walk`)
- `config/wrapt.local.json` (412 Zeilen, gitignoriert)
- `audits/overall/OVERALL_AUDIT_2026-11-18.md` (dieser Bericht)

**Betroffene Funktionen oder Komponenten:** `pnpm architecture:file-lines`,
`AGENTS.md`-Abschlussregel, Audit-Ordner.

**Problembeschreibung:** Der Checker zählt alle `.json`-, `.md`- und `.ts`-Dateien
unterhalb des Repositories. `config/wrapt.local.json` ist gitignoriert, wird aber
lokal mitgezählt und hat derzeit 412 Zeilen. `pnpm architecture:file-lines` schlägt
deshalb lokal fehl, obwohl die CI auf einem frischen Checkout ohne diese Datei
erfolgreich ist. Gleichzeitig ignoriert der Checker den Ordner `audits/` nicht; die
vorgeschriebene Auditdatei überschreitet 400 Zeilen und würde den Gate nach dem
Schreiben ebenfalls brechen. Damit ist die in `AGENTS.md` geforderte Abschlussprüfung
für Audit-Läufe nicht sauber erfüllbar.

**Technische Ursache:** Die Ignore-Liste enthält `plans`, `memory`, `handoffs`, aber
nicht `audits` und keine lokalen Config-Varianten. Die Regel „nur Projektdateien" wird
über Dateiendungen, nicht über Git-Tracking oder fachliche Verzeichnisse entschieden.

**Auslöser:** Jeder lokale Lauf mit einer ausgefüllten `wrapt.local.json`; jeder
Audit-Lauf, der eine längere Markdown-Datei unter `audits/` erzeugt.

**Beispielszenario:** Ein Agent führt vor dem Abschluss `pnpm architecture:file-lines`
aus und erhält einen Fehler für eine Datei, die gar nicht im Repository liegt. Ein
zweiter Lauf nach dem Schreiben des Auditberichts scheitert zusätzlich am Bericht
selbst.

**Auswirkungen:** Falsche negative Gates, Zeitverlust, Agents umgehen die Prüfung
oder ändern die Baseline. Der Auditbericht kann nicht gleichzeitig die Prüfung
bestehen.

**Warum es leicht übersehen wird:** In CI fehlt die lokale Config, daher ist der
Fehler dort unsichtbar. Auditdateien werden normalerweise nicht versioniert.

**Empfohlene Lösung:** `audits/**` und `config/*.local.json` in
`IGNORED_DIRECTORIES`/`IGNORED_FILES` aufnehmen (oder den Checker auf getrackte
Dateien beschränken). Die Baseline nicht für Audit-Artefakte erweitern. Zusätzlich
eine kurze Doku in `AGENTS.md` ergänzen, dass Auditberichte nicht Teil des
Source-Gates sind.

**Betroffene Architekturentscheidungen:** Qualitätsgates sollten nur versionierte,
fachliche Projektdateien prüfen.

**Alternativen:** (a) Audit unter `docs/audits` mit Ausnahme, (b) `WRAPT_FILE_LINES_ROOT`
auf ein temporäres Verzeichnis, (c) den Checker auf Git-Tracking umstellen. (a)
verschiebt das Problem, (b) ist ein Workaround, (c) ist langfristig korrekt.

**Trade-offs:** Eine kleine Ausnahme mehr im Checker; dafür reproduzierbare lokale
Gates.

**Implementierungsschritte:**
1. `audits` und lokale Config-Dateien ignorieren.
2. Die Änderung mit einem Testfall für eine lange Datei in `audits/` absichern.
3. `AGENTS.md` präzisieren.

**Tests:** Checker-Test mit einer 500-Zeilen-Datei unter `audits/` (muss ignoriert
werden). Checker-Test mit einer 500-Zeilen-Projektdatei (muss fehlschlagen).

**Akzeptanzkriterien:** `pnpm architecture:file-lines` ist auf einem normalen
Entwicklerrechner mit lokaler Config und mit vorhandenem Auditbericht erfolgreich,
solange die echten Projektdateien die Grenze einhalten.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

### [F-26] Hermes-Chat verarbeitet Nachrichten pro Socket ohne Reihenfolge

**Kategorie:** Logik / Race Condition / Hermes

**Schweregrad:** Informational

**Sicherheit der Einschätzung:** Needs Verification

**Betroffene Dateien:**
- `apps/server/src/hermes/routes.ts:105-166`
- `apps/server/src/hermes/acp/Manager.ts` (Session-/Approval-Zustand)

**Betroffene Funktionen oder Komponenten:** `/hermes/chat` WebSocket-Handler,
`HermesAcpManager`.

**Problembeschreibung:** Jede eingehende WebSocket-Nachricht startet eine eigene
asynchrone IIFE. `session.create` und `session.attach` awaiten, bevor `sessionId`
endgültig gesetzt ist (bei `attach` wird sie vor dem Await gesetzt, bei `create`
danach). Nachfolgende Nachrichten können parallel laufen und denselben Manager
gleichzeitig aufrufen. Ein `message.send` kann theoretisch vor dem Abschluss von
`session.attach` verarbeitet werden oder mit einem `task.cancel`/`approval.respond`
verschränkt werden. Anders als der Terminal-Socket gibt es keine Queue pro Socket.

**Technische Ursache:** Der Handler ist als „eine Nachricht = ein Promise" gebaut. Die
WebSocket-Reihenfolge garantiert nur die Zustellung, nicht die Reihenfolge der
asynchronen Verarbeitung.

**Auslöser:** Schnelle Nachrichten, ein Reconnect mit `attach` und direkt folgendem
`send`, oder ein Client, der die `session.ready`-Antwort nicht abwartet.

**Beispielszenario:** Nach einem Reconnect sendet der Client `session.attach` und
sofort `message.send`. Der Attach-Vorgang lädt die Historie; `message.send` sieht
`sessionId` bereits gesetzt (bei attach) und ruft `manager.prompt` auf, während die
Historie noch geladen wird. Je nach Manager-Implementierung entsteht eine falsche
Reihenfolge oder ein Konflikt.

**Auswirkungen:** Verlorene oder doppelt gesendete Nachrichten, falsche
Approval-Zuordnung, schwer reproduzierbare Hermes-Fehler.

**Warum es leicht übersehen wird:** Der normale Client wartet auf `session.ready`.
WebSocket-Tests senden oft sequenziell. Der Terminal-Socket hat bereits eine
vorbildliche Queue, die hier fehlt.

**Empfohlene Lösung:** Pro Socket eine Promise-Kette wie in `terminal/routes.ts`
(`messageQueues`) einführen. Jede Nachricht wird erst verarbeitet, wenn die vorherige
abgeschlossen ist. `session.create`/`attach` setzen `sessionId` vor dem Await oder
sperren nachfolgende `send`-Nachrichten, bis `session.ready` bestätigt wurde.

**Betroffene Architekturentscheidungen:** Ein Socket ist ein geordneter Kanal; die
Verarbeitung sollte diese Ordnung respektieren.

**Alternativen:** (a) Client wartet strikt auf `ready`, (b) eine zentrale
`AsyncQueue` pro Socket, (c) Server lehnt Nachrichten während des Attach ab. (a) ist
fragil, (b) ist robust, (c) ist eine gute zusätzliche Absicherung.

**Trade-offs:** Etwas Latenz bei mehreren gleichzeitigen Nachrichten; dafür
deterministische Reihenfolge.

**Implementierungsschritte:**
1. Eine `queue`-Promise pro Socket anlegen.
2. Jede Nachricht in die Kette einreihen.
3. `session.create/attach` als Barriere behandeln.
4. Test mit verzögertem Attach und sofortigem Send.

**Tests:** WebSocket-Test „send vor ready wird abgelehnt oder wartet". Test
„zwei sends werden in Reihenfolge verarbeitet". Test „Reconnect mit attach+send".

**Akzeptanzkriterien:** Nachrichten werden pro Socket in Empfangsreihenfolge
verarbeitet. Ein `message.send` vor `session.ready` kann keinen halb initialisierten
Zustand sehen.

**Abhängigkeiten:** Keine, aber ein Hermes-Manager-Test ist nötig.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Medium (Hermes-ACP-Zustand ist komplex; Verhalten muss
mit echten Sitzungen verifiziert werden).

### [F-27] Audit-Hashkette wird nach Retention als vollständig gültig gemeldet

**Kategorie:** Observability / Datenintegrität / Dokumentation

**Schweregrad:** Informational

**Sicherheit der Einschätzung:** Confirmed

**Betroffene Dateien:**
- `apps/server/src/observability/audit.ts:64-68` (Prune auf 10.000 Einträge)
- `apps/server/src/observability/audit-verification.mjs:20-38` (Prüfung beginnt bei
  `entries === 0` ohne Genesis-Prüfung)

**Betroffene Funktionen oder Komponenten:** `OperationalAuditDatabase`,
`verifyAuditDatabase`, `AuditVerifier`.

**Problembeschreibung:** Die Audit-Tabelle behält absichtlich nur die letzten 10.000
Einträge. Der Verifier prüft die Hashkette ab dem ersten **vorhandenen** Eintrag und
akzeptiert dessen `previous_hash`, ohne zu prüfen, ob er auf einen entfernten Eintrag
zeigt. Nach einer Retention ist die Kette daher formal „valid", obwohl die ältere
Historie fehlt. Das ist für eine bewusste Retention akzeptabel, aber die Anzeige
„valid" darf nicht als Beweis für lückenlose Gesamthistorie verstanden werden.

**Technische Ursache:** Der Verifier hat keinen Anker für den ersten gültigen
Eintrag. Die Retention löscht die älteren Zeilen, ohne einen neuen Genesis-Hash zu
setzen.

**Auslöser:** Mehr als 10.000 auditierte Mutationen; danach eine Verifikation.

**Beispielszenario:** Nach Monaten zeigt die Diagnose „Audit gültig, 10.000 Einträge".
Ein Angreifer oder ein Fehler könnte ältere Einträge entfernt haben; der Verifier
würde es nicht erkennen, weil der erste verbleibende Eintrag als Start akzeptiert
wird.

**Auswirkungen:** Falsches Vertrauen in die Vollständigkeit der Audit-Spur. Kein
direkter Nutzerfehler, aber eine irreführende Betriebsaussage.

**Warum es leicht übersehen wird:** Die Retention ist dokumentiert; die Verifikation
wird nur selten mit >10.000 Einträgen ausgeführt.

**Empfohlene Lösung:** Entweder die Retention als „bewusst gekürzt" in der Antwort
kennzeichnen (z. B. `truncated: true`, `retainedFromSequence`) oder einen
unveränderlichen Genesis-/Checkpoint-Hash speichern und beim Verifier prüfen. Die UI
soll „10.000 jüngste Einträge gültig" statt „gesamte Historie gültig" anzeigen.

**Betroffene Architekturentscheidungen:** Append-only-Audit mit Retention braucht
einen expliziten Truncation-Marker.

**Alternativen:** (a) Audit nie prunen, (b) externe Archivierung, (c) Checkpoint-Hash.
(a) wächst unbegrenzt, (b) ist mehr Infrastruktur, (c) ist minimal.

**Trade-offs:** Mehr Metadaten; dafür ehrliche Integritätsaussage.

**Implementierungsschritte:**
1. `operational_audit` um einen Checkpoint oder ein `retained_from`-Feld erweitern.
2. Verifier und API-Antwort anpassen.
3. UI-Text präzisieren.
4. Test mit künstlich gekürzter Kette.

**Tests:** Verifier-Test „gekürzte Kette wird als truncated erkannt". Test „vollständige
Kette bleibt valid".

**Akzeptanzkriterien:** Die Diagnose unterscheidet zwischen „vollständig geprüft" und
„nur der Retentionbereich ist geprüft". Es wird kein falscher Vollständigkeitsanspruch
angezeigt.

**Abhängigkeiten:** Keine.

**Geschätzter Umfang:** Small

**Risiko bei der Umsetzung:** Low

## 5. Edge Case Catalogue

Die folgende Liste enthält zusätzliche Fälle, für die kein eigener vollständiger
Finding-Abschnitt angelegt wurde. Sie sind nach Funktion gruppiert und jeweils mit
erwartetem/aktuellem Verhalten, Risiko und Testidee beschrieben.

### Notizen

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| N-01 | Zwei Tabs, gleiche Notiz, Revision 5 | Beide speichern innerhalb von 1 ms | Ein Save gewinnt, der andere erhält Konflikt | Der erste Request gewinnt; der zweite erhält Konflikt (single-threaded) | Gering | Zwei parallele `saveContent`-Requests |
| N-02 | Notiz mit 2 MB Inhalt | 100 Autosaves | Byte-Budget greift | 100 Vollkopien, DB wächst | Hoch | F-01-Test |
| N-03 | Nur Titel geändert | 100 Titeländerungen | Kein Volltextduplikat | Jede Änderung kopiert den vollen Inhalt | Mittel | Trigger-Test |
| N-04 | Notiz wird archiviert | Verlauf öffnen | Verlauf bleibt erreichbar oder wird bereinigt | Verlauf bleibt unbegrenzt | Mittel | F-01 |
| N-05 | Import mit 1.000 Notizen | Import erneut | Keine Duplikate | Neue IDs, Import atomar | Gering | Doppelimport |
| N-06 | Import mit Zyklus im Seitenbaum | Import | 400, nichts importiert | `assertParent` verhindert Zyklus, Transaktion rollt zurück | Gering | Archiv mit A→B→A |
| N-07 | Notiz mit `noteMention` auf gelöschte ID | Export/Import | Verweis bleibt Text oder wird gemeldet | Regex ersetzt nur vorhandene IDs | Gering | Archiv-Roundtrip |
| N-08 | Cover-Asset fehlt | Notiz öffnen | Platzhalter/Fehler sichtbar | `coverAssetId` zeigt ins Leere, UI muss damit umgehen | Mittel | Medien-ID löschen |
| N-09 | Import bricht nach Asset-Upload ab | Erneut importieren | Keine Duplikate, keine verwaisten Assets | Assets bleiben in Galerie (dokumentiert) | Gering | Abbruchtest |
| N-10 | Notiz wird gleichzeitig verschoben und bearbeitet | Move + Save | Konflikt oder konsistenter Zustand | Move nutzt `expectedRevision`; Save kann konkurrieren | Mittel | Zwei-Tab-Test |

### Terminal

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | CLI endet sofort mit Fehler | Server respawnt | Backoff/Endzustand | Sofortige Endlosschleife | Hoch | F-02 |
| T-02 | tmux-Session fehlt nach Neustart | Attach | Neue Sitzung oder klarer Fehler | `interrupted`, manueller Restart | Gering | Supervisor-Session löschen |
| T-03 | Zwei Browser, ein Terminal | Beide tippen | Ein Primary, Eingaben beider ankommen | Primary wechselt bei Eingabe; Eingaben werden geschickt | Gering | Zwei-Clients-Test |
| T-04 | Browser-Tab wird geschlossen | 30 min warten | Session bleibt, Lease läuft ab | PTY bleibt, Registry bleibt; Quote zählt weiter | Mittel | Lease-/Quota-Test |
| T-05 | Host-Neustart | Persistente Sitzung | Automatischer Start | `restorePersistentSessions` startet | Gering | Neustart-Test |
| T-06 | CWD wird extern gelöscht | Attach | Klarer Fehler | `requireValidCwd` markiert interrupted | Gering | CWD löschen |
| T-07 | tmux-Session hat doppelte Runtime-ID | Import | Kein 500 | UNIQUE-Konflikt möglich | Mittel | Manipulierte tmux-Option |
| T-08 | Sehr schneller Output | 100 MB/s | Backpressure/Queue begrenzt | 8-MB-Send-Queue, Journal 2 MB | Mittel | Flood-Test |
| T-09 | Browser geht offline | Eingabe | Keine unbemerkte Wiederholung | Queue verwirft, Fehler wird gemeldet | Gering | Offline-Test |
| T-10 | Terminal-Wechsel im Split | Dispose/Resubscribe | Kein Socket-Leak | Transport hält Socket bei anderen Abos | Gering | Mehrere Panes |

### Previews

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 | 60 Slots belegt, einer fremd-affin | Neue Preview starten | Kein fremder Reset | Reclaim kann fremden Slot wählen (F-03) | Hoch | Zwei-Benutzer-Test |
| P-02 | Slot-Port belegt | Serverstart | Workbench startet | Start bricht ab (F-16) | Mittel | Belegter Port |
| P-03 | Hauptdienst wird portlos | Preview öffnen | Fallback | `mainPort=null` (F-13) | Mittel | Config-Änderung |
| P-04 | Deep-Link auf anderes Preview-Ziel | Öffnen | Kein Hauptport-Drift | `saveMainPort` ändert Präferenz (F-24) | Mittel | Zwei Previews |
| P-05 | Zwei Sessions, gleicher Port, requested Slot | Öffnen | Isolation | Doppelbindung möglich (F-15) | Mittel | Zwei Sessions |
| P-06 | Reset-Bridge antwortet nicht | Reset | Quarantäne | `unverifiableReport` quarantäniert | Mittel | Bridge blockieren |
| P-07 | Bridge deaktiviert | Preview öffnen | Preview nutzbar, keine Diagnose | iframe lädt, `bridgeStatus.unavailable` | Gering | Flags off |
| P-08 | Devserver startet langsam | Log-Poll | Kein 500 | `readRuntimeLogs` liefert leere Panes | Gering | Verzögerter Start |
| P-09 | 60 Log-Polls parallel | Dashboard offen | Rate-Limit hält | 1,5-s-Poll pro Panel, 60 Listener | Mittel | Lasttest |
| P-10 | Externe Redirect-URL | Devserver antwortet 302 | Warnseite | `externalRedirectWarnUrl` | Gering | Redirect-Test |
| P-11 | Cookie mit Domain=localhost | Devserver setzt Cookie | Cookie entfernt | `sanitizeSlotCookies` | Gering | Cookie-Test |
| P-12 | Slot-Origin wird von zwei Tabs genutzt | Storage-Reset | Beide Tabs verlieren Storage | Reset wirkt auf Origin | Gering | Zwei-Tab-Test |

### Dateimanager

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| FM-01 | Upload 200 MB | Dateimanager | 413 mit klarer Meldung | Globales Limit 201 MB, dann Repo-Limit | Mittel | Upload-Test |
| FM-02 | Leerer Ordner | Löschen | Ordner weg | `rmdir` erfolgreich | Gering | Löschtest |
| FM-03 | Nicht-leerer Ordner | Löschen | 409 | `ENOTEMPTY` → 409 | Gering | Löschtest |
| FM-04 | Umbenennen auf vorhandenen Namen | Aktion | 409, keine Überschreibung | `publishFileNoReplace` | Gering | Kollision |
| FM-05 | Verschieben über Dateisystemgrenze | Aktion | Klarer Fehler | `EXDEV` → 400 | Gering | Mount-Test |
| FM-06 | Datei wird während Vorschau geändert | Lesen | Kein Nullbyte-Müll | `readTextPreview` liest begrenzt | Gering | Race-Test |
| FM-07 | Symlink im Baum | Öffnen | Abgelehnt | `resolvePath` prüft lstat | Gering | Symlink |
| FM-08 | Sehr viele Einträge | Tree laden | Pagination | Cursor-basiert | Gering | 10.000 Dateien |
| FM-09 | Suche während Löschung | Suche | Kein 500 | nicht lesbare Einträge werden übersprungen | Gering | Race-Test |
| FM-10 | State-Dokument beschädigt | Dateimanager öffnen | Reset/Fehler | 500 (F-09) | Mittel | Kaputtes JSON |

### Settings / Sync

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| S-01 | Zwei Geräte ändern dieselbe Einstellung | Beide speichern | Konflikt/letzter gewinnt sichtbar | Letzter gewinnt still | Mittel | Zwei Clients |
| S-02 | Layout > 128 KB | Speichern | 413, andere Keys weiter | `pushBlocked` blockiert alles (F-23) | Mittel | Großer Wert |
| S-03 | WebSocket tot | Einstellung ändern | Poll/Reconnect | 45-s-Poll und Reconnect | Gering | Netzwerk kappen |
| S-04 | localStorage gesperrt | Start | App funktioniert | Fallbacks vorhanden | Gering | Storage blockieren |
| S-05 | Beschädigtes UI-Settings-Dokument | Laden | Leeres Dokument | `parseDocument` Fallback | Gering | Kaputtes JSON |
| S-06 | Zwei Tabs, gleicher Key | Gleichzeitig ändern | Kein Verlust | Last-Write-Wins | Mittel | Zwei Tabs |
| S-07 | pagehide während Save | Tab schließen | Draft bleibt | `flushKeepalive` + Meta | Gering | Pagehide |

### Accounts

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Aktiver Account | Löschen per API | 409 oder sauberer Wechsel | Symlink bleibt (F-08) | Mittel | API-Test |
| A-02 | Zwei Aktivierungen parallel | Klicken | Serialisiert | `serialized(provider)` | Gering | Parallel-Test |
| A-03 | Profilpfad außerhalb Roots | Anlegen | 400 | `allowed` prüft | Gering | Pfadtest |
| A-04 | Account-Datei fehlt | Aktivieren | 409 | `hasCredentials` | Gering | Datei löschen |
| A-05 | Shared Home ist Symlink | Aktivieren | Kein Selbstziel | `moveSharedHomeIntoStore` | Gering | Symlink-Test |
| A-06 | CodexBar-Config beschädigt | Account löschen | Fehler/Rollback | `setCodexProfile` schreibt atomar | Gering | Config-Test |

### Notifications

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| B-01 | Zwei Tabs | Presence senden | Getrennte Sichten | globales Array (F-07) | Mittel | Zwei Tabs |
| B-02 | 500 ungelesene | Neue Meldung | Kappe greift | `pruneUnreadCap` | Gering | Lasttest |
| B-03 | Push-Endpoint 410 | Senden | Endpoint entfernt | `sendToSubscription` | Gering | Fake-Push |
| B-04 | VAPID-Datei ersetzt | Gerät öffnen | Abo erneuert | `replaceSubscription` | Mittel | Schlüsselwechsel |
| B-05 | Unbekannte Notification-ID | PATCH | 404 | `patch` liefert `null` mit 200 | Gering | API-Test |
| B-06 | Mehrere Geräte | Ein Gerät blockiert | Andere erhalten Push | parallele Zustellung | Gering | Push-Test |

### Usage

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| U-01 | Zwei Projekte `web` | Dashboard | Getrennte Zeilen | eine Zeile (F-20) | Mittel | Daten-Test |
| U-02 | Mitternacht lokal/UTC | „Heute“ | Lokaler Tag | UTC-Vergleich (möglich) | Gering | Zeitreise-Test |
| U-03 | Provider deaktiviert | Dashboard | Keine Forecasts | Filter vorhanden | Gering | Flag-Test |
| U-04 | CodexBar down | Dashboard | Stale-Daten | Cache-Fallback | Gering | Fehler-Test |
| U-05 | Account deaktiviert | Timeline | Status disabled | `accountDisabled` | Gering | Flag-Test |

### Skills / Extensions / Hermes

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| K-01 | Mehrbyte-Inhalt | Skill speichern | Byte-Limit | Zeichen-Limit (F-22) | Mittel | Emoji-Test |
| K-02 | Skill-Ordner doppelt | Umbenennen | Recovery/409 | `SKILLS_RECOVERY_REQUIRED` | Gering | Doppelordner |
| K-03 | Git detached HEAD | Commit | 409 | `SKILLS_GIT_DETACHED` | Gering | Detached |
| K-04 | Secret-Datei im Skill | Commit | Fail-closed | `secretLikePath` | Gering | Secret-Test |
| K-05 | Plugin-SDK geändert | Restart | Neuer Build | alter `dist` (F-12) | Mittel | Build-Test |
| K-06 | Hermes Attach + Send | Gleichzeitig | Reihenfolge | parallele IIFE (F-26) | Mittel | WS-Test |
| K-07 | Hermes-Session außerhalb Roots | Attach | 403 | `isSafeCwd` | Gering | Pfadtest |
| K-08 | Extension-Update schlägt fehl | Rollback | Alter Pointer | `restorePointer` | Gering | Fehlerinjektion |

### Deployment / Betrieb

| # | Ausgangszustand | Aktion | Erwartet | Aktuell/vermutet | Risiko | Test |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | kein `dist` beim Start | Frontend bauen | 200 | 503 (F-04) | Hoch | Temp-Dist |
| D-02 | Slot-Port belegt | Server starten | Degraded | Startabbruch (F-16) | Mittel | Port belegen |
| D-03 | Plugin-SDK geändert | Restart | Neuer Build | alt (F-12) | Mittel | Build-Test |
| D-04 | Lokale Config 412 Zeilen | Gate | Grün | Rot (F-25) | Gering | Gate-Test |
| D-05 | Audit-Datei > 400 Zeilen | Gate | Ignoriert | Rot (F-25) | Gering | Gate-Test |
| D-06 | Update bei dirty tree | Update | 409 | `triggerUpdate` blockt | Gering | Dirty-Test |

## 6. Security-Verweis, keine Security Findings

Die folgenden Punkte sind ausschließlich als Verdacht notiert. Sie wurden nicht
tiefgehend geprüft, nicht ausgenutzt und nicht bewertet. Zuständig ist `security-audit`.

- `Needs Verification / Security` — `apps/server/src/previews/routes.ts` und
  `apps/server/src/previews/slots.ts`: Der Slot-Reclaim prüft keine Eigentümerschaft;
  ein erlaubter Benutzer kann bei aktiviertem Reset fremden Preview-Storage leeren.
- `Needs Verification / Security` — `apps/server/src/previews/gateway-auth.ts`:
  `assertSlotAccess` überspringt die Token-Prüfung, wenn `route.sessionId === null`;
  bei mehrdeutigen/geteilten Sessions ist der Datenpfad dann ohne Token erreichbar.
- `Needs Verification / Security` — `apps/server/src/app/dependencies.ts` und
  `apps/server/src/previews/slots.ts`: `forbiddenTargetPorts` enthält nicht alle
  internen Dienste (u. a. Hermes, code-server, CodexBar); ein Preview-Ziel könnte
  einen internen Dienst über den Slot-Listener erreichbar machen.
- `Needs Verification / Security` — `apps/server/src/filesystem/fileManagerService.ts`:
  `rename`/`move` prüfen das Schutzziel nur am Ziel, nicht an der Quelle; eine Datei
  aus einem geschützten Config-Bereich könnte aus diesem heraus verschoben werden.
- `Needs Verification / Security` — `apps/server/src/notifications/routes.ts`:
  Notification-Presence ist global und nicht an die Identität gebunden; die
  Auswirkungen auf Read-/Push-Zustände fremder erlaubter Identitäten sind zu prüfen.
- `Needs Verification / Security` — `apps/server/src/hermes/dashboard-proxy.ts` und
  `apps/server/src/services/t3Proxy.ts`: Cache-/Header-Umschreibungen und
  Proxy-Grenzen sollten im Security-Audit gegen die tatsächlichen Upstream-Antworten
  geprüft werden.

## 7. Performance Findings

Die folgenden Punkte sind keine vollständige Performance-Analyse (dafür existiert ein
separater Performance-Audit). Sie ergänzen die im Overall-Audit bestätigten
Skalierungsgrenzen.

### 7.1 Synchrones SQLite auf dem Event-Loop

Mehrere Module öffnen eigene `DatabaseSync`-Verbindungen mit
`PRAGMA busy_timeout=5000`. Jeder Datenbankzugriff blockiert den Node-Event-Loop. Im
Einzelprozess sind die meisten Transaktionen synchron und können sich nicht
verschränken; sobald jedoch ein externer Prozess (SQLite-CLI, eine zweite
Wrapt-Instanz, ein Plugin) die Datei sperrt, kann ein Request bis zu fünf Sekunden
blockieren. In dieser Zeit sind HTTP, WebSockets und Terminal-Ausgabe angehalten.

Betroffen sind u. a. `UsageDatabase`, `NotesDatabase`, `TerminalDatabase`,
`PreviewSlotDatabase`, `UiSettingsDatabase`, `FileManagerService`,
`NotificationDatabase` und `OperationalAuditDatabase`.

Messung: `POST /api/v1/settings/ui` und `PUT /api/v1/terminal/workspace` unter
gleichzeitiger externer Schreibsperre; p99-Latenz und Event-Loop-Verzögerung messen.
Ziel: p99 unter 200 ms, keine Blockade über 1 s.

Empfehlung: Eine zentrale Datenzugriffsschicht mit kurzen Transaktionen, kleinerem
`busy_timeout` (z. B. 1 s) und optional einem Worker für teure Wartungsaufgaben.
Kurzfristig: Schreibrouten mit `BEGIN IMMEDIATE` und sofortigem Commit; keine
langen Schleifen innerhalb einer Transaktion.

### 7.2 Notiz-Historie und Suche

Siehe F-01 und F-19. Die Datenbank wächst mit dem Verlauf, die Suche lädt alle
Inhalte. Bei 1.000 Notizen mit 100 KB sind das ~100 MB pro Sucheingabe, plus
Ranking. Das ist der größte einzelne Performance-Risikofaktor im Projekt.

Messung: Server-Test mit 1.000 Notizen; `GET /api/v1/notes/search?q=...` und
`GET /api/v1/notes`; Heap und Event-Loop-Lag messen. Ziel: Suche < 200 ms,
Listenabruf < 100 ms, Heap-Zuwachs < 20 MB.

### 7.3 Preview-Polling und Listener

`PreviewHub` pollt pro geöffnetem Projekt alle 2–5 s, `PreviewHubProject` zusätzlich
Status und Logs (1,5 s), und 60 Slot-Listener laufen dauerhaft. Bei vielen offenen
Projekten entstehen schnell hunderte Requests pro Minute. Der globale Limiter
(1.200/min pro Identität) kann dann 429 liefern, obwohl die Anfragen legitim sind.

Messung: 10 geöffnete Preview-Tabs, 10 Minuten; Request-Zähler, 429-Rate,
CPU-Last. Ziel: keine 429 bei normaler Nutzung, p95 < 100 ms für Status.

Empfehlung: Statusabfragen bündeln (ein `/previews/status?ids=...`), Log-Polling nur
bei sichtbarem Panel und mit größerem Intervall, Hintergrund-Polling pausieren.
Die 60 Listener sind für die Isolation sinnvoll; ihre Start- und Fehlerbehandlung
sollte aber nicht den gesamten Dienst blockieren (F-16).

### 7.4 Terminal-Speicher

Jede Session hält bis zu 3 MB History, ein 2-MB-Journal und ein Headless-Terminal
mit 10.000 Zeilen Scrollback. Bei 52 möglichen Sessions sind das theoretisch
mehrere hundert MB. Die Quoten sind sinnvoll, aber es gibt keine globale
Speicherobergrenze und keine Diagnose pro Session.

Messung: 52 Sessions mit viel Output; RSS und GC beobachten. Ziel: harte globale
Obergrenze (z. B. 512 MB) und eine Session-Metrikanzeige.

### 7.5 Bundle und Rendering

Die Web-Tests laufen, aber es wurde kein Produktionsbundle gemessen. Der
Notes-Editor ist historisch groß (laut früherem Audit ~1,24 MB minifiziert). Die
persistenten Routen halten viele Komponenten gleichzeitig im Baum; geparkte Routen
sind zwar `inert`, aber ihre Timer/Queries können weiterlaufen, wenn sie nicht
explizit `routeActive` berücksichtigen. Das ist ein Kandidat für den separaten
Performance-Audit.

Messung: Vite-Build-Artefakte, Lighthouse/Chrome Performance auf Mobilgerät,
Anzahl gleichzeitig aktiver Timer/WebSockets pro geparkter Route.

## 8. Data Integrity Findings

Die wichtigsten Datenintegritätsbefunde sind bereits als F-01, F-03, F-05, F-08,
F-09, F-15, F-18 und F-20 dokumentiert. Ergänzend:

- **Notizverlauf:** Siehe F-01. Das ist der einzige bestätigte Pfad, der die
  gemeinsame SQLite durch normale Nutzung in Richtung Kapazitätsgrenze treiben kann.
- **Preview-Storage:** Siehe F-03. Die Slot-Affinität ist die einzige
  Schutzbarriere; sie ist nicht an den Benutzer gebunden.
- **Persistierte Dokumente:** Siehe F-09. Beschädigte Zeilen sind derzeit ein
  dauerhafter Ausfall, kein reparierbarer Zustand.
- **FileManager-Draft:** Siehe F-05. Ein älterer Draft kann einen neueren Serverstand
  überschreiben.
- **Account-Symlink:** Siehe F-08. Löschen und aktiver Zustand sind nicht atomar.
- **Terminal-Registry:** Die Quota-Reservierung ist transaktional und gut getestet;
  das Risiko liegt im Respawn-Verhalten (F-02) und in doppelten Runtime-IDs beim
  Supervisor-Import (Edge Case T-07).
- **Import/Export:** Der Notiz-ZIP-Export lädt Anhänge und ein Manifest; der
  serverseitige `/notes/export`-Pfad liefert `assets: {}` und ist nur als
  Zwischenformat gedacht. Der Web-Export ist vollständiger. Ein Import kann nach
  hochgeladenen Assets abbrechen und dann verwaiste Galerie-Dateien hinterlassen;
  das ist dokumentiert, sollte aber in der UI als Aufräumhinweis erscheinen.
- **Usage-Projektzuordnung:** Siehe F-20. Die Aggregation ist bewusst, aber
  kollisionsanfällig.
- **Settings:** Letzter Schreiber gewinnt pro Schlüssel; es gibt keine
  Revisionsprüfung im Request. Das ist für Komfort okay, aber bei gleichzeitigen
  Änderungen desselben Schlüssels auf zwei Geräten geht eine Änderung still verloren.
  Wenn das nicht gewünscht ist, muss der Client eine erwartete Revision mitsenden.

## 9. Architecture Improvements

### 9.1 Dringend

1. **Persistenz-Codecs zentralisieren** (F-09). Ein gemeinsamer `safeJsonDocument`
   mit Schema, Quarantäne und Reset verhindert dauerhafte 500er.
2. **Preview-Lebenszyklus trennen** (F-13, F-14, F-15, F-16, F-24). Hauptdienst,
   Preview-Ziel, Session, Slot und Storage-Affinität sind fünf Konzepte, die derzeit
   teilweise vermischt werden. Eine kleine `PreviewTarget`-Abstraktion mit klarer
   Eigentümerschaft würde mehrere Findings gleichzeitig lösen.
3. **Statisches Frontend dynamisch behandeln** (F-04). Die Startzeit-Entscheidung ist
   die falsche Grenze.
4. **Terminal-Respawn-Policy** (F-02). Der Prozesslebenszyklus braucht eine
   explizite Policy, nicht nur ein `onExit`.

### 9.2 Mittelfristig

1. **Zentrale Datenzugriffsschicht** mit kurzen Transaktionen und einem kleinen
   `busy_timeout`; optional ein Worker für Wartung/Verify.
2. **Notiz-Historie kompaktieren** (F-01) und die Suche auf FTS/Excerpt umstellen
   (F-19).
3. **Sync-Retry-Controller** für alle Client-Syncs (F-06, F-23).
4. **Build-Graph zentralisieren** (F-12), damit Root-Build und Restart-Skripte
   dieselben Pakete bauen.
5. **Body-Limits pro Route** (F-10) und eine konsistente Fehlertaxonomie (F-11).

### 9.3 Langfristig

1. **Benutzerdimension für flüchtige Zustände** (Presence, Slot-Affinität) einführen,
   auch wenn die Kern-Daten weiterhin geteilt bleiben.
2. **Notizverlauf als eigenes, komprimierbares Objekt** mit globalem Budget und
   optionaler Archivierung.
3. **Preview-Slots als eigener Supervisor-Prozess** mit unabhängigem Lebenszyklus;
   die Workbench bleibt dann auch bei einem Preview-Portproblem erreichbar.
4. **Datenbank-Migrationen versionieren und testen** (Downgrade-Szenarien,
   beschädigte Dokumente) statt nur „CREATE TABLE IF NOT EXISTS".

## 10. Code Quality Improvements

- **F-13:** `!== undefined` ist bei `number | null` falsch; `typeof === "number"`
  verwenden. Das ist ein Einzeiler mit großer Wirkung.
- **F-22:** `.length` vs. `Buffer.byteLength` – ein wiederkehrender Fehler bei
  Größenlimits. Alle Größenprüfungen im Projekt sollten auf Bytes basieren.
- **F-06:** `conflictAttemptsRef` wird erhöht, aber nie gelesen. Entweder in die
  Backoff-Logik einbeziehen oder entfernen.
- **F-12:** `update-and-restart.sh` baut `extension-contracts` doppelt. Das ist
  unnötige Arbeit und ein Zeichen dafür, dass die Build-Reihenfolge nicht zentral
  definiert ist.
- **F-11:** `toApiError` hat eine zu breite 4xx-Fallback-Regel; bekannte
  Framework-Codes sollten vorher abgebildet werden.
- **Dokumentation:** `docs/troubleshooting.md` sagt „standardmäßig jeweils vier
  Codex- und OpenCode-Prozesse"; `settings.ts` defaultet auf 12. Entweder Doku oder
  Default angleichen. `docs/architecture.md` und `docs/terminal.md` sind für die
  meisten Flüsse korrekt, aber bei Preview-Flags und Host-Neustart sollten die
  tatsächlichen Grenzen (Portstart, Storage-Eigentümer) ergänzt werden.
- **Toter/irreführender Code:** `PreviewSlotService.assign` ist ein „Bestandspfad",
  der bei aktiven Bindings andere Zustände erzeugen kann als der Session-Pfad. Wenn
  er nicht mehr gebraucht wird, entfernen; sonst klar als Legacy markieren und
  dieselben Invarianten erzwingen.
- **Fehlende Tests für Randfälle:** Siehe Abschnitt 11. Besonders die
  „beschädigte Daten", „später Build", „fremder Slot" und „dauerhaft fehlschlagender
  Prozess"-Fälle fehlen.

## 11. Testing Strategy

### Sofort erforderlich

1. **F-01:** Notizverlauf-Budget, 2-MB-Inhalt, 120 Saves, Titel-only-Änderungen.
2. **F-02:** Terminal-Respawn mit sofortigem Exit, Backoff und manuellem Restart.
3. **F-03:** Preview-Reclaim mit zwei Benutzern/Projekten und fremder Affinität.
4. **F-04:** `buildApp` mit leerem Dist, danach Dist anlegen, `/wrapt/` prüfen.
5. **F-05:** FileManager-Draft mit älterer Revision gegen neueren Serverstand.
6. **F-08:** Aktiven Account löschen (API) und Symlink-Zustand prüfen.
7. **F-09:** Beschädigte JSON-Zeilen in Terminal/FileManager/Workspace/Preview.
8. **F-16:** Belegter Slot-Port beim Start.

### Vor wichtigen Refactorings

1. **F-06/F-23:** Retry-/Backoff-Verhalten mit Fake-Timern und dauerhaftem 500er.
2. **F-07:** Presence mit zwei Tabs/Benutzern und leerem Report.
3. **F-10/F-11:** Body-Limits und Fehlermapping an echten Fastify-Routen.
4. **F-13/F-14/F-15:** Preview-Status, Idempotenz und Slot-Isolation.
5. **F-18:** Notiz-Duplikat bei Fehler zwischen den Schritten.
6. **F-20:** Usage-Aggregation mit gleichen Basisnamen.

### Vor einem Produktionsrelease

1. **E2E:** Frontend-Restart ohne Dienstneustart; Deep-Link auf zweites Preview-Ziel;
   zwei Tabs mit Notiz/Draft; mobiler Terminal-/Preview-Fluss.
2. **Fehlerinjektion:** Server 500, Netzwerkabbruch, SQLite-Sperre,
   beschädigte Dokumente, belegter Slot-Port.
3. **Multi-Tab/Multi-Device:** Settings, FileManager, Terminal-Workspace,
   Notifications, Notes.
4. **Deployment:** Frischer Checkout, `pnpm install`, Teilbuild, Restart-Skript,
   Update-Skript, Rollback.

### Langfristig

- Property-Based Tests für Pfad-/Manifest-Parser.
- Fuzz-Tests für Import-ZIPs, Notiz-Markdown und persistierte JSON-Dokumente.
- Lasttests für 1.000 Notizen, 52 Terminals, 60 Preview-Slots und 20 Tabs.
- Accessibility-Tests mit Screenreader und Tastatur auf Mobilgeräten.
- Chaos-Tests für Prozessabbrüche (tmux, PTY, Devserver, Datenbank).

## 12. Observability and Debugging

Positiv: `OperationalMetrics`, `OperationalAuditDatabase`, strukturierte Logs,
`/api/v1/system/operational-metrics`, Preview-Doctor und Restart-Status sind bereits
vorhanden. Die wichtigsten Lücken:

1. **Preview-Listener-Start:** Fehlgeschlagene Slots werden nur als Startfehler
   sichtbar. Eine Metrik pro Slot (`available`, `port`, `lastError`) und ein
   Doctor-Eintrag fehlen (F-16).
2. **Notiz-Historie:** Keine Metrik für `note_history`-/`note_conflict_backups`-Bytes.
   Ergänzen: Größe, Anzahl, Prune-Läufe, älteste Fassung.
3. **Sync-Fehler:** Terminal-/FileManager-Sync haben keine Zähler oder Backoff-
   Zustände in der UI. Ein kleiner `syncStatus` pro Store würde F-06 sichtbar machen.
4. **Account-Löschung:** Ein verwaister Symlink wird nur beim nächsten
   `reconcile`-Lauf erkannt. Ein Audit-/Diagnoseeintrag mit Benutzer und Pfad wäre
   hilfreich (ohne Zugangsdaten).
5. **Datenbank:** `busy_timeout`-Wartezeiten, Transaktionsdauern und
   `SQLITE_FULL`/`SQLITE_BUSY`-Raten als Metriken erfassen.
6. **Audit:** Truncation-Marker (F-27) und ein klarer „retained range"-Hinweis.
7. **Hermes:** Nachrichtenreihenfolge/Queue-Tiefe pro Socket als Debug-Metrik.

## 13. Prioritized Roadmap

### Phase 0: Sofortmaßnahmen

| ID | Titel | Priorität | Abhängigkeiten | Dateien | Schritte | Tests | Akzeptanz | Umfang | Risiko |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | Notizverlauf mit Byte-Budget | P0 | keine | `notes/knowledge.ts`, `notes/database.ts` | Budget, Prune, Metriken, Tests | 2-MB/120-Saves | Budget eingehalten, letzte Fassung erhalten | M | M |
| F-02 | Terminal-Respawn-Policy | P0 | keine | `terminal/process.ts`, `TmuxSupervisor.ts` | Zähler, Backoff, Interrupted-Zustand | Sofort-Exit-Test | max. 3 Starts/5 min | M | M |
| F-03 | Preview-Reclaim Eigentümer | P0 | Schema-Migration | `previews/slots.ts`, `routes.ts`, `reset.ts` | userId, Affinität, 409 | Zwei-Benutzer-Test | kein fremder Storage-Reset | M | M |
| F-04 | Statisches Frontend dynamisch | P0 | keine | `app/static.ts`, `restart-frontend.sh` | immer registrieren, HTTP-Check | Temp-Dist-Test | später Build wird ausgeliefert | S | L |
| F-08 | Aktiven Account schützen | P0 | keine | `usage/account-service.ts` | 409 oder sauberer Wechsel | API-Test | kein verwaister Symlink | S | M |
| F-16 | Slot-Portstart degradieren | P0 | keine | `previews/gateway.ts`, `lifecycle.ts` | allSettled, Status, Doctor | Belegter Port | App startet weiter | M | M |

### Phase 1: Stabilisierung

| ID | Titel | Priorität | Abhängigkeiten | Dateien | Schritte | Tests | Akzeptanz | Umfang | Risiko |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-05 | FileManager-Draft-Revision | P1 | keine | `FileManagerSync.tsx`, `fileManager.ts` | Revisionsvergleich, Konfliktdialog | Zwei-Revisionen-Test | kein stilles Überschreiben | S | L |
| F-06 | Sync-Backoff | P1 | keine | Terminal/FileManager-Sync | Retry-Controller | Fake-Timer | max. 1 Request/Backoff | S | L |
| F-07 | Presence pro Benutzer | P1 | Contract | `notifications/database.ts`, `routes.ts` | Map pro User/Client | Zwei-Tab-Test | keine Überschreibung | S | L |
| F-09 | Persistente JSON-Robustheit | P1 | keine | mehrere DB-Module | Safe-Parse, Quarantäne | Kaputte JSON-Tests | kein Dauer-500 | M | L |
| F-11 | Fastify-4xx-Mapping | P1 | F-10 | `utils/api-errors.ts` | Codes abbilden | 413/415-Tests | verständliche Fehler | S | L |
| F-17 | Restart-Guard vor Trigger | P1 | keine | `SystemRestartControls.tsx` | Guard verschieben | Dirty-Test | kein Restart bei Abbruch | S | L |
| F-18 | Notiz-Duplikat atomar | P1 | Contract | `NotesWorkspace.tsx`, Notes-Route | Endpoint/Transaktion | Fehler zwischen Schritten | keine halbe Kopie | S | L |

### Phase 2: Validierung und Schutz vor Fehlbedienung

| ID | Titel | Priorität | Abhängigkeiten | Dateien | Schritte | Tests | Akzeptanz | Umfang | Risiko |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-10 | Body-Limits pro Route | P2 | F-11 | `app/buildApp.ts`, Routen | global klein, per Route groß | 413-Tests | keine 201-MB-JSONs | S | L |
| F-13 | Hauptdienst-Port-Fallback | P2 | keine | `previews/runtimePorts.ts` | `typeof === number` | Port-null-Test | Fallback greift | S | L |
| F-14 | Idempotenz-Fingerprint | P2 | keine | Preview-Client/Server | Feld ergänzen, neuer Key | Slot-Wechsel-Test | kein 409 | S | L |
| F-15 | Slot-Isolation | P2 | F-14 | `previews/slots.ts` | Bindung/Fingerprint prüfen | Zwei-Session-Test | isolate hält | S | L |
| F-22 | Skill-Byte-Limit | P2 | keine | `skills/skillEditorFiles.ts` | `Buffer.byteLength` | Emoji-Test | keine unlesbare Datei | S | L |
| F-23 | Settings-4xx differenzieren | P2 | keine | `settingsSync/engine.ts` | 413 isolieren | 413+valider Test | andere Keys synchronisieren | S | L |
| F-24 | Preview-Deeplink entkoppeln | P2 | F-13 | `PreviewHubProject.tsx` | kein Hauptport-Drift | Zwei-Preview-Test | Ziel korrekt, kein Drift | S | M |

### Phase 3: Performance

| ID | Titel | Priorität | Abhängigkeiten | Dateien | Schritte | Tests | Akzeptanz | Umfang | Risiko |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-19 | Notiz-Skalierung | P3 | F-01 | `notes/database.ts`, `knowledge.ts` | FTS/Pagination/Backlinks | 1.000-Notizen-Test | <200 ms Suche | M | M |
| F-20 | Usage-Projektidentität | P3 | keine | `usage/database.ts` | vollständiger Pfad | Kollisionstest | getrennte Zeilen | S | L |
| F-21 | Preview-Kapazität | P3 | F-03 | `previews/slots.ts` | `mayReuseSlot` | Fremd-Affinität-Test | fits korrekt | S | L |
| P-01 | Sync-/Preview-Polling bündeln | P3 | keine | `queryOptions.ts`, PreviewHub | Batch/Statusintervalle | Lasttest | keine 429 | M | M |

### Phase 4: Architektur und Wartbarkeit

| ID | Titel | Priorität | Abhängigkeiten | Dateien | Schritte | Tests | Akzeptanz | Umfang | Risiko |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-12 | Zentraler Build-Graph | P4 | keine | `lib-restart.sh`, `update-and-restart.sh` | gemeinsame Build-Funktion | Shell-/CI-Test | SDK/Icons aktuell | S | L |
| F-25 | File-Line-Gate | P4 | keine | `check-file-lines.mjs` | `audits`, lokale Config ignorieren | Gate-Test | lokal grün | S | L |
| F-26 | Hermes-Socket-Queue | P4 | Hermes-Test | `hermes/routes.ts` | Promise-Kette | WS-Test | Reihenfolge | S | M |
| F-27 | Audit-Truncation | P4 | keine | `observability/audit*` | Checkpoint/Truncated | Verifier-Test | ehrliche Anzeige | S | L |

### Phase 5: UX und Accessibility

- Mobile Terminal-/Preview-Bedienung mit echter Hardware und Bildschirmtastatur
  prüfen; `useVisualViewportVariables` (AppShell) gegen iOS/Android testen.
- Konfliktdialoge für FileManager, Notizen und Settings vereinheitlichen.
- Fehlermeldungen aus F-11 in der UI mit klarer Handlungsanweisung anzeigen.
- Fokusführung in `PreviewTargetMenu`, `MobileNav` und Diagnose-Sheet mit
  Screenreader prüfen.
- Keine sichtbaren Scrollbars beibehalten; Touch-Ziele 44 × 44 px prüfen.

### Phase 6: Langfristige Verbesserungen

- Notizverlauf komprimieren/archivieren; optional Diff-Snapshots.
- Preview-Slots als separaten Supervisor-Prozess.
- Benutzerdimension für flüchtige Zustände (Presence, Affinität).
- Vollständige FTS-/Backlink-Infrastruktur.
- Zentraler Build-/Deploy-Orchestrator.

## 14. Quick Wins

1. **F-13:** `servicePort !== undefined` → `typeof servicePort === "number"`.
   Einzeiler, verhindert eine blockierte Preview.
2. **F-22:** `input.content.length` → `Buffer.byteLength(...)`.
3. **F-14:** `requestedSlotId` in den Client-Fingerprint aufnehmen.
4. **F-17:** Dirty-Guard vor `trigger()` verschieben.
5. **F-12:** `plugin-sdk` und `build:icons` in `build_contracts` ergänzen.
6. **F-25:** `audits` und `config/*.local.json` im File-Line-Checker ignorieren.
7. **F-11:** Fastify-413/415-Codes im zentralen Error-Handler abbilden.
8. **F-06:** Wenigstens eine feste 5-s-Verzögerung nach einem fehlgeschlagenen
   Terminal-/FileManager-Save einbauen, bevor der vollständige Backoff-Controller
   kommt.
9. **F-24:** `.catch` am `saveMainPort`-Promise ergänzen und die automatische
   Mutation vorerst entfernen.

## 15. Open Questions

1. **Ist der globale Notification-Read-Zustand beabsichtigt?** Die Architektur sagt
   „jede erlaubte Identität sieht dieselben Einträge". Wenn Gelesen-Markierungen
   global sein sollen, ist F-07 dennoch ein Problem, weil Presence pro Sicht
   überschrieben wird. Wenn sie pro Benutzer sein sollen, braucht die Tabelle eine
   Benutzerdimension.
2. **Darf Preview-Recovery projektübergreifend Storages zurücksetzen?** Die aktuelle
   Implementierung tut es. Für einen Einzelbenutzer kann das bewusst sein; für
   mehrere Identitäten oder empfindliche lokale Testdaten ist es riskant.
3. **Ist der automatische Terminal-Respawn nach jedem Exit gewollt?** Der Test
   bestätigt das Verhalten. Wenn ein sofortiger Neustart für Shells gewünscht ist,
   braucht zumindest ein fehlschlagendes CLI eine Ausnahme.
4. **Wie groß dürfen Notizen und Verläufe real werden?** Die 2-MB-Grenze und 100
   Versionen ergeben sehr unterschiedliche Budgets. Eine Produktentscheidung
   (z. B. 8 MB Verlauf pro Notiz) ist nötig, bevor F-01 umgesetzt wird.
5. **Ist der 200-MB-Dateimanager-Upload beabsichtigt?** Falls nicht, kann F-10
   deutlich kleiner ausfallen. Falls ja, braucht es einen eigenen Upload-Pfad mit
   Streaming und ohne globalen JSON-Puffer.
6. **Sind mehrere `allowedUsers` real im Einsatz?** Viele Findings (F-03, F-07,
   F-08) werden erst dann sichtbar. Die Antwort beeinflusst Priorität und
   Testaufwand.
7. **Soll der Auditbericht versioniert werden?** F-25 setzt voraus, dass
   `audits/` nicht Teil des Source-Gates ist. Wenn er versioniert werden soll,
   braucht der Checker eine bewusste Ausnahme.
8. **Wie soll ein Frontend-Start ohne `dist` aussehen?** F-04 kann entweder den
   Serverstart abwarten lassen oder eine degradierte 503-Seite liefern. Die
   Produktentscheidung bestimmt die genaue Umsetzung.
9. **Ist der separate `previews.slotResetEnabled`-Flag langfristig gewollt?** Bei
   ausgeschaltetem Reset ist die automatische Recovery wirkungslos; das sollte in
   der UI klar kommuniziert werden.
10. **Welche Hermes-Version und welches ACP-Verhalten sind verbindlich?** F-26 ist
    ohne einen echten Hermes-Lauf nur eine Vermutung. Ein gezielter Test mit
    verzögertem Attach ist nötig.

## 16. Verification Checklist

Nach der Umsetzung muss ein anderer Agent Folgendes prüfen:

- [ ] F-01: 2-MB-Notiz, 150 Saves; `note_history`- und
      `note_conflict_backups`-Bytes bleiben unter dem Budget; letzte Fassung
      vorhanden.
- [ ] F-02: CLI beendet sich sofort; nach drei Versuchen bleibt die Sitzung
      `interrupted`, kein weiterer Respawn; manueller Restart funktioniert.
- [ ] F-03: Zwei Benutzer/Projekte; Reclaim eines fremden Slots liefert 409;
      eigener Slot wird weiterhin zurückgesetzt.
- [ ] F-04: Serverstart ohne `dist`, danach `dist` anlegen; `/wrapt/` liefert 200
      ohne Dienstneustart; `restart-frontend.sh` prüft den echten HTTP-Status.
- [ ] F-05: Älterer FileManager-Draft überschreibt keinen neueren Serverstand;
      Konfliktdialog erscheint.
- [ ] F-06: Dauerhafter 500er erzeugt höchstens einen Request pro Backoff-Stufe;
      versteckter Tab pausiert.
- [ ] F-07: Zwei Tabs/Benutzer überschreiben ihre Presence nicht; leerer Report
      löscht nur den eigenen Client.
- [ ] F-08: Löschen des aktiven Accounts hinterlässt keinen verwaisten Symlink
      und keinen scheinbar aktiven Zustand.
- [ ] F-09: Beschädigte JSON-Zeilen liefern einen definierten Reset-/Fehlerzustand,
      keinen Dauer-500; Rohwert bleibt für die Diagnose.
- [ ] F-10/F-11: Große JSON-/Multipart-Anfragen liefern schnelle, verständliche
      413/415-Antworten; normale Uploads funktionieren.
- [ ] F-12: Nach jedem Restart-/Update-Lauf existieren aktuelles
      `plugin-sdk/dist` und Icons; frischer Checkout startet.
- [ ] F-13: Portloser gespeicherter Hauptdienst blockiert die Preview nicht.
- [ ] F-14: Slot-Wechsel erzeugt keinen Idempotenz-409.
- [ ] F-15: Zwei isolierte Sessions können denselben Slot nicht teilen;
      Routing bleibt eindeutig.
- [ ] F-16: Ein belegter Slot-Port verhindert den Workbench-Start nicht; der Slot
      ist als nicht verfügbar sichtbar.
- [ ] F-17: Restart bei ungespeicherten Änderungen wird vor dem Trigger abgefragt
      und bei Abbruch nicht ausgeführt.
- [ ] F-18: Fehlgeschlagenes Duplizieren hinterlässt keine halbe Notiz.
- [ ] F-19: 1.000 Notizen: Liste und Suche bleiben unter den Zielwerten.
- [ ] F-20: Zwei Projekte mit gleichem Basisnamen erscheinen getrennt.
- [ ] F-21: Kapazitätsvorschau und tatsächliche Slot-Allokation stimmen überein.
- [ ] F-22: Mehrbyte-Inhalt am Limit kann gespeichert und wieder geöffnet werden.
- [ ] F-23: Ein 413 blockiert andere Einstellungen nicht; Fehler ist sichtbar.
- [ ] F-24: Deeplink auf ein zweites Preview-Ziel ändert den Hauptport nicht und
      öffnet das richtige Ziel.
- [ ] F-25: `pnpm architecture:file-lines` ist mit lokaler Config und Auditbericht
      grün; echte Projektdateien über 400 Zeilen werden weiterhin erkannt.
- [ ] F-26: Hermes-Nachrichten werden pro Socket in Reihenfolge verarbeitet;
      Attach+Send-Test ist deterministisch.
- [ ] F-27: Audit-Diagnose unterscheidet „vollständig" von „Retentionbereich".
- [ ] Keine Regression in `pnpm typecheck`, `pnpm lint`, Server-/Web-Tests,
      E2E-Personas und mobilen Ansichten.
- [ ] Keine Änderung an Nutzer-Previews, Terminal-Sitzungen oder Live-Daten während
      der Verifikation.

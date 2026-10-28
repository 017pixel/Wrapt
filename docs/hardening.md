# Absicherung und Betriebsgrenzen

Dieses Dokument beschreibt die Grenzen, die aus dem Project Audit and Improvement Plan
umgesetzt wurden, ihre Konfiguration und ihren Rückbau. Es ergänzt die
[Konfiguration](configuration.md) und die [Sicherheitsausnahmen](security-exceptions.md).

## Single-User-Betrieb ohne Mandantentrennung (S-004)

- Die Workbench ist für genau einen vertrauenswürdigen Benutzer ausgelegt.
- `allowedUsers` mit mehr als einem Eintrag teilt alles: Notizen,
  Dateisystem, Projekte, Skills und Benachrichtigungen sind global sichtbar und
  überschreibbar — es gibt keine `userId`-Trennung.
- Bei mehr als einem erlaubten Benutzer schreibt der Server beim Start eine
  Warnung ins Log (`allowedUsersIsolationWarning`).
- Wer einen zweiten Benutzer einträgt, bestätigt damit: beide Identitäten sind
  voll vertrauenswürdig. Alternative: eigene Instanz pro Benutzer.
- Skills-Mutationen (`PUT/POST/DELETE /api/v1/skills/*`) erfordern die
  Adminrolle (`requireWorkbenchAdmin`); Lesen (`GET`) bleibt für alle erlaubten
  Identitäten offen.

## Projekt-Code ist vertrauenswürdig (S-006)

- Alles, was als Server-Benutzer (gleiche UID) läuft — Terminal-Befehle,
  Preview-DevServer, Skill-Hooks — kann die Workbench-API über Loopback
  erreichen. Der Header `tailscale-user-login` ist ab Loopback fälschbar.
- Deshalb gilt: Nur Code ausführen, der als Workbench-Admin agieren dürfte.
- Die Loopback-Prüfung des Open-in-Editor-Kanals nutzt die echte
  Transportschicht (`socket.remoteAddress`), nie Proxy-Header.
- Jede Preview-Statusantwort trägt den Hinweis „Nur vertrauenswürdige Repos
  starten: Preview-Befehle laufen als Server-Benutzer."

## Ungeschützte API-Pfade (A-010)

- `/api/v1/health` — lesender Liveness-Punkt ohne Identität.
- `/api/v1/previews/doctor/*` — nur Loopback + Capability-Token.
- `/api/v1/editor/*` — nur Loopback + Capability-Token (`/editor/ws` zusätzlich
  Same-Origin).
- Mutationen ohne `Origin`-/`Sec-Fetch-Site`-Header (CLI, systemd, Skripte)
  passieren die Same-Origin-Prüfung still; Browser-Mutationen mit fremder
  Origin werden mit 403 abgelehnt.

## Geschützte Serverbereiche (S-011)

- Das Terminal startet keine Prozesse mit CWD in `CONFIG_DIR` oder `DATA_DIR`
  (`deniedRoots` in `TerminalManager`, zusätzlich zur `terminalAllowedRoots`-
  Prüfung). Ein solcher Pfad endet als `INVALID_CWD`.
- Der Dateimanager verweigert Schreiben in `config/` und in die `.env`-Datei
  des Repositorys (`FILESYSTEM_CONFIG_PROTECTED`, 403). Lesen bleibt erlaubt,
  damit die Selbst-Entwicklung der Workbench weiter funktioniert.
- Ausführbare CLI-Pfade aus der Config (`hermes.cliPath`, `pythonPath`, T3)
  sind weiterhin vertrauenswürdig zu pflegen: Sie laufen als Server-Benutzer.
  Eine Binary-Allowlist dafür ist ein offener Punkt (siehe Plan S-011) — bis
  dahin gilt: Config nur direkt auf dem Server bearbeiten.

## Preview-Befehls-Bestätigung (S-013)

- Start, Launch und Restart einer Projektlaufzeit verlangen eine einmalige
  Bestätigung pro Projekt und Befehls-Hash:
  `POST /api/v1/previews/dev-servers/:projectId/confirm` mit dem angezeigten
  `commandHash` bestätigt Befehl + Pfad; `start|launch|restart` antworten sonst
  mit 409 `PREVIEW_COMMAND_UNCONFIRMED` inklusive Befehls-Vorschau.
- Ändert sich der Befehl (neuer Hash), ist eine erneute Bestätigung nötig.
- Der Watchdog startet unbestätigte Befehle nicht (derselbe Prüfpfad).

## Terminal-Arbeitsverzeichnisse

- Erlaubte Wurzeln stehen in `TERMINAL_ALLOWED_ROOTS`.
- Vor jedem Prozessstart (auch beim Wiederaufnehmen und beim automatischen Respawn des
  Supervisors) wird das Verzeichnis aufgelöst und über `realpath` gegen dieselben Wurzeln
  geprüft. Ein Verweis, der aus der Wurzel herausführt, wird abgelehnt.
- Eine persistierte Session mit unzulässigem Pfad wird sichtbar auf `interrupted`
  gesetzt statt gestartet und kann gelöscht werden.
- Beim Import laufender tmux-Sessions fällt ein Pfad außerhalb der Wurzeln auf
  `TERMINAL_DEFAULT_CWD` zurück.

## Skill-Dateien und Skill-Git

Bearbeiten und Veröffentlichen sind getrennte Fähigkeiten.

- Speichern verwendet einen inhaltsgebundenen Revisionstoken. Weicht der Stand ab,
  antwortet der Server mit `SKILLS_CONFLICT`; ein bewusstes Überschreiben sendet
  `expectedRevision: null`.
- Mehrschrittige Vorgänge (anlegen, umbenennen, löschen) laufen über ein Journal in der
  Workbench-Datenbank. Nach einem Abbruch setzt der Start sie idempotent fort;
  unklare Zustände bleiben sichtbar offen (`SKILLS_RECOVERY_REQUIRED`).
- `GET /api/v1/skills/git/preview` listet die Pfade, die ein Commit übernehmen würde.
  Nur `skills/<name>`, `README.md` und `AGENTS.md` sind erlaubt; Secrets sperren den
  gesamten Commit.
- `POST /api/v1/skills/git/commit` verlangt den `intent` aus der Vorschau.
  `POST /api/v1/skills/git/push` ist ein eigener Schritt. Der frühere kombinierte
  Endpunkt entfällt.

## Dateimanager

- Umbenennen und Verschieben verwenden atomare, zielschonende Primitive
  (Hardlink bzw. exklusive Verzeichnis-Reservierung). Ein parallel entstandenes Ziel
  endet als `FILE_EXISTS`.
- Uploads veröffentlichen die temporäre Datei erst per Hardlink; ein während des
  Uploads entstandenes Ziel wird nicht überschrieben.
- Ordner werden mit `rmdir` gelöscht: ein nach der Prüfung neu befüllter Ordner endet
  als `FILESYSTEM_DIRECTORY_NOT_EMPTY`.
- `PUT /api/v1/filesystem/state` prüft Revision und Schreiben in einer
  `BEGIN IMMEDIATE`-Transaktion.

## Terminal-Quota

- Die Quota zählt persistierte Sessions, nicht nur den Prozessspeicher. Starts
  reservieren ihren Platz atomar in der Terminaldatenbank.
- Beim Start werden Supervisor-Sessions importiert; verwaiste Einträge stehen sichtbar
  als `interrupted`.

## Audit und Diagnose

- Jede Mutation unter `/api/v1/` wird auditiert; ausgenommen sind nur hochfrequente
  Presence-Meldungen.
- Ist der Audit-Speicher nicht schreibbar, landet das pseudonymisierte Ereignis in
  `<DATABASE_PATH>.audit-outbox.jsonl` und wird beim nächsten Start nachgetragen.
  Der Diagnose-Endpunkt meldet `audit.outboxPending`.
- Logs redigieren Authorization-, Cookie- und typische Secret-Felder automatisch.

## Budgets

| Größe | Standard | Ort |
| --- | --- | --- |
| API-Anfragen pro Minute | 1 200 | `API_RATE_LIMIT_MAX` |
| WebSocket-Nutzlast | 16 MiB | `WEBSOCKET_MAX_PAYLOAD_BYTES` |
| WebSocket-Sendepuffer je Verbindung | 8 MiB (Queue), 2 MiB (Bridge) | `websocketSendQueue`, `websocketBridge` |
| Terminal-Sessions (gesamt/Art) | 24 bzw. je CLI | `TERMINAL_MAX_SESSIONS`, `CODEX_MAX_SESSIONS`, … |
| Proxy-Aufrufe | 15 s Inaktivitäts-Timeout | `PROXY_TIMEOUT_MS` |
| Upload | 200 MiB | `FILE_MANAGER_MAX_UPLOAD_BYTES` |

## Dateilängen-Baseline

- Neue oder geänderte handgeschriebene Dateien bleiben unter 400 Zeilen.
- `scripts/architecture/file-line-baseline.json` friert historische Ausnahmen auf ihren
  aktuellen Höchststand ein. Nach jeder fachlichen Aufteilung wird die Baseline gesenkt;
  eine Ausnahme, die über ihre Baseline wächst, lässt `pnpm architecture:file-lines`
  fehlschlagen.
- Seit 1.8.0 aufgeteilt: `filesystem/fileManagerService.ts` (Dateitypen und Primitiven),
  `skills/skillEditorService.ts` (Text, Git, Mutationen, Journal).

## E2E-Isolation und Flake-Budget

- Playwright startet ohne `WRAPT_E2E_PORT` auf dem separaten Testport 19310. Für einen isolierten Lauf einen freien
  Port setzen und vorher den Bereich von `WRAPT_E2E_PORT` bis `WRAPT_E2E_PORT + (Shards × 500)`
  prüfen, zum Beispiel `WRAPT_E2E_PORT=13100 pnpm test:e2e`.
- `pnpm test:e2e` baut einmal und verteilt die Spec-Dateien auf mehrere isolierte Shards.
  Jeder Shard hat einen eigenen Server, eine eigene Datenbank und einen eigenen Portblock.
  `WRAPT_E2E_SHARDS`, `WRAPT_E2E_WORKERS` und `WRAPT_E2E_PERSONA_WORKERS` steuern die
  Parallelität; `node scripts/run-e2e-shards.mjs --shards 6 --plan` zeigt die Aufteilung.
  Die CI startet sechs Shards als eigene Matrix-Jobs.
- Der E2E-Web-Build läuft über `pnpm build:e2e` und überspringt die separate Web-Typprüfung.
  `pnpm typecheck` prüft sie unabhängig davon.
- Der Testserver verwendet temporäre Daten-, Konfigurations- und Web-Build-Verzeichnisse, einen
  eigenen tmux-Socket und deaktivierte Host-Integrationen. `pnpm build:e2e` schreibt jedoch
  `apps/server/dist` im aktuellen Checkout. E2E-Läufe deshalb vorzugsweise aus einer separaten
  Arbeitskopie starten, damit ein aktiver Server-Build im normalen Checkout unverändert bleibt.
- `WRAPT_E2E_URL` ist nur für eine eigens eingerichtete Testinstanz gedacht. Nutzer-Previews
  dürfen weder als E2E-URL noch als Testziel verwendet werden. Ein externer Server
  (`WRAPT_E2E_EXTERNAL=true` oder `WRAPT_E2E_URL`) läuft bewusst ohne Sharding.
  Persona- und Workspace-Specs starten trotzdem eigene lokale Server; dafür baut
  `pnpm test:e2e` einmal lokal oder übernimmt `WRAPT_E2E_WEB_OUT_DIR`.
- Der Audit-Reporter schreibt pro Shard `test-results/shard-<n>/e2e-summary.json` und
  `-summary.md`. Der lokale Orchestrator fasst sie zu `test-results/e2e-summary.json` und
  `-summary.md` zusammen; die HTML-Berichte liegen unter `playwright-report/shard-<n>/`.
  In der CI gilt das Flake-Budget von 1 pro Shard, lokal summiert der Orchestrator alle Shards.

## Rollback

Alle Änderungen sind code- und konfigurationsseitig rückbaubar. Es gibt keine neuen
Pflichtfelder; hinzu kommt nur die additive Tabelle `skill_editor_jobs`, die gefahrlos
liegen bleiben kann. Ein Rollback auf 1.7.0 entfernt lediglich Ziel-Policy, Journal,
NoReplace und Outbox — bestehende Workspaces, Terminals und Skills bleiben lesbar.

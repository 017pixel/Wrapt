# Absicherung und Betriebsgrenzen

Dieses Dokument beschreibt die Grenzen, die aus dem Project Audit and Improvement Plan
umgesetzt wurden, ihre Konfiguration und ihren Rückbau. Es ergänzt die
[Konfiguration](configuration.md) und die [Sicherheitsausnahmen](security-exceptions.md).

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

- `pnpm test:e2e` startet einen eigenen Server auf freiem Port mit temporären Daten-,
  Konfigurations- und Web-Build-Verzeichnissen, eigenem tmux-Socket und deaktivierten
  Host-Integrationen. Nutzer-Previews und produktive Dienste werden nicht berührt.
- Der Audit-Reporter schreibt `test-results/e2e-summary.json` und `-summary.md` mit
  Skip-Gründen, Retry-Erfolgen und Projektmatrix. Das Flake-Budget beträgt 1 pro Lauf;
  darüber schlägt der Lauf sichtbar fehl.

## Rollback

Alle Änderungen sind code- und konfigurationsseitig rückbaubar. Es gibt keine neuen
Pflichtfelder; hinzu kommt nur die additive Tabelle `skill_editor_jobs`, die gefahrlos
liegen bleiben kann. Ein Rollback auf 1.7.0 entfernt lediglich Ziel-Policy, Journal,
NoReplace und Outbox — bestehende Workspaces, Terminals und Skills bleiben lesbar.

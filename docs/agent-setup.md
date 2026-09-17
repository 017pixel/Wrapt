# Agent-Setup — Wrapt einrichten

Diese Datei ist die präzise Schritt-für-Schritt-Anleitung **für einen Coding-Agenten**
(z. B. Claude Code, Codex, OpenCode), der Wrapt auf einem Server einrichtet.
Der Agent führt die Schritte aus, fragt den Benutzer nach den benötigten Werten und
verifiziert am Ende, dass alles läuft. Der kopierbare Einstiegsprompt steht in der
[README unter „Mit einem Coding-Agenten“](../README.md#mit-einem-coding-agenten-empfohlen).

> Menschliche Nutzer können denselben Ablauf manuell durchführen — siehe die
> [Installationsanleitung](installation.md).

---

## 0. Voraussetzungen (prüfen, nicht raten)

- **Betriebssystem:** Linux mit systemd (für den Dienstbetrieb). Entwicklung geht auch ohne.
- **Node.js ≥ 22** und **pnpm 10** (`scripts/install-deps.sh` prüft Node und richtet pnpm bei
  Bedarf über Corepack ein).
- **git**, **curl** und **tmux** — für Repository, Verifikation und Terminal-Sessions.
- **jq** — nur für das Tailscale-Serve-Skript (Rollback des Proxy-Zustands).
- **Tailscale** — für den privaten Remote-Zugriff (optional; lokal läuft es auch ohne).
- **code-server** — optional, nur für den eingebetteten Editor.
- **CodexBar-CLI** — optional, nur für die Nutzungs-/Limit-Historie.
- **Hermes Agent** — optional, und nur anbindbar, wenn er bereits installiert ist.

Prüfe zuerst, was vorhanden ist:
```bash
node -v; pnpm -v; git --version; tmux -V; command -v curl; command -v jq; command -v tailscale
```

---

## 1. Werte vom Benutzer erfragen

Stelle dem Benutzer diese Fragen und sammle die Antworten (Pflicht = *):

1. **Systembenutzer & Home-Verzeichnis*** — z. B. `alice` / `/home/alice`
   (Standard: aktueller Benutzer, `id -un` / `$HOME`).
2. **Projekt-Wurzelverzeichnis*** — wo liegen die Projekte? z. B. `/home/alice/projects`.
3. **Tailscale-Hostname & IP** — z. B. `server-name.tailnet.ts.net` / `100.x.y.z`
   (nur nötig für Remote-Zugriff; sonst Platzhalter lassen).
4. **HTTPS-Port für Tailscale** — Standard `8443`.
5. **Erlaubte Login-E-Mails** — die Tailscale-Identitäten, die auf die Wrapt dürfen
   (z. B. `alice@example.com`).
6. **Optionale CLI-Pfade** — `codex`, `opencode`, `claude`, `codexbar`, `tmux`
   (Standard: automatische Erkennung im PATH).
7. **CodexBar** — soll die Nutzungshistorie aktiviert werden? Falls ja: Pfad zur
   `codexbar`-Binary und zur `config.json`.
8. **Hermes** — ist Hermes Agent bereits installiert und soll es angebunden werden?

---

## 2. Konfigurationsdateien erzeugen

Es gibt genau **zwei** lokale, gitignorierte Dateien mit persönlichen Werten:

### a) `config/wrapt.local.json`
Kopiere `config/wrapt.example.json` nach `config/wrapt.local.json` und trage die
Antworten aus Schritt 1 ein. Bedeutung der Felder:

| Feld | Bedeutung |
|------|-----------|
| `branding.appName` / `shortName` | Anzeigename der App (Titel, Manifest, Footer). |
| `system.user` / `homeDirectory` | Dienstbenutzer und dessen Home. |
| `tailscale.hostname` / `ip` / `httpsPort` | Für Dev-Server-Hosts und den Reverse-Proxy. |
| `tailscale.allowedUsers` | Erlaubte Login-E-Mails (Terminal/Editor-Zugriff). |
| `tailscale.adminUsers` | Optional. Ohne Eintrag gilt der erste erlaubte Benutzer als Administrator. |
| `paths.*` | Projekt-Roots, Datenverzeichnis, Datenbank, Backups, Assets, Profile. |
| `paths.codexSharedHome` / `claudeSharedHome` / `opencodeSharedHome` | Optional. Gemeinsame Homes der KI-Werkzeuge für den Accountwechsel (Standard: `<home>/.codex`, `<home>/.claude`, `<home>/.local/share/opencode`). |
| `cli.*` | Pfade zu `codexbar`, `codex`, `opencode`, `claude`, `tmux`. |
| `codexbar.configPath` / `oauthProfileHomes` | CodexBar-Konfiguration und optionale OAuth-Profile. |
| `plugins.wraptPluginsSkillPath` | Optionaler absoluter Ersatzpfad für die `$wrapt-plugins`-Anleitung. Ohne Wert nutzt Wrapt den mitgelieferten Skill; `creatorSkillPath` bleibt als alter Schlüssel kompatibel. |
| `hermes.*` | Nur bei Hermes-Anbindung. `cliPath`, `homeDirectory`, `checkoutDirectory` und `pythonPath` trägt `scripts/install-hermes.sh` automatisch ein. |

### b) `.env`
Kopiere `.env.example` nach `.env`. Hier gehören **nur Secrets und neutrale Runtime-Knöpfe**
hinein. Persönliche Pfade/Identität gehören **nicht** in die `.env`, sondern in
`config/wrapt.local.json`.

> Env-Variablen in `.env` überschreiben still einzelne Werte aus der zentralen Config.
> Setze persönliche Pfade wie `T3_CLI_PATH`, `HERMES_CLI_PATH` oder `HERMES_HOME` deshalb
> nicht dort. `APP_VERSION` gibt es nicht mehr: Die Produktversion kommt aus `package.json`.
>
> `WRAPT_DEV_TAILSCALE_USER` niemals in die `.env` schreiben — der systemd-Dienst läuft mit
> `NODE_ENV=production` und bricht sonst beim Start ab. Für lokale Entwicklung gehört die
> Variable in die Shell (siehe Schritt 4).

---

## 3. Abhängigkeiten installieren & bauen

```bash
bash scripts/install-deps.sh
```
Das Skript prüft Node/pnpm, legt fehlende `config`/`.env` aus den Vorlagen an, installiert
die Abhängigkeiten und baut alle Pakete. Idempotent — mehrfach ausführbar.

---

## 4. Starten

**Entwicklung** (Server + Vite mit Hot-Reload, Oberfläche auf Port 5173):
```bash
WRAPT_DEV_TAILSCALE_USER=user@example.com pnpm dev
```
Den Wert aus `tailscale.allowedUsers` nehmen. Ohne ihn beantwortet das Backend alle
geschützten API-Aufrufe mit HTTP 401.

**Produktion** (Build + Server auf Port 3010):
```bash
pnpm build && pnpm start
```

**Als systemd-Dienst** (Linux, empfohlener dauerhafter Betrieb):
```bash
bash deploy/systemd/install.sh                    # rendert User-Units aus der Config und installiert sie (kein sudo)
bash deploy/proxy/configure-tailscale-serve.sh    # veröffentlicht privat im Tailnet (nutzt intern sudo)
sudo bash deploy/systemd/install-codexbar.sh      # optionaler CodexBar-Dienst (systemweit, deshalb sudo)
```
Die systemd-Units werden aus den Templates in `deploy/systemd/units/` gerendert und mit den
Werten aus `config/wrapt.local.json` gefüllt (siehe `deploy/systemd/render-units.mjs`).
Der Installationslauf baut, installiert und startet `wrapt.service` (und `code-server.service`,
falls vorhanden) und aktiviert die Units für den tmux-Terminal-Supervisor, T3 Code und
OpenCode Web. Den Supervisor startet das Backend selbst; ohne OpenCode-Binary wird dessen
Unit bewusst übersprungen. Ein Coding-Agent führt den Lauf nur aus, nachdem der Benutzer den
Dienstwechsel ausdrücklich bestätigt hat.

T3 Code und OpenCode Web sind danach noch nicht gestartet. Sie richten sich beim ersten
Backend-Neustart selbst ein (Unit-Sicherung, Prozessstart, Healthcheck; T3 Code installiert
bei Bedarf das npm-Paket) — auslösen über Einstellungen → „Dienst neu starten“ oder
`bash scripts/restart-backend.sh`. Sofort nur für T3 Code: `bash scripts/sync-t3-channel.sh`,
für OpenCode Web: `bash scripts/sync-opencode-web.sh`.

**Optional: Hermes anbinden** (nur wenn bereits installiert):
```bash
bash scripts/install-hermes.sh
```
Das Skript installiert Hermes nicht neu. Es erkennt CLI, Checkout und virtuelle
Python-Umgebung, erstellt ein Backup, baut die offizielle SPA, trägt die Pfade in
`config/wrapt.local.json` ein und installiert die User-Units.

---

## 4b. KI-Accounts registrieren (optional)

Je Werkzeug — Codex, Claude Code, OpenCode — ist serverweit **genau ein Account aktiv**.
Umgeschaltet wird nur die Anmeldung: Die Anmeldedatei im gemeinsamen Home (`auth.json`, bei
Claude Code `.credentials.json`) ist ein Symlink in den Anmeldespeicher des aktiven Accounts.
Konfiguration, Sessions und Verlauf bleiben geteilt, es gibt also weiterhin nur einen
Projekt- und Sessionbestand.

1. Bestehende Anmeldungen erkennt die Wrapt unter **Nutzung → Accounts** automatisch;
   mit „Registrieren“ werden sie aufgenommen.
2. Weitere Accounts über „Neu anmelden“ hinzufügen — die Anmeldung läuft in einem
   eingebetteten Terminal, bei Codex per Gerätecode ohne localhost-Rückruf.
3. Umschalten per „Aktivieren“ oder auf der Kommandozeile:

```bash
scripts/ki-account.sh                  # alle Accounts, der aktive ist mit * markiert
scripts/ki-account.sh use arbeit       # per Name, E-Mail oder Profilpfad aktivieren
scripts/ki-account.sh use claude privat  # bei mehrdeutigen Namen das Werkzeug voranstellen
```

Ein Account, der noch direkt auf das gemeinsame Home zeigt, bekommt beim ersten Aktivieren
automatisch einen eigenen Anmeldespeicher unter `paths.wraptProfilesRoot`. Zugangsdaten
werden dabei nie gelöscht, sondern verschoben und gesichert.

---

## 5. Verifikation (führt der Agent selbst durch)

1. **Health-Check:**
   ```bash
   curl -s http://127.0.0.1:3010/api/v1/health
   ```
   Antwort enthält `"status":"ok"`, `"appName"` mit dem konfigurierten Namen und `"version"`
   aus `package.json`.
2. **UI erreichbar:** `http://127.0.0.1:3010/wrapt/` (bzw. über Tailscale-Host:Port).
   Bei laufender Entwicklung (`pnpm dev`) ist die Oberfläche unter
   `http://127.0.0.1:5173/wrapt/` erreichbar.
3. **Projekte sichtbar:** Im Orbit erscheinen die Projekte aus `paths.projectsRoot`.
4. **Terminal/Previews/Usage** laden ohne Fehler; ein Terminal lässt sich unter einer
   erlaubten Root öffnen.
5. **Optionale Dienste:** `systemctl --user is-active wrapt-terminal-supervisor.service`
   und bei Bedarf `t3-code.service`, `opencode-web.service`, `code-server.service`,
   `hermes-dashboard.service`.

Melde dem Benutzer am Ende kurz: Was läuft, welche optionalen Dienste aktiv sind und
welche Werte in `config/wrapt.local.json` gesetzt wurden (ohne Secrets auszugeben).

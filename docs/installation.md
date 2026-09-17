# Installation

Diese Anleitung beschreibt die geprüften Installationswege für den aktuellen Stand. Der
empfohlene Dauerbetrieb nutzt Linux und systemd-User-Units. Für Entwicklung und einen
Vordergrundstart reichen Node.js und pnpm. Wer die Einrichtung einem Coding-Agenten
überlassen will, nimmt den kopierbaren Prompt aus der [README](../README.md#mit-einem-coding-agenten-empfohlen).

## Voraussetzungen

| Komponente | Erforderlich | Zweck |
| --- | --- | --- |
| Node.js 22 oder neuer | Ja | Server, Build und Werkzeuge |
| pnpm 10 | Ja | Monorepo und reproduzierbare Installation |
| git | Ja | Repository und Updates |
| curl | Ja | Health-Checks und Verifikation |
| Linux mit systemd | Nur für Dauerbetrieb | User-Dienste |
| tmux | Für Terminals | Persistente PTY-Sitzungen |
| jq | Für Tailscale-Serve | Rollback des Proxy-Zustands |
| Tailscale | Optional | Privater Remote-Zugriff |
| code-server | Optional | Eingebetteter VS-Code-Editor |
| Codex, OpenCode, Claude Code | Optional | Coding-Agenten |
| CodexBar | Optional | Nutzungs- und Limit-Historie |
| Hermes Agent | Optional | Vorhandene Hermes-Installation anbinden |

Für systemd-User-Dienste, die ohne offene SSH-Sitzung weiterlaufen sollen:

```bash
loginctl enable-linger "$(id -un)"
```

Dieser Befehl kann je nach Serverkonfiguration Administratorrechte verlangen.

## Repository klonen

```bash
git clone https://github.com/017pixel/Wrapt.git
cd Wrapt
```

Prüfe die Laufzeit:

```bash
node --version
pnpm --version
```

`scripts/install-deps.sh` verlangt Node.js 22 oder neuer. Fehlt pnpm, versucht das
Skript pnpm 10 über Corepack bereitzustellen.

## Lokale Konfiguration

```bash
cp config/wrapt.example.json config/wrapt.local.json
cp .env.example .env
```

Bearbeite danach `config/wrapt.local.json`:

1. `system.user` und `system.homeDirectory` auf den Dienstbenutzer setzen.
2. Alle Werte unter `paths` auf vorhandene, beschreibbare Verzeichnisse anpassen.
3. Unter `tailscale.allowedUsers` ausschließlich erlaubte Login-E-Mails eintragen.
4. Optional `tailscale.adminUsers` für administrative Mutationen setzen. Ohne Eintrag
   gilt aus Kompatibilitätsgründen der erste erlaubte Benutzer als Administrator.
5. CLI- und Integrationspfade prüfen oder optionale Funktionen deaktiviert lassen.

Die Vorlage verwendet ausschließlich neutrale Werte wie `your-user` und `user@example.com`.
Echte Accounts, Hostnamen oder Tokens werden nie committet.

`config/wrapt.local.json` ist die primäre Quelle für persönliche Werte. Die `.env` enthält
nur Secrets und neutrale Runtime-Einstellungen; eine dort gesetzte Variable überschreibt
still den gleichnamigen Config-Wert. Persönliche Pfade wie `T3_CLI_PATH`, `HERMES_CLI_PATH`
oder `HERMES_HOME` gehören deshalb nicht in die `.env`. `HOST=127.0.0.1` und der
Standardport `3010` bleiben erhalten. Die Produktversion kommt aus `package.json`.

Die vollständige Feldreferenz steht in [configuration.md](configuration.md).

## Abhängigkeiten und Build

```bash
bash scripts/install-deps.sh
```

Das Skript ist idempotent und führt folgende Schritte aus:

- Node- und pnpm-Version prüfen,
- fehlende lokale Vorlagen einmalig anlegen,
- `pnpm install` ausführen,
- App-Icons, Extension Contracts, Contracts, Backend und Frontend bauen.

Ein manueller, reproduzierbarer CI-naher Lauf lautet:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Startwege

### Entwicklung

```bash
pnpm dev
```

Contracts werden zuerst gebaut; Server und Vite laufen anschließend mit Hot Reload. Die
Oberfläche liegt dann unter `http://127.0.0.1:5173/wrapt/`, nicht auf Port 3010. Ohne
Tailscale-Proxy braucht der Vite-Proxy eine lokale Identität:

```bash
WRAPT_DEV_TAILSCALE_USER=user@example.com pnpm dev
```

Der Wert muss in `tailscale.allowedUsers` stehen und gehört nur in diese Shell. In der
`.env` ist die Variable verboten: Der systemd-Dienst setzt `NODE_ENV=production` und
bricht beim Start ab, wenn sie gesetzt ist.

### Produktion im Vordergrund

Nach einem erfolgreichen Build:

```bash
pnpm start
```

Der Server bindet an `127.0.0.1:3010` und liefert das gebaute Frontend aus. Dieser Weg
endet mit der Shell-Sitzung und ist deshalb nicht für einen dauerhaften Server vorgesehen.

### Produktion als systemd-User-Dienst

```bash
bash deploy/systemd/install.sh
```

Der Installer:

- rendert die Units aus `deploy/systemd/units/`,
- installiert mit eingefrorenem Lockfile,
- führt Typecheck und Build aus,
- validiert die gerenderten Units,
- sichert vorhandene User-Units,
- installiert und startet `wrapt.service`, dazu `code-server.service`, wenn eine
  code-server-Binary im `PATH` liegt,
- aktiviert die Units für T3 Code, OpenCode Web (nur bei vorhandener Binary) und den
  tmux-Terminal-Supervisor,
- prüft den Health-Endpunkt.

Der Lauf verändert aktive Dienste. Starte ihn nur, wenn der Dienstwechsel gewollt ist.
Für den normalen Betrieb ist kein `sudo` nötig. Die kanonische Unit liegt unter
`~/.config/systemd/user/wrapt.service`, der Terminal-Supervisor unter
`~/.config/systemd/user/wrapt-terminal-supervisor.service`.

T3 Code und OpenCode Web werden beim ersten Backend-Neustart vollständig eingerichtet und
gestartet (Unit-Sicherung, Prozessstart, Healthcheck; T3 Code installiert bei Bedarf das
npm-Paket): Einstellungen → „Dienst neu starten“, `bash scripts/restart-backend.sh` oder
`bash scripts/restart-all.sh`. Sofort nur für T3 Code: `bash scripts/sync-t3-channel.sh`,
für OpenCode Web: `bash scripts/sync-opencode-web.sh`.

Status und Logs:

```bash
systemctl --user status wrapt.service
systemctl --user status wrapt-terminal-supervisor.service
journalctl --user -u wrapt.service -n 200 --no-pager
```

## Privater Zugriff mit Tailscale

Nach einer funktionierenden lokalen Installation:

```bash
bash deploy/proxy/configure-tailscale-serve.sh
```

Das Skript verwendet Hostname und HTTPS-Port aus `config/wrapt.local.json` und nutzt
intern `sudo` für `tailscale serve`. Wrapt, code-server und die integrierten Proxys
bleiben auf Loopback; Tailscale Serve übernimmt den privaten HTTPS-Zugang. Funnel und
öffentliche Portweiterleitungen bleiben deaktiviert.

Preview-Slot-Ports werden getrennt konfiguriert. Änderungen daran erfordern eine bewusste
erneute Proxy-Konfiguration; Details stehen in [configuration.md](configuration.md).

## Optionale Integrationen

### code-server

Ist `code-server` beim systemd-Installationslauf im `PATH`, wird
`code-server.service` mitinstalliert. Die lokale Konfiguration wird bei Bedarf aus
`config/code-server.yaml.example` erzeugt. Der Dienst bindet an `127.0.0.1:8080`
und wird nur über den geschützten Wrapt-Pfad `/editor/` erreicht.

### Hermes Agent

Eine bestehende Hermes-Installation lässt sich anbinden mit:

```bash
bash scripts/install-hermes.sh
```

Das Skript installiert Hermes nicht neu. Es erkennt CLI, Checkout und virtuelle
Python-Umgebung, erstellt zuerst ein Backup, baut die offizielle SPA, trägt die
gefundenen Pfade in `config/wrapt.local.json` ein und installiert die zugehörigen
User-Units. API-Schlüssel und Sessions verbleiben bei Hermes.

Prüfung:

```bash
systemctl --user is-active hermes-dashboard.service hermes-gateway.service
curl -f -H 'Host: 127.0.0.1:9119' http://127.0.0.1:9119/api/status
```

### CodexBar

CodexBar liefert die lokale Nutzungs- und Limit-Historie. Es ist die einzige Komponente
mit systemweiter Unit und benötigt `sudo`:

```bash
sudo bash deploy/systemd/install-codexbar.sh
```

Das Skript verlangt eine `codexbar`-Binary im `PATH` und installiert `codexbar.service`
auf `127.0.0.1:18181`. `cli.codexbar` aus der Config bestimmt nur den ExecStart-Pfad der
gerenderten Unit, nicht die PATH-Voraussetzung des Installers.

## Abschlussprüfung

```bash
curl -f http://127.0.0.1:3010/api/v1/health
```

Die Antwort enthält `status: "ok"`, die Produktversion aus `package.json`, den
konfigurierten `appName`, eine `bootId` und eine `webBuildId`. Prüfe anschließend:

- `http://127.0.0.1:3010/wrapt/` lädt (bei `pnpm dev` stattdessen
  `http://127.0.0.1:5173/wrapt/`),
- Projekte aus `paths.projectsRoot` erscheinen,
- ein Terminal unter einer erlaubten Root geöffnet werden kann,
- aktivierte optionale Werkzeuge erreichbar sind,
- über Tailscale nur konfigurierte Identitäten Zugriff erhalten.

## Aktualisieren

```bash
git pull --ff-only
bash scripts/install-deps.sh
```

Bei Vordergrundbetrieb genügt danach ein neuer `pnpm start`. Bei systemd-Betrieb führt
`bash deploy/systemd/install.sh` den geprüften Build und den Dienstwechsel aus. Für eine
laufende Workbench gibt es zusätzlich den Weg über Einstellungen → „Dienst neu starten“
beziehungsweise `bash scripts/restart-all.sh`. Vor einem Update empfiehlt sich eine
Sicherung des konfigurierten `dataDir`.

## Entfernen

Die User-Units lassen sich ohne Datenlöschung stoppen und deaktivieren:

```bash
systemctl --user disable --now wrapt.service wrapt-terminal-supervisor.service
```

Optionale Units wie `code-server.service`, `t3-code.service`, `opencode-web.service` und
`codexbar.service` nur mit entfernen, wenn sie nicht anderweitig gebraucht werden.
Repository, `config/wrapt.local.json`, `.env` und `dataDir` bleiben dabei erhalten.
Lösche persistierte Daten nur nach einer eigenen Sicherung und bewussten Prüfung der in
`paths` konfigurierten Ziele.

Probleme und bekannte Diagnosewege stehen in [troubleshooting.md](troubleshooting.md).

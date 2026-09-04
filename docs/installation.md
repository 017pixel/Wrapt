# Installation

Diese Anleitung beschreibt die geprüften Installationswege für Wrapt 1.0.1. Der
empfohlene Dauerbetrieb nutzt Linux und systemd-User-Units. Für Entwicklung und einen
Vordergrundstart reichen Node.js und pnpm.

## Voraussetzungen

| Komponente | Erforderlich | Zweck |
| --- | --- | --- |
| Node.js 22 oder neuer | Ja | Server, Build und Werkzeuge |
| pnpm 10 | Ja | Monorepo und reproduzierbare Installation |
| Linux mit systemd | Nur für Dauerbetrieb | User-Dienste |
| tmux | Für Terminals | Persistente PTY-Sitzungen |
| Chromium oder Chrome | Optional | Integrierter Server-Browser |
| Tailscale | Optional | Privater Remote-Zugriff |
| code-server | Optional | Eingebetteter VS-Code-Editor |
| Codex, OpenCode, Claude Code | Optional | Coding-Agenten |
| Mistral API-Key | Optional | KI-Funktionen in Tech TLDRs |

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

Die Vorlage verwendet ausschließlich neutrale Werte wie `your-user` und
`user@example.com`. Echte Accounts, Hostnamen oder Tokens werden nie committet.

In `.env` bleiben `HOST=127.0.0.1` und der Standardport `3010` erhalten. Secrets wie
`MISTRAL_API_KEY` gehören nur in diese gitignorierte Datei.

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

Contracts werden zuerst gebaut; Server und Vite laufen anschließend mit Hot Reload.

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
- installiert und startet `wrapt.service`,
- installiert optionale erkannte Dienste und prüft den Health-Endpunkt.

Der Lauf verändert aktive Dienste. Starte ihn nur, wenn der Dienstwechsel gewollt ist.
Für den normalen Betrieb ist kein `sudo` nötig. Die kanonische Unit liegt unter
`~/.config/systemd/user/wrapt.service`.

Status und Logs:

```bash
systemctl --user status wrapt.service
journalctl --user -u wrapt.service -n 200 --no-pager
```

## Privater Zugriff mit Tailscale

Nach einer funktionierenden lokalen Installation:

```bash
bash deploy/proxy/configure-tailscale-serve.sh
```

Das Skript verwendet Hostname und HTTPS-Port aus `config/wrapt.local.json`. Wrapt,
code-server und die integrierten Proxys bleiben auf Loopback; Tailscale Serve übernimmt
den privaten HTTPS-Zugang. Funnel und öffentliche Portweiterleitungen bleiben deaktiviert.

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

Der Hermes-Checkout und `HERMES_HOME` bleiben außerhalb dieses Repositorys. Das Skript
erstellt zuerst ein Backup, baut die offizielle SPA und installiert die zugehörigen
User-Units. API-Schlüssel und Sessions verbleiben bei Hermes.

Prüfung:

```bash
systemctl --user is-active hermes-dashboard.service hermes-gateway.service
curl -f -H 'Host: 127.0.0.1:9119' http://127.0.0.1:9119/api/status
```

## Abschlussprüfung

```bash
curl -f http://127.0.0.1:3010/api/v1/health
```

Die Antwort muss `status: "ok"`, `version: "1.1.0"`, eine `bootId` und eine
`webBuildId` enthalten. Prüfe anschließend:

- `http://127.0.0.1:3010/wrapt/` lädt,
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
`bash deploy/systemd/install.sh` den geprüften Build und den Dienstwechsel aus. Vor einem
Update empfiehlt sich eine Sicherung des konfigurierten `dataDir`.

## Entfernen

Die User-Unit lässt sich ohne Datenlöschung stoppen und deaktivieren:

```bash
systemctl --user disable --now wrapt.service
```

Repository, `config/wrapt.local.json`, `.env` und `dataDir` bleiben dabei erhalten.
Lösche persistierte Daten nur nach einer eigenen Sicherung und bewussten Prüfung der in
`paths` konfigurierten Ziele.

Probleme und bekannte Diagnosewege stehen in [troubleshooting.md](troubleshooting.md).

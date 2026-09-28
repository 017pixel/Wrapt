# Open-Source-Projekte und Lizenz

Wrapt baut auf mehreren eigenständigen Open-Source-Projekten auf. Einige werden direkt in der Oberfläche eingebettet, andere bilden technische Grundlagen für Terminal, Server oder privaten Netzwerkzugriff. Sie behalten ihre eigenen Repositories, Releases und Lizenzbedingungen.

## Werkzeuge, die sich in Wrapt öffnen lassen

| Projekt | Rolle in Wrapt | Eigenständigkeit |
| --- | --- | --- |
| [T3 Code](https://github.com/pingdotgg/t3code) | Oberfläche für Coding-Agenten. Wrapt verwaltet den lokalen Dienst und stellt ihn über einen Proxy in der Workbench dar. | T3 Code ist ein eigenes Projekt mit eigenem Release-Kanal und eigener Oberfläche. |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Eine vorhandene Hermes-Installation kann mit Wrapt verbunden werden; die offizielle Weboberfläche erscheint eingebettet. | `scripts/install-hermes.sh` installiert Hermes nicht neu. Hermes-Sitzungen und Schlüssel bleiben bei Hermes. |
| [code-server](https://github.com/coder/code-server) | Optionaler Editor im Browser über den geschützten Pfad `/editor/`. | Separater Dienst. Er stellt eine Browseroberfläche auf Basis von [Visual Studio Code](https://code.visualstudio.com/) bereit. |
| [OpenCode](https://github.com/anomalyco/opencode) | Coding-Agent mit eigener Weboberfläche, erreichbar in Wrapt über den Proxy `/opencode`. | Der CLI-Prozess, seine Weboberfläche und sein Benutzerprofil gehören zum OpenCode-Projekt. |
| [CodexBar](https://github.com/steipete/CodexBar) | Optionaler Import von Nutzungs- und Limitdaten für die Wrapt-Übersicht. | Eigenständiges Werkzeug; seine Datenquelle und Installation werden separat eingerichtet. |

Die Verfügbarkeit ist installationsabhängig. T3 Code und OpenCode werden bei passender Konfiguration durch Wrapts Betriebsablauf bereitgestellt; code-server ist optional. Hermes muss bereits installiert sein und wird bewusst als vorhandene Installation angebunden. Siehe [Installation und erster Start](../betrieb/installation-erster-start.md).

Weitere Werkzeuge wie Codex oder Claude Code können ebenfalls über ihre eigenen CLI-Installationen genutzt werden. Wrapt bündelt deren Bedienung, ist aber nicht deren Herausgeber und ersetzt ihre jeweiligen Bedingungen oder Anbieter.

## Technische Grundlagen

| Projekt | Verwendung |
| --- | --- |
| [tmux](https://github.com/tmux/tmux) | Hält Terminalprozesse in Sitzungen auf dem Server aktiv, auch wenn sich ein Browser trennt. |
| [node-pty](https://github.com/microsoft/node-pty) | Stellt serverseitig Pseudoterminals bereit, an die Wrapt-Terminals angeschlossen werden. |
| [xterm.js](https://github.com/xtermjs/xterm.js) | Rendert die Terminalanzeige im Browser. |
| [Tailscale](https://github.com/tailscale/tailscale) | Optionaler privater Netzwerkzugang und HTTPS-Veröffentlichung im Tailnet. Die Verbindung setzt eine eigene Tailscale-Umgebung voraus. |
| [React](https://github.com/facebook/react) | Grundlage der Wrapt-Weboberfläche. |
| [Fastify](https://github.com/fastify/fastify) | HTTP-Server und API-Framework des Wrapt-Backends. |
| [Vite](https://github.com/vitejs/vite) | Entwicklungsserver und Buildwerkzeug für die Weboberfläche. |
| [Zod](https://github.com/colinhacks/zod) | Validiert API- und Extension-Verträge zwischen den Teilen von Wrapt. |
| [Tauri](https://github.com/tauri-apps/tauri) | Framework des eigenständigen Desktop-Launchers im Verzeichnis `tools/launcher/`. |

Die Tabelle nennt wichtige Projekte, aber nicht jede transitive Paketabhängigkeit. Die direkten JavaScript-Abhängigkeiten und ihre Versionen stehen in den jeweiligen `package.json`-Dateien und im [pnpm-Lockfile](https://github.com/017pixel/Wrapt/blob/master/pnpm-lock.yaml). Jedes Drittprojekt behält seine eigene Lizenz und seine eigenen Nutzungsbedingungen.

## Lizenz von Wrapt

Der Quellcode dieses Repositories steht unter der MIT-Lizenz. Der Urheberrechtshinweis in der mitgelieferten [LICENSE-Datei](https://github.com/017pixel/Wrapt/blob/master/LICENSE) lautet `Copyright (c) 2026 017pixel`.

Die MIT-Lizenz erlaubt unter ihren Bedingungen die Nutzung, Veränderung, Weitergabe und den Verkauf von Kopien. Bei Weitergabe müssen der Urheberrechtshinweis und der Lizenztext erhalten bleiben. Der Code wird ohne Gewährleistung bereitgestellt, wie es der Lizenztext beschreibt.

Diese Lizenz gilt für Wrapts eigene Inhalte, soweit sie nicht ausdrücklich anders gekennzeichnet sind. Sie überträgt nicht die Rechte an T3 Code, Hermes Agent, code-server, OpenCode, an Paketabhängigkeiten oder an Marken und Icons Dritter. Prüfe für diese Bestandteile die Lizenzhinweise des jeweiligen Projekts. Diese Seite ist eine verständliche Zusammenfassung und ersetzt nicht den vollständigen Lizenztext.

## Beiträge willkommen

Fehlerberichte und Verbesserungsvorschläge kannst du im [GitHub-Repository](https://github.com/017pixel/Wrapt) einreichen. Für Änderungen am Code lies bitte zuerst [Mitarbeiten](mitarbeiten.md). Die Installations- und Sicherheitsseiten helfen dabei, die Grenzen des tatsächlichen Betriebsmodells zu verstehen.

# Architektur auf einen Blick

Wrapt besteht aus der Weboberfläche und einem lokalen Backend. Dieses Backend verbindet die Oberfläche mit Projektdateien, lokaler Datenbank und unabhängig laufenden Werkzeugen. Im Alltag muss man die internen Protokolle nicht kennen: Entscheidend ist, welche Komponente die Arbeit ausführt und wo ihre Daten liegen.

## Die Teile im Zusammenspiel

| Teil | Aufgabe |
| --- | --- |
| Browser | Zeigt die Wrapt-Oberfläche und eingebettete Werkzeuge an. |
| Wrapt-Backend | Liefert die Oberfläche aus, prüft Zugriffe, stellt die API bereit und verbindet lokale Dienste. |
| Lokale Daten | Speichern Wrapt-Einstellungen und Arbeitsbereichsdaten außerhalb des Git-Repositories. |
| Eigenständige Werkzeuge | Führen Editor, Coding-Agent, Hermes, Terminal oder Entwicklungsserver aus. |
| Privater Zugang | Tailscale Serve kann den lokalen Dienst innerhalb eines Tailnet per HTTPS erreichbar machen. |

In einer üblichen Installation öffnet der Browser Wrapt auf Port `3010`. Entwicklungsserver und die meisten integrierten Werkzeuge lauschen nur auf Loopback. Wrapt leitet Browseranfragen über geschützte Pfade an diese Dienste weiter. So können eigenständige Werkzeuge in der Oberfläche erscheinen, ohne dass Wrapt ihre gesamte Implementierung übernimmt.

## Eigenständige Werkzeuge bleiben eigenständig

T3 Code, OpenCode Web, code-server und Hermes Agent haben jeweils einen eigenen Prozess und ihre eigenen Betriebsbedingungen. Wrapt bettet ihre Weboberflächen ein oder stellt einen passenden Proxy bereit. Der Proxy behandelt HTTP- und WebSocket-Verbindungen; die Anwendung dahinter bleibt die des jeweiligen Projekts.

Das hat praktische Folgen:

- Ein optionales Werkzeug kann fehlen, ohne dass dadurch alle Wrapt-Funktionen ausfallen.
- Installations- und Updatewege unterscheiden sich je Werkzeug.
- Sitzungen und Konten verbleiben grundsätzlich beim jeweiligen Werkzeug.
- Der Status von Wrapt allein sagt nicht aus, ob jeder optionale Dienst ebenfalls läuft.

Details zu den einzelnen Projekten stehen unter [Open-Source-Projekte](open-source.md), zu den sichtbaren Werkzeugen unter [Werkzeuge](../produkt/werkzeuge.md).

## Terminal und Preview

Ein Wrapt-Terminal verbindet die Browseranzeige mit einem serverseitigen Pseudoterminal. Für dauerhafte Sitzungen hält tmux den Prozess über Browser- oder Backend-Verbindungen hinweg am Leben. Die Browserseite zeigt den Terminalinhalt mit xterm.js an. Diese Aufteilung ermöglicht das Wiederverbinden mit einer laufenden Sitzung, statt bei jedem Seitenwechsel eine neue Shell anzulegen.

Eine Preview zeigt dagegen den Entwicklungsserver eines Projekts. Wrapt merkt sich die Zuordnung zwischen Projekt, lokalem Dienst und Preview-Slot. Für getrennte Web-Speicher können Vorschauen eigene Origins erhalten; Cookies werden dadurch nicht automatisch getrennt. Hinweise zu Sessions und Browserverhalten stehen unter [Previews](../produkt/previews.md).

## Wo Daten liegen

| Daten | Speicherort und Zuständigkeit |
| --- | --- |
| Wrapt-Arbeitsbereich und lokale Verwaltungsdaten | SQLite im konfigurierten Wrapt-Datenverzeichnis. |
| Projektdateien | In den vom Betreiber konfigurierten Projektwurzeln. |
| Layout der Oberfläche | Im lokalen Browser-Speicher. |
| Terminalprozesse | In tmux-Sitzungen auf dem Wrapt-Server; Wrapt verwaltet ihre Metadaten. |
| Hermes-Sitzungen und Agentenkonfiguration | Bei Hermes Agent. |
| CLI-Konten und Zugangsdaten | In den lokalen Profilen der jeweiligen Werkzeuge beziehungsweise in der serverseitigen Integration. |

Wrapt hält lokale Daten und Werkzeugzustand getrennt. Das bedeutet nicht, dass beliebige Coding-Agenten keine Informationen an ihre konfigurierten Modellanbieter senden: Das hängt vom verwendeten Agenten, dessen Einstellungen und dem Anbieter ab.

## Zugriff und Schutzgrenzen

Wrapt bindet standardmäßig an `127.0.0.1`. Bei privatem Fernzugriff übernimmt Tailscale die Netzwerkverbindung und liefert die Identität, gegen die Wrapt geschützte Anfragen prüft. Änderungen verlangen zusätzlich eine passende Same-Origin-Anfrage. Der eingebaute Editor, Terminals und externe Werkzeuge werden nicht als öffentliche Dienste beworben.

Diese Architektur unterstützt privaten Zugriff, ersetzt aber keine passende System- und Kontosicherung. Welche Identitäten erlaubt sind und welche Grenzen gelten, erklärt die Seite [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md). Konfigurationswerte stehen in [Konfigurieren](../betrieb/konfigurieren.md).

## Monorepo in Kürze

Wrapts eigener Quellcode ist in mehrere Projekte aufgeteilt:

- `apps/server`: Backend, API, lokale Dienste und Proxys.
- `apps/web`: React-Oberfläche für Browser und mobile Geräte.
- `packages/contracts`: gemeinsam verwendete API-Schemas.
- `packages/extension-contracts`: Verträge für versionierte Extensions.
- `extensions/`: mitgelieferte Erweiterungspakete.
- `config/`: Vorlagen und zentrale Konfigurationsbeispiele.

Mehr Details zur Einrichtung enthält [Installation und erster Start](../betrieb/installation-erster-start.md); der Quellcode liegt im [GitHub-Repository](https://github.com/017pixel/Wrapt).

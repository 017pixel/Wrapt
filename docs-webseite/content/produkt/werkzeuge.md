# Coding-Werkzeuge

Wrapt stellt mehrere Coding-Umgebungen an einem Ort bereit. Die Werkzeuge bleiben eigenständige Projekte mit ihren eigenen Oberflächen und Konten; Wrapt verbindet sie mit Projektwahl, Navigation und Serverbetrieb.

| Werkzeug | Wofür es gedacht ist | Wo es in Wrapt erscheint |
| --- | --- | --- |
| [T3 Code](https://github.com/pingdotgg/t3code) | Browserbasierte Oberfläche für Codex-Arbeitsabläufe | Eigene Seite und Projektfläche |
| [OpenCode](https://opencode.ai/) ([Quellcode](https://github.com/anomalyco/opencode)) | Coding-Agent mit offizieller Weboberfläche und CLI | OpenCode-Webseite und Projektfläche |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Agent mit Chat, Automatisierungen und Verwaltungsfunktionen | Offizielle Hermes-Weboberfläche |
| [code-server](https://github.com/coder/code-server) | VS-Code-ähnlicher Editor im Browser | Code-Server-Seite und Projektfläche |
| Codex und Claude Code | CLI-Werkzeuge in einer interaktiven PTY-Sitzung | Eigene Terminalbereiche |

![T3 Code im Dark Mode ohne angemeldetes Konto](../assets/04-t3-code.png)

## Werkzeug auswählen

1. Wähle links das gewünschte Werkzeug oder öffne ein Projekt.
2. Prüfe, ob die Instanz das Werkzeug eingerichtet und erreichbar hat.
3. Wähle im Projektkontext den passenden Ordner, sofern das Werkzeug eine Projektbindung unterstützt.
4. Arbeite in der Oberfläche des Werkzeugs. Bestätigungen, Anmeldung und Agentenrichtlinien gehören weiterhin zum jeweiligen Werkzeug.

Die vier integrierten Anwendungen sind optionale serverseitige Dienste. Ob eine Seite funktioniert, hängt von Installation, Konfiguration und erreichbarem Dienst ab. Nicht eingerichtete Werkzeuge können in der Oberfläche angezeigt werden, ohne dass damit ein funktionsfähiger Dienst zugesichert ist.

## T3 Code

T3 Code wird als eigenständige Webanwendung in die Wrapt-Oberfläche eingebettet. Du kannst die Seite direkt öffnen oder eine T3-Fläche in Orbit verwenden. Für einen verfügbaren Code-Server kann T3 den Editor zum Projektordner öffnen.

Die Instanz verwaltet den Stable- oder Nightly-Kanal. Ein Kanalwechsel wird beim nächsten Backend-Neustart wirksam. Anmeldung und T3-Sitzungen gehören zu T3; Wrapt bietet dafür die Einbettung und Projektverknüpfung.

## OpenCode

Wrapt bettet die offizielle OpenCode-Weboberfläche unter der OpenCode-Seite ein. Die CLI und Weboberfläche nutzen dasselbe OpenCode-Home, sodass bestehende Sessions und der aktive Account gemeinsam verwaltet werden. OpenCode bleibt ein eigener Dienst auf dem Wrapt-Server und wird über die geschützte Wrapt-Adresse bereitgestellt.

Für den üblichen Ablauf öffnest du OpenCode direkt oder startest die Weboberfläche aus einer Projektfläche. Anmeldung, Modelle und Provider werden in OpenCode eingerichtet. Die Oberfläche läuft nicht als allgemeiner, ungeschützter öffentlicher Dienst.

## Hermes Agent

Wrapt bindet die offizielle Hermes-SPA ein. Sie umfasst die Hermes-eigenen Bereiche für Chat, Cron, Skills, Webhooks, Kanäle, Profile und weitere Verwaltung. Die Hermes-Konfiguration und Zugangsdaten bleiben in Hermes; Wrapt verschiebt sie nicht in Browserzustand.

Die sichtbare Chatoberfläche wird durch die Hermes-Webanwendung bereitgestellt. Wrapts Chat- und ACP-Schnittstellen dienen internen Abläufen und sind keine zweite, abweichende Chatoberfläche. Für die Integration muss Hermes bereits eingerichtet beziehungsweise durch den vorgesehenen Installer angebunden sein.

## code-server

Code-Server bringt eine VS-Code-ähnliche Entwicklungsumgebung in den Browser. Öffne die Code-Server-Seite oder starte den Editor aus einem Projekt. Wrapt übergibt den Projektordner; Dateien und Erweiterungen bearbeitest du anschließend im eingebetteten Editor.

![code-server ohne persönliche Dateien](../assets/05-code-server.png)

Die Projektbindung setzt voraus, dass der Editor auf dem Server verfügbar ist und der angeforderte Ordner innerhalb der freigegebenen Projektpfade liegt. code-server hat eine eigene Erweiterungs- und Anmeldelogik.

## Codex und Claude Code

Codex und Claude Code sind im Wrapt-Kontext interaktive CLI-Sitzungen in einem beaufsichtigten Terminal. Wähle den jeweiligen Bereich, dann das Projekt. Die CLI behält ihre eigenen Freigabe- und Sicherheitsdialoge. Weitere Details zu Wiederaufnahme, Split-Ansicht und Tastaturbedienung stehen unter [Terminal](./terminal.md).

## Grenzen und Herkunft

- Wrapt installiert nicht automatisch alle Anbieterwerkzeuge bei jedem Projektaufruf. Betreiber richten optionale Dienste und Pfade in der Instanz ein.
- Die Drittanbieteroberflächen behalten ihren eigenen Funktionsumfang und ihre eigenen Datenmodelle.
- Zugangsdaten bleiben in den jeweiligen serverseitigen Werkzeugprofilen. Sie gehören nicht in eine öffentliche Doku, Screenshots oder Clientzustand.
- T3 Code, Hermes Agent, OpenCode und code-server sind eigenständige Open-Source-Projekte; Wrapt integriert sie und beansprucht nicht deren Urheberschaft. [VS Code](https://github.com/microsoft/vscode) ist die Grundlage des code-server-Erlebnisses.

## Weiterlesen

- [Terminal und CLI-Sitzungen](./terminal.md)
- [Orbit](./orbit.md)
- [Installation und optionale Dienste](https://github.com/017pixel/Wrapt/blob/master/docs/installation.md)
- [Integrationskonfiguration](https://github.com/017pixel/Wrapt/blob/master/docs/configuration.md)

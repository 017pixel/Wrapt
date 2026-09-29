# Coding-Werkzeuge

In Wrapt öffnest du mehrere Coding-Umgebungen an einem Ort. Die Werkzeuge bleiben eigenständige Projekte mit ihren eigenen Oberflächen und Konten; Wrapt verbindet sie mit Projektwahl, Navigation und Serverbetrieb.

| Werkzeug | Wofür es gedacht ist | Wo es in Wrapt erscheint |
| --- | --- | --- |
| [T3 Code](https://github.com/pingdotgg/t3code) | Browserbasierte Oberfläche für Codex-Arbeitsabläufe | Eigene Seite und Projektfläche |
| [OpenCode](https://opencode.ai/) ([Quellcode](https://github.com/anomalyco/opencode)) | Coding-Agent mit offizieller Weboberfläche und CLI | OpenCode-Webseite und Projektfläche |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Agent mit Chat, Automatisierungen und Verwaltungsfunktionen | Offizielle Hermes-Weboberfläche |
| [code-server](https://github.com/coder/code-server) | VS-Code-ähnlicher Editor im Browser | code-server-Seite und Projektfläche |
| Codex und Claude Code | CLI-Werkzeuge in einer interaktiven PTY-Sitzung | Eigene Terminalbereiche |

![T3 Code im Dark Mode ohne angemeldetes Konto](../assets/04-t3-code.png)

## Werkzeug auswählen

1. Wähle links das gewünschte Werkzeug oder öffne ein Projekt.
2. Prüfe, ob die Instanz das Werkzeug eingerichtet und erreichbar hat.
3. Im Projektkontext wählst du den passenden Ordner, sofern das Werkzeug eine Projektbindung unterstützt.
4. Arbeite in der Oberfläche des Werkzeugs. Bestätigungen, Anmeldung und Agentenrichtlinien bleiben beim jeweiligen Werkzeug.

Die vier integrierten Anwendungen sind optionale Dienste auf dem Server. Eine Seite funktioniert nur, wenn der Dienst installiert, eingerichtet und erreichbar ist; ein sichtbarer Eintrag sagt das nicht.

## T3 Code

T3 Code wird als eigenständige Webanwendung in die Wrapt-Oberfläche eingebettet. Du kannst die Seite direkt öffnen oder eine T3-Fläche in Orbit verwenden. Wenn code-server verfügbar ist, öffnet T3 den Editor zum Projektordner.

Die Instanz verwaltet den Stable- oder Nightly-Kanal. Ein Kanalwechsel wirkt beim nächsten Backend-Neustart. Anmeldung und T3-Sitzungen gehören zu T3; von Wrapt kommen Einbettung und Projektverknüpfung.

## OpenCode

Wrapt bettet die offizielle OpenCode-Weboberfläche auf der OpenCode-Seite ein. CLI und Weboberfläche nutzen dasselbe OpenCode-Home, bestehende Sessions und der aktive Account liegen also gemeinsam vor. OpenCode bleibt ein eigener Dienst auf dem Wrapt-Server und ist nur über die geschützte Wrapt-Adresse erreichbar.

Für den üblichen Ablauf öffnest du OpenCode direkt oder startest die Weboberfläche aus einer Projektfläche. Anmeldung, Modelle und Provider richtest du in OpenCode ein. Die Oberfläche ist kein ungeschützter öffentlicher Dienst.

## Hermes Agent

Wrapt bindet die offizielle Hermes-SPA ein. Sie enthält die Hermes-Bereiche für Chat, Cron, Skills, Webhooks, Kanäle, Profile und weitere Verwaltung. Hermes-Konfiguration und Zugangsdaten bleiben in Hermes und wandern nicht in den Browserzustand.

Die sichtbare Chatoberfläche kommt aus der Hermes-Webanwendung. Wrapts Chat- und ACP-Schnittstellen dienen internen Abläufen und sind keine zweite Chatoberfläche. Für die Integration muss Hermes eingerichtet oder über den vorgesehenen Installer angebunden sein.

## code-server

code-server bringt eine VS-Code-ähnliche Umgebung in den Browser. Öffne die code-server-Seite oder starte den Editor aus einem Projekt. Wrapt übergibt den Projektordner; Dateien und Erweiterungen bearbeitest du anschließend im eingebetteten Editor.

![code-server ohne persönliche Dateien](../assets/05-code-server.png)

Die Projektbindung setzt voraus, dass der Editor auf dem Server installiert ist und der angeforderte Ordner innerhalb der freigegebenen Projektpfade liegt. code-server hat eine eigene Erweiterungs- und Anmeldelogik.

## Codex und Claude Code

Codex und Claude Code laufen in Wrapt als interaktive CLI-Sitzungen in einem beaufsichtigten Terminal. Wähle den jeweiligen Bereich, dann das Projekt. Die CLI behält ihre Freigabe- und Sicherheitsdialoge. Details zu Wiederaufnahme, Split-Ansicht und Tastaturbedienung stehen unter [Terminal](./terminal.md).

## Grenzen

- Wrapt installiert nicht bei jedem Projektaufruf alle Anbieterwerkzeuge. Optionale Dienste und Pfade richtet der Betreiber ein.
- Die Drittanbieteroberflächen behalten ihren Funktionsumfang und ihre Datenmodelle.
- Zugangsdaten bleiben in den serverseitigen Werkzeugprofilen. Sie gehören nicht in die Doku, in Screenshots oder in den Clientzustand.

T3 Code, Hermes Agent, OpenCode und code-server sind eigenständige Open-Source-Projekte; Wrapt integriert sie und beansprucht keine Urheberschaft. [VS Code](https://github.com/microsoft/vscode) ist die Grundlage des code-server-Erlebnisses. Lizenzen und Projektlisten stehen unter [Open-Source-Projekte und Lizenz](../projekt/open-source.md).

## Weiterlesen

- [Terminal und CLI-Sitzungen](./terminal.md)
- [Orbit](./orbit.md)
- [Installation und optionale Dienste](https://github.com/017pixel/Wrapt/blob/master/docs/installation.md)
- [Integrationskonfiguration](https://github.com/017pixel/Wrapt/blob/master/docs/configuration.md)

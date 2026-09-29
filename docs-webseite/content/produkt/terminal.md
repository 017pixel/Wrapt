# Terminal

Im Wrapt-Terminal laufen interaktive Shell- und Coding-CLI-Sitzungen im Browser. Eine Sitzung läuft auf dem Server weiter, auch wenn du zu einem anderen Bereich wechselst oder die Browserseite schließt.

![Terminal mit neutralem Beispiel-Prompt](../assets/07-terminal.png)

## Eine Sitzung starten

1. Öffne **Terminal**, **Codex** oder **Claude Code**.
2. Wähle ein verfügbares Projekt. Wrapt startet eine neue Sitzung im Projektordner oder aktiviert einen bereits offenen Tab für dieses Projekt.
3. Arbeite in der Shell oder CLI. Die Eingabe verhält sich wie in einem echten Terminal; es ist kein einfacher API-Command-Runner.
4. Öffne die Sitzung später wieder über den Tab oder die Sessionliste.

Codex und Claude Code starten mit ihrer regulären CLI und behalten deren Sicherheits- und Bestätigungsdialoge. OpenCode läuft als Weboberfläche in einer eigenen Wrapt-Fläche; die Terminalseite ist dafür nicht der übliche Einstieg.

## Tabs, Split und parallele Geräte

Ein Terminalbereich kann mehrere nummerierte Sitzungen verwalten. Auf dem Desktop lässt sich eine weitere Sitzung neben der aktiven Sitzung teilen. Ein Tabwechsel ändert die Shell einer laufenden Sitzung nicht. Auf schmalen Touch-Displays wird jeweils ein Pane angezeigt; eine vorhandene Teilung bleibt für die breite Ansicht erhalten.

Mehrere Geräte dürfen dieselbe Sitzung öffnen. Sie sehen dieselbe Ausgabe und teilen sich die Eingabe. Das zuerst verbundene Gerät steuert die gemeinsame Zeilen- und Spaltengeometrie; trennt es die Verbindung, kann ein anderes Gerät übernehmen.

**In neuem Tab öffnen** zeigt eine laufende Sitzung in einer reduzierten Seite. **Vollbild** ist ein Fokusmodus innerhalb der Wrapt-Oberfläche. Beide Aktionen beenden die Sitzung nicht.

## Sitzungen schließen oder neu starten

In der Sessionliste öffnest du eine Sitzung wieder, startest sie bewusst neu oder schließt sie. Das Schließen einer Browserverbindung, der Wechsel zu einer anderen Wrapt-Seite und ein normaler Backend-Neustart lassen den Prozess weiterlaufen. Erst **Sitzung schließen** beendet die zugehörige tmux-Sitzung.

Beim Serverstart gleicht Wrapt gespeicherte Sitzungen mit dem tmux-Supervisor ab. Als persistent registrierte Terminals lassen sich nach einem Host-Neustart mit ihrem bekannten Projektkontext wiederherstellen; ein Neustart unterbricht laufende Prozesse trotzdem physisch.

## Projektordner und Zugriff

Beim Auswählen eines Projekts übermittelt der Browser eine Projekt-ID. Der Server löst den erlaubten Pfad selbst auf und prüft ihn gegen die konfigurierten Terminal-Wurzeln. Eine laufende Sitzung wechselt ihr Arbeitsverzeichnis nicht ungefragt. Wechsle über die Projektwahl zu einem anderen Projekt, um dafür eine eigene Sitzung zu öffnen.

Terminalzugriff ist privilegiert. Für Remotezugriff muss die Instanz den Nutzer zulassen und über den vorgesehenen privaten Zugang erreichbar sein. Die Terminal-CLI ist keine Freigabe für beliebige externe Nutzer oder öffentliche Hosts.

## Tastatur und Touch

Auf Windows und Linux kopierst du die Auswahl mit `Ctrl+Shift+C` und fügst mit `Ctrl+Shift+V` ein. Auf macOS gelten `Cmd+C` und `Cmd+V`. `Ctrl+C` bleibt das Unterbrechungssignal für den Prozess. Für mobile Eingabe gibt es eine Terminal-Tastaturleiste. Sehr große Einfügevorgänge brauchen eine Bestätigung.

Die Sitzung nutzt [node-pty](https://github.com/microsoft/node-pty) als PTY-Adapter, [xterm.js](https://github.com/xtermjs/xterm.js) für die Browserdarstellung und [tmux](https://github.com/tmux/tmux) als Sitzungs-Supervisor.

## Grenzen

- Persistente PTY-Sitzungen brauchen den tmux-Supervisor und serverseitig freigegebene Verzeichnisse.
- Alle Geräte teilen eine Terminalgröße; parallele Geräte können deshalb nicht unabhängig umbrechen.
- Ein Host-Neustart unterbricht aktive Prozesse. Nur registrierte persistente Sitzungen lassen sich danach wiederherstellen.
- Das Schließen einer Sitzung beendet den laufenden Prozess und sollte bewusst erfolgen.

## Weiterlesen

- [Coding-Werkzeuge](./werkzeuge.md)
- [Arbeitsbereich und Projektwahl](./arbeitsbereich.md)
- [Technischer Terminalbetrieb](https://github.com/017pixel/Wrapt/blob/master/docs/terminal.md)
- [Fehlerbehebung](https://github.com/017pixel/Wrapt/blob/master/docs/troubleshooting.md)

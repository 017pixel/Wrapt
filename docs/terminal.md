# Browser-Terminal

Das Terminal verwendet echte PTYs. Linux und macOS starten standardmäßig
`/bin/bash --login`, natives Windows startet PowerShell über ConPTY.
Auf POSIX-Systemen laufen die Shells im dedizierten tmux-Supervisor.
`node-pty` verbindet den Prozess mit dem Browser. Terminalzugriffe verlangen eine ausdrücklich erlaubte
Tailscale-Identität und mutierende Zugriffe dieselbe Origin.

## Betriebssysteme

| Server | Shell und Prozessbetrieb |
| --- | --- |
| Linux | Bash oder konfigurierte Login-Shell; tmux mit eigener systemd-User-Unit |
| macOS | Bash oder konfigurierte Login-Shell, etwa zsh; tmux aus PATH/Homebrew, ohne systemd |
| Windows | PowerShell oder konfigurierte Shell; direkte ConPTY-Sitzung, Windows 10 ab 1903 oder Windows 11 |

Browser und Server dürfen auf unterschiedlichen Betriebssystemen laufen.
POSIX-, Windows-Laufwerks- und UNC-Pfade bleiben durch API, Layout und Sidebar
im Format des Servers. PowerShell behält das vorhandene Profil und den Prompt;
CWD-Meldungen ergänzen nur die aktuelle Sitzung. npm-CLI-Shims mit `.cmd` lassen
sich ebenfalls ausführen. Native Windows-Prozesse erhalten beim Beenden kein
POSIX-Signal.

Im direkten Betrieb, insbesondere unter nativem Windows, beendet ein
Backend-Neustart auch den PTY-Prozess. Persistente Einträge starten anschließend
als neue Prozesse mit dem gespeicherten CWD. Laufende Befehle überleben diesen
Neustart nur mit tmux; dafür lässt sich Wrapt unter Windows in WSL betreiben.
Browser-Neuladen und Netzunterbrechungen lassen auch direkte PTYs weiterlaufen.
Die Prozessgrundlage und CWD-Sequenzen sind in
[node-pty](https://github.com/microsoft/node-pty) und der
[Windows-Terminal-Dokumentation](https://learn.microsoft.com/en-us/windows/terminal/tutorials/new-tab-same-directory) beschrieben.

## Arbeiten mit Terminals

Neue Terminals starten im konfigurierten Standardverzeichnis. Die Terminalseite
hat keine Projekt- oder Pfadauswahl. Das Arbeitsverzeichnis wechselt mit `cd`;
der aktuelle Pfad erscheint in der Sidebar. Ein neues Split-Terminal übernimmt
das aktuelle Arbeitsverzeichnis des fokussierten Terminals.

Die Sidebar verwaltet benannte Terminals, Ordner und Unterordner. Neue Ordner
können sofort benannt werden. Über die Aktionsschaltflächen oder das Kontextmenü
lassen sich Einträge öffnen, teilen, umbenennen, pinnen, persistent markieren,
neu verbinden, neu starten und beenden. Enter und Leertaste öffnen einen
fokussierten Eintrag. Suche und Sammelaktionen berücksichtigen die Ordnerstruktur.

Auf Desktop lassen sich bis zu vier Terminals nebeneinander anzeigen. Vorhandene
Terminals können per Drag & Drop in einen Ordner oder auf die rechte Seite der
Terminalfläche gezogen werden. Sidebar und Split-Trenner passen die PTY-Größe
bei jeder Änderung an. Auf kleinen Displays wird auch im Querformat ein Terminal
angezeigt; die anderen Sitzungen bleiben erhalten. Die mobile Sidebar schließt nach einer
Auswahl und bietet Touch-Aktionen. Eine Sondertastenleiste liefert unter anderem
Esc, Tab, Pfeiltasten und Strg-Kombinationen.

Zuletzt verwendete Terminals bleiben als Renderer im Hintergrund geladen.
Weitere Prozesse laufen im Supervisor weiter und werden beim Öffnen wieder
synchronisiert. Ein Wechsel zu einem anderen Werkzeug beendet die Sitzung nicht.

**In neuem Tab öffnen** verbindet die aktive Sitzung in einer reduzierten
Terminalseite. Mehrere Browser können dieselbe Sitzung bedienen. Der
Werkzeug-Fokusmodus blendet die Workbench-Navigation aus; Escape beendet ihn.

## Verbindung und Wiederherstellung

Ein gemeinsamer WebSocket transportiert die Terminalnachrichten. Aufbau und
Wiederverbindung erscheinen als sichtbarer Status. Fehlgeschlagene Start- und
Neustartanfragen werden dem betroffenen Terminal zugeordnet. Heartbeats erkennen
einen hängenden Transport; die Verbindung wird automatisch erneut aufgebaut.
Layout-Ladefehler werden angezeigt und erneut versucht. Noch nicht gespeicherte
Layoutänderungen bleiben im lokalen Puffer und werden nach einem Reload erneut
mit dem Server abgeglichen.

Der Server hält den gerenderten Bildschirm einschließlich Cursor, Alternate
Screen und Mausmodus in einer Headless-xterm-Emulation. Ein neu verbundener
Browser bekommt diesen Snapshot und noch ausstehende Ausgabe in Reihenfolge.
Ein bekannter, aktueller Bildschirm benötigt nur Deltas. Wenn der Delta-Puffer
bei einem großen Ausgabeschub überläuft, wird ein vollständiger geparster
Snapshot geliefert. Der Verlauf umfasst bis zu 10.000 Zeilen.

Eine PTY hat eine gemeinsame Zeilen- und Spaltenzahl. Das zuerst verbundene Gerät
übernimmt die Geometrie. Weitere Geräte merken ihre Wunschgröße vor. Echte
Eingabe oder Fokusübernahme überträgt die Kontrolle; beim Trennen übernimmt ein
verbleibendes Gerät. Reine ResizeObserver-Ereignisse wechseln die Kontrolle
nicht. Snapshots werden zuerst im gemeinsamen Raster wiedergegeben.

Mit tmux trennt ein Backend-Neustart nur das Gateway. Der tmux-Prozess läuft weiter;
der nächste Subscribe verbindet ihn wieder und übernimmt den vorhandenen
Bildschirm. **Neu starten** beendet dagegen den Terminalprozess bewusst und
startet dieselbe Sitzung mit einer neuen Bildschirmgeneration.

**Persistent machen** speichert die Markierung zusammen mit Name, Ordner und Pin
im serverseitigen Workspace. Nach einem Host-Neustart werden unterbrochene,
persistente Sitzungen erlaubter Nutzer automatisch im gespeicherten
Arbeitsverzeichnis gestartet. Bereits laufende tmux-Prozesse werden dabei nicht
neu gestartet. Ein nicht mehr erlaubtes oder verschwundenes Verzeichnis bleibt
als unterbrochene Sitzung erhalten. Ein Host-Neustart kann den vorherigen
Prozess, laufende Befehle und ungespeicherte Programmdaten nicht erhalten.

**Alle normalen Terminals schließen** bewahrt gepinnte und persistente Einträge.
Ein einzelnes **Beenden** schließt auch deren Prozess; bei geschützten Einträgen
wird dies bestätigt. Das Entfernen eines Panes aus dem Split beendet die Sitzung
nicht. Das Schließen eines Browserfensters beendet ebenfalls keinen Prozess.

Das Sitzungslimit zählt laufende Terminals, Prozesse mit lebendem Supervisor und
Sitzungen mit Workspace-Eintrag. Unterbrochene Sitzungen ohne Eintrag belegen
kein Limit; alte verwaiste Sitzungszeilen entfernt die Registry nach einer Woche.

## Konfiguration

Terminaleinstellungen liegen in `config/wrapt.local.json` oder den entsprechenden
Umgebungsvariablen. Das Shell-Home stammt aus `system.homeDirectory`.
`terminal.shell.file` wählt eine andere Shell; `terminal.shell.args` ersetzt deren
Startargumente. `TERMINAL_SHELL_PATH` überschreibt die Shell-Datei.
Ohne eigene Argumente erhalten Bash, andere POSIX-Login-Shells, PowerShell und
cmd jeweils passende Startargumente. Eigene Shell-Profile können OSC 7 oder
OSC 9;9 für den aktuellen CWD senden; tmux liest den CWD zusätzlich aus dem Pane.

```dotenv
TERMINAL_ALLOWED_USERS=user@example.com
TERMINAL_ALLOWED_ROOTS=/home/your-user,/home/your-user/projects
TERMINAL_DEFAULT_CWD=/home/your-user
TERMINAL_MAX_SESSIONS=5
TERMINAL_SUPERVISOR=tmux
TMUX_PATH=/usr/bin/tmux
CODEX_CLI_PATH=/home/your-user/.local/bin/codex
CODEX_MAX_SESSIONS=4
CLAUDE_MAX_SESSIONS=4
```

Unter nativem Windows ist `TERMINAL_SUPERVISOR=direct` der Standard; tmux bleibt
Linux und macOS vorbehalten. Windows-Roots sind beispielsweise
`C:\Users\test,C:\Users\test\projects`. Linux und macOS behalten `tmux` als Standard.

Ohne erlaubte Benutzer bleibt der Endpunkt gesperrt. Codex und Claude Code nutzen
denselben PTY-Transport mit fest zugeordneten Programmen und behalten ihre eigenen
Freigabedialoge. OpenCode verwendet die separate Web-UI; alte OpenCode-PTYs bleiben
kompatibel. Die Registry wird beim Backendstart mit den tmux-Sitzungen abgeglichen.
Bei genau einem erlaubten Benutzer können bereits verwaltete tmux-Sitzungen
importiert werden. Rohprozesse ohne PTY-Supervisor lassen sich nicht nachträglich
als interaktives Terminal übernehmen.

## Zwischenablage

Windows und Linux verwenden `Ctrl+Shift+C` und `Ctrl+Shift+V`, macOS `Cmd+C` und
`Cmd+V`. `Ctrl+C` unterbricht weiterhin den Terminalprozess. Tastatur-Paste läuft
über das native Paste-Ereignis. Die mobile Einfügeaktion nutzt die Clipboard API
und zeigt abgelehnte Zugriffe an. xterm normalisiert Zeilenenden und respektiert
Bracketed Paste. Ab 10.000 Zeichen wird vor dem Einfügen gefragt; große Inhalte
werden anschließend verlustfrei in Protokollblöcke aufgeteilt.

## Prüfung

Die Unit- und Integrationstests unter `apps/server/src/terminal` und
`apps/web/src/components/terminal` prüfen Ausgabe, Snapshot/Delta-Sync,
Wiederanhängen an tmux, Persistenz, Transporterholung und mobile Renderer.
`pnpm test:terminal:platform` prüft Shell-/Pfadverträge und den Prozesszyklus
aller drei Plattformen sowie eine echte, isolierte PTY auf dem ausführenden Host.
Die CI-Matrix `terminal-platforms.yml` führt denselben Befehl auf Linux, macOS
und Windows aus. Lokale Linux-Läufe ersetzen keine nativen Windows-/macOS-Läufe.
`tests/e2e/terminal-reliability.spec.ts` prüft echte PTYs, Resize, Split,
Socket-Abbruch, Layout-Erholung und Touch-Bedienung. Die bestehenden Terminal-E2Es
prüfen zusätzlich Fullscreen-TUIs, Scrollback, mehrere Geräte und Sammelaktionen.
Alle Browserprüfungen laufen in einer ausdrücklich isolierten Testinstanz.

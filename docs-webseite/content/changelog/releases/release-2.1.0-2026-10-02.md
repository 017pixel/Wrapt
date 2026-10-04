# [2.1.0] - 2026-10-02

### Verändert
- Terminal-Verbindungen, Bildschirmwiederherstellung und Ausgabe bei Unterbrechungen überarbeitet; Verbindungs- und Layoutfehler werden sichtbar angezeigt
- Split-Terminals und Größenänderungen reagieren direkt; mobile Ansichten bewahren andere Sitzungen auch im Querformat
- Terminalordner lassen sich direkt benennen; Einträge und Ordner haben erreichbare Touch- und Tastaturaktionen
- Terminalkern für Linux, macOS und natives Windows angepasst; PowerShell, Windows-Pfade und CLI-Shims werden unterstützt

### Erstellt
- Automatischer Wiederanlauf ausdrücklich persistenter Terminals nach einem Host-Neustart mit gespeichertem Arbeitsverzeichnis
- Regressionstests für Wiederverbindung, große Ausgabeschübe, Resize, mobile Splits, Persistenz und das Beenden von Sitzungen
- Native PTY-Prüfung und CI-Prüfmatrix für Linux, macOS und Windows

### Behoben
- Einzelnes Beenden schließt jetzt auch den zugehörigen Prozess und gibt dessen Sitzungsplatz frei
- Terminals im Split starten im aktuellen Arbeitsverzeichnis der aktiven Sitzung

### Gelöscht
- Projekt- und Standardpfadauswahl in der Terminal-Topbar

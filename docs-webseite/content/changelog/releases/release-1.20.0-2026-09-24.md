# [1.20.0] - 2026-09-24

### Erstellt
- Einklappbare Wrapt-Seitenleiste für iPads im Querformat
- Einmaliger Installationshinweis für iPhone, iPad und Android
- Direkter Android-Installationsaufruf über den Browser
- Terminal-Seitenleiste, die sich an einen Orientierungswechsel anpasst
- Beschriftungen für Terminal-Sondertasten, die Screenreader vorlesen können

### Verändert
- iPad-Querformat teilt den Bildschirm zwischen Navigation und Arbeitsbereich
- Touch-Terminals zeigen Schrift mit 13 statt 8 Pixeln
- Terminal-Tabs und Datei-Vorschau-Aktionen bieten größere Trefferflächen
- Dialoge und Datei-Vorschauen folgen der sichtbaren Bildschirmhöhe
- Nutzungsansichten halten ihre Diagramme innerhalb der verfügbaren Breite

### Gelöscht
- Zwischengespeicherte App-Ansicht für den Offline-Aufruf
- Offline-Kopie der gebündelten Frontend-Dateien
- Offline-Fallback für Seitenwechsel
- Winzige Terminalschrift auf Touch-Geräten
- Mobile Navigationsauslösung im iPad-Querformat

### Behoben
- Nicht reagierende Serverprozesse werden vor einem Launcher-Neustart nach acht Sekunden beendet
- systemd-Dienstabfragen und -Aktionen laufen nur unter Linux
- Fehlerhafte Codexbar-Antworten lösen wieder den lokalen CLI-Fallback aus
- pnpm 10 liest Sicherheits-Overrides aus der Workspace-Konfiguration
- Einstellungssuche ordnet Layout und verbundene Workspaces den passenden Bereichen zu

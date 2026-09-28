# [1.10.3] - 2026-09-17

### Erstellt
- Kopierbarer Installationsprompt für Coding-Agenten in der README
- Getrennter manueller Installationsweg mit Entwicklungs- und Produktions-URL
- Agent-Setup prüft Entwicklungs- und Dienststart getrennt
- Installer richtet den tmux-Terminal-Supervisor automatisch ein
- Hinweise zum ersten Start von T3 Code und OpenCode Web

### Verändert
- Produktversion kommt jetzt aus package.json statt aus einer Umgebungsvariablen
- README nennt die aktuelle Version und verlinkt den Changelog
- Beispiel-.env übersteuert keine persönlichen Pfade mehr
- Health-Check-Dokumentation nennt die tatsächlichen Antwortfelder
- Optionaler OpenCode blockiert keinen Backend-Neustart mehr

### Gelöscht
- Veraltete Versionsangabe 1.0.1 aus der README
- Fehlerhafter Verweis auf eine nicht vorhandene README-Kurzform
- APP_VERSION-Eintrag aus der Beispiel-.env
- Veraltete APP_VERSION-Umschreibung im Server
- Doppeltes Dateimanager-Bild aus der Oberflächen-Übersicht

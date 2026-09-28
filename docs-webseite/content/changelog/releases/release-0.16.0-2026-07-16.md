# [0.16.0] - 2026-07-16

### Erstellt

- Unveränderliche lokale Sicherungsdatei für jede erfolgreich gespeicherte Orbit-Revision
- Vollständige Orbit-Versionshistorie direkt in der lokalen SQLite-Datenbank
- Automatische Wiederherstellung aus der letzten geprüften Sicherung bei fehlendem Datenbankstand
- Serverseitige Wiederherstellungsentwürfe für Konflikte und blockierte Löschvorgänge
- Zusätzlicher Browser-Entwurfsschutz für Änderungen während Neuladen und Code-Updates

### Verändert

- Orbit-Laufzeitdaten liegen updatefest außerhalb des Projektverzeichnisses
- Autosave-Konflikte behalten immer den neueren Serverstand und sichern den lokalen Entwurf getrennt
- Ungewöhnlich große automatische Datenverluste werden vor dem Überschreiben blockiert
- SQLite schreibt Orbit-Daten und Revisionen mit vollständiger Dauerhaftigkeit auf den Datenträger
- Skalierungspunkte sitzen geometrisch exakt auf allen vier Fensterecken

### Gelöscht

- Einzelne überschreibbare Orbit-Zeile als einzige Sicherungsquelle
- Blindes erneutes Speichern eines veralteten Browserstands nach Revisionskonflikten
- Projektgebundener Datenbankpfad als Risiko bei Builds und Quellcode-Aktualisierungen
- Versetzte sichtbare Skalierungspunkte neben den tatsächlichen Fensterecken
- Stilles Leeren größerer Arbeitsflächen durch fehlerhafte Autosave-Zustände

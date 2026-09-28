# [0.23.0] - 2026-07-22

### Erstellt

- Claude Code als dritter Limitanbieter über die bestehende CodexBar-Anbindung
- Automatische Erkennung des lokal angemeldeten Claude-Code-Accounts und Abos
- Verwaltbare Claude-Code-Profile mit erneuter Anmeldung im geschützten Terminal
- Historische Claude-Code-Kosten, Tokenwerte und Limitprognosen
- Claude-Code-Nutzungsknoten für den Orbit Workspace

### Verändert

- Statusleiste zeigt Codex, OpenCode und Claude Code gemeinsam an
- Nutzungsübersicht ordnet Claude-Limits dem erkannten Account zu
- Accountverwaltung bietet alle drei lokalen Coding-Anbieter in einer Auswahl
- Datensammler übernimmt Claude-Limits und lokale Kosten im bestehenden Intervall
- Claude-Abruf nutzt OAuth mit zuverlässigem lokalem CLI-Fallback auf Linux

### Gelöscht

- Beschränkung der Nutzungsanzeige auf Codex und OpenCode
- Abhängigkeit von der unter Linux hängenden Claude-Webquelle
- Manuelle Zuordnung des vorhandenen Claude-Standardprofils
- Starre Datenbankbeschränkung auf zwei Accountanbieter
- Fehlende Claude-Code-Anzeige in Statusleiste und Orbit

## Unreleased

### Erstellt

- KI-Assistent mit Verlauf: Nachfragen verstehen den bisherigen Dialog und verwandte Beiträge
- Quellen-Chips in KI-Antworten öffnen den zitierten Artikel direkt im Leser
- Vorgeschlagene Anschlussfragen nach jeder KI-Antwort
- Sammlungsübersicht auf der gespeicherten Seite mit Beitragszählern
- Fortschrittsbalken im Leser und Story-Zähler im mobilen Snap-Feed

### Verändert

- Copy und Paste verwenden in Terminal, Entwicklungswerkzeugen und Browser wieder zuverlässig den aktuell ausgewählten Inhalt
- Solide transluzente Story-Leseflächen mit geprüftem Kontrast ohne Verläufe
- Ruhigere Story-Scrims, besserer Schwung beim Scrollen und klare Story-Position
- Pop-ups und Bottom-Sheets mit gefederter Einblendung statt hartem Erscheinen
- KI-Kontext: Artikel-Chat nutzt den Beitrag plus inhaltsähnliche News als Grundlage
- Desktop-Bento mit Bild-Zoom, Gelesen-Punkt und präziserem Wichtigkeitstyp
- KI auf mobile Geräte geholt über eigene Insel-Taste und Vollbild-Blatt

### Gelöscht

- Mehrstufige Verläufe und unruhige Verschattung in der mobilen Story-Ansicht
- Versteckte KI-Eingabe auf Mobilgeräten ohne sichtbaren Zugang

### Erstellt

- Serverseitige Registry für Shell-, Codex- und OpenCode-Sessions
- Synchronisierte Terminal-Tabs und Areas für mehrere Geräte
- Session-Liste zum Öffnen, Neustarten und Beenden verwaister Sessions
- Gemeinsamer PTY-Zugriff mehrerer verbundener Geräte
- Unterbrechungsstatus nach Backend-Neustarts ohne automatische Prozesswiederherstellung

# [1.11.0] - 2026-09-17

### Erstellt
- Server hält die Limitdaten jetzt auch ohne geöffnete Seite selbstständig aktuell
- Neuer Fortschrittswert "liveRunning" für den getrennten Limit-Abgleich
- Live-Hinweis und drehendes Symbol während der Aktualisierung
- Fehlgeschlagene Abrufe warten vor dem nächsten Versuch
- Eigene Testdatei für die Bewertung einzelner Limit-Lanes

### Verändert
- Limits erscheinen beim Öffnen der Seite sofort statt erst nach einem Kaltstart
- Limitansicht aktualisiert sich nach Sekunden statt nach der vollständigen Auswertung
- Statusleiste und Limit-Tabelle fragen alle 30 statt alle 60 Sekunden nach
- Limit-Zeitleiste übernimmt neue Daten direkt nach jedem Hintergrundabgleich
- Prüfskript für Dateigrößen kennt die aufgeteilte Testdatei nicht mehr als Ausnahme

### Gelöscht
- Starres Warten der Limitansicht auf die komplette Auswertung
- Ungenutzter Export-Typ der Sync-Statusantwort
- Ausnahme-Eintrag für die ehemals zu große Timeline-Testdatei
- Doppelte Hintergrundabfragen bei laufendem Abgleich
- Alte 60-Sekunden-Aktualisierung der Limit-Anzeige

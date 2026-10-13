# [2.2.0] - 2026-10-05

### Erstellt
- Eigene Notizordner mit Umbenennen, Verschieben und Auflösen ohne Verlust der Seiten.
- Sortierbare Notizabschnitte und Seiten sowie direkte Erstellung neuer Favoritenseiten.
- Aufklappbare Übersicht über die Nutzungslimits in der Fußleiste: Beim Überfahren erscheint eine Karte mit allen Zeitfenstern je Anbieter (5 Stunden, 7 Tage, 30 Tage), dem Verbrauch als Balken, dem Zeitpunkt des nächsten Reset und – sofern vorhanden – den verfügbaren Reset-Guthaben. Mehrere Konten eines Anbieters stehen untereinander. Auf Touch-Geräten öffnet sich die Karte per Tipp.

### Verändert
- Preview-Kapazität von zwölf auf 60 Slots und den Projektportpool von zehn auf 50 erweitert; bestehende Portzuordnungen bleiben erhalten.
- Notizgruppen, Favoriten und Suche reagieren mit kurzen Animationen. „Privat“ heißt jetzt „Alle Notizen“.
- Der Limits-Bereich der Fußzeile hat drei klar unterscheidbare Zustände: ruhend, beim Überfahren und geöffnet. Der bisherige nasse Browser-Tooltip entfällt, weil er neben der neuen Karte doppelt und schlechter dargestellt hätte.
- Unbekannte Zeitfenster eines Anbieters werden nicht mehr verworfen, sondern aus ihrer Länge abgeleitet.

### Behoben
- Geschlossene Preview-Tabs geben ihre ungenutzten Slots frei und öffnen sich nicht sofort erneut. Sitzungserneuerung und Freigabe behandeln abgelaufene und noch laufende Anfragen.
- Vollbildaktionen stehen in der Kopfzeile nebeneinander.
- Blockgriffe bleiben auch bei hohen Bildern am Inhalt. Klicks auf freie Editorfläche setzen den Cursor an die letzte Schreibzeile.
- Mausrad-Scrollen funktioniert über Seitentiteln und Einträgen im Verschiebedialog.

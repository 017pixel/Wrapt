# [1.5.2] - 2026-09-09

### Erstellt
- E2E-Prüfung für Eingaben nach Verlassen und Rückkehr zur Terminalroute ergänzt
- Regressionstests für Terminal-Resync nach Clear, Neustart und Wiederherstellung ergänzt
- Transporttest für Live-Output nach Socket-Neuaufbau mit Fast Reconnect ergänzt
- Sequenzschutz im Server-Terminal gegen veraltete Schreibbestätigungen ergänzt
- Leere Verlaufszustände werden bei Clear auch serverseitig zurückgesetzt

### Verändert
- Produktversion auf 1.5.2 angehoben (Root, Server, Web und Backend-Defaults)
- Snapshot- und Live-Ausgaben des Terminals sprechen dieselbe Sequenzbasis
- Sync ohne passenden Stand liefert einen Snapshot statt leerer Deltas
- Session-Zuordnung des Terminal-Transports wird bei jeder Nachricht aufgefrischt
- Vorschaupfade erhalten dadurch ebenfalls wieder laufende Ausgaben

### Behoben
- Getippte Eingaben nach Routenwechsel blieben bis zum Neuladen unsichtbar
- Erste Ausgaben nach Terminal-Neustart wurden fälschlich verworfen
- Rückkehrer nach einem Clear sahen veraltete Inhalte oder hingen fest
- Wiederhergestellte Sitzungen verwarfen alle Ausgaben bis zum Neuladen
- Live-Ausgaben ohne vorheriges Created gingen im Transport verloren

# [0.15.0] - 2026-07-16

### Erstellt

- Kontextmenüs für freie Canvas-Flächen, Fenster, Bereiche, Terminals und Anwendungen
- Vollständige Chromium Developer Tools mit Konsole, Elementen, Netzwerk und Debugger
- Editierbare Verbindungstexte und speicherbare Kontrollpunkte im Abstand von etwa 100 Pixeln
- Browseraktionen für Quelltext, Bildschirmaufnahme, Navigation, Neuladen und Untersuchen
- Authentifizierter CDP-WebSocket-Proxy ohne Freigabe des lokalen Chromium-Debug-Ports

### Verändert

- Skalierungsgriffe sitzen exakt an den Ecken und greifen höchstens acht Pixel außerhalb
- Vergrößerte Drag-Pillen liegen vier Pixel über Live-Fenstern und blockieren keinen Inhalt
- Pinch-Zoom steuert auch über Werkzeugen und eingebetteten Frames ausschließlich den Canvas
- Projektkarten übernehmen dieselbe eindeutige Farbe wie ihre automatisch erzeugten Linien
- Verbindungen wählen die nähere Knotenseite und verlaufen orthogonal mit sanft gerundeten Ecken

### Gelöscht

- Großflächige Skalierungszonen innerhalb interaktiver Fensterinhalte
- Horizontale Eigenschaftenkarte als eingeklappter Desktop-Trigger
- Browser-Zoom der gesamten Workbench bei Trackpad-Gesten über Werkzeugen
- Dauerhafte Browser-Screencasts für nicht mehr verbundene Arbeitsflächen
- Einheitlich blaue Projektkarten trotz unterschiedlich gefärbter Projektverbindungen

# [0.43.0] - 2026-08-10

### Erstellt

- Eigenständige Terminalfenster, die ausschließlich die ausgewählte laufende Sitzung anzeigen
- Terminal-Fokusmodus ohne Workbench-Sidebar, Topbar, Statusleiste und mobile Navigation
- Atomarer Split-Befehl für eine neue unabhängige Sitzung rechts neben dem aktiven Terminal
- Explizite linke und rechte Pane-Identitäten für zuverlässige Fokus- und Tabwechsel
- Verlustfreie Migration bestehender Terminalbereiche auf das neue Split-Datenmodell

### Verändert

- Terminalfarben auf eine ruhige, matte Pastellpalette mit klar unterscheidbaren ANSI-Farben umgestellt
- Splitgrößen werden mit der zugänglichen Panel-Komponente gezogen, per Tastatur bedient und gespeichert
- Neue Split-Sitzungen starten im aktuellen Unterordner des aktiven Terminals
- Mausrad- und Touch-Scrollen reagieren zeilengenauer und halten bis zu 10.000 Verlaufszeilen
- Projektwahl und Werkzeugaktionen schließen in der Topbar bündig am rechten Rand ab

### Behoben

- Tabwechsel im Split ersetzen nur das fokussierte Pane und vertauschen die Seiten nicht mehr
- Schließen eines sichtbaren Split-Tabs klappt kontrolliert auf die verbleibende Sitzung zusammen
- Kompakte und mobile Ansichten zerstören einen vorhandenen Desktop-Split nicht mehr
- „In neuem Tab öffnen“ lädt nicht länger die gesamte Remote Workplace
- Terminal-Vollbild blendet die Workbench-Navigation aus, ohne den Browser-Vollbildmodus zu erzwingen

---

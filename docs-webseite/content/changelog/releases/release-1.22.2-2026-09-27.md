# [1.22.2] - 2026-09-27

### Erstellt
- Viewport-gebundener Arbeitsflächen-Schalter mit Tastaturbedienung
- Lade-, Fehler- und Projektzuordnungszustände für Orbit-Werkzeuge
- Wiederherstellbare Aktion bei fehlgeschlagenem Werkzeugstart
- Gebündelte PTY-Anpassung für Terminal-Zoom im Orbit
- Regressionstests für Menü, Werkzeugladen und Terminal-Zoom

### Verändert
- Arbeitsflächenmenü wird außerhalb der scrollenden Steuerleiste angezeigt
- Notiztext erhält sichtbaren Innenabstand am linken und rechten Rand
- Terminal füllt die Orbit-Fläche ohne äußeren Rahmen
- Terminalschrift gleicht den Canvas-Zoom invers aus
- Bereichstitel deckt die gestrichelte Rahmenlinie vollständig ab

### Gelöscht
- Grüne Synchronisierungspunkte an Orbit-Knoten
- Schwarze Außenlinien am Orbit-Terminal
- Transparenter Bereichstitel, durch den die Rahmenlinie sichtbar war
- Endloser T3-Code-Ladezustand bei fehlender Projektzuordnung
- Nichtssagende Fehlerseite bei nicht erreichbarem OpenCode-Webdienst

### Behoben
- Arbeitsflächenmenü wird nicht mehr von der Steuerleiste abgeschnitten
- Neue Notizen beginnen nicht mehr direkt an der linken Kante
- Synchronisierungspunkte stören Notiz-, Snippet- und Limit-Knoten nicht mehr
- T3 Code kann auch ohne gespeicherte Projektzuordnung geladen werden
- Terminaltext bleibt beim Rein- und Rauszoomen gleich groß

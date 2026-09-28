# [0.5.0] - 2026-07-14

### Erstellt

- Persistenter Routen-Host für besuchte Ansichten und laufende Werkzeuge
- Benannte Arbeitsflächen mit bis zu vier flexiblen Bento-Gruppen
- Persistente Tabs für bis zu acht Iframe- oder Terminal-Instanzen
- Eigenständiger Code-Server-Eintrag im Werkzeugbereich der Sidebar
- Browsernachweis für zustandserhaltende Tab-, Fullscreen- und Routenwechsel

### Verändert

- Workbench-Zustand wird automatisch von Schema-Version 1 auf 2 migriert
- Routen werden aufgeteilt und während Browser-Leerlauf vorab geladen
- Browserdateien erhalten Brotli/Gzip und langfristige immutable Cache-Header
- Fullscreen und mobile Gruppen nutzen den gesamten verfügbaren Viewport
- Abhängigkeiten wurden kompatibel aktualisiert und Version 0.5.0 gesetzt

### Gelöscht

- Starre Beschränkung auf zwei gleichzeitig verwaltete Panels
- Unmount und Reload von Werkzeugen bei Sidebar-Navigation
- Reload von Iframes beim Wechsel zwischen Workbench-Tabs
- Neuaufbau eingebetteter Werkzeuge bei Fullscreen-Wechseln
- Gemeinsame Terminal-Sitzungskennung für mehrere Terminal-Instanzen

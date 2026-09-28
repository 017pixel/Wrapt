# [0.4.0] - 2026-07-13

### Erstellt

- Wiederverbindbares natives PTY-Terminal nach dem T3-Code-Lifecycle
- Automatische Erkennung aller lokalen Projektordner
- HTTPS- und WebSocket-Proxy für Editor und Entwicklungs-Previews
- Geräteauswahl für iPhone- und Galaxy-Ansichten mit Rotation
- Dauerhafte systemd-Benutzerdienste für code-server und Vite

### Verändert

- Vorschau, Vollbild und externe Ansicht teilen einen stabilen Origin
- Editor und Preview nutzen auf Mobilgeräten deutlich mehr Bildschirmfläche
- Breadcrumbs, Sidebar-Gruppen und Statuszeile wurden neu strukturiert
- Terminal-Sitzungen bleiben bei kurzzeitigen Verbindungsabbrüchen erhalten
- Server und Benutzeroberfläche melden die Version 0.4.0

### Gelöscht

- Statisches Projekt-Dropdown aus der oberen Navigationsleiste
- Fehleranfälliger HTML-Fetch-Proxy für eingebettete Previews
- Unsichere HTTP-Editor-URL und Mixed-Content-Abhängigkeit
- Warnende iframe-Sandbox-Kombination aus Scripts und Same-Origin
- Schreibschutz, der Terminalbefehle an Projektdateien verhindert hat

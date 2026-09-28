# [1.17.0] - 2026-09-24

### Erstellt
- Lokaler Tray-Launcher für macOS und Windows
- Serversteuerung mit Schutz vor doppeltem Start
- Statusanzeige mit Version und Prozesskennung
- Autostart beim Login und direkter Zugriff auf Serverlogs
- Automatischer Serverneustart nach einem Neustart aus der Wrapt-Oberfläche

### Verändert
- Lokale Identitätsprüfung erkennt Forwarded-Header unabhängig von Schreibweise und Anzahl
- Portübersicht liefert Listener wieder nach Port sortiert
- Lokaler Betrieb beschreibt die Schnittstelle zwischen Launcher und Server
- Installation dokumentiert Start, Build und Windows-Voraussetzungen des Launchers
- Server-, Web- und Projektversion auf 1.17.0 angehoben

### Gelöscht
- Manuelle Prozesssuche vor dem Start des lokalen Servers
- Doppelte Serverstarts beim Öffnen des Launchers
- Manuelle Browsernavigation zur lokalen Oberfläche
- Manuelle Suche nach der Serverausgabe
- Unbeabsichtigter Auto-Neustart nach einem bewussten Stop

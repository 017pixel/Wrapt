# [1.21.0] - 2026-09-24

### Erstellt
- Workspace-Wechsler im mobilen Navigationsmenü
- Touch-gerechte Workspace-Auswahl als Bildschirmblatt
- Lokale Anmeldung über Loopback ohne doppelten allowedUsers-Eintrag
- Übertragung von Hinzufügungs- und Nutzungszeiten beim Instanzwechsel
- Lesbare Standardbezeichnung für Instanzen ohne eigenen Namen

### Verändert
- Workspace-Konflikte nach URL und ID werden getrennt aufgelöst
- Zielinstanzen übernehmen ihre Self-ID aus dem Wechsel-Link
- Einträge aus localhost und 127.0.0.1 bleiben wechselseitig erreichbar
- Lokale Freigabe gilt nur für direkte Loopback-Verbindungen ohne Proxy-Header
- Projektversion auf 1.21.0 angehoben

### Gelöscht
- Origin-Adresse als sichtbarer Gerätename ohne Health-Namen
- Zusätzliche Benutzerfreigabe für normale lokale Loopback-Nutzung
- Verwerfen gültiger Einträge bei kollidierenden IDs
- Außerhalb des mobilen Bildschirms platzierte Workspace-Auswahl
- Verlorener Rückweg zwischen localhost und 127.0.0.1

### Behoben
- Workspace-Auswahl auf Handy und Tablet-Hochformat unzugänglich
- Eintragsverlust bei gleicher ID und abweichender URL
- Zeitstempelverlust beim Übertragen der Registry
- Doppelte Workspace-Zeilen mit gleicher URL
- Lokaler Zugriff verweigert trotz aktivem Loopback-Vertrauen

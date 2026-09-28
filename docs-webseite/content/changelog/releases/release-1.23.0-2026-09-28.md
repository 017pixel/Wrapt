# [1.23.0] - 2026-09-28

### Erstellt
- Sechs zusätzliche Orbit-Bausteine für Aufgaben, Dateien, Galerien und Hermes
- Getrennte Sidebar-Bereiche für Seiten und Orbit-Elemente
- Eigenständige Geräteansichten für Telefon, Tablet und Desktop in Preview-Gruppen
- Synchronisierung gleichzeitiger Änderungen an der Serverliste
- Browserprüfungen für Orbit-Palette und Serverauswahl

### Verändert
- Notizen haben eine feste Dokumentleiste mit vollständigem Seitenpfad
- Aufgaben, Snippets und Notizkarten im Orbit sind übersichtlicher gestaltet
- Preview-Steuerung schwebt über dem gewählten Gerät
- Installationsanleitung erklärt lokalen und entfernten Zugriff getrennt
- Serverwechsel erscheint erst bei mehreren verbundenen Hosts

### Gelöscht
- Automatisch erfundener lokaler Server im entfernten Browser
- Fester tmux-Fensterindex bei Terminalaktionen
- Gemeinsamer Scrollbereich für Seiten und Orbit-Palette
- Umleitung neuer Orbit-Aufgaben in die Notizen-Seite
- Veraltete Inbox- und Plattformzusagen in der Dokumentation

### Behoben
- Terminals behalten Runtime und Verlauf beim Browserwechsel und bei anderen tmux-Fensternummern
- Servernamen und Einträge bleiben bei gleichzeitigen Tab-Änderungen erhalten
- Notiztitel werden gesichert; Fehler beim Bearbeiten werden angezeigt
- Ein ausgefallener Code-Server öffnet keinen kaputten Editor mehr
- Orbit-Navigation bleibt auf iPads erreichbar; Simulatorsteuerung bleibt im Bild

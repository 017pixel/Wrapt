# [1.22.0] - 2026-09-26

### Erstellt
- Kanonische Orbit-Seite unter `/orbit` mit rückwärtskompatiblem Workbench-Einstieg
- Gestalteter Arbeitsflächen-Schalter und Infofenster mit Sync-, Nutzungs- und Leistungsdaten
- Gemeinsame Notes-Oberfläche und globale Orbit-Quicknotes
- Preview-Laufzeitverwaltung mit Simulatorsteuerung in Orbit und Standalone
- Terminal-Handoff über stabile Runtime-IDs zwischen Orbit und Werkzeugseite

### Verändert
- Orbit-Werkzeuge und Vorschauen öffnen vorhandene Ressourcen über gemeinsame Identitäten
- Sidebar-Zustände für Orbit-Projekte und Werkzeuge werden unabhängig gespeichert
- Codex-, Claude-Code- und OpenCode-Limits bleiben kompakt in der unteren Leiste
- Code-Snippets, Fokussteuerung und Preview-Ziele folgen der gemeinsamen Orbit-Oberfläche
- Projektversion auf 1.22.0 und API-Verträge auf 0.15.0 angehoben

### Gelöscht
- Sichtbare Workbench-Bezeichnungen für den Orbit-Arbeitsbereich
- Neue Orbit-To-do-Listen aus Palette, Kontextmenü und Befehlssuche
- Orbit-Zahlen und Synchronisierungsdetails aus der unteren Statusleiste
- Orbit-Zuordnung bei neu erstellten Quicknotes
- Verschachtelte Preview-Bedienelemente in der Geräteansicht

### Behoben
- Doppelte Werkzeugknoten für dieselbe Session auf verschiedenen Orbit-Flächen
- Fokuswechsel zwischen Werkzeugseite und Orbit ohne Runtime-Wechsel
- Titel-Doppelklick löst Canvas-Zoom oder Preview-Gruppenaktion nicht mehr aus
- Preview-Sessions werden beim Entfernen eines gemeinsam genutzten Knotens nicht voreilig freigegeben
- Legacy-To-dos werden transaktional und idempotent in globale Notes überführt

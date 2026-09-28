# [0.99.5] - 2026-08-23

### Erstellt
- Globale, surface-basierte Rechtsklick-Menüs für Werkzeuge, Projekte, Dateien, Terminals, Orbit, Previews, Browser, Plugins und Statusleiste ergänzt
- Einstellungsbereich für Menüschalter, automatische oder manuelle Schnellaktionen und die Darstellung der Statusleiste ergänzt
- Lokale Top-3-Nutzungsstatistik sowie mobile und Desktop-Reihenfolge der Werkzeugnavigation ergänzt
- Direkten gemeinsamen Frontend- und Backend-Neustart mit Fortschritt sowie einen Informationsdialog für den `$plugin-creator`-Skill ergänzt
- Konfigurations-APIs und Regressionstests für Rechtsklick-Menüs, Plugin-Hinweise, Neustart und Skill-Dateiquelle ergänzt

### Verändert
- Bisher getrennte Datei-, Terminal-, Orbit-, Preview- und Browser-Menüs verwenden jetzt dieselbe Registry und Tastatursteuerung
- Sidebar und mobile Navigation unterstützen Ausblenden, Anheften und kontrolliertes Verschieben direkt über das Werkzeugmenü
- Die Statusleiste unterstützt konfigurierbare Schriftgröße, dauerhaft sichtbare Limits und Provider-Schalter
- Plugin-Verwaltung verwendet ein einheitliches Zeilenlayout, schließbare Hinweise, deutsche Lifecycle-Zustände und denselben Neustartfluss wie die Einstellungen
- Plugin-Creator-Dateiquelle sowie Rechtsklick-Konfiguration sind zentral konfigurierbar; Produkt-, Server-, Web- und Environment-Version stehen auf 0.99.5

### Gelöscht
- Eigenständiges Terminal-Kontextmenü und doppelte lokale Menü-Renderer entfernt
- Host-Menü-Übernahme für T3 Code, Hermes-Verwaltung, Code-Server, Preview-Runtime und Plugin-Frames ausgeschlossen
- Umweg vom Plugin-Neustarthinweis über die zuletzt besuchte Einstellungsseite entfernt
- Dauerhaft sichtbare Plugin-Statusmeldungen und vertikal zentrierte Plugin-Aktionen entfernt
- Technische Lifecycle-Rohwerte und unklare Plugin-Creator-Kurzinformation aus der sichtbaren Verwaltung entfernt

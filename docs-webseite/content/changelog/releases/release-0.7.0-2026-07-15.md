# [0.7.0] - 2026-07-15

### Erstellt

- Eigenständige Werkzeugseiten für Codex und OpenCode
- Bis zu vier dauerhaft geladene Instanzen je Agent-Werkzeug
- Automatische Bento-Anordnung für ein bis vier Desktop-Instanzen
- Mobile Einzelansicht mit schnellem Wechsel zwischen laufenden Instanzen
- Codex- und OpenCode-Werkzeugtypen für die bestehende Workbench

### Verändert

- Neue Agent-Sitzungen starten im aktuell ausgewählten Projekt
- Terminalverbindungen unterscheiden Shell, Codex und OpenCode eindeutig
- Gespeicherte Arbeitsflächen werden verlustfrei auf Version 3 migriert
- CLI-Pfade und getrennte Instanzlimits werden zentral konfiguriert
- Workbench, Weboberfläche und Server melden Version 0.7.0

### Gelöscht

- Notwendigkeit, Codex oder OpenCode zuerst manuell im Terminal zu starten
- Freie Befehlsauswahl für Agent-Prozesse aus dem Browser
- Gleichzeitige Mehrfachdarstellung von Agent-Instanzen auf Smartphones
- Gemeinsames Prozesslimit für Shell-, Codex- und OpenCode-Sitzungen
- Automatische Sicherheits- oder Freigabe-Bypässe beim CLI-Start

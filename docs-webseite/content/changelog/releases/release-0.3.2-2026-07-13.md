# [0.3.2] - 2026-07-13

### Erstellt

- Bereitschaftsprüfung für den CodexBar-Dienst
- Bis zu zwanzig Sekunden Startzeit für die lokale Schnittstelle
- Klare Meldung bei einem tatsächlich fehlgeschlagenen Dienststart
- Verlässliche Installation von CodexBar als Systemdienst
- Version 0.3.2 der Workbench

### Verändert

- CodexBar wird erst nach erfolgreicher Gesundheitsprüfung bestätigt
- Die Installation wartet auf die lokale Schnittstelle
- Kurzzeitige Startverzögerungen lösen keinen Rollback mehr aus
- Die Workbench kann CodexBar nach dem Start zuverlässig erreichen
- Server meldet die Versionsnummer 0.3.2

### Gelöscht

- Zu frühe Sofortprüfung nach dem Start von CodexBar
- Falscher Rollback bei einem korrekt startenden Dienst
- Nicht vorhandene CodexBar-Schnittstelle nach der Installation
- Unnötige erneute manuelle Dienstinstallation
- Race Condition zwischen Dienststart und Gesundheitsprüfung

# [0.3.3] - 2026-07-13

### Erstellt

- CSP-kompatible Zod-Konfiguration im Browser
- Validierung ohne dynamische JavaScript-Ausführung
- Stille Prüfung der Datenformate unter strengen Sicherheitsregeln
- Version 0.3.3 der Workbench
- Klarere Trennung zwischen T3-Code- und Workbench-Meldungen

### Verändert

- Zod verzichtet auf seine optionale JIT-Optimierung
- Die strenge Skript-Sicherheitsrichtlinie bleibt unverändert
- API-Antworten werden weiterhin vollständig geprüft
- Die Workbench vermeidet die irreführende CSP-Konsoleintragung
- Server meldet die Versionsnummer 0.3.3

### Gelöscht

- Probeaufruf über dynamisches JavaScript in der Workbench
- CSP-Warnung durch die optionale Zod-Optimierung
- Bedarf an der unsicheren Richtlinie `unsafe-eval`
- Unnötige Browser-Konsoleinträge bei der Datenschema-Prüfung
- Missverständnis, dass T3 Code die eval-Anfrage auslöst

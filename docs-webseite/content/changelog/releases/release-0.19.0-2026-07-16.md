# [0.19.0] - 2026-07-16

### Erstellt

- Servergeeignete Codex-Anmeldung mit einmaligem Gerätecode
- Gemeinsame Verwaltung für gefundene und registrierte Accountprofile
- Sichtbarer Anmeldestatus für jedes lokale CLI-Profil
- Ausgeschriebene Entfernen-Aktion mit Bestätigung und Rückmeldung
- Regressionstest für mehrere Codex-Accounts im Canvas-Limitblock

### Verändert

- CodexBar lädt Codex-Limits vorrangig explizit für alle Accounts
- Nach einer Anmeldung werden Limit-Cache und Nutzungsdaten sofort erneuert
- Registrieren, Umbenennen, Aktivieren und Entfernen liegen in derselben Accountkarte
- Der Anmeldedialog erklärt den Remote-Ablauf ohne lokalen Browser-Rückruf
- Neue Codex-Anmeldungen verwenden eine eigene persistente Gerätecode-Terminalsitzung

### Gelöscht

- Lokaler OAuth-Rückruf als Codex-Anmeldeweg auf dem Server
- Getrennte Bereiche für lokale Profile und registrierte Accounts
- Unbeschriftete Papierkorb-Aktion in der Accountverwaltung
- Bevorzugung unvollständiger Einaccount-Daten des CodexBar-Dienstes
- Wiederverwendung älterer browserbasierter Codex-Anmeldesitzungen

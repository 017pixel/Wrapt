# [0.34.0] - 2026-07-28

### Erstellt

- Schnellwechsel des serverweit aktiven Accounts mit einem Klick — für Codex, Claude Code und OpenCode
- Aktiv-Kennzeichnung, E-Mail-Adresse und Tarif auf jeder Accountkarte
- Verbleibende Limits aus CodexBar direkt bei jedem Account statt nur in der Übersicht
- `scripts/ki-account.sh` zum Anzeigen und Umschalten der aktiven Accounts auf der Kommandozeile
- Selbstheilung: ersetzt ein CLI die Anmeldeverknüpfung, wandern die neueren Zugangsdaten zurück in ihren Speicher

### Verändert

- Accounts eines Werkzeugs teilen sich Projekte, Sessions und Konfiguration; getauscht wird nur die Anmeldung
- Ein Accountwechsel braucht weder Abmeldung noch neue Geräteanmeldung
- Der Knopf für die CodexBar-Überwachung heißt jetzt „Überwachen“ und nicht mehr „Aktivieren“
- Accounts, die noch auf das gemeinsame Home zeigen, bekommen beim Aktivieren einen eigenen Anmeldespeicher
- Der serverweit aktive Account lässt sich nicht versehentlich entfernen

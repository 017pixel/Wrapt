# [1.7.0] - 2026-09-13

### Erstellt
- OpenCode-Läufe werden pro Sitzung gebündelt und nur einmal gemeldet
- Stabilitätsfenster ergänzt: T3-Ergebnisse werden erst nach stabilem Endzustand gemeldet
- Jedes Ereignis erhält unabhängig vom Ausgang genau eine Meldung
- Inbox-Hinweis in den Benachrichtigungseinstellungen ergänzt
- Stresstests für Benachrichtigungen ergänzt

### Verändert
- Toasts erscheinen nur noch einmal pro Ereignis, auch bei erneut auftretenden Meldungen
- Abgebrochene oder manuell geschlossene Terminals gelten nicht mehr als Erfolg
- Hermes meldet Live-Antworten nicht mehr doppelt über den Sitzungs-Poll
- Die Meldepause für Hermes-Antworten misst die Antwort statt des Alters der Sitzung
- Benachrichtigungen werden auch bei ausgeschalteten Toasts vollständig in der Inbox gesammelt
- Abgeschlossene Agentenläufe zählen alle Antworten und Subagenten eines Laufs zusammen

### Gelöscht
- Meldung pro einzelner OpenCode-Nachricht entfernt
- Falsche Erfolgsmeldung für abgebrochene oder geschlossene Terminals entfernt
- Doppelte T3-/OpenCode-Meldung für dieselbe Aufgabe entfernt

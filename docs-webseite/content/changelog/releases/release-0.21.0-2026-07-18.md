# [0.21.0] - 2026-07-18

### Erstellt

- Dauerhafter tmux-Supervisor für Shell-, Codex- und OpenCode-Läufe
- Serverseitig persistente Chromium-Profile mit gespeichertem Login- und URL-Zustand
- Notion als angemeldetes, geräteübergreifend geteiltes Orbit- und Workbench-Werkzeug
- Vollständige, durchsuchbare Orbit-Projektwahl für alle erkannten Projektordner
- Kombinierte Projektaktivität aus Workbench-Nutzung, Dateisystem und letztem Git-Commit

### Verändert

- Terminal-Sessions überstehen Browser-, Backend- und Gerätewechsel und lassen sich erneut anbinden
- Bereits vorhandene tmux-Läufe werden bei genau einem erlaubten Benutzer sicher in die Session-Liste übernommen
- Konfigurierte und lokale Previews verwenden standardmäßig den synchronisierten Chromium-Lauf
- Die Orbit-Sidebar zeigt nur die tatsächlich neuesten Projekte und trennt eingeklappte Bereiche sichtbar
- Browser-WebSockets prüfen strikt den Workbench-Origin; der RSS-XML-Parser ist auf die vollständig gepatchte Version aktualisiert

### Gelöscht

- Temporäre Chromium-Profile, die Anmeldungen nach Leerlauf oder Neustart verloren haben
- Starre Auswahl weniger fest angezeigter Orbit-Projekte
- Veralteter Sidebar-Eintrag `neue-datei.ts`
- Automatisches Unterbrechen beaufsichtigter Terminal-Läufe beim Backend-Neustart
- iframe-Zwang für Previews mit authentifiziertem, geräteübergreifendem Zustand

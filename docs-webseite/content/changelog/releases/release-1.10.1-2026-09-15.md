# [1.10.1] - 2026-09-15

### Erstellt
- Opt-in-Schalter für das Capybara-Easter-Egg
- Deaktivierter Capybara-Standard für neue Konfigurationen
- Verständlicher Pausenstatus in den Einstellungen
- Speicherung der persönlichen Maskottchen-Auswahl
- Prüfung des Ein- und Ausschaltens in der Oberfläche

### Verändert
- Das Capybara erscheint nur noch nach bewusster Aktivierung
- Fehlende Maskottchen-Konfigurationen werden als deaktiviert gelesen
- Die Einstellungen zeigen den Schalter standardmäßig aus
- Bereits ausdrücklich aktivierte Konfigurationen bleiben erhalten
- Dokumentation und Beispielkonfiguration beschreiben das Opt-in-Verhalten

### Gelöscht
- Automatisches Anzeigen des Capybaras beim ersten Start entfernt
- Aktivierter Standardwert aus dem gemeinsamen Konfigurationsschema entfernt
- Aktivierter Fallback während des Ladens entfernt
- Unklare Standardannahme in den Einstellungs-Tests entfernt
- Unbeabsichtigtes Capybara-Flackern vor der Konfigurationsantwort entfernt

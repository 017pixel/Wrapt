# [1.8.0] - 2026-09-14

### Erstellt
- Skill-Editor zeigt vor dem Commit genau an, welche Dateien übernommen werden
- Abgebrochene Skill-Umbenennungen und -Löschungen werden nach einem Neustart automatisch zu Ende geführt
- Terminal-Limit gilt auch nach Neustarts und für bereits laufende Sitzungen
- Audit-Ereignisse überstehen einen vorübergehend nicht beschreibbaren Audit-Speicher
- Easter-Eggs-Bereich in den Einstellungen mit bewegtem Capybara-Maskottchen, zufälligen Aktionen und Begrüßung in der Statusleiste

### Verändert
- Skill-Dateien werden nur noch mit bestätigtem Revisionsstand gespeichert
- Skill-Veröffentlichung ist in Commit und Push getrennt; fremde Arbeitsbaumänderungen bleiben unangetastet
- Dateimanager verschiebt, benennt um und lädt hoch, ohne bestehende Dateien zu überschreiben
- Terminal-Arbeitsverzeichnisse werden vor jedem Start kanonisch gegen die erlaubten Wurzeln geprüft
- Theme-Farben sind auf eine feste Maximallänge und einheitliche Schreibweise begrenzt; Einstellungs-Tabs scrollen per Mausrad seitwärts, Fastify sowie colord enthalten die aktuellen Sicherheitskorrekturen und große Benachrichtigungs-Fixtures werden gebündelt aufgebaut

### Gelöscht
- Automatisches Vormerken und Pushen des gesamten Arbeitsbaums aus dem Skill-Editor
- Tech-News und TLDR-Ansichten samt API entfernt
- Hintergrund-Sync, Mistral-Aufbereitung und KI-Chat für Nachrichten entfernt
- Eingebauter Server-Browser samt Chromium-Stream entfernt
- Browser-Menüs und DevTools entfernt; bestehende Browser-Knoten bleiben lesbar

# [0.32.0] - 2026-07-27

### Erstellt

- Schnelle iframe-Vorschau für lokale Ports direkt im Browser-Werkzeug
- Geräteansicht und Direkt/Server-Umschalter auch im Browser-Werkzeug
- Quellenanzeige im Browser-Werkzeug: iframe-Origin oder Chromium-Ziel

### Verändert

- Ein Klick auf einen lokalen Port im Browser öffnet ihn direkt im selben Fenster statt in einem neuen Preview
- Der Server-Chromium im Browser-Werkzeug startet erst bei echter externer Navigation, nicht mehr beim bloßen Öffnen
- Lokale Browser-Vorschauen teilen sich einen Preview-Slot pro Zielport

### Gelöscht

- Ungenutzten Chromium-Prozess beim Öffnen des leeren Browser-Werkzeugs

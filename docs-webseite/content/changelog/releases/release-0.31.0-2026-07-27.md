# [0.31.0] - 2026-07-27

### Erstellt

- Sechs getrennte HTTPS-Preview-Slots für schnelle lokale Entwicklungsansichten
- Benannte Preview-Gruppen mit einem, zwei, drei oder sechs parallelen Slots
- Eigenes Browserfenster mit allen Slots einer Gruppe nebeneinander im Vollbild
- Geräteansichten mit Notch, Dynamic Island, Punch-Hole und Home-Indikator
- Sichtbare Quellenanzeige je Preview: direktes iframe oder Server-Chromium

### Verändert

- Lokale Previews rendern standardmäßig direkt im iframe statt als JPEG-Browserstream
- Neue Preview-Slots starten mit iPhone-13-Maßen statt im freien Responsive-Modus
- Ein Layoutwechsel hängt Slots an, statt vorhandene Previews zusammenzuquetschen
- Preview-Leisten lassen sich auf ihrer gesamten freien Fläche verschieben
- Gerätewahl, Isolation, Laufzeit und Ausrichtung lassen sich pro Slot festlegen

### Gelöscht

- code-server-Absproxy als Standardweg für Development-Previews
- Server-Chromium als versteckter Standard für lokale Preview-Panels
- Projektabhängige Vite-Basis-Pfade für Preview-Router und HMR
- Zusätzliche Griff-Symbole in den Kopfleisten von Gruppen und Slots
- Systemdienste und Ports ohne HTTP-Antwort in der lokalen Portübersicht

# [2.1.6] - 2026-10-04

### Behoben
- Dashboard-Hintergrund erscheint ohne Nachladezeit. Das Bild wird schon beim Start der App geladen statt erst, wenn das Dashboard aufgebaut wird, und ist damit fertig, bevor der erste Inhalt erscheint
- Ein im Einstellungsraster ausgewähltes Motiv ist sofort verfügbar, wenn man danach das Dashboard öffnet

### Verändert
- Dashboard-Motive werden in zwei kleineren Größen ausgeliefert: 1280 × 720 statt 1672 × 941 für den Hintergrund, das spart die Hälfte der Ladezeit beim Dekokieren
- Die Motiv-Auswahl in den Einstellungen nutzt kleine Vorschaubilder. Der Tab lädt dadurch 59 KB statt 2,7 MB und reagiert sofort
- Beim Öffnen der Motiv-Auswahl wird kein Hintergrundbild geladen, solange der Hintergrund ausgeschaltet bleibt
- Das Hermes-Fenster lädt beim wiederholten Öffnen rund 500 KB weniger. Die Programmdateien der Oberfläche bleiben im Browser-Cache, statt bei jedem Mal neu geladen zu werden
- Schriften und Symbole der Hermes-Oberfläche werden nicht mehr bei jedem Öffnen neu geladen
- Die Hermes-Statusanzeige antwortet schneller, weil die benötigten Angaben nicht mehr nacheinander abgefragt werden
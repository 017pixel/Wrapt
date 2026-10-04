# [2.1.6] - 2026-10-04

### Behoben
- Dashboard-Hintergrund erscheint ohne Nachladezeit. Das Bild wird schon beim Start der App geladen statt erst, wenn das Dashboard aufgebaut wird, und ist damit fertig, bevor der erste Inhalt erscheint
- Ein im Einstellungsraster ausgewähltes Motiv ist sofort verfügbar, wenn man danach das Dashboard öffnet
- Eine inhaltlich gleiche Antwort aus dem Hermes-Cache behält ihre Cache-Frist. Vorher konnte ein `304` die einjährige Frische der Oberflächendateien auf eine Stunde herabsetzen

### Verändert
- Dashboard-Motive werden in zwei kleineren Größen ausgeliefert: 1280 × 720 statt 1672 × 941 für den Hintergrund, das spart die Hälfte der Ladezeit beim Dekodieren
- Die Motiv-Auswahl in den Einstellungen nutzt kleine Vorschaubilder. Der Tab lädt dadurch 59 KB statt 2,7 MB und reagiert sofort
- Beim Öffnen der Motiv-Auswahl wird kein Hintergrundbild geladen, solange der Hintergrund ausgeschaltet bleibt
- Das Hermes-Fenster lädt beim wiederholten Öffnen rund 500 KB weniger: 98 KB statt 600 KB. Die Programmdateien der Oberfläche bleiben im Browser-Cache, statt bei jedem Mal neu geladen zu werden
- Schriften und Symbole der Hermes-Oberfläche werden nicht mehr bei jedem Öffnen neu geladen. Bisher hatten sie gar keine Cache-Regel und wurden nur zufällig zwischengespeichert
- Die Hermes-Statusanzeige antwortet schneller, weil die benötigten Angaben nicht mehr nacheinander abgefragt werden
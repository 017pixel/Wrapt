# Landingpage und mobile Notes

Die Landingpage bekommt einen klareren Einstieg für Entwickler und ein dezentes
Raster an beiden Rändern. Mobile Notes orientiert sich an Notions Seitenlayout,
mit ruhiger Navigation, einem umbrechenden Titel und einer breiten Lesefläche.
Die bestehende Farbpalette und alle Notizfunktionen bleiben erhalten.

- [x] Bestehende Seite, Notes, Screenshot-Fixture und freie Ports prüfen.
- [x] Mobile Notes gestalten und Titel ohne Abschneiden anzeigen.
- [x] Landingpage aufräumen, Randraster ergänzen und Renderkosten reduzieren.
- [x] Nur den mobilen Notes-Screenshot mit isolierten Dummy-Daten ersetzen.
- [x] Desktop, mobile Breiten, Notes-Aktionen und schnelles Scrollen prüfen.
- [x] Typen, relevante Tests und Dateigrößen prüfen; Version und Changelog pflegen.

Es gibt keine Änderungen an API-Verträgen oder gespeicherten Notizen.
Die laufende Workbench und die Previews des Nutzers werden nicht neu gestartet.

## Prüfung

- Produkt und Landingpage gebaut; Produktversion 2.0.1.
- Typenprüfung, Lint der geänderten Dateien und Dateigrößenprüfung erfolgreich.
- Zehn Notes-Tests erfolgreich, einschließlich Titelwechsel und Zeilenumbruch-Kompatibilität.
- Browser: Landingpage bei 360, 390, 768, 1024 und 1440 px ohne Überlauf.
- Browser: Notes bei 360, 390, 430, 768 und 1440 px; Speichern, Suche,
  Checklisten, neue Seiten und Unterseiten geprüft.
- Schnellscrollen: 79 beobachtete Frames, kein Frame über 50 ms im lokalen Chromium-Test.
- Alle elf eingebundenen Bilder laden. Nur wrapt-mobil-notizen.png ersetzt,
  390 × 844 px aus einer Aufnahme mit doppelter Auflösung und Dummy-Daten.
- Isolierte Demo-Instanz und eigener Landingpage-Server beendet.

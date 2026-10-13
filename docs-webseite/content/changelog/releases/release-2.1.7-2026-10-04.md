# [2.1.7] - 2026-10-04

### Verändert
- Notizen behalten beim schnellen Tippen, Löschen und Weiterschreiben ihren Inhalt und die Cursorposition, auch wenn Speicherantworten verspätet eintreffen.
- Notiztitel und KI-Skills speichern aufeinanderfolgende Änderungen ohne Überschreiben durch ältere Bestätigungen oder unnötige Konflikte.
- Zu große Uploads werden vollständig abgewiesen, statt abgeschnittene Dateien zu veröffentlichen. Fehlgeschlagene Uploads hinterlassen weniger temporäre Dateien.
- Textvorschauen zeigen nach gleichzeitiger Dateikürzung keine zusätzlichen Nullzeichen; leere Dateien beantworten ungültige Bytebereiche kontrolliert.
- Benachrichtigungsfilter, veraltete Dateimanager-Antworten und die Aktualisierung der Nutzungsanzeige verarbeiten ihre Zustände korrekt.
- Projektdateien legen über symbolische Verweise keine Verzeichnisse außerhalb des Projekts an. Der Schutz externer HTTP-Zugriffe blockiert zusätzlich private NAT64-Adressen.
- Verstellbare Seitenbereiche und die PWA-Updateüberwachung entfernen ihre Listener beim Verlassen zuverlässig.
- Leere Überschriften brechen den Build der Dokumentation nicht mehr ab.
- Der Desktop-Launcher zeigt seinen Status und verbindet seine Bedienelemente wieder korrekt.
- Sicherheitskorrekturen in Abhängigkeiten eingespielt und ungenutzte Bibliotheken und Symbole entfernt.

### Erstellt
- Regressionstests für schnelle Editoränderungen, Uploadgrenzen, Cache-Aktualisierungen, Dateizugriffe und Launcher-Bedienung.
- Anleitung für mehrere T3-Codex-Accounts ergänzt: feste Work-Anmeldung, Unterschiede der ChatGPT-Anmeldewege und Prüfung von Modellen und Subagenten.

# Changelog

## [0.26.1] - 2026-10-26

### Verändert
- Cronjobs können ohne Projektordner verwaltet werden.

## [0.26.0] - 2026-10-25

### Gelöscht
- Verträge und Erweiterungsbeiträge für Orbit und den Infinite Canvas entfernt.

## [0.24.0] - 2026-10-22

### Erstellt
- Optionale Diagnosewerte für Fehler und letzte erfolgreiche Synchronisierung des Terminal-Status.

## [0.23.0] - 2026-10-22

### Erstellt
- Öffentliche Eingabeverträge für die Plugin-Anbindung von Git, Benachrichtigungen und Terminal-Brokern.

## [0.21.0] - 2026-10-21

### Erstellt
- Die Composer-Verträge melden die verfügbaren Freigabemodi mit. Clients können den Bypass sichtbar anbieten, ohne den Zustand zu erfinden.
- Das Gateway kennt ein neues Op zum Umschalten der Freigabe. Die Antwort liefert die beobachtete Composerprojektion zurück.
- Der Snapshot kann melden, ob die Historie unvollständig ist. Clients zeigen den Nachladeknopf erst danach.

### Verändert
- Ein Anbieter ohne gemeldete Modelle bleibt im Katalog sichtbar und wird als solcher benannt, statt still zu verschwinden. Ein einzelner fehlerhafter Anbieter kippt den Katalog nicht mehr.

## [0.20.0] - 2026-10-20

### Erstellt
- Profilgebundene Hermes-V2-Konfiguration mit begrenzten lesbaren Werten und gezielten Änderungen samt erwartetem Ausgangsstand.

## [0.19.0] - 2026-10-18

### Erstellt
- Eigenständige Hermes-V2-Verträge für Sessions, Gateway-Ereignisse, Eingabeanfragen und Modell-/Command-Kataloge.
- Hermes V2 kann die ursprüngliche logische Nachrichten-ID zusätzlich zur gespeicherten Row-ID übertragen. Compaction-Kopien bleiben dadurch ohne Textvergleich erkennbar.
- Zusätzliche Hermes-V2-Verträge für Sitzungsorganisation, revisionsgebundene Aktionen, genaue Lesebelege sowie begrenzte Summary- und Mitgliedschaftsseiten.
- Optionale Composer-Verträge für native Titel, beobachtete Denktiefe, Katalogmetadaten und eigentumsgebundene Datei-Anhänge. Bestehende Gateway-Ausgaben bleiben ohne Composer-Opt-in erhalten.
- Optionale Work-Verträge für strukturierte Unteraufgaben, Prozesse, Nebenaufträge, den nächsten Queuekopf und konkrete native Aktionsergebnisse. Ältere Gateway-Clients erhalten diese Erweiterung erst nach ausdrücklichem Opt-in.
- Typisierte Ressourcenverträge für Cron, Skills, Memory, passive Diagnose und bestätigtes natives Sitzungsdelete. Ressourceninvalidierungen auf der bestehenden Verbindung verlangen ein eigenes Opt-in.

### Verändert
- Die maximale Textlänge des Hermes-V2-Vertrags steht den Inhaltsfiltern als gemeinsame Grenze zur Verfügung.

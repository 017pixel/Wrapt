# Changelog

## [0.1.7] - 2026-10-01

### Erstellt
- Capybara-Easter-Egg läuft unten am Fensterrand mit und zeigt alle Bewegungen der Workbench
- Klick auf das Capybara startet die Jubel-Animation und zeigt einen Spruch zur Dokumentation

### Verändert
- Capybara-Sprites kommen beim Doku-Build direkt aus der Workbench, statt doppelt gepflegt zu werden
- Auf schmalen Bildschirmen bleibt das Easter Egg ausgeblendet

## [0.1.6] - 2026-09-30

### Verändert
- Einleitungstexte aller Themenseiten sitzen bündig über dem Inhaltsbereich
- Hintergrundbilder laden als WebP deutlich schneller

### Gelöscht
- Pfadleiste über den Überschriften entfernt

## [0.1.5] - 2026-09-30

### Verändert
- Kurze Nebenüberschriften und Erläuterungen auf der Landingpage entfernt

## [0.1.4] - 2026-09-30

### Verändert
- Dokumentationsbilder erhalten denselben dezenten Tilt-Hover wie auf der Landingpage
- Handyaufnahmen erscheinen kleiner und rechts am Erklärungstext
- Tabellen füllen den verfügbaren Inhaltsbereich bis zur rechten Kante
- Kapitel-Hintergründe aus dem aktuellen Stand erscheinen auf GitHub Pages
- Über Tilt-Bildern und Tabellen scrollt die Seite weiter; das Wrapt-Favicon lädt ohne 404

## [0.1.3] - 2026-09-29

### Erstellt
- Das Startkapitel zeigt Dashboard und Notizen als angewinkeltes Handy-Bildpaar
- Das Markdown-Kürzel `:::phones` bündelt mehrere Handyaufnahmen in einer Reihe

### Verändert
- Alle Produktaufnahmen stammen aus der isolierten Demo-Instanz mit Stand 1.24.0
- Desktop-Motive zeigen den Laptop-Maßstab mit 1728 × 1117 Pixeln statt 1280 × 720
- Die Suche in der Kopfzeile erscheint als reiner Text mit Tastenkürzel statt als umrandetes Feld
- Handybilder sind kleiner, rechts ausgerichtet und leicht gedreht

### Behoben
- Mausrad über Tabellen und Codeblöcken scrollt die Seite jetzt weiter

## [0.1.2] - 2026-09-29

### Verändert
- Mausrad über dem Startbild bewegt die Seite wieder normal nach unten
- Einführungstext, Titel und Pfad stehen jetzt direkt über den drei Themenkarten
- Fester Abstand von 32 Pixeln zwischen Einführung und Karten
- Startbild beschneidet überstehende Inhalte ohne eigenes Scrollverhalten
- Abstände gelten einheitlich auf Desktop, Tablet, Handy und im Querformat

## [0.1.1] - 2026-09-28

### Verändert
- Dokumentationsstartseite zeigt Pfad, Titel und Einführung im Bildbereich
- Nachthimmelmotiv reicht über die rechte Inhaltsleiste bis zum rechten Bildschirmrand
- Aktive Seitenlinks verwenden ausschließlich blauen Text
- Wrapt-App-Icon ersetzt den Buchstaben im Doku-Kopf
- Suche und mobile Seitenauswahl erhalten Ein- und Ausblendanimationen; Navigation scrollt weich

## [0.1.0] - 2026-09-28

### Erstellt
- Neue Wrapt-Dokumentationswebsite mit Seitenliste und Suchfunktion
- Responsive Navigation für Desktop, Tablet und Handy
- Visuelle Changelog-Ansicht mit Filtern und aufklappbaren Versionen
- Projekt- und Betriebsanleitungen aus der bestehenden Dokumentation
- Landingpage-Einstieg zur öffentlichen Dokumentation

### Verändert
- GitHub-Pages-Build bündelt die Doku unter `/Wrapt/doku/`
- Landingpage verlinkt auf den neuen Dokumentationsbereich
- Bestehende Screenshots werden aus freigegebenen Motiven übernommen
- Changelog-Notizen werden für die Website nach Version aufgeteilt
- Doku-Seiten verwenden die Wrapt-Theme-Tokens und lokalen Schriften

### Gelöscht
- Direkter Footer-Sprung von der Landingpage auf eine einzelne Installationsdatei
- Keine Produktfunktionen entfernt
- Keine bestehenden Dateien unter `docs/` gelöscht
- Keine Einträge aus der Projekt-CHANGELOG entfernt
- Keine Original-Screenshots aus ihren Quellordnern gelöscht
- Keine lokalen Konfigurationen oder Nutzerdaten durch den Doku-Build geändert

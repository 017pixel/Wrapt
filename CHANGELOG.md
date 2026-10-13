# Changelog

Alle relevanten Änderungen werden in kurzen Stichpunkten dokumentiert.

## [2.5.1] - 2026-10-13

### Verändert
- Limit-Popup breiter und passend zum Inhalt: Alle Limitbalken der drei Konten bleiben bei ausreichender Fensterhöhe sichtbar; Reset-Guthaben stehen als ruhige Textzeile dabei.
- Changelog-Popup mit mehr Lesebreite, klarerer Typografie und einem gemalten Nachthimmel mit dezent animierten Sternen. Reduzierte Bewegung wird berücksichtigt.

## [2.5.0] - 2026-10-13

### Erstellt
- Changelog in der Statusleiste: Beim Überfahren der Versionsanzeige öffnet sich ein Popup mit den wichtigsten Punkten der letzten Versionen aus der CHANGELOG.md.

## [2.4.0] - 2026-10-13

### Erstellt
- Skills-Seite mit drei Gruppen: Globale Regeln, Skills und Hermes-Skills stehen in einem Baum mit Zählern, Suche über alles und Badges für defekte oder beschreibungslose Einträge.
- Hermes-Skills lassen sich direkt verwalten: anlegen mit Kategorie, umbenennen und löschen inklusive aller Verweise.
- Globale Regeln im Baum: die verteilte AGENTS.md und die Hermes-Regeln öffnen sich im selben Editor.
- Preview-Laufzeiten starten erst nach expliziter Befehlsfreigabe: Befehl und Pfad stehen im Dialog, erst nach Bestätigen läuft der Start.

### Verändert
- Skills-Seitenleiste aufgeräumt: kein Pfad unten, kein Kopf oben, dünnere Scrollbar, Dateiname und Skill-Name stehen nebeneinander.
- Skill-Vorschau als zentrierte Leseansicht mit größerer Schrift, der Frontmatter-Block bleibt draußen.
- Git-Leiste auf einen Knopf reduziert: Commiten und Pushen auf GitHub läuft automatisch ab, Fehler mit Log bleiben sichtbar.
- Vier Skills sind zu den Hermes-Skills gezogen: use-t3-code, wrapt-fleet, server-fleet-sync und server-fleet-daily-sync liegen unter devops.
- Landingpage- und Doku-Screenshots erneuert: dunkles Standard-Theme mit Demo-Daten überall, Capybara in der Statusleiste und Dashboard-Hintergrund auf den Übersichts-Motiven.
- Accounts-Liste weiter vereinfacht: Zeilen zeigen nur noch die E-Mail-Adresse, Status und Details stehen im 3-Punkte-Menü unter Information, Aktiv-Button und Aktivieren-Button sind gleich groß, das Menü klappt unten nicht mehr um.
- Account-Menü zweispaltig: Information und Aktionen stehen nebeneinander, das Popup ist breiter statt höher und weicht nach oben aus, wenn unten kein Platz ist.
- Skills-Baum klappt weich auf und zu, auf Touch-Geräten sind alle Ziele finger groß und Aktionen ohne Schweben erreichbar.
- Terminal füllt seinen Bereich randlos: Die Zeichenfläche geht bis an die Terminal-Liste, die Kopfleiste und die Statusleiste; auch geteilte Terminals trennt nur noch der schmale Ziehgriff statt eines breiten schwarzen Streifens.
- Die Terminal-Liste zeigt Ordner als Baum mit Verbindungslinien, weichem Auf- und Zuklappen samt Icon-Wechsel und ruhigen Aktionsknöpfen, die erst beim Überfahren oder Fokus erscheinen.
- Die Vorschau beim Überfahren einer Terminal-Zeile erscheint nach 0,3 Sekunden statt nach einer Sekunde.

### Behoben
- Skills-Editor öffnet keine fehlenden Dateien mehr von allein, weder beim Start noch nach dem Löschen.
- Nicht vorhandene Regeldateien sind im Baum deaktiviert statt anklickbar.
- Integrierte Browser-Fläche in T3 Code verbindet wieder: Der Workbench-Proxy leitet den Browser-Stream (`/api/preview-stream`) samt WebSocket weiter, statt mit 404 zu antworten.
- Scrollen im Terminal springt nicht mehr in den tmux-Kopier-Modus mit gelber Positionsanzeige: Das Rad scrollt den normalen Verlauf, Apps mit eigener Maussteuerung wie OpenCode bleiben unberührt.
- Verbrauchsprognosen nutzen die Anwendungszeit statt der Datenbankzeit und bleiben bei gestellter Systemzeit korrekt.

## [2.3.1] - 2026-10-13

### Verändert
- GitHub- und Sync-Hilfe liegt im Drei-Punkte-Menü des Editors statt als eigener Toolbar-Button.

## [2.3.0] - 2026-10-12

### Erstellt
- GitHub- und Sync-Hilfe im Editor erklärt die Grenzen von code-server und den getrennten Anmeldeweg.
- Offizieller VS-Code-Web-Editor ermöglicht die native GitHub-Anmeldung für Copilot und Settings Sync. Einrichtung erfolgt ausdrücklich; bisherige code-server-Daten und Proxy-URLs bleiben erhalten.

### Verändert
- Terminal übernimmt Wrapt-Paletten auch für Auswahl und Cursor, erhält Fokus und Sitzung beim Theme-Wechsel und respektiert reduzierte Bewegung.
- Editor-Proxy erhält das richtige Protokoll und normalisiert seine Startadresse; das iframe erlaubt die Zwischenablage für die GitHub-Geräteanmeldung.

## [2.2.10] - 2026-10-12

### Verändert
- Geparkte Notizeditoren pausieren ihre Detailabfragen und aktualisieren sich bei der Rückkehr.
- Die Betriebsdiagnose verwendet Frontend-Dateimetriken erneut; Hermes-Sitzungen laden nur benötigte Projektreferenzen.
- Projektabfragen teilen die Ordnersuche. Verbrauchsprognosen und die Aufbewahrung der Audit-Historie nutzen passende Datenbankzugriffe.
- Codex-Verläufe werden schrittweise gelesen; die Preview-Prozesssteuerung hält den Server während Wartezeiten erreichbar.
- Terminal-Steuerung wartet asynchron auf tmux und erhält bestehende Sessions beim Wiederverbinden. Orbit-Sicherungen werden geordnet im Hintergrund nachgeholt und bleiben bei Abbrüchen in der Outbox erhalten.
- Notiz-Saves laden fremde Seiten nicht erneut. Lange Notizen werden nach Schreibpausen statt bei jedem Tastendruck serialisiert; Listen lesen vorbereitete Vorschauen.
- Hermes-Statusabfragen teilen kurze Zwischenergebnisse und laden unabhängige Dienstinformationen gleichzeitig.
- Dashboard-Karten bleiben beim Laden ruhiger; das deaktivierte Capybara lädt keine Sprites mehr im Startpaket.
- Geschlossene Notizzweige ruhen, Code-Sprachen laden bei Bedarf und Textänderungen berechnen Orbit-Verbindungsschilder nicht neu.
- Remote-T3-Abfragen überlappen nicht pro Quelle; Hermes-Verbindungen begrenzen langsame Empfänger und die Auditprüfung läuft außerhalb des Serverthreads.
- Weit entfernte Orbit-Terminals pausieren ihre Browser-Abos und synchronisieren sich bei Rückkehr; laufende Prozesse, Terminal-DOM und Iframes bleiben erhalten.

### Behoben
- Große Orbit-Boards übertragen neue Terminal-Layouts in geordneten Schritten, ohne die Anzahl zulässiger Operationen je Anfrage zu überschreiten oder unbestätigte Änderungen zu entfernen.
- Linienpunkte lassen sich zuverlässig greifen und verschieben. Ihre Trefffläche bleibt beim Zoomen ausreichend groß; Abbruch und Rückgängig bewahren den vorherigen Verlauf.

## [2.2.9] - 2026-10-08

### Erstellt
- Funktionstests für vier Nutzertypen, mit leeren und großen Datenbeständen, angepassten Einstellungen, mobilen Abläufen und Fehlerfällen.

### Verändert
- Browserprüfungen laufen mit Chromium, getrennten Testdaten und einem HTML-Bericht. Einstellungen werden zusammen mit den betroffenen Arbeitsabläufen geprüft.

### Behoben
- Notes ist als Start-App auswählbar und lässt sich in der Navigation ein- und ausblenden.
- Notiztitel sind auf 300 Zeichen begrenzt, damit zu lange Eingaben beim Speichern nicht mehr abgewiesen werden.
- „Open in VS Code" in T3 Code öffnet auch im breiten Layout mit ausgeklapptem Thread-Details-Panel wieder die Code-Editor-Seite mit dem passenden Projektordner, statt auf einen wirkungslosen VS-Code-Link zu laufen.

## [2.2.8] - 2026-10-07

### Erstellt
- Breadcrumb in der Kopfzeile zeigt bei mehreren Servern den aktiven Server an.

### Verändert
- Sidebar klappt weich auf und zu ohne Springen: Texte blenden per Fade aus, Icons behalten ihre Position, Sektionen öffnen per Animation.
- Sidebar-Gruppe „Orbit" heißt jetzt „Allgemein", der Server-Wechsler verhält sich wie ein Navigationseintrag.
- Plugin-Seite aufgeräumt: Hero, Karten und Sektionen zeigen nur noch die Titel, Zähler- und Hilfstexte sind entfernt, Skill-Hinweis erklärt kurz die Agent-Skills für Codex, Claude Code und OpenCode.
- Accounts-Tab vereinfacht: Kopf heißt nur noch „Profile", Aktionen heißen „Account hinzufügen" und Icon-Refresh auf Tab-Höhe, Liste ist gruppiert nach Codex, Claude Code und OpenCode Go mit Aktivieren-Button und 3-Punkte-Menü, ohne Limits.

### Behoben
- Öffnen-im-Editor aus T3 Code und Tool-Panel landet wieder auf der Code-Editor-Seite statt auf 404, der App-Basename wird mitgegeben.

## [2.2.4] - 2026-10-07

### Behoben
- Alle Einträge zum Öffnen im Editor in T3 Code führen zur Code-Editor-Seite mit dem passenden Projektordner, statt wirkungslos zu bleiben.

### Verändert
- Der Editor lädt bei Hover über den Einträgen im Hintergrund vor, der Klick wirkt dadurch fast instant.

## [2.2.3] - 2026-10-07

### Behoben
- Der Werkzeug Eintrag Claude Code öffnet wieder die Claude Seite statt Orbit.

### Verändert
- Seiten öffnen nach Hover spürbar schneller: Code und Startdaten laden im Hintergrund vor, der Klick wirkt fast instant. Gilt für alle Seiten, Werkzeuge und Projektlinks.
- Server im Wechsler zeigen nach Hover schneller ihren Status, die Verbindung wird gleichzeitig vorbereitet.

## [2.2.2] - 2026-10-07

### Behoben
- Serverwechsel behält die offene Seite samt Parametern. Ist sie auf dem Zielserver ausgeblendet oder nicht vorhanden, öffnet sich das Dashboard auch bei einer anderen eingestellten Startseite.
- Die Serverauswahl und ihr Detailmenü schließen per Außenklick. Das Detailmenü öffnet seitlich rechts und weicht auf schmalen Bildschirmen aus, ohne die Serverliste zu verdecken.

### Verändert
- Neue Server lassen sich nur noch unter Einstellungen → Workspaces hinzufügen.

## [2.2.1] - 2026-10-06

### Behoben
- Ziehen von Notizseiten und Favoriten in Ordner funktioniert auch in Safari zuverlässig, wenn der Browser die Zieh-Typen nicht meldet.

## [2.2.0] - 2026-10-05

### Erstellt
- Eigene Notizordner mit Umbenennen, Verschieben und Auflösen ohne Verlust der Seiten.
- Sortierbare Notizabschnitte und Seiten sowie direkte Erstellung neuer Favoritenseiten.
- Aufklappbare Übersicht über die Nutzungslimits in der Fußleiste: Beim Überfahren erscheint eine Karte mit allen Zeitfenstern je Anbieter (5 Stunden, 7 Tage, 30 Tage), dem Verbrauch als Balken, dem Zeitpunkt des nächsten Reset und – sofern vorhanden – den verfügbaren Reset-Guthaben. Mehrere Konten eines Anbieters stehen untereinander. Auf Touch-Geräten öffnet sich die Karte per Tipp.

### Verändert
- Preview-Kapazität von zwölf auf 60 Slots und den Projektportpool von zehn auf 50 erweitert; bestehende Portzuordnungen bleiben erhalten.
- Notizgruppen, Favoriten und Suche reagieren mit kurzen Animationen. „Privat“ heißt jetzt „Alle Notizen“.
- Der Limits-Bereich der Fußzeile hat drei klar unterscheidbare Zustände: ruhend, beim Überfahren und geöffnet. Der bisherige nasse Browser-Tooltip entfällt, weil er neben der neuen Karte doppelt und schlechter dargestellt hätte.
- Unbekannte Zeitfenster eines Anbieters werden nicht mehr verworfen, sondern aus ihrer Länge abgeleitet.

### Behoben
- Geschlossene Preview-Tabs geben ihre ungenutzten Slots frei und öffnen sich nicht sofort erneut. Sitzungserneuerung und Freigabe behandeln abgelaufene und noch laufende Anfragen.
- Vollbildaktionen stehen in der Kopfzeile nebeneinander.
- Blockgriffe bleiben auch bei hohen Bildern am Inhalt. Klicks auf freie Editorfläche setzen den Cursor an die letzte Schreibzeile.
- Mausrad-Scrollen funktioniert über Seitentiteln und Einträgen im Verschiebedialog.

## [2.1.7] - 2026-10-04

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

## [2.1.6] - 2026-10-04

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

## [2.1.5] - 2026-10-03

### Verändert
- Previews-Seite aufgeräumt: ein pulsierender Laufstatus, kompakte Aktionen und weniger doppelte Statusanzeigen und Hilfstexte
- Preview-Ziel und Hauptziel verwenden eigene Dropdowns im Wrapt-Stil mit Tastaturbedienung

## [2.1.4] - 2026-10-03

### Behoben
- Codex-Accountwechsel greift jetzt auch in T3 Code: Läuft der geteilte Codex-Prozess noch mit der alten Anmeldung, startet Wrapt T3 Code einmal neu, damit der nächste Codex-Auftrag den aktiven Account nutzt
- Ein abgestürzter Codex-Prozess wird so zuverlässig wie möglich behandelt; Wrapt erkennt ihn und startet T3 für einen sauberen Neustart neu, statt ihn hängen zu lassen

## [2.1.3] - 2026-10-03

### Behoben
- Previews melden jetzt jeden Dienst einer Projektlaufzeit korrekt; zuvor galten Dienste außerhalb des ersten Fensters als gestoppt und wurden nicht überwacht
- Fehlgeschlagene Dienste werden zuverlässig automatisch neu gestartet; ein manueller Start baut eine teilweise fehlgeschlagene Projektlaufzeit vollständig neu auf
- „Im neuen Tab öffnen“ und „URL kopieren“ starten einen gestoppten Dienst neu, statt einen toten Slot-Link zu verwenden

### Verändert
- Preview-Symbol in der Seitenleiste zeigt deutlicher eine startbare Webseite
- Anleitung zu `preview.config.json` an das tatsächliche Verhalten angepasst (alle Fenster überwacht, statische Seiten, Vordergrundprozesse)

## [2.1.2] - 2026-10-02

### Behoben
- Verwaiste, nicht mehr sichtbare Terminalsitzungen belegen kein Sitzungslimit mehr; neue Terminals lassen sich wieder öffnen

## [2.1.1] - 2026-10-02

### Behoben
- Neue Terminalflächen im Orbit starten mit ihrer gespeicherten Kennung; vorhandene Sitzungen bleiben erhalten
- Orbit-Flächen bleiben in Safari nach dem Loslassen der Maus an ihrer Position
- Push meldet wichtige Ereignisse auch bei aktiver Workbench; bereits im geöffneten Chat sichtbare Ereignisse bleiben ausgenommen

### Verändert
- Veraltete Browser-Prüfungen an Notizeditor, mobile Aktionen und Orbit-Information angepasst
- README und Benachrichtigungsplanung an den aktuellen Funktionsumfang angepasst

## [2.1.0] - 2026-10-02

### Verändert
- Terminal-Verbindungen, Bildschirmwiederherstellung und Ausgabe bei Unterbrechungen überarbeitet; Verbindungs- und Layoutfehler werden sichtbar angezeigt
- Split-Terminals und Größenänderungen reagieren direkt; mobile Ansichten bewahren andere Sitzungen auch im Querformat
- Terminalordner lassen sich direkt benennen; Einträge und Ordner haben erreichbare Touch- und Tastaturaktionen
- Terminalkern für Linux, macOS und natives Windows angepasst; PowerShell, Windows-Pfade und CLI-Shims werden unterstützt

### Erstellt
- Automatischer Wiederanlauf ausdrücklich persistenter Terminals nach einem Host-Neustart mit gespeichertem Arbeitsverzeichnis
- Regressionstests für Wiederverbindung, große Ausgabeschübe, Resize, mobile Splits, Persistenz und das Beenden von Sitzungen
- Native PTY-Prüfung und CI-Prüfmatrix für Linux, macOS und Windows

### Behoben
- Einzelnes Beenden schließt jetzt auch den zugehörigen Prozess und gibt dessen Sitzungsplatz frei
- Terminals im Split starten im aktuellen Arbeitsverzeichnis der aktiven Sitzung

### Gelöscht
- Projekt- und Standardpfadauswahl in der Terminal-Topbar

## [2.0.1] - 2026-10-02

### Verändert
- Landingpage mit klarem Entwickler-Einstieg, größeren Produktaufnahmen und dezentem Randraster überarbeitet
- Mobile Notes mit umbrechenden Titeln, ruhiger Kopfzeile, größeren Touch-Zielen und direktem Zugriff auf Seiten, Suche und neue Notizen gestaltet
- Mobiler Notes-Screenshot durch eine neue Aufnahme mit Dummy-Daten ersetzt

### Behoben
- Aufwendige Bildtransformationen und Kopfzeilen-Blur auf der Landingpage entfernt; weitere Aufnahmen werden erst bei Bedarf geladen
- Lange Notiztitel bleiben vollständig sichtbar und eingefügte Zeilenumbrüche bleiben mit vorhandenen Titeln kompatibel
- Dashboard-Scrollen funktioniert auch über Diagrammen und Tabellen; horizontales Wackeln entfällt und das Hintergrundbild wird früher geladen

## [2.0.0] - 2026-10-02

### Erstellt
- Regressionstests für kombinierte Nutzungsfilter, Push-Einstellungen und die verbleibende Benachrichtigungssynchronisierung
- Ausführbare Browser-Tests der Nutzungsübersicht mit isolierten Demo-Daten

### Verändert
- Benachrichtigungseinstellungen enthalten nur noch Push-Schalter. Frühere Toast-Felder entfallen aus API-Antworten; bestehende Einstellungen bleiben lesbar und behalten ihre Push-Auswahl.
- README, technische Dokumentation und Dokumentationswebseite an den aktuellen Funktionsumfang angepasst

### Gelöscht
- Sämtliche Toast-Oberflächen, Aufrufe, Einstellungen, Styles und überholten Tests entfernt
- Ungenutzte Timeline, doppelte Werkzeug- und Routingdefinitionen, alte Hilfsfunktionen und Diagnoseskripte entfernt

### Behoben
- Ausgeblendete Accounts bleiben auch bei aktiviertem Problemfilter ausgeblendet
- Nutzungsseite und lange Accountnamen im Detaildialog passen auf kleine Displays

## [1.25.3] - 2026-10-01

### Verändert
- Produktversion auf 1.25.3 angehoben (Root, Server und Web)

### Behoben
- Schnelle Änderungen in Notes bleiben beim Autospeichern erhalten

## Ältere Versionen

- [1.25.2 bis 1.16.0](docs/changelog/1.25.2-bis-1.16.0.md)
- [1.15.0 bis 1.5.1](docs/changelog/1.15.0-bis-1.5.1.md)
- [1.1.1 bis 0.91.0](docs/changelog/1.1.1-bis-0.91.0.md)
- [0.90.0 bis 0.90.0](docs/changelog/0.90.0-bis-0.90.0.md)
- [0.43.0 bis 0.31.0](docs/changelog/0.43.0-bis-0.31.0.md)
- [0.30.3 bis 0.20.1](docs/changelog/0.30.3-bis-0.20.1.md)
- [0.20.0 bis 0.9.0](docs/changelog/0.20.0-bis-0.9.0.md)
- [0.8.0 bis 0.2.0](docs/changelog/0.8.0-bis-0.2.0.md)
- [0.1.0 bis 0.1.0](docs/changelog/0.1.0-bis-0.1.0.md)

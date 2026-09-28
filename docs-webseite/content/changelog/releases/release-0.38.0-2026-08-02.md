# [0.38.0] - 2026-08-02

### Erstellt

- Eigene Inbox-Seite mit drei Quellbereichen und chronologischem mobilen Stream
- Sofortige Zustellung neuer Einträge über eine Live-Verbindung mit Polling-Fallback
- System-Benachrichtigungen per Web-Push für wichtige Rückfragen, Pläne und Fehler
- Fehlerberichte mit kopierbarem Reparaturauftrag und Übergabe an T3 Code
- Benachrichtigungen für T3 Code, Hermes, Codex, OpenCode, Claude Code und lange Terminal-Prozesse

### Verändert

- Die Glocke öffnet jetzt die vollständige Inbox und zeigt den echten offenen Ungelesen-Zähler
- Toasts sind kleiner, dezenter, auf drei Einträge begrenzt und per Wischgeste schließbar
- Gelesen-, Erledigt- und Gelöscht-Zustände folgen nun dem tatsächlichen Status der zugehörigen Aufgabe
- Benachrichtigungsschwellen und Zustellwege lassen sich zentral und pro Quelle konfigurieren
- Terminal- und Agentenhinweise öffnen direkt die zugehörige Sitzung oder den konkreten T3-Thread

### Gelöscht

- Das kleine Benachrichtigungs-Popover in der Kopfzeile wurde entfernt
- Kurze Hermes-Antworten ohne Werkzeugnutzung erzeugen keine Einträge mehr
- Unveränderte Hermes-Updates melden keinen falschen Versionssprung mehr
- Erledigte Einträge bleiben nicht mehr als sichtbarer Verlauf in der Inbox stehen
- Das separate Bestätigen von Fehlern wurde durch Lesen, Fehlerbericht und Löschen ersetzt

---

## [Unveröffentlicht]

### Erstellt

- Preview Hub als zentrale Projektsteuerung mit neustartfestem Dev-Server, Status, Logs, Hauptport und Tailscale-URL
- Eigenständige Xcode-artige Geräteansicht für externe Preview-Fenster mit Ausrichtungswechsel
- Persistenter Öffnungsmodus für ein eigenes Browserfenster oder einen neuen Tab
- Kontextuelle Workbench-Aktionsinsel mit zur Panelanzahl passenden Preview-Rastern
- Verträge, Datenbanktabellen und Tests für Prozesssteuerung, Ports, Logs und Hub-Einstellungen
- Hermes-Flächenleiste: Chat, Sessions, System, Cron, Auswertung, Logs, Modelle direkt sichtbar, der Rest unter „Mehr"
- Dauerhafte Hermes-Statusanzeige im Kopf mit Chat-, Dashboard-, Gateway-, Modell- und Versionszustand
- Routen-Brücke vom Workbench-Iframe in die Hermes-SPA: Seitenwechsel in Millisekunden statt komplettem Neuaufbau
- Native Hermes-Agent-Oberfläche mit ACP-Streaming, Sessionliste, Toolkarten, Freigaben und Stopptaste
- Eingebettete offizielle Hermes-Verwaltung unter dem geschützten `/hermes`-Präfix mit Forwarded-Host und Theme
- Hermes-Status-, Aufgaben-, Cron- und Ergebnisflächen im Orbit sowie ein wiederverwendbarer Hermes-Werkzeugknoten
- Persistente Benachrichtigungszentrale mit Toasts, Ungelesen-Zähler und bestätigbaren Fehlern
- User-Units, täglicher Europe/Berlin-Update-Timer, Retry-Lauf, Backup- und Diagnosepfad für Hermes
- Dateimanager „Finder" als eigene Seite und Workbench-Werkzeug: Drei-Pane-Ansicht mit Verzeichnisbaum, Liste/Raster und Vorschau-Panel
- Quick Look per Leertaste: Live-Vorschau für Code (Syntax-Highlighting), Bilder, Video, Audio, PDF, HTML-Render und Markdown, auf Mobil als Bottom Sheet
- Serverseitig synchronisierter Dateimanager-Zustand: aktueller Pfad, Verlauf und Favoriten gelten auf allen Geräten
- Dateiaktionen im Server-Dateisystem: Umbenennen, Verschieben, Löschen, Ordner anlegen, Upload per Auswahl oder Drag & Drop, Download
- Integrationen: Ordner in Terminal oder Editor öffnen, als Projekt registrieren, in den Orbit einbetten
- Neues Dashboard als Betriebszentrale mit Gesamtaussage im Kopf statt reiner Kachelsammlung
- Kennzahlenleiste mit CPU, Arbeitsspeicher, Datenträger, Event-Loop, Anfragen und Fehlerquote samt Verlauf
- Eigener Bereich „Workbench-Diagnose" mit Bereitschaftsprüfungen, Betriebshinweisen, Audit, Orbit und Preview-Slots
- Bento-Raster aus unterschiedlich breiten Kacheln, das sich beim Aufklappen animiert neu ordnet
- Vorladen von Bündel und Startdaten häufig genutzter Ansichten beim Antippen und im Leerlauf

### Verändert

- README zeigt Hermes Agent mit frischen Screenshots von Chat und Systemansicht und nennt Hermes in Funktionen und Danksagungen
- Hermes trägt jetzt das offizielle Markenzeichen von Nous Research statt einer Nachzeichnung — in Sidebar, Mobilnavigation, Werkzeugleiste, Orbit-Palette und Kopfzeile
- Der Hermes-Bereich übernimmt die Farbwelt der offiziellen Oberfläche (Teal, Creme) und setzt Remote Workplace nur als Grünakzent
- Die offizielle Hermes-Oberfläche steht in der Flächenleiste statt hinter dem Drei-Punkte-Menü; das Menü führt nur noch Aktionen
- Das Verwaltungs-Iframe wird einmal montiert und danach nur ein- und ausgeblendet, statt bei jedem Flächenwechsel neu zu laden
- Hermes-Sessions bleiben mit Telegram und Cron im gemeinsamen `~/.hermes/state.db` statt in einer zweiten Workbench-Datenbank
- Die Freigabelogik verwendet `ask`, entfernt pauschale gefährliche Dauerfreigaben und bindet Antworten an die Session
- Workbench-Konfiguration, Contracts und Orbit-Dokumente bleiben additiv rückwärtskompatibel bis Version 8
- Dashboard- und Update-Aktionen laufen ausschließlich über validierte User-Units und atomare Zustandsdateien
- Status- und Modelladapter berücksichtigen die reale Hermes-API inklusive `state: connected` und String-Modellkatalogen
- Galerie (Mediengalerie und Dateigalerie) ist als eigenes Feature aufgelöst; Upload und Download laufen über den Dateimanager
- Navigation und Orbit-Palette führen „Dateien" statt „Galerie"; bestehende Galerie-Knoten im Orbit bleiben erhalten
- Schnellaktionen stehen als ruhige Leiste am Seitenende statt als Blickfang oben
- Serverdiagnose zeigt Verlauf, Hostfakten und alle Laufwerke in einem Panel statt in aufklappbaren Details
- Alle Abstände kommen aus einem einzigen Seitenraster; Panels bringen keine eigenen Ränder mehr mit
- Diagramme skalieren mit dem Spitzenwert, statt bei niedriger Last als flache Linie am Rand zu liegen
- Der Zeitraumwechsel in der Nutzung behält die alte Auswertung, statt die Seite zu leeren

### Repariert

- Sicherheitsupdates für `undici`, `fast-uri` und `brace-expansion` schließen die aktuellen High-Severity-Befunde
- Hermes-Dashboard-Theme war unlesbar: `palette.midground` ist bei Hermes die helle Schriftfarbe, stand aber auf `#111111` — schwarze Schrift auf schwarzem Grund
- Die Sessionliste verdeckte auf dem Smartphone Kopfzeile und Flächenleiste; sie ist jetzt ein Drawer im Chatbereich und startet eingeklappt
- Textvorschau lehnt UTF-8-Dateien nicht mehr ab, wenn die Kürzungsgrenze ein Zeichen zerschneidet
- Klicks in der Sidebar gehen nicht mehr verloren, wenn sie vor dem Laden des Orbit ausgelöst werden (Warteschlange statt verlorenem Event)
- Isolierter E2E-Server erbt keine produktiven Pfade mehr aus der .env und überschreibt keine echten Orbit-Backups
- E2E-Tests laufen wieder gegen den isolierten Server: Routen nach dem /workbench-Umbau, Identität für API-Aufrufe, Orbit-Schema-Version
- Endlose Render-Schleife im Verlaufsspeicher des Dashboards behoben
- Pseudo-Dateisysteme unter einem Gigabyte verfälschen die Datenträgeranzeige nicht mehr
- Bereitschaftsprüfung meldet bei Antwort 503 jetzt „eingeschränkt" statt dauerhaft „Prüfung läuft"
- Links zu Nutzung und News laden die Anwendung nicht mehr komplett neu
- Kurven verzerren beim Strecken nicht mehr und behalten ihre Strichstärke

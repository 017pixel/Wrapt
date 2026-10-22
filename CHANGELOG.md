# Changelog

Alle relevanten Änderungen werden in kurzen Stichpunkten dokumentiert.

## [2.19.0] - 2026-10-22

### Verändert
- Wrapt prüft den Tailscale-Zugriff vor dem Laden der Arbeitsflächen. Fehlende Berechtigungen stoppen automatische Wiederholungen; bei Verbindungsfehlern wächst der Abstand.
- Ein fehlgeschlagener Hintergrundabruf erhält geladene Inhalte und Notizeditoren. Entfernte oder nicht mehr erlaubte Inhalte zeigen einen eigenen Fehlerzustand.
- Updates und Neustarts warten auf den passenden Auftrag und die bestätigte Rückkehr. Vor dem Neuladen werden ungespeicherte Änderungen der geöffneten Editoren berücksichtigt.
- Mobile Einstellungen haben eine kompakte Bereichsauswahl. Wartung liegt unter System, Hermes V2 unter Experimente; Notizen und Nutzung & Limits heißen einheitlich.
- Code-Plugins verwenden die gemeinsame Fehlerbehandlung, bündeln Aktualisierungen und warnen vor dem Verwerfen ungespeicherter Quellen. Entwürfe speichern nur bei Änderungen und erhalten neue Eingaben während eines laufenden Saves.
- Plugin-Kompilierung läuft in einem eigenen Prozess. Bei Typfehlern, Absturz oder Timeout bleibt der bisherige Build erhalten.
- Bestätigungsdialoge bleiben nach Hintergrundarbeit und fehlgeschlagenen Aufträgen erneut bedienbar. Terminal-Aktionsknöpfe haben auch auf Touch-Geräten mindestens 44 Pixel Platz.
- Terminal-Sync meldet Lesefehler in der Diagnose und wartet bei Datenbanksperren auf den nächsten Abruf, ohne den Server zu blockieren.
- Der Start zeigt einen Ladehinweis, bevor die Anwendung bereit ist. Eine isolierte Performance-Probe prüft feste Budgets für API-Antworten und Event-Loop-Verzögerungen.
- Qualitätsprüfungen prüfen ihre eigenen Fehlerfälle mit Gegenproben. Terminal- und Plugin-E2E-Tests nutzen dieselbe isolierte Testadresse.

### Behoben
- Die Notizensuche antwortet nach der Weiterleitung durch den Plugin-Host wieder zuverlässig; der Titel-Filter wird nur einmal ausgewertet.

## [2.18.0] - 2026-10-22

### Erstellt
- Persönliche Code-Plugins mit TypeScript, eigenen React-Seiten, dauerhaft gespeicherten Daten, Hooks, Diensten und Hintergrundjobs.
- Bestehende Seiten, Navigation, Dashboard, Einstellungen, Panels und Kontextmenüs lassen sich durch Plugins ergänzen, verändern oder ersetzen.
- Lokale Quellordner, Editor, Typprüfung, CLI, automatisches Neuladen und Laufzeit-Inspektor für die Plugin-Entwicklung.
- Öffentliche Schnittstellen für Projekte, Dateien, Notizen, Orbit, Git, Benachrichtigungen, Terminals und Previews.
- Entwicklerreferenz mit ausführbarem Projektjournal auf der Docs-Website und im verlinkten Plugin-Creator-Skill.

### Verändert
- Vertrauenswürdiger Plugin-Code läuft nach ausdrücklicher Freigabe in eigenen Serverprozessen. Deklarative Plugins bleiben im bisherigen eingeschränkten Modus nutzbar.
- Versionswechsel sichern die eigenen Plugin-Daten und Dateien. Bei einem Fehler bleibt der vorherige Stand erhalten; ein Rollback lädt dessen Datensnapshot.
- Aktive deklarative Plugins führen registrierte Plugin-Commands tatsächlich aus und können ihre Inhalte erneut laden.

## [2.17.0] - 2026-10-22

### Erstellt
- Einstellungen liegen auf dem Server und gleichen sich live zwischen allen Clients ab. Das gilt für Navigation, Start-App, Layout, Dashboard-Hintergrund, Hermes V2, Nutzungsdarstellung und Transparenz.
- Änderungen an Theme, Rechtsklick-Menü, Maskottchen, Benachrichtigungen, T3-Kanal, Limitüberwachung und Reset-Historie erscheinen auf anderen Clients ohne Neuladen.
- Ungesendete Änderungen werden lokal markiert und beim nächsten Start oder nach einer Verbindungsunterbrechung nachgereicht.

### Verändert
- Der lokale Speicher bleibt als schneller Cache erhalten; der Server ist die gemeinsame Quelle für alle Geräte.
- Das Zurücksetzen des Layouts gilt jetzt für alle Clients.

## [2.16.0] - 2026-10-22

### Verändert
- Die Hermes-Chatliste zeigt nur noch Titel und nötigen Status. Projekt, Modell und Zeitangaben stehen in einer kleinen Vorschau beim Überfahren, die sich auch per Tastatur und auf Touch-Geräten öffnen lässt.
- Sitzungsaktionen öffnen sich per Rechtsklick, Menütaste oder Umschalt+F10. Der Drei-Punkte-Knopf entfällt; auf Touch-Geräten bleibt eine kompakte Aktionen-Schaltfläche.
- Längere Chattitel haben zwei Zeilen Platz. Die Vorschau bleibt beim Überfahren lesbar, schließt mit Escape und lädt keine zusätzliche Sitzung.

## [2.15.0] - 2026-10-22

### Verändert
- „Eingabe nötig“ steht direkt unter der Suche. „In Arbeit“ und „Erledigt“ bleiben unten; die Gruppenköpfe haben mehr Abstand zu den Rändern.
- Beendete Turns erscheinen grün. Die zusätzlichen „neu“-Zähler und der Hinweis „Organisation geändert“ entfallen. Strg+Z beziehungsweise Cmd+Z macht Organisationsänderungen rückgängig, während Textfelder ihr eigenes Rückgängig behalten.
- Gedankenfragmente stehen gesammelt in einem aufklappbaren Block mit eigenem Scrollbereich. Arbeitszeiten ab einer Minute erscheinen in Minuten und Sekunden.
- Werkzeugdetails zeigen Befehle und Ausgaben getrennt mit Kopieraktionen. Sitzungsmenüs sind breiter, Dialoge und das Feld zum Umbenennen luftiger. Die Scrollleiste des Chatverlaufs entfällt.

### Behoben
- Nach dem Verschieben eines Chats bleibt der Tastaturfokus in Hermes, damit Rückgängig direkt erreichbar ist.
- Aufgeklappte Gedanken bleiben beim Eintreffen weiterer Gedankenfragmente offen.
- Beim Öffnen eines Sitzungsmenüs verrutscht die Chatzeile nicht mehr seitlich.

## [2.14.0] - 2026-10-21

### Erstellt
- Im Modellpicker lassen sich Modelle mit einem Stern markieren. Favoriten stehen ganz oben und bleiben über Neustarts hinweg gespeichert.
- Die Projektwahl beim Anlegen einer Sitzung ist ein eigenes Menü statt eines Standardsystems. Zuletzt genutzte Projekte stehen oben, "Ohne Projekt" bleibt der Standard.
- Die Freigabe der Befehle lässt sich zwischen "Nachfragen" und "Bypass" umschalten. Der aktive Zustand steht am Chip und ist jederzeit sichtbar.
- Aufeinanderfolgende Werkzeugaufrufe im Chat stehen als ein einklappbarer Block mit einer Zeile je Aufruf. Die Details einer Zeile klappen einzeln auf.
- Beim Überfahren einer Chatzeile erscheint ein Haken-Knopf, mit dem sich eine Sitzung selbst als erledigt markieren lässt. Eine vom Agenten beendete Sitzung gilt nicht automatisch als erledigt.
- "oder ohne Projekt beginnen" startet auf Klick sofort einen Chat ohne Projekt, ohne Umweg und ohne Seitenwechsel.

### Verändert
- Die Hermes-Fläche ist durchgehend eckig: Karte, Senden-Knopf, Plus-Knopf, Chips und Sprechblase.
- Die Seitenleiste führt die zuletzt benutzten Chats oben. Die Bereichsgruppen stehen unten über der Iconreihe, wie in T3 Code. "Erledigt" ist die letzte Gruppe.
- Die Bereiche klappen weich auf und zu, mit derselben Animation wie die Wrapt-Hauptspalte.
- Die Marke über der Seitenleiste entfällt.
- Die Seitenleiste meldet beim Aktualisieren nicht mehr "Lädt..." und zeigt keine leeren Bereiche an.
- "Erledigt" klappt über die ganze Kopfzeile weich auf, zeigt die letzten fünf Chats und trägt sein "Mehr laden" direkt darunter. Das "Mehr laden" steht nur noch bei der Liste, zu der es gehört.
- Die Chatzeile zeigt die Zeit rechts, rückt links um 16 Pixel ein und ist luftiger. Der Drei-Punkte-Knopf liegt bündig in der Zeile und legt seinen Tooltip nicht mehr über die Nachbarzeile.
- Der Leerzustand zeigt nur noch eine große Überschrift und eine ruhige Unterzeile.
- Die Bereichs-Buttons für Chat, Cron, Skills, Memory, Konfiguration und Diagnose sitzen ganz unten in der Seitenleiste. Auf dem Telefon stehen sie als untere Leiste unter der Fläche, weil die Seitenleiste dort eine Schublade ist. Der aktive Bereich ist nur an der Iconfarbe erkennbar, ohne Rahmen und ohne Kasten.
- Der Projektfilter listet die bekannten Projekte und fragt die Sitzungen des gewählten Projekts ab, statt eine leere Auswahl zu zeigen.
- Die beiden Aktionen einer Chatzeile haben getrennte Klickflächen. Ein Klick löst nicht mehr beide aus.
- Der OpenCode-Go-Katalog listet alle verfügbaren Modelle, auch direkt nach der Anmeldung. Kein Anbieter bleibt hinter der Anzeigebegrenzung verborgen; jede Gruppe nennt, wie viele Modelle die Suche zusätzlich findet.
- Die Seitenleiste blendet ihre Scrollleiste aus. Scrollen mit dem Mausrad bleibt wie gehabt.
- Die Knöpfe der Eingabeleiste behalten auf dem Telefon ihre volle Griffgröße, obwohl die Hermes-Fläche dichter dargestellt wird.
- Der Knopf für ältere Nachrichten erscheint nur noch, wenn es nachweislich ältere Nachrichten gibt.
- Aufeinanderfolgende Werkzeugaufrufe stehen als eine Liste mit einer Zeile je Aufruf. Ein einzelner Aufruf steht direkt in der Liste, ohne zusätzlichen Kopf.
- Die Werkzeuggruppen nennen die Zeit bis zur Antwort, nicht die Summe der einzelnen Werkzeugaufrufe.
- Die eigenen Nachrichten sitzen als Sprechblase rechts, die Antworten tragen keine Rollenbeschriftung mehr. Zeit und Kopieren stehen als schmale Zeile unter dem Text.
- Die Gedanken des Agenten stehen in derselben Liste wie die Werkzeugaufrufe, so wie in T3 Code.
- Die Memory-Fläche hat zwei Spalten mit sinnvollen Breiten: Dateien links breit und lesbar, Anbieter rechts kompakt. Der JSON-Vorschlag ist aufklappbar.
- Die Sitzungsdetails stehen in der Ecke oben rechts. Nicht belegte Angaben wie "Projekt nicht gemeldet" entfallen.

### Behoben
- Eine Sitzung bleibt durchgehend in "In Arbeit", während der Agent arbeitet. Vorher flackerte sie weg, sobald ein Werkzeug lief oder eine Skill gesucht wurde.
- Fehler und Laufzustand einer Nachricht bleiben sichtbar, auch wenn die Zeile keinen sichtbaren Text trägt.
- Aufeinanderfolgende Gedankblöcke eines Turns gehen nicht mehr verloren.
- Der Verlauf folgt dem Wachstum der Antwort, auch wenn das Markdown gebremst nachläuft.
- Memory, Konfiguration und Diagnose laden im Browser wieder, statt einen Zugriffsfehler zu melden.
- In einem neuen Chat gibt es weder einen Knopf für ältere Nachrichten noch eine Fehlermeldung.
- Fehlermeldungen erscheinen nicht mehr doppelt.
- Die Auswahl der Bereichs-Buttons zeigt keinen blauen Kasten mehr.
- Der Chat baut beim Streamen nur noch die betroffene Zeile neu auf. Vorher wurden mit jedem Token auch alle Werkzeugkarten des Verlaufs neu aufgebaut; das bremste den Aufbau um ein Vielfaches.

## [2.13.0] - 2026-10-20

### Verändert
- Die Bereichsauswahl im Hermes V2 sitzt jetzt als schmale Iconreihe am unteren Rand der Seitenleiste. Die Namen stehen nur noch als Tooltip und zugänglicher Name bereit.
- Cron, Skills und Konfiguration sind zu Verwaltungsseiten nach dem Vorbild der T3-Einstellungen umgebaut: Kopf mit Aktionen, Abschnitte mit Überschrift, Kartengruppen und Zeilen mit Bedienelement rechts.
- Ältere Nachrichten werden im Chatverlauf über einen schlichten Textlink geladen statt über eine große Schaltfläche.

### Behoben
- Die Hermes-Sidebar lässt sich am Desktop nicht mehr unter 264 Pixel verbreitern. Die Bereichsleiste am unteren Rand braucht sechs Ziele mit je 44 Pixel, sonst würde sie scrollen.

## [2.12.0] - 2026-10-20

### Erstellt
- Die Hermes-V2-Sidebar lässt sich am Desktop ziehen, per Tastatur einstellen und auf ihre Standardbreite zurücksetzen. Die gewählte Breite bleibt gespeichert.
- Eigener Konfigurationsbereich für Zeitzone, Agentenschritte und Kontextkomprimierung. Cron, Skills, Memory und Diagnose bleiben getrennte Bereiche.

### Verändert
- Hermes V2 übernimmt Akzentfarben und Auswahlflächen der Wrapt-Farbpalette.
- Cron bekommt Suche und Statusfilter; Skills zeigt Katalog und Details nebeneinander. Mobil bleiben fünf Navigationsziele mit weiteren Bereichen unter „Mehr“.
- Drawer und Dialoge reagieren mit kurzen Übergängen. Tastaturbedienung und reduzierte Bewegung wechseln ohne Animation; mobile Bedienelemente behalten ausreichend große Touchflächen.

## [2.11.1] - 2026-10-20

### Verändert
- Die gesamte Hermes-V2-Oberfläche einschließlich Dialogen und Menüs ist um 20 % verkleinert. Die äußere Wrapt-Navigation behält ihre Größe.

## [2.11.0] - 2026-10-20

### Verändert
- Hermes V2 bekommt eine gemeinsame Sidebar nach dem Vorbild von T3 Code: Suche und neuer Chat oben, kompakte Sitzungsgruppen und Werkzeuge unten. Leere Gruppen werden ausgeblendet; die Sidebar lässt sich am Desktop einklappen.
- Antworten stehen frei im Chatverlauf. Nachrichten sind größer gesetzt, Listen zeigen wieder Aufzählungszeichen, und Eingabe, Modellwahl und Anhänge liegen in einer gemeinsamen Fläche.
- Arbeitsverzeichnis und Verbrauch sind unter „Sitzungsdetails“ aufklappbar. Auf dem Handy liegen die fünf Bereiche am unteren Rand; die Sitzungswahl schließt die Sidebar und öffnet direkt den Chat.

## [2.10.1] - 2026-10-18

### Verändert
- Terminalwechsel behalten Bildschirm, Auswahl und Scrollposition. Hover lädt vorhandene Sitzungen und die Verbindung vor.
- Terminalhinweise erscheinen oben rechts als Toast und verschieben die Ausgabe nicht. Der Sidebar-Button sitzt bündig links und zeigt die Öffnungsrichtung.

### Behoben
- Terminals verbinden sich nach Standby, Tabwechsel und Netzunterbrechungen automatisch erneut. Scrollen bleibt nach dem Minimieren und Wiederöffnen nutzbar.
- Schnelles Scrollen bündelt Eingaben und vermeidet unnötige Verbindungsabbrüche. Die Hover-Vorschau setzt den Terminalbildschirm nicht mehr zurück.

## [2.10.0] - 2026-10-18

### Erstellt
- Projekte und Modelle zeigen eine gemeinsame Gesamtsumme für Kosten und Tokens im ausgewählten Zeitraum über Codex, Claude Code und OpenCode.

### Verändert
- Das Slash-Menü in Notes ist größer und besser lesbar. Der sichtbare Scrollbalken ist entfernt.
- Im Nutzungsverlauf werden Gesamt- und Output-Tokens samt Kosten klarer ausgewiesen.

### Behoben
- Überschriften in Notes behalten Leerzeichen und Cursorposition während des Schreibens.
- Eine neu angelegte Unterseite erscheint direkt an der Stelle des Slash-Befehls, ohne den folgenden Inhalt zu verschieben.
- Nutzungszahlen wechseln beim Zeitraumwechsel nicht mehr vorübergehend zu Werten des zuvor gewählten Zeitraums.

## [2.9.0] - 2026-10-18

### Erstellt
- Experimentelle native Hermes-V2-Oberfläche unter Einstellungen → Easter Eggs, standardmäßig ausgeschaltet. Die Auswahl bleibt nach dem Neuladen erhalten und synchronisiert sich zwischen Tabs.
- Hermes V2 kann als eigene Browserfläche ohne Workbench-Navigation geöffnet werden. Panels behalten ihre eigene Sitzungswahl und öffnen dieselbe Sitzung im eigenen Fenster; klassische Oberfläche und Einstellungen bleiben erreichbar.
- Der Chat zeigt das von Hermes gemeldete Arbeitsverzeichnis, die Projektkennung und die Herkunft der gewählten Sitzung auch bei geschlossener Sidebar.
- Der native Hermes-Gateway nutzt dieselbe vorhandene Installation und stellt Verlauf, Streaming, Eingabeanfragen und Kataloge abgesichert bereit.
- Der native Chat unterstützt neue und bestehende Sitzungen, nachladbaren Verlauf, Streaming, Toolkarten, sichtbares Reasoning, Codekopieren und Stoppen. Nach Verbindungsabbrüchen bleibt ein unbekannter Sendeausgang sichtbar und wird erst auf ausdrücklichen Wunsch erneut gesendet.
- Die V2-Sidebar ordnet Sitzungen nach Eingabebedarf, Arbeit und persönlicher Organisation. Anheften, Zurückstellen mit genauer Rückkehrzeit, Erledigen, Ziehen und Rückgängig verändern keine Hermes-Turns; sichtbare Antworten werden gezielt als gelesen bestätigt.
- Freigaben, Rückfragen und geheime Eingaben können direkt im nativen Chat beantwortet werden. Doppelte Antworten werden gesperrt; Passwörter verschwinden beim Senden oder Sitzungswechsel sofort aus den Eingabefeldern.
- Modelle und Anbieter lassen sich aus dem echten Hermes-Katalog wählen. Die Befehlsauswahl bietet native Aktionen und installierte Skills; Kostenbestätigungen, vorgemerkte Wechsel und unbestätigte Denktiefen bleiben sichtbar.
- Dateien können ausgewählt oder in den Chat gezogen werden. Bestätigte Anhänge erscheinen an ihrer ursprünglichen Nachricht und lassen sich geschützt herunterladen; unklare Uploads werden gezielt geprüft und nicht automatisch wiederholt.
- Die Aufgabenansicht zeigt belegte Unteraufgaben, Prozesse und Nebenaufträge. Nachrichten lassen sich einreihen, laufende Arbeit steuern und eigene Hintergrundaufgaben starten; unvollständige Abdeckung und unklare Ergebnisse bleiben sichtbar.
- Cron-Jobs lassen sich nativ ansehen, erstellen, gezielt bearbeiten, pausieren und fortsetzen. Ausführen und Löschen verlangen eine Bestätigung; unklare Quittungen werden bewusst abgeglichen.
- Skills, Builtin-Memory, ausstehende Änderungen und passive Diagnose sind in derselben Fläche erreichbar. Persönliche Skills bleiben im bestehenden Editor; nicht unterstützte Freigaben und begrenzte Inhalte werden ausdrücklich angezeigt.
- Sitzungen können nach frischer Prüfung mit ihrer nativen Kompressionskette und delegierten Unteraufgaben gelöscht werden. Laufende oder ungeklärte Arbeit bleibt geschützt; nur bestätigte Abwesenheit bereinigt die Anzeige.

### Behoben
- Die native Modellauswahl wechselt auch den gewählten Anbieter korrekt. Der Wechsel gilt weiterhin nur für die jeweilige Sitzung.
- Die Befehlspalette übernimmt beim Öffnen den Tastaturfokus und schließt mit Escape, auch im Nur-Lese-Modus. Vorhandene Entwürfe bleiben erhalten.
- In Memory bleiben ausstehende Änderungen, Dateien und Anbieter auch bei wenig Platz klar untereinander angeordnet.
- Große Chatverläufe bleiben auch nach der Geheimnismaskierung ladbar. Nötige Textkürzungen sind sichtbar und bestätigen die betroffene Antwort nicht vollständig als gelesen.
- Alte Anhangbindungen werden auch nach einem beobachteten Zurückwechseln von Profil oder Arbeitsverzeichnis ungültig. Ein ausgetauschtes Hermes-Datenverzeichnis am selben Pfad wird erkannt.
- Sidebar und offene Ressourcenflächen werden beim Chatstreaming nicht mehr mit jedem Token neu gezeichnet. Große Werkzeugausgaben scrollen in ihrer Karte; Aufklapp- und Kopieraktionen haben vollständige Klickflächen.
- Große Werkzeugausgaben mit vielen bekannten Geheimwerten werden schneller maskiert. Auch überlappende Werte und über mehrere Textstücke verteilte Eingaben bleiben geschützt.
- Nach dem Schließen der Befehlshilfe kehrt der Tastaturfokus in das Sendefeld zurück. Auch Sitzungsaktionen, Denktiefe und Dateiauswahl haben auf großen Bildschirmen volle Klickflächen.
- Wechselt beim Senden eines Anhangs das Hermes-Profil oder dessen Datenverzeichnis, zeigt V2 den Ausgang als unbekannt. Veraltete Uploadinformationen werden nach einem Profilwechsel verworfen.
- Secretmaskierung schützt auch lange Streams sowie gekürzte und überlappende Tool-, Aufgaben- und Memoryinhalte. Teilansichten kennzeichnen tatsächliche Kürzungen; darstellbare kleine Antworten werden erhalten.
- Ungeklärte Cron-Aktionen bleiben auch neben neueren bestätigten Quittungen sichtbar und bewusst abgleichbar.
- Befehlsauswahl und Modellsuche erhalten normale Entwürfe; übersprungene Anhänge, Aktionssperren und Aufgabenstatus bleiben erkennbar. Der klassische Befehlseinstieg berücksichtigt den App-Basispfad.
- Eine neu gewählte Sitzung bleibt auch bei verspäteter Erstellung ausgewählt. Gelesene Antworten werden nach dem Scrollen bestätigt; die lokale Navigation bleibt auch im schmalen Panel mit vollen Touchzielen erreichbar.
- Auf niedrigen Displays und in kleinen Panels bleibt Stop auch mit offener Freigabe und vielen Anhängen erreichbar. Lange Entwürfe und Nebenaktionen lassen sich im verfügbaren Platz scrollen.

## [2.8.0] - 2026-10-15

### Verändert
- Popup-Bilder für Changelog und Nutzung erscheinen ohne nachträgliches Aufhellen. Die kleinen Motive werden früh vorgeladen und bleiben für erneutes Öffnen bereit.
- Transparenz-Intensität reicht bis 300 % und startet ohne gespeicherte Auswahl bei 100 %. Vorhandene Einstellungen bleiben erhalten.
- Die Serverauswahl hat einen Bildakzent im Kopf; einzelne Sterne im Changelog funkeln dezent. Bei reduzierter Bewegung bleiben sie ruhig.

## [2.7.2] - 2026-10-14

### Behoben
- Die Serverauswahl zeigt verbundene Wrapt-Instanzen wieder mit korrektem Status an. Der Verbindungstest läuft über den eigenen Server und scheitert nicht mehr daran, dass der Browser den Status der anderen Instanz nicht direkt lesen darf.
- Neue Server lassen sich wieder zuverlässig hinzufügen; die Verbindungsprüfung im Dialog nutzt denselben serverseitigen Test.

## [2.7.1] - 2026-10-14

### Verändert
- Transparenz-Intensität steuert jetzt deutlich mehr Durchsicht und die Unschärfe aller schwebenden Menüs. Projektwahl, Werkzeugaktionen und Serverauswahl verwenden dasselbe Glasmaterial.
- Verschachtelte Notes-Menüs zeichnen ihren Hintergrund unabhängig weich. Farbmenüs bleiben auch auf kleinen Displays sichtbar und haben größere Touch-Ziele.
- Artwork für Banner und leere Ansichten lädt mit kleineren Bildern. Hover und Tastaturfokus laden nur das benötigte Motiv vor; der Dashboard-Hintergrund wird auf anderen Seiten nicht vorsorglich geladen.
- Dashboard-Artwork erhält eine leichte zusätzliche Weichzeichnung.

## [2.7.0] - 2026-10-14

### Erstellt
- Transparenz-Intensität unter Design: Der Regler wirkt sofort, bleibt nach dem Neuladen erhalten und synchronisiert sich zwischen geöffneten Tabs.

### Verändert
- Artwork liegt großflächig und dezent hinter leeren Zuständen und dem Dashboard. Sichtbare Bildrahmen entfallen, die Motive laufen weich in die Fläche aus.
- Changelog und Limits erhalten zurückhaltende Bildbanner, die in den Kopf der Glasfläche übergehen.
- Statuskarten schließen mit Escape und geben den Tastaturfokus an ihren Auslöser zurück.
- Dialoge, Dropdowns, Kontextmenüs und schwebende Hinweise verwenden eine gemeinsame Glas-Ebene. Gedämpfter Text gewinnt mit der Transparenz Kontrast. Reduzierte Transparenz und höherer Kontrast im Betriebssystem behalten Vorrang.

## [2.6.0] - 2026-10-13

### Erstellt
- Bildköpfe für Changelog und Limits mit weichem Übergang in die Karte, passend zum Stil der Landingpage. Die Bilder laden im Voraus, damit beim ersten Öffnen nichts mehr weiß aufblitzt.
- Leere Zustände mit eigenem Bild: Projekte, Notizen und Werkzeuge zeigen je ein ruhiges Motiv mit klarer Aktion, die Suche bleibt bewusst ohne Bild.

### Verändert
- Dashboard-Hintergrund läuft oben und unten weich in die Grundfläche, wie der Hero der Landingpage.
- Dialoge, Projektwahl und kleine Menüs ruhiger: einheitliche Abstände, sichtbare Fokus-Ringe, größere Touch-Ziele und auf dem Handy ein Bottom Sheet.

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

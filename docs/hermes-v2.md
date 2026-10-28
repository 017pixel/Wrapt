# Hermes V2

Hermes V2 ist die experimentelle native Chatfläche in Wrapt. Sie verwendet die
vorhandene Hermes-Installation, deren Sessions und denselben Dashboard-Gateway.
Die klassische Hermes-Oberfläche bleibt für Verwaltung und als Rückweg erhalten.

## Aktivieren und zurückwechseln

Unter Einstellungen → Experimente „Hermes V2 aktivieren“ einschalten.
Die Auswahl wirkt sofort, bleibt in diesem Browser erhalten und synchronisiert
sich zwischen Tabs derselben Wrapt-Origin. Standardmäßig ist sie ausgeschaltet.
Ein Serverneustart ist für den Schalter nicht nötig.

Ausschalten beendet die V2-Verbindungen und zeigt wieder die klassische Fläche.
Hermes-Sessions werden dabei weder gelöscht noch migriert. Persönliche
Wrapt-Organisationsdaten können liegen bleiben und gelten beim erneuten Öffnen.

Das Drei-Punkte-Menü der Kopfleiste öffnet die bestehende Oberfläche ausdrücklich,
auch bei aktivem Flag. Der Einstieg übernimmt die ausgewählte Sitzungs-ID, soweit
Hermes sie öffnen kann.

## Routen und eigene Browserfläche

Unter dem üblichen Basispfad sind die direkten Einstiege:

- `/wrapt/hermes-v2?session=<id>` für die native Fläche in der Workbench.
- `/wrapt/hermes-v2/standalone?session=<id>` für das eigene Browserfenster.
- `/wrapt/hermes-agent?ui=classic&session=<id>` für die klassische Oberfläche.

Sitzungs-IDs müssen URL-kodiert sein. Bei abweichendem Basispfad erzeugen die
Oberflächenlinks die passende URL. Standalone verwendet dieselbe Tailscale-
Anmeldung und dieselben Serverprüfungen. Die Fläche umgeht keine Anmeldung.

In schmalen Panels öffnet „Sitzungen“ die Auswahl über dem Chat.
„In eigenem Fenster öffnen“ im Drei-Punkte-Menü startet genau diese
Sitzung in Standalone. Die bestehende Sitzung wird dabei weder kopiert noch neu
erstellt. Standalone bietet einen direkten Rückweg zu Workbench, Einstellungen und
klassischer Oberfläche. Kehrt die Workbench ohne Sitzungsparameter zu Hermes
zurück, öffnet sie den zuletzt gewählten Chat.

Die Fokusansicht liegt im vorhandenen Wrapt-PWA-Scope `/wrapt/` und verwendet
dessen Manifest und Service Worker. Für Chat und Verwaltung ist weiterhin eine
Verbindung zum Server nötig.

## Chat und Verbindungsabbrüche

Neue Sitzungen bekommen das ausgewählte erlaubte Projekt als Arbeitsverzeichnis.
Bestehende Sitzungen behalten ihren Hermes-Kontext. Verlauf lässt sich in Seiten
nachladen; ältere Nachrichten lädt ein schlichter Textlink über dem Verlauf.
Die Anzeige ist auf 4000 Nachrichten begrenzt. Streaming, Toolkarten
und tatsächlich vom Modell gelieferte Reasoninginhalte bleiben sitzungsgebunden.
Große Werkzeugausgaben haben einen eigenen begrenzten Scrollbereich. Der
vollständige angezeigte Text bleibt mit Maus, Touch und Tastatur erreichbar;
die Karte weist weiterhin auf vom Gateway gekürzte Inhalte hin.

Sehr große Verlaufsseiten werden nach der Geheimnismaskierung auf das
Empfangsbudget begrenzt. Betroffene Texte tragen einen Kürzungshinweis; Nachrichten,
Kennungen und Seitenzählung bleiben erhalten. Eine gekürzte Antwort bestätigt
keinen vollständigen Lesebeleg.

„Sitzungsdetails“ klappt Arbeitsverzeichnis, Projektkennung, Herkunft und den
gemeldeten Verbrauch der gewählten Sitzung auf. Lange Werte lassen sich im
jeweiligen Feld mit Tastatur oder Touch lesen. Fehlende Angaben bleiben als
„Nicht gemeldet“ erkennbar. Beim Sitzungswechsel schließen die Details.

Antworten stehen ohne Kartenrahmen im Verlauf. Die gemeinsame Eingabefläche
enthält Modellwahl, Denktiefe, Anhänge und Befehle. Hintergrund- und
Zwischenaufträge erscheinen, sobald Text eingegeben ist oder ein Turn läuft.

Enter sendet, Shift+Enter fügt eine Zeile ein. Stoppen unterbricht den aktuellen
Turn über Hermes. Bei laufender Arbeit zeigt ein leeres Feld nur Stoppen; der
Senden-Knopf erscheint mit dem ersten Zeichen. Code und Antworten können kopiert
werden. Bilder werden nur über erlaubte HTTPS-Ziele eingebettet, Markdown führt
kein HTML aus.

Nach einem Verbindungsabbruch gleicht V2 aktuellen Verlauf und offene Anfragen ab.
Ein möglicherweise bereits gesendeter Auftrag wird nicht automatisch wiederholt.
Bei unbekanntem Ausgang zuerst „Abgleichen“ verwenden. „Bewusst erneut senden“
kann doppelte Wirkung erzeugen und erfordert eine ausdrückliche Entscheidung.
„Ohne erneutes Senden fortfahren“ behauptet keine erfolgreiche Ausführung.

## Modelle, Befehle und Denktiefe

„Modell wählen“ liest Anbieter und Modelle aus Hermes. Suche und Anbietergruppen
verwenden diesen Katalog. Eine Kostenbestätigung gilt nur für die konkret gewählte
Kombination. Während eines laufenden Turns kann Hermes einen Wechsel vormerken;
bis zur Bestätigung bleibt das bisherige Modell als aktuelle Auswahl sichtbar.

`/` öffnet die Befehlsauswahl. Pfeiltasten wählen, Enter übernimmt, Escape schließt.
Die Liste enthält native Aktionen und tatsächlich installierte Hermes-Skills.
Ein Skill bereitet eine erkennbare Anweisung im Eingabefeld vor; sie wird erst
nach dem Senden ausgeführt. Nicht unterstützte Befehle zeigen den Grund und den
klassischen Einstieg. Eine rohe Slashzeile wird nicht versehentlich als Chat gesendet.

Die Denktiefe wird für die aktive Sitzung angefragt. V2 unterscheidet den Wunsch
von der durch Hermes beobachteten Einstellung und einer gemeldeten Begrenzung.
„Aus“ erscheint nur bei einer bestätigten Möglichkeit für das konkrete Modell.
Während eines laufenden Turns ist die Auswahl gesperrt. Der globale Freigabemodus
wird nur angezeigt; seine Verwaltung bleibt in Hermes.

## Dateien

Dateien lassen sich auswählen oder in das Eingabefeld ziehen. Pro Nachricht sind
höchstens zehn Dateien mit jeweils 4 MiB möglich. V2 lädt mehrere Dateien
nacheinander und sendet anschließend die bestätigten Dateireferenzen an Hermes.
Eine Nachricht kann ausschließlich aus bereitstehenden Anhängen bestehen.

Bei einem unklaren Uploadausgang prüft „Status prüfen“ denselben Upload. Es wird
nichts automatisch erneut hochgeladen oder gesendet. Entfernen löst die Datei
vom Entwurf; es löscht keine Datei aus Hermes. Ein Sitzungswechsel oder Verbergen
der Fläche beendet die noch ausstehende Auswahl mehrerer Dateien.

Wechselt beim Senden das bestätigte Hermes-Profil oder dessen Datenverzeichnis,
bleibt der Ausgang als unbekannt sichtbar. Zuerst abgleichen, bevor dieselbe
Nachricht bewusst erneut gesendet wird.
Auch ein beobachteter Wechsel des Arbeitsverzeichnisses oder ein Austausch des
Hermes-Datenordners am selben Pfad entwertet die alte Bindung. Zurückwechseln
macht einen alten Uploadbeleg nicht wieder gültig. Wird der Wechsel vor dem
Senden erkannt, wird die Aktion abgebrochen; nach möglichem Senden bleibt sie
als unbekannt gesperrt.

Dateikarten im Verlauf erscheinen nur für belegte Zuordnungen zur ursprünglichen
Nachricht. Downloads verlangen dieselbe Anmeldung und liefern Dateien als Download,
auch bei aktiven Dateiformaten. Wrapt speichert dazu nur Metadaten. Die Dateien
bleiben bei Hermes; die Aufbewahrungsfrist für Wrapt-Metadaten löscht sie nicht.
Hermes kann native Dateipfade im eigenen Verlauf zeigen. Eine Dateireferenz
garantiert keine Bildanalyse oder vollständige PDF-Verarbeitung durch jedes Modell.

## Aufgaben und weitere Nachrichten

„Aufgaben anzeigen“ öffnet die von Hermes belegten Unteraufgaben, Prozesse,
Fehlerdelegationen und beobachteten Hintergrund- und Zwischenaufträge. Details
und Ausgaben werden erst auf Wunsch gelesen. Unteraufgaben lassen sich einzeln
unterbrechen, Prozesse über ihre native Kennung beenden. Ein fehlendes Ziel
oder bereits beendeter Prozess bleibt als solches erkennbar.

Bei laufendem Turn bietet „Einreihen“ eine weitere Nachricht und „Steuern“
eine Anweisung für die laufende Arbeit. Hermes bestätigt, ob diese eingereiht,
umgelenkt oder abgelehnt wurde. Angezeigt wird ausschließlich der nächste von
Hermes gemeldete Queuekopf, keine erfundene vollständige Warteschlange.

„Hintergrund“ und „Zwischenauftrag“ starten den erfassten Text als eigene
Hermes-Aufgabe. Deren Abschluss beendet den Hauptturn nicht. Stoppen bleibt
während offener Nebenaktionen erreichbar. Ein unbekannter Ausgang führt zu
keiner automatischen Wiederholung.
Auf sehr niedrigen Displays kann bei zusätzlichen Fehlerhinweisen der gesamte
Chatbereich scrollen; Stop ist dann per Scrollen oder Tastatur erreichbar.

Die Ansicht kennzeichnet ihre Teilabdeckung und Kürzungen. Insbesondere sind
beobachtete Nebenaufgaben und jüngste Fehlerdelegationen keine vollständige
Historie. Ein früherer Lineage-Beleg garantiert keine aktuelle Steuerbarkeit.
Ein gemeinsamer Stop des gesamten Aufgabenbaums ist derzeit nicht unterstützt.

## Freigaben, Rückfragen und geheime Eingaben

Offene Anfragen erscheinen als Karten im Chat. Freigaben bieten genau die von
Hermes erlaubten Entscheidungen. „Dauerhaft erlauben“ erscheint nur, wenn Hermes
diese bleibende Entscheidung tatsächlich anbietet; V2 aktiviert keinen globalen
Freigabemodus. Rückfragen unterstützen Einzel-, Mehrfachauswahl und Freitext.
„Antwort sichern“ bestätigt eine Frage früh, „Überspringen“ lässt sie bewusst aus.
Bereits bestätigte Antworten bleiben schreibgeschützt. „Abbrechen“ beendet die
Rückfrage über Hermes.

Geheime Eingaben sind maskiert. V2 leert ihre Felder unmittelbar beim Senden,
beim Sitzungswechsel, Verbergen oder Schließen der Fläche. Sie landen weder im
Nachrichtentwurf noch im Browserspeicher. Bei unklarem Antwortausgang bleibt die
Anfrage gesperrt und bietet Abgleich sowie den klassischen Einstieg; es gibt
keine automatische Wiederholung. Nach einem Neuladen werden offene Anfragen
wieder von Hermes gelesen, geheime Eingaben müssen neu eingegeben werden.

## Sidebar und Organisation

Die Sidebar folgt dem Aufbau von T3 Code. Oben stehen Suche und neuer Chat,
unten eine schmale Iconreihe mit Chat, Cron, Skills, Memory, Konfiguration und
Diagnose. Die Icons tragen Tooltip und zugänglichen Namen, die Bereichsnamen
stehen nicht als Text daneben. „Sitzungen“ klappt die Sidebar
am Desktop ein oder aus. Auf schmalen Flächen öffnet derselbe Button die
Sitzungsauswahl über dem Chat. Unten stehen Chat, Cron, Skills, Memory und „Mehr“;
„Mehr“ öffnet die eigenständigen Bereiche Konfiguration und Diagnose.
Eine Sitzungswahl öffnet direkt den Chat und schließt die mobile Auswahl.
Wrapt-Einstellungen und der Standalone-Rückweg zur Workbench liegen im Sidebarfuß.

Die rechte Sidebar-Kante lässt sich ziehen. Pfeiltasten ändern die Breite,
Umschalt plus Pfeiltaste in größeren Schritten; Pos1/Ende wählen die Grenzen.
Ein Doppelklick stellt die Standardbreite wieder her. Die Breite wird lokal
versioniert gespeichert und berücksichtigt die 80-%-Skalierung von Hermes V2.
Sie bleibt zwischen 264 und 480 Pixeln, damit die sechs Ziele der Bereichsleiste
ohne Scrollen erreichbar bleiben.
Akzente und Auswahlflächen folgen der in Wrapt gewählten Farbpalette.

Cron, Skills und Konfiguration sind Verwaltungsseiten nach dem Vorbild der
T3-Einstellungen: ein Kopf mit den Aktionen der Seite, darunter Abschnitte mit
Überschrift, Kartengruppen und Zeilen, in denen Titel und Beschreibung links
und das Bedienelement rechts stehen. Cron bietet eine Suche und die Filter Alle,
Aktiv und Pausiert; der gewählte Job öffnet darunter seine belegten Details,
seine Läufe und die zugehörigen Quittungen. Skills führt den Katalog mit Suche
und zeigt den gewählten Skill mit Inhalt und Editorlink. Die Konfiguration
bearbeitet Zeitzone, maximale Agentenschritte und Kontextkomprimierung des
aktuellen Hermes-Profils. Sie überträgt ausschließlich
geänderte Felder und verlangt bei inzwischen geänderten Werten ein Neuladen.
Ein unklarer Speicherausgang wird nicht automatisch wiederholt. Schlüssel und
vollständige native Konfigurationsdateien gelangen nicht in die Oberfläche.

„Eingabe nötig“ steht direkt unter der Suche, danach folgen die zuletzt
benutzten Chats ohne eigene Überschrift. „In Arbeit“, „Angeheftet“,
„Zurückgestellt“ und „Erledigt“ sitzen unten; „Erledigt“ ist die letzte Gruppe.
Leere Gruppen werden ausgeblendet. Jede Sitzung steht genau einmal in einer Gruppe.
Die Chatzeilen zeigen den Titel und nötigen Status. Projekt, Modell und
Zeitangaben stehen in einer verzögerten Hover-Vorschau rechts neben der
Seitenleiste. Die Vorschau bleibt beim Überfahren offen und schließt mit Escape.
Sie verwendet vorhandene Metadaten und öffnet keine zusätzliche Chatverbindung.
Rechtsklick, Menütaste oder Umschalt+F10 öffnen das Sitzungsmenü. Auf Touch-Geräten
öffnet „Aktionen“ dasselbe Menü; „Sitzungsdetails“ zeigt dort die Vorschau.
Der Erledigen-Haken erscheint am Desktop bei Mauszeiger oder Tastaturfokus.
Anheften bleibt ein zusätzlicher Marker, auch wenn eine Eingabe nötig wird.
Die Vorschau nennt den belegten Laufzustand und, soweit vorhanden, die Arbeitszeit.
Unbekannte Aktivität wird dort ausdrücklich als unbekannt angezeigt.

Offene Freigaben/Rückfragen und neue entscheidungsbedürftige Fehler bleiben
sichtbar. Zurückstellen oder Erledigen beendet keinen Hermes-Prozess.
Zurückstellen bietet Presets und eigene lokale Zeit samt Zeitzone. Bei einer
mehrdeutigen Zeit während der Zeitumstellung ist eine eindeutige Auswahl nötig.

Neue bewiesene Abschlüsse oder neue Abdeckung können zurückgestellte und
erledigte Sitzungen dauerhaft wieder hervorholen. Eine bereits bekannte Antwort
kann bewusst zurückgestellt werden, ohne dadurch als gelesen zu gelten.
Erst tatsächlich sichtbarer Inhalt bestätigt die zugehörigen Lesebelege.
Verdeckter Chat, mobile Sidebar und Dialoge bestätigen keine Inhalte im Hintergrund.

Pin, Snooze, Settle und Lesebelege sind persönlich und liegen in der vorhandenen
Wrapt-Datenbank. Titel, Nachrichten und Laufzustand stammen weiter aus Hermes.
Strg+Z beziehungsweise Cmd+Z macht im bisherigen kurzen Zeitfenster die letzte
persönliche Organisationsänderung rückgängig. In Textfeldern bleibt das
Tastenkürzel für die Textbearbeitung zuständig. Zwischenzeitliche neue
Änderungen werden nicht zurückgesetzt.

Aufeinanderfolgende Gedankenfragmente stehen in einem einzigen aufklappbaren
Block ohne eigenen Scrollbereich; der Chatverlauf übernimmt das Scrollen.
Werkzeugdetails trennen Befehl, weitere Parameter und Ausgabe. Die Arbeitsdauer
erscheint ab einer Minute als Minuten und Sekunden; der Chatverlauf scrollt ohne
sichtbare Scrollleiste.

Suche umfasst geladene Titel, IDs und Arbeitsverzeichnisse. Die Hauptliste lädt
beim Scrollen ans Ende unsichtbar nach; während einer Suche lädt „Weitere
Treffer laden“ die nächste Seite ausdrücklich. Mitgliedergruppen behalten ihren
eigenen Nachladeknopf. Ein begrenzter oder ungeklärter Stand wird angezeigt;
fehlende Offline-Belege werden nicht als „alles gelesen“ oder „fertig“ behandelt.
Projektfilter verwenden serverseitig bestätigte Zugehörigkeit.

„Sitzung löschen“ im Sitzungsmenü verlangt eine frische Vorschau der genauen ID.
Hermes löscht dabei die Kompressionskette und delegierte Unteraufgaben.
Eigenständige Branch- und Resetgespräche bleiben bestehen. Laufende Arbeit,
offene Anfragen oder ein ungeklärter Laufzeitbeleg sperren die Aktion.
Wrapt entfernt nur konkret als abwesend bestätigte IDs aus seinem flüchtigen
Bestand. Ein unklarer Ausgang löst keine automatische Wiederholung aus.
Eine native Löschung lässt sich in V2 nicht rückgängig machen.

## Cron

Die Bereichsleiste öffnet die Jobs des aktuellen Hermes-Profils. Sie sind innerhalb
dieses Profils gemeinsam sichtbar. Die Jobliste, der gewählte Job mit Zeitplan,
nächster und letzter Ausführung, Zustand und begrenzte Laufhistorie stehen
untereinander als Abschnitte derselben Seite. Hermes führt die Jobs aus.

Neue Jobs und Änderungen erlauben Name, Prompt, nativen Zeitplan, Wiederholung,
Pause und ein erlaubtes Wrapt-Projekt. Bearbeiten sendet nur geänderte Felder.
Vorhandene Skript- und Zusatzfelder bleiben erhalten. Bei Skriptjobs garantiert
eine Promptänderung keine Änderung der Skriptausführung.

Pausieren und Fortsetzen wirken auf den gewählten Job. Ausführen und Löschen
verlangen eine eigene Bestätigung mit genauer Kennung. Das Ausführen eines
pausierten Jobs kann ihn wieder aktivieren. Ein Einmallauf kann danach fehlen;
seine bestätigte Ausführungsquittung bleibt trotzdem sichtbar.

Nach verloren gegangener Quittung zuerst „Bewusst neu lesen“ verwenden. Das gilt
auch für eine neue Erstellung. Der Abgleich bestätigt den aktuellen Stand, nicht
die ursprüngliche Aktion. Erst ein weiterer ausdrücklicher Klick darf erneut
schreiben. Formularfehler erhalten den Entwurf.

## Skills und Memory

Skills zeigt den nativen Katalog mit Herkunft, Verfügbarkeit, Slashzuordnung und
Detailtext. Katalog und Detail stehen untereinander als Abschnitte derselben
Seite. Persönliche Bearbeitung führt zur vorhandenen Wrapt-Skillsverwaltung.
Offizielle und installierte Hub-Skills werden hier nur gelesen.

Memory trennt Providerstatus von den festen Builtin-Dateien MEMORY.md und USER.md.
Diese Dateien sind kein Export externer Memoryprovider. Fehlend, leer, unlesbar,
unbekannt und gekürzt werden getrennt angezeigt.

Ausstehende Memory- und Skilländerungen zeigen ihre begrenzten Nutzdaten und
Teilabdeckung. Die installierte Hermes-Version stellt dafür keinen eigenen
Approve-/Reject-Endpunkt bereit. V2 zeigt diese Grenze und den klassischen
Verwaltungseinstieg; es verändert dafür keine Dateien direkt.

## Gateway und Diagnose

V2 benötigt den vorhandenen Hermes-Dashboard mit kompatiblem `/api/ws`-Gateway.
Wrapt stellt davor den authentifizierten Adapter `/api/v1/hermes/v2/gateway`.
Es entsteht keine zweite Hermes-Runtime, kein neues HERMES_HOME und keine zweite
Sessiondatenbank. Schlüssel und Dashboardtokens bleiben serverseitig.

„Diagnose“ liest Status und begrenzte redigierte Logausschnitte. Kopieren erfolgt
nur auf Klick; ein fehlgeschlagener Clipboardzugriff bleibt sichtbar. Die Ansicht
startet weder Doctor noch Updates oder Dienste. Ressourcen werden bei offener
sichtbarer Fläche gelesen und nach nativen Änderungen gezielt neu geladen.

Bei „nicht kompatibel“ zuerst installierte Hermes-Version und Wrapt-Diagnose
prüfen. Bei unterbrochener Verbindung erneut verbinden beziehungsweise abgleichen.
Unbekannte Arbeitsverzeichnisse können nur lesbar sein. Classic bleibt erreichbar.
Installation, Updates und Rollback stehen in [Konfiguration](configuration.md)
und [Fehlerbehebung](troubleshooting.md). Laufende Nutzersitzungen nicht für einen
Test oder eine vermutete Reparatur neu starten.

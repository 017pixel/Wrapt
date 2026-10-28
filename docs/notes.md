# Notizen

Notizen sammeln Ideen, Projektwissen und Aufgaben. Im Eingang liegen Seiten ohne
Sammlung. Jede Seite erscheint genau einmal im Seitenbaum ihrer Sammlung oder
im Eingang. Favoriten sind zusätzliche Abkürzungen auf dieselben Seiten. Zuletzt
bearbeitete Seiten stehen in der Suche; Tagesnotizen gibt es nicht.

## Quick Note

Der Notizknopf in der Kopfzeile und Alt + N unter Windows beziehungsweise
Control + N unter macOS und Linux öffnen ein frei bewegliches Fenster. Das Kürzel ist unter Einstellungen → Tastenkürzel
änderbar. Es verwendet die vorhandene Weiterleitung aus kontrollierten
Werkzeug-Iframes, etwa T3 Code, Hermes und Editor. Fremde Preview-Webseiten
können keine Tastendrücke an Wrapt weiterreichen.

Das Fenster lässt sich an der Titelleiste verschieben und an Rändern und Ecken
vergrößern. Agent, Terminal und andere Flächen bleiben bedienbar. Der linke Knopf
öffnet dieselbe Notiz im Notizen-Werkzeug; rechts schließt das Kreuz das Fenster.
Schließen verwirft den Entwurf nicht. Erneutes Öffnen bringt dieselbe Notiz
zurück. Die Kopfleiste bleibt ohne Beschriftung als Griff zum Verschieben frei;
die zusätzliche Formatierungsleiste und der „Neue Notiz“-Knopf entfallen.
Position und Größe bleiben im Browser gespeichert und werden nach einem
Bildschirmwechsel ins sichtbare Fenster zurückgeholt. Die fokussierte
Titelleiste lässt sich mit Pfeiltasten verschieben, Shift + Pfeil ändert die Größe.

## Seitenbaum und Suche

Sammlungen entstehen über „Weitere Aktionen“ → „Neue Sammlung“. Die darunter
liegenden Seiten können Unterseiten enthalten. Unterseiten folgen ihrer
Wurzelseite in die Sammlung. „Ordner auflösen“ entfernt nur die Sammlung,
sämtliche Seiten bleiben erhalten.

Der Pfeil klappt Unterseiten auf; der Titel öffnet die Seite. Pfeil hoch/runter
wechselt zwischen sichtbaren Seiten, rechts öffnet einen Zweig, links schließt
ihn. Home und End springen an Anfang und Ende. Breite, aufgeklappte Zweige und
Scrollposition werden beibehalten. Der Pfad einer geöffneten Seite wird sichtbar
aufgeklappt. Abschnittsüberschriften und Favoriten bleiben sortierbar.

Beim Ziehen einer Seite wird zwischen davor, danach und als Unterseite
unterschieden. „Verschieben nach …“ bietet dieselben Ziele ohne Drag-and-drop.

Die Suche über Ctrl/Command + K durchsucht Titel und Inhalt mit
Tippfehlertoleranz. Exakte Titel und Titelanfänge stehen vor ähnlichen Titeln
und Inhaltstreffern. Sehr kurze Eingaben werden nur exakt gesucht. Filter für
Titel, Seitenbereich und Datum sind unter „Filter“ erreichbar. Die Suche zeigt
auch Pfade einschließlich der Sammlung. Bei ausgewähltem Text bleibt das
Editor-Kürzel zum Setzen eines Links erhalten.

## Schreiben und Sicherung

Der Editor unterstützt Markdown, Code, Tabellen, Dateien, Checkboxen und
Seitenverweise. `/` öffnet Blockbefehle; `[[` öffnet die Seitenauswahl. Interne
Verweise verwenden stabile IDs und bleiben nach Umbenennungen gültig. Auf kleinen
Screens stehen häufige Bearbeitungsaktionen ohne Hover bereit.

Inhalte werden nach einer kurzen Schreibpause lokal pro Tab gesichert und danach
mit dem Server abgeglichen. „Lokal gesichert“ und „Gespeichert“ sind getrennte
Zustände. Fehler bieten einen erneuten Speicherversuch. Bei Revisionskonflikten
bleiben die eigene und die Serverfassung erhalten. Lokale Sicherung ersetzt
keine vollständige Offline-Nutzung. Browserdaten zu löschen entfernt auch noch
nicht synchronisierte Entwürfe.

## Aufgaben, Eigenschaften und Verlauf

Die Aufgabenansicht sammelt Checkboxen aus aktiven Notizen. Änderungen erfolgen
an derselben Textstelle mit Revisionsprüfung. Checkbox-Beispiele in Codeblöcken
werden nicht als Aufgaben behandelt. Die ursprüngliche Notiz bleibt erreichbar.
Eine optionale Fälligkeit wird portabel als `[due:: YYYY-MM-DD]` hinter dem
Aufgabentext gespeichert. Abgehakte Aufgaben bleiben standardmäßig sichtbar.

Unter „Eigenschaften, Verknüpfungen und Verlauf“ lassen sich Projekt und Tags
zuordnen. Rückverweise führen zu verlinkenden Notizen. Der Versionsverlauf hält
bis zu 100 frühere Titel-/Inhaltsstände pro Seite vor. Eine Wiederherstellung
wird selbst zur neuen Version und prüft die aktuelle Revision.

## Import und Export

„Weitere Aktionen“ bietet Markdown- und ZIP-Import sowie ZIP-Export.

- Wrapt-ZIPs enthalten ein versioniertes Manifest, Markdown-Dateien und lokale
  Anhänge. Das Manifest bewahrt die Hierarchie, Eigenschaften und eigenen Blöcke.
- Obsidian- und Notion-Markdown-ZIPs werden als neue Seiten importiert.
  Vorhandene Notizen werden nicht überschrieben. Standard-Seitenverweise und
  passende Wikilinks werden auf neue IDs abgebildet.
- CSV-Datenbanken und HTML-Sonderblöcke werden gemeldet und nicht still
  umgewandelt. Externe Anhänge bleiben externe Links.
- Das Größenlimit liegt bei 64 MB und 1.000 Notizen pro Import. Der Seitenimport
  ist atomar: Bei einem Fehler werden keine neuen Seiten übernommen. Anhänge
  werden vorher hochgeladen und können nach einem Abbruch bereits in der Galerie liegen.

Standardlinks funktionieren im exportierten Markdown außerhalb Wrapts. Eigene
Blockdirektiven für Spalten, Callouts oder Inhaltsverzeichnisse sind nicht in
jedem Markdown-Editor darstellbar. Das Manifest behält die Originalfassung.

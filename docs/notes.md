# Notizen

„Alle Notizen“ zeigt sämtliche aktiven Seiten samt Unterseiten. Favoriten sind
zusätzliche Verweise auf dieselben Seiten. Das Plus in „Favoriten“ erstellt eine
Seite, die sofort als Favorit markiert ist.

Unter „Neue Seite“ legt „Neuer Ordner“ eine eigene Sammlung an. Jede Wurzelseite
kann einem Ordner zugeordnet sein; ihre Unterseiten folgen ihr. Die Seiten bleiben
auch in „Alle Notizen“ sichtbar. „Ordner auflösen“ entfernt nur die Sammlung,
sämtliche Seiten bleiben erhalten.

Abschnittsüberschriften lassen sich an eine andere Überschrift ziehen. Mit
Alt und den Pfeiltasten kann ein fokussierter Abschnitt ebenfalls verschoben
werden. Seiten lassen sich vor oder nach andere Seiten, in deren Mitte als
Unterseite oder auf eine Ordnerüberschrift ziehen. „Verschieben nach …“ im
Seitenmenü bietet dieselben Elternseiten und Ordner als auswählbare Ziele an.
Die Seitenreihenfolge liegt in SQLite; Abschnitts- und Favoritenreihenfolge
werden im jeweiligen Browser gespeichert. „Zuletzt verwendet“ folgt weiterhin
dem letzten Öffnungszeitpunkt.

Die vorhandenen Notizen erhalten bei der nächsten Serverinitialisierung eine
optionale Ordnerzuordnung. Die Migration entfernt keine Daten. Die
Ansichtseinstellungen werden von Version 1 auf 2 migriert; Breite, aufgeklappte
Seiten und zuletzt geöffnete Notiz bleiben erhalten.

Klicks unter dem letzten Inhaltsblock setzen den Cursor an die letzte
Schreibzeile. Nach einem Bild oder einer Tabelle wird dafür bei Bedarf eine
leere Textzeile angelegt. Die Blockgriffe bleiben am Anfang des jeweiligen
Blocks. Animationen berücksichtigen die Systemeinstellung für reduzierte
Bewegung.

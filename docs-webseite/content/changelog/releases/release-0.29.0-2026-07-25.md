# [0.29.0] - 2026-07-25

### Erstellt

- Beendetes Terminal zeigt „Das Terminal läuft nicht" mit Neustart-Knopf: startet dieselbe Sitzung im selben Verzeichnis und legt den zuletzt abgeschickten Befehl wieder in die Eingabe — Enter genügt
- Farbwahl für Orbit-Knoten im Kontextmenü (acht Töne plus „automatisch"); die ausgehenden Verbindungen übernehmen die Farbe
- Feld `color` am Orbit-Knoten in den Verträgen, damit die Auswahl den Neustart überlebt
- Griffe an allen acht Seiten und Ecken beim Skalieren von Orbit-Flächen, nicht mehr nur an den vier Ecken

### Verändert

- Aktive Einträge in Sidebar und Navigation tragen einen umlaufenden 2-px-Rahmen statt eines Farbstrichs an der linken Kante; dasselbe gilt für Fehler-, Warn- und Neustart-Meldungen
- Größengrenze für Orbit-Flächen von 2.400 × 1.600 px auf 20.000 px angehoben — große Bereiche ließen sich vorher nicht weit genug aufziehen
- Geparkte Routen sind auf zehn begrenzt und werden nach letztem Zugriff verdrängt (LRU); vorher wuchs der Cache unbegrenzt
- Bis zu zehn gleichzeitige Werkzeug-Laufzeiten statt acht

### Behoben

- **Verschieben in Galerie-Ordner war unmöglich:** Das Auswahlmenü klappte nach oben aus der Karte heraus und wurde vom `overflow: hidden` der Karte und vom scrollenden Gitter verschluckt — unsichtbar und nicht klickbar. Es ist jetzt ein Dialog und funktioniert in Medien- wie Dateigalerie.
- Nach drei erfolglosen automatischen Neustarts blieb im Terminal nur ein Hinweisband ohne Handlungsmöglichkeit

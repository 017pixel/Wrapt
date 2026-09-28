# [0.30.1] - 2026-07-25

### Behoben

- **Pinch-to-Zoom im Infinite Canvas funktionierte auf keinem Touchgerät.** Sobald der erste Finger den Schwenk startete, legte sich das Interaktions-Schild über die Fläche; der zweite Finger landete darauf statt auf dem Canvas, und die Zwei-Finger-Geste kam nie an. Auf Touch ist das Schild jetzt durchlässig — für die Maus bleibt es, damit eingebettete iframes beim Ziehen keine Ereignisse schlucken.
- Die Orbit-Insel hing auf dem iPad am Menüknopf links und lief mit ihrer Verlaufskante rechts aus dem Bild. Sie sitzt jetzt oben mittig (gemessener Mittenversatz: 0 px in Hoch- und Querformat sowie auf dem Handy).
- Der aktive Eintrag der Navigationsseite war gegenüber den übrigen eingerückt und stand schief in der Spalte. Er sitzt jetzt bündig und wird durch Rahmen plus durchgehende Linie an der linken Kante markiert — auf Handy und iPad gleich.

### Verändert

- Navigationsseite auf dem iPad: im Hochformat eine einfache Liste untereinander statt zwei Spalten, im Querformat weiterhin drei Spalten in einer Linie

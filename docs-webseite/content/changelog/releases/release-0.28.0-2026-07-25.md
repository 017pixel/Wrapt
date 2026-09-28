# [0.28.0] - 2026-07-25

### Erstellt

- Suchfeld auf der Navigationsseite: filtert die vierzehn Ziele live, mit Leerzustand bei keinem Treffer
- Weiche Verlaufskanten an allen scrollbaren Leisten (Orbit-Insel, Kategorien in Tech TLDRs, Terminal-Sondertasten) — man sieht jetzt, dass es seitlich weitergeht
- Trenner vor dem KI-Knopf der News-Insel; er ist eine eigene Aktion, kein dritter Reiter

### Verändert

- Orbit-Insel ist auf Tablets so breit wie ihr Inhalt statt wie der Bildschirm — vorher stand dort eine fast leere Leiste über die volle Breite
- Alle Inseln nutzen dieselben Glas-, Radius- und Rahmen-Tokens und denselben Aktiv-Zustand (getönte Fläche plus Akzentfarbe)
- News-Insel weicht auf kurzen Landscape-Höhen zurück und der Inhalt bekommt unten Platz — sie lag vorher auf dem Primärknopf
- Navigationsseite: lesbare statt ausgegraute Labels, aktiver Eintrag mit Akzentbalken statt umlaufendem Rahmen, keine baumelnden Trennlinien mehr am Spaltenende
- Tablet im Hochformat begrenzt die Inhaltsbreite auf 880 px; Datenzeilen rissen Label und Wert vorher über die ganze Breite auseinander
- Suchfeld in Tech TLDRs auf 560 px begrenzt statt über die volle iPad-Breite
- Terminal-Fehlerband eingerückt und gerundet statt randlos; Sondertasten mit Radius aus der Skala
- „Lesen" in Tech TLDRs ist Akzentblau statt Weiß — es war der einzige weiße Button der App
- Orbit-Kanten und Projektfarben eine Stufe dunkler (500er statt 400er), die hellen Töne wirkten auf dem Canvas neon

### Behoben

- **Browserprofile verloren Cookies und Anmeldungen beim Beenden:** Nach `Browser.close` folgte sofort ein SIGTERM, während Chromium das Profil noch schrieb. Jetzt wird bis zu drei Sekunden auf den regulären Exit gewartet, erst danach eskaliert der Abbruch. Der zugehörige Integrationstest schlug dadurch in etwa jedem dritten Lauf fehl und läuft nun stabil.
- Die Navigationssuche war im Stylesheet per `display: none` abgeschaltet, obwohl die Styles vollständig vorhanden waren

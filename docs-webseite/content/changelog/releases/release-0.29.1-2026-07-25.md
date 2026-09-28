# [0.29.1] - 2026-07-25

### Behoben

- **Zwischengespeicherte Ansichten wurden bei jedem Seitenwechsel verworfen.** Die Fehlergrenze jeder Route trug die *laufende* Adresse als `key`; beim Navigieren wechselte er für alle geparkten Routen mit, und React baute sie komplett neu auf. T3 Code, Code-Server und Terminal luden dadurch jedes Mal neu, obwohl der Seiten-Cache sie hielt. Gemessen: Instanzen überstehen den Wechsel jetzt in allen acht geprüften Bereichen.
- Der Seiten-Cache sortierte seine Einträge nach Zugriff um; React hängte die DOM-Knoten dabei um, was `iframe`-Inhalte neu lädt. Die Renderreihenfolge liegt jetzt fest, die Verdrängung läuft über eine getrennte Liste.
- Der Neustart-Knopf im Terminal erschien nur bei sauber beendeten Sitzungen. Er kommt jetzt auch bei Sitzungsfehlern und bei dauerhaft abgerissener Verbindung (nach acht Sekunden Karenz, damit er bei kurzen Aussetzern nicht aufblitzt).
- Der Neustart greift auch ohne offene Verbindung oder Sitzung: Er verbindet neu beziehungsweise legt eine Sitzung an, statt wirkungslos zu bleiben.

### Verändert

- Aktiv- und Fokusrahmen von 2 px auf 1 px halbiert (Sidebar, Navigation, Meldungen, Fokusring)

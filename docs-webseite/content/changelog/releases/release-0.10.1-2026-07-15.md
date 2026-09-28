# [0.10.1] - 2026-07-15

### Erstellt

- Mehrstufiger Cache-Schutz samt Sicherung veralteter Orbit-Entwürfe
- Begrenzte Wartezeit mit Streuung bei wiederholten Synchronisationskonflikten
- Serverseitige Kennzeichnung dynamischer Daten als nicht cachebar
- Neue Service-Worker-Version für die sofortige Cache-Bereinigung
- Regressionstest für nicht gespeicherte API-Antworten

### Verändert

- Orbit lädt Revisionen nach Konflikten direkt; alte Tabs übernehmen sicher den Serverstand
- Wiederholte Speicherversuche verlangsamen sich kontrolliert statt den Server zu überlasten
- Der Service Worker unterscheidet Root-API und Workbench-Dateien korrekt
- Browseranfragen umgehen HTTP- und PWA-Caches für dynamische Daten
- Die Workbench meldet Version 0.10.1

### Gelöscht

- Endlosschleife aus Konfliktantworten neuer und bereits geöffneter alter Tabs
- Veraltete Orbit-Revisionen aus dem PWA-Cache
- Starres Wiederholungsintervall bei anhaltenden Serverkonflikten
- Zwischenspeicherung dynamischer API-Lesezugriffe
- Service-Worker-Cache der vorherigen Workbench-Version

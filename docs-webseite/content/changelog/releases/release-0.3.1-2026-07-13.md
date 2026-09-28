# [0.3.1] - 2026-07-13

### Erstellt

- Vollbildfreigabe für eingebettete Werkzeuge
- Erlaubnis für die Vollbild-Anfrage von T3 Code
- Passende Sandbox-Freigabe für Präsentationsansichten
- Verbesserte Nutzung von T3 Code innerhalb der Workbench
- Version 0.3.1 der Workbench

### Verändert

- T3 Code kann sein eigenes Vollbild direkt im iframe anfordern
- Die Workbench delegiert ausschließlich die nötige Browser-Berechtigung
- Die Einbettung bleibt weiterhin auf ihre bisherigen Sicherheitsgrenzen beschränkt
- Der Vollbildmodus funktioniert ohne externen Tab
- Server meldet die Versionsnummer 0.3.1

### Gelöscht

- Blockade der Vollbild-Anfrage im T3-Code-iframe
- Notwendigkeit, für Vollbild in einen externen Tab zu wechseln
- Fehlende Delegierung der Browser-Vollbildberechtigung
- Unvollständige Sandbox-Regel für Präsentationsansichten
- Unterschiedliches Vollbildverhalten zwischen eingebetteter und externer Ansicht

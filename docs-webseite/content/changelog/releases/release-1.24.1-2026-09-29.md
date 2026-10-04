# [1.24.1] - 2026-09-29

### Erstellt
- Kompakter Systemstatus für kleine Viewports ohne Seitenleiste

### Verändert
- Produktversion auf 1.24.1 angehoben (Root, Server und Web)

### Behoben
- Doppelte Preview-Session-Anfragen bei identischer Identität verhindert
- Harness-Specs laufen nur noch in ihrer isolierten Konfiguration statt im Standard-E2E
- tmux-Pfad-Test prüft einen garantiert fehlenden Pfad statt der Host-Umgebung
- Editor-Seiten-Test folgt der Ausfallseite bei gestopptem Code-Server
- Notizen-Konsolenprüfung filtert bekanntes WebSocket-Kanalrauschen wie andere Suiten

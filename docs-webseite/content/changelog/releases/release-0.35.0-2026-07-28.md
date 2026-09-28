# [0.35.0] - 2026-07-28

### Erstellt

- Projektweite Preview-Sessions verbinden Frontend, Backend und weitere bestätigte Dienste über getrennte Tailscale-HTTPS-Ports
- Dauerhafte Freigabe neu erkannter Begleitdienste direkt in der Preview
- Laufzeit-Bridge für Fetch, XHR, EventSource, WebSocket und Beacon bei lokalen Port-Zielen
- Prozess- und Projektzuordnung in der Erkennung laufender lokaler Ports
- Zwölf statt sechs gleichzeitig nutzbare, isolierte Preview-Slots

### Verändert

- Vollbild bleibt im bestehenden Orbit und erhält die bereits laufende Direkt- oder Server-Preview
- Ein externes Fenster ist eine eigene Menüaktion und übernimmt den aktuellen, noch nicht gespeicherten Orbit-Zustand
- Preview-Slots werden atomar reserviert, zeitlich geleast und erst nach der letzten Session freigegeben
- HTTP-, HTTPS- und WebSocket-Proxys übernehmen Anwendungsheader und entfernen einbettungsfeindliche Antwortheader
- Preview-Ports und Tailscale-Zuordnungen werden vollständig aus der zentralen Workbench-Konfiguration erzeugt

### Repariert

- Frontends können Backends auf anderen lokalen Ports ohne Mixed-Content- oder Netzwerkfehler erreichen
- Server-Chromium wechselt beim Vollbild nicht mehr ungewollt auf eine lokale iframe-Preview
- Alte Einzel-Slot-Aufräumvorgänge trennen keine aktiven oder geteilten Preview-Sessions mehr
- Abgelaufene Sessions geben nur tatsächlich unbenutzte Slots frei
- Doppelte Fastify-HEAD-Routen und komprimierte HTML-Antworten verhindern keine Bridge-Injektion mehr

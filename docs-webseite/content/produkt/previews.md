# Previews und Slots

Previews zeigen eine laufende lokale Entwicklungsanwendung in Wrapt. Der Preview-Hub sammelt die Laufzeiten der Projekte; in Orbit legst du einzelne Anwendungen als Fläche direkt neben Projekt, Werkzeuge und Notizen.

## Vorschau öffnen

### Über den Preview-Hub

1. Öffne **Previews** und wähle ein verfügbares Projekt.
2. Starte bei Bedarf die konfigurierte Projektlaufzeit und warte, bis Wrapt den Status aktualisiert.
3. Wähle ein konfiguriertes Preview-Ziel oder einen erkannten Web-Port.
4. Öffne es eingebettet, in einem neuen Browser-Tab oder in einem separaten Preview-Werkzeugfenster.

Der Hub kann mehrere Projekte als Tabs halten. Einen Hub-Tab zu schließen schließt nur diesen Tab; die Projektlaufzeit läuft weiter. Starten, Stoppen und Neustarten der Laufzeit sind getrennte Aktionen.

### Über Orbit

Füge eine Preview-Fläche hinzu und wähle einen lokalen Port oder eine externe URL. Für lokale Dienste richtet Wrapt eine Slot-Origin ein und lädt das Ziel durch den Preview-Gateway. Gerätegröße und Ausrichtung kannst du anpassen. Für mehrere zusammengehörige Dienste gibt es die Preview-Gruppe.

## Was ein Slot isoliert

Jeder zugewiesene Slot hat eine eigene Browser-Origin. `localStorage` und IndexedDB sind damit pro Slot getrennt. Cookies gelten hostweit und sind nicht pro Port oder Slot isoliert.

Preview-Endpunkte verlangen eine erlaubte Tailscale-Identität; schreibende Aktionen verlangen zusätzlich eine passende Same-Origin-Anfrage. Lässt sich ein Browser-Reset vor der erneuten Slot-Vergabe nicht prüfen, bleibt der Slot in Quarantäne, bis das sicher möglich ist.

## Externe Ziele und Gerätevorschau

Externe URLs öffnet der echte Browser des Geräts; sie laufen nie durch den lokalen Preview-Gateway. Die Gerätevorschau simuliert vor allem Viewportgröße und Ausrichtung. Sie emuliert keine vollständige Gerätehardware, Browser-Engine, Pixeldichte oder Safe-Area.

Previews unterstützen typische Webanwendungen samt HTTP, WebSocket und EventSource. Sie sind kein allgemeiner Webbrowser und liefern keine vollständige DevTools-Netzwerkaufzeichnung; die Diagnose bleibt eine Hilfe, keine vollständige Messung.

## Projektlaufzeiten und Kapazität

Eine Preview kann aus mehreren Diensten bestehen, etwa Frontend und API. Erkannte Kandidaten sind Vorschläge; Wrapt verbindet sie erst nach ausdrücklicher Auswahl. Vor dem Speichern prüft der Hub, ob genügend Slots frei sind. Reicht die Kapazität nicht, wird der Dienstgraph nicht teilweise aktiviert.

Der Betreiber legt interne und öffentliche Ports sowie Preview-Funktionen in der lokalen Instanzkonfiguration fest. Änderungen an Port-Zuordnungen können eine Anpassung am privaten Proxy erfordern. Details stehen in der [Konfigurationsreferenz](https://github.com/017pixel/Wrapt/blob/master/docs/configuration.md).

## Wenn eine Preview nicht erreichbar ist

Prüfe zuerst, ob die Projektlaufzeit als **Läuft** angezeigt wird. Ist sie gestoppt oder fehlgeschlagen, kontrolliere Dienststatus und Projektkonfiguration. „Preview nicht aktiv“ oder „nicht erreichbar“ heißt nicht, dass der Slot neu zugewiesen werden muss. Die sichere Diagnose für Administratoren steht im [Preview-Guide für Agenten](https://github.com/017pixel/Wrapt/blob/master/docs/previews-for-agents.md).

## Weiterlesen

- [Orbit-Arbeitsflächen](./orbit.md)
- [Coding-Werkzeuge](./werkzeuge.md)
- [Preview-Diagnose und Grenzen](https://github.com/017pixel/Wrapt/blob/master/docs/previews-for-agents.md)
- [Konfigurationsreferenz](https://github.com/017pixel/Wrapt/blob/master/docs/configuration.md)

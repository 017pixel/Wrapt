# Previews und Slots

Previews zeigen eine laufende lokale Entwicklungsanwendung in Wrapt. Der Preview-Hub bündelt Projektlaufzeiten; Orbit-Slots platzieren einzelne Anwendungen direkt neben Projekt, Werkzeugen und Notizen.

## Vorschau öffnen

### Über den Preview-Hub

1. Öffne **Previews** und wähle ein verfügbares Projekt.
2. Starte bei Bedarf die konfigurierte Projektlaufzeit und warte, bis Wrapt den Status aktualisiert.
3. Wähle ein konfiguriertes Preview-Ziel oder einen erkannten Web-Port.
4. Öffne es eingebettet, in einem neuen Browser-Tab oder in einem separaten Preview-Werkzeugfenster.

Der Hub kann mehrere Projekte als Tabs halten. Einen Hub-Tab zu schließen schließt nur diesen Tab; die Projektlaufzeit bleibt aktiv. Starten, stoppen und Neustarten der Laufzeit sind ausdrücklich getrennte Aktionen.

### Über Orbit

Füge eine Preview-Fläche hinzu und wähle einen lokalen Port oder eine externe URL. Für lokale Dienste richtet Wrapt eine Slot-Origin ein und lädt das Ziel durch den Preview-Gateway. Gerätegröße und Ausrichtung lassen sich anpassen. Für mehrere zusammengehörige Dienste kannst du eine Preview-Gruppe verwenden.

## Was ein Slot isoliert

Jeder zugewiesene Slot verwendet eine getrennte Browser-Origin. Damit sind `localStorage` und IndexedDB pro Slot getrennt. Cookies werden dagegen hostweit geteilt und sind nicht pro Port oder Slot isoliert.

Preview-Endpunkte verlangen eine erlaubte Tailscale-Identität; schreibende Aktionen benötigen zusätzlich eine passende Same-Origin-Anfrage. Ist ein Browser-Reset vor einer erneuten Slot-Vergabe nicht verifizierbar, bleibt der Slot in Quarantäne, bis er sicher geprüft werden kann.

## Externe Ziele und Gerätevorschau

Externe URLs werden im echten Browser des Geräts geöffnet. Sie laufen nie durch den lokalen Preview-Gateway. Die Gerätevorschau simuliert vor allem eine Viewportgröße und Ausrichtung; sie emuliert keine vollständige Gerätehardware, Browser-Engine, Pixeldichte oder Safe-Area.

Previews unterstützen typische Webanwendungen einschließlich HTTP, WebSocket und EventSource. Sie sind kein allgemeiner Webbrowser und stellen keine vollständige DevTools-Netzwerkaufzeichnung bereit. Diagnoseinformationen sind Best Effort.

## Projektlaufzeiten und Kapazität

Eine Preview kann aus mehreren Diensten bestehen, etwa Frontend und API. Erkannte Kandidaten sind Vorschläge; Wrapt verbindet sie erst nach einer ausdrücklichen Auswahl. Vor dem Speichern prüft der Hub, ob genügend Slots verfügbar sind. Reicht die konfigurierte Kapazität nicht aus, wird der Dienstgraph nicht teilweise aktiviert.

Der Betreiber legt die internen und öffentlichen Ports sowie Preview-Funktionen in der lokalen Instanzkonfiguration fest. Für Änderungen an Port-Zuordnungen kann eine Anpassung am privaten Proxy erforderlich sein. Details stehen in der [Konfigurationsreferenz](https://github.com/017pixel/Wrapt/blob/master/docs/configuration.md).

## Wenn eine Preview nicht erreichbar ist

Prüfe zuerst, ob die Projektlaufzeit als **Läuft** angezeigt wird. Ist sie gestoppt oder fehlgeschlagen, kontrolliere den Dienststatus und die Projektkonfiguration. „Preview nicht aktiv“ oder „nicht erreichbar“ bedeutet nicht, dass der Slot neu zugewiesen werden sollte. Die sichere Diagnose für Administratoren steht im [Preview-Guide für Agenten](https://github.com/017pixel/Wrapt/blob/master/docs/previews-for-agents.md).

## Weiterlesen

- [Orbit-Arbeitsflächen](./orbit.md)
- [Coding-Werkzeuge](./werkzeuge.md)
- [Preview-Diagnose und Grenzen](https://github.com/017pixel/Wrapt/blob/master/docs/previews-for-agents.md)
- [Konfigurationsreferenz](https://github.com/017pixel/Wrapt/blob/master/docs/configuration.md)

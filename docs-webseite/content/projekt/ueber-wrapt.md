# Über Wrapt

Wrapt ist eine selbst gehostete Workbench für Entwicklungsprojekte, die im Browser bedient wird. Projektzugriff, Terminals, Coding-Werkzeuge, Vorschauen und Dateien liegen an einem Ort. Der Server läuft auf der eigenen Maschine oder einem eigenen Server; die Daten bleiben in der dort eingerichteten Umgebung.

![Wrapt-Dashboard mit Beispielprojekten](../assets/01-dashboard.png)

## Wie Wrapt benutzt wird

Wrapt verbindet Werkzeuge, die sonst in getrennten Fenstern und Sitzungen liegen. Ein üblicher Ablauf:

1. Ein Projekt aus einem freigegebenen Projektordner öffnen.
2. Im Orbit eine Arbeitsfläche mit Projekt, Terminal, Agent oder Preview zusammenstellen.
3. Code im Browser bearbeiten oder einen Coding-Agenten in einem eigenen Werkzeug starten.
4. Den lokalen Entwicklungsserver in einer Preview ansehen und Dateien bei Bedarf verwalten.

Orbit ist dabei die visuelle Arbeitsfläche. Die Projektdateien und die Entwicklungsprozesse bleiben auf dem Wrapt-Server. Die Oberfläche stellt Werkzeuge zusammen und vermittelt zwischen ihnen; sie ersetzt weder Git noch die angebundenen Editoren oder Coding-Agenten.

## Was in Wrapt zusammenkommt

| Bereich | Wofür er da ist |
| --- | --- |
| Projekte und Orbit | Projekte finden und Werkzeuge in einer gemeinsamen Arbeitsfläche anordnen. |
| Terminals | Shells und Coding-Agenten in dauerhaften Sitzungen ausführen. |
| Editoren und Agenten | T3 Code, code-server, OpenCode und weitere installierte Werkzeuge öffnen. |
| Previews | Lokale Entwicklungsserver im Browser oder in einer Geräteansicht prüfen. |
| Dateien und Notizen | Projektdateien durchsuchen und Arbeitsnotizen im Kontext halten. |
| Plugins und Extensions | Zusätzliche Funktionen mit einem versionierten Schnittstellenmodell ergänzen. |
| Diagnose und Nutzung | Lokale Dienste und optionale Nutzungsdaten im Blick behalten. |

Nicht alle Funktionen sind Pflicht. Werkzeuge wie code-server, Hermes Agent oder CodexBar sind optionale Integrationen; welche davon verfügbar sind, hängt von der jeweiligen Installation ab.

## Für wen ist Wrapt gedacht?

Wrapt richtet sich an Entwicklerinnen und Entwickler, die ihre Projekte und Werkzeuge selbst hosten und von mehreren Geräten im privaten Netzwerk erreichen möchten. Der empfohlene dauerhafte Serverbetrieb nutzt Linux und systemd. Für lokale Entwicklung und Vordergrundbetrieb ist auch macOS beschrieben.

Wrapt ist kein gehosteter KI-Dienst. Coding-Agenten und Modelle werden separat installiert oder über eigene Anbieter und Konten verwendet. Welche Daten ein Agent an einen Modellanbieter überträgt, hängt von diesem Werkzeug und dessen Konfiguration ab.

## Selbst gehostet und privat erreichbar

Standardmäßig bindet Wrapt an `127.0.0.1`. Für den privaten Fernzugriff kann Tailscale Serve einen HTTPS-Zugang innerhalb des Tailnet freigeben. Öffentliche Freigaben über Funnel oder Router-Portweiterleitungen gehören nicht zum dokumentierten Betriebsmodell. Ein lokaler Browserzugriff ist ebenfalls möglich.

Die Installation und ihre Zugriffswege sind unter [Installation und erster Start](../betrieb/installation-erster-start.md) erklärt. Hinweise zu Identitäten, Netzwerkzugriff und Grenzen stehen unter [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md).

## Weiterführende Seiten

- [Die Oberfläche und der Arbeitsbereich](../produkt/arbeitsbereich.md)
- [Orbit](../produkt/orbit.md)
- [Werkzeuge und Integrationen](../produkt/werkzeuge.md)
- [Installation und erster Start](../betrieb/installation-erster-start.md)
- [Architektur auf einen Blick](architektur.md)
- [Open-Source-Projekte und Lizenzen](open-source.md)

Quellcode und Projektverlauf: [Wrapt auf GitHub](https://github.com/017pixel/Wrapt).

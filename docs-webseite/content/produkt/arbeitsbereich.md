# Arbeitsbereich und Navigation

Wrapt bündelt Projekte und Entwicklungswerkzeuge in einer Browseroberfläche. Du kannst zwischen Projekten und verbundenen Wrapt-Instanzen wechseln, ohne für jede Aufgabe eine eigene Anwendung öffnen zu müssen.

![Wrapt-Dashboard mit anonymisierten Beispieldaten](../assets/01-dashboard.png)

## Drei Begriffe, die leicht verwechselt werden

| Begriff | Bedeutung |
| --- | --- |
| **Wrapt-Instanz / Workspace** | Ein erreichbarer Wrapt-Server. Der Wechsler in der Seitenleiste schaltet zwischen verbundenen Instanzen um. |
| **Projekt** | Ein im Server bekanntes Projektverzeichnis. Projektbezogene Werkzeuge verwenden es als gemeinsamen Kontext. |
| **Orbit-Arbeitsfläche** | Ein frei gestaltbares Board mit Projekt-, Werkzeug-, Preview- und Notizflächen. Die Bedienung steht unter [Orbit](./orbit.md). |

## So findest du dich zurecht

Die Seitenleiste gruppiert die eingebauten Bereiche und Werkzeuge. Sie lässt sich am Desktop schmaler stellen; auf schmalen Touch-Bildschirmen öffnet die Navigation als Menü. Sichtbare Seiten, Reihenfolge und Bereiche lassen sich in den Navigationseinstellungen anpassen.

Das **Dashboard** fasst den Status der Instanz zusammen. Über **Projekte** öffnest du erkannte Projektordner. Innerhalb einer Projektansicht stehen passende Aktionen und Werkzeuge bereit. Die Projektauswahl bleibt zwischen unterstützten Bereichen als gemeinsamer Kontext erhalten; ein laufendes Terminal ändert sein Arbeitsverzeichnis dabei nicht stillschweigend.

### Zwischen Wrapt-Instanzen wechseln

1. Öffne den Instanzwechsler in der Seitenleiste.
2. Füge bei Bedarf einen Server mit Namen und URL hinzu.
3. Prüfe den angezeigten Verbindungsstatus und wähle **Öffnen**.

Eine nicht erreichbare Instanz kannst du bearbeiten oder erneut prüfen. Entfernen löscht nur ihren Eintrag aus der lokalen Browserliste; die Instanz und ihre Daten bleiben bestehen. Die Liste der verbundenen Instanzen liegt im Browser. Layout und Darstellung bleiben jeweils bei der betreffenden Instanz.

### Projekte öffnen

Wrapt erkennt standardmäßig die direkten Projektordner unter dem konfigurierten Projektstamm. Verfügbare Projekte erscheinen in der Projektübersicht und in projektbezogenen Auswahlfeldern. Ein zusätzlicher Ordner kann über die Projektwahl registriert werden, sofern der Server ihn lesen darf. Die Projektwurzel und optionale Metadaten werden von der Instanz administriert.

## Auf unterschiedlichen Geräten

Die Oberfläche passt Navigation und Werkzeuge an den verfügbaren Platz an. Auf Tablets kann die Seitenleiste je nach Ausrichtung sichtbar bleiben; auf schmalen Displays wird sie durch eine kompakte Navigation ersetzt. Inhalte wie Orbit, Terminal und Notizen haben eigene Touch-Bedienungen. Siehe [Orbit](./orbit.md), [Terminal](./terminal.md) und [Notizen und Nutzung](./notizen-nutzung.md).

## Grenzen und Daten

- Ein Workspace-Wechsel öffnet eine andere Serverinstanz. Das überträgt keine Serverdaten und führt Accounts, Projekte oder Sessions nicht zusammen.
- Die Browserliste der Instanzen ist clientlokal. Sie ist kein serverweites Benutzerverzeichnis.
- Zugriff und administrative Rechte hängen von der Konfiguration der jeweiligen Instanz ab. Eine URL in der Liste ersetzt keine Berechtigung.
- Browserbezogene Einstellungen wie Layout und Navigation sind von serverseitigen Projektdaten getrennt.

## Weiterlesen

- [Orbit-Arbeitsflächen](./orbit.md)
- [Coding-Werkzeuge](./werkzeuge.md)
- [Installation und erste Einrichtung](https://github.com/017pixel/Wrapt/blob/master/docs/installation.md)
- [Einstellungen](https://github.com/017pixel/Wrapt/blob/master/docs/settings.md)
- [Konfiguration für Betreiber](https://github.com/017pixel/Wrapt/blob/master/docs/configuration.md)

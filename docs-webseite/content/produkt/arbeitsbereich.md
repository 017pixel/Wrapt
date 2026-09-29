# Arbeitsbereich und Navigation

Wrapt zeigt Projekte und Werkzeuge in einer Browseroberfläche. Du wechselst zwischen Projekten und verbundenen Wrapt-Instanzen, ohne für jede Aufgabe eine eigene Anwendung zu öffnen.

![Wrapt-Dashboard mit anonymisierten Beispieldaten](../assets/01-dashboard.png)

## Instanz, Projekt und Orbit

| Begriff | Bedeutung |
| --- | --- |
| **Wrapt-Instanz / Workspace** | Ein erreichbarer Wrapt-Server. Der Wechsler in der Seitenleiste schaltet zwischen verbundenen Instanzen um. |
| **Projekt** | Ein im Server bekanntes Projektverzeichnis. Projektbezogene Werkzeuge verwenden es als gemeinsamen Kontext. |
| **Orbit-Arbeitsfläche** | Ein frei gestaltbares Board mit Projekt-, Werkzeug-, Preview- und Notizflächen. Die Bedienung steht unter [Orbit](./orbit.md). |

## Seitenleiste und Projektwahl

Die Seitenleiste gruppiert die eingebauten Bereiche und Werkzeuge. Am Desktop lässt sie sich schmaler stellen; auf schmalen Touch-Bildschirmen öffnet die Navigation als Menü. Sichtbare Seiten, Reihenfolge und Bereiche stellst du in den Navigationseinstellungen ein.

Das **Dashboard** zeigt den Status der Instanz. Über **Projekte** öffnest du erkannte Projektordner; in einer Projektansicht gibt es passende Aktionen und Werkzeuge. Die Projektauswahl bleibt zwischen unterstützten Bereichen als gemeinsamer Kontext erhalten. Ein laufendes Terminal wechselt sein Arbeitsverzeichnis dabei nicht.

### Zwischen Wrapt-Instanzen wechseln

1. Öffne den Instanzwechsler in der Seitenleiste.
2. Füge bei Bedarf einen Server mit Namen und URL hinzu.
3. Prüfe den Verbindungsstatus und wähle **Öffnen**.

Eine nicht erreichbare Instanz kannst du bearbeiten oder erneut prüfen. Entfernen löscht nur ihren Eintrag aus der lokalen Browserliste; die Instanz und ihre Daten bleiben bestehen. Die Liste der verbundenen Instanzen liegt im Browser. Layout und Darstellung gelten jeweils für die betreffende Instanz.

### Projekte öffnen

Wrapt erkennt die direkten Projektordner unter dem konfigurierten Projektstamm. Verfügbare Projekte erscheinen in der Projektübersicht und in projektbezogenen Auswahlfeldern. Ein zusätzlicher Ordner lässt sich über die Projektwahl registrieren, sofern der Server ihn lesen darf. Projektwurzel und optionale Metadaten verwaltet die Instanz.

## Auf unterschiedlichen Geräten

Die Oberfläche passt Navigation und Werkzeuge an den verfügbaren Platz an. Auf Tablets kann die Seitenleiste je nach Ausrichtung sichtbar bleiben; auf schmalen Displays ersetzt eine kompakte Navigation sie. Orbit, Terminal und Notizen haben eigene Touch-Bedienungen: [Orbit](./orbit.md), [Terminal](./terminal.md) und [Notizen und Nutzung](./notizen-nutzung.md).

## Grenzen und Daten

- Ein Workspace-Wechsel öffnet eine andere Serverinstanz. Serverdaten werden nicht übertragen, und die Instanzen teilen keine Accounts, Projekte oder Sitzungen.
- Die Browserliste der Instanzen liegt nur im Client. Sie ist kein serverweites Benutzerverzeichnis.
- Zugriff und administrative Rechte hängen von der Konfiguration der jeweiligen Instanz ab. Eine URL in der Liste ersetzt keine Berechtigung.
- Einstellungen wie Layout und Navigation liegen im Browser, getrennt von serverseitigen Projektdaten.

## Weiterlesen

- [Orbit-Arbeitsflächen](./orbit.md)
- [Coding-Werkzeuge](./werkzeuge.md)
- [Installation und erste Einrichtung](https://github.com/017pixel/Wrapt/blob/master/docs/installation.md)
- [Einstellungen](https://github.com/017pixel/Wrapt/blob/master/docs/settings.md)
- [Konfiguration für Betreiber](https://github.com/017pixel/Wrapt/blob/master/docs/configuration.md)

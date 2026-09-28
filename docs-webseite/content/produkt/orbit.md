# Orbit

Orbit ist Wrapts visuelle Arbeitsfläche. Lege Projekte, Coding-Werkzeuge, Previews, Notizen und weitere Flächen auf einem Board ab und ordne sie so an, wie es zu deiner Aufgabe passt.

![Orbit mit neutralen Beispielprojekten](../assets/02-workbench.png)

## Boards und Canvas

Ein Orbit-Dokument kann mehrere Boards enthalten. Der Board-Wechsler zeigt Name, Knotenzahl und Verbindungen; über die Werkzeugleiste kannst du ein Board hinzufügen, umbenennen oder entfernen. Es muss immer mindestens ein Board bestehen.

Der Canvas lässt sich verschieben und zoomen. **Alles zeigen** passt die vorhandenen Elemente in die Ansicht ein. Position und Größe von Flächen kannst du direkt auf dem Canvas verändern; über den Inspector lassen sich unter anderem Position, Farbe und Verbindungen bearbeiten. Rückgängig und Wiederholen sind in der Werkzeugleiste verfügbar.

Auf Touch-Geräten trennt Orbit das Navigieren vom Bedienen eingebetteter Inhalte. Nutze zwei Finger zum Verschieben oder Zoomen und wechsle bei Bedarf in den Modus **Inhalt**, um eine Notiz oder ein Werkzeug zu bedienen. Die Werkzeugleiste kann auf schmalen Displays horizontal gescrollt werden.

## Flächen hinzufügen

Du kannst neue Inhalte über die Orbit-Werkzeugleiste oder die Befehlsauswahl anlegen. Die linke Wrapt-Navigation bietet außerdem geeignete Werkzeuge und Projekte zum Hinzufügen. Unterstützte Flächentypen umfassen:

- Projekte und Coding-Werkzeuge;
- Preview-Slots und Gruppen für mehrere Previews;
- Notizen, Aufgaben und Code-Snippets;
- Datei- und Medienflächen sowie Rahmen zur visuellen Gruppierung;
- Nutzung und ausgewählte Hermes-Status- oder Ergebnisansichten;
- installierte Extensions, wenn diese passende Orbit-Beiträge bereitstellen.

Ziehe eine passende Projekt- oder Werkzeugfläche in den Canvas oder füge sie über die Orbit-Befehle hinzu. Anschließend kannst du sie verschieben, skalieren und mit anderen Flächen verbinden.

Verbindungen stellen Beziehungen zwischen Flächen dar. Ziehe von einem Verbindungspunkt zu einer anderen Fläche oder verwende den Inspector für die ausgewählte Fläche. Eine Verbindung ändert weder Projektdateien noch die Laufzeit eines Werkzeugs.

## Ein typischer Ablauf

1. Öffne **Orbit** und wähle das gewünschte Board.
2. Füge ein Projekt hinzu und verknüpfe bei Bedarf das zugehörige Werkzeug.
3. Ergänze Notizen, Aufgaben oder ein Preview für den aktuellen Arbeitsschritt.
4. Ordne die Flächen auf dem Canvas an und verbinde fachlich zusammengehörige Inhalte.
5. Beobachte in der Infokarte den Speicher- und Synchronisierungsstatus.

Orbit synchronisiert seine Arbeitsfläche mit dem Wrapt-Server. Während Änderungen noch gesendet werden, zeigt die Infokarte einen ausstehenden Status; bei einem Konflikt oder Fehler wird ein Hinweis eingeblendet. Warte bei wichtigen Umbauten auf **Gespeichert** beziehungsweise die bestätigte Serverrevision.

## Notizen, Dateien und Previews

Eine Orbit-Notiz kann eigenständigen Text enthalten oder auf eine Seite aus dem Bereich [Notizen](./notizen-nutzung.md) verweisen. Dateien und Medien liegen in der Instanzablage und werden nicht zu Git-Änderungen im Projekt. Preview-Slots verwenden die sichere Preview-Laufzeit; ihre Bedienung und Browsergrenzen sind unter [Previews und Slots](./previews.md) beschrieben.

Beim Entfernen eines Preview-Knotens gibt Orbit dessen zugehörige Preview-Sessions und Slots frei. Das Schließen einer Werkzeugfläche beendet nicht automatisch die CLI- oder Editor-Sitzung; für Terminals gelten die Regeln in [Terminal](./terminal.md).

## Grenzen

- Boards und Knoten werden innerhalb der aktuellen Wrapt-Instanz gespeichert. Ein Workspace-Wechsel führt die Orbit-Daten verschiedener Instanzen nicht zusammen.
- Das Dokument und einzelne Knotentypen haben technische Größenlimits. Sehr große Boards oder große Medien können deshalb abgelehnt werden.
- Orbit ist eine organisierte Arbeitsfläche, kein Ersatz für Git, Dateisystem-Backups oder die eigentlichen Projektwerkzeuge.
- Eine Extension-Fläche kann ihren Renderer verlieren, wenn die Extension deaktiviert oder nicht verfügbar ist. Der gespeicherte Knotenstatus bleibt dabei erhalten.

## Weiterlesen

- [Arbeitsbereich und Navigation](./arbeitsbereich.md)
- [Notizen, Nutzung und Benachrichtigungen](./notizen-nutzung.md)
- [Previews und Slots](./previews.md)
- [Orbit- und Datenspeicherung in der Architektur](https://github.com/017pixel/Wrapt/blob/master/docs/architecture.md)

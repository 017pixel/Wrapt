# Orbit

Orbit ist Wrapts visuelle Arbeitsfläche. Du legst Projekte, Coding-Werkzeuge, Previews, Notizen und weitere Flächen auf einem Board ab und ordnest sie nach Bedarf an.

![Orbit mit neutralen Beispielprojekten](../assets/02-workbench.png)

## Boards und Canvas

Ein Orbit-Dokument kann mehrere Boards enthalten. Der Board-Wechsler zeigt Name, Knotenzahl und Verbindungen; in der Werkzeugleiste kannst du ein Board hinzufügen, umbenennen oder entfernen. Mindestens ein Board bleibt bestehen.

Den Canvas kannst du verschieben und zoomen. **Alles zeigen** passt die vorhandenen Elemente in die Ansicht ein. Position und Größe von Flächen änderst du direkt auf dem Canvas; im Inspector bearbeitest du unter anderem Position, Farbe und Verbindungen. Rückgängig und Wiederholen liegen in der Werkzeugleiste.

Auf Touch-Geräten trennt Orbit das Navigieren vom Bedienen eingebetteter Inhalte. Mit zwei Fingern verschiebst oder zoomst du; für eine Notiz oder ein Werkzeug wechselst du in den Modus **Inhalt**. Die Werkzeugleiste lässt sich auf schmalen Displays horizontal scrollen.

## Flächen hinzufügen

Neue Inhalte legst du über die Orbit-Werkzeugleiste oder die Befehlsauswahl an. Die linke Wrapt-Navigation hat außerdem geeignete Werkzeuge und Projekte zum Hinzufügen. Diese Flächen gibt es:

- Projekte und Coding-Werkzeuge;
- Preview-Slots und Gruppen für mehrere Previews;
- Notizen, Aufgaben und Code-Snippets;
- Datei- und Medienflächen sowie Rahmen zur visuellen Gruppierung;
- Nutzung und ausgewählte Hermes-Status- oder Ergebnisansichten;
- installierte Extensions, wenn sie passende Orbit-Beiträge mitbringen.

Ziehe eine Projekt- oder Werkzeugfläche in den Canvas oder füge sie über die Orbit-Befehle hinzu. Danach kannst du sie verschieben, skalieren und mit anderen Flächen verbinden.

Verbindungen stellen Beziehungen zwischen Flächen dar. Ziehe von einem Verbindungspunkt zu einer anderen Fläche oder verwende den Inspector für die ausgewählte Fläche. Eine Verbindung ändert weder Projektdateien noch die Laufzeit eines Werkzeugs.

## Typischer Ablauf

1. Öffne **Orbit** und wähle das gewünschte Board.
2. Füge ein Projekt hinzu und verknüpfe bei Bedarf das zugehörige Werkzeug.
3. Ergänze Notizen, Aufgaben oder ein Preview für den aktuellen Arbeitsschritt.
4. Ordne die Flächen auf dem Canvas an und verbinde fachlich zusammengehörige Inhalte.
5. Beobachte in der Infokarte den Speicher- und Synchronisierungsstatus.

Orbit synchronisiert die Arbeitsfläche mit dem Wrapt-Server. Während Änderungen noch unterwegs sind, zeigt die Infokarte einen ausstehenden Status; bei einem Konflikt oder Fehler erscheint ein Hinweis. Warte bei wichtigen Umbauten auf **Gespeichert** beziehungsweise die bestätigte Serverrevision.

## Notizen, Dateien und Previews

Eine Orbit-Notiz enthält eigenen Text oder verweist auf eine Seite aus dem Bereich [Notizen](./notizen-nutzung.md). Dateien und Medien liegen in der Instanzablage und werden nicht zu Git-Änderungen im Projekt. Preview-Slots nutzen die Preview-Laufzeit; Bedienung und Browsergrenzen stehen unter [Previews und Slots](./previews.md).

Beim Entfernen eines Preview-Knotens gibt Orbit die zugehörigen Preview-Sessions und Slots frei. Das Schließen einer Werkzeugfläche beendet nicht die CLI- oder Editor-Sitzung; für Terminals gelten die Regeln unter [Terminal](./terminal.md).

## Grenzen

- Boards und Knoten liegen in der aktuellen Wrapt-Instanz. Ein Workspace-Wechsel führt die Orbit-Daten verschiedener Instanzen nicht zusammen.
- Das Dokument und einzelne Knotentypen haben Größenlimits. Sehr große Boards oder Medien können deshalb abgelehnt werden.
- Orbit ist eine Arbeitsfläche und ersetzt weder Git noch Dateisystem-Backups oder die Projektwerkzeuge selbst.
- Eine Extension-Fläche kann ihren Renderer verlieren, wenn die Extension deaktiviert oder nicht verfügbar ist. Der gespeicherte Knotenstatus bleibt erhalten.

## Weiterlesen

- [Arbeitsbereich und Navigation](./arbeitsbereich.md)
- [Notizen, Nutzung und Benachrichtigungen](./notizen-nutzung.md)
- [Previews und Slots](./previews.md)
- [Orbit- und Datenspeicherung in der Architektur](https://github.com/017pixel/Wrapt/blob/master/docs/architecture.md)

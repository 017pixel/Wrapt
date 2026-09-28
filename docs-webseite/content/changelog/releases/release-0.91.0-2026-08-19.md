# [0.91.0] - 2026-08-19

### Features

- Vertikale Terminal-Sidebar ersetzt die horizontale Tab-Leiste: Ordner, Unterordner, Pins und Drag & Drop organisieren die Sitzungen
- Terminal-Sitzungen überleben einen Backend-Neustart: eigener tmux-Supervisor als User-Unit mit dediziertem Socket
- Der Server hält für jede Sitzung eine autoritative Headless-xterm-Instanz; Reconnect liefert einen konsistenten Snapshot plus fortlaufende Deltas
- Split Views mit getrenntem Pane-Layout pro Terminalfläche, auf Desktop und Tablet-Landscape bis zu zwei Panes
- Persistente Terminals werden nach einem Host-Neustart aus der SQLite-Registry wiederhergestellt

### Behoben

- Browser komplett schließen, Reload sowie Terminal- und Gerätewechsel verzerren oder beschädigen TUI-Inhalte nicht mehr
- Ein WebSocket-Abbruch beendet keinen laufenden Terminalprozess mehr (Client detacht nur)
- Mouse-Reporting und Alternate Screen werden aus dem echten Terminalmodus gelesen statt aus dem Terminaltyp geraten
- Resize-Flut entfällt: Änderungen werden pro Frame gebündelt und nur bei geänderten Spalten/Zeilen gesendet
- Multi-Device-Nutzung zerstört die Geometrie des jeweils anderen Geräts nicht mehr (expliziter Geometry-Owner)

### Verändert

- Ein multiplexter Terminal-WebSocket pro Browserseite statt eines Sockets pro Terminal
- Eingaben gehen ohne künstliche Verzögerung direkt an die PTY, Ausgabe wird höchstens pro Renderframe gebündelt
- Nicht sichtbare Terminals werden nicht mehr dauerhaft im Browser geparst; sie detachen und synchronisieren bei Rückkehr
- Starre UI-Tab-Limits der alten horizontalen Tabarchitektur entfernt, serverseitige Ressourcenlimits bleiben bestehen
- Terminal-Server und -Client um Headless-Renderer, Sync-Protokoll und Workspace-V2-Modell erweitert

---

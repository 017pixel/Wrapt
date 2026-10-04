# Benachrichtigungen und Inbox

## Ist-Stand

Der Benachrichtigungsbereich speichert Einträge serverseitig in SQLite. Das Schema
enthält Quelle, Kategorie, Icon, Schweregrad, Zustand, Lese- und Bestätigungszeit,
Link, Metadaten und optionale Fehlerberichte. Alte Einträge werden nach der
konfigurierten Aufbewahrungsfrist bereinigt; gespeicherte Inhalte werden redigiert.

Die API unterstützt Filter, Cursor-Paginierung, Lesen, Bestätigen, Presence und
Push-Abos. Ein WebSocket meldet Änderungen, damit die Oberfläche ihre Abfrage
aktualisieren kann. Push lässt sich global, pro Quelle und pro Gerät einstellen.

Kurzlebige Toast-Oberflächen, Aufrufe, Einstellungen, Styles und überholte Tests
sind entfernt. Es gibt keinen Popup-Ersatz. Die Benachrichtigungswege sind die
dauerhaften Einträge und der vom Nutzer aktivierte Geräte-Push.

## Vertrag und Einstellungen

Der gemeinsame Contract definiert die Benachrichtigungsdaten und Push-Einstellungen.
Quellen sind Hermes, T3, OpenCode, Codex, Claude Code, Terminal und Wrapt. Alte
Einstellungsdaten bleiben lesbar; die Oberfläche bietet nur noch Push als Kanal an.

Geräte werden einzeln abonniert und können einzeln deaktiviert werden. Ein globaler
Schalter steuert den Server-Push; pro Quelle lässt sich Push zusätzlich ein- oder
ausschalten. Ein Testknopf sendet eine Testmitteilung an das gewählte Gerät.

## Verhalten

Einträge tragen einen Zustand (`active`, `resolved` oder `dismissed`) sowie Lese-
und Bestätigungszeitpunkte. Meldungen lassen sich anhand ihrer Quelle, Kategorie
und Schwere filtern. Links führen zum Ziel, wenn die Quelle einen passenden Pfad
mitliefert. Fehlerberichte enthalten redigierte Kontext-, Log- und Umgebungsdaten.

Der Ereigniskanal hält die Oberfläche aktuell. Push wird anhand der serverweiten
Einstellung, der Quellenpräferenz, des Geräte-Abos und der aktiven Presence
zugestellt. Eine aktive passende Ansicht kann Push für dieses Ereignis unterdrücken.

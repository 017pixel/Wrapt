# [2.0.0] - 2026-10-02

### Erstellt
- Regressionstests für kombinierte Nutzungsfilter, Push-Einstellungen und die verbleibende Benachrichtigungssynchronisierung
- Ausführbare Browser-Tests der Nutzungsübersicht mit isolierten Demo-Daten

### Verändert
- Benachrichtigungseinstellungen enthalten nur noch Push-Schalter. Frühere Toast-Felder entfallen aus API-Antworten; bestehende Einstellungen bleiben lesbar und behalten ihre Push-Auswahl.
- README, technische Dokumentation und Dokumentationswebseite an den aktuellen Funktionsumfang angepasst

### Gelöscht
- Sämtliche Toast-Oberflächen, Aufrufe, Einstellungen, Styles und überholten Tests entfernt
- Ungenutzte Timeline, doppelte Werkzeug- und Routingdefinitionen, alte Hilfsfunktionen und Diagnoseskripte entfernt

### Behoben
- Ausgeblendete Accounts bleiben auch bei aktiviertem Problemfilter ausgeblendet
- Nutzungsseite und lange Accountnamen im Detaildialog passen auf kleine Displays

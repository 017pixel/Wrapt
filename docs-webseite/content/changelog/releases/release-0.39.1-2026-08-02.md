# [0.39.1] - 2026-08-02

### Verändert

- News-Suche verträgt Bindestriche und Sonderzeichen („Open-Source", „KI-Modell") statt mit 500 abzubrechen
- Nutzungsübersicht summiert alle Provider pro Tag: „Tokens heute" und die 30-Tage-Projektion stimmen wieder
- Inbox lädt alle Benachrichtigungen per „Weitere laden", zeigt Aktionsfehler an und blendet Gelesenes auch mobil aus
- Tech TLDRs zeigt Listen- und Synchronisierungsfehler mit „Erneut versuchen" an und aktualisiert sich selbst
- Alte Workspace-Speicher (benjamin-dev-workbench.*) werden beim Start automatisch übernommen

### Repariert

- Große HTML-Antworten von Previews und T3 werden hart begrenzt statt unbegrenzt gepuffert; Dateimanager-Uploads erreichen ihr eigenes Limit
- T3-Downgrade auf Stable warnt in der UI und sichert state.sqlite automatisch
- Beendete Terminal-Sessions räumen sich selbst auf, fehlende CLIs melden „nicht installiert", langsame Dienste melden „unbekannt"
- Panel-Limit zeigt eine klare Meldung, Sidebar räumt bei Abbruch auf und speichert die Breite zuverlässig
- Design-System: ANSI-, Icon- und Syntax-Farben in den @theme-Block, sichtbare Gradients entfernt

### Gelöscht

- Ungenutzte klassische Workbench-Ansicht und tote Routendefinitionen entfernt
- Veraltete Migrations-Artefakte aus dem Datenverzeichnis entfernt
- Toten Versions-Cache und doppelte Hermes-Speicherung entfernt

---

# [0.8.0] - 2026-07-15

### Erstellt

- Dauerhafte lokale Historie für Tokens, Kosten, Limits und Reset-Guthaben
- Diagramme für Tagesverlauf sowie Auswertungen nach Projekt und Modell
- Verbrauchsprognosen für aktive Limitfenster und kommende 30 Tage
- Verwaltung vorhandener Codex- und OpenCode-Profile im Frontend
- Geführte Neuanmeldung in isolierten, sicheren CLI-Terminals

### Verändert

- Nutzung und Limits besitzt jetzt vier übersichtliche Analysebereiche
- CodexBar liefert zusätzlich Kosten-, Modell- und Projektstatistiken
- Doppelt erkannte Codex-Accounts werden anhand ihrer Identität zusammengeführt
- Globale Datenbank-, Collector- und Profilpfade werden zentral konfiguriert
- Service Worker verwendet unter dem Workbench-Pfad eine eindeutige Browser-Scope

### Gelöscht

- Beschränkung der Nutzungsseite auf aktuelle Prozentwerte
- Verlust historischer Messwerte nach einem Serverneustart
- Notwendigkeit, lokale Accounts ausschließlich in Konfigurationsdateien zu verwalten
- Ungekennzeichnete Vermischung exakter und abgeleiteter Projektwerte
- Löschen lokaler Profildaten beim Entfernen eines Workbench-Accounts

# [0.42.0] - 2026-08-06

### Verändert

- Benachrichtigungen: Push geht nur noch raus, wenn die Workbench nicht aktiv genutzt wird; fokussierte und offene Chats liefern stattdessen Toast und Inbox-Eintrag
- T3-Benachrichtigungen öffnen den passenden Thread direkt in der Workbench (SPA-Tiefenlink statt Proxy-Vollseite), auch aus Push-Meldungen und der Inbox
- T3 „Plan ist bereit" erscheint als Info statt Warnung, damit autonome Zwischenpläne weder Push noch Fehler-Optik auslösen
- Textinhalte der Benachrichtigungen nennen das Projekt (T3, Codex, OpenCode, Terminal)
- Push auf Apple-Geräten funktioniert wieder: VAPID-Subject mit gültiger Domain und APNs ohne Topic-Header
- Previews bleiben stabil: Die Session hält ihren Slot, bis du das Ziel entfernst oder echte Slot-Knappheit herrscht; Command-R und Tab-Wechsel brechen keine Preview mehr ab

### Behoben

- T3-Tiefenlinks nutzen die echte Thread-Route (`/_chat/<environmentId>/<threadId>`); ohne das Layoutsegment brach T3 mit „fetch-session-state (HTTP 500)" ab
- Ältere T3-Links ohne `_chat`-Layout (aus früheren Push- und Inbox-Einträgen) werden beim Öffnen automatisch auf die Thread-Route normalisiert
- Presence verfällt jetzt nach 90 Sekunden ohne Heartbeat; geschlossene Tabs und gekillte PWAs markieren nichts mehr dauerhaft als gelesen
- Offene Panels (z. B. T3 in der Workbench) melden ihren Chat als sichtbar; Inbox-Einträge für offene Chats unterbleiben
- „Braucht Input"-Erkennung im Terminal meldet erst nach einer Schreibpause und erkennt mehr Warte-Muster, Zwischenschritt-Fehlalarme entfallen
- Beim Push-Klick wird das zuletzt sichtbare Workbench-Fenster verwendet statt des ersten
- Abgestürzte Preview-Devserver startet die Workbench automatisch neu (mit Backoff); die Fehlerseite lädt sich danach selbst neu

---

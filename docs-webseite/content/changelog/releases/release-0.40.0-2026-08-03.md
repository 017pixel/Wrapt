# [0.40.0] - 2026-08-03

### Erstellt

- Unabhängige Push-Abos für mehrere Android- und iPadOS-Geräte derselben Workbench-Identität
- Gerätebezogener Aktivieren-, Deaktivieren- und serverseitiger Testablauf in den Einstellungen
- Automatische Reparatur verlorener Servereinträge und Erneuerung nach einem VAPID-Schlüsselwechsel
- Versionierte Push-Payloads mit sicheren Deep-Links, ereignisabhängiger TTL und stabilem Tag
- Automatisierte Mehrgeräte-, Policy-, Fehler-, VAPID- und Browserclient-Tests samt realer Abnahmecheckliste

### Verändert

- Globale Server-Push-Policy und lokale Subscription des aktuellen Geräts sind klar getrennt
- Warnungen, Fehler, relevante Agentenabschlüsse, Rückfragen und Pläne folgen einer zentralen Push-Policy
- Der Push-Versand arbeitet begrenzt parallel und protokolliert permanente sowie temporäre Fehler strukturiert
- Der Service Worker fokussiert bestehende PWA-Fenster, öffnet sichere Ziele und markiert Einträge bestmöglich gelesen
- iPadOS erklärt die notwendige Home-Screen-Installation, ohne außerhalb der PWA eine Permission anzufragen

### Gelöscht

- Globales Entfernen aller Geräte durch den normalen Geräte-Schalter
- Irreführender `subscribed`-Status, der irgendein statt das aktuelle Geräte-Abo beschrieb
- Starre Fünf-Minuten-TTL für zeitweise offline befindliche Mobilgeräte
- Fest verdrahteter Inbox-Link für jede Push-Nachricht
- Stilles Verschlucken von Push-Fehlern und unkontrollierter Versand an alle Endpoints gleichzeitig

---

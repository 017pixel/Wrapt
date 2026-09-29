# Web-Push-Abnahme

Diese Checkliste prüft die reale Zustellung auf einem Mac sowie auf Android und iOS/iPadOS. Sie
ergänzt die automatisierten Server- und Browserclient-Tests: Nur ein echtes Zielgerät bestätigt,
dass Betriebssystem und Browser die Push-Nachricht tatsächlich anzeigen.

## Voraussetzungen

- Wrapt über den produktiven privaten HTTPS-Origin öffnen.
- Globalen Server-Push und die betroffenen Quellen in den Einstellungen aktivieren.
- `<paths.dataDir>/notifications/vapid.json` und die Wrapt-SQLite-Datenbank sichern.
- Sicherstellen, dass der Server ausgehendes HTTPS zu den Push-Endpoints und für Apple zu
  `*.push.apple.com` erreicht.
- Für Safari auf dem Mac dokumentiert Apple Web Push ab Safari 16 auf macOS 13; iOS/iPadOS benötigt
  mindestens Version 16.4 und eine zum Home-Bildschirm hinzugefügte Web-App ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).

## Geräteübergreifender Ablauf

1. Wrapt in Safari oder einem Push-fähigen Browser auf dem Mac öffnen und in den Einstellungen
   Push für dieses Gerät aktivieren. Die Berechtigung muss direkt nach dem Button-Klick erscheinen;
   danach muss der Status „Aktiv“ zeigen.
2. Den Testpush senden. Genau eine Systembenachrichtigung muss im macOS-Mitteilungszentrum
   eintreffen. Nach Klick muss Wrapt den sicheren Deep Link oder das Dashboard öffnen.
3. Den Browser-Tab schließen und den Testpush erneut senden. Die Systembenachrichtigung muss auch
   ohne offenen Wrapt-Tab eintreffen.
4. PWA auf Android installieren und Push aktivieren. Der Status muss „Aktiv“ zeigen.
5. PWA vollständig schließen und den Testpush an dieses Gerät senden. Genau eine sichtbare
   Systembenachrichtigung muss eintreffen; ihr Klick öffnet die PWA oder fokussiert ein vorhandenes
   Wrapt-Fenster.
6. PWA auf dem iPhone oder iPad über „Teilen → Zum Home-Bildschirm“ installieren und vom Icon
   starten. In einem normalen Safari-Tab muss stattdessen die Installationsanleitung erscheinen.
7. Push in der installierten iOS-PWA aktivieren. Die Gerätezahl muss steigen, ohne vorhandene
   Abos anderer Geräte zu verändern.
8. Die PWA vollständig schließen und den Testpush an das iPhone oder iPad senden. Genau eine
   sichtbare Systembenachrichtigung muss eintreffen.
9. Einen echten relevanten Agentenabschluss oder eine Rückfrage erzeugen, während Wrapt länger als
   90 Sekunden verborgen oder geschlossen ist. Push muss nur auf Geräten ankommen, die global und
   für die jeweilige Quelle aktiviert sind.
10. Push auf genau einem Gerät deaktivieren und einen weiteren relevanten Push erzeugen. Die
    anderen Geräte müssen weiterhin empfangen; das deaktivierte Gerät nicht.
11. Den Wrapt-Server neu starten, ohne die VAPID-Datei zu verändern. Auf jedem aktivierten Gerät
    muss danach ein Testpush eintreffen; es darf keine neue Permission-Abfrage geben.
12. Die Benachrichtigungsberechtigung eines Geräts im Betriebssystem blockieren. Die Einstellungen
    müssen „Blockiert“ anzeigen und die Verwaltung der übrigen Geräte weiter erlauben.
13. Die PWA aktualisieren, vollständig schließen und erneut öffnen. Der neue Service Worker muss
    aktiv sein; ein weiterer Testpush muss sichtbar eintreffen.

## Service-Worker-Sicherheitscheck

Diese Fälle lassen sich in den DevTools des installierten Browsers oder mit einem lokalen
Service-Worker-Testwerkzeug prüfen:

- Gültige Payload mit `version: 1` zeigt Titel, Text, Icon, Badge und stabilen Tag.
- Kaputtes JSON und eine unbekannte Payload-Version erzeugen trotzdem eine sichtbare generische
  Wrapt-Benachrichtigung.
- Ein Link außerhalb von `/wrapt` oder `/t3`, ein Protokoll-Link und `//fremder-host` öffnen
  ausschließlich das Dashboard unter `/wrapt/`.
- Der Klick fokussiert einen bestehenden Wrapt-Client, navigiert ihn und markiert eine gültige
  Notification-ID bestmöglich als gelesen. Ohne Client öffnet er eine neue PWA-Ansicht.
- Zwei Zustellungen mit derselben Notification-ID ersetzen sich über denselben Tag und erscheinen
  nicht doppelt.

## In der Entwicklungsumgebung geprüft

- Automatisierte Backend-, API- und Browserclient-Tests decken Mehrgerätebetrieb, Ownership,
  Policy, Fehlerisolation, Endpoint-Bereinigung, VAPID-Stabilität und lokale Gerätezustände ab.
- Unit-Tests mit gemocktem Browser und Push-Provider prüfen Gerätestatus, Abo-Synchronisierung,
  VAPID-Wechsel, Mehrgerätebetrieb, Ownership und Apple-spezifische Header.
- Reale Systemanzeige, geschlossene PWA, Service-Worker-Klick und macOS-Mitteilungszentrum müssen
  auf den Zielgeräten anhand der obigen Checkliste bestätigt werden.

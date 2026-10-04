# Notizen, Nutzung und Benachrichtigungen

Neben den Coding-Werkzeugen hat Wrapt Seiten für Arbeitsnotizen, Nutzungslimits und Benachrichtigungen. Die Bereiche sind unabhängig: Notizen sind eigener Inhalt, die Nutzungsseite zeigt Daten der Anbieter, und Benachrichtigungen melden ausgewählte Ereignisse.

## Notizen

Der Bereich **Notizen** organisiert Seiten in einem Seitenbaum. Die Seitenleiste gruppiert zuletzt geöffnete Seiten, Favoriten, den Bereich **Privat** und den Papierkorb. Du kannst Seiten erstellen, Unterseiten anlegen, verschieben, duplizieren, als Favorit markieren oder archivieren. Archivierte Seiten lassen sich wiederherstellen.

Der Editor speichert Änderungen automatisch; den Status zeigt die Kopfzeile. Wird dieselbe Notiz gleichzeitig an anderer Stelle geändert, meldet Wrapt einen Konflikt, statt die eigene Fassung still zu verwerfen. Dann wählst du, ob du die Serverfassung lädst oder deine Fassung behältst.

Tippe `/`, um einen Inhaltsblock einzufügen. Zur Auswahl stehen unter anderem Absätze, Überschriften, Listen und Aufgaben, Zitate, Callouts, Codeblöcke, Tabellen, zweispaltige Bereiche, Formeln, Unterseiten, Seitenverweise sowie Bilder und Dateien. Die Suche öffnest du über die Schaltfläche in der Seitenleiste oder mit `⌘K` auf macOS beziehungsweise `Ctrl+K` auf Windows und Linux. Filter grenzen Suchbereich und Zeiträume ein.

Eine Seite kannst du in einem eigenen Fenster öffnen und über einen kopierten Wrapt-Link wieder aufrufen. Auf schmalen Bildschirmen blendet sich die Seitenleiste als Schublade ein und aus.

### Notiz im Orbit verwenden

Im Orbit ist eine Notizfläche ein freier Textblock oder ein Verweis auf eine Seite aus der Notizenübersicht. So bleiben langfristige Seiten und kleine Canvas-Notizen nebeneinander nutzbar. Siehe [Orbit](./orbit.md).

## Nutzungslimits

Die Seite **Nutzung** zeigt eine Tabelle der verfügbaren Codex-, Claude-Code- und OpenCode-Go-Konten. Aufklappbare Accountzeilen zeigen unterstützte Limitfenster, verbleibende Nutzung und den nächsten bekannten Reset. Filter grenzen die Konten nach ihrem Datenstatus ein.

Für Codex können außerdem lokal erkannte Reset-Guthaben erscheinen. Die optionale Community-Historie ist ein globaler Hinweis und keine Aussage über den persönlichen Account. Fehlende Daten oder abgelaufene Abrufe werden mit ihrem Datenstatus dargestellt; die Seite garantiert nicht, dass ein Anbieterendpunkt erreichbar ist.

![Nutzungsübersicht ohne konfigurierte Konten](../assets/08-usage.png)

## Benachrichtigungen

Ausgewählte Ereignisse werden serverseitig gespeichert. Unter **Einstellungen → Benachrichtigungen** steuerst du Web-Push global und je Quelle. Web-Push wird pro Gerät aktiviert und kann dort getestet oder deaktiviert werden. Der globale Server-Push-Schalter und das Geräte-Abo sind getrennt: Ein aktives Geräte-Abo allein schaltet den Serverversand nicht ein.

Push kann auch eintreffen, während Wrapt geöffnet ist. Ein Ereignis zum gerade sichtbaren Thread oder Terminal wird als gelesen markiert und nicht zusätzlich gepusht.

Auf iPadOS lässt sich Web-Push nur über eine installierte PWA vom Home-Bildschirm aus aktivieren. Browserberechtigung und HTTPS müssen verfügbar sein. Push-Nachrichten können außerhalb des sichtbaren Wrapt-Fensters erscheinen; die Ereignisse und Abos verwaltet der Server.

## Grenzen

- Eine eigene Inbox-Seite gibt es nicht. Benachrichtigungen bleiben serverseitig gespeichert, bis sie durch die Aufbewahrungsregel entfernt werden.
- Benachrichtigungen kommen nur, wenn die jeweilige Integration Ereignisse liefert und die Einstellungen den Kanal zulassen.
- Nutzungslimits hängen von externen Anbieterdaten und lokaler Konfiguration ab. Fehlende oder veraltete Werte sind kein verlässlicher Verbrauchsstand.
- Push gilt je Gerät. Ein Browserwechsel oder ein neues Gerät braucht ein eigenes Abo.

## Weiterlesen

- [Orbit und Notizflächen](./orbit.md)
- [Coding-Werkzeuge](./werkzeuge.md)
- [Einstellungen und Konfiguration](https://github.com/017pixel/Wrapt/blob/master/docs/settings.md)
- [Web-Push-Abnahme und Plattformgrenzen](https://github.com/017pixel/Wrapt/blob/master/docs/web-push-acceptance.md)

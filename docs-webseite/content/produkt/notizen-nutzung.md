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

Die Seite **Nutzung** fasst Konten und unterstützte Limitfenster von Codex, Claude Code und OpenCode Go zusammen, sofern die Instanz Datenquellen dafür eingerichtet hat. Accountzeilen lassen sich öffnen und zeigen Zeitfenster, verbleibende Nutzung und den nächsten bekannten Reset. Eine Timeline stellt verfügbare Fenster zeitlich dar; Filter und Darstellungsoptionen helfen beim Vergleich.

Für Codex können außerdem lokal erkannte Reset-Guthaben erscheinen. Die optionale Community-Historie ist ein globaler Hinweis und keine Aussage über den persönlichen Account. Fehlende Daten oder abgelaufene Abrufe werden mit ihrem Datenstatus dargestellt; die Seite garantiert nicht, dass ein Anbieterendpunkt erreichbar ist.

![Nutzungsübersicht ohne konfigurierte Konten](../assets/08-usage.png)

## Benachrichtigungen

Wrapt kann ausgewählte Ereignisse als Toast anzeigen. Quellen sind unter anderem T3 Code, OpenCode, Hermes, Codex, Claude Code, Terminal und Wrapt selbst. Ein Toast lässt sich öffnen oder schließen; beim Öffnen gilt er als gelesen und folgt bei vorhandenem Ziel dem passenden Link.

Unter **Einstellungen → Benachrichtigungen** steuerst du Toastdauer, Anzahl der Toasts und die Toast-/Push-Ausgabe je Quelle. Web-Push wird pro Gerät aktiviert und kann dort getestet oder deaktiviert werden. Der globale Server-Push-Schalter und das Geräte-Abo sind getrennt: Ein aktives Geräte-Abo allein schaltet den Serverversand nicht ein.

Auf iPadOS lässt sich Web-Push nur über eine installierte PWA vom Home-Bildschirm aus aktivieren. Browserberechtigung und HTTPS müssen verfügbar sein. Push-Nachrichten können außerhalb des sichtbaren Wrapt-Fensters erscheinen; die Ereignisse und Abos verwaltet der Server.

## Grenzen

- Eine eigene Inbox-Seite gibt es nicht. Toasts schließen sich nach der eingestellten Zeit; öffne sie, wenn du dem Ziel folgen möchtest.
- Benachrichtigungen kommen nur, wenn die jeweilige Integration Ereignisse liefert und die Einstellungen den Kanal zulassen.
- Nutzungslimits hängen von externen Anbieterdaten und lokaler Konfiguration ab. Fehlende oder veraltete Werte sind kein verlässlicher Verbrauchsstand.
- Push gilt je Gerät. Ein Browserwechsel oder ein neues Gerät braucht ein eigenes Abo.

## Weiterlesen

- [Orbit und Notizflächen](./orbit.md)
- [Coding-Werkzeuge](./werkzeuge.md)
- [Einstellungen und Konfiguration](https://github.com/017pixel/Wrapt/blob/master/docs/settings.md)
- [Web-Push-Abnahme und Plattformgrenzen](https://github.com/017pixel/Wrapt/blob/master/docs/web-push-acceptance.md)

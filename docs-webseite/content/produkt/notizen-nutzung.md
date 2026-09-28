# Notizen, Nutzung und Benachrichtigungen

Wrapt bietet neben den Coding-Werkzeugen einen Ort für Arbeitsnotizen, eine Übersicht über verfügbare Nutzungslimits und Hinweise zu wichtigen Ereignissen. Die Funktionen sind getrennt: Eine Notiz ist eigener Inhalt, die Nutzung zeigt Providerdaten, und Benachrichtigungen melden ausgewählte Statuswechsel.

## Notizen

Der Bereich **Notizen** organisiert Seiten in einem hierarchischen Seitenbaum. Die Seitenleiste gruppiert zuletzt geöffnete Seiten, Favoriten, den Bereich **Privat** und den Papierkorb. Du kannst Seiten erstellen, Unterseiten anlegen, verschieben, duplizieren, als Favorit markieren oder archivieren. Archivierte Seiten lassen sich wiederherstellen.

Der Editor speichert Änderungen automatisch. Während des Speicherns zeigt die Kopfzeile den Status. Wird dieselbe Notiz gleichzeitig an anderer Stelle geändert, zeigt Wrapt einen Konflikt, statt die eigene Fassung still zu verwerfen; wähle dann, ob du die Serverfassung lädst oder deine Fassung behältst.

Tippe `/`, um einen Inhaltsblock einzufügen. Unterstützt werden unter anderem Absätze, Überschriften, Listen und Aufgaben, Zitate, Callouts, Codeblöcke, Tabellen, zweispaltige Bereiche, Formeln, Unterseiten, Seitenverweise sowie Bilder und Dateien. Die Suche öffnest du über die Schaltfläche in der Seitenleiste oder mit `⌘K` auf macOS beziehungsweise `Ctrl+K` auf Windows und Linux. Filter helfen, den Suchbereich und Zeiträume einzugrenzen.

Eine Seite kann in einem eigenen Fenster geöffnet und über einen kopierten Wrapt-Link wieder aufgerufen werden. Auf schmalen Bildschirmen wird die Seitenleiste als Schublade ein- und ausgeblendet.

### Notiz im Orbit verwenden

Im Orbit kann eine Notizfläche als freier Textblock dienen oder auf eine Seite aus der Notizenübersicht verweisen. So bleiben langfristige Seiten und kleine, aufgabenbezogene Canvas-Notizen nebeneinander nutzbar. Siehe [Orbit](./orbit.md).

## Nutzungslimits

Die Seite **Nutzung** fasst Konten und unterstützte Limitfenster von Codex, Claude Code und OpenCode Go zusammen, sofern die jeweilige Instanz dafür Datenquellen konfiguriert hat. Accountzeilen lassen sich öffnen, um Zeitfenster, verbleibende Nutzung und den nächsten bekannten Reset zu sehen. Eine Timeline stellt verfügbare Fenster zeitlich dar; Filter und Darstellungsoptionen helfen beim Vergleich.

Für Codex können außerdem lokal erkannte Reset-Guthaben erscheinen. Eine optionale Community-Historie ist ein globaler Hinweis und keine bestätigte Aussage zum persönlichen Account. Fehlende Daten oder abgelaufene Abrufe werden mit ihrem Datenstatus dargestellt; die Seite garantiert keine Verfügbarkeit eines Anbieterendpunkts.

![Nutzungsübersicht ohne konfigurierte Konten](../assets/08-usage.png)

## Benachrichtigungen

Wrapt kann ausgewählte wichtige Ereignisse als Toast anzeigen. Quellen sind unter anderem T3 Code, OpenCode, Hermes, Codex, Claude Code, Terminal und Wrapt selbst. Ein Toast lässt sich öffnen oder schließen; beim Öffnen wird er als gelesen markiert und folgt bei vorhandenem Ziel dem passenden Link.

Unter **Einstellungen → Benachrichtigungen** kannst du die Toastdauer, Toasts insgesamt und Toast-/Push-Ausgabe je Quelle steuern. Web-Push wird pro Gerät aktiviert und kann dort getestet oder deaktiviert werden. Der globale Server-Push-Schalter und das Geräte-Abo sind getrennt: Ein aktives Geräte-Abo allein schaltet den Serverversand nicht ein.

Auf iPadOS muss Web-Push über eine installierte PWA vom Home-Bildschirm aus aktiviert werden. Browserberechtigung und HTTPS müssen verfügbar sein. Push-Nachrichten können außerhalb des sichtbaren Wrapt-Fensters erscheinen; die zugrunde liegenden Ereignisse und Abos werden auf dem Server verwaltet.

## Grenzen

- Eine eigene Inbox-Seite gibt es nicht. Toasts schließen sich nach der eingestellten Zeit; öffne sie, wenn du dem Ziel folgen möchtest.
- Benachrichtigungen hängen davon ab, dass die jeweilige Integration Ereignisse liefert und die Einstellungen den Kanal zulassen.
- Nutzungslimits hängen von externen Providerdaten und lokalen Konfigurationen ab. Fehlende oder veraltete Werte sind kein verlässlicher Verbrauchsstand.
- Push-Aktivierung gilt je Gerät. Ein Browserwechsel oder neues Gerät benötigt ein eigenes Abo.

## Weiterlesen

- [Orbit und Notizflächen](./orbit.md)
- [Coding-Werkzeuge](./werkzeuge.md)
- [Einstellungen und Konfiguration](https://github.com/017pixel/Wrapt/blob/master/docs/settings.md)
- [Web-Push-Abnahme und Plattformgrenzen](https://github.com/017pixel/Wrapt/blob/master/docs/web-push-acceptance.md)

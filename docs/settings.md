# Einstellungen

Die Einstellungsseite ist unter `/wrapt/settings` erreichbar und bleibt auch ohne eigene
Anmeldung durch die bestehende Tailscale-Identität geschützt. Client-Einstellungen liegen pro
Workbench-Identität auf dem Server und werden zwischen allen Clients abgeglichen; der Browser
behält nur einen lokalen Cache für schnellen Start und Offline-Bedienung. Die Navigation trennt
clientweite Einstellungen und verbundene Wrapt-Instanzen:

- **Client-weit** enthält Allgemein, Design, Navigation, Rechtsklick, Benachrichtigungen, System,
  Plugin-Berechtigungen, Nutzung & Limits, Experimente und Easter Eggs.
- **Allgemein** bündelt Status, Verknüpfungen, App-Installation und Version. Updates und Neustart liegen gemeinsam unter **System**.
- **Design** verwaltet Theme-Vorlagen und eigene Farbrollen. Änderungen werden sofort auf der
  Workbench angewendet und über den Server an alle Clients verteilt; ein heller Modus gehört
  nicht zum Produktvertrag.
- **Navigation** bündelt Tastenkürzel, Dashboard-Bereiche und globale Seiten-Sichtbarkeit.
- **Workspaces** verwaltet verbundene lokale und entfernte Wrapt-Instanzen, prüft ihren
  Verbindungsstatus und wechselt zwischen erreichbaren Instanzen. Derselbe Wechsel ist über den
  Workspace-Wechsler in der Seitenleiste verfügbar. Die Liste wird über den Server abgeglichen
  und beim Wechsel per URL-Fragment zur Zielinstanz übertragen; Layout und Darstellung bleiben
  je Instanz.
- **Easter Eggs** enthält optionale Extras, standardmäßig deaktiviert.
  Das Capybara-Maskottchen läuft in der Statusleiste zufällig umher, wird nach längerer Ruhe müde
  (nachts schneller) und feiert selten mit Partyhut und Konfetti, nach einem gelungenen Neustart
  sofort. Die Größe lässt sich zwischen 50 und 200 Prozent einstellen; die Vorschau im Bereich löst
  Gähnen, Party und Nickerchen direkt aus und schläft dort schon nach einer kurzen Frist ein.
  Der Dashboard-Hintergrund blendet eines von 18 Doku-Motiven hinter die Systemwidgets. Alle 18
  Motive werden für die Workbench in zwei kleineren Bildgrößen vorgehalten, damit das Bild ohne
  sichtbare Verzögerung erscheint: 1280 × 720 für den Hintergrund und 320 × 180 für die Auswahl im Karussell. Wischen, die Pfeilbuttons und die Pfeiltasten wechseln das Motiv.
  Originale in voller Auflösung bleiben für die Dokumentationsseite erhalten; die kleineren Varianten
  erzeugt `pnpm build:artwork`, `pnpm build:artwork: --check` prüft, ob sie zu den aktuellen
  Parametern passen.
- **Experimente** enthält den Schalter „Hermes V2 aktivieren“. Er öffnet den [nativen Hermes-Chat](hermes-v2.md).
  Er wirkt sofort und gilt nach dem Abgleich auch auf allen anderen Clients.
Der Root-Pfad öffnet das Dashboard. Eine frühere Start-App-Auswahl wird nicht mehr angewendet.

Mobil ersetzt eine Bereichsauswahl die Tab-Gruppen. Suche und bestehende Deep-Links bleiben verfügbar.

Unter **Plugin-Berechtigungen** werden installierte Erweiterungspakete verwaltet. Der Link
zu **Plugins** öffnet Entwürfe, Code-Plugins und den Katalog.

## Suche

Die Suchleiste steht über allen Tabs. Sie durchsucht Namen, Beschreibungen und hinterlegte
Alias-Begriffe. Die Suche normalisiert Groß-/Kleinschreibung, Umlaute und Sonderzeichen und
akzeptiert bis zu drei Bearbeitungsfehler pro Suchanfrage. Dadurch funktionieren zum Beispiel
`Aussehen` für Design, `Farben` für eigene Farbrollen und auch Tippfehler wie `desgin`.

Ein Treffer öffnet den passenden Tab, springt direkt zum Einstellungsbereich und markiert das Ziel
kurz. `Enter` öffnet den besten Treffer, `Escape` leert die Suche. Alte Links auf
`#einstellungen:oberflaeche` bleiben gültig und öffnen den Tab **Navigation**. Alte Links auf
`#einstellungen:workspace`, `#einstellungen:layout` und `#einstellungen:start-app` öffnen **Allgemein**.

## Tastenkürzel

Unter **Navigation → Tastenkürzel** werden die Zusatztasten für die Seitenwahl und die
Direktkürzel geändert. Standardmäßig zeigt gehaltenes **Control + Shift** auf macOS und **Alt + Shift** auf Windows an den ersten zehn
sichtbaren Seiten unter **Allgemein** und **Werkzeuge** die Nummern **1–9 und 0**.
**Account und System** verwendet ausschließlich die Direktkürzel **P**, **N** und **E**. Eine Zahl wechselt direkt zur Seite. Die Nummern
folgen der aktuellen Reihenfolge; ausgeblendete Seiten zählen nicht mit. Eingeklappte Gruppen
öffnen sich für die Anzeige vorübergehend und behalten ihren gespeicherten Zustand.

Die Direktkürzel verwenden standardmäßig **Control + Shift** auf macOS beziehungsweise **Alt + Shift** auf Windows mit **E** für Einstellungen,
**N** für Nutzung und Limits, **P** für Plugins, **S** für die Serverauswahl und **L** für das
Limits-Popup. Die Serverauswahl ist verfügbar, wenn mindestens zwei Server hinterlegt sind.
Jede Belegung lässt sich durch Drücken einer neuen Kombination ändern oder separat abschalten.
Für die Zahlenwahl werden nur die gewünschten Zusatztasten gehalten und wieder losgelassen.
Escape bricht die Aufnahme ab; doppelte Wrapt-Belegungen werden abgelehnt.

Aktive Wrapt-Kürzel haben Vorrang vor den kontrollierten eingebetteten Werkzeugen und dem
Terminal. Normale Werkzeug-Eingaben bleiben erhalten. Browser- und Systemkürzel können Vorrang
haben, insbesondere unter Windows/Linux bei Ctrl + Shift + N, P oder S. In fremden Preview-Seiten
und separaten Werkzeugfenstern übernimmt Wrapt keine Tastatureingaben. Die Kürzel sind Teil der
synchronisierten App-Einstellungen. Eine Änderung unter Windows, etwa Alt + Shift + K für
Plugins, wird auf macOS als Command + Shift + K verwendet und umgekehrt. Auch die Zahlenwahl
und deaktivierte Aktionen werden gemeinsam abgeglichen. Bisher getrennte Windows-Belegungen
werden bei der Migration als gemeinsame Belegung übernommen.

## Speicherung und Synchronisierung

Client-Einstellungen liegen pro Workbench-Identität in der Tabelle `ui_settings` der bestehenden
Wrapt-SQLite (Schlüssel, JSON-Wert, Revision). Der Browser hält daneben einen versionierten
`localStorage`-Cache, damit die Oberfläche sofort startet und auch bei kurzer Netzunterbrechung
bedienbar bleibt. Ein Abgleich läuft:

- beim Öffnen der Workbench und nach jedem Wiederverbinden,
- gebündelt kurz nach einer lokalen Änderung,
- live über `/api/v1/settings/ws`,
- zusätzlich alle 45 Sekunden als Fallback und bei Rückkehr in den Tab.

Der Server führt pro Schlüssel eine eigene Revision. Zwei Clients können daher unterschiedliche
Einstellungen ändern, ohne sich gegenseitig zu überschreiben. Bei derselben Einstellung gewinnt
die letzte Änderung. Ungesendete Änderungen werden lokal markiert und beim nächsten Start
nachgereicht; `pagehide` versucht einen letzten `keepalive`-Schreibvorgang. Beim ersten Start
nach dem Update hebt jeder Client seine vorhandenen lokalen Einstellungen einmalig auf den Server.

Serverweite Werte (Theme, Rechtsklick-Menü, Maskottchen, Benachrichtigungseinstellungen,
T3-Kanal, Limitüberwachung und Reset-Historie) bleiben in `config/wrapt.local.json`. Ändert ein
Client einen dieser Werte, benachrichtigt der Server alle verbundenen Clients; die betroffenen
React-Queries laden neu. Nicht abgeglichen werden gerätegebundene Daten (Push-Abos,
PWA-Installationshinweise) und flüchtige Entwürfe oder Sitzungszustände.

Die Neustartaktionen in **Allgemein** und **System** verwenden denselben sicheren
Restart-Workflow:

- **Frontend** baut nur die Web-Oberfläche neu.
- **Backend** baut den Server neu und startet den Dienst neu.
- **Beides** führt beide Schritte in der vorgesehenen Reihenfolge aus.

Ein Backend-Neustart erhält Layout-Daten und laufende Terminals. Für Diagnose und Rollback
bleiben [`docs/configuration.md`](configuration.md) und
[`docs/troubleshooting.md`](troubleshooting.md) maßgeblich.

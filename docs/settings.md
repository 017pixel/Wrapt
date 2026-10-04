# Einstellungen

Die Einstellungsseite ist unter `/wrapt/settings` erreichbar und bleibt auch ohne eigene
Anmeldung durch die bestehende Tailscale-Identität geschützt. Die Navigation trennt clientweite
Einstellungen, das lokale Layout und verbundene Wrapt-Instanzen:

- **Client-weit** enthält Allgemein, Design, Navigation, Rechtsklick, Benachrichtigungen, System,
  Erweiterungen, Werkzeuge, Easter Eggs und Start-App.
- **Allgemein** bündelt Status, Verknüpfungen, App-Installation, Version und Neustart.
- **Design** verwaltet Theme-Vorlagen und eigene Farbrollen. Änderungen werden sofort auf die
  Workbench angewendet; ein heller Modus gehört nicht zum Produktvertrag.
- **Navigation** bündelt Dashboard-Bereiche, Orbit-Sidebar und globale Seiten-Sichtbarkeit.
- **Layout** verwaltet geöffnete Panels, bis zu acht Arbeitsflächen und das Zurücksetzen des
  lokalen Zustands.
- **Workspaces** verwaltet verbundene lokale und entfernte Wrapt-Instanzen, prüft ihren
  Verbindungsstatus und wechselt zwischen erreichbaren Instanzen. Derselbe Wechsel ist über den
  Workspace-Wechsler in der Seitenleiste verfügbar. Die Liste bleibt browserlokal und wird beim
  Wechsel per URL-Fragment zur Zielinstanz übertragen; Layout und Darstellung bleiben je Instanz.
- **Easter Eggs** enthält zwei optionale Extras, beide standardmäßig deaktiviert.
  Das Capybara-Maskottchen läuft in der Statusleiste zufällig umher, wird nach längerer Ruhe müde
  (nachts schneller) und feiert selten mit Partyhut und Konfetti, nach einem gelungenen Neustart
  sofort. Die Größe lässt sich zwischen 50 und 200 Prozent einstellen; die Vorschau im Bereich löst
  Gähnen, Party und Nickerchen direkt aus und schläft dort schon nach einer kurzen Frist ein.
  Der Dashboard-Hintergrund blendet eines von 19 Doku-Motiven hinter die Systemwidgets. Alle 19
  Motive werden für die Workbench in zwei kleineren Bildgrößen vorgehalten, damit das Bild ohne
  sichtbare Verzögerung erscheint: 1280 × 720 für den Hintergrund und 320 × 180 für die Auswahl.
  Originale in voller Auflösung bleiben für die Dokumentationsseite erhalten; die kleineren Varianten
  erzeugt `pnpm build:artwork`, `pnpm build:artwork: --check` prüft, ob sie zu den aktuellen
  Parametern passen.
- **Start-App** legt fest, welche sichtbare Seite beim Öffnen des Root-Pfads geladen wird. Eine
  ausgeblendete Seite kann nicht als Startseite ausgewählt werden.

## Suche

Die Suchleiste steht über allen Tabs. Sie durchsucht Namen, Beschreibungen und hinterlegte
Alias-Begriffe. Die Suche normalisiert Groß-/Kleinschreibung, Umlaute und Sonderzeichen und
akzeptiert bis zu drei Bearbeitungsfehler pro Suchanfrage. Dadurch funktionieren zum Beispiel
`Aussehen` für Design, `Farben` für eigene Farbrollen und auch Tippfehler wie `desgin`.

Ein Treffer öffnet den passenden Tab, springt direkt zum Einstellungsbereich und markiert das Ziel
kurz. `Enter` öffnet den besten Treffer, `Escape` leert die Suche. Alte Links auf
`#einstellungen:oberflaeche` bleiben gültig und öffnen den Tab **Navigation**. Alte Links auf
`#einstellungen:workspace` öffnen weiter den Bereich **Layout**.

## Speicherung und Neustart

Browserbezogene Einstellungen wie Theme, Navigation, Layout und Start-App bleiben in den
bestehenden versionierten Browser-Speichern. Serverweite Werte werden weiterhin über die
bestehenden typisierten APIs und `config/wrapt.local.json` verwaltet. Die Neustartaktionen in
**Allgemein** und **System** verwenden denselben sicheren Restart-Workflow:

- **Frontend** baut nur die Web-Oberfläche neu.
- **Backend** baut den Server neu und startet den Dienst neu.
- **Beides** führt beide Schritte in der vorgesehenen Reihenfolge aus.

Ein Backend-Neustart erhält Layout-Daten und laufende Terminals. Für Diagnose und Rollback
bleiben [`docs/configuration.md`](configuration.md) und
[`docs/troubleshooting.md`](troubleshooting.md) maßgeblich.

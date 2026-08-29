# Einstellungen

Die Einstellungsseite ist unter `/wrapt/settings` erreichbar und bleibt auch ohne eigene
Anmeldung durch die bestehende Tailscale-Identität geschützt. Sie ist in fachliche Tabs geteilt:

- **Allgemein** bündelt Status, die wichtigsten Verknüpfungen, App-Installation, Version und
  den Schnellzugriff für Frontend-, Backend- oder gemeinsamen Neustart.
- **Design** verwaltet dunkle Theme-Vorlagen und eigene Farbrollen. Änderungen werden sofort auf
  die Workbench angewendet; ein heller Modus gehört nicht zum Produktvertrag.
- **Navigation** bündelt Dashboard-Bereiche, Orbit-Sidebar und globale Seiten-Sichtbarkeit.
- **Rechtsklick**, **Benachrichtigungen**, **System**, **Erweiterungen**, **Werkzeuge** und
  **Workspace** behalten ihre jeweiligen Fachbereiche.
- **Start-App** legt fest, welche sichtbare Seite beim Öffnen des Root-Pfads geladen wird. Eine
  ausgeblendete Seite kann nicht als Startseite ausgewählt werden.

## Suche

Die Suchleiste steht über allen Tabs. Sie durchsucht Namen, Beschreibungen und hinterlegte
Alias-Begriffe. Die Suche normalisiert Groß-/Kleinschreibung, Umlaute und Sonderzeichen und
akzeptiert bis zu drei Bearbeitungsfehler pro Suchanfrage. Dadurch funktionieren zum Beispiel
`Aussehen` für Design, `Farben` für eigene Farbrollen und auch Tippfehler wie `desgin`.

Ein Treffer öffnet den passenden Tab, springt direkt zum Einstellungsbereich und markiert das Ziel
kurz. `Enter` öffnet den besten Treffer, `Escape` leert die Suche. Alte Links auf
`#einstellungen:oberflaeche` bleiben gültig und öffnen den neuen Tab **Navigation**.

## Speicherung und Neustart

Browserbezogene Einstellungen wie Theme, Navigation, Workspace und Start-App bleiben in den
bestehenden versionierten Browser-Speichern. Serverweite Werte werden weiterhin über die
bestehenden typisierten APIs und `config/wrapt.local.json` verwaltet. Die Neustartaktionen in
**Allgemein** und **System** verwenden denselben sicheren Restart-Workflow:

- **Frontend** baut nur die Web-Oberfläche neu.
- **Backend** baut den Server neu und startet den Dienst neu.
- **Beides** führt beide Schritte in der vorgesehenen Reihenfolge aus.

Ein Backend-Neustart erhält Workspace-Daten und laufende Terminals. Für Diagnose und Rollback
bleiben [`docs/configuration.md`](configuration.md) und
[`docs/troubleshooting.md`](troubleshooting.md) maßgeblich.

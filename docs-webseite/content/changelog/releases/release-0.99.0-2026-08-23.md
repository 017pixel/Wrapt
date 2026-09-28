# [0.99.0] - 2026-08-23

### Erstellt
- Isolierte Plugin-End-to-End-Suite für leichte, mittlere und komplexe visuelle sowie Code-Plugins ergänzt
- Echte KI-Erstellung mit drei unterschiedlichen kostenlosen OpenCode-Modellen und materialisierter Paketprüfung verifiziert
- Regressionstests für eindeutige Slugs, Paketbesitz, Lifecycle-Schutz und aktive Neuvalidierung ergänzt
- Direkte kompatible Host-Routen für `/plugins/tool/:pluginSlug` und `/plugins/view/:pluginSlug` ergänzt und Plugin-/Theme-Visualisierungen abgelegt
- Einstellungen für Appearance, semantische Plugin-Tokens und die optionale Codex-Reset-Historie ergänzt

### Verändert
- Eigene und installierte Plugins zeigen ihre Aktionen in einer luftigen gemeinsamen Zeile mit größeren Zeilenflächen
- KI-Wizard reduziert die Prompt-Seite auf Kopieraktion, kurze Bestätigung und optional aufklappbare Vorschau
- Agenten-Prompt verwendet exakte Draft-ID, API-Reihenfolge, JSON-Bodies, Manifestpfade und klare Neustartgrenzen
- Page, Sidebar, Orbit und Wizard-Metadaten werden bei jeder Erstellungsart automatisch synchron gehalten
- Nutzungsübersicht, Theme-Runtime sowie Produkt-, Server-, Web- und Environment-Version auf 0.99.0 synchronisiert

### Behoben
- Aktive eigene Plugins erscheinen sofort in der Sidebar und öffnen auf Desktop sowie Mobil ohne 404
- Neuere Drafts gewinnen bei alten doppelten Slugs und neue Drafts erhalten automatisch eindeutige Slugs
- Bearbeiten, Aktivieren, Deaktivieren, Öffnen und Löschen sind ohne vorherigen Editor-Umweg sofort sichtbar
- Servereigene Lifecycle-Felder können nicht mehr per normalem PUT gefälscht oder durch erneute Validierung verloren werden
- Paketupdates ersetzen alte Dateien atomar, leere JSON-Anfragen werden typisiert behandelt und Permissions-Policy-Werte korrekt ausgeliefert

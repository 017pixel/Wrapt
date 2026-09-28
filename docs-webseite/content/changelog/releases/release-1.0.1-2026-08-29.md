# [1.0.1] - 2026-08-29

### Erstellt
- Öffentlichen Codex-Marktplatz mit dem Wrapt-spezifischen `$plugin-creator` ergänzt
- Verifizierte Extension-Rollbacks, sichere Registry-Recovery und isolierte Deployment-Smoke-Tests ergänzt
- Vollständigen Dokumentationsindex sowie Installations- und Plugin-Anleitungen ergänzt
- Isolierten E2E-Lauf mit eigenen Testpfaden und temporärem Frontend-Build ergänzt
- Regressionstests für Theme-Erhalt, Tab-Wechsel und kompatible Versionsnormalisierung ergänzt

### Verändert
- README, Schnellstart und systemd-Betrieb bilden die tatsächlichen Installationswege ab
- Wrapt verwendet standardmäßig den versionierten, mitgelieferten Plugin-Creator-Skill
- Sämtliche README-Aufnahmen verwenden neutrale Beispieldaten und T3 Code im Dark Mode
- Plugin-Drafts nutzen Versionskonflikte, serialisierte Schreibvorgänge und gestagete Pakete
- Server, Frontend, Produktmetadaten und bestehende Konfigurationen verwenden Version 1.0.1

### Behoben
- Plugin-Verwaltung verweist nicht mehr auf den allgemeinen Codex-Plugin-Creator
- Installationsanleitung trennt Vordergrundstart und dauerhaften systemd-Betrieb eindeutig
- Design-Seite fällt nach dem Wechsel auf Navigation nicht mehr auf T3 Code zurück
- Ocean, Ember und eigene Farbänderungen verlieren ihren aktiven Zustand nicht mehr
- Proxy-, Upload- und WebSocket-Grenzen verhindern unkontrollierte aktive Inhalte und Puffer

### Gelöscht
- Echte Host-, Account-, Sitzungs- und lokale Pfaddaten aus öffentlichen Screenshots entfernt
- Abhängigkeit des Wrapt-Plugin-Makers von einem externen System-Skill entfernt
- Aktive HTML-Inhalte und globale Multipart-Verarbeitung aus privilegierten Proxy-Pfaden entfernt
- Unbegrenzte Aufbewahrung alter Frontend-Artefakte und Operationswarteschlangen entfernt
- Unbeabsichtigte Theme-Rücksetzungen und doppelte Standardauswahl entfernt

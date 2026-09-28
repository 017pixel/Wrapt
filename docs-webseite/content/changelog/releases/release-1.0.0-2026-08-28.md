# [1.0.0] - 2026-08-28

### Erstellt
- Durchsuchbare Einstellungsübersicht mit Fuzzy-Suche, bis zu drei Tippfehlern und deutschen Alias-Begriffen ergänzt
- Eigenen Design-Tab für Theme-Vorlagen, eigene Farbrollen und die zentrale Appearance-Verwaltung ergänzt
- Allgemeine Einstellungsseite mit Statusinformationen, Schnellzugriffen und System-Neustartaktionen ergänzt
- Eigenen Start-App-Tab für die beim Öffnen geladene Seite ergänzt
- Browser-E2E-Abdeckung für Einstellungsnavigation, Suche, Alias-Sprung und Start-App ergänzt

### Verändert
- Oberfläche, Dashboard, Orbit-Sidebar und Seiten-Sichtbarkeit in den gemeinsamen Tab Navigation überführt
- Alte Deep-Links auf den bisherigen Oberfläche-Tab bleiben kompatibel und öffnen Navigation
- Allgemein zeigt jetzt die wichtigsten Verwaltungsbereiche statt ausschließlich der Startseite
- Produkt-, Server- und Web-Version auf 1.0.0 synchronisiert
- Einstellungsdokumentation und Konfigurationsverweise an die neue Tab-Struktur angepasst

### Behoben
- Der irreführende Dark-Mode-Info-Banner aus der Designverwaltung entfernt
- Verschiedene Schreibweisen und Umlaute werden bei der Einstellungssuche normalisiert
- Direkte Sprünge aus Suchtreffern markieren das Ziel und wechseln automatisch in den richtigen Tab
- Start-App-Auswahl bleibt gegen ausgeblendete Seiten geschützt
- Restart-Aktionen sind auch aus Allgemein erreichbar und verwenden denselben bestehenden Dienstfluss

### Gelöscht
- Eigenständigen Oberfläche-Tab als sichtbaren Einstellungsbereich entfernt
- Doppelte Darstellung der Dashboard- und Sidebar-Verwaltung in Oberfläche aufgelöst
- Nicht benötigte Startseitenkarte aus Allgemein entfernt
- Dark-Mode-Hinweistext und das Kennzeichen „DARK ONLY“ entfernt
- Alte, nicht mehr verwendete Appearance-Hinweisstile entfernt

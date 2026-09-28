# [0.97.0] - 2026-08-22

### Erstellt
- Deklarative Plugin-Werkzeugseiten können als eigene Einträge in der linken Sidebar geöffnet werden
- Aktive Plugin-Inhalte unterstützen gemeinsame Seiten, Funktionen, bereinigtes HTML und sandboxed Iframes
- Lokaler Store zeigt installierte Plugins, Aktivierung, Deaktivierung und Deinstallation im selben Flow
- KI-Setup übernimmt zusätzliche Anforderungen und eine verbindliche Neustart-Freigabe in den Prompt
- Isolierter End-to-End-Test deckt Installation, Sidebar, Werkzeugseite, Aktionen und Entfernen ab

### Verändert
- Plugin-Tabs heißen jetzt Allgemein, Eigene Plugins, Installieren und Installierte Plugins
- Plugin-Runtime löst aktive lokale Drafts und Catalog-Plugins ohne Slug-Schatten oder manuelle Seite aus
- KI-Prompt beschreibt Modus, Route, Sidebar, Tests zuerst, Host-Broker und Neustartregeln präziser
- Fokus-Timer dient als sichtbares Sidebar-Werkzeugseiten-Beispiel und folgt der Version 0.97.0
- Produktversion, Server-Standard und kompatible Beispiel-Manifeststände auf 0.97.0 synchronisiert

### Gelöscht
- Irreführende Lifecycle-Bezeichnung aus der Plugin-Navigation entfernt
- Unklare Iframe- und Inhaltsmodus-Kombinationen im KI- und visuellen Maker entfernt
- Statische Placeholder-Erwartung für Plugin-Entrypoints aus dem Aktivierungsfluss entfernt
- Veraltete Annahme, dass ein Browser-Refresh installierte Plugin-Navigation automatisch erzeugt, entfernt
- Unpräzise Abschlussanweisung ohne expliziten KI-Agenten- und Neustarthinweis entfernt

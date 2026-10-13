# [2.4.0] - 2026-10-13

### Erstellt
- Skills-Seite mit drei Gruppen: Globale Regeln, Skills und Hermes-Skills stehen in einem Baum mit Zählern, Suche über alles und Badges für defekte oder beschreibungslose Einträge.
- Hermes-Skills lassen sich direkt verwalten: anlegen mit Kategorie, umbenennen und löschen inklusive aller Verweise.
- Globale Regeln im Baum: die verteilte AGENTS.md und die Hermes-Regeln öffnen sich im selben Editor.
- Preview-Laufzeiten starten erst nach expliziter Befehlsfreigabe: Befehl und Pfad stehen im Dialog, erst nach Bestätigen läuft der Start.

### Verändert
- Skills-Seitenleiste aufgeräumt: kein Pfad unten, kein Kopf oben, dünnere Scrollbar, Dateiname und Skill-Name stehen nebeneinander.
- Skill-Vorschau als zentrierte Leseansicht mit größerer Schrift, der Frontmatter-Block bleibt draußen.
- Git-Leiste auf einen Knopf reduziert: Commiten und Pushen auf GitHub läuft automatisch ab, Fehler mit Log bleiben sichtbar.
- Vier Skills sind zu den Hermes-Skills gezogen: use-t3-code, wrapt-fleet, server-fleet-sync und server-fleet-daily-sync liegen unter devops.
- Landingpage- und Doku-Screenshots erneuert: dunkles Standard-Theme mit Demo-Daten überall, Capybara in der Statusleiste und Dashboard-Hintergrund auf den Übersichts-Motiven.
- Accounts-Liste weiter vereinfacht: Zeilen zeigen nur noch die E-Mail-Adresse, Status und Details stehen im 3-Punkte-Menü unter Information, Aktiv-Button und Aktivieren-Button sind gleich groß, das Menü klappt unten nicht mehr um.
- Account-Menü zweispaltig: Information und Aktionen stehen nebeneinander, das Popup ist breiter statt höher und weicht nach oben aus, wenn unten kein Platz ist.
- Skills-Baum klappt weich auf und zu, auf Touch-Geräten sind alle Ziele finger groß und Aktionen ohne Schweben erreichbar.
- Terminal füllt seinen Bereich randlos: Die Zeichenfläche geht bis an die Terminal-Liste, die Kopfleiste und die Statusleiste; auch geteilte Terminals trennt nur noch der schmale Ziehgriff statt eines breiten schwarzen Streifens.
- Die Terminal-Liste zeigt Ordner als Baum mit Verbindungslinien, weichem Auf- und Zuklappen samt Icon-Wechsel und ruhigen Aktionsknöpfen, die erst beim Überfahren oder Fokus erscheinen.
- Die Vorschau beim Überfahren einer Terminal-Zeile erscheint nach 0,3 Sekunden statt nach einer Sekunde.

### Behoben
- Skills-Editor öffnet keine fehlenden Dateien mehr von allein, weder beim Start noch nach dem Löschen.
- Nicht vorhandene Regeldateien sind im Baum deaktiviert statt anklickbar.
- Integrierte Browser-Fläche in T3 Code verbindet wieder: Der Workbench-Proxy leitet den Browser-Stream (`/api/preview-stream`) samt WebSocket weiter, statt mit 404 zu antworten.
- Scrollen im Terminal springt nicht mehr in den tmux-Kopier-Modus mit gelber Positionsanzeige: Das Rad scrollt den normalen Verlauf, Apps mit eigener Maussteuerung wie OpenCode bleiben unberührt.
- Verbrauchsprognosen nutzen die Anwendungszeit statt der Datenbankzeit und bleiben bei gestellter Systemzeit korrekt.

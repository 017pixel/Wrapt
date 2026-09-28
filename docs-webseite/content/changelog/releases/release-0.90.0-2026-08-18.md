# [0.90.0] - 2026-08-18

### Features

- Einstellungen in Bereiche gegliedert (Allgemein, Oberfläche, Benachrichtigungen, System, Erweiterungen, Werkzeuge, Workspace) mit Tabs, direkt per URL-Hash verlinkbar
- Neue Einstellung „Startseite": Beim Öffnen der Workbench kann statt des Dashboards eine beliebige Hauptseite geladen werden
- Nutzung und Limits verwenden dasselbe Hash-Tab-System wie Einstellungen, synchronisieren beim Öffnen automatisch und zeigen eine vereinfachte Account-/Limitübersicht
- Limitzeilen zeigen Account, Restlimits und Reset-Countdown; ein einheitlicher Detaildialog bündelt Status, Fenster, Accountdaten und Reset-Guthaben auf allen Viewports
- Account-Verbindung ist als kompakter Hinzufügen-Dialog umgesetzt, verwaltete Profile erscheinen in einem responsiven Bento-Raster
- Extensions-Verwaltung in den Einstellungen: lokalen Catalog durchsuchen und installieren
- Installierte Extensions aktivieren, deaktivieren, aktualisieren und deinstallieren
- Permission-Reviews werden direkt nach der Installation zur Freigabe vorgelegt
- Installations-, Update- und Uninstall-Operationen melden Erfolg oder Fehler in der Oberfläche
- Catalog-API liefert eine Revision für konfliktfreie Folgeoperationen
- Produkticons als monochrome Palette vereinheitlicht, UI-Typografie neutralisiert
- \"Open in Editor\" aus T3 Code öffnet den Pfad direkt im code-server der Workbench
- OpenCode Web als eigenes Werkzeug mit User-Unit, Loopback-Proxy, HTML-/WebSocket-Bridge und kompatibler Presence-Anbindung integriert
- Status weiterer T3-Instanzen wird per SSH read-only in die Benachrichtigungen eingebunden
- Konfiguration `t3RemoteSyncs` beschreibt zusätzliche, per SSH erreichbare T3-Quellen

### Behoben

- Dateimanager-Drawer, Backdrop und Kontextmenü überdecken jetzt die Topbar statt darunter zu liegen
- Orbit-Verbindungsgriffe sitzen wieder außerhalb der Resize-Punkte und lassen sich zuverlässig ziehen
- Terminal-Snapshot-Replay verwirft keine Nutzereingaben mehr und sendet sie nach dem Replay nach
- Orbit löst 409-Konflikte mit identischem Serverstand still auf statt dauerhaft ungespeichert zu bleiben
- E2E-Suiten für Dateimanager, Clipboard, Orbit und Cache auf isolierten Testservern stabilisiert
- Terminal-Rendering auf Mobile und Desktop korrigiert, Viewport-Wechsel zwischen Geräten zuverlässig
- Terminal-Reconnect erfasst Snapshots im exakten PTY-Raster und spielt Fullscreen-TUIs in den Alternate Screen zurück; Resize meldet nur noch den Wunsch-Viewport statt den Primary zu übernehmen
- Terminal-Tabs und geparkte Routen bleiben im Hintergrund verbunden: kein Reconnect-Delay, kein Schwarz-Screen und kein Verrutschen des Inhalts beim Werkzeug- oder Tab-Wechsel; die Statuskugel bleibt grün, solange die Session läuft
- Auf Mobile und iPad rendert das Terminal mit 8px-Schrift, damit Fullscreen-TUIs wie OpenCode oder Codex im schmalen Viewport vollständig sichtbar bleiben

### Verändert

- Server-App und API-Routen in fachliche Module aufgeteilt, die zentrale Routensammlung entzerrt
- Terminal-Server und -Client in eigene Module für Session, Prozess, Snapshots und Verbindung zerlegt
- Web-API-Client in fachliche Module nach API-Bereichen gegliedert
- Statusleiste auf Version und Nutzung fokussiert, Projektkontext nur noch in der Topbar
- 400-Zeilen-Limit für handgeschriebene Dateien mit Architektur-Prüfung eingeführt

### Extension-Plattform

- Langfristiges Ziel für eine lokale, serverzentrierte Extension-Plattform festgehalten
- Ausgangszustand von Router, Navigation, Orbit und Serverstart dokumentiert
- Migration in 16 kleine, überprüfbare Phasen gegliedert
- Kompatibilitätsregeln für bestehende Daten, Bookmarks und laufende Sitzungen festgelegt
- Zeitabhängige Usage-Testfixture für dauerhaft reproduzierbare Testläufe stabilisiert
- Extension-First-Boundary erzwungen: Legacy-Contributions hinter einer Built-in-Boundary, direkte Imports durch das Qualitäts-Gate verhindert

### Extension-Plattform-Inventar

- Alle sichtbaren Routen, Navigationen und persistenten Flächen als Migrationsbasis erfasst
- Orbit-, Dashboard-, Settings- und Browserzustände mit ihren Kompatibilitätsgrenzen dokumentiert
- Server-APIs, WebSockets, Proxies, Hintergrunddienste und Datenbanken vollständig inventarisiert
- Sichere Ausgangswerte für Startzeit, Routenwechsel, Speicherbedarf und API-Latenz gemessen
- Migrationsreihenfolge anhand realer Kopplungen und bestehender Runtime-Grenzen priorisiert

### Extension-Plattform-Entscheidungen

- Kernel und sichtbare Extension-Flächen mit klaren Verantwortungen voneinander abgegrenzt
- Serverseitige Autorität für Installation, Berechtigungen und synchronisierte Präferenzen festgelegt
- Lokalen First-Party-Catalog ohne Remote-Registry als einzigen V1-Catalog beschlossen
- Einheitlichen atomaren Installations-, Update-, Rollback- und Deinstallationspfad definiert
- Manifest-, Extension-API- und Workbench-Version als getrennte Verträge festgelegt

### Extension-Contracts

- Eigenes Package für stabile öffentliche Extension-Verträge eingeführt
- Extension- und Contribution-IDs als kleingeschriebene Namespaces validiert
- Manifest V1 und Extension API 1 als unabhängige Versionskonstanten bereitgestellt
- Workbench- und API-Kompatibilität mit kanonischen Semantic Versions und Ranges geprüft
- Build, Typecheck und Tests um das neue Contract-Package erweitert

### Extension-Manifest

- Striktes Grundformat für lokale Extension-Pakete eingeführt
- Kompatibilität mit Workbench und Extension API verbindlich prüfbar gemacht
- Vertrauensstufen für System-, Built-in-, Catalog-, Developer- und Webview-Extensions festgelegt
- Lokale Entrypoints, Icons, README und Changelog gegen unsichere Pfade abgesichert
- Versioniertes JSON Schema für Editoren und künftige Extension-Werkzeuge bereitgestellt

### Extension-Berechtigungen

- 23 stabile Berechtigungen für Projekte, Dateien, Runtimes, Agenten und Systemzugriffe definiert
- Projekt-, Netzwerk-, Prozess-, Secret- und Service-Zugriffe gezielt einschränkbar gemacht
- Globale und eingeschränkte Rechte als verständlich prüfbare Anfragen getrennt
- Risikostufen zentral durch Remote Workplace statt durch Extensions festgelegt
- Doppelte, unbekannte und nicht passende Berechtigungsanfragen werden sicher abgewiesen

### Extension-Aktivierung

- Start, Projekt, Git-Repository und Agent als feste Aktivierungsereignisse definiert
- Commands, Routen, Orbit-Elemente, Events und geplante Jobs als verzögerte Trigger unterstützt
- Referenzen auf eigene Beiträge konsequent an den Extension-Namespace gebunden
- Doppelte, unbekannte und überlange Aktivierungsereignisse werden sicher abgewiesen
- Aktivierungsverträge im versionierten JSON Schema für Werkzeuge verfügbar gemacht

### Extension-Abhängigkeiten

- Pflicht- und optionale Extension-Abhängigkeiten mit stabilen IDs und Semantic-Version-Ranges definiert
- Konflikte mit optionaler Versionsspanne als eindeutige, strikt validierte Einträge ergänzt
- Selbstabhängigkeiten, Selbstkonflikte und widersprüchliche Beziehungen werden sicher abgewiesen
- Abhängigkeits- und Konfliktlisten auf nachvollziehbare Höchstgrößen begrenzt
- Dependency-Verträge im versionierten JSON Schema für Manager, CLI und Werkzeuge bereitgestellt

### Extension-Lifecycle

- 17 eindeutige Zustände für Installation, Aktivierung, Updates und Recovery definiert
- Erlaubte Zustandswechsel zentral und strikt prüfbar gemacht
- Install-, Permission-, Enable-, Disable-, Update- und Uninstall-Pfade abgesichert
- Crash, Quarantäne, Inkompatibilität und fehlgeschlagene Migrationen klar getrennt
- Laufende Operationen für spätere Restart-Recovery und atomare Fortsetzung gekennzeichnet

### Extension-Commands

- Commands als erste ausführbare Contribution Surface im Manifest geöffnet
- Stabile Command IDs mit Titel, Beschreibung und Kategorie definiert
- Fremde Namespaces, doppelte IDs und handlerlose Deklarationen werden abgewiesen
- Command-Aktivierung an ein tatsächlich deklariertes Ziel gebunden
- Command-Verträge im versionierten JSON Schema für künftige Registries bereitgestellt

### Extension-Routen

- Pages und Routes als getrennte, stabil referenzierbare Contributions definiert
- Lokale Pfade und Bookmarks mit sicheren Alias-Regeln abgesichert
- Shell, Persistenz, Prefetch und Projektkontext als einheitliche Metadaten ergänzt
- Doppelte IDs, fehlende Pages und kollidierende URL-Muster werden abgewiesen
- onRoute-Aktivierung an tatsächlich deklarierte Routes gebunden

### Extension-Navigation

- Gemeinsame Navigation Contributions für Desktop und Mobile definiert
- Navigationseinträge an tatsächlich deklarierte Extension-Routen gebunden
- Stabile Gruppen, Reihenfolge und Standardsichtbarkeit als Metadaten ergänzt
- Lokale Extension-Icons und namespaced Runtime-Referenzen sicher getrennt
- Fremde Icon-, Badge- und Route-Referenzen werden abgewiesen

### Extension-Orbit

- Versionierte Orbit Contributions mit stabiler Extension-Identität definiert
- Lokale State-Schemas und bestehende Orbit-Größengrenzen verbindlich gemacht
- Renderer, Inspector, Projektkontext und Verbindungen deklarativ beschreibbar gemacht
- onOrbitNode-Aktivierung an tatsächlich deklarierte Ziele gebunden
- Fehlende Extensions behalten Node State, Revisionen und Backups unverändert

### Extension-Dashboard

- Acht generische Dashboard Contribution-Typen ohne Produktsonderfälle definiert
- Quick Actions an tatsächlich deklarierte Commands gebunden
- Provider, Icons und IDs konsequent auf den Extension-Namespace begrenzt
- Größe, Reihenfolge, Projektkontext und Standardsichtbarkeit als Host-Metadaten ergänzt
- On-Demand-, Intervall- und Realtime-Aktualisierung mit sicheren Grenzen beschrieben

### Extension-Settings

- Schema-driven Settings Sections und eigene Settings Pages als Contributions definiert
- Zehn Feldtypen mit kontrollierten Defaults, Grenzen und Auswahlwerten ergänzt
- Server-, Benutzer- und Projekt-Scope als autoritative Speichergrenzen festgelegt
- Secret-Felder ohne Manifest-Default vom normalen Settings JSON getrennt
- Namespaced Section-, Field-, Page- und Icon-Referenzen strikt validiert

### Extension-Shortcuts

- Plattformübergreifende Keyboard Shortcuts und zweistufige Chords als Contributions definiert
- Shortcut Defaults an tatsächlich deklarierte Commands und stabile IDs gebunden
- Kontrollierte Context Expressions ohne ausführbaren Manifestcode ergänzt
- Editierbare Flächen, Tastaturwiederholung und plattformspezifische Overrides sicher begrenzt
- Sichtbare Konfliktbehandlung ohne stilles Überschreiben als Registry-Vertrag festgelegt

### Extension-Kontextmenüs

- Elf stabile Host-Surfaces und namespaced Extension-Surfaces für Kontextmenüs definiert
- Menüeinträge an tatsächlich deklarierte Commands und kontrollierte Gruppen gebunden
- Deterministische Reihenfolge unabhängig von Dateisystem und Registrierungszeit festgelegt
- Sichtbarkeit über die gemeinsamen strikt typisierten Context Expressions ermöglicht
- Fremde Surfaces, Icons, Context Keys und manifestweite ID-Kollisionen werden abgewiesen

### Extension-Statusleiste

- Text, Status, Zähler, Fortschritt und Commands als kompakte Statusarten definiert
- Linke und rechte Bereiche mit deterministischer Reihenfolge und Prioritäten ergänzt
- Provider, Commands, Icons und Context Keys sicher an eigene Contributions gebunden
- Platzmangel über kontrollierte Compact-Modi ohne Verdrängung geschützter Hostzustände geregelt
- Beliebiges Markup, unkontrolliertes Polling und Statusleisten als alleiniger Fehlerkanal ausgeschlossen

### Extension-Topbar

- Routegebundene Command-Aktionen und hostgerenderte Selector Contributions definiert
- Primäre, sekundäre und reine Overflow-Platzierungen kontrolliert geöffnet
- Icon-, Label- und Compact-Darstellungen mit klaren Platzgrenzen ergänzt
- Routes, Commands, Provider, Icons und Context Keys strikt auf gültige Contributions begrenzt
- Navigation, Breadcrumbs, Recovery-Flächen und beliebige Komponenten unter Hostkontrolle belassen

### Extension-Dateien

- Viewer und Open-With-Commands als sichere File Contributions definiert
- Exakte Endungs-, Dateinamen- und MIME-Matcher ohne Pfade, Globs oder Regex eingeführt
- Detail- und Quick-Look-Viewer auf kontrollierte Text-, Media- und Binary-Kanäle begrenzt
- Viewer verbindlich an UI-Entrypoint und ausdrückliche files.read Permission gebunden
- Dateizugriff, Symlink-Schutz und Schreibaktionen vollständig beim Capability Broker belassen

### Extension-Terminal

- Terminalprofile und Sitzungsaktionen als kontrollierte Contributions definiert
- Profile an hostverwaltete Provider und eine ausdrückliche Terminal-Berechtigung gebunden
- Toolbar, Session-Menü, Session-Liste und mobile Aktionen als feste Flächen geöffnet
- Beliebige Shell-Befehle, Zugangsdaten und direkte PTY-Steuerung aus Manifesten ausgeschlossen
- Laufende Sitzungen, Reconnect, Split und Workspace-Sync vollständig im sicheren Kernel belassen

### Extension-Previews

- Lokale Preview-Ziele und Preview-Aktionen als kontrollierte Contributions definiert
- Lesen und Verwalten von Sessions an getrennte Preview-Berechtigungen gebunden
- Eingebettete, externe und serverseitige Browserdarstellung klar voneinander getrennt
- URLs, Ports, Slots, Storage-Profile und Devserver-Befehle aus Manifesten ausgeschlossen
- Laufende Previews, Devserver, Diagnose, Quarantäne und Storage-Reset im sicheren Kernel belassen

### Extension-Browser

- Hostgerenderte Browser-Tools und Command-basierte Browser-Aktionen als Contributions definiert
- Toolzugriffe auf sieben explizite Browser-Broker-Operationen begrenzt
- Browser-Tools an Entrypoint und hochprivilegierte Browser-Berechtigung gebunden
- URLs, Profile, Cookies, Header, Downloadpfade und freie CDP-Methoden aus Manifesten ausgeschlossen
- Chromium, Sessions, DevTools-Proxy, Downloads und Idle-Cleanup im sicheren Kernel belassen

### Extension-Agent-Tools

- Command- und Provider-basierte Agent Tools als schema-validierte Contributions definiert
- Lokale JSON-Schemas für Eingaben und optionale strukturierte Ergebnisse vorgeschrieben
- Toolregistrierung an Server-Entrypoint und eigene Agent-Tool-Berechtigung gebunden
- Approval Policy auf zentrale Hostentscheidung oder strengere Einzelfreigabe begrenzt
- Prompts, Grants, Shell-Text, Tokens, Session-IDs und ausführbaren Code aus Manifesten ausgeschlossen

### Extension-Agent-Skills

- Lokale SKILL.md-Pakete als versionierte Agent Skill Contributions definiert
- Kollisionsfreie Skill-Namen verbindlich an den normalisierten Extension-Namensraum gebunden
- Codex, Claude Code, OpenCode und Hermes als kontrollierte Ziel-Harnesses festgelegt
- Registrierung an eigene Berechtigung, sichtbare Provenance und getrenntes Enablement gebunden
- Schreibzugriffe auf globale Regeln, User-Skills und fremde Extension-Skills ausgeschlossen

### Extension-Hintergrunddienste

- Serverseitige Background Services als hostverwaltete Provider Contributions definiert
- Health-Prüfungen mit festen Intervall-, Timeout- und Fehlerschwellen begrenzt
- Automatische Restarts auf ein nachvollziehbares Budget mit Zeitfenster und Backoff beschränkt
- Aktivierungszustand, Fehler und Neustartzähler als serverseitig autoritative Fakten festgelegt
- Freie Prozesse, systemd-Units und das Beenden nutzereigener Runtimes aus Manifesten ausgeschlossen

### Extension-Jobs

- Interval-, Cron-, One-shot- und Event-Zeitpläne als Scheduled Job Contributions definiert
- Parallelität und verpasste Läufe mit begrenzten Skip-, Queue- und Catch-up-Policies abgesichert
- Timeout, Retries, Backoff, Idempotenz und Cancellation als Host-Policies festgelegt
- Jobzustand und begrenzte Run History als serverseitig autoritative Daten eingeordnet
- Freie Cron-Daemons, unbegrenzte Queues und ungeprüfte Extension-Timer ausgeschlossen

### Extension-HTTP-RPC

- HTTP-Endpunkte strikt unter dem Extension-API-Namespace und typisierte RPC-Prozeduren definiert
- Request und Response an lokale JSON-Schemas sowie feste Größen- und Timeoutgrenzen gebunden
- Provider, IDs, Methoden und Pfadmuster auf sichere, kollisionsfreie Verträge begrenzt
- Workbench-Identität, Same-Origin, Audit und globale Rate Limits als unveränderliche Hostregeln festgelegt
- Rohe Requests, Replies, Header, Cookies, Redirects, Streams und Core-Routen ausgeschlossen

### Extension-Realtime

- Gerichtete und bidirektionale JSON-Kanäle als typisierte Realtime Contributions definiert
- Benutzer- und Projekt-Scope an zentrale Identity-, Origin- und Ownership-Prüfung gebunden
- Nachrichtengröße, Verbindungen, Nachrichtenrate, Queue und Heartbeat hart begrenzt
- Reliable- und Latest-Delivery mit expliziter Backpressure-Semantik festgelegt
- Rohe WebSockets, Binärframes, eigene Authentifizierung und fremde Runtime-Kanäle ausgeschlossen

### Extension-Benachrichtigungen

- Erweiterbare Notification Sources mit stabilen Source-, Kategorie- und Action-IDs definiert
- Icons an kontrollierte Extension-Referenzen und Actions an deklarierte Commands gebunden
- Transiente, normale und auflösbare Meldungen als hostverwaltete Retention-Klassen festgelegt
- Optionale Deduplizierung mit begrenzten Schlüsseln und zwei Update-Verhalten beschrieben
- Erstellung an `notifications.create` gebunden und freie HTML-, URL- und Push-Ziele ausgeschlossen

### Extension-Themes

- Kontrollierte Theme Contributions mit stabilen IDs und Dark-/Light-Varianten definiert
- Vier Surface-, drei Text-, Akzent- und vier Statusrollen als einzige veränderbare Tokens geöffnet
- Theme-Farben auf opake Hex-RGB-Werte ohne CSS-, Font-, Asset- oder URL-Injection begrenzt
- WCAG-Kontrast, Darstellungsrichtung und unterscheidbare Surface-Rollen direkt validiert
- Systemmodus, PWA-Chrome, Hermes und alle Layout-, Motion- und Accessibility-Tokens beim Host belassen

### Extension-Catalog

- Lokale Catalog Entries mit validiertem Manifest und versioniertem Package Descriptor definiert
- Paketdateien über sichere Pfade, Größen und SHA-256-Integritätswerte vollständig inventarisiert
- Extension-ID, Version, Trust und sichtbare Assets zwischen Manifest und Paket verbindlich abgeglichen
- Revisionsgebundene Offline-Snapshots mit begrenzten, pfadfreien Scan-Problemen eingeführt
- Hostpfade, Download-URLs sowie Git-, GitHub- und npm-Quellen aus Catalog-Verträgen ausgeschlossen

### Extension-Management-Verträge

- Revisionierte Registry-Snapshots und vollständige Extension-Details als Serverwahrheit definiert
- Lifecycle, Versionen, Enablement, Runtime, Health und Operationen als getrennte Fakten modelliert
- Acht Manager-Aktionen mit optimistischer Revision und expliziter Datenaufbewahrung typisiert
- Catalog, Upload und Entwicklerquellen ausschließlich über serverseitige IDs und Hashes referenziert
- Grants auf Manifest-Anfragen begrenzt und öffentliche Fehler konsequent auf redigierte Codes reduziert

### Extension-Frontend-Registry-Plan

- Aktuelle Router-, Loader-, Navigation-, Preference- und Shell-Doppelungen erneut inventarisiert
- Atomare ownergebundene Registries mit Kollision, Revision, Subscription und Dispose beschlossen
- Bestehende Features als unveränderte Legacy Built-in Contributions eingeordnet
- Migration von Pages bis Orbit in acht kleine, überprüfbare Phase-2-Schritte gegliedert
- Bookmarks, LocalStorage, Lazy Chunks, mobile Bedienung und persistente Routen als Exit Gates festgelegt

### Extension-Frontend-Registry-Core

- Öffentliche Extension-Verträge als direkte Web-Workspace-Abhängigkeit eingebunden
- Ownergebundene Contribution-Batches vollständig und atomar ersetzbar gemacht
- Ungültige IDs, fremde Namespaces, doppelte Beiträge und Kollisionen fail-closed abgefangen
- Unveränderliche, deterministisch sortierte Snapshots mit Revision und Subscription bereitgestellt
- Owner-Dispose auf Registry-Bindings begrenzt und bestehende Runtime-Daten unangetastet gelassen

### Extension-Page-Route-Registry

- 23 bestehende Pages und Routes unter 18 stabilen Built-in-Namespaces registriert
- 24 öffentliche URL-Muster samt Galerie-Alias und dynamischen Pfaden vollständig abgebildet
- App Shell und 404 getrennt als geschützte Host-Routen statt öffentlicher Contributions markiert
- Lazy Loader, Stale-Chunk-Recovery, Shell-, Persistenz- und Boundary-Metadaten gebunden
- 18 bisherige Preference-IDs und 21 Prefetch-Präfixe kompatibel weitergeführt

### Erstellt

- Offizielle Hermes-SPA als einzige sichtbare Hermes-Oberfläche in der Workbench
- DeepSeek V4 Flash als Standardmodell für Hermes, Mistral bleibt als Fallback
- Benachrichtigungen, wenn eine geplante Hermes-Aufgabe startet oder eine Freigabe benötigt
- Hermes-Status-, Aufgaben- und Ergebnisübersichten im Orbit
- Route-Bridge für Hermes-Deep-Links zwischen Workbench und offizieller SPA

### Verändert

- Hermes-Seite, Panels und Deep-Links verwenden ausschließlich die offizielle SPA
- Native Chat-, Aufgaben-, Verlauf- und Cron-Flächen der Workbench wurden entfernt
- Hermes-Status und Hintergrundaufgaben bleiben über die Workbench-Integration verfügbar
- Verwaltung, Chat, Cron und Einstellungen laufen über denselben Hermes-SPA-Kontext
- Alte Session- und Verwaltungslinks werden in offizielle Hermes-Routen übersetzt

### Behoben

- T3-Benachrichtigungen öffnen jetzt den richtigen Thread: Die T3-Thread-Route liegt am Root (`/$environmentId/$threadId`), nicht unter dem `/_chat`-Layout — vorher zeigte das Chat-Panel „Not Found" statt der Session aus der Benachrichtigung
- Alte T3-Tiefenlinks mit `/_chat`-Präfix werden beim Öffnen auf die Root-Thread-Route normalisiert
- Hermes-Session- und Verwaltungs-Tiefenlinks öffnen wieder zuverlässig ihr tatsächliches Ziel
- Die mobile Hermes-Navigation liegt ohne Überlagerung in der Daumenzone und hält 44-Pixel-Touchziele ein
- Sessions lassen sich im Verlauf und in der Seitenleiste über einen zugänglichen Bestätigungsdialog löschen

### Preview-System

- Mehrere persistente Projekt-Tabs lassen sich gleichzeitig öffnen, starten und verwalten
- Automatisch erkannte Dienste teilen sich die feste Portpalette konfliktfrei über alle laufenden Projekte
- Tatsächliche Portzuweisungen und das logische Hauptziel bleiben bei Backend-Neustarts erhalten
- Inaktive Tabs zeigen ihren Laufzeitstatus, während nur das aktive Projekt vollständige Logs abruft
- Desktop-Tab-Leiste, mobile Projektauswahl und Sammelaktionen verwenden dieselben laufenden Projektzustände

### Preview-System

- Frontend, Backend, API, WebSocket, Datenbank und Worker werden als gemeinsame Projektlaufzeit erkannt und beaufsichtigt
- Projektports stammen ausschließlich aus der zentralen Palette `1234, 1223, 8000, 8080, 8888, 4444, 1233, 6000, 6060, 4040`
- Laufende Dev-Server werden zuverlässig erkannt; Status und Logs aktualisieren sich live und bleiben nach Workbench-Neustarts sichtbar
- Der Preview Hub zeigt Laufzeit, Dienste, Hauptziel und direkte URL klar getrennt; der neue Tab ist die Primäraktion
- Projektprozesse starten unabhängig von Preview-Slots, überleben Workbench-Neustarts und stellen alte Slot-Origins beim Öffnen automatisch wieder her

### Behoben

- Genehmigte Permission-Reviews aktivieren Extensions mit gültiger Versionsangabe, sodass die Registry-Anzeige nach jeder Freigabe stabil bleibt
- Reload sowie Aktivieren und Deaktivieren laufen über erlaubte Zustandsübergänge, auch für laufende oder im Review wartende Extensions
- Updates, die neue Berechtigungen mitbringen, verlangen ein eigenes Review, statt die Extension still zu aktivieren
- Beschädigte Catalog-Pakete werden beim Scan übersprungen, und Catalog-Fehler liefern klare Statuscodes statt generischer Serverfehler
- Shortcut-Konflikte werden je Plattform erkannt, und der Preview-Watchdog meldet Fehler sauber, ohne den Dienst zu blockieren

---

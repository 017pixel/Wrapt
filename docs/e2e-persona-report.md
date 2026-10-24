# Playwright-Funktionstests mit Personas

Stand: 8. Oktober 2026, Version 2.2.9. Befehle verwenden den Paketmanager des Projekts, pnpm 10.

## Testaufbau

`pnpm test:e2e` startet einen isolierten Server auf `127.0.0.1:19310` und baut die
Web-Ausgabe in einem temporären Verzeichnis. Produktive Assets, Datenbanken,
Nutzer-Previews, Tailscale-Einstellungen und tmux-Sitzungen werden nicht verändert.
Alle Projekte verwenden Chromium, auch die bestehende iPhone-Suite.

Die Persona-Suite nutzt die konfigurierte Worker-Zahl (lokal 75 % der CPUs, in
der CI vier Worker). Notizen, Themes und weitere Einstellungen sind serverweit
gespeichert. Deshalb hat jeder Persona-Worker zusätzlich ein eigenes Backend,
temporäre Config, SQLite-Datei und einen zuvor geprüften freien Portbereich.
Der Build wird geteilt, Seeds werden je Worker einmal angelegt, `storageState`
wird für frische Browserkontexte verwendet. Teardown schließt die Tabs,
entfernt ausschließlich eigene Testnotizen aus der Worker-Datenbank und setzt
die veränderten Servereinstellungen zurück.

Die historischen Fachtests teilen Identitäten und globale Orbit-Dokumente.
Ihr Chromium-Projekt bleibt deshalb innerhalb eines Shards mit einem Worker
seriell. `pnpm test:e2e` verteilt die Spec-Dateien jedoch auf mehrere
vollständig getrennte Shards (lokal standardmäßig bis zu sechs, in der CI sechs
Matrix-Jobs). Jeder Shard hat eigenen Server, eigene Datenbank und einen
eigenen Portblock; Dateien bleiben innerhalb eines Shards zusammen. Das mobile
Bestandsprojekt läuft in einem eigenen Shard ohne die Chromium-Abhängigkeit. Es gibt keine festen
Sleeps oder neuen Skips. Bestehende Zeitprüfungen nutzen die virtuelle
Playwright-Uhr, übrige Pausen wurden durch Zustandsprüfungen ersetzt.
Wartebedingungen verwenden sichtbare Zustände, konkrete HTTP-Antworten und
`expect.poll`.

Lokal gibt es keine Retries, in CI zwei. Traces entstehen beim ersten Retry,
Fehlerscreenshots nur bei Fehlern. Die Suite liefert HTML, List-Ausgabe und den
bestehenden Audit-Report mit Skip-Gründen und Flake-Zählung.
Die Fixture-Aufteilung folgt dem [Playwright-Worker-Modell](https://playwright.dev/docs/test-fixtures).

## Inventur der UI-Routen

Alle folgenden Pfade liegen unter `/wrapt`. Plugins können weitere Routen registrieren.

| Route | Funktionen und Formulare | Sonderzustände |
| --- | --- | --- |
| `/` | Dashboard, Dienste, CPU/RAM/Speicher, letzte Projekte, Limits, Befehle kopieren | keine Projekte, leere Historie, deaktivierte Widgets, Services offline |
| `/orbit` | Canvas, Arbeitsflächen anlegen/umbenennen/entfernen, Notizen, Todos, Snippets, Projekte, Dateien, Galerien, Tools, Preview-Gruppen, Verbindungen, Eigenschaften, Undo/Redo, Zoom | leer, viele Knoten, unsaved, Konflikt, fehlendes Plugin, unerreichbares Tool |
| `/projects` | Projekt- und Pfadsuche, Projekt öffnen, Werkzeuge öffnen | keine Projekte, keine Treffer, ungültiger/unerreichbarer Projektpfad, API-Fehler |
| `/projects/:projectId` | Projektinformationen, Dateien, Werkzeuge, Previews | Projekt fehlt, Verfügbarkeit eingeschränkt |
| `/notizen` | Seitenbaum, Ordner, Favoriten, Unterseiten, Verschieben, Duplizieren, Titel, Symbole, Richtext/Markdown, Slash-Menü, Aufgaben, Tabellen, Formeln, Datei-Upload, Autosave, Suche, Papierkorb und Wiederherstellung | keine Seiten, kein Treffer, große Listen, ungültiger Link, Konflikt, Speicherfehler, offline |
| `/notizen/fenster/:noteId` | einzelne Notiz, Rückkehr zur Übersicht | archivierte Seite, ungültige ID, fehlende Seite |
| `/files` | Dateibaum, Liste/Raster, Suche, Vorschau, Upload, Download, Umbenennen, Verschieben, Kopieren, Löschen | leere Ordner, Zugriff verweigert, nicht unterstützte Vorschau, Konflikte |
| `/ki-skills` | globale Skills/Regeln suchen, erstellen, bearbeiten, speichern, löschen | leer, fehlende Datei, ungültiger Pfad, ungespeicherte Änderungen |
| `/plugins` | Store, lokale Plugins, neuer Draft, Plugin-Verwaltung | leer, fehlerhafte/fehlende Erweiterung, deaktiviert |
| `/plugins/maker` | Name, Slug, Beschreibung, Route, Kategorie, Version, Flächen, Fähigkeiten, Daten-/Aktionsdefinitionen, Blöcke, HTML, Iframe, Code, KI-Prompt, Speichern, Prüfen, Aktivieren/Deaktivieren | ungültiger Slug/Route, fehlende Fähigkeit, Prüfung fehlgeschlagen, Speichern läuft |
| `/plugins/view/:pluginSlug` | aktive Plugin-Oberfläche | unbekannt, inaktiv, Runtime-Fehler |
| `/usage` | Übersicht, Verlauf, Projekte/Modelle, Accounts; Synchronisieren; Provider-/Accountfilter, Sortierung, Warnschwelle, Ansicht; Accounts hinzufügen/aktivieren/entfernen, Anmeldeabläufe | keine Accounts/Daten, eingeschränkter Anbieter, Monitoring aus, Sync läuft/Fehler, Limits erschöpft |
| `/settings` | siehe Einstellungsinventur; Tab-Deep-Links und Suchfunktion | Tippfehler in Suche, keine Treffer, API-Fehler, deaktivierte Optionen, Speichern läuft |
| `/t3-code` | eingebettetes T3, Thread-Deep-Link, Vollbild/extern öffnen | Dienst fehlt/offline, Embedding blockiert |
| `/hermes-agent` | offizielle Hermes-SPA, Chat-/Session-/Verwaltungs-Deep-Link | Hermes aus/offline, nicht installiert |
| `/code-editor` | Editor und Ordner-Deep-Link, extern öffnen | Dienst fehlt/offline, kein passendes Projekt |
| `/previews` | Projekt-Tabs, Ports, Laufzeiten, Preview-Ziele, Geräteansicht, Live-Fenster, Diagnose, Storage-Profile, Reset/Quarantäne | keine Projekte, Port offline, fehlende Session, belegter Slot, Reset nicht bestätigt |
| `/previews/gruppe/:groupId` | Preview-Gruppe | unbekannte Gruppe, fehlender Slot |
| `/previews/fenster/:groupId` | eigenständige Preview-Gruppe | wie Gruppenroute |
| `/previews/live` | Live-Preview-Fenster | kein gültiges Ziel, Dienst nicht erreichbar |
| `/terminal` | Sitzungen, Ordner, Suche, Pin, Teilung, CWD, Tabs, Anlegen/Umbenennen/Schließen/Neustart einer Testsitzung, Wiederanbindung | leer, disconnected, beendet, vier Panes voll, ungültiges CWD |
| `/terminal/fenster/:runtimeId` | eigenständige laufende Sitzung | Sitzung fehlt/beendet |
| `/codex`, `/claude` | CLI-Terminal und Sitzungsauswahl | leer, CLI nicht installiert, Prozess beendet |
| `/opencode` | eingebettete OpenCode-Web-App | Dienst nicht installiert/offline |
| `*` | 404 und Rückkehr | unbekannte Route |

Kompatibilitätsrouten: `/inbox` → `/`, `/workbench` → `/orbit`, `/gallery` → `/files`,
`/orbit/notizen`, `/orbit/previews`, `/plugins/tool/:pluginSlug`.
Proxy-Flächen `/t3` und `/hermes` gehören zu den jeweiligen Fremdanwendungen.

## Einstellungen mit Optionen und Kreuzwirkungen

Globale Einstellungen sind hier mit **G** markiert. „Global“ kann serverweit oder
browserweit gelten. Mehrere Optionen einer fachlichen Gruppe werden gemeinsam geprüft.

| Gruppe | Optionen und Geltung | Ausgelöste Re-Tests |
| --- | --- | --- |
| **G Theme** | T3 Code, T3 Chat, Grove, Ocean, Ember, Iris, Dark Modern, Monokai, Carbon, Signal und eigene Farben; Akzent/-text, Grundfläche, Karte, erhöht, Overlay, Sidebar, Topbar, Bottom-Bar, Text/gedämpft/dezent, Rahmen/stark, Eingabe, Hover, Auswahl, Fokus, Erfolg/Warnung/Fehler/Info; serverweit, Live-Vorschau, explizit speichern | Ember, Grove und T3 Code wählen/speichern/reload; danach alle Hauptseiten und vollständiger Notizen-Lebenszyklus |
| **G Start-App** | alle Hauptseiten; Dashboard als Standard; ausgeblendete Seiten nicht wählbar; browserlokal | Notes wählen, Root-Redirect, direkte Seiten, Notizen; ausgeblendete Projekt-Startseite fällt aufs Dashboard zurück |
| **G Seitensichtbarkeit** | alle 17 Hauptseiten; Einstellungen immer sichtbar; browserlokal | Projekte ausblenden, Reload, Dashboard-Fallback, direkte Route und Notizen weiterhin nutzbar |
| **G Dashboard** | Projektaktivität, Serverstatus, Systemmetriken, Dienste, Laufzeit, Diagnose, Nutzung/Limits, Command Reference ein/aus; Config kann Optionen sperren | Serverstatus ausblenden, Reload, alle Hauptseiten und Notizen |
| **G Orbit-Palette** | 9 Werkzeuge, 4 Preview-Gruppen (1/2/3/6), 13 Blöcke ein/aus | Code-Snippet ausblenden, Arbeitsfläche anlegen/ändern/reload/löschen, alle Hauptseiten und Notizen |
| **G Navigation/Layout** | Sidebar ein-/ausklappen, Gruppen ein-/ausklappen, Reihenfolge und Umordnen; residente Panels/Arbeitsflächen; Layout-Reset | konfigurierte Persona mit anderer Reihenfolge und eingeklappten Gruppen; Layout-Reset mit Erhalt serverseitiger Notizen/Arbeitsflächen |
| **G Kontextmenüs** | global ein/aus, 13 Surfaces; automatisch/manuell bis 3 Schnellaktionen | manuell wählen und global abschalten; alle Hauptseiten, Arbeitsflächen und Notizen |
| **G Statusleiste** | Schrift 10–20 px, Limits immer anzeigen | Schrift erhöhen; konfigurierte Persona mit 20 px und festen Limits; Hauptseiten und Kernaktionen |
| **G Benachrichtigungen** | Server-Push an/aus, Quellen Hermes/T3/OpenCode/Codex/Claude/Terminal/Wrapt/Orbit/Updates; Geräte-Aktivierung/-Deaktivierung/-Test | globalen Push und Terminal-Quelle ändern, Reload, Hauptseiten und Notizen; echte Betriebssystem-Zustellung ausgenommen |
| **G Monitoring** | Codex/OpenCode/Claude getrennt ein/aus; optionale globale Codex-Reset-Historie | Codex deaktivieren, Reload, Nutzung/Dashboard/Notizen; konfigurierte Persona mit allen Monitorings aus |
| **G T3-Kanal** | Stable/Nightly; Downgrade-Bestätigung; Wirksamkeit erst nach Neustart | Nightly speichern und Reload; Hauptseiten/Notizen; kein Dienstneustart oder Paketwechsel |
| **G Easter Eggs** | Maskottchen ein/aus, Größe 0,5–2; Dashboard-Hintergrund ein/aus und 19 Motive | Maskottchen und Hintergrund aktivieren, Reload, Hauptseiten/Notizen; konfigurierte Persona mit Größe 2 |
| **G Nutzung** | Presets Kompakt/Standard/Analyse; Liste/Timeline/beides; Dichte/Accountspalte; Bereiche, Labels, KPIs, Prognosen, Resetdaten, E-Mail, Plan, Anbieter, Aktiv-/Datenstatus; Warnschwelle 10/20/30 %; Provider, aktiv/problematisch/ohne Daten, Accountauswahl, 6 Sortierungen, Gruppierung; 7/30/90/365 Tage/gesamt | kontrollierte Anbieter-Daten, Problem-/Datenfilter, Zahl und Identität der Treffer; 30-%-Schwelle, KPIs, Reload; alle Hauptseiten/Notizen |
| Notizenansicht/Suche | Sidebar 220–420 px, eingeklappt, Baum-/Abschnittzustand, Reihenfolge/Favoriten; Volltext/nur Titel, Seite samt Kindern, Erstellt/Geändert: beliebig/heute/7/30 Tage | normale und maximale Sidebar-Konfiguration in Personas; kombinierter Titel-/Seiten-/Datumsfilter, Ergebniszahlen und danach Kernaktionen |
| **G Workspaces** | Name, URL, Hinzufügen/Entfernen, Serverwechsel; Registry im Browser, Fragmentübergabe | Server hinzufügen, Registry-Persistenz und Navigation prüfen; Hauptseiten/Notizen vor und nach Entfernen; Gegenstelle als kontrollierte Health-Fixture; bestehende Tests wechseln zwischen zwei isolierten Backends |
| **G Erweiterungen** | Installieren, an/aus, Berechtigungen; beeinflussen Seiten, Navigation, Widgets, Menüs und Orbit | lokalen Fokus-Timer installieren, Reload und Navigation prüfen; jeweils aktiv und inaktiv alle Hauptseiten/Notizen; am Ende deinstallieren; keine produktiven Plugins verändern |
| Allgemein/System | Version, Updateprüfung, Update-Prompt; Neustart Frontend/Backend/beides, Installationsbutton/Update der PWA, Sicherheitshinweise | vorhandene Status-/Dialogtests; Updates und Dienstneustarts nicht ausführen |

Sprache und Einheiten sind fest vorgegeben, es gibt dafür keine UI-Einstellung.
Training-/Fitness-Profil, Trainingsberechnung und Sport-Timer sind in Wrapt nicht vorhanden.
Terminal-/Usage-Timer sind Laufzeit-/Anzeigefunktionen, keine globale Nutzeroption.

Die 13 Kontextmenü-Flächen sind Orbit-Projekte, Dateien, Ordner, Orbit-Knoten,
freie Orbit-Fläche, Preview-Tabs/-Gruppen, Terminal-Sidebar, Git, Agent-Sitzungen,
Werkzeuge/Panels, Statusleiste, freie Host-Flächen und Plugins/Extensions.
Nutzung sortiert nach aktiv/niedrigstem Limit, Provider, Accountname, Restlimit,
nächstem Reset oder Status. Anbieter sind Codex, Claude Code, OpenCode Go und alle.
Die Timeline hat zusätzliche Schalter für vergangene Fenster, Prognosen, Jetzt-Linie,
Wochenenden, Reset-Marker, Fensterlabels, Accounts ohne Reset und Legende.
Nicht jede Option eines Bereichs wird einzeln mit jedem anderen Schalter kombiniert.

Formularinventur: Notiztitel und Inhalt, Ordnername, Seitensuche und deren Filter,
Verschieben/Umbenennen, Symbolauswahl, Upload/Download, Arbeitsflächenname,
Canvas-Notiz/To-do/Snippet und Knoteneigenschaften, Dateiname/Pfad/Dateisuche,
Skillname/Pfad/Inhalt, Plugin-Draft und Code-Dateien, Fähigkeiten/Berechtigungen,
Workspace-Name/URL/Verbindungsprüfung, Terminalname/Ordner/CWD/Sitzungssuche,
Accountname/Profilpfad/Anmeldeverfahren, API-/Gerätefehler- und Löschbestätigungen,
Einstellungssuche, Theme-Farben und alle oben aufgeführten Auswahlfelder/Schalter.
Laden, deaktiviertes Absenden, fehlende Berechtigung, ungültige Eingaben und
Bestätigungsdialoge gehören jeweils zu den Sonderzuständen der betreffenden Route.

## Personas

Jede Persona durchläuft dieselben vier Tests: alle Hauptseiten laden ohne
unbehandelte JavaScript-Fehler; Notiz anlegen/ändern/reload/archivieren/wiederherstellen;
Orbit-Arbeitsfläche anlegen/umbenennen/reload/entfernen; Suche mit Treffern und ohne Treffer.

| Persona | Einmaliger Worker-Seed | Besonderheit |
| --- | --- | --- |
| Frisch | 0 Notizen, Standard-Einstellungen, leere Orbit-Daten | Erstbenutzung, leere Listen, Standard-Startseite |
| Normal | 6 Notizen, Ordner und Favoriten; 2 Arbeitsflächen mit je 3 Snippets; Sidebar 300 px | übliche Datenmenge und wenige Anpassungen |
| Heavy | 120 Notizen, Ordner, Favoriten, Unterseiten, Papierkorb; 4 Arbeitsflächen mit insgesamt 80 Snippets | lange Liste und voller Canvas |
| Konfiguriert | 12 Notizen mit Archiv/Favoriten/Unterseite, 2 Arbeitsflächen; Ember, Start-App Notes, andere Sichtbarkeit/Reihenfolge, eingeklappte Sidebar 420 px, Nutzungs-Toggles/Filter/Schwelle 30, Statusschrift 20 px, manuelle/abgeschaltete Kontextmenüs, Monitoring aus, Push an, Maskottchen 2, Hintergrund, Nightly konfiguriert | kombinierte alternative Einstellungen und Extremwerte |

Die konfigurierte Persona ist eine gültige Kombination verschiedener Extremwerte.
Nicht jeder Standard-true-Schalter lässt sich gleichzeitig auf false setzen, ohne
absichtlich alle relevanten Bedienelemente auszublenden. Gezielte Kreuzwirkungstests
prüfen die einzelnen Gruppen zusätzlich und stellen ihren Ausgangszustand wieder her.
Heavy bedeutet viele native Daten, keine Behauptung über wirklich angemeldete KI-Dienste.

## Negativfälle und Grenzen

Neun neue Tests prüfen leeren Titel, zu langen Titel, ungültige API-Eingaben,
leeren Arbeitsflächennamen, Doppelklick und Absenden während eines laufenden
Theme-Speicherns, HTTP-500 mit Wiederholen, Löschen und Browser-Zurück,
Notizen bei 390 px und Offline-Reload mit Rückkehr ins Netz.
Doppelklick und Laden werden durch eine gehaltene HTTP-Antwort gesteuert,
ohne zeitbasierte Pausen. API-Zustand bestätigt UI-Änderungen und Persistenz.

Die PWA cached absichtlich keine privaten Arbeitsdaten oder App-Dokumente.
Der echte Offline-Reload scheitert mit einem Netzwerkfehler; online laden die
zuvor gespeicherten Daten erneut und lassen sich wieder bearbeiten. Ein offline
verfügbares UI, eine dauerhafte Offline-Warteschlange oder Konfliktsync nach
Offline-Bearbeitung sind nicht vorhanden und werden nicht als getestet ausgegeben.

Die Native-Flows verwenden das echte isolierte Backend und SQLite. Einbettbare
Fremd-App-Dokumente sind bei der Hauptseitenprüfung harmlose HTML-Fixtures.
Der separate Nutzungsfiltertest verwendet validierte Anbieter-Fixtures, damit
Ergebniszahlen reproduzierbar sind. Reale OAuth-Anmeldungen, echte KI-Antworten,
Code-Server-Projektdokumente, Push-Zustellung, entfernte Serverwechsel und reale
Preview-Slots gehören nicht zur neuen Persona-Abdeckung. Vorhandene Fachtests
prüfen Teile davon mit ihren eigenen kontrollierten Fixtures.

Nur WebSocket-Abbrüche beim Verlassen einer Seite werden in Erfolgsdurchläufen
als erwartete Transportmeldungen herausgefiltert. `pageerror` wird nie pauschal
ignoriert. Im absichtlichen HTTP-500-/Offline-Test sind ausschließlich die
jeweiligen Netzwerkfehler erlaubt. Alle erfassten Meldungen hängen am Testreport.

## Dateien und Korrekturen

Neu: `e2e/personas.ts`, `persona-seeds.ts`, `server.ts`, `flows.ts`,
`journeys.spec.ts`, `impact.spec.ts`, `negative.spec.ts`, `tsconfig.json` und dieser Report.

Geändert: `playwright.config.ts`, `scripts/start-e2e-server.mjs`,
`tests/e2e/helpers/environment.ts`, `.github/workflows/quality.yml`, `package.json`,
`apps/server/package.json`, `apps/web/package.json`, `docs/hardening.md`,
`CHANGELOG.md`, `README.md`, die Notizen-Komponenten und `apps/web/src/extensions/notesBuiltins.ts`.
Bestehende Wartebedingungen wurden in `crash-report.spec.ts`, `notes-interactions.spec.ts`,
`orbit-cache.spec.ts`, `orbit-performance.spec.ts`, `orbit-ui.spec.ts`,
`settings-management.spec.ts`, `terminal-sidebar-improvements.spec.ts`,
`terminal-v2.spec.ts` und `usage-limits-card.spec.ts` verbessert.
Die parallel entstandenen T3-Proxy-Änderungen gehören nicht zu diesem Auftrag.

Nachgetragene `data-testid`: `notes-workspace`, `note-editor`, `note-save-state`.
Die beiden Produktkorrekturen sind ein maximal 300 Zeichen langer Notiztitel
und der korrekte Sichtbarkeitsalias für Notes, wodurch Start-App-Auswahl und
Seitensichtbarkeit Notes überhaupt anbieten.

## Prüfergebnisse und Artefakte

Endgültiger Standardlauf: **135 bestanden, 0 fehlgeschlagen, 80 übersprungen,
0 Flakes**. Alle **42 neuen Tests** liefen erfolgreich ohne Skip: 16 Persona-
Durchläufe, 17 Einstellungskreuzwirkungen und 9 Negativfälle. Hinzu kommen
85 bestandene Chromium-Bestandsfälle und 8 bestandene mobile Bestandsfälle.

HTML-Messung inklusive Build und Serverstart: **351,882 Sekunden**, etwa
**5 Minuten 52 Sekunden**. Der Audit-Reporter misst nach der Testkollektion
**250,132 Sekunden**. Lokal liefen 36 Worker, entsprechend 50 % der verfügbaren
CPUs. Die beiden längsten neuen Tests mit jeweils zwei kompletten Re-Tests
brauchten 48,6 beziehungsweise 50,9 Sekunden. Build und Typprüfung liefen
teilweise gleichzeitig mit den Unit-Tests und anderen Aufgaben auf dem Host.

| Befehl | Exit-Code | Ergebnis |
| --- | ---: | --- |
| `pnpm test` | 0 | 2.211 Vitest-Tests in 334 Dateien; zusätzlich 2 Launcher-Tests und 1 Doku-Test |
| `pnpm typecheck` | 0 | Extension-Verträge, Verträge, Server, Web und neue E2E-Typprüfung |
| `pnpm exec eslint . --max-warnings=0` | 0 | keine Fehler oder Warnungen |
| `pnpm architecture:file-lines` | 0 | 1.452 Dateien geprüft; neue Module unter 400 Zeilen; vorhandene Baseline-Ausnahmen bleiben ausgewiesen |
| `pnpm test:e2e` | 0 | 135 bestanden, 80 begründete Bestands-Skips, 0 Fehler/Flakes |
| `git diff --check` | 0 | keine Whitespace-Fehler |

Der Chromium-CI-Job ist für jeden PR konfiguriert, einschließlich Browser-Cache
und HTML-/Test-Artefakten. Ein GitHub-CI-Lauf wurde hier nicht ausgelöst; es gab
keinen Commit oder Push. Der bereits vorhandene Script-Eintrag
`test:e2e: playwright test` bleibt erhalten.

Die 80 Skips wurden nicht als bestandene Tests gezählt. 68 historische Fälle
verlangen explizite URL-/Isolationsvariablen, 9 Preview-Fälle eine ausdrücklich
gesetzte Testidentität, 3 Fälle einen passenden Fremddienst. Der vorhandene
Launcher ist isoliert, die historischen Schutzabfragen verlangen zusätzlich
diese Variablen. Sie wurden für diesen Standardlauf nicht verändert.

| Originalbegründung aus dem Audit-Report | Anzahl |
| --- | ---: |
| `Set WRAPT_E2E_URL to an isolated Wrapt test server.` | 48 |
| `Setze WRAPT_E2E_USER auf eine in tailscale.allowedUsers erlaubte Adresse.` | 9 |
| `Diese Tests benötigen eine ausdrücklich isolierte Testinstanz.` | 6 |
| `Set WRAPT_E2E_URL to an isolated Orbit test server.` | 5 |
| `Set WRAPT_E2E_URL to a dedicated isolated Wrapt test server.` | 4 |
| `Orbit-Notes-E2E benötigt einen explizit isolierten Wrapt-Testserver.` | 3 |
| `Ein laufender Code-Server wird in der privaten Instanz geprüft.` | 1 |
| `Set WRAPT_E2E_URL to an isolated production-build server.` | 1 |
| `Kein T3-Backend im E2E-Lauf, nur die Proxy-Verdrahtung ist prüfbar.` | 1 |
| `Setze WRAPT_T3_E2E=true für den Test gegen die laufende T3-Instanz.` | 1 |
| `Set WRAPT_E2E_URL auf einen isolierten Wrapt-Testserver.` | 1 |

Damit sind insbesondere Datei-CRUD, Teile der Terminal-Multi-Device-/Lebenszyklus-
Tests, mehrere ältere Orbit-Mobil-/Resize-Fälle und Plugin-Authoring-/Extension-
Fachfälle in diesem Lauf **nicht** geprüft. Die separate Orbit-/Preview-
Performance-Harness bleibt außerhalb des Standardlaufs. Diese Grenzen sind
zusätzlich zu den oben genannten echten Fremddiensten zu berücksichtigen.

Automatisches Detailprotokoll: `test-results/e2e-summary.json`
und `test-results/e2e-summary.md`; pro Shard liegen sie unter
`test-results/shard-<n>/`. HTML: `playwright-report/index.html` mit Links auf
`playwright-report/shard-<n>/index.html`.
Traces: `test-results/shard-<n>/<testname>/trace.zip`, nur beim ersten Retry;
lokal bei einem vollständig grünen Lauf gibt es daher keine Trace-Dateien.
Worker-Logs: `test-results/shard-<n>/servers/worker-*.log`. Screenshots des mobilen
Durchlaufs hängen im HTML-Report. Über Playwright-MCP wurden separat die
300-Zeichen-Grenze, gespeicherter Titel/Inhalt nach Reload und die 390-px-Ansicht
ohne horizontalen Überlauf geprüft. Temporärer Screenshot:
`/tmp/wrapt-persona-review/notizen-390px.png`.
Alle gestarteten eigenen Testserver wurden beendet; es läuft kein Persona-
Launcher mehr. Es gab keinen Neustart produktiver Dienste und keine mutierenden
Aufrufe gegen Nutzer-Previews, Slots oder tmux-Sitzungen.

Zum Nachvollziehen: `pnpm exec playwright show-report`.
Nur Persona-Projekte: `pnpm test:e2e --project='personas*'`.
Ein Trace lässt sich mit `pnpm exec playwright show-trace <trace.zip>` öffnen.

# Technisches Audit vom 4. Oktober 2026

Stand: Wrapt 2.1.7, Launcher 1.21.1, Dokumentation 0.1.9.
Sichere Korrekturen sind im Arbeitsverzeichnis umgesetzt. Kein Commit, Push,
Produktionsneustart oder Eingriff in Nutzer-Previews.

## Umfang und Architektur

Das Repository wurde insgesamt inventarisiert und mit Referenz-, Import-,
Typ-, Sicherheits- und Konfigurationssuchen geprüft. Verdächtige Pfade wurden
an Aufrufern, Persistenz und Tests verfolgt. Das ist kein formaler Beweis der
Fehlerfreiheit jeder möglichen Ausführung.

| Bereich | Prüfung |
| --- | --- |
| Root, Konfiguration, CI | pnpm-Workspace, Scripts, Buildreihenfolge, Env-Validierung, Qualitätsgates und Architekturregeln |
| apps/server | Fastify-Routen, Identitäten, Same-Origin, WebSockets, SQLite, Notes, Orbit, Dateien, Projekte, Terminals, Previews, Plugins, Extensions, Accounts, Hermes, T3 und Nutzungsadapter |
| apps/web | React-Routen, Zustand/Zustandspersistenz, Query-Caches, Notes/Tiptap, Skills-Editor, Dateimanager, Orbit, Terminal, Preview- und Einstellungsflächen, PWA und Listener |
| packages | Öffentliche Zod-Verträge, Extension-Manifeste, Validierung, generierte Schemas und Modulgrenzen |
| extensions | Builtins, Plugin-Einstiegspunkte und dynamische Registrierung; öffentliche/dynamische Exports erhalten |
| scripts und deploy | Installations-, Update-, Restart-, Deployment-, Test- und Buildskripte, User-Units und Proxy-Konfiguration |
| tools | Desktop-Launcher einschließlich Rust-Quellen, Embedding-Harness und Launcher-UI |
| Landing Page und docs-webseite | Statische Builds, Markdown-Ausgabe, Links, Assets und gemeinsame Design-Tokens |
| Dokumentation und Tests | Projektanweisungen, Architektur, Sicherheitsgrenzen, Unit-/Integrations-/E2E-Tests und Coverage-Gates |

Datenfluss: Der React-Client verwendet geteilte Zod-Verträge für die Fastify-API.
Serverdienste speichern in SQLite und Dateisystemen; WebSockets synchronisieren
Livezustände. Browser-Layouts bleiben lokal persistiert. Externe CLIs und
Dashboards hängen hinter serverseitigen Adaptern und Proxies. Die Architektur
und die bestehenden Grenzen zwischen Client, Server und Integrationen bleiben bestehen.

## Gefundene und behobene Bugs

| Priorität | Befund und Korrektur | Nachweis |
| --- | --- | --- |
| P0 | Multipart konnte übergroße Uploads abschneiden und trotzdem erfolgreich veröffentlichen. Archiv und Dateimanager prüfen nun zusätzlich die Truncation-Markierung und bereinigen Fehler. | Zwei Integrationstests mit echtem Fastify-Multipart-Parser: vorher 201, danach 413, keine Datei/DB-Einträge |
| P1 | Notes lud eigene Speicherbestätigungen erneut in Tiptap. Das setzte Cursor/Undo zurück und konnte neue Eingaben durch einen älteren Parent-Stand ersetzen. Eigene Revisionen werden synchron markiert; offene Drafts und ältere Revisionen werden nicht übernommen. | Reale Editor-/Autosave-Regressionen und schnelle Eingaben mit verzögerter HTTP-Antwort in drei Browsern |
| P1 | Ältere Titelbestätigungen überschrieben neue Titel. Rückkehr zum ursprünglichen Titel während eines offenen Saves wurde nicht gespeichert. Titel behalten ihre ausstehende Fassung, Metadaten-Patches werden serialisiert. | Zwei zusätzliche Titelregressionen |
| P1 | Eingereihte Skill-Saves verwendeten veraltete Revisionen, schrieben nach Konflikten weiter oder ließen Undo während eines Requests ungespeichert. Gemeinsamer Dokumentzustand aktualisiert Revisionen; Konflikte stoppen die Kette; ausstehende Saves werden berücksichtigt. | Drei zusätzliche Autosave-Regressionen |
| P1 | Desktop-Launcher verwendete camelCase-Zugriffe auf eine DOM-Map mit Bindestrichen. Statusanzeige und Aktionen brachen dadurch ab. Schlüssel werden passend normalisiert. | Zwei Node-Tests und Browserprüfung mit isolierter Tauri-Schnittstelle |
| P2 | Späte Dateimanager-Polls setzten neuere Navigation zurück. Nur höhere Revisionen werden übernommen, während eigener Saves keine Remote-Daten. | Store-Regression |
| P2 | Laufende alte Cache-Requests konnten Invalidierungen rückgängig machen. Generationsprüfung und taskbezogenes Cleanup schützen den neuen Cache. | Parallelitäts-/Retry-Tests, inklusive gültigem Wert 0 |
| P2 | Nutzungsadapter konnte nach Monitoringwechsel alte Daten erneut cachen; nach Ausfällen verschwand die Kennzeichnung alter Daten. Refresh und Fehlercache berücksichtigen jetzt die Generation. | Erweiterte CodexBar-Tests |
| P2 | unreadOnly=false und unreadOnly=0 filterten trotzdem auf ungelesen. Explizite Queryvalidierung unterscheidet false/0 und true/1. | Vier API-Regressionen |
| P2 | Bei extern verkürzten Dateien enthielt die Textvorschau aufgefüllte Nullbytes. Nun werden nur tatsächlich gelesene Bytes dekodiert. | Regression mit Dateiänderung zwischen stat und Lesen |
| P2 | Suffix-Range einer leeren Datei erzeugte einen internen Fehler. Nun kontrollierte 416-Antwort. | Range-Regression |
| P2 | Notes-SQLite-Verbindung wurde beim Shutdown nicht geschlossen. Cleanup ergänzt. | Server-/Lifecycle-Prüfungen im Gesamt-Testlauf |
| P2 | Resize-Listener und verzögerte PWA-Registrierung konnten nach Unmount bestehen bleiben. Cleanup beendet Drag-Zustand und Worker-Überwachung. | Drei Lifecycle-Regressionen |
| P2 | Eine leere Markdown-Überschrift brach den Doku-Build ab. Überschriften werden nur nach erfolgreichem Match verarbeitet. | Vorher reproduzierter TypeError, danach erfolgreicher Node-Test und beide statischen Builds |

Die Edge Cases umfassen schnelle Löschungen, Weiterschreiben während Saves,
verspätete Antworten, Rückgängigmachen, parallele Cache-Requests, Konflikte,
Netzwerkfehler, Dateigrößenlimits, leere Dateien und Unmount vor Async-Abschluss.
Normale Abläufe, API-Strukturen und Konfliktentscheidungen bleiben erhalten.

## Security und Datenvalidierung

- Projektdateien prüften Symlinks erst nach rekursivem mkdir. Ein abgelehnter
  Zugriff konnte dadurch bereits externe Verzeichnisse erzeugen. Der nächste
  bestehende kanonische Vorfahr wird nun vor mkdir geprüft. Regression bestätigt,
  dass außerhalb des Projekts kein Verzeichnis entsteht.
- Der öffentliche HTTP-Adressfilter blockiert zusätzlich NAT64 Local-Use
  64:ff9b:1::/48. Ohne diese Sperre konnte eine eingebettete private IPv4-Adresse
  über einen passenden Übersetzungsdienst erreicht werden.
- DOMPurify sowie brace-expansion, fast-uri und ip-address erhalten gezielte
  Sicherheitskorrekturen. Anfangs neun produktive Advisories, anschließend keine
  bekannten Advisories im produktiven oder vollständigen pnpm-Audit.
- Query-Boolean-Coercion durch explizite Validierung ersetzt. Keine any-/Ignore-
  Umgehungen oder deaktivierten Prüfregeln eingeführt.
- Musterprüfung getrackter Dateien auf private Schlüssel, AWS-, GitHub- und
  OpenAI-Tokens ohne Ausgabe von Werten: keine Treffer. Keine Aussage über
  entfernte Git-Historie oder Secrets außerhalb des Repositories.

## Dead Code, Vereinfachungen und Performance

Nach Prüfung direkter Referenzen, Imports, Scripts und Framework-Einstiegspunkte:

- Direkte ungenutzte Dependencies @tiptap/extension-emoji und @xterm/addon-webgl entfernt.
- Elf ungenutzte Icon-Komponenten samt Glyphen und vier ungenutzte Icon-Aliase entfernt.
- Ungenutzte Typen RendererStatus und ClientTerminalMessage entfernt.
- Ungenutzte Helper documentFromStore und languageForName samt Reexport entfernt.
- Dateivorschauen und exklusives Dateiveröffentlichen fachlich aus dem
  FileManagerService ausgelagert. Die geänderten Module bleiben unter 400 Zeilen.
- Redundante URL-Konstruktion vereinfacht.
- Eigene Notes-Saves parsen nicht erneut das gesamte Editor-Dokument.
  Kein Cursor-/Undo-Reset und weniger unnötige Editorarbeit.
- Cache-Invalidierung und Listener-Cleanup vermeiden fehlerhafte Aktualisierung
  und fortbestehende Überwachung. Keine unbelegten Mikrooptimierungen.

Öffentliche Contract-Exports, Routes, dynamische Builtins, Fonts, Assets,
Kompatibilitätsrouten und bestehende Konfigurationen bleiben erhalten.
Keine Dependency-Major-Upgrades, Library-Wechsel oder Datenmigrationen.

## Verifikation

| Prüfung | Ergebnis |
| --- | --- |
| pnpm typecheck | Bestanden, alle vier TypeScript-Pakete |
| pnpm exec eslint . --max-warnings=0 | Bestanden, keine Lintwarnungen |
| pnpm test | 2.111 Tests bestanden: 90 Contracts, 454 Extension-Verträge, 823 Web, 741 Server, 2 Launcher und 1 Doku |
| Coverage | Alle bestehenden Gates bestanden; Server nach letzter Vorschaukorrektur erneut geprüft |
| pnpm architecture:file-lines | Bestanden, 1.404 Dateien geprüft, historische Ausnahmen nicht ausgeweitet |
| pnpm architecture:extensions | Bestanden |
| pnpm build | Bestanden; Frontend-Ausgabe isoliert unter /tmp, produktives Web-dist nicht ersetzt |
| Statische öffentliche Seiten | Doku und Landingpage gebaut |
| pnpm audit und pnpm audit --prod | Keine bekannten Schwachstellen |
| Frozen-Lockfile-Installation | Bestanden |
| Script-Syntax | 22 Shell-, 2 Python- und 31 bestehende JS/MJS-Dateien geprüft; neue JS-Tests zusätzlich ausgeführt |
| Artifact-Retention | 20 isolierte Release-Läufe bestanden |
| Extension-Deployment | Isolierter Neustart, Backup-Restore, Update und Rollback bestanden |
| Qualitätsgates und Plugins-Skill | Beide Prüfungen bestanden |
| Notes-Race-E2E | Chromium, Firefox und WebKit bestanden, keine Flakes |
| Breitere E2E-Auswahl | 43 bestanden, 1 übersprungen, keine Flakes im wiederholten Abschlusslauf |
| Abschließende API-/Dateimanager-E2E | Nach letzter Vorschaukorrektur erneut 15 bestanden, keine Flakes |
| Native Launcher | Build nicht möglich, Cargo/Rust fehlt |

31 zusätzliche Unit-/Integration-/Node-Testfälle und ein neuer E2E-Fall sichern
die Korrekturen. Die breite E2E-Auswahl prüft Notes inklusive Konflikten,
Suche und Workspace, Dateimanager, APIs, Extensions, Plugin-Edge-Cases,
Orbit-Notes-Integration und Nutzungsanzeige. Zusammen mit der Race-Prüfung
sind es 46 erfolgreiche Browserfälle. Der übersprungene Isolationstest gilt
nur für die vom Playwright-Launcher selbst gestartete Instanz; hier wurde
der isolierte Testserver ausdrücklich separat gestartet.

Ein erster breiter Browserlauf hatte einen ERR_NETWORK_CHANGED-Wiederholungsfall.
Der vollständige Wiederholungslauf war ohne Flakes erfolgreich. Ein parallel
zum Contracts-Neubau gestarteter Coverage-Zwischenlauf meldete fehlende
Buildartefakte; nach Abschluss des Builds bestand die sequenzielle Prüfung.
Die Notes-Netzwerkregression blockiert Service Worker ausschließlich im
Testkontext, damit alle Browser die verzögerte Anfrage zuverlässig abfangen.

Die vorhandene Vite-Warnung für Chunks über 500 KB bleibt bestehen, darunter
der Notes-Editor mit etwa 1,24 MB minifiziert. Keine neuen Lint-/Typwarnungen,
keine Warnschwellen, Tests oder Regeln deaktiviert.

## Bewusst erhalten und verbleibende Grenzen

- Features, UX, APIs, SQLite-Schemas, Berechtigungskonzept, Persistenzschlüssel,
  Account-Integration und Nutzer-Previews wurden nicht neu gestaltet.
- Die Workbench ist ein privater Arbeitsplatz mit erlaubten Tailscale-Identitäten.
  Gemeinsame Notes/Orbit-Daten sind bewusst implementiert; keine ungefragte
  Umstellung auf ein anderes Mehrbenutzerkonzept.
- Lokale Dateisystemänderungen zwischen Pfadprüfung und Commit bleiben ein
  TOCTOU-Risiko. Vollständiger Schutz braucht descriptorbasierte Operationen.
  Auch Rename eines Zielverzeichnisses hat keinen portablen exklusiven Node-Modus.
- Skills-Keepalive beim Ausblenden besitzt weiterhin keine bestätigte Antwort.
  Parallelität mit einem bereits laufenden Save und unbekannte Revisionen bleiben
  ein Betriebsrisiko; die etablierte Unload-Semantik wurde konservativ erhalten.
- Dateimetadaten bleiben bei externen Änderungen keine atomare Momentaufnahme.
  Die Textvorschau verarbeitet inzwischen nur tatsächlich gelesene Bytes.
- Hermes-Response-Limit prüft nach arrayBuffer zusätzlich die Größe.
  Ein lokaler Upstream ohne Content-Length kann davor mehr Speicher belegen.
- Preview-Snapshots werden authentifiziert verschlüsselt und serverseitig
  begrenzt erzeugt. Die Brotli-Dekomprimierung besitzt kein eigenes Ausgabelimit;
  dies bleibt ein Härtungskandidat für beschädigte oder lokal manipulierte Daten.
- Historische Dateilängen-Ausnahmen bleiben erhalten; keine Baseline ausgeweitet.
  Große Frontend-Chunks und eine bestehende React-19-Peer-Warnung aus emoji-mart
  bleiben dokumentiert. Kein riskanter UI-/Dependency-Umbau nur für Warnungsfreiheit.
- Native Launcher-Builds sind wegen fehlendem Cargo/Rust nicht ausführbar.
  Rust wurde statisch geprüft; die Tauri-Anbindung im Browser war ein Stub.
- Kein Live-Test echter Hermes-/T3-/Accountwechsel, kein Produktionsrestart,
  keine Tests an Nutzer-Terminals oder Preview-Slots. Nicht sämtliche vorhandenen
  E2E-Szenarien wurden ausgeführt.

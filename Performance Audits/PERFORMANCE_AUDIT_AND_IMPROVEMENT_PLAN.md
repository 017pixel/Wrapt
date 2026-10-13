# Performance Audit and Improvement Plan

## 1. Executive Summary

Audit vom 12.10.2026 für Wrapt 2.2.9. Ergebnis: **23 Maßnahmen, davon 5 mit Priorität P1, 16 mit P2 und 2 mit P3.** P1 betrifft belegte aktuelle Verschwendung oder einen besonders weitreichenden blockierenden Codepfad. P2 folgt danach; P3 erfordert vor einer Umsetzung einen zusätzlichen Belastungsnachweis. Goal vollständig bearbeitet am 12.10.2026: 22 Maßnahmen umgesetzt, M-022 zum Schutz unmittelbarer Crashsicherung begründet verworfen; M-010 mit dokumentiertem Bundle-Zielabstand. Abnahme, Version 2.2.10 und Grenzen: [Umsetzungsbericht](../docs/performance-implementation.md), [finale Messreihe](../docs/performance-verification.md). Der Stand steht bei jeder Maßnahme. Die ursprünglichen Auditmessungen bleiben als Vorherwerte erhalten.
Die größten gemessenen aktuellen Kosten sind das kalte Dashboard im gedrosselten Browser mit 4.636 ms medianem FCP, das Forecast-Ranking mit 94,48 ms SQL-Zeit und die Build-Diagnose mit 18,37 ms sowie 2.938 synchronen Dateiprüfungen je Aufruf. Ein geparkter Notizeditor verursachte drei vollständige Detailrequests in elf Sekunden. Diese Messungen haben unterschiedliche Kontexte und dürfen nicht addiert werden.
Die ersten drei Maßnahmen mit gutem Verhältnis von Nutzen zu Risiko sind M-001, M-002 und M-003: Notizpolling an Sichtbarkeit binden, Build-Dateimetriken wiederverwenden und Hermes-Projektzuordnung ohne Aktivitätsscans durchführen. Anschließend M-007 und M-004 bearbeiten. Die breitesten Risiken liegen bei tmux-Steuerung, Entwurfssicherung, Orbit-Backups und der Aktivierungspause von Live-Werkzeugen.
Vorhandene Optimierungen erhalten: Lazy-Routen, Hover-Prefetch, Brotli/Gzip, immutable Assets, TTL-Caches mit In-flight-Deduplizierung, revisionierte Daten, persistente Iframes, begrenzter Routen-LRU, gemeinsamer Terminaltransport, Delta-Reconnects und höchstens vier warme Terminals. CSS-Übergänge nutzen überwiegend transform/opacity; Reduced Motion ist berücksichtigt. Es wurde kein eigener Animationsfehler nachgewiesen.

## 2. Setup and Method

Untersucht wurden README, Architektur-/Konfigurationsdoku, der ältere Desktop-Performanceplan, Orbit-Messharness, React-/Zustand-/Query-Datenfluss, API-/Proxy-/WebSocket-Schicht, SQLite-Abfragen und Indizes, Sessionzuordnung, Hintergrundjobs, Dateizugriffe, Assets, Rendering und vorhandene Cache-/Retentionregeln. Landingpage, Dokumentationsseite und Tauri-Launcher wurden ergänzend anhand ihrer Quellen/Assets geprüft: Landingpage nutzt Bildgrößen, Lazy Loading und Fontpreload; Launcher schützt sein Statuspolling gegen Überlappung. Doku lädt zunächst ein gemeinsames pages.json, dessen vorhandener Build 723.031 B umfasst; eine bedarfsweise Aufteilung erst nach eigener Browsermessung priorisieren. Der Hauptagent erfasste die Grundstruktur; drei ausdrücklich erlaubte Teilanalysen vertieften Frontend, Backend und Datenbank. Keine Security- oder allgemeine Bugprüfung.
Lokaler Stack: Node v26.5.1, pnpm 10.29.2, React 19.3.0, Vite 8.3.0, TanStack Query 5.103.1, Zustand 5.0.15, Fastify 5.12.5, Tiptap 3.31.3, XYFlow 12.11.6, xterm 6.0.0. CSR mit persistentem Outlet; kein SSR-/CDN-Pfad für die Workbench. Host: Linux, Xeon Gold 6150, 72 logische CPUs, rund 188 GiB RAM. Das ist keine typische Handyhardware.
Alle schreibenden Diagnoseanteile liefen unter `/tmp/wrapt-performance-audit-0a_rsj6z/`: kopierte Runtime, eigener Frontend-Build, eigene SQLite, eigene E2E-Konfiguration und Port 23100 mit freien Begleitports. Abhängigkeiten wurden lesend verlinkt. `vite build --config vite.audit.config.ts --configLoader runner` nutzte nur dort einen temporären Reporting-Plugin; `WRAPT_E2E_WEB_OUT_DIR` zeigte auf die temporäre Ausgabe. Danach lief das unveränderte Kompressionsscript. Kein Build oder Neustart der aktiven Workbench.
Die Testinstanz startete mit `WRAPT_E2E_ROOT=<temp>/server-data WRAPT_E2E_KEEP_ROOT=true WRAPT_E2E_PORT=23100 WRAPT_E2E_WEB_OUT_DIR=<temp>/web-dist LOG_LEVEL=silent API_RATE_LIMIT_MAX=10000 node scripts/start-e2e-server.mjs`, aus der kopierten Runtime. Backend-Artefakte wurden aus dem vorhandenen Build kopiert und nicht neu kompiliert; die Backendbefunde beziehen sich zusätzlich direkt auf aktuellen Quellcode. Der neue Web-Einstieg hat denselben Hash wie der vorhandene Produktionsbuild.
Browserprüfung ausschließlich mit Playwright-MCP: navigate, snapshot, dann fokussierte Aktionen. Chromium 151.0.7922.34, frischer Browserkontext je Lauf, Service Worker blockiert, kein HTTP-Cache-Warmstart. Je drei Läufe: Desktop 1440×960 ohne Drosselung und mobil 390×844/DPR 1 mit CPU-Faktor 4 und CDP-Konfiguration 1,6 Mbit/s Downstream, 0,75 Mbit/s Upstream, 150 ms Latenz. PerformanceObserver erfasste FCP/LCP, Layoutverschiebungen und Long Tasks bis vier Sekunden nach dem aktiven Routenmount. Die HTML-TTFB blieb bei rund 4–6 ms; das konfigurierte CDP-Netzprofil ist deshalb keine gemessene Tailscale-/WAN-Rundlaufzeit. Mobile Resultate sind synthetische Browserprofile.
SQLite wurde live ausschließlich über `sqlite3.connect('file:<path>?mode=ro', uri=True, timeout=1)` gelesen: Counts, Größenaggregate, EXPLAIN und fünf wiederholte lesende Querymessungen mit `perf_counter`. Keine Inhalte ausgegeben, keine Migration, kein VACUUM oder Checkpoint. Schreibende Vergleichsbenchmarks liefen ausschließlich in `:memory:`. Originale Serverdienste wurden nicht unisoliert importiert, weil settings.ts beim Import Dateimodi setzt. Produktive Projekt-/Hermes-GETs wurden vermieden, weil Discovery Registryeinträge schreiben kann.
Frontend-Mikrobenchmarks nutzten unveränderte Funktionen, deterministische Raster-/Textseeds, React-Production-SSR nur als Renderkostendiagnose sowie In-memory-QueryObserver. Reproduktionsscript: `/tmp/wrapt-performance-audit-frontend-bench.mjs`; Befehl aus Projektroot: `NODE_ENV=production node --import ./apps/server/node_modules/tsx/dist/loader.mjs /tmp/wrapt-performance-audit-frontend-bench.mjs`. Bei verlorenem Temp-Artefakt die unten genannten Szenarien in einer neuen temporären Fixture rekonstruieren. Kein SSR-Netzwerkpayload oder Browser-INP aus diesen Messungen ableiten.
`pnpm typecheck` bestand. Tests mit Snapshots/Coverage und der 20-Minuten-Orbit-Harness wurden nicht im aktiven Checkout ausgeführt. Nicht gemessen: reale Geräte/Tailscale, INP, GPU-/Scroll-/Pinch-Frametiming, Langzeit-Heap, produktive Schreibkonkurrenz, echte Preview-Starts, SSH-Latenzen, Tauri-/öffentliche Doku-/Landingpage-Laufzeit und Last innerhalb der externen T3-/Hermes-/OpenCode-/code-server-Anwendungen. Aktive Nutzer-Previews und private Chats wurden nicht als Testmaterial verwendet.
Primärreferenzen für vorgeschlagene APIs: [Node-Prozesse und Event Loop](https://nodejs.org/api/child_process.html), [positionsbezogene Dateizugriffe](https://nodejs.org/api/fs.html), [Query-Aktivierung und Refetch](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery), [Vite-Code-Splitting](https://vite.dev/guide/features.html), [SQLite-Abfrageplanung](https://sqlite.org/queryplanner.html). Lokale Typen und vorhandene Projekt-APIs haben bei der Umsetzung Vorrang. Referenzen begründen APIs, nicht die gemessenen Projektwerte.

## 3. Measurements

Alle Byteangaben sind dezimal. Browserwerte sind drei kalte Läufe mit warmem Server-/OS-Dateicache. Die Spalte Metrik unterscheidet genau zwischen aktueller Messung, isoliertem Vergleich und synthetischer Skalierung.

| Aktion und Kontext | Metrik / Vorher-Wert | Aussagegrenze |
| --- | --- | --- |
| Dashboard, Desktop, lokaler isolierter Server | FCP/LCP 520 ms Median, 508–524 ms; CLS 0,0949–0,0966; Long Tasks 100–136 ms | Default-Dashboard mit Dummy-/Hostmetriken, keine Interaktion |
| Dashboard, mobiles CDP-Profil | FCP/LCP 4.636 ms Median, 4.592–4.704 ms; CLS 0,1427; längster Task 510–560 ms | CPU-/Netzemulation, keine reale Handy-/WAN-Messung |
| Dashboard, beide Profile, bis Beobachtungsende | 44 JS-Ressourcen, 1.081.907 B dekomprimiert / 373.321 B Brotli; CSS-Hauptdatei 539.352 B / 110.537 B Brotli | Einschließlich nachgeladenem App-Code, ohne Notizeditor |
| Isolierter Vite-Build | 1,44 s; statischer Einstieg inkl. Imports 26 Chunks / 767.233 B | Ohne TypeScript-, Backend-, Icon- und Gesamtbuildzeit |
| Notizeditor-Chunk | 1.242.746 B / 383.746 B Brotli; Terminal 357.506 B; Orbit 315.196 B | Routebezogene Kosten, nicht Dashboard-Erstlast |
| Auslieferung von Einstieg und Editor | br/gzip/identity korrekt; immutable ein Jahr, Vary: accept-encoding | Kein fehlender Kompressions-/Assetcache-Befund |
| Notiz öffnen, danach Dashboard, isoliert | Detailrequests nach 3.187, 6.196 und 9.206 ms bei geparkter Route | Eine unterschiedliche Notiz; auf 20/min hochgerechnet |
| Build-Dateimetriken, vorhandenes dist, 5 Warmups / 20 Samples | Median 18,37 ms, p95 21,80 ms, 2.938 statSync-Aufrufe; 3 Releases / 742 Dateien | Reiner unveränderter Reader, keine gesamte HTTP-Route |
| Live-SQLite, Forecast-Ranking über 141.625 Snapshots | Median 94,48 ms, 90,68–146,79 ms; 6.877 aktive Eingaben / 524 Ausgaben | COUNT um Windowquery, ohne finalen Sort/JS/HTTP |
| Live-SQLite, Suche nach >400 Tage alten Snapshots | Median 13,49 ms bei 0 Treffern; tatsächlicher DELETE-Plan: Vollscan | Nur SELECT ausgeführt, kein produktiver DELETE |
| Snapshot-Indizes, 141.625 Dummyzeilen / 5 Läufe | Ranking 59,72 → 14,48 ms; Retentions-COUNT 8,46 → 0,003 ms | In-memory-Vergleich, kein Live-Nachher-Wert |
| Query-Invalidierung, 10 aktive Detailkeys + Liste | Ein Save erzeugt 11 Folgefetches, einschließlich gespeichertem Detail | In-memory-queryFn, keine elf gemessenen HTTP-Requests |
| Sidebar, 1.000 Dummy-Notizen / 10 Ordner / 0 geöffnete Notizknoten | 2.000 TreeRows; SSR Median 137,39 ms / p95 188,62 ms | React-Production-SSR, kein CSR-Commit oder INP |
| Orbit, 600 Nodes / 1.200 gelabelte Edges, 5 Warmups / 20 Samples | Kontrolllauf Vollrunde 19,19–19,99 ms Median / 20,62–22,65 ms p95 | Reine Labelberechnung; erster 73-ms-Ausreißer nicht reproduziert |
| Markdown, 2.500 Absätze / 623.888 Zeichen, 10 Warmups / 30 Samples | Kontrolllauf Serialize 5,47 ms Median / 5,88 ms p95 | Ohne getJSON, DOM, Tippen oder mobile CPU |
| Notizliste, 1.000 Dummy-Notizen à 16 KiB | SQL + identische Excerpt-Ableitung 217,86 → 1,51 ms | Live nur 26 Notizen / 122.133 B Inhalt; Skalierungsvergleich |
| Audit, 10.000 Dummyzeilen / 5 Läufe | Retention 5,82 → 0,128 ms; volle SQL/JSON/SHA256-Prüfung 66,91 ms | Live 3.701 Zeilen; kein gemessener Live-Verify-Anteil |
| Orbit-Recovery, 600 Snippets à 5.000 ASCII-Zeichen | 3.460.257 B JSON; Kontrolllauf stringify 4,85 ms Median / 5,44 ms p95 | Browser-localStorage-/IPC-Kosten noch offen |

## 4. Detailed Measures

### [M-001] Polling geparkter Notizen anhalten (P1, gemessen)
- Umsetzungsstand: Implementiert und browsergeprüft. Drei Observer-Tests: null Polls über 60 s, Cacheerhalt, Revalidierung und sichtbarer weiterer Observer. Playwright: mindestens 60 s null Detailreads bei weiter gemountetem Editor, gespeicherter Text bleibt und Rückkehr löst genau einen Read aus. Konfliktfälle im Savepfad bleiben geprüft.
- Problem: NotesWorkspace und NoteOrbitNode aktivieren Detailqueries anhand der Notiz-ID; die Sichtbarkeit der persistent gemounteten Route fließt nicht ein.
- Hinweise oder Messwerte: Drei volle Reads in elf Sekunden nach dem Wechsel zum Dashboard. Der 3-Sekunden-Takt entspricht 20 Reads/min je unterschiedlicher Notiz. Gleiche Querykeys werden bereits dedupliziert.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/NotesWorkspace.tsx:37`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/NoteOrbitNode.tsx:38`, `/home/bbecker/projects/Wrapt/apps/web/src/lib/queryOptions.ts:170`, `/home/bbecker/projects/Wrapt/apps/web/src/lib/routeActivity.tsx`.
- Vorgeschlagene Änderung: RouteActivity in beide Verbraucher aufnehmen; Detailquery nur bei aktiver Route und gültiger ID aktivieren. Bei Rückkehr sofort stale Daten prüfen; Cache und Editorinstanz behalten.
- Implementierungsdetails: Keys `['notes','detail',id]` erhalten. Ein sichtbarer weiterer Observer hält dieselbe Notiz aktuell. Saves, Konfliktbehandlung und Flush laufen unabhängig von der Pollpause weiter. Keine Pause allein aufgrund verlorenen Tastaturfokus.
- Erwarteter Nutzen: 20 periodische Requests/min weniger je nur geparkt beobachteter ID; Ziel null solche Reads. HTTP-/JSON-/React-Arbeit sinkt, die genaue CPUersparnis ist noch offen.
- Risiken und mögliche Regressionen: Alte Fremdänderung bei Rückkehr oder versehentlich gestoppter Save; beides durch sofortige Revalidierung und getrennte Save-Steuerung vermeiden.
- Abhängigkeiten: Keine; M-011 ergänzt die Wirkung.
- Umfang: Small.
- Risiko: Low.
- Validierung: Vorher/nachher 60 Sekunden Netztrace mit Notes → Dashboard und Orbit → Dashboard, danach Fremdänderung und Rückkehr. Null geparkte Detailpolls ohne sichtbaren Observer, gleiche Revision/Entwürfe und laufende Saves.

### [M-002] Build-Dateimetriken anhand der Releaseversion wiederverwenden (P1, gemessen)
- Umsetzungsstand: Implementiert und abgenommen: asynchroner indexgebundener Singleflight, deduplizierte Stats, 60-s-TTL und expliziter Refresh. Drei Releases/742 Dateien, 20 Samples: Reader 20,70→0,069 ms Median, warmer p95 0,535 ms (<1 ms); Health-p95 47,47→1,81 ms, WS-p95 23,19→0,82 ms, EL-p99 24,23→1,69 ms. Kalter Reader 20,44 ms separat. Fünf Tests sichern einen Indexstat bei warmem Read, parallele Deduplizierung, Wechsel, fehlende Varianten, Retention, beschädigten Index und Refresh. Nur isolierte Fixture verändert.
- Problem: Jede operative Diagnose liest den Releaseindex und prüft alle Assets samt br/gz-Varianten synchron; Dateien gemeinsamer Releases werden mehrfach stattiert, danach Größen nochmals gelesen.
- Hinweise oder Messwerte: Reader gegen bestehendes dist: 2.938 statSync-Aufrufe, 18,37 ms Median / 21,80 ms p95. Default-Queryintervall fünf Sekunden; dieser Aufwand blockiert dabei den Serverthread.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/observability/web-build-metrics.ts:21`, `/home/bbecker/projects/Wrapt/apps/server/src/app/routes.ts:71`, `/home/bbecker/projects/Wrapt/apps/web/src/lib/queryOptions.ts:25`, `/home/bbecker/projects/Wrapt/apps/web/scripts/compress-dist.mjs`.
- Vorgeschlagene Änderung: Zuerst Kandidaten deduplizieren und Statgröße je Datei einmal erfassen. Danach einen einzigen asynchronen, deduplizierten Snapshot je dist/Releaseindex-Version halten; laufende HTTP-/Event-Loop-Metriken weiterhin frisch zusammensetzen.
- Implementierungsdetails: Key aus dist-Pfad und Releaseindex-mtime/Größe, besser vorhandener Release-ID; atomarer Indexwechsel invalidiert. 60 Sekunden Kontroll-TTL decken manuelle Dateilöschungen ab. Erzwungener Diagnose-Refresh leert nur diesen Cache; neue Konfiguration zentral definieren. Keine Cachebindung an alle dynamischen Diagnosedaten.
- Erwarteter Nutzen: Im normalen unveränderten Build ein Indexcheck statt tausender Stats pro Poll; rund 18 ms aktuelle Readerarbeit entfallen bei Cachetreffern. Ziel warmer Reader <1 ms; kalten Aufwand separat messen.
- Risiken und mögliche Regressionen: Retentionzählung kurz veraltet nach manueller Löschung; Kontroll-TTL, expliziter Refresh und Fehlerinvalidierung begrenzen das. Während atomarem Build nur vollständige Indexstände veröffentlichen.
- Abhängigkeiten: Keine.
- Umfang: Small.
- Risiko: Low.
- Validierung: Derselbe 3-Release-Bestand, 20 Samples, Statanzahl und /operational-metrics parallel zu WebSocket-Echo vergleichen. Buildindexwechsel, fehlende br/gz-Datei, Retention, manueller Refresh und beschädigter Index prüfen.

### [M-003] Hermes-Sessions ohne Projektaktivität zuordnen (P2, sehr wahrscheinlicher Codebefund)
- Umsetzungsstand: Implementiert und geprüft. Referenztyp auf ID/Pfad beschränkt, listReferences statt list, parallele HTTP-/Referenzreads. Tests für bekannte/unbekannte cwd, Suche und Summary grün; Activitycallback bei Referenzreads unaufgerufen.
- Problem: Hermes benötigt ID und Pfad für cwd-Zuordnung, erhält aber die volle Projektliste inklusive kalter Git-/Dateiaktivitätsanalyse.
- Hinweise oder Messwerte: Dependencycallback ruft projects.list() auf. Bestehender Aktivitätsscan darf je Projekt bis 20.000 Dateien/Tiefe acht prüfen und ist fünf Minuten gecacht; unnötige kalte Arbeit ist durch den Aufrufpfad belegt, Latenz nicht gemessen.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/app/dependencies.ts:249`, `/home/bbecker/projects/Wrapt/apps/server/src/hermes/session-service.ts:36`, `/home/bbecker/projects/Wrapt/apps/server/src/services/projectService.ts:207`, `/home/bbecker/projects/Wrapt/apps/server/src/projects/activity-service.ts:50`.
- Vorgeschlagene Änderung: Callback auf vorhandenes listReferences() umstellen, internen Typ auf benötigte Referenzfelder reduzieren. Hermes-HTTP-Read und Projektreferenzen parallel starten; Summarypfad ebenfalls anpassen.
- Implementierungsdetails: Bestehende IDs, cwd-Zuordnung, kurze Referenz-TTL und Registrierungsinvalidierung erhalten. Kein zusätzlicher Cache nötig; M-004 verbessert die gemeinsame Quelle später.
- Erwarteter Nutzen: Null Aktivitätsscans durch Sessionnormalisierung. Entfallene Dateiarbeit hängt vom Projektbestand ab; keine unbelegte Sekundenersparnis angeben.
- Risiken und mögliche Regressionen: Projektzuordnung durch verlorene Referenzfelder; Typprüfung und dieselben Normalisierungsfälle sichern sie ab.
- Abhängigkeiten: Keine; vor M-004 separat umsetzbar.
- Umfang: Small.
- Risiko: Low.
- Validierung: Kalter Aktivitätscache, zehn temporäre Projekte mit vielen Dateien, Fake-Hermesclient. Stat-/Git-Aufrufzahl muss null sein; bekannte/unklare cwd, Suche und getSessionSummary liefern dieselben Zuordnungen.

### [M-004] Projekt-Discovery für Liste, Referenzen und Details teilen (P2, sehr wahrscheinlicher Codebefund)
- Umsetzungsstand: Implementiert und geprüft. Gemeinsame Discovery/Registryindex ohne Neuregistrierung bekannter Pfade; Touch invalidiert nur Liste. 10/100/1.000 temporäre Ordner mit zehn Details plus Liste/Referenzen: nach warmem Discoverylauf null zusätzliche Registryreads/-registrierungen; TTL, IDs und frische Verfügbarkeit durch acht Tests gesichert.
- Problem: list/listReferences entdecken Projekte in getrennten Caches; get() entdeckt bei jedem Aufruf erneut. Bekannte Ordner werden erneut gesucht, registriert und gesucht.
- Hinweise oder Messwerte: Pro nicht fest konfiguriertem Projekt ungefähr drei Registry-SQL-Aufrufe je Discovery; parallele Detailreads vervielfachen Directory-/SQL-Arbeit. touch invalidiert auch unveränderte Referenzen.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/services/projectService.ts:53`, `/home/bbecker/projects/Wrapt/apps/server/src/services/projectService.ts:210`, `/home/bbecker/projects/Wrapt/apps/server/src/projects/registry-database.ts:69`, `/home/bbecker/projects/Wrapt/apps/server/src/utils/cache.ts`.
- Vorgeschlagene Änderung: Eine gemeinsame Metadaten-Discovery mit vorhandener TTL/In-flight-Deduplizierung unter list, listReferences und get legen. Registryeinträge einmal indizieren, nur unbekannte Pfade registrieren; Details/Verfügbarkeit weiterhin passend aktuell berechnen.
- Implementierungsdetails: Key aus Projektroot und Konfigurationsgeneration; bestehende kurze TTL als Rückfall für externe Ordneränderungen. Registrierung/Konfigurationsänderung invalidiert Discovery und Ableitungen; touch nur Aktivität/Listenreihenfolge.
- Erwarteter Nutzen: Ein Directorylauf pro TTL statt je Detailrequest; keine wiederholten Inserts für bekannte Pfade. Zehn gleichzeitige Details sollen dieselbe Discovery verwenden.
- Risiken und mögliche Regressionen: Neue oder verschwundene Ordner erscheinen verspätet; bestehende TTL und explizite Invalidierung begrenzen das. availability nicht unbefristet aus Metadaten übernehmen.
- Abhängigkeiten: Keine; M-003 muss darauf nicht warten.
- Umfang: Medium.
- Risiko: Low.
- Validierung: 10/100/1.000 temporäre Ordner, zehn parallele Details plus Liste/Referenzen; Directory- und SQLzählung vor/nach. Externe Änderungen, Registrierung, Touch-Sortierung, IDs und Konfigurationsreload testen.

### [M-005] Codex-Chatdateien inkrementell und asynchron lesen (P1, sehr wahrscheinlicher Codebefund)
- Umsetzungsstand: Implementiert und abgenommen: begrenzte asynchrone Bytecursor-Reads, UTF-8/Teilzeilen/Rotation/Truncation/T3-Ausschluss und Shutdown abgesichert. 1/10/100-MB-Fixtures lesen nur Zuwachs. Bei 1.000/10.000 historischen Dateien: 20 warme Polls, jeweils 12.240 B für drei 4-KiB-Zuwächse, Median 6,81/6,37 ms, 60 korrekte Events. Cold Discovery 52,8/250,2 ms; seltene Cold-EL-Spitze 76,5 ms bleibt dokumentiert. Fünf Sekunden wartender Read lässt 20 HTTP-/WS-Paare sofort durch; zehn Reader-Tests grün.
- Problem: Der Poll globbt/stattet historische JSONL synchron. Bei Änderung wird die ganze Datei gelesen, anschließend erst der bereits bekannte Prefix abgeschnitten; T3-Verläufe werden spät ausgeschlossen.
- Hinweise oder Messwerte: Fünf-Sekunden-Defaultpoll, Auswahl auf jüngste 200 erst nach Metadatenarbeit. Ein 50-MB-File mit 4 KiB neuem Text verursacht rechnerisch einen 50-MB-Read; dies ist eine Szenariorechnung, keine private Live-Dateimessung.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/notifications/agent-session-sync.ts:286`, `/home/bbecker/projects/Wrapt/apps/server/src/notifications/agent-session-sync.ts:305`, `/home/bbecker/projects/Wrapt/apps/server/src/config/wrapt-config.ts:82`.
- Vorgeschlagene Änderung: Positionsbezogene fs.promises-Reads ab Offset in begrenzten Blöcken einführen, erste Metazeile separat merken und bekannte T3-Dateien früh ausschließen. Danach historische Discovery seltener, aktive Dateiliste häufiger abgleichen.
- Implementierungsdetails: Cachekey aus Pfad und Dateiidentität/Inode; Rotation, Truncation und Replacement invalidieren Offset/Decoder. Unvollständige UTF-8-/JSONL-Reste behalten. Begrenzte Parallelität, Abort beim Shutdown und periodische Voll-Discovery sichern neue Dateien.
- Erwarteter Nutzen: Lesebytes geänderter großer Dateien proportional zum Zuwachs; große Vollbufferallokationen entfallen. Pollzeit/RSS/Event-Loop-Gewinn erst mit Fixture messen.
- Risiken und mögliche Regressionen: Übersehene Teilzeilen, neue Dateien oder doppelte Benachrichtigungen; Cursor und Benachrichtigungsdedup beibehalten.
- Abhängigkeiten: Keine.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: 1/10/100-MB-Dummydateien mit 4-KiB-Zuwachs sowie 1.000/10.000 Historienfiles. Byte-/Poll-/RSS-/Event-Loop-Messung, Teilzeile/Unicode/Rotation/Truncation/Neustartbaseline/T3-Ausschluss und identische Events prüfen.

### [M-006] tmux-Steuerung vom Serverthread lösen (P1, sehr wahrscheinlicher Codebefund)
- Umsetzungsstand: Implementiert und abgenommen: asynchrone, geordnete tmux-Steuerung mit eigenem Fake-Runner, unveränderte Sockets/Units/Publikation. 1/4/12 Setups mit je 5 s Wartezeit bleiben seriell; reale HTTP/WS-Paare: Health-p95 2,11/1,19/1,11 ms, WS-p95 0,93/0,60/0,56 ms, EL-p99 unter 2 ms. 20 Watchdogticks je Fixture ergeben eine statt 5/17/49 Abfragen pro Tick. 35 Previewtests, 112 Terminaltests und drei eigene Native-/Resume-Socketfixtures grün; Async-Snapshot-/Detach-/Epoch- und WS-Reihenfolgeregressionen zusätzlich abgesichert. Keine echten Nutzer-Previews gestartet oder verändert.
- Problem: spawnSync blockiert innerhalb äußerer async-Methoden den HTTP-/WebSocket-Thread. Preview-Setup wartet synchron auf tmux wait-for, der Watchdog startet viele Einzelbefehle.
- Hinweise oder Messwerte: Setup-Timeout standardmäßig 15 Sekunden, konfigurierbar bis 60; kein gemessener tatsächlicher 15-Sekunden-Stall. Laufender Watchdog benötigt ungefähr 1+4N Unterprozesse je zehn Sekunden. tickRunning verhindert Überlappung, keine Blockade.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/previews/DevServerManager.ts:90`, `/home/bbecker/projects/Wrapt/apps/server/src/previews/DevServerManager.ts:455`, `/home/bbecker/projects/Wrapt/apps/server/src/terminal/TmuxSupervisor.ts:113`, `/home/bbecker/projects/Wrapt/apps/server/src/terminal/Manager.ts:254`.
- Vorgeschlagene Änderung: Zuerst Setup über asynchronen bestehenden Prozessrunner ausführen und überall awaiten. Danach Watchdog/Statusabfragen asynchron bündeln, mehrere Optionen über tmux-Formatstrings einmal lesen. Terminal-Supervisor als separaten Umsetzungsschritt migrieren.
- Implementierungsdetails: Interne Runner-Signaturen und alle Aufrufer zusammen ändern; Queue, dedizierte Sockets, Timeout/Abort, Restartlimits, Publicationrevision und Shutdown erhalten. Keine pauschale parallele Mutation derselben Session.
- Erwarteter Nutzen: HTTP/WS bleiben während langer Prozesswartezeit bedienbar; Ziel höchstens ein bis zwei Sammelabfragen im normalen Tick. Reale Millisekunden vor Umsetzung messen.
- Risiken und mögliche Regressionen: Neue Race Conditions bei Setup/Restart/Publication; serialisierte Zustandsübergänge und existierende Tests erhalten.
- Abhängigkeiten: Isolierte Fake-Runner-/tmux-Fixture; keine Nutzerfreigabe für deren temporäre Daten erforderlich.
- Umfang: Large.
- Risiko: Medium.
- Validierung: Eigener Testsocket, 1/4/12 Sessions, fünf Sekunden Fake-Setup parallel zu Health und WS-Echo. Vor/nach subprocess count, Event-Loop-p99 und Health-p95; Setupfehler, Lock, Watchdog, Mehrdienste, Terminals und Shutdown regressieren.

### [M-007] Snapshot-Ranking und Retention passend indizieren (P1, gemessen)
- Umsetzungsstand: Implementiert und skaliert. Forecasts bei eingefrorenem Clockbytegleich, 96-Cap/Providergrenzen erhalten. Eigene 5-%-aktiv-Fixture: 141.625/400k/1M Rankingmedian 182,8→19,2 / 569,8→58,7 / 1.702,9→142,7 ms; Retention 10,3/31,6/88,9→ca. 0,003 ms. Indexbau 0,16/0,50/1,40 s, zusätzliche DBbytes ca. 25 %. Kein Liveindexbau.
- Problem: Forecastfilter und globale Retention passen nicht zum account-first-Index. Auch ohne abzulaufende Zeilen werden sämtliche Snapshots durchsucht.
- Hinweise oder Messwerte: Live 141.625 Zeilen; Ranking 94,48 ms Median mit Indexscan/Temp-B-Tree, Retentions-SELECT 13,49 ms ohne Treffer. Zwei einfache Indizes verbessern synthetisches Ranking 59,72 → 14,48 ms.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/usage/database.ts:45`, `/home/bbecker/projects/Wrapt/apps/server/src/usage/database.ts:122`, `/home/bbecker/projects/Wrapt/apps/server/src/usage/database.ts:239`, `/home/bbecker/projects/Wrapt/apps/server/src/usage/usage-service.ts:75`.
- Vorgeschlagene Änderung: Idempotent Indizes auf captured_at sowie resets_at WHERE resets_at IS NOT NULL ergänzen. Alten usage_snapshot_lookup erst nach Callsite-/Migrationprüfung ersetzen. Globale Retention optional einmal je Sync statt je Provider bündeln.
- Implementierungsdetails: SQL: `CREATE INDEX IF NOT EXISTS usage_snapshots_captured ON usage_snapshots(captured_at)` und `CREATE INDEX IF NOT EXISTS usage_snapshots_resets ON usage_snapshots(resets_at) WHERE resets_at IS NOT NULL`. UNIQUE, 96-Sample-Grenze, Resetidentität und 400-Tage-Regel unverändert. SQLite pflegt Indizes transaktional; kein Cache nötig.
- Erwarteter Nutzen: Auf gleicher synthetischer Verteilung rund 76 % weniger Rankingzeit; Ziel Median <25 ms bei 141k Zeilen. Übertragung auf Livebestand muss vor/nach bestätigt werden. Größerer Covering-Index brachte nur weitere 2,18 ms und ist zunächst unnötig.
- Risiken und mögliche Regressionen: Indexbau/zusätzliche Schreibkosten; vorhandener Lookup beansprucht rund 11,50 MB. Schema additiv migrieren, Speicher/Imports messen, nicht blind viele Indizes stapeln.
- Abhängigkeiten: Isolierter Datenbankvergleich vor produktiver Migration.
- Umfang: Small.
- Risiko: Low.
- Validierung: EXPLAIN SEARCH statt Vollscan, gleiche Forecasts vor/nach, 141k/400k/1M Dummyzeilen. Resetwechsel, Provider-/Accountgrenzen, 96-Cap, Retention, Importzeit und DBbytes testen; Live nur nach separat autorisierter Umsetzung ändern.

### [M-008] Deaktivierte Maskottchen-Assets aus dem Erststart halten (P2, gemessenes Bundle / Nutzen zu verifizieren)
- Umsetzungsstand: Implementiert und abgenommen: Lazy Creature/externe PNGs, erste Decodefreigabe/Folgeprefetch. Deaktivierter Start-JS 373.387→300.589 B (<320 KB), mobile FCP 4.672→4.284 ms. Sechs zusätzliche kalte Aktivierungsläufe: Desktop FCP 560–564 ms, 26 Bilder; mobile Statusleiste wie bisher verborgen, null Sprite-Requests. Acht native Vorschauaktionen, Poke/Wake, schnelle Aktivierung, Theme, alle 26 Decodes und Reduced-Motion-Party grün. Bild-Retry lokal, Chromium-Modulfehler über bewusst beschrifteten Workbench-Reload browsergeprüft. Verbleibende Long Tasks nicht allein Sprites zugerechnet.
- Problem: Der Statusleistenimport lädt sämtliche Spritebilder auch bei deaktiviertem Maskottchen. Diese Bilder sind im gemeinsamen themeRuntime-Chunk inlined und warten im Startpfad.
- Hinweise oder Messwerte: 26 Sprite-Module / 97.622 gerenderte Bytes vor Minifizierung; gemeinsamer Chunk 134.592 B / 82.712 B Brotli. Dashboard insgesamt 373.321 B Brotli-JS und im mobilen Profil ein 510–560-ms-Task. Der Task ist noch nicht ausschließlich diesen Assets zugeordnet.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/components/StatusBar.tsx:11`, `/home/bbecker/projects/Wrapt/apps/web/src/components/mascot/StatusMascot.tsx:24`, `/home/bbecker/projects/Wrapt/apps/web/src/components/mascot/capybaraFrames.ts:1`, `/home/bbecker/projects/Wrapt/apps/web/vite.config.ts`.
- Vorgeschlagene Änderung: Kleine Status-/Konfigurationshülle von Sprite-/Verhaltensmodul trennen; Creature nur bei enabled laden. Inlining gezielt für Spriteassets abschalten und bei aktivem Maskottchen kommende Frames effizient vorladen/dekodieren.
- Implementierungsdetails: Theme-Synchronisierung bleibt früh und synchron verfügbar. Lazyimportcache bleibt pro Build stabil; Asset-Hashes/immutable übernehmen Invalidierung. Erstes sichtbares Frame und feste Bühne erhalten; keine Animation oder Vorladefunktion entfernen.
- Erwarteter Nutzen: Vermutlich etwa 50–80 KB weniger initiales komprimiertes JS im deaktivierten Fall; erst Bundle-A/B bestätigt die Spanne. Arbeitsziel <320 KB initiales JS in diesem Dashboardzustand, FCP am gleichen CDP-Profil verbessern.
- Risiken und mögliche Regressionen: Spätes erstes Sprite/fehlendes Animationsframe oder Aufblitzen beim Aktivieren; Bilddekodierung und reserved stage prüfen.
- Abhängigkeiten: Keine; vor Umsetzung Start-CPUtrace für verbleibenden Long Task erfassen.
- Umfang: Medium.
- Risiko: Low.
- Validierung: Bundlemanifest/-Module vor/nach, sechs kalte Browserläufe wie oben, aktivierter/deaktivierter Zustand. Alle Bewegungen, Reaktionen, Reduced Motion, Theme, schnelle Aktivierung und Assetretry prüfen; Haupt-CSS separat budgetieren, keine blinde CSSzerlegung.

### [M-009] Dashboard-Ladezustände geometrisch stabil halten (P2, gemessen)
- Umsetzungsstand: Implementiert und abgenommen: geometrisch gleiche Kennzahlkarten, Charts und Storagezeilen. Sechs finale kalte Läufe (je drei Desktop/mobiles CPU4-Netzprofil): CLS 0,0077–0,0080 bzw. 0,00617 (<0,05), FCP Desktop 528–560 ms/mobil 4.288–4.336 ms. Zwei Sekunden APIverzögerung/langer Servername 0,0319, mobile Metricsfehler 0,00014; 200-%-Viewport mit Reduced Motion 0,00036. Kein horizontaler Overflow, Screenshots geprüft; getrennte Vorher-/Nachher-Builds und Messgrenzen im Bericht.
- Problem: Während Metriken eintreffen wächst der Bereich von einem Skeleton auf drei Kennzahlkarten; Status-/Mobile-Summary-Text verändert ebenfalls nachträglich Höhe und Position.
- Hinweise oder Messwerte: CLS Desktop rund 0,095, mobiles Profil 0,1427. Shiftquellen enthalten dash-bento, Runtime-/Storage-Panels und dash-head-side. VitalsBand rendert pending nur eine Karte, später drei; die genaue mobile Beitragsaufteilung weiter tracen.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/views/Dashboard.tsx:263`, `/home/bbecker/projects/Wrapt/apps/web/src/views/DashboardPanels.tsx:59`, `/home/bbecker/projects/Wrapt/apps/web/src/views/DashboardMobileSummary.tsx`, `/home/bbecker/projects/Wrapt/apps/web/src/index.css:341`.
- Vorgeschlagene Änderung: Pending-Kennzahlen in derselben Karten-/Rastergeometrie rendern; Platz für echte Statuszeilen anhand bestehender Typografie reservieren. Mobile Shiftquellen einzeln messen, bevor dort Größen angepasst werden.
- Implementierungsdetails: Bestehende Tokens, Breakpoints und Komponenten erhalten; vor UI-Umsetzung design-system-guide und mobile-design lesen. Kein künstlicher Leerraum für versteckte Panels, keine neue Gestaltung oder entfernte Transition.
- Erwarteter Nutzen: Ziel CLS <0,05 im identischen Dummy-Dashboard und <0,1 auch bei langsamen/fehlerhaften Antworten; erste sichtbare Inhalte bleiben ebenso früh.
- Risiken und mögliche Regressionen: Falsch reservierte Höhen bei langen Texten/Zoom oder Fehlerzuständen; responsiv nach Inhalt dimensionieren und Fehlerkarten prüfen.
- Abhängigkeiten: Keine; zusammen mit M-008 messen, Wirkung getrennt ausweisen.
- Umfang: Small.
- Risiko: Low.
- Validierung: Drei kalte Läufe je Profil, verzögerte/fehlende Metrics und lange Servernamen. LayoutShift.sources vergleichen, Desktop/Mobile/200-%-Zoom und Reduced Motion visuell mit Playwright prüfen.

### [M-010] Notizeditor nach benötigten Ressourcen aufteilen (P2, gemessenes Bundle / Umsetzung vorprofilieren)
- Umsetzungsstand: Implementiert und abgenommen mit begründetem Zielabstand: 37 Grammatiken/Aliasse/Einbettungen bedarfsgeladen, 41 Token-/Plugin-/Auto-Reihenfolgetests. Playwright Desktop/CPU4 mobil: 37 Codeblöcke, identische 188 Token, zwei Formeln, Markdown-Code und Formeln erhalten. Drei kalte Textläufe: Editor −9,6 %, gesamtes Start-JS −5,2 %; 10-%-Gesamtziel nicht erreicht. KaTeX-Split mangels gleichwertiger installierter API verworfen. Importfehler hält Text editier-/speicherbar, Chromium benötigt nach bestätigtem Save Neuladen; Retrygrenze browsergeprüft und dokumentiert.
- Problem: Der erste Editor lädt Common-Syntaxgrammatiken und Mathematikimplementierung vollständig mit, auch für reine Textnotizen.
- Hinweise oder Messwerte: Editor 1.242.746 B / 383.746 B Brotli. Modulreport vor Minifizierung: highlight.js 261.553 B, KaTeX 457.784 B. Diese Größen sind keine direkt addierbaren minifizierten Einsparungen.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/NoteEditor.tsx`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/editor/extensions.ts`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/editor/lowlight.ts`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/editor/CodeBlockView.tsx`.
- Vorgeschlagene Änderung: Zuerst Editorerstöffnung separat tracen. Danach Common-Grammatiken bedarfsgerecht laden und vorhandene lowlight-Instanz wiederverwenden; Schema/Plaintext sofort verfügbar halten. KaTeX nur dann später laden, wenn unterstützte Extension-/NodeView-APIs dieselbe Funktion erlauben.
- Implementierungsdetails: Promisecache je Sprache/Build, Registrierung genau einmal; vorhandene Sprachen erhalten, nach Registrierung sichtbare Blöcke erneut highlighten. Prefetch bei konkreter Code-/Math-Absicht. Keine Mathematik-/Sprachfeatures streichen und keine eigene Editorengine bauen.
- Erwarteter Nutzen: Weniger Ersteditorbytes und Parsearbeit; Ziel mindestens 10 % weniger Starttransfer für reine Textnotiz, ohne schlechtere Code-/Math-Erstinteraktion. Prozent erst am tatsächlichen Ausgabebundle bestätigen.
- Risiken und mögliche Regressionen: Verändertes Auto-Highlighting, SSR-/Paste-/Markdownverhalten oder späte Formeldarstellung. Bei fehlender gleichwertiger Bibliotheks-API den entsprechenden Split verwerfen.
- Abhängigkeiten: Unabhängig von M-008; beide betreffen unterschiedliche Startpfade.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: Kalter Notesaufruf mit Text, Code in allen angebotenen Sprachen und Formeln, mobiles CPUprofil; Bytes/Long Tasks/Editorbereitzeit vor/nach, Import-/Paste-/Export-/Retrytests und identische Darstellung.

### [M-011] Notizmutationen gezielt invalidieren (P2, synthetisch gemessen)
- Umsetzungsstand: Implementiert und abgenommen: exakte Saveantwort im Detailcache, gezielte Listen-/Such-/Betroffeneninvalidierung mit Revisionsguard. Vier Observer-Zähltests: 0 fremde Details + 1 aktive Liste + 1 aktive Suche. Playwright mit zehn sichtbaren Orbit-Notizen und zehn Savepausen: zehn PUTs, null Save-bedingte Detailreads, alle Texte korrekt; periodische Polls nur für diesen Attributionstest isoliert. Browser-Move/Rename, Revision und echter Konflikt geprüft; Datenbank-/Mutationssuite deckt Folder, Archive/Restore und Sortierung ab.
- Problem: Jeder Save setzt den eigenen Detailcache und invalidiert unmittelbar den gesamten Prefix ['notes']; dadurch werden unbeteiligte aktive Details erneut gelesen.
- Hinweise oder Messwerte: Zehn aktive unterschiedliche Detailqueries plus Liste erzeugten elf queryFn-Aufrufe nach einem Save, einschließlich gerade gespeichertem Detail. Das ist ein In-memory-Nachweis des Fanouts.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/NotesWorkspace.tsx:73`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/NoteOrbitNode.tsx:164`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/hooks/useNotesMutations.ts`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/sidebar/NotesFolderActions.tsx`.
- Vorgeschlagene Änderung: Savedresponse im exakten Detailkey behalten. Liste gezielt invalidieren oder Summary aktualisieren; aktive Inhaltssuchen nach Contentänderung invalidieren. Create/Move/Archive anhand tatsächlicher Auswirkungen behandeln.
- Implementierungsdetails: Detailkey ['notes','detail',id], Listenkey ['notes','list']; Suchkeys separat. Titel/Icon/Favorite/updatedAt und betroffene Parent-/Subtree-Metadaten berücksichtigen. Aktives Fremdänderungspolling bleibt bestehen.
- Erwarteter Nutzen: Szenario von elf Folgefetches auf null bis einen Listenfetch plus betroffene aktive Suche reduzieren. Keine pauschale Produktionsersparnis von 90 % behaupten.
- Risiken und mögliche Regressionen: Veraltete Suchtreffer oder Baum-/Titelzustände nach Move/Rename; für jede Mutation eine explizite Invalidierungsmatrix festlegen.
- Abhängigkeiten: M-001 zuerst; M-015 verkleinert verbliebene Listenreads.
- Umfang: Medium.
- Risiko: Low.
- Validierung: QueryObserver-Zähltest und Browsertrace mit zehn IDs/zehn Savepausen. ContentSave darf fremde Details nicht refetchen; Suche, Rename, Move, Folder, Archive/Restore, Revision und Konflikt werden frisch.

### [M-012] Eingeklappte Notizbäume begrenzt rendern (P2, synthetisch gemessen)
- Umsetzungsstand: Implementiert und abgenommen: gemeinsamer Sidebarindex, lazy Kinder/Sections und Unmount nach bestehender Transition. Playwright für 100/1.000/5.000 Notizen mit jeweils 10/100 Ordnern: geschlossen 20/200/1.000 statt offen 200/2.000/10.000 Rows, jeweils 90 % weniger. Rapid-Reopen, Fokus-Rückgabe und native DnD-Verschachtelung grün; aktive Ancestors und Reduced Motion geprüft. Offene 5k-Fixture benötigt ca. 4,2–4,4 s bis zu allen Rows; keine Behauptung billiger vollständig offener Bäume. Mobile/Rename-Abnahme im Bericht.
- Problem: Kinder und geschlossene Sections bleiben vollständig gemountet; All-Baum und Ordnerbäume rendern Notizen doppelt. Jeder Ordner baut neue Gesamtindizes und Parentzuordnungen.
- Hinweise oder Messwerte: 1.000 Notizen mit 10 Ordnern und keinen geöffneten Notizknoten erzeugen 2.000 TreeRows; React-SSR Median 137,39 ms / p95 188,62 ms. Die 4,35 MB SSR-Markup sind keine CSR-Netzlast.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/sidebar/NotesTree.tsx:180`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/sidebar/NotesSection.tsx:61`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/sidebar/NotesSidebarSections.tsx:63`.
- Vorgeschlagene Änderung: Gemeinsamen byId-/Parent-/Root-Folderindex aus notes/folders einmal bilden. Geschlossene Zweige erst bei Öffnung mounten und nach bestehender Collapseanimation unmounten. Erst danach bei sehr breiten offenen Bäumen einen gepflegten Virtualizer prüfen.
- Implementierungsdetails: Indexinvalidierung an Notes-/Folderidentität; Expansion/Scroll/Fokus in bestehendem Zustand halten. All- und Folderansicht bleiben fachlich vorhanden. Transitioncontainer, DnD-Autoscroll und ARIA-/Keyboardpfade erhalten.
- Erwarteter Nutzen: Im Seed mit 100 Roots/900 geschlossenen Kindern etwa 200 statt 2.000 Rows. Ziel ≥80 % weniger Rows im geschlossenen Szenario; Browser-Commitzeit gesondert messen.
- Risiken und mögliche Regressionen: Fokus-/Dragverlust beim Unmount oder fehlende aktive Ancestoröffnung; gezielte Zustandswiederherstellung nötig.
- Abhängigkeiten: M-011 verringert wiederholte Renderanlässe; M-015 verringert Listenaufbereitung.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: 100/1.000/5.000 Dummy-Notizen und 10/100 Ordner, alles geschlossen/offen. DOMzahl, Reactprofiler, Rename/Expand/Scroll/DnD mobil und Desktop, Animationsende/Reduced Motion/Keyboard prüfen.

### [M-013] Markdownserialisierung nach Schreibbursts durchführen (P2, synthetisch gemessen)
- Umsetzungsstand: Implementiert und abgenommen: immutable PM-Snapshot je Generation, Serialisierung erst beim Save, serielle Revisionskette. Browservergleich 25/125/625 KB, Desktop/CPU4, 30 Zeichen: jeweils 30→1 Serialisierung (96,7 % weniger), alle Zeichen gespeichert. Bei 625 KB CPU4 gemessener Keydown-bis-Input-Median 37,7→24,4 ms, kein INP-Versprechen; ein großer Save bleibt >16 ms möglich. Native Navigation, IME, pagehide/Reload, Save-in-flight und echter Konflikt mit bewusster Versionswahl grün; neun Unit-/Editortests sichern zusätzlich saveNow/Unmount.
- Problem: schedule() erzeugt vollständiges Markdown vor dem 800-ms-Debounce bei jedem Editorupdate. Der Timer entprellt Netzwerk, nicht die Serialisierung.
- Hinweise oder Messwerte: 623.888 Zeichen allein Serialize 5,47 ms Median / 5,88 ms p95 auf dem Host; getJSON und Editor-/Browserarbeit fehlen. Lange Dokumente sind deshalb ein plausibler Eingabekostenpfad.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/NoteEditor.tsx:204`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/NoteEditor.tsx:253`, `/home/bbecker/projects/Wrapt/apps/web/src/components/notes/editor/useNoteAutosave.ts:140`.
- Vorgeschlagene Änderung: Beim Update immutable ProseMirror-Docsnapshot, Notiz-ID und Generation festhalten; erst die neueste Savegeneration serialisieren. SaveNow/Notizwechsel/Unmount müssen den letzten Snapshot vor Editorwechsel sichern.
- Implementierungsdetails: Bestehende serielle Savekette und expectedRevision erhalten; Serializer darf nicht nachträglich die neue Notiz aus editorRef lesen. Laufender alter Save markiert jüngere Änderungen nicht als saved. Kein Worker ohne weiteren Profilnachweis.
- Erwarteter Nutzen: Zehn Tasten in einem 800-ms-Burst benötigen ungefähr eine statt zehn vollständiger Serialisierungen; Ziel ≥80 % weniger Aufrufe. INP-Gewinn separat messen.
- Risiken und mögliche Regressionen: Entwurfsverlust bei sofortiger Navigation, IME, pagehide oder Konflikt. Kein einfacher Debounce auf mutable Editorreferenz.
- Abhängigkeiten: Keine; M-011 verhindert überflüssige Folgearbeit.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: 25/125/625-KB-Notizen, 30 Zeichen Schreibburst, callcount/CPUtrace/Interaktionslatenz vor/nach. Sofortige Notiznavigation, IME, Save-in-flight, saveNow, Unmount und Konflikt reproduzieren.

### [M-014] Orbit-Edges nur bei relevanter Geometrie bearbeiten (P2, synthetisch gemessen / Codebefund)
- Umsetzungsstand: Implementiert und abgenommen: 100/600 Nodes mit 200/1.200 Edges, null Idlelistener und null Labelberechnungen bei Contentupdates. Je fünf Playwright-Gestenläufe mit 12 echten Notizeditoren/8 Labels und 80 Editoren/60 Labels plus persistentem Dummy-Iframe: p95 16,67 ms, RAF-Abdeckung mindestens 98,69 %, keine Long Tasks. Native Waypointdrags bestätigen Upcommit, Cancel/Escape ohne Save und Undo/Redo; Parentwechsel und kollisionsfreie Labels geprüft. Vorhandener Portal-Hit-Test-Fehler behoben, zoomfeste 44-px-Trefffläche. Zusätzlicher Flowobjektcache entbehrlich; Messgrenzen im Bericht.
- Problem: Jede Edge registriert zwei globale Pointerlistener und beobachtet Zoom/gesamtes Nodesarray. Reine Contentänderungen invalidieren dadurch Labelgeometrie sämtlicher Edges.
- Hinweise oder Messwerte: Bei 1.200 Edges bis 2.400 globale Listener; Vollrunde für 600 Nodes/1.200 Labels im Kontrolllauf rund 19–20 ms Median. Vorhandene WeakMap-Indizes und transienter Dragzustand verhindern diesen speziellen Fanout nicht.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/components/orbit/OrbitEdgeView.tsx:94`, `/home/bbecker/projects/Wrapt/apps/web/src/lib/orbitEdgeLabel.ts:65`, `/home/bbecker/projects/Wrapt/apps/web/src/views/OrbitWorkbench.tsx:430`, `/home/bbecker/projects/Wrapt/apps/web/src/stores/orbit.ts:143`.
- Vorgeschlagene Änderung: Zuerst Listener nur während wirklichem Waypointdrag über Pointercapture/temporären Draghandler aktivieren. Danach stabile Geometriesicht und unveränderte Flowobjekte bei Contentupdates behalten. Räumlichen Hindernisindex erst bei verbleibendem Profilbedarf ergänzen.
- Implementierungsdetails: Key/Generation aus Position, Größe, Parent, Geometrierelevanz, Edgepfad/Label; Content/Titel ohne geometrische Wirkung invalidiert nicht. Hindernisbewegung/Resize/Parentwechsel invalidiert korrekt. Zoom während Drag aus aktuellem Store/Ref lesen.
- Erwarteter Nutzen: Idle-Pointerlistener von 2E auf null, Drag O(1); Contentedit löst null statt E Labelberechnungen aus. Keine garantierten FPS aus dem Nodebenchmark ableiten.
- Risiken und mögliche Regressionen: Veraltete Kollisionen oder falsche Koordinaten bei Touch/Zoom/iframe-Rand; Geometrieschlüssel vollständig halten.
- Abhängigkeiten: Keine; Listenerteil vor Geometriecache umsetzen.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: 100/600 Nodes, 200/1.200 Edges, callcounts und Listenercounts beim Tippen/Zoom. Browsertrace/Harness für Drag/Resize/Pinch, Undo/Redo, Parentwechsel, pointercancel, Escape, Unmount und collisionfreie Labels.

### [M-015] Notizvorschauen aus vorbereiteten Metadaten lesen (P2, synthetischer Skalierungsnachweis)
- Umsetzungsstand: Implementiert und abgenommen: 26/1.000 Notizen mit 131 KB/17,64 MB Inhalt, 20 Samples. Listenmedian 2,59→0,12 bzw. 213,68→11,28 ms, p95 bei 1.000 =12,66 ms (<20 ms). Summarys bytegleich, Excerpt nach Save frisch, Backfill/Rebuild/Importtests grün; Sortindex per EXPLAIN bestätigt. DB- und Excerptgrößen im Umsetzungsbericht.
- Problem: Die Summaryliste lädt jeden Vollinhalt und führt neun Markdown-RegEx-Ersetzungen je Vorschau aus, auch wenn nur Titel/Excerpt gebraucht werden. Sortierung passt nicht zum vorhandenen Index.
- Hinweise oder Messwerte: Live 26 Notizen / 122 KB, aktuell kein großer Listenengpass. 1.000 Dummy-Notizen à 16 KiB: Liste/Ableitung 217,86 ms gegenüber 1,51 ms mit vorbereiteten Excerpts/Sortindex.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/notes/database.ts:79`, `/home/bbecker/projects/Wrapt/apps/server/src/notes/database.ts:177`, `/home/bbecker/projects/Wrapt/apps/server/src/notes/database.ts:329`, `/home/bbecker/projects/Wrapt/apps/server/src/notes/orbitSourceMigration.ts`.
- Vorgeschlagene Änderung: Additive excerpt-Spalte einführen, einmalig backfillen, dieselbe createNoteExcerpt-Ableitung bei Content-/Importwrite atomar aktualisieren. Liste nur Metadata/Excerpt lesen; passenden Index (sort_order, updated_at DESC) ergänzen.
- Implementierungsdetails: Vollinhalt und Detailvertrag unverändert. Cacheinvalidierung erfolgt über Contentrevision; Notfall-Rebuild aus Originalmarkdown. Suchcontext-Excerpts weiterhin aus Trefferfenstern bilden. Keine unbemerkte Ersetzung der bisherigen Substringsuche durch FTS-Tokensuche; Live-FTSbestand ist kein Beweis ihrer Nutzung.
- Erwarteter Nutzen: Große Listen lesen Excerpts statt Megabytes Markdown; Ziel synthetische 1.000er-Liste <20 ms. Heute mit 26 Notizen kleiner absoluter Nutzen.
- Risiken und mögliche Regressionen: Abgeleitete Excerpts können nach Import/Save veralten; alle Writes und bytegleiche Markdownableitung abdecken. APIbaum/Pagination nicht ohne eigene Kompatibilitätsplanung verändern.
- Abhängigkeiten: M-011 zuerst sinnvoll, Umsetzung unabhängig von M-012.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: 26/1.000 Notizen, Unicode/Code/Links/Markdown, Original- und neue Excerpts bytegleich. Konflikt, Import, Save, Move, Archive/Restore, Sortreihenfolge, Save-p95 und zusätzliche DBbytes vergleichen.

### [M-016] Hermes-Status parallel und dedupliziert laden (P2, sehr wahrscheinlicher Codebefund)
- Umsetzungsstand: Implementiert und abgenommen: unabhängige Upstreamreads parallel und per Singleflight geteilt, Status 1 s/Commit 60 s zentral, ACP bleibt frisch. Drei Tests mit zehn parallelen Verbrauchern, verzögerten Quellen, Offline-/Modellteilfehlern, TTL/Invalidierung und ACPänderung grün. Aktionen/Modellwechsel und Updatefingerprint invalidieren passend. Rollback hat keine HTTP-Route; externer Update-/Rollbackzustand wird beim nächsten Read erkannt. Keine echten Hermesdienste verändert.
- Problem: Erst laufen Units/Git parallel, danach HTTP-Status und danach Modellinfo; gleichzeitige Verbraucher wiederholen den gesamten Wasserfall.
- Hinweise oder Messwerte: Laufzeitstruktur max(Unit/Git)+Status+Modell statt weitgehend max(alle unabhängigen Reads). Keine Live-Upstream-Latenz gemessen; Statusservice besitzt keinen passenden In-flight-Snapshot.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/hermes/status-service.ts:64`, `/home/bbecker/projects/Wrapt/apps/server/src/hermes/status-service.ts:80`, `/home/bbecker/projects/Wrapt/apps/server/src/hermes/routes.ts:75`, `/home/bbecker/projects/Wrapt/apps/server/src/utils/cache.ts`.
- Vorgeschlagene Änderung: Unabhängige Reads gemeinsam starten und Fehler einzeln erhalten; In-flight-Deduplizierung für Upstreamfacts einsetzen. Kurzlebige Statusdaten und langsam veränderte Commitmetadaten getrennt behandeln.
- Implementierungsdetails: Key aus Dashboard-/Dienstkonfiguration; Status-TTL höchstens 1–2 s als zentraler Wert, Commit-TTL bis 60 s. Hermesaktionen invalidieren Status, Update/Rollback zusätzlich Commitcache. ACP-Ready/aktive Sessions nach Cache-Read frisch zusammensetzen.
- Erwarteter Nutzen: Entfall sequentieller unabhängiger Latenzanteile; zehn gleichzeitige Verbraucher erzeugen einen Read je Upstreamquelle. Effekt abhängig von echten Dienstlatenzen.
- Risiken und mögliche Regressionen: Falscher Offline-/Modellstatus bei Teilfehler oder kurzzeitig alte Facts; optionale Modellinfo und frischer ACP-Teil dürfen sich nicht gegenseitig blockieren.
- Abhängigkeiten: Keine; M-003 betrifft einen anderen Hermespfad.
- Umfang: Small.
- Risiko: Low.
- Validierung: Verzögerte Fake-Runner/-HTTP-Clients und zehn parallele Requests. Latenzformel, callcounts, Dashboardoffline, nur Modellfehler, Dienstaktion, Update/Rollback und ACPänderung vor/nach prüfen.

### [M-017] Remote-T3-Polls pro Quelle begrenzen (P2, sehr wahrscheinlicher Codebefund)
- Umsetzungsstand: Implementiert und abgenommen: je Host/DB ein FIFO-Read, maximal vier Quellen, begrenzter Jitterbackoff/Abort; lokaler Tail unabhängig, schneller Starttakt erhalten. 27 Tests mit 1/10/20 s Fake-SSH, vier Quellen, lokaler Frequenz, Cursor erst nach Verarbeitung, DB-Wechsel, getrennten DB-Cursors, Settlement/Dedup und Stop grün. Bestehende Einquellen-Cursorpfade erhalten, Mehrdatenbankpfade kollisionsfrei; Legacybaseline-/Mehrquellenmigration geprüft. Keine privaten Remotehosts abgefragt.
- Problem: Ein async-Intervall startet neue Polls ohne Running-Guard; Remotequellen werden je Poll nacheinander bis 20 Sekunden abgefragt.
- Hinweise oder Messwerte: Bei R langsamen Quellen bis ungefähr 20R Sekunden Zyklus bei fünf Sekunden Startintervall; dadurch plausible überlappende SSH-/Python-/Queryarbeit. Gilt nur bei konfigurierten Remotequellen, keine SSH-Lastmessung durchgeführt.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/notifications/t3-status-sync.ts:96`, `/home/bbecker/projects/Wrapt/apps/server/src/notifications/t3-status-sync.ts:202`, `/home/bbecker/projects/Wrapt/apps/server/src/app/dependencies.ts:222`.
- Vorgeschlagene Änderung: Lokalen Eventtail und Remoteplanung trennen. Je Quelle höchstens ein In-flight-Poll, unterschiedliche Quellen mit begrenzter Parallelität; Fehlerbackoff mit Jitter.
- Implementierungsdetails: Zustand je Host/DBidentität und Cursor; Cursor erst nach vollständig verarbeiteter Antwort committen. Nach Erfolg normales Intervall, nach Quellenwechsel Baseline korrekt invalidieren. Shutdown laufende Reads abbrechen/abwarten.
- Erwarteter Nutzen: Gleichzeitige Reads je Quelle auf eins begrenzen; langsame Quelle hält schnelle Quellen nicht sequentiell auf. Benachrichtigungssynchronisierung bleibt aktiv.
- Risiken und mögliche Regressionen: Längere Zustellzeit nach Ausfall oder Cursorverlust; Backoff begrenzen und Rückkehrfälle testen.
- Abhängigkeiten: Keine.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: Fake-SSH 1/10/20 Sekunden, 1/4 Quellen, Fake-Timer. In-flight-Zähler, lokale Pollfrequenz, Cursor/Baseline, Dedup, Settlementfenster, Wiederkehr und Stop vor/nach vergleichen.

### [M-018] Hermes-WebSocket-Sendepuffer begrenzen (P2, Codebefund / Belastung verifizieren)
- Umsetzungsstand: Implementiert und abgenommen: bestehende begrenzte Brücke, einzelnes großes Frame bei leerem Sendepuffer erlaubt. Vier gezielte plus 28 bestehende Tests grün. Reale lokale WS-Fixture: Text/binär/4-MB-Frame korrekt, langsamer TCP-Empfänger erreicht maximal 2.031.968 B Sendepuffer und einmal 1013 statt unbeschränktem Burst; Prozess-RSS ca. +20 MB inklusive Quelle/TCP/Frames, keine absolute RSS-Garantie. Reconnect-Replay mit 20 geordneten Zeilen korrekt; installierter Hermes-Client und PTY-Replayring unterstützen diesen Pfad. Keine privaten Sessions belastet.
- Problem: Die eigene Hermes-Brücke begrenzt pendingBytes nur während CONNECTING; im OPEN-Zustand wird ohne bufferedAmount-Grenze weitergesendet.
- Hinweise oder Messwerte: Andere Proxybrücken nutzen bereits die begrenzte gemeinsame Implementierung. Unbegrenztes Wachstum ist ein Slow-Consumer-Potenzial; aktueller RSS-/Pufferanstieg wurde nicht gemessen.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/hermes/dashboard-proxy.ts:307`, `/home/bbecker/projects/Wrapt/apps/server/src/utils/websocketBridge.ts:50`, `/home/bbecker/projects/Wrapt/apps/server/src/services/opencodeWebProxy.ts:276`.
- Vorgeschlagene Änderung: Zunächst isolierten Slow-Consumer-Test durchführen; anschließend vorhandene bridgeWebSockets wiederverwenden, wenn Close-/Replaysemantik der Hermesoberfläche identisch abgesichert ist.
- Implementierungsdetails: Handshake, Subprotokolle, binär/text und Closeweiterleitung erhalten. Vorhandene zentrale Puffergrenzen nutzen bzw. gemessen passend konfigurieren; Overloadmetriken einbinden. Kein stilles Nachrichtenverwerfen.
- Erwarteter Nutzen: Begrenzter statt weiter wachsender ws-Sendepuffer bei langsamen Endpunkten. Normalfalllatenz unverändert; konkrete RAMobergrenze aus Queue-/Framebudget ableiten.
- Risiken und mögliche Regressionen: Reconnect könnte Ausgabe ohne Replay verlieren; Verlauf nach Wiederverbindung muss vollständig sein. Kein Cutoff allein aufgrund einer normalen großen Nachricht.
- Abhängigkeiten: Slow-Consumer-/Reconnect-Beleg vor Einführung.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: Eigener schneller WS-Upstream und gedrosselter Client, bufferedAmount/RSS/Overloadcounts, geordnete Nachrichten, große Frames, Protokolle und Verlauf nach kontrolliertem Reconnect testen.

### [M-019] Orbit-Backupwartung asynchron und begrenzt ausführen (P2, sehr wahrscheinlicher Codebefund)
- Umsetzungsstand: Implementiert und abgenommen: atomare SQL-Outbox und geordneter durabler Workerdrain mit fsync/Rename. Je 50 Pendingrevisionen bei 150 KB/1 MB/nahe 4 MB: current=50, Outbox leer; Health-p95 3,34/1,83/1,21 ms, WS-p95 1,56/0,73/0,60 ms, EL-p99 unter 3 ms während Drain. Sechs Drain-/Crash-/Recoverytests einschließlich Crash nach durablem Export vor SQLack grün. 20 Saves: Median 5,08→1,64 / 22,71→12,30 / 317,22→257,82 ms; große synchrone SQL-/Validierungsarbeit und WALausreißer bleiben, keine 4-MB-Save-Latenzgarantie. Risiken und p95 im Bericht.
- Problem: Nach SQLcommit erledigt derselbe Request synchron sämtliche offenen Backups samt Parse/Zod, zweimaligem writeFileSync(flush:true), Rename/Directory-fsync und Prune.
- Hinweise oder Messwerte: Live Dokument rund 151 KB, 100 Revisionen / rund 15 MB, Outbox leer. Der blockierende Pfad und fehlendes Outbox-Limit sind belegt; Save-/fsync-Zeit aktuell nicht gemessen.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/orbit/database.ts:156`, `/home/bbecker/projects/Wrapt/apps/server/src/orbit/database.ts:221`, `/home/bbecker/projects/Wrapt/apps/server/src/orbit/database.ts:425`, `/home/bbecker/projects/Wrapt/apps/server/src/app/lifecycle.ts`.
- Vorgeschlagene Änderung: Nach isoliertem Saveprofil den atomaren SQLsave/Outboxeintrag behalten und einen chronologischen, deduplizierten Backupdrain mit Batch-/Zeitbudget einführen. Datei-I/O asynchron, Hash-/Parsearbeit bei Bedarf in gebundenem Worker.
- Implementierungsdetails: Key ist Outboxrevision; Delete erst nach erfolgreicher durabler Sicherung. current.json nicht durch spät fertige ältere Revision zurücksetzen. Ungesicherte Revisionen nicht prunen. Fsync, Rename, Fehlerstatus, Recovery und begrenzter Shutdownflush bleiben erhalten.
- Erwarteter Nutzen: Backupanteil liegt außerhalb von Saveantwort und Serverthread; keine unbelegte Millisekundenspanne. Ziel responsiver Health/WS-Pfad auch bei 50 ausstehenden Revisionen.
- Risiken und mögliche Regressionen: Sicherung hinkt Commit hinterher, Reihenfolge/Crash/Shutdown könnte neue Lücken erzeugen. Die bestehende durabel gespeicherte Outbox muss diese Lücke vollständig abdecken.
- Abhängigkeiten: Isolierter Crash-/Recovery-Harness; keine Abschwächung der Durabilitätsgarantien.
- Umfang: Large.
- Risiko: High.
- Validierung: 150-KB/1-MB/max-Dokument und 50 Pendingrevisionen, Save-p50/p95, fsync- und Event-Loop-Profil, Health/WS. Crash vor/nach Export, Diskfehler, geordnete current.json, Prune und Wiederanlauf prüfen.

### [M-020] Audit-Retention über Sequenzgrenze löschen (P2, synthetisch gemessen)
- Umsetzungsstand: Implementiert und abgenommen: Bereichs-DELETE mit echter 10.000-Reihengrenze, Grenzfälle/Sequenzlücken/Vorgänger/Rollback/Outbox grün. 20 Samples bei 10k ohne fällige Zeilen: 5,33→0,091 ms Median, p95 0,101 ms (<1 ms); EXPLAIN bestätigt rowid-Bereichssuche.
- Problem: Jede auditierte Mutation durchsucht die Tabelle mit NOT IN der neuesten 10.000 Sequenzen, auch wenn keine Zeile entfernt wird.
- Hinweise oder Messwerte: Live EXPLAIN enthält Tabellen-/Subqueryscans. Bei 10.000 Dummyzeilen Retention 5,82 ms Median, Primärschlüsselgrenze 0,128 ms. Live nur 3.701 Einträge; keine aktuelle 5,82-ms-Schreiblatenz behaupten.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/observability/audit.ts:96`, `/home/bbecker/projects/Wrapt/apps/server/src/observability/audit.test.ts`.
- Vorgeschlagene Änderung: Cutoff der tatsächlich 10.000-neuesten Reihen bestimmen und vorbereiteten Bereichs-DELETE innerhalb derselben Transaktion nutzen.
- Implementierungsdetails: `DELETE FROM operational_audit WHERE sequence < COALESCE((SELECT sequence FROM operational_audit ORDER BY sequence DESC LIMIT 1 OFFSET 9999),0)`. Nicht MAX(sequence)-9999 verwenden, da Sequenzlücken die Zeilenzahl verändern. Hashkette, Outbox und Verifyinvalidierung unverändert.
- Erwarteter Nutzen: Synthetisch rund 98 % weniger Retentionarbeit am Cap; Ziel <1 ms ohne fällige Zeilen. Heute kleiner absoluter Nutzen als M-007.
- Risiken und mögliche Regressionen: Off-by-one oder verkürzte Historie bei Lücken; tatsächliche Rowcountgrenze testen.
- Abhängigkeiten: Keine; unabhängig von M-021.
- Umfang: Small.
- Risiko: Low.
- Validierung: 0/9.999/10.000/10.001 Zeilen, Sequenzlücken, Rollback und Outboxreplay. Gleiche behaltene Einträge/Hashvorgänger, EXPLAIN rowid-range und 10k-Benchmark vor/nach.

### [M-021] Volle Auditprüfung im gebundenen Worker ausführen (P2, synthetisch gemessen / Routeprofil erforderlich)
- Umsetzungsstand: Implementiert und abgenommen: 3.701/10k vollständige Hashketten in konsistentem Readonly-Worker. Je 20 reale HTTP-Diagnoseläufe plus parallele Health/WS: bei 10k EL-p99 57,34→1,75 ms, Health-p95 5,27→1,82 ms, WS-p95 4,54→0,80 ms; Mainthread-Hashrunde entfällt. Workerstart erhöht erste Diagnoselatenz, Gesamtrechenzeit bleibt. Manipulation alter Reihen/TTL/Highwater/parallele Mutation/Fehler/Shutdown grün; Details im Bericht.
- Problem: operational-metrics materialisiert und hasht die volle Kette synchron. Die vorhandene Fünf-Sekunden-TTL wird durch jede erfolgreiche Mutation invalidiert.
- Hinweise oder Messwerte: 10.000 gültige Dummyzeilen: SQL.all + JSON + SHA256 66,91 ms Median. Live 3.701 Zeilen; der aktuelle Anteil an der gesamten Diagnoselatenz wurde nicht profiliert. Readiness ruft diese Prüfung nicht auf.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/server/src/observability/audit.ts:167`, `/home/bbecker/projects/Wrapt/apps/server/src/app/routes.ts:68`, `/home/bbecker/projects/Wrapt/apps/server/src/observability/metrics.ts`.
- Vorgeschlagene Änderung: Zuerst Diagnose-CPUanteile getrennt messen. Bei bestätigtem Hashanteil volle Prüfung in einem einzelnen Worker mit readonly SQLite-Verbindung und konsistentem Snapshot durchführen; Request darf Ergebnis awaiten, andere Pfade laufen weiter.
- Implementierungsdetails: Singleflight, maximal ein Worker und bestehende TTL/Mutationsinvalidierung erhalten. Ergebnis an geprüften Snapshot/Highwater binden. Auch bei unveränderter Sequenz nach TTL vollständig prüfen; Suffixprüfung/langfristiger MAX(sequence)-Cache ersetzt das nicht.
- Erwarteter Nutzen: Hasharbeit blockiert andere HTTP-/WS-Verbraucher nicht; Gesamtrechenzeit wird nicht eingespart. Ziel kein >16-ms-Hashdurchlauf im Serverthread bei 10k Fixture.
- Risiken und mögliche Regressionen: Inkonsistenter Snapshot oder falsch als aktuell bezeichnetes Resultat; keine ungeprüft gültigen Cachewerte ausgeben, Workerfehler/Shutdown behandeln.
- Abhängigkeiten: M-002 zuerst, damit Buildstats den Routeprofiler nicht verdecken; M-020 unabhängig.
- Umfang: Medium.
- Risiko: Medium.
- Validierung: 3,7k/10k Fixture, parallele Mutation und Metrics-Poll, identische Prüfresultate/TTL, Manipulation älterer Dummyzeile im Test, Health/WS-p95, Event-Loop-p99, Workerfehler und Shutdown.

### [M-022] Orbit-Recoverywrites erst profilieren, dann zusammenfassen (P3, mögliches Potenzial)
- Umsetzungsstand: Messauftrag erledigt, Optimierungsansatz begründet verworfen: 20 Edits an 0,6/3,5 MB auf Desktop/CPU4; Aktivierungsbedingung erfüllt (großer Desktop 10,87 % Taskzeit, CPU4 wiederholt >16 ms). Ein Write je Edit, keine redundanten Generationen. Browser-Durabilitätsvergleich: unmittelbarer Write erhält Entwurfz nach sofortigem Reload, verzögerter Write verliert z. Gleichwertige Zusammenfassung ohne Formatmigration nicht nachgewiesen; gemäß Abschnitt 8 bleiben Key/Format/baseRevision und Crashschutz unangetastet. Messwerte und Vergleich im Bericht.
- Problem: Jedes dirty-Dokumentupdate schreibt sofort synchron das ganze Recovery-JSON in localStorage; der Serverdebounce reduziert diese Browserpersistenz nicht.
- Hinweise oder Messwerte: 600 Dummy-Snippets erzeugen 3.460.257 B je Snapshot; stringify im Kontrolllauf 4,85 ms Median. Tatsächliche localStorage-/IPC-/Quota- und mobile Kosten sind ungemessen.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/components/orbit/OrbitSync.tsx:59`, `/home/bbecker/projects/Wrapt/apps/web/src/components/orbit/OrbitNodeView.tsx:239`, `/home/bbecker/projects/Wrapt/apps/web/src/stores/orbit.ts`.
- Vorgeschlagene Änderung: Zuerst stringify und setItem getrennt im Browsertrace erfassen. Bei relevantem Anteil identische Writes vermeiden und nur eine geordnete neueste Generation persistieren; Weiterentwicklung nur mit gleichwertiger Crashsicherung.
- Implementierungsdetails: Key/Recoveryformat und baseRevision erhalten. Flush bei Notiz-/Board-/Fensterwechsel, pagehide und Saveabschluss muss die richtige Generation sichern. Ein einfacher verzögerter Write oder IDBwechsel ohne Durabilitätsnachweis ist nicht freigegeben.
- Erwarteter Nutzen: Möglicherweise weniger kopierte Megabytes/Schreibburst; keine gemessene localStorage-Zeitersparnis. Umsetzung nur wenn dieser Pfad >10 % der Tracezeit oder wiederholt >16 ms beiträgt.
- Risiken und mögliche Regressionen: Letzter Tastendruck bei Crash verloren, Konfliktrecovery falsch oder Quota früher erreicht; Crashschutz hat Vorrang vor Benchmarkwerten.
- Abhängigkeiten: Browserprofil und Recoverygleichwertigkeit; keine vorgelagerte Datenformatmigration.
- Umfang: Medium.
- Risiko: High.
- Validierung: 0,6-/3,5-MB-Dokument, Desktop und CPUprofil; hard reload/close direkt nach Tastendruck, pagehide, Quota, Save-in-flight und Remoteconflict. Neuester Recoveryzustand muss mindestens gleich gut erhalten bleiben.

### [M-023] Nicht sichtbare Orbit-Livearbeit selektiv pausieren (P3, mögliches Potenzial)
- Umsetzungsstand: Implementiert und abgenommen: echte xterms mit Dummy-WebSockets, 20/96 Tools, zwei sichtbar, ≥5 min Output vor/nach. Laufzeitnormierte Mainthreadarbeit −68/−85 %, Abos 20/96→2, DOM bleibt 20/96. Alle 96 Nodes mit frischer Ausgabe und demselben DOM nach Kamerapan; Tastatur/Paste/Scrollbuffer/mittlerer Maustastenpan grün. Entfernte Schriftmessungen während Zoom ausgesetzt, Erstsync/aktuelle Geometrie und Fokus/Drag erhalten; 16 Index-/Bootstrap-/Appearance-/Protokolltests grün. Geordneter Kontrolllauf ohne Pause: Rückkehr 3,28–4,94 s, voller Scrollback 3,36–6,21 s; nachher p50/p95 1,06/2,10 s, selten 6,77 s. Speicher wächst nach Besuch aller Nodes; keine dauerhafte Heap- oder Instant-Rückkehrgarantie. Iframes unverändert; Grenzen im Bericht.
- Problem: onlyRenderVisibleElements=false bewahrt Iframes, hält jedoch auch Browserarbeit weit außerhalb des Canvasviewports aktiv. Terminalaktivität berücksichtigt Route/Pane, keine Canvasposition.
- Hinweise oder Messwerte: Kein Visibility-/Cullinglayer gefunden; bis 96 Toolnodes möglich. Verdeckte Routen detachen Terminals bereits, weshalb dieser Befund nur aktive große Boards betrifft. Keine reale CPU-/Heapersparnis gemessen.
- Betroffene Dateien und Komponenten: `/home/bbecker/projects/Wrapt/apps/web/src/views/OrbitWorkbench.tsx:1138`, `/home/bbecker/projects/Wrapt/apps/web/src/components/orbit/OrbitNodeView.tsx:189`, `/home/bbecker/projects/Wrapt/apps/web/src/components/ToolPanel.tsx:305`, `/home/bbecker/projects/Wrapt/apps/web/src/components/terminal/engine/useTerminalRenderer.ts:145`.
- Vorgeschlagene Änderung: Zuerst 20 aktive Dummytools mit zwei sichtbaren messen. Nur bei relevantem Hintergrundanteil gemeinsamen Visibilityindex mit Overscan einführen, weit entfernte Browserabos/Polls pausieren; fokussierte, editierte und bewegte Nodes aktiv halten.
- Implementierungsdetails: Iframe-/xterm-DOM nicht umhängen oder entfernen, Serverprozesse laufen weiter. Rückkehr nutzt Epoch/Delta-/Snapshotresync und Overscan-Prefetch. Iframe-JS nur über unterstützte Pause-API beeinflussen; kein src-Reset und kein pauschales onlyRenderVisibleElements=true.
- Erwarteter Nutzen: Weniger xterm-Parse-/Pollarbeit außerhalb sichtbarer Fläche; tatsächlicher Gewinn offen. Ziel ≥30 % weniger Mainthreadzeit im belasteten Fixture bei identischer sichtbarer Ausgabe, nur nach bestätigtem Profilanteil.
- Risiken und mögliche Regressionen: Fehlende Ausgabe/Geometrie-/Fokuszustände oder langsamere Rückkehr. Das bestehende Qualitäts-/Persistenzverhalten ist Abnahmebedingung.
- Abhängigkeiten: M-001 und M-014 zuerst; Browserbelastungsbeleg erforderlich.
- Umfang: Large.
- Risiko: High.
- Validierung: Eigene Fixture mit 20/96 Tools, zwei sichtbar, fünf Minuten Output und Pan über alle Nodes. Abos/Parsecalls/Heap/Mainthreadzeit, Delta/Epoch, Scrollbuffer, Input/Paste, Geometryownership, Iframezustand und Rückkehrlatenz vergleichen.

## 5. Caching and Prefetching Strategy

Cachegrenzen bleiben an fachlichen Datenquellen. `createAsyncCache` mit TTL, Singleflight und Generationen wiederverwenden. Ein Key umfasst Quelle/Konfiguration/Revision; Abort und Fehler dürfen keinen veralteten erfolgreichen Reload veröffentlichen. Notfallinvalidierung betrifft nur den jeweiligen Fachcache. Kein gemeinsamer Langzeitcache für volatile Diagnosedaten oder Notizrevisionen.
Build-Metadaten: Releaseindex-Version plus 60-s-Kontroll-TTL, frische Operativmetriken daneben. Projekte: gemeinsame Discovery mit bestehender kurzer TTL, Registration/Config invalidiert; Aktivitätsdaten behalten eigene Fünf-Minuten-Grenze. Hermesfacts: Status 1–2 s, Commit bis 60 s, Aktionen/Update/Rollback invalidieren. Audit: bestehende 5 s und Mutationsinvalidierung, vollständige Prüfung bleibt erhalten. Abgeleitete Notizexcerpts werden im Contentcommit gepflegt und können aus Markdown neu gebaut werden.
Frontend: Detailcache je Notiz weiter teilen; nur sichtbare Observer pollen, Rückkehr revalidiert sofort. Own Saves setzen Responsecache und invalidieren betroffene Liste/Suche. Modul-/Sprach-/Assetcaches haben Buildhash als Version. Hover/Focus/Pointerdown-Prefetch bleibt; echte Nutzerabsicht lädt benötigte Route/Daten bzw. kommende Sprite-/Highlightressourcen. Keine pauschale Vorladung aller Editoren oder fremder Iframeapps, keine neue öffentliche CDN-/Service-Worker-Datenhaltung.

## 6. Do Not Do List

- Keine Animationen, Iframes, Backgroundsync, Preloading, Terminal-Scrollback, Sprachen oder Mathematikfeatures zur Messwertkosmetik entfernen. Keine pauschale Orbitvirtualisierung, die persistente Liveelemente neu lädt.
- Kein SQLite synchronous=OFF, kein Streichen von fsync/Backups/Outbox, kein Kürzen der vorhandenen 400-Tage-/All-Time-Historie und keine lang gecachten Audit-valid-Ergebnisse. WALgröße allein ist kein Engpassbeweis; hier kein Live-Checkpoint/VACUUM.
- Kein frameworkweiter Worker-/State-/Routerumbau und kein Austausch von XYFlow/xterm/Tiptap aufgrund bloßer Bundlegrößen. Keine pauschalen memo/useCallback- oder Indexpakete ohne Profilanteil.
- Galerie heute leer, T3-Kontextquery rund 1,20 ms und OpenCode-Aggregationen zusammen rund 2,66 ms: aktuell keine Umsetzung. Galerieindizes bei echtem Wachstum erneut prüfen; synthetisch 10k Dateien verbessern Foldercounts 9,49 → 1,08 ms. Fremde OpenCode-Datenbank nicht für diesen Audit migrieren.
- Terminal-Full-Snapshots werden je Client erneut serialisiert; 1/4 Clients mit 10k Zeilen erst messen, bevor revisions-/parse-sequenzgebundene Wiederverwendung geplant wird. Ebenso nicht konsumierte Healthresponsebodys erst mit großer/langsamer Fixture prüfen. Beides ist Potenzial, kein nachgewiesener aktueller Leak.
- Keine ungefragten produktiven Builds/Restarts, Preview-/Slot-/Tailscaleänderungen oder Belastung privater Chats. Bestehende API-/Speicherformate und Aktualitätsgarantien bleiben erhalten; echte Breaking Changes separat benennen und planen.

## 7. Roadmap

1. M-001, M-002, M-003 zuerst, jeweils separat mit Vorher-/Nachher-Zählung. Danach M-007 und M-004; günstige SQL-/Discoveryarbeit ohne Funktionsverlust reduzieren.
2. M-005 und M-006 mit isolierten Prozess-/Dateifixtures, parallel responsiven Health-/WS-Pfad nachweisen. Anschließend M-008/M-009 und M-011; Startbytes, Layoutstabilität und Requestfanout einzeln messen.
3. M-012/M-013/M-014/M-015/M-010 anhand großer synthetischer Bestände, danach M-016/M-017/M-018. Geometrie-/Save-/Reconnectgarantien behalten. M-020 kann als kleiner separater Schritt vorgezogen werden.
4. M-019 und M-021 nach gezieltem Save-/Diagnoseprofil und mit Crash-/Workerprüfungen. M-022/M-023 bleiben reine Messaufträge, bis ihre Aktivierungsbedingungen erfüllt sind; kein vorsorglicher Umbau.
5. Abnahme je fachlichem Schritt: passende Unit-/Integrationsprüfungen, `pnpm typecheck`, `pnpm architecture:file-lines`, bei Codeänderungen Lint; Browserfälle nur Playwright auf eigenem Testserver. Orbit-Gesten mit bestehendem Harness im isolierten Checkout, kleine Fläche p95 ≤16,7 ms / Stressfläche ≤33,3 ms und ≥90 % RAF-Abdeckung. Keine Abnahme allein über Node-Mikrobenchmarks.
6. Beim späteren Implementieren Versionierungen anwenden, Version/Changelog zur tatsächlichen Änderung pflegen. Keine Commit-/Push-/Neustartfreigabe aus diesem Audit ableiten. Während dieses Audits blieb der aktive Dienst unverändert; Boot-/Webbuildmarker, Listenerliste und tmux-Sessions wurden gegen die Baseline geprüft. Einzige dauerhafte neue Projektdatei ist dieser Plan, temporäre Browser-/Messartefakte liegen außerhalb des Projekts. Typecheck und Architecture-Check für den 397-Zeilen-Plan bestanden.

## 8. Open Questions

Für die Umsetzung gelten zusätzlich die aktuellen Nutzergrenzen: keine Devserver, Neustarts, Nutzer-Previews oder Sub-Agents. Browserprüfungen erfolgen ausschließlich per Playwright-MCP mit isolierten statischen/Produktions-Fixtures. Keine Nutzerentscheidung blockiert die empfohlenen ersten Maßnahmen. Reale Handy-/Tailscale-Budgets und Langzeitlast müssen vor großen Optimierungen gemessen werden; sie sind keine Voraussetzung für M-001 bis M-007. Falls M-022 oder M-023 die bestehende Entwurfs- oder Rückkehrqualität nicht gleichwertig erhalten kann, wird der Ansatz verworfen, statt diese Eigenschaft still zu verschlechtern.

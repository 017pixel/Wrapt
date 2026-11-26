# Performance Audit and Improvement Plan

## 1. Executive Summary

Wrapt 3.1.4 läuft als produktiver Build vom 17.11.2026 auf `127.0.0.1:3010`. Die Grundlatenz ist gut: `/api/v1/health` liegt bei p95 1,12 ms, statische Assets werden in 2–6 ms ausgeliefert. Die messbaren Kosten entstehen woanders: in wiederholten Subprozess-Aufrufen der Polling-Pfade, in eager geladenem Plugin-Code und in Notizpfaden, die den Volltext mehrfach lesen, kopieren und zurückgeben.

Größte nachgewiesene Bottlenecks: Hermes-Diagnose 13,87 s pro Aufruf; Systemmetriken 117–199 ms kalt alle 5 s, davon 75–82 ms für `cpuTemperature`; `/terminal/sessions` p95 29,66 ms alle 3 s durch einen tmux-Scan pro Request; Preview-Status p95 56,6 ms alle 2 s und Preview-Logs p95 48,3 ms alle 1,5 s; Notiz-Excerpt 16,67 ms Median pro Save bei 625 KB.

Der Ersttransfer umfasst rund 458 KB Brotli. Davon sind 61 KB PluginRuntime, die vor dem ersten Render geladen werden, obwohl keine Plugin-Seite geöffnet ist, und 29,7 KB base64-inlined Fonts, die nur für Kyrillisch/Vietnamesisch/KaTeX gebraucht werden. Beides ist ohne Funktionsverlust vermeidbar.

Schnellste Gewinne mit niedrigem Risiko: M-001 (PluginRuntime lazy), M-002 (Fonts aus dem Critical CSS), M-003 (App-Chunk vorladen), M-004 (tmux-Scan cachen) und M-005 (Temperatur/Disk-Metriken cachen). Riskant sind die Notizvertrags-Änderungen M-007/M-009, die Dateimanager-Paginierung M-014 und die Backdrop-Filter-Optimierung M-020.

Empfohlene Reihenfolge: zuerst die fünf P1-Bundle- und Subprozess-Maßnahmen, dann Notizdaten und Preview-Polling, zuletzt Messkalibrierung, Assets und visuelle Laufzeitoptimierung.

## 2. Setup and Method

- Gelesen: `AGENTS.md`, `docs/architecture.md`, `docs/configuration.md`, `docs/previews-for-agents.md`, `docs/performance-implementation.md`, `docs/performance-verification.md`, `apps/web/vite.config.ts`, der historische Plan unter `Performance Audits/`.
- Untersucht: `apps/server/src` (621 TS-Dateien), `apps/web/src` (925 Dateien), `packages/contracts`, vorhandenes `apps/web/dist` inklusive `build-manifest.json`, `.wrapt-releases.json`, CSS und Font-Assets.
- Messungen: lesende `curl`-GETs gegen `127.0.0.1:3010` mit erlaubtem Identitätsheader; Node-Mikrobenchmarks für `systeminformation`, `createNoteExcerpt` und `normalizeLegacyMediaLinks`; SQLite-Kopie in `/tmp/opencode/pfaudit` read-only mit `node:sqlite`, `dbstat` und `EXPLAIN QUERY PLAN`.
- Keine Builds, keine Neustarts, keine systemd-Befehle, keine schreibenden HTTP- oder DB-Zugriffe, keine Preview-/Slot-/Terminal-Mutationen, keine eigenen Devserver. Keine Browser-/Lighthouse-Messung, weil die Workbench eine Tailscale-Identität verlangt und keine isolierte Instanz gestartet werden durfte.
- Sub-Agenten waren im Harness nicht verfügbar (`subagent depth limit reached`). Die Analyse wurde deshalb direkt und seriell durchgeführt.
- Annahmen: Loopback-Messungen sind warm und enthalten keine Tailscale-RTT; Live-Daten sind klein (1 Notiz, 6 Projekte, 1 Terminal); Skalierungsaussagen mit 1.000 Notizen sind Rechnungen aus Code und dokumentierten Fixtures, keine Live-Messung. Parallel lief ein Overall-Audit; dessen Last kann p95-Werte erhöhen. Die Werte sind deshalb Obergrenzen.
- Das vorhandene `apps/web/dist` wurde am 17.11.2026 um 20:43 gebaut. Der Arbeitsbaum enthält bereits unabhängige Änderungen; bundlebezogene Aussagen wurden gegen dieses dist und die aktuell gelesenen Quelldateien geprüft. Wo beides auseinanderfallen könnte, ist die Quelle genannt.
- Nicht verändert: keine Projektdatei außer dieser Auditdatei. Temporäre Kopien und Messartefakte liegen ausschließlich unter `/tmp/opencode/`.

## 3. Measurements

| Messpunkt | Kontext | Wert |
| --- | --- | --- |
| Entry-JS-Graph | 36 Chunks, vorhandenes dist | 787 KB roh / 238 KB Brotli |
| Entry-CSS | `index-BYT31rHm.css` | 472 KB roh / 99,9 KB Brotli |
| App-Chunk | `App-DSQSmnFR.js` | 162 KB roh / 52,8 KB Brotli |
| PluginRuntime | `PluginRuntime-BWVg8MNH.js`, statischer App-Import | 271 KB roh / 61,0 KB Brotli |
| Gesamter Ersttransfer | Entry + App + PluginRuntime + CSS | rund 458 KB Brotli |
| Base64-Fonts in Entry-CSS | 13 `data:`-URLs, 9 `@font-face` | 41.928 B base64; Brotli-Delta 29.683 B |
| Preloads | `index.html` | 40 `modulepreload`, kein App-Preload |
| Health | 229 Live-Aufrufe | p95 1,12 ms / p99 3,52 ms |
| `/api/v1/server/metrics` | 3 kalte Aufrufe, 5-s-Cache | 117,1 / 198,8 / 117,8 ms; warm 1,2 ms |
| `systeminformation` | eigener Mikrobenchmark | `cpuTemperature` 74,9–81,7 ms; `fsSize` 9,0–16,1 ms; `mem` 0,7–3,4 ms; `currentLoad` 0,1–0,5 ms |
| `/api/v1/terminal/sessions` | 1 Session, 3 Einzelaufrufe | 10,8–14,5 ms; Route p95 29,66 ms / p99 31,90 ms (270 Aufrufe) |
| `/api/v1/terminal/workspace` | 658 B, 3-s-Poll | 2,5 ms |
| `/api/v1/services` | Dashboard-Poll 5 s | p95 46,19 ms / p99 55,55 ms (208 Aufrufe); warm 2,2 ms |
| `/api/v1/local-ports` | erster Aufruf | 28,6 ms |
| Preview-Status | Liste / Detail / Logs | p95 43,65 / 56,60 / 48,34 ms; Poll 5 s / 2 s / 1,5 s |
| `/api/v1/notes/tasks` | 1 Notiz | kalt 9,3 ms, warm 1,3 ms |
| `/api/v1/notes/:id/backlinks` | 1 Notiz | kalt 8,1 ms, warm 1,2 ms |
| `/api/v1/notes/:id/history` | leer | 1,9 ms |
| `createNoteExcerpt` | 20 Läufe je Größe | 25 KB 0,65 ms; 125 KB 2,56 ms; 625 KB 16,67 ms Median / 24,04 ms p95 |
| `normalizeLegacyMediaLinks` | 10 Läufe, 625 KB | 2,11 ms pro Aufruf |
| `/api/v1/hermes/status` | 16 Aufrufe | kalt 116,8 ms; warm 1,5–2,6 ms; p95 3.112 ms |
| `/api/v1/hermes/diagnostics` | 1 Aufruf | 13,87 s, 3,4 KB Antwort |
| `/api/v1/system/operational-metrics` | 16 Aufrufe | kalt 45,2 ms, warm 3,5 ms; p95 273 ms (Parallelaudit möglich) |
| SQLite | Live-Kopie | 991 KB DB + 4,17 MB WAL; 18 offene DB-Handles / 36 FDs |
| `usage_snapshots` | 1.457 Zeilen aus 2 Tagen | 1.155 Zeilen am 18.11.; `usage_snapshot_lookup` 132 KB, `resets` 48 KB, `captured` 56 KB, Autoindex 112 KB |
| Dauerpolls je Tab | Codeinventar | 20/min Terminal-Sessions, 20/min Terminal-Workspace, 12/min Health, 2/min Usage |
| Event-Loop-Metrik | Live / eigener Idle-Test | 20,40 ms Mean, p99 21,50 ms, max 302 ms; Idle-Test ebenfalls 20,38 ms |
| Prozessspeicher | Live-Snapshot | RSS 218,8 MB, Heap 82,7 MB |
| Favicon | `favicon.svg` | 139.712 B roh / 103.545 B Brotli; eingebettetes 512×512-PNG |

## 4. Detailed Measures

### [M-001] PluginRuntime aus dem Erstpfad lösen (P1)

- **Problem:** `PluginRuntimeSync` importiert `createPluginToolPage` statisch aus `views/PluginRuntime`. Dadurch zieht `App.tsx` den kompletten Plugin-Runtime-Chunk vor den ersten Render, obwohl keine Plugin-Seite geöffnet ist.
- **Hinweise/Messwerte:** `build-manifest.json` listet `_PluginRuntime-BWVg8MNH.js` als statischen Import von `src/App.tsx`; 271.458 B roh / 61.044 B Brotli. Der Chunk ist größer als der App-Chunk selbst.
- **Betroffene Dateien:** `apps/web/src/extensions/pluginRuntimeSync.tsx:5,10,28`, `apps/web/src/views/PluginRuntime.tsx:31`, `apps/web/src/App.tsx`.
- **Vorgeschlagene Änderung:** 1) Leichtes Factory-Modul ohne Import von `PluginRuntime` anlegen. 2) Factory gibt eine `React.lazy`-Komponente zurück, die `import("../views/PluginRuntime")` erst bei Bedarf ausführt. 3) Route weiter mit derselben ID, demselben Pfad und `RouteFallback` registrieren. 4) Den statischen Import aus `pluginRuntimeSync.tsx` entfernen.
- **Implementierungsdetails:** Lazy-Loader je Slug cachen; die benannte Exportform über `.then((m) => ({ default: … }))` auflösen; keine zweite Kopie des Chunks erzeugen.
- **Erwarteter Nutzen:** 61 KB Brotli weniger vor dem ersten Render, rund 17 % des initialen JS; auf dem mobilen 1,6-Mbit/s-Profil etwa 300 ms.
- **Risiken:** Beim ersten Öffnen einer Plugin-Seite erscheint kurz der Route-Skeleton. Registrierung, Navigation und Plugin-Funktion bleiben unverändert.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** Build-Manifest darf `PluginRuntime` nicht mehr als App-Import führen; Plugin-Seite kalt öffnen; Ersttransfer um 61 KB kleiner; keine Konsolenfehler.

### [M-002] Font-Dateien aus dem Critical CSS heraushalten (P1)

- **Problem:** `assetsInlineLimit` inlined jede Datei unter 4 KB als base64. Das trifft neun Font-Gesichter: JetBrains-Mono-Subsets für Kyrillisch und Vietnamesisch (Latin-Ext) sowie KaTeX Size3. Jeder Nutzer lädt diese Bytes im Entry-CSS, obwohl deutsche Seiten sie nie brauchen.
- **Hinweise/Messwerte:** 13 `data:`-URLs, 41.928 B base64; Entfernen senkt das Brotli-CSS von 99.918 B auf 70.235 B (−29.683 B).
- **Betroffene Dateien:** `apps/web/vite.config.ts:87`, `apps/web/dist/assets/index-BYT31rHm.css`.
- **Vorgeschlagene Änderung:** Die `assetsInlineLimit`-Funktion um `\.(?:woff2?|ttf)$` erweitern und für Fonts immer `false` zurückgeben. Danach neu bauen.
- **Implementierungsdetails:** `unicode-range` sorgt dafür, dass der Browser nur benötigte Subsets nachlädt. Für deutsche Oberflächen bleibt es bei den vorhandenen Latin-Dateien; Kyrillisch und Vietnamesisch werden erst bei passendem Text geladen.
- **Erwarteter Nutzen:** 29,7 KB Brotli weniger Critical CSS (−30 %); auf dem mobilen Profil rund 150 ms; keine visuelle Änderung.
- **Risiken:** Sehr niedrig. Zusätzliche Font-Requests entstehen nur, wenn die Zeichen tatsächlich vorkommen.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** CSS-Brotli-Größe prüfen; Netzwerkaufzeichnung einer deutschen Seite zeigt keine Kyrillisch-/Vietnamesisch-Subsets; Testseite mit kyrillischem Text lädt sie nach.

### [M-003] App-Chunk mit dem HTML vorladen (P1)

- **Problem:** `index.html` lädt 40 Chunks per `modulepreload`, aber nicht `App`. `main.tsx` wartet nach Ausführung des Entry-Chunks auf `import("./App")`. Das ist ein zusätzlicher Roundtrip vor dem ersten React-Render.
- **Hinweise/Messwerte:** Manifest: `src/App.tsx` ist `dynamicImports` des Entry, nicht `imports`; `index.html` enthält keinen App-Preload.
- **Betroffene Dateien:** `apps/web/src/main.tsx:40–44`, `apps/web/index.html`, `apps/web/vite.config.ts`.
- **Vorgeschlagene Änderung:** Entweder `App`, `CrashReportDialog` und `ErrorBoundary` statisch importieren oder per Vite-Plugin einen `modulepreload`-Link für den gehashten App-Chunk in `index.html` injizieren. `preloadDashboardArtwork()` in ein kleines Modul verschieben, das vor `App` importiert wird, damit der Artwork-Preload weiterhin früh startet.
- **Implementierungsdetails:** Statischer Import nimmt App in den Entry-Graph auf; Vite erzeugt den Preload automatisch. Die lazy geladenen Routen bleiben unverändert.
- **Erwarteter Nutzen:** Ein Roundtrip weniger vor dem Mount; auf 150-ms-RTT-Profilen 150–300 ms, im LAN wenige Millisekunden.
- **Risiken:** Der Artwork-Preload darf nicht später starten; deshalb das separate Startup-Modul. Keine Funktionsänderung.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / nach M-001, damit App nicht PluginRuntime mit vorlädt.
- **Validierung:** Netzwerk-Wasserfall: App-Request startet mit dem HTML, nicht erst nach Entry-Ausführung; FCP nicht schlechter; Artwork-Preload weiterhin vorhanden.

### [M-004] tmux-Import im Terminal-Poll cachen (P1)

- **Problem:** Jeder `GET /terminal/sessions` ruft `importSupervisorSessions` und damit `supervisor.list()` auf. Das startet pro Request einen tmux-Prozess. Der Endpunkt wird global alle 3 s pro Tab gepollt.
- **Hinweise/Messwerte:** Route p95 29,66 ms / p99 31,90 ms bei 270 Aufrufen; Einzelaufrufe 10,8–14,5 ms. Der DB-Read selbst ist wenige Millisekunden.
- **Betroffene Dateien:** `apps/server/src/terminal/Manager.ts:267–277`, `apps/server/src/terminal/restore.ts:127–141`, `apps/web/src/components/terminal/TerminalSessionsSync.tsx`, `apps/web/src/lib/queryOptions.ts:184`.
- **Vorgeschlagene Änderung:** 1) Supervisor-Snapshot mit Single-Flight und 2–5 s TTL cachen. 2) Cache bei Create, Close, Restart und explizitem Resync invalidieren. 3) `listSessions` nutzt den Cache; die DB-Liste bleibt frisch.
- **Implementierungsdetails:** Cache-Key aus Owner und tmux-Socket; neue Konfiguration `TERMINAL_SUPERVISOR_CACHE_MS=3000`. Der Resync-Pfad ruft `force` auf.
- **Erwarteter Nutzen:** p95 von 29,7 auf unter 5 ms; rund 20 tmux-Prozesse pro Minute und Tab entfallen; weniger Prozess- und Event-Loop-Last.
- **Risiken:** Extern erzeugte tmux-Sessions erscheinen bis zu 3 s später. Der Resync-Knopf bleibt als Sofortpfad.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** 60 s Dashboard offen, tmux-Exec-Zähler nach dem ersten Aufruf null; externe Session erscheint innerhalb der TTL; Attach/Close unverändert.

### [M-005] Temperatur und Disk-Metriken getrennt cachen (P1)

- **Problem:** `loadMetrics` ruft bei jedem 5-s-Refresh `cpuTemperature` und `fsSize` auf. `cpuTemperature` kostet allein 75–82 ms, `fsSize` 9–16 ms. Der Hintergrund-History-Timer läuft auch ohne offene Clients.
- **Hinweise/Messwerte:** `/server/metrics` kalt 117,1/198,8/117,8 ms; Mikrobenchmark: Temperatur 74,9–81,7 ms, Disks 9,0–16,1 ms, Load/Memory unter 1 ms.
- **Betroffene Dateien:** `apps/server/src/services/systemService.ts:27–50,68,104`, `apps/server/src/config/settings.ts:67`.
- **Vorgeschlagene Änderung:** Getrennte Caches für Temperatur (30 s) und Disks (30 s) einführen; Load und Memory bleiben bei 5 s. `refresh=true` leert auch diese Caches. Der History-Sample-Takt bleibt fachlich unverändert.
- **Implementierungsdetails:** Zwei kleine `createAsyncCache`-Instanzen oder zeitgestempelte Werte; beim Zusammenbau das Alter nicht als frisch ausgeben, sondern `lastUpdated` der langsameren Quelle weiterverwenden.
- **Erwarteter Nutzen:** Rund 80 % weniger Sammel-CPU: 90 ms pro 5 s sinken auf etwa 15 ms; Dashboard-Antwort und Hintergrundlast sinken.
- **Risiken:** Temperatur und Diskfüllstand sind bis zu 30 s alt. Für ein Dashboard ist das vertretbar; expliziter Refresh liefert sofort frische Werte.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** 20 Aufrufe über 100 s; Temperatur-/Disk-Loader laufen höchstens viermal; Dashboard zeigt plausible Werte; Refresh aktualisiert sofort.

### [M-006] Notiz-Excerpt nur über ein begrenztes Präfix bilden (P1)

- **Problem:** `createNoteExcerpt` läuft bei jedem Save über den kompletten Markdown-Inhalt und führt zehn reguläre Ausdrücke aus, obwohl nur 200 Zeichen gebraucht werden. Bei großen Notizen blockiert das den Serverthread.
- **Hinweise/Messwerte:** Eigener Benchmark: 25 KB 0,65 ms; 125 KB 2,56 ms; 625 KB 16,67 ms Median / 24,04 ms p95. Zusätzlich kostet `normalizeLegacyMediaLinks` bei 625 KB 2,11 ms pro Aufruf.
- **Betroffene Dateien:** `apps/server/src/notes/excerpt.ts:4–38`, `apps/server/src/notes/database.ts:281`.
- **Vorgeschlagene Änderung:** 1) Fast Path: nur die ersten 16 KB scannen und abbrechen, sobald 200 Klartextzeichen erreicht sind. 2) Fenced-Code-Blöcke dabei inkrementell überspringen. 3) Wenn das Präfix nicht reicht, einmalig auf den bestehenden Vollscan zurückfallen. 4) Ergebnis je Inhalt/Save wiederverwenden, statt bei identischem Inhalt neu zu rechnen.
- **Implementierungsdetails:** `NOTE_EXCERPT_SCAN_BYTES=16384` zentral konfigurieren. Der Fallback garantiert, dass Notizen mit großem Codeblock am Anfang denselben Text liefern wie heute.
- **Erwarteter Nutzen:** Typische Saves unter 2 ms statt 17–24 ms bei 625 KB; rund 15–22 ms Event-Loop-Blockade weniger pro Save.
- **Risiken:** Pathologische Notizen mit mehr als 16 KB führendem Code brauchen den Fallback. Keine sichtbare Excerpt-Änderung, wenn der Fallback greift.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** 25/125/625-KB-Fixtures, je 20 Saves; Excerpt-Bytes vor/nach identisch, auch mit führendem Codeblock; p95 unter 2 ms im Fast Path.

### [M-007] Notiz-Verlauf ohne Vollinhalte ausliefern und begrenzen (P2)

- **Problem:** Der Trigger `notes_history_update` kopiert bei jeder Inhalts- oder Titeländerung den vollständigen alten Inhalt nach `note_history`, bis zu 100 Versionen pro Notiz. `GET /notes/:id/history` liefert alle 100 Volltexte auf einmal; Restore lädt ebenfalls alle.
- **Hinweise/Messwerte:** Trigger in `knowledge.ts`; 100 × 625 KB = 62,5 MB pro Notiz; 100 × 100 KB = 10 MB pro Verlaufsaufruf. Live ist die Tabelle derzeit leer, die Skalierung folgt direkt aus dem Code.
- **Betroffene Dateien:** `apps/server/src/notes/knowledge.ts:11–17,27–29`, `apps/server/src/notes/knowledgeRoutes.ts:29–37`, `apps/web/src/components/notes/NoteKnowledgePanel.tsx:17`.
- **Vorgeschlagene Änderung:** 1) History-Liste nur mit `id, title, revision, createdAt, sizeBytes` zurückgeben. 2) `GET /notes/:noteId/history/:entryId` für den ausgewählten Inhalt ergänzen. 3) Restore per `WHERE id=? AND note_id=?` statt Volliste. 4) Zusätzlich zur 100er-Grenze ein Byte-Budget pro Notiz (z. B. 8 MB) erzwingen und die ältesten Versionen zuerst löschen.
- **Implementierungsdetails:** `sizeBytes` aus `length(content)` oder einer neuen Spalte; Cleanup im Trigger oder im Save-Pfad. Die 100er-Grenze für kleine Notizen bleibt.
- **Erwarteter Nutzen:** Verlaufsöffnung von Megabytes auf wenige KB; Schreibamplifikation und DB-Wachstum bleiben begrenzt; Restore bleibt funktional.
- **Risiken:** Ein zusätzlicher Request beim Anzeigen einer Version. Restore- und Konflikttests müssen weiter grün sein; keine Version darf still verloren gehen, außer durch das dokumentierte Byte-Budget.
- **Umfang / Risiko / Abhängigkeiten:** Medium / Medium / keine; unabhängig von M-008.
- **Validierung:** 100 Versionen × 100 KB; Listenantwort unter 10 KB; ausgewählte Version lädt korrekt; Restore/Conflict; Byte-Budget greift.

### [M-008] Tasks und Backlinks ohne N+1 über alle Notizen (P2)

- **Problem:** `activeNotes()` liest zuerst alle Summaries und danach für jede Notiz `requireNote` (volles `SELECT *`). Tasks ruft zusätzlich pro Notiz `knowledge.metadata` auf. Backlinks wiederholt dasselbe und scannt danach jeden Volltext. Bei 1.000 Notizen entstehen über 1.000 synchrone Queries und 17,6 MB Reads pro Aufruf.
- **Hinweise/Messwerte:** `knowledgeRoutes.ts:15–27`; dokumentierte Fixture mit 1.000 Notizen und 17,64 MB Markdown; bei einer Notiz warm 1,3 ms, der Aufwand skaliert linear mit der Notizzahl.
- **Betroffene Dateien:** `apps/server/src/notes/knowledgeRoutes.ts:15–27`, `apps/server/src/notes/database.ts` (`list`, `get`), `apps/server/src/notes/tasks.ts`.
- **Vorgeschlagene Änderung:** 1) Eine Query `SELECT id, title, content, revision FROM notes WHERE archived = 0` ausführen. 2) Metadaten in einer zweiten Query oder per `LEFT JOIN` laden. 3) Backlinks per SQL-Vorfilter (`content LIKE '%noteId="…"%'`, escapen) auf Kandidaten reduzieren, dann den bestehenden Regex anwenden. 4) Tasks einmal über die Ergebnismenge parsen.
- **Implementierungsdetails:** `archived`-Filter beibehalten; keine Notiz zweimal lesen; die bestehende Task- und Backlink-Semantik bleibt. Eine materialisierte Tasktabelle ist erst nötig, wenn die Einmal-Scans weiterhin zu langsam sind.
- **Erwarteter Nutzen:** Statt 1.001+ Queries nur noch 2–3; bei 1.000 Notizen plausibel 100–300 ms auf unter 50 ms (Schätzung, nicht live gemessen).
- **Risiken:** LIKE-Vorfilter muss Sonderzeichen korrekt escapen; Backlink-Ergebnisse müssen identisch bleiben. Tests mit `%`, `_` und `\` ergänzen.
- **Umfang / Risiko / Abhängigkeiten:** Medium / Low / keine.
- **Validierung:** SQL-Zähler bei 1.000 Notizen; Tasks-/Backlink-Parität; Sonderzeichen; p95.

### [M-009] Notiz-Save und 3-s-Poll entkoppeln (P2)

- **Problem:** Der aktive Notiz-Detailpoll läuft alle 3 s und liefert den vollständigen Inhalt, der jedes Mal komprimiert wird. Der Save liefert ebenfalls die volle Notiz zurück, liest den Inhalt vorher und nachher vollständig und normalisiert ihn zweimal.
- **Hinweise/Messwerte:** `queryOptions.ts:170–176` (3 s, `refetchIntervalInBackground: false`), `database.ts:266–285` (`requireNote` + `get`), Save-Antwort mit `note`. Bei 625 KB sind das rund 625 KB pro Poll und rund 1,25 MB pro Save-Roundtrip.
- **Betroffene Dateien:** `apps/server/src/notes/database.ts:266–285`, `apps/server/src/notes/routes.ts`, `apps/web/src/lib/queryOptions.ts:170–176`, `apps/web/src/components/notes/NotesWorkspace.tsx:45`, `packages/contracts`.
- **Vorgeschlagene Änderung:** 1) `GET /notes/:id?sinceRevision=N` liefert bei unveränderter Revision `{ unchanged: true }` (wenige Bytes) statt des Volltexts. 2) Der Client behält bei `unchanged` den vorhandenen Query-Datenstand. 3) Save mit `?response=summary` liefert nur `id, revision, updatedAt`; bei Konflikt weiterhin die vollständige Serverfassung. 4) Im Save-Pfad den zweiten Voll-Select vermeiden, wenn nur Revision und Zeitstempel gebraucht werden.
- **Implementierungsdetails:** Revision erhöht sich bei Inhalts- und Metadatenänderungen; der Client merged die lokale Fassung mit der neuen Revision. Plugin-Aufrufer behalten den vollen Response als Default.
- **Erwarteter Nutzen:** Idle-Poll-Bytes für große Notizen um über 99 % reduziert; Save-Roundtrip und Brotli-CPU deutlich kleiner; die 3-s-Aktualität bleibt erhalten.
- **Risiken:** Vertrags- und Clientänderung; Konfliktpfad und Multi-Device-Aktualität müssen getestet werden. Kein `no-store` entfernen.
- **Umfang / Risiko / Abhängigkeiten:** Medium / Medium / nach M-007 sinnvoll, damit beide Notizantworten gemeinsam geändert werden.
- **Validierung:** 625-KB-Notiz mit zwei Clients; externer Edit; Konflikt; Save- und Poll-Bytes; Revision korrekt; keine veralteten Inhalte.

### [M-010] Preview-Status und -Logs cachen und sichtbarkeitsabhängig pollen (P2)

- **Problem:** `status` erkennt bei jedem Aufruf das Laufzeitprofil, liest Session-Optionen und ruft `supervisor.panes` auf – mindestens zwei tmux-Prozesse. Logs rufen pro Dienst `capture-pane -S -10000` auf und liefern bis zu 262 KB. Poll: Status alle 2 s, Logs alle 1,5 s.
- **Hinweise/Messwerte:** p95 56,60 ms (Status Detail), 48,34 ms (Logs), 43,65 ms (Liste). Live waren keine Previews aktiv; die Werte stammen aus den Route-Metriken.
- **Betroffene Dateien:** `apps/server/src/previews/DevServerManager.ts:49–79,188`, `apps/server/src/previews/runtimeLogs.ts:11`, `apps/web/src/lib/queryOptions.ts:120`, `apps/web/src/views/PreviewHubProject.tsx:61–62`.
- **Vorgeschlagene Änderung:** 1) Erkanntes Profil 30 s pro Projekt cachen; bei Start/Restart und Änderung der `package.json` invalidieren. 2) Status 1–2 s single-flight cachen. 3) `sessionOption` und `panes` in einem tmux-Aufruf bündeln oder gemeinsam cachen. 4) Logs nur pollen, wenn der Logbereich sichtbar und das Dokument nicht verborgen ist; alternativ Capture-Tiefe reduzieren oder inkrementell aus einer Datei lesen.
- **Implementierungsdetails:** Cache-Key aus Projektpfad und `package.json`-mtime; Log-Cursor je Session/Dienst, bei Restart verwerfen; Voll-Capture bleibt als Fallback.
- **Erwarteter Nutzen:** Status-p95 unter 10 ms; im eingeklappten/verborgenen Logbereich null Requests; weniger tmux-Prozesse und Netzlast.
- **Risiken:** Status bis 2 s alt; Logs können bei inkrementellem Lesen Zeilen verpassen, wenn der Cursor falsch gesetzt wird. Fallback und Tests.
- **Umfang / Risiko / Abhängigkeiten:** Medium / Medium / keine.
- **Validierung:** Start/Stop/Neustart; externe Paketänderung; Log-Tail vollständig; verborgener Tab erzeugt keine Log-Requests; p95.

### [M-011] Dashboard-Caches an die Poll-Intervalle koppeln (P2)

- **Problem:** `LOCAL_PORT_CACHE_MS` ist 5 s und der Dashboard-Poll ebenfalls 5 s, also ist fast jeder Aufruf kalt. Services cachen 10 s bei 5-s-Poll, jeder zweite Aufruf prüft systemd/HTTP neu. Jeder Port-Scan startet `ss` und mehrere HEAD-Probes.
- **Hinweise/Messwerte:** `/local-ports` erster Aufruf 28,6 ms; `/services` p95 46,19 ms; TTLs in `settings.ts:69–70`; Dashboard-Refresh in `config/wrapt.local.json`.
- **Betroffene Dateien:** `apps/server/src/config/settings.ts:69–70`, `apps/server/src/services/localPortService.ts:226–235`, `apps/server/src/services/serviceStatusService.ts:77`, `config/wrapt.local.json` (`dashboard.refresh`).
- **Vorgeschlagene Änderung:** Port-Cache auf 15 s und Service-Cache auf 30 s anheben; alternativ die Dashboard-Intervalle auf 15/30 s setzen. Manueller Refresh und `list(true)` beim Preview-Start bleiben.
- **Implementierungsdetails:** Beide Caches sind bereits single-flight; nur die TTL ändert sich. Die Anzeige bleibt bei Bedarf über den vorhandenen Refresh aktualisierbar.
- **Erwarteter Nutzen:** Zwei Drittel der Port-Scans und zwei Drittel der Service-Prüfungen entfallen; rund 20–40 ms pro 5 s weniger.
- **Risiken:** Ports/Dienste sind bis 15–30 s alt. Für ein lokales Dashboard vertretbar; der Nutzer kann manuell aktualisieren.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** `ss`-/systemctl-Zähler über 60 s bei offenem Dashboard; Anzeige plausibel; manueller Refresh sofort.

### [M-012] Hermes-Diagnose parallelisieren und cachen (P2)

- **Problem:** `GET /hermes/diagnostics` führt nacheinander `git status`, Token-/Proxy-/API-Prüfungen, `hermes acp --check` (15 s Timeout) und `hermes doctor` (30 s Timeout) aus. Ein Aufruf dauerte 13,87 s.
- **Hinweise/Messwerte:** Eigener Aufruf: 13,87 s, 3,4 KB Antwort; Code in `routes.ts:183–241`.
- **Betroffene Dateien:** `apps/server/src/hermes/routes.ts:183–241`.
- **Vorgeschlagene Änderung:** 1) Unabhängige Prüfungen mit `Promise.all` parallel starten. 2) Ergebnisse von `doctor` und `acp --check` 60 s cachen. 3) `POST /hermes/diagnostics/run` als expliziter Refresh, der den Cache leert. 4) Einzelne Prüfungen mit eigenem Timeout und Teilresultat zurückgeben.
- **Implementierungsdetails:** Die beiden CLI-Prüfungen dürfen bei Ressourcenkonflikt weiterhin seriell laufen; die HTTP-/Datei-/Git-Prüfungen sind unabhängig. `checkedAt` bleibt sichtbar.
- **Erwarteter Nutzen:** Unabhängige Prüfungen laufen gleichzeitig; der Erstlauf sinkt deutlich unter 13,9 s, Wiederholungen unter 1 s. Dominiert `hermes doctor` allein, bleibt dessen Laufzeit als Untergrenze.
- **Risiken:** Parallele Hermes-CLI-Aufrufe können sich gegenseitig verlangsamen; falls messbar, nur die HTTP-Prüfungen parallelisieren. Gecachte Diagnose kann veraltet sein.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** Laufzeit vor/nach; alle Prüfpunkte identisch; Fehlerpfade; Cache-Refresh.

### [M-013] Ungenutzten Usage-Index entfernen (P2)

- **Problem:** `usage_snapshot_lookup` belegt 132 KB bei 1.457 Zeilen und wird von keiner Query referenziert. Bei 1.155 Zeilen pro Tag wächst der unnötige Index linear mit; die 400-Tage-Retention bleibt unverändert.
- **Hinweise/Messwerte:** `dbstat`: `usage_snapshot_lookup` 132 KB, `usage_snapshots` 152 KB, `resets` 48 KB, `captured` 56 KB, Autoindex 112 KB. `EXPLAIN` der Forecast-Query nutzt `usage_snapshots_resets`; Codegrep findet nur die Indexdefinition.
- **Betroffene Dateien:** `apps/server/src/usage/database.ts:45,124`.
- **Vorgeschlagene Änderung:** Additive Migration `DROP INDEX IF EXISTS usage_snapshot_lookup`; die anderen Indizes und die Retention bleiben.
- **Implementierungsdetails:** Vor dem Drop prüfen, ob externe Diagnose-/Plugin-Queries den Index nutzen (im Repo: nein). Kein `ANALYZE`, kein `VACUUM` auf der Live-DB.
- **Erwarteter Nutzen:** 132 KB sofort; rund ein Drittel der Snapshot-Indexbytes entfällt; weniger Schreibarbeit pro Insert.
- **Risiken:** Sehr niedrig, falls keine externe Query den Index erwartet. Forecast-Ergebnisse müssen identisch bleiben.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** `dbstat` vor/nach auf einer Kopie; `EXPLAIN` der Forecast-Query; Forecasts bytegleich.

### [M-014] Dateimanager-Verzeichnisse begrenzt laden und pollen (P2)

- **Problem:** `filesystemTreeAll` lädt alle Seiten à 500 Einträge und pollt das komplette Verzeichnis alle 5 s. Bei 10.000 Einträgen sind das 20 Requests pro 5 s und ein entsprechend großer DOM-Baum.
- **Hinweise/Messwerte:** Code `apiClient/filesystem.ts:21–31`; Poll `FileManagerPanel.tsx:65–71`; live ist `/projects` klein (1 KB, 4–13 ms), die Grenze liegt bei großen Verzeichnissen.
- **Betroffene Dateien:** `apps/web/src/lib/apiClient/filesystem.ts:21–31`, `apps/web/src/components/files/FileManagerPanel.tsx:65–71`, `apps/server/src/filesystem/projectBrowserService.ts:97–111`.
- **Vorgeschlagene Änderung:** 1) Serverseitige Cursor-Pagination im Panel nutzen statt aller Seiten. 2) Liste virtualisieren oder in Blöcken nachladen. 3) Poll auf 10 s und bei unverändertem Verzeichnis per ETag/If-None-Match überspringen. 4) Nach Mutationen gezielt invalidieren.
- **Implementierungsdetails:** Suche/Sortierung müssen entweder serverseitig oder über die geladenen Seiten definiert bleiben; Auswahl und Breadcrumbs behalten.
- **Erwarteter Nutzen:** Requests und Bytes bleiben bei großen Verzeichnissen bounded; DOM und Scroll-Jank sinken.
- **Risiken:** Suche über noch nicht geladene Einträge verändert sich; Verhalten klar dokumentieren. Auswahl/Fokus-Tests.
- **Umfang / Risiko / Abhängigkeiten:** Medium / Medium / keine.
- **Validierung:** 500-/5.000-Eintrags-Fixture; Requests/Bytes; keine fehlenden Einträge; Suche/Sortierung; Mobiltest.

### [M-015] Notizsuche über einen Volltextindex statt Vollscan (P2)

- **Problem:** `NotesDatabase.search` liest den vollständigen Inhalt aller nicht archivierten Notizen und rankt in JavaScript. Bei 1.000 Notizen sind das 17,6 MB pro Suche; die Suche ist zwar entprellt, blockiert aber den Serverthread.
- **Hinweise/Messwerte:** `database.ts:146–176` (`SELECT … content … WHERE archived = 0`), `rankNoteMatches`; dokumentierte 1.000-Notizen-Fixture mit 17,64 MB.
- **Betroffene Dateien:** `apps/server/src/notes/database.ts:146–176`, `apps/web/src/components/notes/search/NotesCommandPalette.tsx:41–65`.
- **Vorgeschlagene Änderung:** FTS5-Tabelle für Titel und Inhalt mit Triggern für Insert/Update/Delete einführen; Suche zuerst über FTS5, danach die bestehende Ranking-/Excerpt-Logik auf den Treffern. Alternativ als Zwischenschritt: Titel/Excerpt vorfiltern und Volltext nur für Kandidaten lesen.
- **Implementierungsdetails:** FTS5-Verfügbarkeit in der gebündelten SQLite-Version prüfen; `unicode61`-Tokenizer, Prefix-Suche für Tippen, Snippets aus FTS5; Migration mit Rebuild; Fallback auf den bisherigen Pfad, falls der Index fehlt.
- **Erwarteter Nutzen:** Statt 17,6 MB pro Suche nur noch Indexzeilen; Ziel unter 20 ms bei 1.000 Notizen.
- **Risiken:** Ranking und Treffermenge können sich ändern; Umlaute, Aliase und Sonderzeichen testen. Migrationsgröße beachten.
- **Umfang / Risiko / Abhängigkeiten:** Large / Medium / nach M-008, weil beide die Volltextlesepfade betreffen.
- **Validierung:** Parität mit 100/1.000 Notizen, Umlaute, Codeblöcke, `%`/`_`; p95; Fallback.

### [M-016] Event-Loop-Metrik kalibrieren (P3)

- **Problem:** `monitorEventLoopDelay({ resolution: 20 })` meldet auch auf einem idle Loop etwa 20 ms Mean. Die Live-Anzeige 20,40 ms/p99 21,50 ms ist deshalb kein echter Lag; der Max-Wert 302 ms ist der einzige potenziell echte Ausreißer.
- **Hinweise/Messwerte:** Eigener Idle-Test mit identischer Resolution: Mean 20,38 ms, p99 21,35 ms. Live: Mean 20,40 ms, p99 21,50 ms.
- **Betroffene Dateien:** `apps/server/src/observability/metrics.ts:30,95–120`.
- **Vorgeschlagene Änderung:** Die Auflösung als Konstante mitschreiben und vom Mean/p99 abziehen, oder einmalig eine Idle-Baseline messen und subtrahieren. Max unverändert lassen.
- **Implementierungsdetails:** Die Korrektur nur für die Anzeige/Schwellen verwenden; Rohwerte für die Diagnose behalten. `degradedReasons` darf nicht auf dem Artefakt basieren.
- **Erwarteter Nutzen:** Vertrauenswürdige Diagnose; echte 300-ms-Blockaden bleiben sichtbar, falsche 20-ms-Alarme verschwinden.
- **Risiken:** Bestehende Dashboards interpretieren die Werte neu; Dokumentation anpassen.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** Idle-Mean unter 1 ms; künstlicher 100-ms-Block erscheint als rund 100 ms; Max bleibt erhalten.

### [M-017] Favicon verkleinern (P3)

- **Problem:** `favicon.svg` ist ein 139,7 KB großes SVG mit eingebettetem 512×512-PNG. Es wird mit 7 Tagen Cache ausgeliefert, ist aber beim ersten Besuch ein unnötiger 100-KB-Download.
- **Hinweise/Messwerte:** 139.712 B roh / 103.545 B Brotli; `index.html` referenziert es als Icon.
- **Betroffene Dateien:** `apps/web/public/favicon.svg`, `apps/web/index.html`.
- **Vorgeschlagene Änderung:** Ein echtes kleines SVG (Pfadform) oder ein 32/64-px-PNG als Favicon verwenden; das 512er-PNG bleibt nur für PWA-Icons.
- **Implementierungsdetails:** `favicon-32.png` existiert bereits; das SVG kann auf die einfache Capybara-Silhouette reduziert werden.
- **Erwarteter Nutzen:** Rund 100 KB weniger beim ersten Laden; keine Auswirkung auf bereits gecachte Clients.
- **Risiken:** Darstellung im Tab bei 16/32 px prüfen; kein Funktionsverlust.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** Bytegröße; Tab-Icon in Chromium/Firefox; PWA-Icons unverändert.

### [M-018] KaTeX-CSS erst mit dem Notizeditor laden (P3)

- **Problem:** `components/notes/index.css` importiert die vollständige `katex.min.css`; diese landet über `index.css` im Entry-CSS. Nutzer, die nie eine Formel öffnen, laden Regelwerk und Font-Gesichter mit.
- **Hinweise/Messwerte:** `katex.min.css` 24.788 B roh / 3.492 B Brotli; zusätzlich 10.844 B KaTeX-`@font-face` (4.544 B Brotli) im Entry-CSS.
- **Betroffene Dateien:** `apps/web/src/components/notes/index.css:3`, `apps/web/src/index.css:9`, `apps/web/src/components/notes/NoteEditor.tsx`.
- **Vorgeschlagene Änderung:** Den KaTeX-CSS-Import aus `notes/index.css` entfernen und in `NoteEditor.tsx` oder eine nur vom Notizeditor importierte CSS-Datei verschieben. Vite legt sie dann in den Lazy-CSS-Chunk der Notizroute.
- **Implementierungsdetails:** Die Notizroute lädt CSS und JS gemeinsam; Formeln erscheinen erst nach dem Editor-Load, also nach dem CSS. Kein FOUC auf anderen Seiten.
- **Erwarteter Nutzen:** Rund 8 KB Brotli weniger Entry-CSS; weniger Font-Gesichter im kritischen Pfad.
- **Risiken:** Formel-Styling muss beim ersten Öffnen geprüft werden; CSS-Reihenfolge.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** Entry-CSS kleiner; Formel in Notiz rendert korrekt; keine Formel-CSS auf Dashboard/Projekten.

### [M-019] Hermes-Status mit Stale-While-Revalidate (P3)

- **Problem:** Der Status Refresh startet zwei `systemctl --user show`-Prozesse und zwei HTTP-Aufrufe. Der Cache ist nur 1 s; bei langsamem Hermes wartet die Oberfläche bis zu 20 s (Request-Timeout). Gemessener p95: 3,1 s.
- **Hinweise/Messwerte:** Kalt 116,8 ms, warm 1,5–2,6 ms, p95 3.112 ms bei 16 Aufrufen; `statusCache` 1 s, `requestTimeoutSeconds: 20`.
- **Betroffene Dateien:** `apps/server/src/hermes/status-service.ts:52–61,103`, `apps/server/src/hermes/service-control.ts`, `apps/web/src/lib/queryOptions.ts:48`.
- **Vorgeschlagene Änderung:** Letzten erfolgreichen Status sofort ausliefern und die Fakten im Hintergrund aktualisieren (Single-Flight). Cache auf 5 s erhöhen; `checkedAt`/Alter anzeigen. Bei Fehler den letzten Stand mit Fehlerhinweis behalten.
- **Implementierungsdetails:** Aktive Aktionen (Start/Stop/Update) invalidieren den Cache sofort; nur der lesende Status nutzt stale Daten.
- **Erwarteter Nutzen:** Oberfläche reagiert nach dem ersten Laden in unter 10 ms; kein 3-s-Hänger bei langsamer Hermes-Instanz.
- **Risiken:** Status kann wenige Sekunden alt sein; sichtbares `checkedAt` und Fehlerzustand verhindern Missverständnisse.
- **Umfang / Risiko / Abhängigkeiten:** Small / Low / keine.
- **Validierung:** Simulierter 3-s-Upstream; UI-Latenz; Statuswerte; Fehlerfall; Aktionen invalidieren.

### [M-020] Backdrop-Filter-Stapel auf schwachen Geräten prüfen (P3)

- **Problem:** Das Entry-CSS enthält 64 `backdrop-filter`-Deklarationen, insgesamt 72 in `apps/web/src`. Mehrere Overlays (Kontextmenü, Dialog, Hover-Card, Panel-Island) können gleichzeitig übereinanderliegen. Jede Blur-Fläche kostet Compositing und kann auf Low-End-Geräten Frames kosten.
- **Hinweise/Messwerte:** 64 Treffer in `index.css`/Entry-CSS, 72 in allen CSS-Dateien; keine Frame-Messung in diesem Lauf (keine Browserinstanz).
- **Betroffene Dateien:** `apps/web/src/components/overlay-glass.css`, `apps/web/src/index.css`, `apps/web/src/components/context-menu/context-menu.css`, `apps/web/src/components/status/status-hover-card.css`.
- **Vorgeschlagene Änderung:** Zuerst mit Playwright/CPU4 messen. Danach nur die oberste overlay-Ebene blurren; verschachtelte Menüs und Eingaben opak auf `--color-ink-850` setzen; `prefers-reduced-transparency` beibehalten.
- **Implementierungsdetails:** Die vorhandenen Glas-Tokens weiterverwenden; keine Animationen oder Transparenz-Features entfernen. Nur die Anzahl gleichzeitig aktiver Filter reduzieren.
- **Erwarteter Nutzen:** Weniger Compositing-Layer; Ziel p95-Frame unter 16,7 ms und stabilere Interaktion auf dem mobilen Profil.
- **Risiken:** Sichtbare Designänderung bei verschachtelten Overlays; vorher/nachher Screenshots und Frame-Messung.
- **Umfang / Risiko / Abhängigkeiten:** Medium / Medium / Messung vor Umsetzung.
- **Validierung:** CPU4-Profil, Menü/Dialog/Hover gleichzeitig; Frame-p95, INP, Screenshots; Reduced Transparency.

## 5. Caching and Prefetching Strategy

- **Statische Assets:** Gehashte Dateien bleiben `immutable`, HTML und `sw.js` bleiben `no-cache`; Precompressed `.br`/`.gz` bleiben. Der Service Worker cached keine App- oder API-Daten. Keine Änderung nötig.
- **Subprozess-Fakten:** Terminal-Supervisor, Preview-Status/Profil, Temperaturen/Disks, Ports und Dienste bekommen kurze TTL-Caches (2–30 s) mit Single-Flight. Invalidierung ausschließlich durch fachliche Ereignisse: Terminal Create/Close/Restart/Resync, Preview Start/Stop/Restart, expliziter Refresh, Konfigurationswechsel.
- **Hermes:** Status 5 s plus Stale-While-Revalidate; Commit bleibt 60 s; Aktionen und Update invalidieren sofort. Diagnostics 60 s cachen, manueller Lauf leert den Cache.
- **Notizen:** Kein Server-Cache für Inhalte. Der Client behält React Query; Detailpoll wird über Revision/ETag bedingt, Save-Antworten werden auf Revision/Zeitstempel reduziert. Ungültig wird ausschließlich über die steigende Revision und die bestehenden Save-/Move-/Archive-Mutationen.
- **Dashboard:** Ports 15 s, Dienste 30 s, Metriken-Temperatur/Disks 30 s. Der Nutzer kann jederzeit manuell aktualisieren; `list(true)` beim Preview-Start bleibt.
- **Prefetching:** Hover/Focus/Pointerdown-Prefetch bleibt. Kein globales Idle-Prefetch aller Routen. Der App-Chunk wird per HTML-Preload vorgeladen, der Plugin-Runtime-Chunk bewusst nicht.
- **Nicht cachen:** Notizinhalte, Audit-Validierung, Terminal-Liveausgabe, Preview-Logs, API-Antworten mit Identitäts- oder Sessionbezug.

## 6. Do Not Do List

- Keine 400-Tage-/All-Time-Usage-Historie kürzen; die frühere Entscheidung bleibt. Nur den ungenutzten Index entfernen (M-013).
- Keine Notiz-Versionen, Polling-Funktion oder Konflikterkennung abschalten; nur Payloads verkleinern und bedingt antworten.
- Keine KaTeX-, TipTap-, Highlight- oder Terminal-Features wegen Bundlegröße entfernen; M-018 verschiebt nur CSS.
- Keine Backdrop-Filter, Animationen oder Transparenz pauschal entfernen; erst messen, dann Laufzeit verlagern (M-020).
- Kein `synchronous=OFF`, kein Entfernen von WAL, fsync, Audit-Outbox oder Backup-Pfaden.
- Kein globales `Cache-Control` für `/api/` aufheben; `no-store` bleibt für Live- und Identitätsdaten.
- Keine pauschale Virtualisierung aller Listen; nur Dateimanager/Notizsuche anhand der genannten Grenzen.
- Keine Service-Worker- oder CDN-Caches für API-, Session- oder Notizdaten.
- Keine Devserver, Nutzer-Previews, Slots oder tmux-Sessions für Tests verwenden.
- Keine Builds oder Neustarts aus diesem Audit ableiten; die laufende Workbench bleibt unverändert.

## 7. Roadmap

1. **P1, sofort und unabhängig:** M-001, M-002, M-003, M-004, M-005, M-006. Jede Maßnahme einzeln bauen, per Manifest/Netzwerk und Route-Metriken prüfen. M-003 nach M-001.
2. **P2, Notizdaten:** M-007 und M-008 zuerst, weil sie ohne Vertragsänderung die größte Skalierungswirkung haben. Danach M-009 mit Contract-/Client-Änderung und Konflikttests.
3. **P2, Preview und Dashboard:** M-010, M-011, M-012, M-013. M-013 kann als kleine DB-Migration vorgezogen werden.
4. **P2/P3, Grenzen:** M-014 und M-015 nur mit großen Fixtures und klarer Such-/Sortier-Semantik. M-016 direkt nach den Messungen, damit die Abnahme nicht auf einem 20-ms-Artefakt basiert.
5. **P3, Assets und Visuals:** M-017, M-018, M-019. M-020 erst nach CPU4-Messung; ohne Frame-Gewinn nicht umsetzen.
6. **Abnahme:** Nach jeder Maßnahme `pnpm typecheck`, `pnpm architecture:file-lines`, passende Unit-/Integrationstests und eine isolierte Produktionsmessung. Keine Abnahme allein über Node-Mikrobenchmarks; für UI zusätzlich Playwright auf eigener Instanz.
7. **Nicht in diesem Audit:** keine Umsetzung, keine Commits, keine Builds, keine Neustarts, keine Preview-Änderungen.

## 8. Open Questions

- Ist die 400-Tage-Retention der Usage-Snapshots weiterhin gewünscht, obwohl nur die letzten 96 Samples je Fenster für Prognosen gebraucht werden? Eine Kürzung wäre der größte DB-Wachstumshebel, ist aber durch die frühere Entscheidung blockiert.
- Reicht für den Notizverlauf ein Byte-Budget pro Notiz (z. B. 8 MB) statt 100 Versionen, oder müssen bei sehr großen Notizen zwingend 100 Versionen erhalten bleiben?
- Sind 5 s Dashboard-Refresh für Ports und Dienste nötig, oder sind 15–30 s mit manuellem Refresh akzeptabel?
- Soll die Hermes-Diagnose weiterhin alle Prüfungen bei jedem GET ausführen, oder ist ein manueller „Diagnose starten“-Lauf mit Cache der gewünschte Weg?
- Ist das aufwendige 512er-Favicon für Tab/PWA optisch erforderlich, oder reicht die vorhandene 32-px-Variante?

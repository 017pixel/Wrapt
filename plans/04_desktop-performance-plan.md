# Performanceplan: Desktop-Leistung ohne Funktionsverlust

Status: **Nur geplant — keine Implementierung in diesem Arbeitsschritt**\
Datum: 01.08.2026\
Geltungsbereich: aktueller Gesamtstand von `Remote_Workplace` im Arbeitsverzeichnis

## Ziel und Leitplanken

Die Workbench soll auf Desktop-Systemen spürbar weniger CPU, RAM, Netzwerk und Event-Loop-Zeit verbrauchen, während sich die Anwendung für Benutzer exakt gleich verhält. Es werden keine Werkzeuge, Routen, Sessions, Vorschauen, Terminalausgaben, Orbit-Zustände, Synchronisationen oder Diagnoseinformationen entfernt. Optimiert werden ausschließlich interne Berechnung, Aktualisierungsplanung, Datenweitergabe, Caching und Bündelung. Jede Änderung muss vor und nach der Umsetzung messbar sein, hinter einer Rückfallmöglichkeit stehen und bei einer Verschlechterung vollständig deaktivierbar sein.

## Analyse des Ist-Zustands

Der aktuelle Stand baut erfolgreich (`pnpm build`, 489 transformierte Web-Module). Die wichtigsten technischen Belastungen sind:

- **Orbit:** `OrbitWorkbench` hält bewusst alle Flow-Knoten aktiv (`onlyRenderVisibleElements={false}`). Das schützt aktuell Live-Inhalte, führt aber dazu, dass auch nicht sichtbare Knoten und deren React-Teilbäume arbeiten. `ToolNode` beobachtet zusätzlich den Viewport; Zoomänderungen können dadurch mehrere eingebettete Tools und xterm-Instanzen neu zeichnen. Für jede Node werden Eltern, Geschwister, Geometrie und Snap-Informationen wiederholt mit `find`, `filter` und `sort` berechnet.
- **Dauerhafte Routen:** `PersistentOutlet` hält bis zu zehn besuchte Routen im React-Baum, damit iframes, xterm-Instanzen und WebSockets ihren Zustand behalten. `inert` und `aria-hidden` stoppen jedoch keine Effects, Query-Observer, Timer, iframe-JavaScript-Ausführung oder Verbindungen. `AppShell` und `TerminalWorkspaceSync` bleiben zusätzlich auf jeder Route aktiv.
- **Polling und Beobachter:** Dashboard, Statusleiste, Kontext-Projektauswahl und geparkte Ansichten beobachten teilweise dieselben Daten. Dazu kommen kurze Intervalle für Health/Metriken, Terminal-Sessions, Orbit und Workspace-Synchronisation. Die Anfragen sind nicht das einzige Problem: wiederholte Parsing-, Mapping- und Renderarbeit findet auch bei unveränderten Daten statt.
- **Live-Inhalte:** Terminals verwenden xterm mit bis zu 5.000 Zeilen Scrollback und schreiben jede Ausgabe direkt in die Instanz. Preview-Runtimes halten iframes, Sessions, Bridge-Diagnose, Speicher-Synchronisation und erneuernde Timer. Der serverseitige Chromium-Browser erzeugt JPEG-Screencast-Frames und überträgt sie über WebSockets. Diese Funktionen bleiben vollständig erhalten; reduziert werden darf nur redundante Host-Arbeit und nicht die fachliche Datenübertragung.
- **Server und Datenbank:** Fastify verarbeitet mehrere `DatabaseSync`-Verbindungen, Dateisystem-/Git-Aktivitäts-Scans, Port- und Service-Probes, News-Synchronisation sowie Diagnose- und Audit-Arbeit im gemeinsamen Node-Prozess. Die Projektliste kann dadurch teuer werden; der Local-Port-Service löst zusätzlich Projektinformationen und Probes aus. Synchrone SQLite- und CPU-intensive Ranking-/Parsing-Arbeit kann den Event Loop während hoher Desktop-Aktivität verlängern.
- **Auslieferung:** Der aktuelle Build enthält einen gemeinsamen JavaScript-Chunk von rund 363 KB, globales CSS von rund 361 KB und große, bereits getrennte Route-Chunks, unter anderem für Terminal, Orbit und File Manager. Lazy Routes sind vorhanden, aber `routeModules.ts` lädt im Idle-Zustand mehrere häufige Routen vor. Das verursacht auf einem ansonsten unbeschäftigten Desktop nach dem Einstieg zusätzliche Parse-, Compile- und Speicherarbeit.

## Umsetzungsplan

### 1. Baseline, Szenarien und Budgets festlegen

- Eine reproduzierbare Desktop-Baseline auf Referenzhardware erstellen: Dashboard, Orbit mit kleinen und großen Arbeitsflächen, mehrere Tool-/Preview-Nodes, Terminal mit laufender Ausgabe, Browser-Stream, File Manager, News sowie Wechsel durch mindestens zehn Routen.
- Im Browser CPU-Zeit, Long Tasks, INP, FPS/Frame-Time, Heap nach Leerlauf, DOM-/React-Node-Anzahl, offene iframes und WebSockets messen. Zusätzlich werden Speicherprofile nach wiederholtem Öffnen/Schließen und nach Parken/Entparken von Routen aufgenommen.
- Serverseitig Request-P95/P99, Event-Loop-Verzögerung, RSS/Heap/External Memory, SQLite-Dauer/Zeilen/WAL-Größe, Prozesszahlen, Preview-Diagnosevolumen, WebSocket-Queues und Chromium-Ressourcen erfassen.
- Als vorläufige Leitwerte gelten: keine Erhöhung der Fehler- oder Reconnect-Rate, keine wachsende Queue ohne Grenze, stabile Speichernutzung nach zehn Routenschaltungen, keine neuen Long Tasks über 200 ms durch Prefetch oder Synchronisation und keine Verschlechterung der bestehenden UI-Antwortzeit. Konkrete Zahlen werden nach der Baseline festgeschrieben.

### 2. Orbit-Rendering und Geometrieberechnung entlasten

- Für Nodes, Gruppen, Eltern, Geschwister-Slots und Welt-Rechtecke abgeleitete Maps beziehungsweise inkrementell aktualisierte Indizes verwenden. Wiederholte `find`/`filter`/`sort`-Ketten in `OrbitWorkbench`, `orbitSnap.ts` und den Node-Views werden aus Drag-, Resize- und Zoom-Hotpaths entfernt.
- Flow-Nodes und Edges nur aktualisieren, wenn sich die dafür relevanten Daten geändert haben. Positionen während Dragging über den vorhandenen React-Flow-Changepfad verarbeiten, ohne pro Pointer-Event das vollständige Board neu abzuleiten.
- Viewport-Abhängigkeiten aus einzelnen Tool-Nodes herauslösen oder auf eine gezielte, gerundete Zoom-/Layout-Information begrenzen. xterm-Fontgröße, Refresh und Resize nur gebündelt auf dem tatsächlich angewendeten Zoomwert ausführen.
- Node-Komponenten und MiniMap so memoizieren, dass reine Viewport- oder Auswahländerungen keine unveränderten Node-Inhalte neu rendern.
- Eine mögliche Sichtbarkeitsoptimierung ausschließlich in Stufen prüfen: statische/inaktive Orbit-Inhalte dürfen virtualisiert werden, Live-Nodes mit iframe, Terminal, Browser oder WebSocket müssen ihren Zustand behalten. `onlyRenderVisibleElements` darf erst nach einem Charakterisierungstest geändert werden; ein einfaches Unmounting ist ausgeschlossen, weil es Sessions und UI-Zustand verschlechtern könnte.

### 3. Routen, Queries und Hintergrundarbeit koordinieren

- Einen zentralen Aktivitätskontext für aktuelle, sichtbare, geparkte und browserweit verborgene Bereiche einführen. Geparkte Routen behalten ihre Komponenten und Zustände, pausieren aber nicht-funktionale Refreshes, Diagnose-Flushing und reine Visualisierungsarbeit; beim Aktivieren wird der aktuelle Zustand sofort nachgeladen.
- Gemeinsame Abfragen für Statusleiste, Projektpicker, Dashboard und geparkte Routen deduplizieren. Polling soll pro Datenquelle zentral laufen, statt pro Observer denselben Timer und dieselbe Auswertung zu erzeugen. Die fachlichen Aktualisierungsintervalle und manuellen Refreshes bleiben erhalten.
- `TerminalWorkspaceSync` nur dann aktiv mit kurzer Frequenz arbeiten lassen, wenn Workspace-Daten relevant oder Änderungen zu speichern sind. Sichtbarkeitswechsel, Fokus und Speicherabschluss müssen weiterhin dieselben Änderungen zuverlässig übernehmen; kein geräteübergreifener Sync darf verloren gehen.
- Idle-Prefetch auf absichtliche Navigation, Hover/Fokus oder nachgewiesene freie Ressourcen begrenzen. `Save-Data`, langsame Verbindungen und bereits geladene Chunks werden berücksichtigt. Routen müssen beim ersten echten Öffnen weiterhin vollständig funktionieren.
- Orbit-/Projekt-/News-Observer bei unveränderten Antworten so kapseln, dass kein großer Teilbaum allein wegen eines globalen Status-Updates neu rendert.

### 4. Terminal-, Preview- und Browserpfade effizienter schedulen

- Terminalausgaben clientseitig bis zum nächsten geeigneten Renderzeitpunkt bündeln, ohne Bytes oder Sequenzen zu verwerfen. Reconnect, Snapshot, Scrollback, Eingabe, Resize, tmux-Zustand und Mehrgeräte-Broadcast bleiben unverändert.
- Resize-, Theme- und Zoomänderungen über einen gemeinsamen, begrenzten Renderpfad ausführen. Parkende Terminals behalten ihre Verbindung und ihren Inhalt, führen aber keine unnötigen Layout- und Canvas-Refreshes aus.
- Preview-Diagnosen je Runtime beziehungsweise Slot gesammelt und mit einer begrenzten Queue senden, anstatt bei jedem Ereignis React-State und JSON-Kopien großer Ringpuffer zu erzeugen. Session-Lease, Bridge-Handshake, Storage-Snapshot, Reset-Quarantäne und Fehleranzeige dürfen sich fachlich nicht ändern.
- Bereits laufende iframe-Previews und deren JavaScript werden nicht heimlich deaktiviert. Optimiert werden nur Host-Observer, gemeinsame Query-Ergebnisse, Diagnose-Flushes und unnötige Reload-/Resize-Auslöser.
- Für Terminal-, Browser- und Preview-WebSockets explizite Backpressure- und Queue-Grenzen einführen. Zustands-, Eingabe-, Steuer- und Terminaldaten bleiben verlustfrei und geordnet. Bei videotypischen Browser-Frames darf ausschließlich ein veraltetes Zwischenbild durch das neueste Bild ersetzt werden, sofern Eingaben, Navigation und sichtbarer Endzustand nachweisbar unverändert bleiben.
- Chromium-Screencast nur in bereits vorgesehenen Zuständen ohne aktive Listener anhalten. Auflösung, Bildqualität, Browserprofil, Navigation und geräteübergreifende Session-Semantik bleiben gleich.

### 5. Server, SQLite, Dateien und Hintergrundjobs entkoppeln

- Projektliste, Projektmetadaten, Aktivität und Local-Port-Erkennung getrennt cachen und als Single-Flight-Anfragen behandeln. Ein Local-Port-Scan darf nicht erneut vollständige Projekt-Aktivitätsscans anstoßen. Frische, manuelle Aktualisierung und Fehlerzustände bleiben identisch sichtbar.
- Die teuersten API-Routen mit Query-/Dateisystem-Timing versehen. Nur belegte Engpässe erhalten zusätzliche SQLite-Indizes, vorbereitete Statements oder eine kompatible Cache-Schicht. Schemaänderungen werden als rückwärtskompatible Migration mit Backup, Rollback und Prüfung auf identische Ergebnisse geplant.
- News-Synchronisation, Embedding-/Ranking-Arbeit, Diagnose-Rotation, Orbit-Backups und andere CPU-/I/O-intensive Aufgaben in begrenzte Hintergrundarbeit mit Single-Flight-Garantien überführen. Requests dürfen dadurch nicht auf veraltete oder unvollständige fachliche Ergebnisse wechseln; Status und Fehler müssen weiter geliefert werden.
- Reine Mess- und Audit-Endpunkte so gestalten, dass sie aus einem kurzen, gemeinsam erzeugten Snapshot lesen und nicht bei jedem Dashboard-Poll dieselben Prüfungen synchron wiederholen.
- Datei-Uploads, HTML-Bridge-Injection und Proxy-Weiterleitungen nur innerhalb der bestehenden Größenlimits streamen oder begrenzt puffern. Restart-Logtails und ähnliche Antworten werden byte-begrenzt gelesen; API-Format und Sicherheitsgrenzen bleiben bestehen.

### 6. Bundle, CSS und sichere Auslieferung verbessern

- Mit Bundle-Analyse und realen Route-Szenarien prüfen, welche gemeinsamen Imports den großen Initial-Chunk und `queryOptions` belasten. Nur unkritische, route-spezifische Teile weiter aufteilen; keine öffentliche API, Cache-Strategie oder Fehlerbehandlung verändern.
- Globales CSS auf ungenutzte Regeln und wiederholte Selektoren prüfen. Token, bestehendes Design, Layout, Responsive-Verhalten und alle Zustände bleiben visuell identisch; keine neuen Farben, keine Gradients und kein Entfernen scheinbar ungenutzter Zustände ohne Abdeckungstest.
- Brotli/Gzip, Precompressed Assets, Service-Worker-Cache und Hashing gegen die Zielbrowser prüfen. Ein kleineres Paket darf nicht dazu führen, dass Offline-/Reload-Verhalten, Deep Links oder die erste Navigation schlechter werden.

## Rollout und Rückfall

1. Baseline und Messinstrumente ohne Verhaltensänderung einführen.
2. Niedrigrisiko-Änderungen aus Polling-Deduplizierung, Idle-Prefetch, abgeleiteten Orbit-Indizes und gebündeltem Resize/Output umsetzen.
3. Server-Caches, Single-Flight und begrenzte Hintergrundjobs einzeln aktivieren und unter Desktop-Last vergleichen.
4. WebSocket-Backpressure sowie optionale Sichtbarkeits-/Virtualisierungsoptimierungen erst nach Charakterisierung und mit Konfigurationsschalter ausrollen.
5. Jede Stufe kann separat zurückgesetzt werden. Bei höherem Speicher, längerer Eingabeverzögerung, fehlenden Ausgaben, verlorenen Sessions, abweichender Synchronisation oder visueller Regression wird die betreffende Stufe deaktiviert, ohne Datenmigration rückgängig machen zu müssen.

## Abnahme ohne Feature-Verlust

- `pnpm typecheck`, `pnpm lint`, relevante Unit-/Integrations- und E2E-Tests bleiben grün.
- Desktop-Smoke-Tests decken Dashboard, Projektwechsel, Orbit-Auswahl/Drag/Resize/Snap/Undo, Tool- und Preview-iframe, Browser-Navigation/Eingabe/Screencast, Terminal-Ausgabe/Eingabe/Resize/Reconnect, File Manager, News, Usage, Settings, Deep Links und Route-Parking ab.
- Mehrgeräte- und Wiederanlauf-Szenarien decken Orbit-Sync, Workspace-Sync, Terminal-Snapshots, Preview-Storage, Diagnose-Flush, Backend-Neustart und laufende Browser-/Terminal-Sessions ab.
- Vorher/Nachher werden fachliche Antworten, Reihenfolge und Anzahl der Terminalsequenzen, sichtbare Orbit-Geometrie, Query-Ergebnisse, Session-IDs, Cache-/Offline-Verhalten und Fehlermeldungen verglichen.
- Die Optimierung gilt nur als erfolgreich, wenn CPU-/RAM-/Event-Loop-Budgets besser oder gleich sind und gleichzeitig keine bestehende Funktion, Aktualität, Bedienbarkeit oder Datenintegrität schlechter wird.

## Noch vor der Umsetzung zu messen

- Welche konkrete Route beziehungsweise welcher Orbit-Zustand den höchsten Desktop-CPU-Anteil verursacht.
- Ob die größten Peaks durch React-Rendering, xterm/iframe-JavaScript, Chromium-Screencast, SQLite/Dateisystem oder News-/Diagnosejobs entstehen.
- Wie viele geparkte Routen, iframes, WebSockets, Query-Observer und Terminal-Instanzen im typischen Desktop-Fall tatsächlich aktiv sind.
- Welche Server-Routen bei parallelem Dashboard, Orbit und Preview-Betrieb den Event Loop blockieren.
- Welche Performanceziele auf der realen Desktop-Hardware verbindlich akzeptabel sind; erst danach werden konkrete Schwellenwerte und Aktivierungsdefaults festgelegt.

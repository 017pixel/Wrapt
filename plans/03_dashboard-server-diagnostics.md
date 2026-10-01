# Plan: Dashboard als Server- und Laufzeitübersicht

## Ziel

Das Dashboard wird von einer statischen Übersicht zu einer kompakten Betriebszentrale für die Workbench. Die Projektliste im unteren Dashboard-Bereich entfällt, weil `/projects` dafür die zuständige Seite ist. Stattdessen stehen Serverdiagnose, laufende Prozesse und Projekte, Ports, Terminal-Sessions, Nutzungs-Limits, News und direkte Einstiege in die wichtigsten Werkzeuge im Vordergrund. Das bestehende T3-Code-Nightly-Design und die mobile Shell bleiben die Grundlage.

## Ist-Zustand

- `views/Dashboard.tsx` lädt aktuell Server-Übersicht, Systemmetriken, Dienste, Projekte und Command Reference. Die Projekte werden als eigener `ProjectCard`-Bereich am Seitenende angezeigt.
- Die benötigten Laufzeitdaten sind bereits vorhanden: `/server/summary`, `/server/metrics`, `/services`, `/local-ports`, `/terminal/sessions`, `/usage/dashboard` und `/news`.
- Der Server liefert zusätzlich `/system/operational-metrics` mit HTTP-, Event-Loop-, Prozessspeicher-, Audit-, Orbit- und Preview-Zahlen. Diese Route ist bisher noch nicht im Web-API-Client angebunden.
- Die gemeinsame Auswahl liegt im Workspace-Store als `selectedProjectId`. Workbench und Terminal verwenden diese Auswahl bereits für den Start im passenden Projekt. Orbit öffnet sich über `/workbench` mit der aktuell aktiven Arbeitsfläche.

## Umsetzung

1. **Dashboard neu ordnen und Projektblock entfernen**
   - Kopfbereich auf den Zweck „Serverstatus und laufende Arbeit“ ausrichten.
   - Oben eine kompakte Schnellaktionsleiste und einen sichtbaren Gesamtstatus platzieren.
   - Die eigenständige Projektliste mit `ProjectCard` entfernen. Projektdaten werden nur noch als Zuordnung innerhalb der laufenden Ports und Sessions verwendet.
   - Die bestehende Command Reference zunächst unverändert lassen. Sie ist nicht Teil der Projektliste und kann separat entfernt werden, falls mit „unterer Bereich“ der gesamte untere Bereich gemeint ist.

2. **Serverdiagnose erweitern**
   - Serverstatus, Version, Uptime, Betriebssystem, Kernel, Tailscale und die Build-/Boot-Marker in einer gut lesbaren Statuskarte bündeln.
   - CPU, RAM, Speicherplatz, Load Average und Temperatur als kompakte Live-Metriken beibehalten und klarer priorisieren.
   - Operational Metrics als technische Diagnose ergänzen: aktive und gesamte Requests, 4xx/5xx, P95/P99, Event-Loop-Latenz, RSS/Heap/External Memory, degradierte Gründe, Audit-Zustand sowie Orbit- und Preview-Slot-Zahlen.
   - Detailwerte wie die Route-Tabelle in einem einklappbaren Bereich zeigen, damit die Startansicht nicht zur unübersichtlichen Monitoring-Wand wird.

3. **Laufende Projekte, Prozesse, Ports und Terminal-Sessions sichtbar machen**
   - Ports und Terminal-Sessions anhand der `projectId` zu einer kompakten Laufzeitübersicht gruppieren.
   - Je aktivem Projekt mindestens Projektname, offene Ports, Portnummern, Protokoll, Prozessname/PID sowie Anzahl und Typ der Terminal-Sessions anzeigen.
   - Terminal-Sessions mit Status, Arbeitsverzeichnis, PID, verbundenen Clients, Erstellungszeit und letztem Update aufführen. Verwaiste oder beendete Sessions erhalten einen klaren Status und bleiben über die vorhandenen Aktionen erreichbar.
   - Nicht zuordenbare Ports und Sessions in einer eigenen Gruppe anzeigen. Es werden nur die bereits serverseitig gefilterten lokalen Listener verwendet, keine zusätzlichen Prozessargumente oder Secrets.
   - Bekannte Ports sollen über die vorhandene Preview-/Port-Logik geöffnet werden. Ein direkter Link auf `127.0.0.1` wird nur verwendet, wenn er im aktuellen Client-Kontext sinnvoll ist.

4. **Mini-Vorschau für Nutzung und News ergänzen**
   - Aus `usage/dashboard?range=30d` nur die Live-Limitfenster übernehmen: Verbrauch, Restanteil, Account/Provider und Reset-Zeit. Historische Charts und die vollständige Account-Verwaltung bleiben auf `/usage`.
   - Für News eine kleine Abfrage mit `unread=true` verwenden und die Gesamtzahl ungelesener Beiträge sowie den Synchronisationsstatus anzeigen. Die Karte führt zu `/tech-tldrs`.
   - Beide Karten mit eigener Lade- und Fehlerbehandlung versehen, damit ein Problem bei CodexBar oder der News-Pipeline nicht das gesamte Dashboard blockiert.

5. **Quick Actions für den täglichen Einstieg einbauen**
   - `T3 Code öffnen`: aktuellen Projektkontext übernehmen und `/t3-code` öffnen.
   - `Workbench öffnen`: die aktuelle `selectedProjectId` übernehmen und `/workbench` mit der aktiven Orbit-Arbeitsfläche öffnen.
   - `Neues Terminal`: im bestehenden Terminal-Store eine neue Shell-Session für das ausgewählte Projekt vorbereiten und `/terminal` öffnen.
   - `Nutzung öffnen` und `News öffnen` als direkte sekundäre Aktionen ergänzen. Alle Aktionen erhalten echte Touch-Ziele und sichtbare Zustände für fehlenden Projektkontext.

6. **Datenanbindung, Responsive-Verhalten und Prüfung**
   - Den vorhandenen Contract für `operationalMetrics` wiederverwenden und im `apiClient` sowie in `queryOptions` anbinden. Falls der Readiness-Status angezeigt wird, auch den bestehenden Readiness-Contract als eigene Abfrage verwenden.
   - Laufzeitdaten mit passenden Intervallen aktualisieren: Serverstatus und Metriken ungefähr alle 10 Sekunden, Ports und Dienste ungefähr alle 10 Sekunden, Terminal-Sessions gemäß bestehendem 3-Sekunden-Intervall, Nutzung und News ungefähr minütlich.
   - Die Gruppierung von Ports und Sessions in eine testbare, reine Hilfsfunktion auslagern. Dafür Unit-Tests für mehrere Projekte, nicht zuordenbare Prozesse, leere Daten und gemischte Session-Status ergänzen.
   - Desktop erhält ein dichtes Zwei-Spalten-Layout. Mobile zeigt die Karten untereinander, vermeidet horizontales Scrollen, hält Aktionen bei mindestens 44 × 44 Pixeln und nutzt `details` beziehungsweise ein Bottom Sheet für technische Details.
   - Neue Styles verwenden ausschließlich die Tokens aus `apps/web/src/index.css`, ohne Gradients, Emojis oder neue Hex-Farben. Abschließend `pnpm typecheck`, relevante Tests, Lint und einen mobilen sowie Desktop-E2E-Smoke-Test ausführen.

## Ergebnis und Abnahmekriterien

- Das Dashboard enthält keine doppelte Projektliste mehr.
- Serverzustand und Ressourcen sind auf einen Blick erkennbar, technische Diagnosen lassen sich gezielt aufklappen.
- Laufende Projektarbeit ist über Ports, Prozesse und Terminal-Sessions nachvollziehbar.
- Usage-Limits und ungelesene News sind als kompakte Vorschauen sichtbar und führen direkt zu ihren Detailseiten.
- Die wichtigsten Einstiege funktionieren mit dem aktuell ausgewählten Projekt und bleiben auf Desktop und Mobile gut bedienbar.
- Es ist keine neue Datenbankmigration erforderlich, solange die bestehende API für die Laufzeitdaten ausreicht.

## Offene Entscheidung vor der Umsetzung

Ich interpretiere „den unteren Bereich mit den Projekten entfernen“ als Entfernung der `Projekte`-Karte. Die darunter stehende `Command Reference` bleibt in diesem Plan bestehen. Wenn auch diese Karte weg soll, wird sie zusammen mit dem Projektblock entfernt und durch die Quick Actions ersetzt.

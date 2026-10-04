# Terminal: schneller und verlässlich

Goal-Status: complete (lokaler Abschlussvertrag)

## Abschlussvertrag

Das Terminal öffnet bestehende und neue Sitzungen ohne schwarzen Hänger,
verbindet nach Unterbrechungen wieder und zeigt vorhandene sowie neue Ausgabe
lückenlos. Eingabe, Größenänderungen, Split, Gruppen, Persistenz und Neustart
funktionieren auf Desktop und kleinen Touch-Displays. Die Projekt-/Pfadwahl
entfällt im Terminal. Bestehendes Wrapt-Design und öffentliche Verträge bleiben
erhalten.

Ergänzung: Der Terminalkern unterstützt Linux, macOS und natives Windows.
Shell-Start, Betriebssystemvariablen, Pfadverträge, CWD-Meldungen und Prozessende
werden getrennt geprüft. Echte Windows-/macOS-PTY-Läufe erhalten eine CI-Matrix;
auf diesem Linux-Host werden diese Betriebssysteme nicht als nativ getestet ausgegeben.

Nachweise: Regressionstests für Sync, Transport, Renderer und Gruppen;
Typecheck, Lint, Architekturprüfung, Tests und isolierter Produktionsbuild;
End-to-End mit echten PTYs und Playwright-MCP auf Desktop und Mobil;
abschließender unabhängiger Luna-Review.

Grenzen: Keine laufenden Nutzerterminals, Dienste, Previews, Slots oder
tmux-Sitzungen verändern. Keine Änderungen an produktiven Daten. Kein Neustart,
Commit oder Push. Vorhandene lokale Änderungen erhalten. Testbuilds und
Browserdaten ausschließlich in temporären Verzeichnissen.

## Ausgangszustand

- Viele vorhandene lokale Änderungen, auch in Terminal-UI und Zustand.
  Baseline-Kopie unter `/tmp/wrapt-terminal-baseline-8jlzy30w`.
- ResizeObserver lässt seine Frame-ID gesetzt und ignoriert spätere Resizes.
- Delta-Sync setzt den Verbindungsstatus nicht zurück auf verbunden.
- Asynchroner Headless-Parser kann dem Snapshot vorausgehende Ausgabe noch
  nicht enthalten; der Server liefert diesen Rest bisher nicht nach.
- Asynchrone Create-/Restart-Fehler haben keine Routing-ID und verschwinden
  im gemeinsamen Socket.
- Testserver und Builds sind bereits für temporäre Verzeichnisse ausgelegt.
- T3-Automation-Host fehlt; konfigurierter headless Playwright-MCP ist lokal
  vorhanden und wird für die Browserprüfung isoliert aufgerufen.

## Checkpoints

- [x] Regeln, Struktur, lokale Änderungen und Terminal-Datenfluss prüfen.
- [x] Ausgangstests und reproduzierbare Fehler dokumentieren.
- [x] Backend-Sync und Fehlerzuordnung korrigieren, Regressionen prüfen.
- [x] Renderer/Transport, Resizing und Eingabe überarbeiten und prüfen.
- [x] Terminalfläche und Gruppenbedienung vereinfachen, Projektwahl entfernen.
- [x] Linux, macOS und Windows: Shell, Pfade, Prozesssteuerung und native Prüfmatrix implementieren; Linux lokal prüfen.
- [x] Echte Abläufe und Ladezeiten auf Desktop/Split/Mobil prüfen.
- [x] Versionierung, Dokumentation und vollständige Checks abschließen.
- [x] Unabhängiger Abschlussreview und Abnahme gegen den lokalen Vertrag.

## Arbeitsgrenzen

Pro Fehler höchstens zwei unveränderte Fehlversuche, danach Ursache neu prüfen.
Fortschritt nach jedem Checkpoint aktualisieren. Native Goal-Fortsetzungen
nutzen, wenn der Umfang einen Turn überschreitet. Nur der Abschlussreview wird
delegiert, wie vom ausdrücklich aktivierten Goal-Skill vorgeschrieben.

## Aktueller Stand

Baseline: 82 Backend- und 98 Frontend-Tests sowie Typecheck erfolgreich. Drei
neue Sync-Tests scheiterten vor der Korrektur und bestehen danach.

Korrigiert: Snapshot mit ausstehenden Deltas, geordneter Renderer-Reset,
Delta-Verbindungsstatus, Routing asynchroner Fehler, Timer-Cleanup und
Heartbeat-Erholung, Geometrie-Eigentümerwechsel auch bei unveränderter Größe,
Wiederanhängen des PTY-Gateways beim Subscribe nach Backend-Neustart.

UI: Projektwahl und Projekt-Abhängigkeit entfallen für die Terminalroute;
Ordner direkt benennen, Sammelaktionen erfassen Root-Ordner; sichtbare
Aktionsbuttons und Tastaturzugriff; mobile Einzelfläche bewahrt andere Panes;
Sidebar schließt nach mobiler Auswahl. Neustart funktioniert auch ohne
geladenen Renderer. Konfiguration bleibt Quelle für das Shell-Home.

tmux übernimmt Optionen und Metadaten mit einem statt neun blockierenden
Aufrufen. Alte workbench-Sitzungen behalten beim Wiederanhängen denselben
Prozess. Ausdrücklich persistente Einträge starten nach Prozessverlust wieder;
einzelnes Beenden schließt auch die Runtime und gibt ihren Platz frei.

Plattformen: Bash bleibt auf Linux/macOS der bisherige Standard. Windows nutzt
PowerShell/ConPTY, CWD-Promptintegration, Windows-Systemvariablen und signalarmes
Beenden. npm-Shims werden unter Windows korrekt gestartet. Pfadverträge,
Sidebar und Split-CWD akzeptieren Laufwerks- und UNC-Pfade. Die Konfiguration
enthält eine optionale Shell-Auswahl; Builds verwenden portable Node-Dateioperationen.
Terminalverträge liegen fachlich getrennt in `packages/contracts/src/terminal.ts`
und bleiben über den bisherigen Einstieg exportiert.

Wrapt-Version: 2.1.0; Contracts: 0.17.0. README, Changelog und Terminal-Anleitung
sind aktualisiert. Persistierte Workspace-Strukturen bleiben unverändert.

## Abschlussnachweise

- `pnpm test`: 2.017 erfolgreich ausgeführte Tests, davon Server 694,
  Web 779, Contracts 90 und Extension-Contracts 454.
  Protokoll: `/tmp/wrapt-terminal-platform-full-tests.log`.
- `pnpm test:terminal:platform`: 42 Tests erfolgreich auf Linux, einschließlich
  echter PTY und Wiederanhängen derselben tmux-Pane-PID in beiden Namespaces.
  Windows-/macOS-Prozesspfade werden zusätzlich gezielt mit Adaptern geprüft.
  Protokoll: `/tmp/wrapt-terminal-platform-matrix-local.log`.
- Typecheck, Lint, Architekturprüfung, Diff-Prüfung und isolierter
  Produktionsbuild erfolgreich. Web-Ausgabe nur unter
  `/tmp/wrapt-terminal-goal-web`, nicht im produktiven Web-Dist.
- Chromium: 18 E2E-Prüfungen ohne Retry erfolgreich. Firefox und WebKit:
  zusammen 12 E2E-Prüfungen ohne Retry erfolgreich.
  Protokolle: `/tmp/wrapt-terminal-platform-final-e2e.log` und
  `/tmp/wrapt-terminal-platform-cross-browser-e2e.log`.
- Konfigurierter Playwright-MCP prüfte Desktop sowie 390 × 844 und 844 × 390:
  volle Terminalbreite, kein horizontaler Überlauf, ein sichtbares Pane mit
  zwei erhaltenen Renderern, keine Konsolenfehler oder Warnungen.
- Einzelmessung auf dem isolierten Loopback-Server: erste Verbindung 173 ms,
  sichtbare Antwort nach Eingabe 108 ms, neues Split-Terminal 167 ms.
  Dies sind lokale Messwerte, keine Zusage für Netz- oder Shell-Startzeiten.
- Unabhängiger Luna-Abschlussreview ohne verbleibenden konkreten Befund.
  CI-Pfadfilter nach Review um Root-Konfiguration und Paketdateien ergänzt.
- Eigener Browser und Testserver beendet; eigene Ports wieder frei.
  Workbench- und T3-Prozess blieben während der Abschlussprüfung unverändert.
  Keine Nutzer-Preview, kein Nutzerslot und kein produktiver Terminalprozess
  wurden durch diese Arbeit verändert. Kein Commit, Push oder Dienstneustart.

## Verbleibende Aktivierung und Plattformnachweise

Die Drei-OS-CI liegt in `.github/workflows/terminal-platforms.yml`. Native
Windows- und macOS-Läufe sind hier nicht ausgeführt worden und bleiben als
externe Nachweise offen. Linux wurde mit realen PTYs geprüft.

Direkte Windows-Terminals überleben Browser- und Netzunterbrechungen; ein
Backend-Neustart startet persistente Einträge als neue Prozesse. Laufende
Befehle über Backend-Neustarts erfordern tmux, unter Windows also WSL.

Die laufende Workbench wurde nicht aktiviert oder neu gestartet. Dafür verlangt
`AGENTS.md` eine separate Nutzeranweisung, weil der Neustart die Coding-Sitzung
beenden kann. Lokale Implementierung, Prüfungen und Dokumentation sind fertig.

# Orbit-Performance-Harness

Der Harness aus Abschnitt 9 misst Orbit in Google Chrome mit sichtbarem Browserfenster auf einem eigens gestarteten E2E-Server. Er startet keinen Server selbst und darf nur aus einem isolierten Checkout ausgeführt werden: Der E2E-Server nutzt `apps/server/dist/`; ein Build im aktiven Workbench-Checkout kann dessen Dateien verändern.

## Voraussetzungen

- Node 22 und pnpm aus dem isolierten Checkout; dort `pnpm install` und `pnpm build` ausführen.
- Die Portreihe `WRAPT_E2E_PORT` bis `WRAPT_E2E_PORT + 130` ist frei.
- Die festen Ports `12401` bis `12408` sind frei. Der Harness prüft sie vor dem Start der Preview-Fixtures und bricht bei einer Belegung ab.
- Auf macOS ist der Energiemodus während des Laufs stabil; Chrome kann ein sichtbares Fenster öffnen. `WRAPT_ORBIT_PERF_ENERGY_MODE` hält den verwendeten Modus im Bericht fest.
- Das Browserdokument muss während der Gesten sichtbar bleiben. Der Harness bringt jede Messseite nach vorn und weist pro Geste mindestens 90 % RAF-Zeitabdeckung nach. Auf macOS Display- und Ruhezustand für den Lauf mit `caffeinate -d -i` verhindern.
- Während des Messlaufs darf keine weitere sichtbare Playwright-/Browserautomation laufen; konkurrierende Eingaben oder Fokuswechsel verfälschen die Sichtbarkeit und Gesten.
- Der Testlauf hat ein Timeout von 20 Minuten: Er führt fünf Wiederholungen je Canvas-Szenario mit fünf Gesten à sechs Sekunden aus, zusätzlich zur Preview- und Routenmatrix.

## Isolierten E2E-Server starten

In Terminal A, aus dem isolierten Checkout:

```bash
export WRAPT_E2E_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/wrapt-orbit-perf.XXXXXX")"
export WRAPT_E2E_KEEP_ROOT=true
export WRAPT_E2E_PORT=13100
export API_RATE_LIMIT_MAX=10000
mkdir -p "$WRAPT_E2E_ROOT/web-dist"
cp -R apps/web/dist/. "$WRAPT_E2E_ROOT/web-dist/"
export WRAPT_E2E_WEB_OUT_DIR="$WRAPT_E2E_ROOT/web-dist"
unset WRAPT_E2E_EXTERNAL
node scripts/start-e2e-server.mjs
```

`WRAPT_E2E_ROOT` muss unter dem vom Betriebssystem gesetzten `TMPDIR` liegen; auf macOS ist das
oft `/var/folders/...`, nicht `/tmp`. Der Web-Build wird in einen Unterordner der isolierten Root
kopiert, weil der E2E-Server externe Build-Pfade ablehnt. Die gestartete Instanz verwendet eine
eigene Datenbank und ein eigenes Home unter `WRAPT_E2E_ROOT`. Den angezeigten Server-Start
abwarten. Dieser Terminalprozess bleibt während der Messung aktiv.

## Messung ausführen

In Terminal B, im selben Checkout, `WRAPT_E2E_ROOT` auf denselben von Terminal A ausgegebenen Pfad setzen:

```bash
export WRAPT_E2E_ROOT="/var/folders/.../wrapt-orbit-perf.DEIN-PFAD"
export WRAPT_E2E_KEEP_ROOT=true
export WRAPT_E2E_PORT=13100
export WRAPT_E2E_URL="http://127.0.0.1:13100"
export WRAPT_E2E_EXTERNAL=true
export WRAPT_E2E_ISOLATED=true
export WRAPT_ORBIT_PERF_ALLOW_ISOLATED_RESET=true
export WRAPT_ORBIT_PERF_ENERGY_MODE="Netzbetrieb, Energiesparmodus aus"
export WRAPT_ORBIT_PERF_VIEWPORT=1440x960
export WRAPT_ORBIT_PERF_DPR=1
export WRAPT_ORBIT_PERF_OUTPUT="/tmp/orbit-perf/mac-chrome-2026-09-26"
caffeinate -d -i pnpm exec playwright test --config=playwright.orbit-performance.config.ts tests/e2e/orbit-performance.spec.ts
```

Der Port in den Umgebungsvariablen muss dem Server aus Terminal A entsprechen. Den Energiemodus und den Ausgabepfad pro Lauf passend setzen. Der Ausgabepfad ist ein absoluter Präfix ohne `.json` oder `.md`; vorhandene Zieldateien werden nicht überschrieben.

## Projekt-Devserver-Start separat messen

Der folgende Test startet und stoppt fünfmal ausschließlich eine temporäre lokale Node-Fixture.
Er protokolliert den Klick bis zum Zustand „Läuft“ und bis zum ersten sichtbaren Fixture-Inhalt
in einem neuen Tab. Er verändert weder den aktiven Workbench-Dienst noch Nutzer-Previews. Die
Prozessstarts sind kalt; Betriebssystem- und Dateicaches bleiben erhalten. Der Lauf schreibt einen
nicht überschreibbaren JSON-Bericht unter `/tmp/wrapt-preview-start-*`.

Im isolierten Checkout mit freien Testports:

```bash
TMPDIR=/tmp WRAPT_E2E_PORT=13100 WRAPT_E2E_USER=user@example.com \
  WRAPT_PREVIEW_START_ENERGY_MODE="Akku 52 %, Low-Power aktiv" \
  pnpm exec playwright test tests/e2e/preview-start-performance.spec.ts --project=chromium
```

`WRAPT_PREVIEW_START_ENERGY_MODE` an den gemessenen Energiemodus anpassen. Der isolierte
Playwright-Server baut und startet aus diesem Checkout mit eigener Testdatenbank. Auf macOS hält
`TMPDIR=/tmp` den tmux-Socketpfad kurz genug. Resultate aus verschiedenen Geräten, Energiemodi und
Viewports sind nicht direkt als Vorher/Nachher-Paar vergleichbar.

## Umfang und Grenzen

- Jeder der fünf Laufindizes enthält beide Canvas-Szenarien; dadurch entstehen fünf Messungen pro Szenario. Die kleine Fläche besteht aus 12 Notiz-Knoten, 8 Kanten und keinem iframe. Die Stressfläche besteht aus 80 Knoten, 60 Kanten und genau einem sichtbaren iframe.
- Pro Szenario und Lauf folgen je sechs Sekunden Pan, Wheel-Zoom, CDP-Pinch, Knoten-Drag und Resize. Der aggregierte p95 jeder kleinen Flächengeste muss höchstens 16,7 ms (60-Hz-Ziel) betragen; bei der Stressfläche gilt höchstens 33,3 ms. Für jedes Szenario werden Median, p95 und p99 je Geste sowohl pro Wiederholung als auch über alle fünf Wiederholungen ausgegeben. Zeitperzentile sind nur gültig, wenn jede Geste im sichtbaren Dokument mindestens 90 % RAF-Zeitabdeckung erreicht; der Bericht weist Abdeckung und Sichtbarkeit aus und der Lauf schlägt andernfalls fehl.
- Die Stressfläche nutzt das lokale SPA-Fixture `tests/fixtures/preview-apps/server.mjs` (Port 12401). Die Fixture-Konfiguration hat `projectId: "wrapt"` und eine feste Storage-Profil-UUID. Bei jeder Stress-Wiederholung werden kalte Orbit-Erstöffnung bis zur interaktiven Canvas-Ansicht und Preview bis „SPA bereit“ getrennt erfasst.
- Warme Navigation: zehn Orbit↔Notes-Wechsel. Gemessen wird im Browser vom Navigationsklick bis zum ersten Frame mit aktiver Zielroute, ohne Playwright-IPC-Zeit. Zusätzlich ein ungemessener Preview-Warm-up-Zyklus und zehn gemessene Zyklen mit je drei Übergängen Orbit-Knoten → Orbit-Preview-Verwaltung (`/orbit/previews`) → Standalone `/previews` → Orbit-Knoten. Damit werden 30 Preview-Routenwechsel pro Wiederholung protokolliert.
- Bei jedem Preview-Übergang werden Session-ID, Slot-ID, Anzahl eigener Slots für die Fixture, aktive iframe-Element-IDs, Mount/Unmount-Ereignisse, iframe-Navigationen und ein localStorage-Sentinel aufgezeichnet. Der Lauf schlägt fehl, wenn die Session-/Slot-Identität oder der Sentinel nicht erhalten bleibt oder mehr als ein eigener Fixture-Slot aktiv ist.
- Die Datei enthält Frameintervalle, Median/p95/p99, Frames über 100 ms und `longtask`-Anzahl/Dauer. Falls `PerformanceObserver` `longtask` nicht unterstützt, wird das als nicht verfügbar ausgegeben, nicht als null Langaufgaben.
- Ergebnisse landen in `<Präfix>.json` und `<Präfix>.md`. Zusätzlich schreibt der Harness nach jedem vollständig abgeschlossenen Laufindex atomar `<Präfix>.progress.json`; damit bleiben abgeschlossene Wiederholungen auch bei einem späteren Timeout nachvollziehbar. Bei einem Abbruch mitten in einer Wiederholung zeigt die Datei den letzten vollständig gespeicherten Stand. Vorhandene Ziel- oder Fortschrittsdateien werden nicht überschrieben.
- Warmrückkehr zur Orbit-Fläche wartet nur begrenzt auf die bereits persistente Orbit-Ansicht und ihr iframe. Die vollständige Knoten-/Kantenprüfung und „SPA bereit“-Prüfung bleibt bei der kalten Erstöffnung, damit Fehlerpfade nicht bei jedem der 30 gemessenen Preview-Wechsel erneut bis zu 30 Sekunden blockieren.
- Die RAF-Abdeckung und Sichtbarkeit jeder Geste werden unmittelbar nach dieser Geste geprüft. Ein ungültiger erster Messpunkt beendet den Lauf früh mit den konkreten Abdeckungswerten; die Laufdauer und fünf Wiederholungen werden dadurch nicht verkürzt.
- Der JSON-Bericht hält kleine und Stress-Fixture mit jeweils fünf Wiederholungen getrennt; der Markdown-Bericht zeigt beide Szenarien, Einzelwerte je Lauf und die Aggregation über ihre fünf Läufe.
- Diese Orbit-Messsuite misst Preview-Routen und Slot-Identität, startet aber keinen Projekt-Devserver. Dessen Start bis „Läuft“ und bis zum ersten gerenderten Inhalt hat einen separaten Fünf-Läufe-Test oben; ein Vorher/Nachher-Paar unter gleichen Bedingungen fehlt weiterhin. Terminal-Zoom und Windows-Messungen benötigen ebenfalls getrennte Prüfungen.
- Die Fixture-Datei startet beim Harness-Lauf ihre vorgesehenen Loopback-Test-Fixtures; im Orbit wird nur die SPA verwendet. Es werden weder Projekt-Devserver noch Nutzer-Previews geöffnet.

Nach dem Lauf die E2E-Instanz in Terminal A mit `Ctrl+C` beenden. Der Harness räumt die von ihm erzeugten Preview-Sessions auf und stoppt die gestarteten Preview-Fixtures im Testabschluss.

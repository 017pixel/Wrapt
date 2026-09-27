---
name: landingpage-screenshots
description: Aktualisiert die Screenshots der Wrapt-Landingpage aus einer isolierten Demo-Instanz mit reinen Dummy-Daten. Verwendet diesen Skill, wenn die Landingpage-Screenshots erneuert werden sollen ("Screenshots aktualisieren", "Bilder neu aufnehmen", "Aufnahmen der Landingpage", "Landingpage-Assets erneuern") oder wenn sich UI, Inhalte oder Demo-Daten geändert haben und die zehn PNGs unter "Landing Page/assets/" neu entstehen sollen.
---

# Landingpage-Screenshots aktualisieren

Kanonischer Ablauf für alle Werkzeuge (Codex, OpenCode und andere). OpenCode
liest zusätzlich den Verweis unter `.opencode/skills/landingpage-screenshots/`,
der auf diese Datei zeigt.

Dieser Skill beschreibt den kompletten Ablauf, mit dem die zehn Produktaufnahmen
der Landingpage in `Landing Page/assets/` neu entstehen (acht Desktop-Motive,
zwei Handy-Motive). Alle Aufnahmen kommen aus einer isolierten Wrapt-Instanz mit
erfundenen Daten; die laufende Workbench wird dafür nicht angefasst.

## Grenzen (immer einhalten)

- Keine Neustarts der laufenden Workbench: kein `pnpm dev`, keine `scripts/restart-*.sh`,
  kein `systemctl`, kein Kill auf Port 3010, 3773 oder 5173.
- Keine Preview-Sessions oder Devserver des Nutzers stoppen.
- Nicht `apps/web/dist` überschreiben. Der Web-Build für die Fixture läuft in einen
  Temp-Ordner (`WRAPT_E2E_WEB_OUT_DIR`).
- Keine echten Namen, Hostnamen, Pfade (`/Users/...`), E-Mails oder Tokens in Bildern.
  Erlaubt sind nur Werte wie `demo-server`, `demo@example.com`, `demo`.
- `config/wrapt.local.json` nie als Config-Quelle der Fixture verwenden, nur
  `config/wrapt.example.json`.

## Ablauf

### 1. Ports und Bau prüfen

```bash
lsof -nP -iTCP -sTCP:LISTEN          # Portbereich 3410..3540 muss frei sein
WRAPT_E2E_WEB_OUT_DIR="$TMPDIR/wrapt-screenshots-web" pnpm build
```

Der Build erzeugt Contracts, `apps/server/dist` und den Web-Build im Temp-Ordner.
Das echte `apps/web/dist` bleibt unangetastet. Ohne Web-Build bricht der Starter ab.

### 2. Fixture starten

```bash
node scripts/start-screenshot-server.mjs --reset
curl -s http://127.0.0.1:3410/api/v1/health
```

`--reset` löscht den Temp-Root (`$TMPDIR/wrapt-screenshots`) und legt Config,
SQLite, Dummy-Projekte, Dummy-Accounts, Notizen und das Orbit-Board neu an.
Ohne `--reset` werden vorhandene Dummy-Daten weiterverwendet (schneller).
Der Starter prüft alle Ports selbst und bricht bei Belegung ab.

Ports: App 3410, T3 3411, OpenCode Web 3412, Preview-Slots 3420..,
Preview-Devserver 3440, CodexBar-Ersatz 3530, Slot-Origins 3510..
Web-App: `http://127.0.0.1:3410/wrapt/`, Health: `/api/v1/health`.

### 3. Aufnehmen

```bash
node scripts/capture-landing-screenshots.mjs
```

Das Skript baut eine Chromium-Session mit `deviceScaleFactor: 2`, dunklem
Farbschema und der Identität `screenshot@example.com`, ersetzt `serverName`
per Route-Interception durch `demo-server` und schreibt die PNGs direkt nach
`Landing Page/assets/`. Danach skaliert `sips` jedes Bild auf die Zielgröße
(Desktop 1440×900, Mobil 390×844), damit die 2-fache Aufnahme scharf bleibt.
Das Skript nimmt rund drei bis sechs Minuten in Anspruch.

### 4. Bilder prüfen

Jede Datei einzeln ansehen (Read-Tool) und gegen diese Kriterien prüfen:

- OLED-Dark, keine cremefarbenen, lila oder hellen Flächen.
- Beispieldaten sichtbar, keine leeren Zustände, keine Spinner, keine Fehlerkarten.
- Kein echter Hostname, kein `Benjamin`, kein `fritz.box`, kein `/Users/`, kein
  `/private/var`, keine echte E-Mail.
- Nichts abgeschnitten, Statusleiste unten links zeigt die aktuelle Version.

Größen prüfen: `sips -g pixelWidth -g pixelHeight "Landing Page/assets/"*.png`

### 5. Landingpage bauen und ansehen

```bash
node build.mjs            # in "Landing Page/"
```

Danach `dist/` auf einem freien Port servieren und Desktop (1440 px) sowie Mobil
(390 px) prüfen: alle zehn Bilder laden, Layout intakt, kein horizontales Scrollen.

### 6. Aufräumen und berichten

```bash
node scripts/start-screenshot-server.mjs --stop
```

Im Bericht: welche Assets neu sind, Health-Version der Fixture, gefundene
Abweichungen, was nicht geprüft werden konnte.

## Subagenten-Aufteilung

Der Ablauf passt gut zu zwei Subagenten, der Hauptagent prüft selbst:

- **Aufnahme-Agent:** Schritte 1 bis 3 und 4. Er darf nur
  `Landing Page/assets/**`, `scripts/lib/screenshot-*.mjs` und
  `scripts/capture-landing-screenshots.mjs` ändern. Aufgabe: Fixture starten,
  Dummy-Daten anlegen, alle zehn Bilder aufnehmen, jedes Bild selbst ansehen
  und bei Mängeln erneut aufnehmen. Einzelne Motive gehen schneller:
  `node scripts/capture-landing-screenshots.mjs mobil-notizen`.
- **Verifikations-Agent:** unabhängig, read-only. Er prüft die Bildgrößen, sieht
  sich die Bilder an, misst die App-Fix-Punkte (z. B. kompakte mobile
  Dashboard-Box bei 360/390/430 px), prüft die Fixture-API auf Dummy-Daten und
  baut die Landingpage selbst.

## Die zehn Motive

| Datei | Route/Zustand | Format | Dummy-Daten |
| --- | --- | --- | --- |
| `wrapt-dashboard.png` | `/wrapt/`, Dashboard mit aufgewärmtem CPU-Verlauf, leicht gescrollt | 1440×900 | `demo-server`, Projekte Nordlicht/Feldnotiz/Sandkasten, 2 Dienste |
| `wrapt-mobil.png` | `/wrapt/` bei 390×844, kompakte Statusbox oben | 390×844 | dieselben Daten wie Dashboard |
| `wrapt-mobil-notizen.png` | `/wrapt/notizen` bei 390×844, Notiz „Onboarding-Checkliste“ geöffnet | 390×844 | Notizbaum mit Checkliste und Callout |
| `wrapt-terminal.png` | `/wrapt/terminal`, genau zwei Sitzungen „Nordlicht“ und „Feldnotiz“, cwd-Zeile ausgeblendet | 1440×900 | Demo-Git-Repos, Prompt `demo-server:nordlicht demo$` |
| `wrapt-previews.png` | `/wrapt/previews`, Dev-Server „Nordlicht“ läuft, Logs sichtbar | 1440×900 | Projekt Nordlicht, Port 3440 |
| `wrapt-plugins.png` | `/wrapt/plugins`, Tab „Installieren“ | 1440×900 | Katalog aus `tests/fixtures/extension-catalog` |
| `wrapt-themes.png` | `/wrapt/settings` → Design, Theme-Raster zentriert, „T3 Code“ aktiv | 1440×900 | zehn Presets aus `appearance-palettes.ts` |
| `wrapt-usage.png` | `/wrapt/usage`, Limits und Banked Resets gefüllt | 1440×900 | Accounts arbeit, privat, opencode-demo; Limits aus dem CodexBar-Ersatz |
| `wrapt-notes.png` | `/wrapt/notizen`, Notiz „Release 1.23 vorbereiten“ geöffnet | 1440×900 | Notizbaum mit Onboarding, Tastenkürzeln, Ideen |
| `wrapt-orbit.png` | `/wrapt/orbit`, Board „Arbeitsfläche“ mit 6 Knoten und 5 Kanten | 1440×900 | zwei Projektknoten, Notiz, Terminal, Codex-Limits |

Verwendung auf der Seite: `wrapt-dashboard` und `wrapt-mobil` im Hero,
`wrapt-terminal` in `#werkzeuge`, `wrapt-previews` in `#previews`,
`wrapt-themes` in `#themes`, `wrapt-usage` in `#nutzung`, `wrapt-notes` in
`#notizen`, `wrapt-orbit` in `#orbit`, `wrapt-plugins` in `#erweiterungen`.
Im Abschnitt `#mobile` stehen `wrapt-mobil` und `wrapt-mobil-notizen` als Paar
nebeneinander (`.shots`); das Handy im Hero ist bewusst unten rechts versetzt
und ragt ein paar Pixel über die Desktopfläche hinaus.

## Wo die Dummy-Daten herkommen

| Datei | Inhalt |
| --- | --- |
| `scripts/start-screenshot-server.mjs` | Isolierte Instanz: Ports, Config, Env, tmux-Socket `wrapt-screenshots`, Root, PID, Log |
| `scripts/lib/screenshot-fixtures.mjs` | Drei Beispielprojekte mit Git-Historie, `projects.local.json`, Extension-Katalog, Dummy-Auth-Dateien, neutraler Shell-Prompt |
| `scripts/lib/screenshot-seed.mjs` | Seed über die HTTP-API: Theme `t3-code`, Accounts, CodexBar-Sync, Notizen, Orbit-Board, Projektaktivität, Preview-Devserver |
| `scripts/lib/screenshot-codexbar-fixture.mjs` | CodexBar-Ersatz auf Port Basis+120 mit erfundenen Limits und Kosten |
| `scripts/lib/screenshot-metrics-warmup.mjs` | Füllt den In-Memory-Messverlauf vor der Aufnahme, damit die CPU-Kurve nicht fast leer ist |
| `scripts/capture-landing-screenshots.mjs` | Playwright-Aufnahme aller zehn Motive inklusive Route-Interception und Nachskalierung; einzelne Motive per Argument, z. B. `mobil-notizen` |

## Fallstricke

- **Leeres CPU-Diagramm:** Der Verlauf ist nur im Speicher und startet nach
  `--reset` leer. Deshalb `METRICS_CACHE_MS=1000` in der Fixture und der Warmlauf
  vor Dashboard und Mobil. Ohne das zeigt die Karte eine gerade Linie.
- **Echter Hostname:** `/api/v1/server/summary` liefert `os.hostname()`. Muss per
  Route-Interception auf `demo-server` gesetzt werden. `system.instanceName`
  allein reicht nicht.
- **Terminal-Pfade:** Laufende Sitzungen zeigen ihren cwd. Vor der Aufnahme
  Workspace und Sitzungen leeren, zwei Sitzungen anlegen, umbenennen und die
  cwd-Zeile per injiziertem Style ausblenden.
- **Langer tmux-Socket:** `TMUX_TMPDIR=/tmp` und eigener Socket, sonst scheitert
  der Preview-Devserver an zu langen Pfaden.
- **Theme-Flächen:** Vor der Aufnahme Preset `t3-code` setzen, sonst kann eine
  abweichende Palette im Bild landen.
- **Version im Bild:** Die Statusleiste zeigt die Version aus `/api/v1/health`.
  Nach einem Versions-Bump die Fixture neu starten, sonst zeigen die Bilder die
  alte Version.

## Wenn sich Inhalte oder UI ändern

- Neue Demo-Texte oder Projekte: `scripts/lib/screenshot-fixtures.mjs` und
  `scripts/lib/screenshot-seed.mjs` anpassen, dann `--reset` und neu aufnehmen.
- Geänderte Selektoren oder Abläufe: die passende `capture*`-Funktion in
  `scripts/capture-landing-screenshots.mjs` nachziehen und Wartezeiten prüfen.
- Neues Motiv: `capture*`-Funktion plus Eintrag in der `tasks`-Liste ergänzen,
  danach die neue Datei in `Landing Page/index.html` einbinden, die Tabelle hier
  und den Abschnitt in `Landing Page/README.md` aktualisieren.
- Immer zum Schluss `node build.mjs` in `Landing Page/` laufen lassen und die
  Seite im Browser prüfen, damit kein Asset-Pfad ins Leere zeigt.

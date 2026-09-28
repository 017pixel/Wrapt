# Wrapt-Landingpage

Eigenständige, statische Produktseite für Wrapt. Sie läuft unabhängig von der
Wrapt-Web-App und wird über GitHub Pages unter
`https://017pixel.github.io/Wrapt/` veröffentlicht. Der Ordner `dist/` ist die
fertige Ausgabe, alle Quellen liegen daneben.

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `index.html` | Semantische Seitenstruktur und deutsche Texte |
| `styles.css` | Layout, Theme-Variablen, Tilt, Raster und Responsive Styles |
| `docs.css` | Layout der Doku-Einstiegsfläche auf der Landingpage |
| `script.js` | Cursor-Tilt, weiches Scrollen und sparsame Scrollzustände |
| `build.mjs` | Erzeugt die Landingpage und bündelt die Doku unter `dist/doku/` |
| `assets/` | Echte Wrapt-Ansichten aus der Demo-Instanz mit reinen Beispieldaten als PNG |
| `dist/` | Generierte Ausgabe, nicht direkt bearbeiten |

Die Farb- und Motion-Token stammen aus dem `@theme`-Block in
`apps/web/src/index.css`. `build.mjs` liest sie und ersetzt damit den markierten
Block in `styles.css`. Es gibt keine externen Font-CDNs, Analytics oder
API-Aufrufe.

## Bauen

```bash
node build.mjs
```

Das Skript legt `dist/` neu an, kopiert `assets/` (inklusive der
mitgelieferten Fonts unter `assets/fonts/`) und schreibt `index.html`,
`styles.css`, `docs.css`, `script.js` sowie `.nojekyll`. Danach baut es `docs-webseite/`
und kopiert die Ausgabe nach `dist/doku/`. So liegt die Dokumentation unter
`https://017pixel.github.io/Wrapt/doku/`. Fehlt eine lokale Font-Datei,
greift der Landingpage-Build auf `apps/web/node_modules/` zurück
(`pnpm install`); gibt es sie auch dort nicht, nutzt die Seite den System-Fallback.

## Lokale Vorschau

`dist/` enthält relative Pfade und lässt sich mit jedem statischen Server
anzeigen. Vorher einen freien Port prüfen, damit kein laufendes Preview
getroffen wird.

```bash
# Belegte Ports anzeigen (macOS)
lsof -nP -iTCP -sTCP:LISTEN

# Einen freien Port ausgeben lassen
node -e "const n=require('net'),s=n.createServer();s.listen(0,'127.0.0.1',()=>{console.log('frei:',s.address().port);s.close()})"
```

Dann die Ausgabe servieren, hier beispielhaft auf Port 4173:

```bash
node build.mjs
python3 -m http.server 4173 --directory dist
```

Danach `http://127.0.0.1:4173/` im Browser öffnen. Alternativ funktioniert jeder
andere statische Server, zum Beispiel `npx serve dist`.

## Screenshot-Instanz

Die Assets unter `assets/` stammen aus einer isolierten Wrapt-Instanz mit reinen
Dummy-Daten (Port 3410). Sie berührt die laufende Workbench nicht. Der komplette
Ablauf für Agenten steht im Skill `.agents/skills/landingpage-screenshots/`.

```bash
WRAPT_E2E_WEB_OUT_DIR="$TMPDIR/wrapt-screenshots-web" pnpm build   # isolierter Web-Build
node scripts/start-screenshot-server.mjs --reset                  # Fixture starten (Config, DB, Ports im Temp-Root)
node scripts/capture-landing-screenshots.mjs                      # PNGs nach "Landing Page/assets/"
node scripts/start-screenshot-server.mjs --stop                   # Fixture stoppen, Root bleibt erhalten
```

Sichtbar sind nur erfundene Daten (`demo-server`, `demo@example.com`). Ohne
`--reset` werden vorhandene Dummy-Daten wiederverwendet.

## Hinweise

- Die Seite ist bei 360, 390, 768, 1024 und 1440 px ohne horizontales Scrollen
  nutzbar.
- Gleiche-Seiten-Sprunglinks scrollen weich und halten den Sticky-Header frei.
  Bei `prefers-reduced-motion: reduce` wird sofort gesprungen.
- Auf schmalen Geräten bleibt die Hauptnavigation einzeilig und horizontal
  scrollbar.
- Diese Vorschau startet und stoppt keine Wrapt-Dienste. Laufende
  Preview-Sessions und Dev-Server bleiben unberührt.
- Der Versionsmarker `docs-revision.txt` wird bei reinen Doku-Änderungen angepasst,
  damit der vorhandene GitHub-Pages-Trigger den Build startet.
- Veröffentlicht wird ausschließlich `dist/`. Der GitHub-Actions-Workflow liegt
  außerhalb dieses Ordners unter `.github/workflows/`.

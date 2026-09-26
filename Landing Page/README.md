# Wrapt-Landingpage

Eigenständige, statische Produktseite für Wrapt. Sie läuft unabhängig von der
Wrapt-Web-App und wird über GitHub Pages unter
`https://017pixel.github.io/Wrapt/` veröffentlicht. Der Ordner `dist/` ist die
fertige Ausgabe, alle Quellen liegen daneben.

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `index.html` | Semantische Seitenstruktur und deutsche Texte |
| `styles.css` | Layout, Theme-Variablen, Tilt und Responsive Styles |
| `script.js` | Cursor-Tilt und sparsame Scrollzustände |
| `build.mjs` | Erzeugt `dist/` aus den Quellen und dem Wrapt-Theme |
| `assets/` | Echte, datenschutzkonform geschwärzte Wrapt-Ansichten als PNG |
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
`styles.css`, `script.js` sowie `.nojekyll`. Fehlt eine lokale Font-Datei,
greift der Build auf `apps/web/node_modules/` zurück (`pnpm install`);
gibt es sie auch dort nicht, nutzt die Seite den System-Fallback.

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

## Hinweise

- Die Seite ist bei 360, 390, 768, 1024 und 1440 px ohne horizontales Scrollen
  nutzbar.
- Diese Vorschau startet und stoppt keine Wrapt-Dienste. Laufende
  Preview-Sessions und Dev-Server bleiben unberührt.
- Veröffentlicht wird ausschließlich `dist/`. Der GitHub-Actions-Workflow liegt
  außerhalb dieses Ordners unter `.github/workflows/`.

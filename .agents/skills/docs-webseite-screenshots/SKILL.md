---
name: docs-webseite-screenshots
description: Erneuert die Screenshots, die Wrapts docs-webseite tatsächlich einbindet, mit freigegebenen neutralen Aufnahmen und gleicht die Asset-Kopien ab. Verwende den Skill für „Doku-Screenshots aktualisieren“, veraltete Dokumentationsbilder oder neue Screenshot-Motive.
---

# Screenshots der Dokumentationsseite aktualisieren

Dieser Skill aktualisiert nur Bilder, die in `docs-webseite/content/` eingebunden sind, sowie deren jeweilige Bildquelle. Er baut danach die Dokumentationsseite.

## Quellen und Motive ermitteln

1. Lies `docs-webseite/README.md` und `docs/screenshots/README.md`.
2. Ermittle die aktuell eingebundenen Bilder mit `rg -n '!\[' docs-webseite/content` und prüfe die relativen Pfade. Nicht eingebundene Dateien unter `docs-webseite/assets/` bleiben unangetastet.
3. Die eingebundenen Motive (`01-dashboard.png`, `02-workbench.png`, `04-t3-code.png`, `05-code-server.png`, `07-terminal.png`, `08-usage.png`, `12-plugins.png`, `wrapt-mobil.png`, `wrapt-mobil-notizen.png`) werden direkt in `docs-webseite/assets/` aufgenommen.
4. Die Motive unter `docs/screenshots/` gehören zur README der Repository-Startseite, bleiben dort bei 1280 × 720 Pixeln und werden von der Doku unabhängig gepflegt.

## Sicher aufnehmen

- Produktbilder entstehen aus einer isolierten Demo-Instanz mit neutralen Daten. Verwende niemals die laufende Workbench, persönliche Konten, Nutzer-Previews oder produktive T3-/Code-Server-Sitzungen.
- Für die Wrapt-Fixture gelten die Port-, Build-, Start- und Aufräumregeln aus `.agents/skills/landingpage-screenshots/SKILL.md`. Der Standard-Portbereich ist `3410..3540`. Das Startskript prüft ihn und bricht bei belegten Ports ab.
- Vor dem Start der Fixture muss der Web-Build außerhalb von `apps/web/dist` liegen:

  ```bash
  WRAPT_E2E_WEB_OUT_DIR="$TMPDIR/wrapt-screenshots-web" pnpm build
  node scripts/start-screenshot-server.mjs --reset
  curl -s http://127.0.0.1:3410/api/v1/health
  ```

- Nimm nur die angefragten oder nachweislich veralteten Motive auf. Für Wrapt-Ansichten führt die Fixture zur App unter `http://127.0.0.1:3410/wrapt/`; übliche Routen sind `/wrapt/orbit`, `/wrapt/terminal`, `/wrapt/usage`, `/wrapt/settings`, `/wrapt/plugins`, `/wrapt/t3-code` und `/wrapt/code-editor`.
- Nutze Playwright aus dem Repository für lokale Aufnahmen und speichere sie direkt unter `docs-webseite/assets/`. Desktop-Motive werden mit einem Viewport von 1728 × 1117 Pixeln (16-Zoll-MacBook-Standard, nicht hineingezoomt) aufgezeichnet und anschließend auf 1728 × 1117 skaliert; mobile Motive bleiben 390 × 844. Prüfe vor dem Bild die passende Route und ihren fertigen Zustand, statt Lade- oder Fehlerzustände aufzunehmen.
- Die Doku-Gruppe des Aufnahmeskripts erledigt das: `WRAPT_SCREENSHOT_OUT_DIR=docs-webseite/assets node scripts/capture-landing-screenshots.mjs docs`. T3 Code und code-server werden zusätzlich isoliert gestartet (`t3 serve` auf `3410 + 1`, code-server auf dem festen Proxy-Ziel 8080) und die Fixture mit `WRAPT_SCREENSHOT_TOOLS=1 node scripts/start-screenshot-server.mjs --reset` gestartet. Ändere vorhandene Dateinamen und Einbindungen nicht ohne sachlichen Grund.
- T3 Code, code-server und andere eingebettete Werkzeuge dürfen nur aus einer eigenen isolierten Instanz aufgenommen werden. Wenn keine solche Instanz verfügbar ist, behalte das vorhandene freigegebene Bild und nenne es im Abschluss als nicht erneuert.
- code-server-Motive werden immer im Dark Mode aufgenommen. Setze vor dem Start der isolierten Instanz in ihrem eigenen User-Data-Verzeichnis unter `User/settings.json` `"workbench.colorTheme": "Default Dark Modern"`. Playwrights `colorScheme: "dark"` allein ändert das VS-Code-Theme nicht zuverlässig. Prüfe nach dem Laden, dass Editor und Workbench sichtbar dunkel sind; wenn die Einstellung nicht greift, korrigiere das isolierte Profil vor der Aufnahme und überschreibe das freigegebene Bild nicht mit einer hellen Aufnahme. Ändere dafür niemals das Profil eines vorhandenen code-servers.
- Prüfe vor jeder Aufnahme einen Accessibility-Snapshot und danach jedes erzeugte Bild visuell. Es dürfen keine echten Namen, E-Mail-Adressen, Hostnamen, lokalen Pfade, Tokens, persönlichen Sitzungen oder Projektinhalte sichtbar sein. Verwende nur Beispieldaten wie `demo-server`, `demo@example.com` und `demo`.

## Assets synchronisieren und prüfen

- Erneuerte Aufnahmen liegen direkt unter `docs-webseite/assets/`; die Landingpage-Assets unter `Landing Page/assets/` bleiben unangetastet.
- Prüfe Dateiformat und Abmessungen. Für Desktop-Motive gilt 1728 × 1117 Pixel, für mobile Motive 390 × 844 Pixel.
- Baue die Doku mit `node docs-webseite/build.mjs`. Der Build aktualisiert `docs-webseite/dist/`; bearbeite diese Ausgabe nicht direkt.
- Wenn die Doku über die Landingpage veröffentlicht werden soll, baue anschließend `node "Landing Page/build.mjs"`. Ändere den Doku-Versionsmarker oder Changelog nur, wenn der Nutzer auch eine veröffentlichungsfertige Doku-Aktualisierung beauftragt hat.
- Beende die Fixture mit `node scripts/start-screenshot-server.mjs --stop`, falls dieser Lauf sie gestartet hat. Keine Neustart-Skripte oder Produktivdienste verwenden.

Berichte die erneuerten Motive, Maße, den Doku-Build und Bilder, die wegen einer fehlenden isolierten Werkzeug-Instanz unverändert blieben.

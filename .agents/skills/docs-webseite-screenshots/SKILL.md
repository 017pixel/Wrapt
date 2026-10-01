---
name: docs-webseite-screenshots
description: Aktualisiert die gemeinsamen Screenshots von Dokumentationsseite und README mit freigegebenen neutralen Aufnahmen. Verwende den Skill für „docs/readme Screenshots updaten“, veraltete Doku- oder README-Bilder oder neue Screenshot-Motive.
---

# docs/readme Screenshots updaten

Dieser Skill pflegt die einzige Bildquelle für Dokumentationsseite **und** README:
`docs-webseite/assets/`. Die README bindet dieselben Dateien direkt ein
(`docs-webseite/assets/...`). Es gibt keine zweite gepflegte Kopie. Unter
`docs/screenshots/` liegt nur noch die Kompatibilitätsdatei
`11-hermes-system.png` plus eine README mit Verweis auf diese Quelle.

## Quellen und Motive ermitteln

1. Lies `docs-webseite/README.md` und `docs/screenshots/README.md`.
2. Ermittle alle aktuell eingebundenen Bilder mit
   `rg -n '!\[' docs-webseite/content README.md` und prüfe die relativen Pfade.
   Nicht eingebundene Dateien unter `docs-webseite/assets/` (alte Aliase wie
   `dateimanager.png`, `t3-code.png`) bleiben unangetastet.
3. Kanonische Motive, alle direkt in `docs-webseite/assets/`:

   | Datei | Motiv | README | Doku |
   | --- | --- | --- | --- |
   | `01-dashboard.png` | Dashboard mit `demo-server` | ja | ja |
   | `02-workbench.png` | Orbit mit Beispielprojekten | ja | ja |
   | `04-t3-code.png` | T3 Code im Dark Mode, nicht angemeldet | ja | ja |
   | `05-code-server.png` | code-server ohne persönliche Dateien | ja | ja |
   | `06-gallery.png` | Dateimanager | ja | nein |
   | `07-terminal.png` | Terminal mit `demo@wrapt`-Prompt | ja | ja |
   | `08-usage.png` | Nutzung ohne konfigurierte Accounts | ja | ja |
   | `09-settings.png` | Einstellungen | ja | nein |
   | `10-hermes-chat.png` | Hermes-Chat, nur manuell erneuern | ja | nein |
   | `12-plugins.png` | Plugin-Verwaltung | ja | ja |
   | `13-plugin-creator.png` | Auswahl des Wrapt-Plugins-Skills | ja | nein |
   | `wrapt-mobil.png` | Dashboard mobil | nein | ja |
   | `wrapt-mobil-notizen.png` | Notizen mobil | nein | ja |

   Desktop-Motive sind 1728 × 1117 Pixel groß (16-Zoll-MacBook-Maßstab, nicht
   hineingezoomt), mobile Motive 390 × 844. Dateien, die noch in 1280 × 720
   vorliegen (`06-gallery`, `09-settings`, `10-hermes-chat`, `13-plugin-creator`),
   bei der nächsten Erneuerung im Doku-Format neu aufnehmen. Dateinamen und
   Einbindungen nicht ohne sachlichen Grund ändern.

## Sicher aufnehmen

- Produktbilder entstehen aus einer isolierten Demo-Instanz mit neutralen Daten. Verwende niemals die laufende Workbench, persönliche Konten, Nutzer-Previews oder produktive T3-/Code-Server-Sitzungen.
- Für die Wrapt-Fixture gelten die Port-, Build-, Start- und Aufräumregeln aus `.agents/skills/landingpage-screenshots/SKILL.md`. Der Standard-Portbereich ist `3410..3540`. Das Startskript prüft ihn und bricht bei belegten Ports ab.
- Vor dem Start der Fixture muss der Web-Build außerhalb von `apps/web/dist` liegen:

  ```bash
  WRAPT_E2E_WEB_OUT_DIR="$TMPDIR/wrapt-screenshots-web" pnpm build
  node scripts/start-screenshot-server.mjs --reset
  curl -s http://127.0.0.1:3410/api/v1/health
  ```

- Nimm nur die angefragten oder nachweislich veralteten Motive auf. Für Wrapt-Ansichten führt die Fixture zur App unter `http://127.0.0.1:3410/wrapt/`; übliche Routen sind `/wrapt/orbit`, `/wrapt/files`, `/wrapt/terminal`, `/wrapt/usage`, `/wrapt/settings`, `/wrapt/plugins`, `/wrapt/plugins/maker`, `/wrapt/t3-code` und `/wrapt/code-editor`.
- Nutze Playwright aus dem Repository für lokale Aufnahmen und speichere sie direkt unter `docs-webseite/assets/`. Prüfe vor dem Bild die passende Route und ihren fertigen Zustand, statt Lade- oder Fehlerzustände aufzunehmen.
- Die Doku-Gruppe des Aufnahmeskripts erledigt das:

  ```bash
  WRAPT_SCREENSHOT_OUT_DIR=docs-webseite/assets WRAPT_SCREENSHOT_VIEWPORT="1728x1117" node scripts/capture-landing-screenshots.mjs docs
  ```

  Einzelne Motive gehen schneller, etwa `... docs-dateimanager` oder `... docs-settings`.
  Die Gruppe deckt alle README-Motive außer Hermes ab (`docs-dateimanager`,
  `docs-settings`, `docs-plugin-creator` nutzen die einfache Routenaufnahme).
  T3 Code und code-server werden zusätzlich isoliert gestartet (`t3 serve` auf
  `3410 + 1`, code-server auf dem festen Proxy-Ziel 8080) und die Fixture mit
  `WRAPT_SCREENSHOT_TOOLS=1 node scripts/start-screenshot-server.mjs --reset` gestartet.
- T3 Code, code-server und andere eingebettete Werkzeuge dürfen nur aus einer eigenen isolierten Instanz aufgenommen werden. Wenn keine solche Instanz verfügbar ist, behalte das vorhandene freigegebene Bild und nenne es im Abschluss als nicht erneuert.
- code-server-Motive werden immer im Dark Mode aufgenommen. Setze vor dem Start der isolierten Instanz in ihrem eigenen User-Data-Verzeichnis unter `User/settings.json` `"workbench.colorTheme": "Default Dark Modern"`. Playwrights `colorScheme: "dark"` allein ändert das VS-Code-Theme nicht zuverlässig. Prüfe nach dem Laden, dass Editor und Workbench sichtbar dunkel sind; wenn die Einstellung nicht greift, korrigiere das isolierte Profil vor der Aufnahme und überschreibe das freigegebene Bild nicht mit einer hellen Aufnahme. Ändere dafür niemals das Profil eines vorhandenen code-servers.
- `10-hermes-chat.png` wird nie automatisch aufgenommen. Hermes kann Host-, Sitzungs- und Credential-Metadaten anzeigen und wird deshalb nur manuell aus einer neutralen Instanz erneuert; `11-hermes-system.png` bleibt reine Kompatibilitätsdatei unter `docs/screenshots/`.
- Prüfe vor jeder Aufnahme einen Accessibility-Snapshot und danach jedes erzeugte Bild visuell. Es dürfen keine echten Namen, E-Mail-Adressen, Hostnamen, lokalen Pfade, Tokens, persönlichen Sitzungen oder Projektinhalte sichtbar sein. Verwende nur Beispieldaten wie `demo-server`, `demo@example.com` und `demo`.

## Assets synchronisieren und prüfen

- Erneuerte Aufnahmen liegen direkt unter `docs-webseite/assets/`; sie wirken sofort in Doku **und** README. Befülle kein zweites Verzeichnis, damit beide Seiten nicht wieder auseinanderlaufen. Die Landingpage-Assets unter `Landing Page/assets/` bleiben unangetastet.
- Prüfe Dateiformat und Abmessungen. Für Desktop-Motive gilt 1728 × 1117 Pixel, für mobile Motive 390 × 844 Pixel.
- Baue die Doku mit `node docs-webseite/build.mjs`. Der Build aktualisiert `docs-webseite/dist/`; bearbeite diese Ausgabe nicht direkt. Die README braucht keinen Build; prüfe ihre Einbindungen per `rg -n '!\[' README.md`.
- Wenn die Doku über die Landingpage veröffentlicht werden soll, baue anschließend `node "Landing Page/build.mjs"`. Ändere den Doku-Versionsmarker oder Changelog nur, wenn der Nutzer auch eine veröffentlichungsfertige Doku-Aktualisierung beauftragt hat.
- Beende die Fixture mit `node scripts/start-screenshot-server.mjs --stop`, falls dieser Lauf sie gestartet hat. Keine Neustart-Skripte oder Produktivdienste verwenden.

Berichte die erneuerten Motive, Maße, den Doku-Build und Bilder, die wegen einer fehlenden isolierten Werkzeug-Instanz unverändert blieben.

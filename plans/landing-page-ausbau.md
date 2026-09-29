# Landingpage-Ausbau (Sep 2026)

Fortsetzung von [`landing-page.md`](landing-page.md). Dieser Lauf setzt konkrete
Designkorrekturen, neue Abschnitte und neue Screenshots um.

## Auftrag (vom Nutzer)

1. Blauen Punkt links neben „Wrapt“ im Header entfernen.
2. „Server-Knoten“-Chip im Hero entfernen.
3. Sprunglinks („So funktioniert’s“, Navigation) animiert scrollen statt springen.
4. Blaue Linie links neben der Harness-Randnotiz entfernen.
5. Auf Desktop ein leichtes Karo-/Gittermuster links und rechts am Rand, das zur
   Mitte hin ausfadet.
6. Mobiler App-Bug: Die Dashboard-Kopfbox („Dashboard“ / „Aktualisiert vor 5s“)
   ist auf schmalen Displays zu groß, muss eine kleine Box sein.
7. Layout der Landingpage: Text und Screenshot nebeneinander statt untereinander;
   Screenshots neu aufnehmen.
8. Screenshots mit korrektem OLED-Dark-Theme und Beispiel-Daten (Dummy-Codex-,
   Dummy-OpenCode-Account, Beispiel-Notizen, Beispiel-Projekte).
9. Zwei fehlstehende Linien auf der Landingpage entfernen.
10. Neue Abschnitte mit Screenshots: Themes, Nutzungen und Limits, Notizen, Orbit.

## Abnahmekriterien

- `Landing Page/index.html`, `styles.css`, `script.js` enthalten die Punkte 1–5,
  7, 9, 10; `node build.mjs` läuft fehlerfrei; die gebaute Seite ist ohne
  horizontales Scrollen bei 360/390/768/1024/1440 px nutzbar.
- Neue Assets in `Landing Page/assets/`: `wrapt-themes.png`, `wrapt-usage.png`,
  `wrapt-notes.png`, `wrapt-orbit.png`; aktualisiert: `wrapt-dashboard.png`,
  `wrapt-mobil.png`, `wrapt-terminal.png`, `wrapt-previews.png`,
  `wrapt-plugins.png`. OLED-Dark-Theme, nur Beispiel-Daten.
- App-Bug behoben: `.dash-mobile-summary` bleibt bei 390 px eine kompakte Box
  (eine Zeile, kein Umbruch in eine hohe Karte); Unit-Test vorhanden.
- `pnpm typecheck` grün; Landingpage im Browser geprüft (Sprunglinks animiert,
  Gittermuster, keine Fremdlinien, alle Bilder laden).
- Screenshot-Instanz ist isoliert (eigener Port, eigene Config/DB, keine
  laufenden Dienste oder Preview-Sessions verändert).

## Grenzen

- Keine Neustarts der laufenden Workbench, kein `pnpm dev` auf Port 3010, keine
  Preview-Sessions/Devserver des Nutzers anfassen.
- Keine Gradients als Farbeffekt, keine Emojis, keine All-Caps, keine Pillen.
- Farbquelle bleibt `apps/web/src/index.css` (`@theme`) über `build.mjs`.
- Keine Secrets oder echten Kontodaten in Screenshots.

## Nachweise

- `node build.mjs`, `pnpm typecheck`, Vitest für `DashboardMobileSummary`.
- Playwright-Browserprüfung der gebauten Seite (Desktop + 390 px).
- Sichtprüfung jeder neuen PNG-Datei (Theme, Dummy-Daten, keine schwarzen
  Schwärzungen mehr nötig).
- Unabhängiger Verifikations-Subagent am Ende.

## Stand (2026-09-26, abgeschlossen)

- Landingpage: Punkte 1–5, 7, 9, 10 umgesetzt (`index.html` 191 Zeilen,
  `styles.css` ~350, `script.js` 164, `README.md` erweitert).
- Aufnahmen: 10 Assets (8 Desktop, 2 Handy) aus isolierter Demo-Instanz (Port 3410,
  `scripts/start-screenshot-server.mjs`, `scripts/capture-landing-screenshots.mjs`,
  Seeds unter `scripts/lib/screenshot-*.mjs`).
- App-Fix: `.dash-mobile-summary` bleibt bei ≤430 px einzeilig
  (`apps/web/src/views/dashboard-mobile.css`; live gemessen: 67 px hoch bei
  390/360/430 px).
- Version 1.22.1 inkl. CHANGELOG-Eintrag.
- Offen: Commit/Push nur nach Rücksprache; Verifikationsbericht des unabhängigen
  Prüf-Agenten.

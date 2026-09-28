# [0.25.1] - 2026-07-25

### Erstellt

- Crash-Report als großes Pop-Up: kopierbarer Bericht inklusive Arbeitsauftrag für einen KI-Agenten
- Fehlergrenzen um App und jede Route, damit ein Absturz nicht mehr die ganze Seite weißfärbt
- `GET /api/v1/system/restart/status` mit Phase, aktuellem Schritt und ANSI-bereinigtem Build-Log
- Neustart-Fehler erscheinen in den Einstellungen samt Log-Ausschnitt und Kopier-Knopf
- Lint-Regeln `react-hooks/rules-of-hooks` und `exhaustive-deps` für `apps/web`

### Verändert

- Sidebar rief Hooks bedingt auf (`!collapsed && useSectionCollapsed(...)`) — das Aus-/Einklappen ließ die Seite abstürzen
- Eingeklappte Sidebar zeigt jetzt alle Sektionen; vorher fehlten Werkzeuge, Galerie und Blöcke komplett
- `scripts/lib-restart.sh` findet pnpm auch ohne passenden PATH (bekannte Orte, dann corepack)
- `workbench.service`: `StartLimitIntervalSec` von `[Service]` nach `[Unit]` — dort wurde es ignoriert, der Dienst gab nach 5 Fehlstarts auf
- Server protokolliert unbehandelte Ausnahmen und Promise-Fehler, statt wortlos zu enden

### Gelöscht

- Verwaiste Symlinks auf die nicht mehr existierende `benjamin-dev-workbench.service`
- Doppelter, identischer Render-Zweig in den Orbit-Palettenabschnitten der Sidebar
- Feste Versionsnummer `0.24.0` in `app.test.ts`, die bei jedem Versionssprung brach

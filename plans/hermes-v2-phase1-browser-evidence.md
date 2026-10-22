# Hermes V2: Browser-Nachweise für Phase 1

Stand 16.10.2026. Eigene isolierte Source-Testinstanz unter
`http://127.0.0.1:19470/wrapt/hermes-v2`, gestarteter Testprozess 56006.
Web-Build ausschließlich `/tmp/wrapt-hermes-v2-web-XLkOcP`; temporäre Datenbank,
Konfiguration und tmux-Socket über den bestehenden E2E-Isolationslauncher.
Hermes ist darin deaktiviert. Keine Nutzerprozesse, Ports oder Slots verändert.

## Geprüfter Stand

GLM-Implementierung plus Parent-Korrektur des DeepSeek-M1: containerabhängige
Drawer-Semantik, bestehendes `useModalFocus`, Fokusfang/-rückgabe, `inert` und
`aria-hidden` für geschlossene Inhalte, sichtbarer Close-Button, Backdrop nur
Präsentation. Standalone nutzt wieder `useResponsiveShell`, Viewport-Höhe und
Safe Areas. Keine doppelte V2-Wurzel und kein redundanter Ganzseitenlink dort.

- Web-Typecheck nach Parent-Korrektur: Exit 0, Log
  `/tmp/wrapt-hermes-v2-phase1-integrated-typecheck-r4.log`.
- Gezielte A11y-/Standalone-/echte Dispatcher-Integration: 3 Dateien, 11 Tests
  grün, Log `/tmp/wrapt-hermes-v2-phase1-accessibility-tests-r2.log`.
- Vor dieser letzten Korrektur: 10 Web-Testdateien, 58 Tests grün.
- E2E vor letzter Korrektur: alle 9 Tests grün, Log
  `/tmp/wrapt-hermes-v2-phase1-e2e-r2.log`.
- Wiederholung nach letzter Korrektur: alle 9 Tests erneut grün, keine Flakes,
  Log `/tmp/wrapt-hermes-v2-phase1-e2e-r3.log`.

## Playwright-MCP und Screenshots

Nach finalem isoliertem Vite-Build r3 auf allen vier Abnahmebreiten tatsächlich
geladen, mit DOM-Hit-Test geprüft und aufgenommen. Prüfharness ausschließlich
über `playwright.browser_run_code_unsafe`, Datei unter `temp/hermes-v2/`.

| Breite | Höhe | Ein V2-Root | Kein Overflow | Classic erreichbar | Kein iframe |
| --- | --- | --- | --- | --- | --- |
| 1440 | 900 | ja | ja | ja | ja |
| 1024 | 768 | ja | ja | ja | ja |
| 768 | 1024 | ja | ja | ja | ja |
| 390 | 844 | ja | ja | ja | ja |

Mobil zusätzlich: Toggle per Enter, Schließen per Escape, anschließende vollständig
geschlossene Position geprüft. Standalone ohne `.app-shell`, genau ein V2-Root.
Reduced Motion: globale Wrapt-Regel reduziert die Transition auf 0,01 ms
(`1e-05s`), V2 ergänzt keine Bewegung gegen diese Einstellung.

Aktuelle Bilder unter `temp/hermes-v2/`:

- `phase1-1440x900.png`, `phase1-1024x768.png`, `phase1-768x1024.png`,
  `phase1-390x844.png`: normale Wrapt-Shell, dunkles Theme.
- `phase1-standalone-mobile.png`: fokussierte Oberfläche auf 390 px.
- `phase1-light-1440x900.png`: isolierte helle Tokenrollen im selben Standalone;
  Text, Flächen, Border und Buttons visuell geprüft. Kein neues Produktpreset.
  Styles anschließend vollständig wiederhergestellt.

Die erste Lichtaufnahme war vor dem abgeschlossenen Theme-Paint aufgenommen;
das aktuelle Bild wartet auf die Appearance-Antwort und zwei Renderframes.
`phase1-first-mobile.png` zeigt nur den alten, behobenen Drawer-Fehler.
`phase1-light-manual.png` war eine unvollständige Tokenprobe und ist kein Gatebild.
Das spätere GLM-L1 verweist noch auf genau diese unvollständige Probe. Es gibt
keinen geänderten hellen Produktpreset. Die aktuelle vollständige Rollenprobe
`phase1-light-1440x900.png` zeigt helle Buttons mit lesbarer dunkler Schrift;
Parent hat das aktualisierte Bild tatsächlich angesehen. Kein globaler Theme-
Umbau ist dafür nötig. Der kosmetische N3-Inline-Stil wurde als Token-Utility
`text-xs` umgesetzt, ohne Änderung des Farb- oder Schriftwertes.

## Grenzen

Dies ist ausdrücklich das Shell-Gate. Der echte Agent-Chat ist noch nicht
registriert oder verbunden. Der isolierte Server meldet erwartungsgemäß 503
für die bestehende globale Hermes-Statusabfrage; das ist keine V2-Verbindung.
Produktive Hermes-/Terminal-/Classic-Parallelsmokes folgen nach dem Gateway-Gate.
Ein Aufruf der Serverwurzel `/` ist kein Ersatz für `/wrapt/hermes-v2`.

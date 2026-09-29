# Abdeckung des Terminal-Zoomausgleichs

`renderScale` läuft von Orbit über `TerminalArea` und `WebTerminal` bis zur
xterm-Renderer-Engine. Die Schriftgröße wird aus der Desktop-Basis von 14 px
beziehungsweise der kompakten Basis von 13 px durch den Zoomfaktor berechnet.
Der Ausgleich ist auf den Orbit-Bereich von 0,1× bis 2,2× begrenzt. Bei einem
Schriftwechsel wird xterm aktualisiert; ein Refresh wird nur ausgeführt, wenn
die Instanz mindestens eine Zeile hat.

Unit-Tests decken die Desktopfaktoren 0,1×, 0,25×, 0,5×, 1× und 2,2×, die
kompakte Schrift, ungültige Zoomwerte sowie das Verhalten bei unveränderter
Schriftgröße und null Terminalzeilen ab. Sie prüfen die Berechnung und die
xterm-Refresh-Entscheidung, nicht den vollständigen Orbit-Canvas im Browser.

Der isolierte Chromium-E2E-Test `tests/e2e/terminal-orbit-zoom.spec.ts` prüft
zusätzlich eine echte Shell-Runtime in einem Orbit-Knoten. Er lässt sichtbare
Terminalausgabe über acht Canvas-Zoomänderungen bestehen und vergleicht die
xterm-Schriftgröße mit dem React-Flow-Zoomfaktor. Für die Desktop-Basisschrift
bleibt das Produkt aus Schriftgröße und Canvas-Zoom bei 14 px. Der Test läuft
gegen einen eigenen temporären E2E-Server und setzt nur dessen Testkonto zurück.
Codex verwendet in `ToolPanel` denselben `TerminalArea`-/xterm-Pfad; der Test
belegt dadurch die gemeinsame Rendererkompensation, aber startet weder Codex
noch verifiziert er ein angemeldetes Provider-TUI.

Live-Zoom in eingebetteten Codex- und OpenCode-Sitzungen wurde mangels eines
isolierten Providers nicht reproduziert. OpenCode ist eine eingebettete Web-App
im iframe und nicht Teil des xterm-Ausgleichs. Für diese Prüfungen wurden keine
Provider gestartet oder bedient; eine Browserabnahme des OpenCode-iframes und
ein Live-Codex-TUI bleiben offen.

Der separate isolierte Test `tests/e2e/orbit-opencode-zoom.spec.ts` prüft den
iframe-Einbettungspfad mit einer lokal abgefangenen HTML-Fixture. Orbit-Zoom
skaliert dabei den sichtbaren iframe proportional, während dessen Layoutgröße,
innerer Viewport, DPR, Zustand und Dokumentnavigation stabil bleiben. Das prüft
den Wrapt-/React-Flow-Pfad ohne einen echten OpenCode-Dienst; dessen UI bleibt
eine eigene Live-Provider-Prüfung.

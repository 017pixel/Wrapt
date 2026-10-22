# Phase 3: aktuelle Browsernachweise

Stand: 16.10.2026, nach Client-R2 und UI-Fixes F1 bis F8.
Eigene Source-Testinstanz auf 127.0.0.1:19470, eigener temporärer Webbuild.
Keine Nutzer-Previews, Dienste oder Einstellungen geändert.

- 20/20 Chromium-E2Es im aktuellen Build grün, einschließlich 430 History-Rows,
  Stream-Scrollanker, Unknown/Resync, Flag-off ohne Retry und sichtbarem Sessionfehler.
- 131/131 featurelokale Webtests grün; separates Client-Gate R3: PASS.
- MCP-Playwright mit tatsächlichen Contractframes und ausschließlich Testdaten:
  390×844, 768×1024, 1024×768 und 1440×900 ohne horizontalen Überlauf.
- Composer auf allen Breiten sichtbar und 16 px. Mobile Copy-, Codecopy-, Tool-
  und Reasoning-Ziele mindestens 44×44 px; Sitzungssuche 267×44 px, 16 px.
- Drawer per Enter geöffnet und Escape geschlossen, Fokus zurück am Auslöser.
- Reduced Motion: gemessene Sidebartransition 0,00001 s.
- Helle Rollen mit vollständigem vorhandenen appearanceThemeCssVariables-Mapper
  geprüft, danach Rootstyle exakt wiederhergestellt. Dies ist eine temporäre
  Custom-Theme-Prüfung, kein behauptetes vorhandenes helles Preset.
- Screenshots: temp/hermes-v2/phase3-dark-{390,768,1024,1440}.png,
  phase3-drawer-390.png, phase3-reduced-motion-390.png und phase3-light-1440.png.
- Headerkopieraktion hat jetzt tatsächliche Textbreite und rechten Abstand;
  reine Toolrows besitzen nur eine Karte, keine leere Assistantumrahmung.

Echte Core-, CLI- und Classic-Nachweise stehen in phase3-runtime-smoke.md.
Die Screenshots dieses Berichts enthalten keine echten Sitzungsinhalte.
Ein unabhängiger UX-Recheck bewertet diese Nachweise gesondert.

Eigene zwei MCP-Testtabs geschlossen und eigener Source-Launcher 861684 samt
Kindprozess 861695 beendet. Kein Listener mehr auf 19470, Port erneut bindbar.
Produktions-Webbuild sowie Nutzerdienste und Previews unverändert.

Nach UX-R2-Korrekturen: gesamtes Web 1260/1260 grün, alle 21 Browserfälle
grün einschließlich Requestbanner → `/wrapt/hermes-agent?...` → Classiciframe.
Denselben Link zusätzlich mit MCP angeklickt; Screenshot request-banner-1440.
Die vier Breiten und Theme-/Touch-/Motionmessungen erneut im neuesten Build geprüft.
Letzte eigene Fake-only-Testinstanz 1024647/1024658 und ein Testtab danach beendet,
Port 19470 wieder frei. Kein weiterer echter Hermes-Turn für diese Korrekturen.

# Phase 9: Rootprüfung des kurzen Chatlayouts

17.10.2026. Integrationsbeleg zum M4-CSS-Fix, kein unabhängiges Reviewurteil.
M3 und M1/M2/L1 sind im terminalen R3 geschlossen beziehungsweise gesund.
M4 verlangte einen sichtbaren Hauptstop bei weiterhin offener Freigabe.

## Gesunde Vorher-/Nachherfälle

Neue Datei `tests/e2e/hermes-v2-short-stop.spec.ts`: Route und Standalone390×500,
laufender Turn, eine Unteraufgabe, offene Freigabe und zehn fertige Anhänge.
Die Messung prüft den tatsächlichen Elternclip und den Zentrumhit vor jedem
Scrollen, Klick oder Antwortwrite. Erst anschließend wird Stop geklickt.
Vorher beide Fälle rot, Exit1, erwartete44px fehlen. Dieselben unveränderten
Assertions nach dem Fix grün. Keine alten Tests, Fakes oder Timeouts verändert.
Erstlog `/tmp/wrapt-hermes-v2-phase9-short-stop-initial-browser.log`.

Finaler isolierter Webbuild Exit0. **31/31 gezielte Browserfälle**,1.2min,Exit0:
beide neuen Initialhits, fünf Kontextfälle, Lesemarker nach Scrollen, vier
Breiten, kurze Ressourcenfläche, Tastatur/reduced motion, tatsächliche Orbit-
Sitzungsauswahl und Ressourcen in450×650/680×480 großen echten Orbitpanels.
Root-Log `/tmp/wrapt-hermes-v2-phase9-short-stop-targeted-browser.log`.

Autorenkontrollen96/96, volle Typen, V2-ScopedLint, CSSparse und Architektur0.
Root zusätzlich E2Etypes0 und neue E2EdateiLint0. Vollständige Websuite zuletzt
2178/2178 auf unveränderten JSquellen; nach diesem reinenCSS-Fix nicht als neu
ausgeführt behauptet. Die tatsächliche Layoutkontrolle übernehmen Browserfälle.

## Eigener Playwright-MCP

Frische contractvalidierte Fixture, eigenerTab1, Source127.0.0.1:19470.
Route/Standalone jeweils390×500 im identischen geöffneten Zustand:

| Messung | Route | Standalone |
|---|---:|---:|
| Stop initial sichtbar/getroffen | 44px/ja | 44px/ja |
| Stop nach echtem Bodywheel | 44px/ja | 44px/ja |
| Freigabe nach echtem Deckwheel | 44px/ja | 44px/ja |
| Hintergrundaktion nach Bodywheel | 44px/ja | 44px/ja |
| Eigene synthetische Stops | 1 | 1 |
| Antworten vor Stop | 0 | 0 |

Tatsächlicher Body-Scroll60/58px. Kein Forceklick, scrollIntoView oder versteckter
Antwortwrite. Keine echten Coreaktionen. Beide Screenshots selbst angesehen,
Standaloneaufnahme mit synthetischen Testdaten im Chat gezeigt.
Ergebnis `temp/hermes-v2/phase9-short-stop-mcp-results.json`, Bilder daneben.

Eigenen Testfehler erhalten: Der erste feste700px-Wheel überschoss die Freigabe
bis zum Kartenfooter. Es war kein Produktfinding. Korrigierter eigener Harness
zentriert das Ziel mit echten Wheelereignissen, verwendet frische IDs und bewahrt
die ursprüngliche Storagekopie auch über diesen Wiederholungslauf hinweg.
Erster eigener ESLint fand zwei fehlende requestAnimationFrame-Globals;
korrigierter gezielter Abschlusslauf mit `--no-ignore` grün.

## Integrität und Cleanup

Ein vorläufiger Build war nach dem ersten Autoren-Quellenstopp schon grün.
Danach korrigierte der Autor noch den spezifischeren Textareaselektor. Dieser
Vorlauf bleibt als nicht final dokumentiert; erst nach endgültigem Vierdatei-
Manifest wurde erneut gebaut. Finaler Buildlog:
`/tmp/wrapt-hermes-v2-phase9-short-stop-web-build-final.log`.

Vier-CSS-AutorfreezeSHA256
`ce944971088f711a8364354c498a2305a5f7624e7e2ac72eae6f7919c1e009c5`.
Neuer517erRootfreeze vor/nach identisch, SHA256
`3cccd1a20d081d00aba1e46b0ef0c18ded9bd3c98f2303aa69a370163c593221`,
`temp/hermes-v2/generated/phase9-short-stop-integrated-code-freeze.json`.
Alte511/513/516-Manifeste unverändert. Neue517teDatei ist der additive E2Etest.

Eigenes Storage exakt wiederhergestellt, Fixture disposed,0Viewer/Timer/
Upload-/Ressourcenpending, HTTP-Routen entfernt, eigene Fixturemaps geleert.
EigenerTab geschlossen, nur0about:blank verbleibt. Mangels unrouteWebSocket
bleiben inerte Handler zurück. Produktionsdistmtime weiterhin16.10.13:59:15UTC.
Keine Nutzerpreview-, Slot-, Account-, Git- oder Dienstaktion.

Neue unabhängige Personal-Codexinstanz übernimmt R4 nach dem bekannten
DeepSeek-Limitcheckpoint. Keine vorgetäuschte DeepSeekidentität.
Phase10 bleibt bis zum terminalen unabhängigen Gate gesperrt.

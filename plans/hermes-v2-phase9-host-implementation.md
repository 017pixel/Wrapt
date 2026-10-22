# Phase9: Hostauswahl, Implementierungsstand

17.10.2026. Das begrenzte Hostpaket ist implementiert und im Autorenstand
eingefroren. Dies ist kein unabhängiges Gate und keine Gesamtfreigabe für Phase9.

Die Hermesauswahl eines Orbitwerkzeugs liegt jetzt im bestehenden
`node.state.hermesAdminPath` des genauen Knotens. Erstellen, Auswählen und Reset
verwenden dieselbe bestehende Auswahlfunktion. Fremde Statefelder werden aus dem
aktuellsten Orbitzustand übernommen. Weitere Knoten und ihre Auswahl bleiben
unberührt, auch wenn zwei Werkzeuge dieselbe Terminalruntime-ID tragen.

`onHermesPathChange?: (path: string) => void` ist additiv. Die vereinbarte Kette
führt von ToolPanel über HermesShell, HermesV2Shell und HermesV2Surface an
useHermesV2Selection. Ohne Callback bleibt der normale Layoutpfad erhalten.
Route und Standalone behalten ihre eigene Sessionquery. Classic meldet interne
SPApfade an denselben Host zurück und liest externe Hostauswahl erneut.

Die gemeinsame Rückmeldung verwirft alte Referenzen nach Host-, Callback-,
Pfad- und Aktivitätswechsel sowie nach Unmount. Orbit beobachtet Änderungen der
tatsächlichen Board-/Nodebindung zusätzlich synchron und monoton. Auch A-B-A
ohne Zwischenrender entwertet alte Referenzen; die aktuelle neue Handlung bleibt
bedienbar. Vor dem Update werden Board, genaue Node-ID, Tooltyp, Runtime,
Projekt und bisheriger Hostpfad erneut geprüft. Ein Update mischt fremde Felder
aus dem neuesten State. Beschädigte, externe und übergroße Metadaten werden
verworfen; Legacy ohne Auswahl startet bei `/chat`.

Keine neue Verbindung, Persistenzinsel, Dependency oder Sessionverwaltung.
Nichtvisuelle Chat-/Ressourcenruntime, Lease-/Requestguards, Server und Contracts
blieben in diesem Paket unverändert. Versionierung und Browserintegration liegen
wie beauftragt bei Root.

## Dateien

Die 13 exklusiven Quell-/Testdateien stehen vollständig mit SHA256 in
`temp/hermes-v2/phase9-host/host-code-freeze.json`:

Manifest-SHA256:
`aa98aceefbf79c9cff66927928625e92c7d96e6445fec17b7f7b71e8ea1f7948`

- apps/web/src/components/ToolPanel.tsx
- apps/web/src/components/ToolPanel.hermes-host.test.tsx
- apps/web/src/components/hermes/HermesClassicShell.tsx
- apps/web/src/components/hermes/HermesHostSurface.test.tsx
- apps/web/src/components/hermes/hermes-host-path.ts
- apps/web/src/components/hermes/hermes-host-path.test.ts
- apps/web/src/components/hermes/hermes-host-selection.test.tsx
- apps/web/src/components/hermes/useHermesPathCallback.ts
- apps/web/src/components/hermes/v2/shell-selection.ts
- apps/web/src/components/orbit/OrbitNodeView.tsx
- apps/web/src/components/orbit/OrbitToolContent.tsx
- apps/web/src/components/orbit/OrbitToolContent.test.tsx
- apps/web/src/components/orbit/useOrbitHermesPath.ts

ToolPanel bleibt bei 392 Zeilen, OrbitNodeView schrumpft von 639 auf 632 Zeilen.
Die neue OrbitToolContent trennt ausschließlich den bisherigen Werkzeuginhalt
ab. Header, Fokus, Resizer, Terminalübergaben und Previewlogik bleiben erhalten.
Alle übrigen eigenen Dateien liegen unter 400 Zeilen.

Die engsten Propänderungen an HermesV2Shell.tsx und HermesV2Surface.tsx wurden
vorab übergeben. Ihr SHAstand liegt separat in
`temp/hermes-v2/phase9-host/surface-handoff.json`. Diese beiden Hashes belegen
ausdrücklich den Hostautorenstand vor der danach freigegebenen UIintegration.
Seit der ausdrücklichen Übergabe editiert der Hostautor beide Dateien nicht
mehr. Sie gehören deshalb nicht zum exklusiven 13er-Sourcefreeze. Root erstellt
nach Host- und UIpaket einen neuen integrierten Freeze.

Der verbindliche Propvertrag liegt in
`plans/hermes-v2-phase9-host-interface.md`.

## Prüfungen und Grenzen

- 126/126 gezielte Fälle grün: 54 neue Autorenfälle und 72 bestehende Fälle.
  Die elf Suiten umfassen Hostpfad, Auswahlhook, echte ToolPanelweitergabe,
  tatsächliche HermesShell/V2Surface-Auswahl mit Classiclink, OrbitToolContent,
  bestehende Classic-/V2Shell-, ToolPanel-, Layout-, Orbit- und Linkfälle.
- Neue Gegenfälle prüfen vollständige IDs, Reset, erneutes Einlesen eines
  serialisierten Orbitdokuments, Fremdfelder, genaue Node-ID bei gleicher
  Runtime, sofortige alte Rückmeldung, Board-/Runtime-/Projekt-/Tool-/Pfad-A-B-A,
  Host-/Callbackwechsel, Parken, Unmount und weiter gültige aktuelle Handlungen.
- `pnpm typecheck` vollständig grün, einschließlich Extension-Contracts,
  Contracts, Server, Web und E2E-Typen. Nach dem zusätzlichen Host-Surfacetest
  war auch die erneute volle Webtypprüfung grün.
- ESLint im eigenen Scope grün. `pnpm architecture:file-lines` grün. Der erste
  Architekturlauf meldete ausschließlich Roots zuvor 436 Zeilen langes
  Orchestrierungsprotokoll; Root archivierte es getrennt, ohne eigene Quellen
  oder Tests zu verändern.
- Phase8s 121er-Manifest erneut geprüft: 121/121 Quellhashes unverändert.
  Vorhandene Assertions, fremde Tests, Berichte und alte Manifeste wurden nicht
  angepasst.

Die zusätzliche Oberflächenprüfung wartet auf die tatsächlich gemountete
Lazyfläche, bevor sie Nutzerinteraktion auslöst. Ein bloß während eines noch
nicht gemounteten Renders beobachteter Callback ist kein gültiger Nutzeraufruf.

Roots anfänglicher roter E2E hatte Erstellen und Prompt bereits erfolgreich
ausgeführt. Er scheiterte danach an der fehlenden gespeicherten Nodeauswahl und
erreichte seinen späteren Reloadschritt noch nicht. Der zweite rote Fall zeigte
den fehlenden Sitzungsöffner. Diese Roottests blieben unangetastet und wurden
hier nicht ausgeführt. Tatsächlicher Browserreload, Verlauf, Öffner/Drawer und
Standalone-Toolbar gehören zur anschließenden getrennten UI-/Rootintegration.
Die vorhandenen Standalonelink-Helpertests bleiben grün; eine bereits sichtbare
Standaloneaktion im Panel wird damit nicht behauptet.

Keine Dienste, Produktionsbuilds, Browser, Previews, Accounts, Gitoperationen,
HermesCLI oder echte Coremutationen verwendet. Nach diesem Bericht bleibt der
eigene Code bis zum unabhängigen Gegencheck eingefroren.

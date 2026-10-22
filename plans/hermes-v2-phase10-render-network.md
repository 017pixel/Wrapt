# Phase10, Paket A: Reactdarstellung und Netzwerk

17.10.2026. Read-only-Prüfwelle nach Roots ausdrücklicher Phase10-Freigabe.
Original §§12/16/18, vollständiger Paketauftrag und terminaler Phase9-R4 gelesen.
Keine Produktfreigabe oder eigene unabhängige Reviewidentität behauptet.
Ergebnis: A1/A2 konkret, A3 Low; A4 betrifft das strengere Root-Paketziel.
Keine Produktquelle geändert. Alle Artefakte unter
`temp/hermes-v2/phase10-render-network/`, Messdaten unter `generated/`.

## Tatsächlicher Aufbau

Rootserver19470 unverändert verwendet. Eigener Port19471 vorher mit ss frei
geprüft, Vite ausschließlich127.0.0.1 mit strictPort. Start:
`WRAPT_DEV_BACKEND_URL=http://127.0.0.1:19470 pnpm exec vite --config temp/hermes-v2/phase10-render-network/vite.config.ts`.
Temporäre Config erweitert die bestehende Appconfig; Produktconfig bleibt gleich.
config-infos, design-system-guide, mobile-design und show-me angewandt.

Reale App, React StrictMode, Router, Sidebar, Chat, Markdown und Ressourcen.
Temporärer Vite-Devtransform setzt einen echten React Profiler um App und zählt
tatsächlich ausgeführte Komponentenfunktionen innerhalb bestehender Memo-Grenzen.
Keine UI-/Storekopie. Keine Instrumentierung in Produktdateien geschrieben.
Profiler-onRender tatsächlich aufgerufen; kein Produktionsprofiler erfunden.
Funktionsaufrufe enthalten StrictMode-Doppelaufrufe. Dauern stammen vom gesamten
App-Profiler, nicht von einzeln vermessenen Sidebarzeilen. Gemeinsam genutzter
Host, keine CPUdrosselung; Devwerte sind keine Produktionsbenchmarkwerte.

Fixture aus unveränderten Browserfakes plus eigenen synthetischen IDs gebündelt:
`pnpm exec esbuild` mit bundle/platform=browser/format=iife,
global-name=HermesBrowserFixture und eigenem node:crypto-Shim. Jede Snapshotrow
und alle4000 Historynachrichten vor Installation gegen echte Contracts geprüft.
60 Sitzungen,24 Working-Summaries, initial23 tatsächliche Workingzeilen neben
aktiver Auswahl. Drei Toolausgaben mit je175.021 Zeichen und5000 Textzeilen.
Nur ausgewählte Sitzung vollständig geleast, kein Abo für jede Working-Summary.

## Last und A1: Roster-/Ressourcenrenders pro Token

19 echte Historybutton-Klicks führen zu20 history.read-Seiten und4000 DOMrows.
12.369ms gemessen,27.011 DOMelemente,60 Sidebarzeilen.50 Reactcommits,
4321,0ms summierte actualDuration, maximal257,0ms je Commit.
Die vierte Tausendergrenze bleibt begrenzt; der spätere Liveturn verdrängt eine
alte Row und meldet die bestehende Speichergrenze ehrlich.

60 tatsächlich zugestellte Tokens:3968ms,62 Commits,2051,4ms actualDuration,
maximal184,1ms je Commit. Statische Historyrows rendern nullmal neu, gesund.
Die Livezeile rendert120-mal, alle60 SidebarRowBase-Instanzen aber je124-mal,
insgesamt7440 Aufrufe. Surface/SidebarPanel jeweils124 Aufrufe. Keine HTTPreads
oder WS-Clientframes während dieses Tokenfensters. DOM danach27.020 Elemente.

Ruhige Gegenphase4103ms:4 Commits,733,1ms actualDuration, je8 Sidebaraufrufe.
Gesunder relativer Sollbeleg124≤8+2 ist rot. Der frühe absolute Grenzwert6 ist
angesichts der gemessenen ruhigen8 Aufrufe zu eng und kein späterer Gatebeleg.
Beide ursprünglichen Rotartefakte bleiben erhalten, keine Produktumgehung dafür.

Nach echtem Cronklick:30 Chattokens in888ms,31 Commits,62 Aufrufe der sichtbaren
HermesV2ResourceRegion:cron. Ebenfalls rot, obwohl keine neuen Reads entstehen.
Repros: `stream-measure.js`, `quiet-control.js`, `resource-network.js`.
Kleinster vermuteter Fix: Memo-Grenzen um SidebarPanel und ResourceRegion plus
stabiler Closecallback der Surface. Keine Runtime-/Read-/Ownerfilter nötig.
Eigene Ressourcenstore-Abos müssen weiter normal rendern. Nach Umbenennungen
müssen die Instrumentierungsnamen mit positiver Warmkontrolle geprüft werden;
ein fehlender Counter darf nicht als Nullrenders gelten.

## A2: geöffnete große Toolausgabe unbegrenzt

Tatsächlicher Summaryklick bei1280×720: Karte105.170px, Toolbody105.136px,
Output-pre105.039px. Output-clientHeight105.037=scrollHeight105.037,
Nachrichtenviewport172px. Kein lokaler begrenzter Scrollancestor innerhalb
der Karte. Geschlossen34px, ausschließlich gesunde Höhen-Gegenrichtung.
Screenshot `large-tool-open.png` selbst angesehen und im Chat gezeigt.

Gesunder flexibler Repro `large-tool-local-scroll.js` ebenfalls rot: er erlaubt
den begrenzten nativen Scroll am pre oder einem anderen Ancestor innerhalb der
Karte. Der frühe pre-only-Repro war enger und darf einen guten Toolbody-Fix
nicht ablehnen. Er bleibt in `large-tool.js` und alten Rotdaten unverändert.
Vermuteter Fix: Toolbody begrenzen, voller Text erhalten, nativer Wheel-/
Tastaturzugang. Keine Textkürzung als Höhenkorrektur oder Änderung der Lesebelege.

## A3 Low: tatsächliche Desktopziele unter44px

Bei1280×720: Toolsummary642×32, Reasoningsummary616×32,
Nachrichten-Copy70,61×24, Code-Copy104,39×24. Rote44px-Kontrolle.
Mobil44 laut CSS ist kein Desktopnachweis. Code-Copy ist absolut im pre;
ein Fix braucht auch Platz für den vollständigen Hitbereich und sichtbaren
einzeiligen Code. Nicht bloß min-height ändern und dabei Inhalt überdecken.

## Netzwerk, Original-App und A4-Abgrenzung

HTTPrequests und tatsächliche Clientframes der Gatewayfixture separat gezählt.
Initialer Devstand:8 Organisations-/Katalog-HTTPrequests einschließlich zweier
StrictMode-Katalogstarts, genau subscribe/catalog.read/work.read für die Auswahl.
Tokenfortschritt: null neue Reads oder Abos.25 Workinvalidierungen koaleszieren
zu1 work.read. Geöffnete Approvalkarte sendet nichts; bewusster Fakeklick genau
1 request.respond, keine Prompts, Creates oder Stops. Sitzungswechsel: je einmal
unsubscribe alt/subscribe neu/catalog.read/work.read plus2 Organisationsreads.

Ressourcenwechsel: Skills2 Reads inklusive pending, Memory2 inklusive pending,
Diagnose1, Cron1. Danach3002ms keine weiteren Reads oder Frames, kein Poller.

Im vollständigen unveränderten19470-Original-Appbundle ohne Profilerartefakt:
Standalonestart off3004ms, tatsächlicher UI-Flagoff4003ms und vollständiger
Route-Coldoff3003ms jeweils null neuer V2-Traffic/Viewer. App-Shell beim Routefall
tatsächlich vorhanden. Hintergrundfake bleibt running, kein Stop ausgelöst.

Echter zweiter eigener Headless-Tab lässt document.visibilityState visible.
Hidden deshalb ausdrücklich kontrollierter Documentgetter plus visibilitychange,
kein OS-Hiddenbeleg. Nach500ms Ruhe und zwei Invalidierungen:4008ms später
4 neue Reads, null Clientframes/Stops, Hintergrund weiterhin running.
Unabhängig vom Devserver am vollständigen19470-Appbundle wiederholt, gleich rot.

Echtes PersistentOutlet-Parking per Settingsklick: is-parked/inert/aria-hidden,
eine erhaltene V2-Surface.3002ms ohne Events null Traffic. Dieselben beiden
Invalidierungen aktiv und geparkt jeweils4 Reads: organization(id), sessions,
sessions/lookup, organization(all60). Kein periodischer Poller belegt.
A4 ist die rote strengere Root-Nulltraffic-Kontrolle, kein behaupteter High oder
Original-DOD-Blocker: Original§12.3 verlangt bei inaktiver Route reduziertes
UI-Polling und ausdrücklich null Zusatztraffic bei Flagoff. Root entscheidet,
ob ein Visibilityguard mit sicherem Resume nötig ist oder diese Grenze bleibt.

## Belegcounts, Checks und Grenzen

`generated/browser-terminal-results.json`:24 Browserblöcke,14 grün,10 rot.
Rotdaten vollständig erhalten; darunter die zwei oben erklärten zu engen
Frühkontrollen, Mehrfachbelege derselben Findings und drei strenge A4-Kontrollen.
Keine zehn verschiedenen Fehler behauptet. MCP-Blöcke haben keinen OS-Exitcode.
Null JS-Pageerrors. Volle Counter-/Profilerdaten in browser-measurements.json.

Eigene Harnessfehler: erster falscher Ressourcenlocator lief in einen Timeout;
eine Workfixture nutzte ungültigen reason. Nur eigenen ungesendeten Cursor
zurückgestellt, korrekten roster-Repro danach gesund ausgeführt. Kein Fehler
als Produktfinding gezählt. Frühe falsche Root-/Routepfade nicht als UIbefund.
Eigener Devprozess endete unerwartet mit SIGTERM/Exit143, Ursache nicht belegt.
Profilerläufe lagen davor; Off-/Hidden-/Parkingbestätigung danach an19470.

pnpm typecheck vollständig Exit0. Eigene16 Handdateien Scoped ESLint Exit0 mit
no-ignore/max-warnings=0; Fragment zuerst Exit1 durch unbenutzten Global-Kommentar
im Lintwrapper, final parametrisiert ohne diesen Kommentar Exit0. Fragmentquelle
unverändert. Architektur Exit0,
keine Baseline geändert. Keine Mirror- oder alten Tests geändert. Handdateien
höchstens58 Zeilen; keine Produktionsbuilds, echten Coreturns oder Gitaktionen.

## Freeze und Cleanup

Vor/nach523/523 Sourcehashes identisch, Rootmanifest bytegleich:
`879fb6d5f5e71574b02e46294419fdde763fab925f2e0472164b114b7820e3d6`.
Alte Repros/Berichte/Manifeste/Fakes unangetastet. Root19470 unverändert mit
PID1123331,19471/19472 frei. Kein eigener Devprozess oder CLI-Lauf verbleibt.

cleanup.json: null Viewer/Timer/Requests/Claims/Work-/Resourcepending/Uploads,
Fixturemaps geleert, eigene HTTPmuster und Pagelistener entfernt. Cookies und
localStorage-state exakt wieder `{cookies:[],origins:[]}`, beide eigenen Origins
local/sessionStorage leer. Eigene Tabs geschlossen, nur Tab0 about:blank bleibt.
SW-/Cachebaseline vor erstem Appstart nicht erfasst; bestehende SWregistrierung
blieb erhalten. Kein vollständiger Cache-/SW-Restore behauptet. Kein
unrouteWebSocket verfügbar; verbleibende Fixturehandler sind inert ohne Inhalte,
Verbindung oder Timer. Browser an Root zurückgegeben, keine weitere MCPaktion.
Keine weiteren Agents, Nutzerprozesse, Previews, Slots oder Versionsänderungen.

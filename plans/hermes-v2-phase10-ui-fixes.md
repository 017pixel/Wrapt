# Phase 10, UI-Fixes A1 bis A3

17.10.2026. Eng begrenzte Fortsetzung nach Accountlimit des vorherigen Autors.
Originalauftrag vollständig gelesen, AGENTS.md sowie sprachstil,
design-system-guide, mobile-design und show-me angewandt. Keine eigenständige
unabhängige Reviewidentität oder finale Produktabnahme behauptet.

## Quellen und Ergebnis

Die vorhandenen Teilfixes des vorherigen Autors wurden übernommen und geprüft.
Im Resume waren keine weiteren Produktänderungen erforderlich. Finaler Scope:

- `HermesV2Surface.tsx`: Memo-Grenzen um Sidebar und Ressourcenregion;
  stabile Auswahl-, Neu-, Schließen- und Deletecallbacks. Eigene Storeupdates
  bleiben durchlässig. Keine Änderung an Runtime, Store oder Contracts.
- `HermesV2ToolCard.tsx`: benannte, per Tab erreichbare Detailsregion.
- `hermes-v2-messages.css`: lokale native Scrollfläche, sichtbarer Fokus,
  Summary-/Copyziele mindestens44px und eigener Platz oberhalb von Code.

Die drei Dateien haben350/73/369 physische Zeilen. Quellen seit der frühen
Freeze-Nachricht an Root unverändert; SHA256 unter `generated/freeze.json`.
292 geschützte ursprüngliche Artefakte entsprechen vollständig der vorhandenen
Baseline. Alte rote Repros und Berichte wurden nicht verändert.

## Aktueller echter React-Profiler

Geprüften eigenen Viteprozess19471, PID2586960/CWD Wrapt übernommen. Er nutzt
die temporäre Instrumentierung aus phase10-ui-fixes und Rootbackend19470.
Produktive Assets und alter19470Webbuild wurden dafür nicht gebaut/verwendet.
Echte App unter StrictMode, echter React-Profiler, Funktionszähler innerhalb
vorhandener Memo-Grenzen. Devmessungen auf gemeinsamem Host, keine belastbare
Produktionsbenchmark oderCPUdrosselung behauptet.

Fixture installiert aus unveränderter generierter Kopie; synthetische Daten
gegen echte Contracts geprüft.60 Sitzungen,24 Working-Summaries,23 tatsächliche
Workingzeilen neben Auswahl;4000 Historyrows.19 echte Loadbuttonklicks,
20 history.read-Seiten,4000 DOMrows,27011 DOMelemente.11999ms,49 Profilercommits,
4042,6ms summierte actualDuration, maximal188,7ms. Ein Auswahlabo.

A1 grün:60 tatsächlich zugestellte Tokens in3473ms,62 Commits,1739,8ms
actualDuration. Statische Historyrows null Neurenders; Livezeile120 Aufrufe.
Alle60 Sidebarzeilen je4 Aufrufe statt zuvor124. Surface124 Aufrufe, SidebarPanel4.
Ruhige4103ms-Gegenphase: je8 Sidebarzeilenaufrufe. Relativer Vergleich4≤8+2 grün.
Tokenfenster ohne neue HTTPreads oder Clientframes.

Positive Warmkontrolle: Cronregion8 Aufrufe, SidebarPanel78, geprüfte Sidebarrow66.
Danach30 Tokens in869ms: null Cronregion-Aufrufe,30 tatsächliche Profilercommits,
null HTTPreads/Clientframes. Keine fehlenden Counter als gesunde Null gewertet.
Eigene Croninvalidierung lässt Region14→20 rendern und neuen Jobnamen anzeigen;
eigene Sidebarinvalidierung zeigt geänderten Titel und „1 neu“.
Skills/Memory/Diagnose/Cron laden weiterhin2/2/1/1 HTTPreads; danach3003ms Ruhe
ohne neue Reads oder Frames. Keine Runtime-/Ownerfilteränderung dafür nötig.

## Toolscroll und Hitbereiche

A2 grün: erster175021Zeichen-Output vollständig mit Fixturequelle verglichen.
Bei1280×720 lokale Toolregion288px, scrollHeight105136px, Tabfokus mit sichtbarem
Ring. Echte Tastatur End→104848, Home→0 und echtes Wheel→650. Bei1440×900
Karte366px, lokale Region320px. Texte werden nicht abgeschnitten oder gekürzt.

A3 grün: bei1280×720 Summary642×44, Reasoning616×44,
Nachrichten-Copy70,61×44, Code-Copy104,39×44. Alle3997 Nachrichten-Copyziele
vermessen. Einzeiliger Code liegt5px unter dem vollständigen Copyhitbereich.
1440×900,1024×768,768×1024 und390×844 jeweils keine Dokumentüberbreite,
alle vier betroffenen Zielarten mindestens44px. Mobile Codecopy90×44.
Reduced-Motion ergibt animationName:none für den Streamingcursor.

Vier Größenscreenshots sowie tool-scroll.png und tool-open-1440.png unter
`temp/hermes-v2/phase10-ui-resume/`, alle selbst visuell angesehen.
Gültige eingeschränkte Dark-Mode-Prüfung im bestehenden Wraptdesign;
kein vollständiger Light-/Keyboard-/Mehrthemeabnahmelauf behauptet.

## Checks und Grenzen

Eigene Browsermessdaten in `generated/browser-results.json`:11 benannte
Fixtureblöcke grün, zusätzlich dokumentierte Hit-/Responsive-/Reduced-Motion-
Prüfungen. Null JS-Pageerrors. MCPblöcke haben keinen OS-Exitcode.
Scoped Komponententests: SurfacePanels3/3, ChatSurface/Markdown22/22,
MessageList10/10, zusammen35/35, jeweils Exit0. Webtypecheck Exit0.
ESLint für die beiden TSXquellen mit max-warnings=0 Exit0.
Architekturprüfung Exit0 im eigenen Log. Roots globale Checks sind kein eigener
unabhängiger Reviewbeleg. Keine neuen Mirror-/Abschwächungstests eingeführt.

Ein eigener Einstieg ohne /wrapt/ ergab erwarteten Vitebase404; korrigiert vor
Appprüfung. Kein Produktfinding. A4 bleibt ausdrücklich außerhalb dieses Fixes:
Original§12.3 verlangt reduziertes UIpolling bei Parking, nicht Roots strengere
Nulltrafficforderung bei jeder Invalidierung. Keine weitere Scopeausweitung.
Die statischen4000 Historyrows bleiben gesund, keine zusätzliche Virtualisierung.

## Cleanup und Übergabe

Browserfixture komplett entsorgt:0 Viewer/Timer/Requests/Claims/Work-/Resource-
Pending/Uploads, fakeWrites[]; kein Prompt/Create/Stop/Approval gesendet.
HTTPmuster und Pagelistener entfernt, Fixturemaps geleert, eigene Seite geschlossen.
Cookie-/Localstoragebaseline exakt `{cookies:[],origins:[]}` wiederhergestellt;
19470/19471 Local- und Sessionstorage leer. Keine SW-/Cachebaseline vor erstem
Appstart erfasst, daher kein vollständiger SW-/Cacherestore behauptet.
Kein unrouteWebSocket verfügbar; verbleibende Handler sind inert ohne Verbindung,
Inhalt oder Timer. `generated/cleanup.json` enthält die Einzelbelege.

19471 war beim abschließenden gezielten Kill bereits beendet, Ursache unbewiesen.
ss bestätigt19471 frei, Root19470 unverändert PID1123331. Browser exklusiv an
Root zurückgegeben, danach keine weitere Browseraktion. Keine Nutzerpreviews,
Slots, Sessions, Dienste, Git-, Neustart- oder Versionsaktionen.

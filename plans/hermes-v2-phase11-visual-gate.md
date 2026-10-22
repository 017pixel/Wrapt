# Hermes V2 Phase 11: unabhängiger Visualreview

18.10.2026. Neue Codexinstanz, ausschließlich readonly am Produkt.
**Urteil: C1/C2/C3 unabhängig geschlossen. Ein neuer Low-Bildbefund P11-V1 offen.**
Kein belegter Blocker/High. Kein Gesamtfeature-PASS, Backendkorrekturen laufen separat.

## Auftrag und tatsächlicher Aufbau

AGENTS.md, sprachstil, design-system-guide und mobile-design gelesen und angewandt.
Vollständigen Originalauftrag sowie final-review-findings, Backendgate,
phase11-visual-context, phase11-review-wave und Phase10-C-Gate/-Fixes gelesen.
Der vorige GLM-Turn endete nach Serverstart ohne Report/Browserprüfung und zählt
ausdrücklich nicht als PASS. Laut Übergabe baute er versehentlich apps/server/dist.
Ich habe diesen Build weder ausgeführt noch zurückgesetzt; kein Dienstneustart.

Nur Playwright-MCP, zuerst browser_navigate und browser_snapshot. Keine anderen
Browserwerkzeuge oder Agents. Erster irrtümlicher Rootaufruf `/` lieferte500;
die tatsächlichen `/wrapt/`-Routen laden. Kein Build/Restart daraus abgeleitet.
Bestehender Rootserver127.0.0.1:19470, PID3904419, HERMES_ENABLED=false.
Webpfad tatsächlich `/tmp/opencode/p11-visual-web-out`; Index bytegleich mit
`temp/hermes-v2/phase11-visual-final-20261018/web-out/index.html`.
Keine weiteren Builds, Dienste, Previews, Git-, Versions- oder echten Hermesaktionen.

Eigene Artefakte: `temp/hermes-v2/phase11-visual-codex-20261018/`, unten Reviewtemp.
Vorlagen aus phase11-visual-review bytegleich kopiert, bisherige Phase10-Fixture
und tatsächliche E2E-Verträge gelesen. Transport/Snapshots synthetisch abgefangen;
65 Sitzungen,24 Workingbelege,4000 Historyrows,drei5000-Zeilen-Toolausgaben.
Die echte Produktoberfläche wird gerendert, keine separate Mockup-UI.
Echtes Orbitpanel aus abgefangenem Orbitdokument; null Orbitwrites am Server.

## P11-V1 Low: Memory-/Providerüberschriften überlagern Pendingbereich

Gesundes Soll: Untereinander angeordnete native Pendingbelege und Memorydateien
bleiben räumlich getrennt; Scrollen erhöht den Platz statt Inhalt zu übermalen.
Bildbeleg `dark-Memory.png`,1440×900,Memory mit zwei gültigen Pendingrecords.
Die Überschrift Anbieter beginnt im Bild ungefähr bei y601, MEMORY.md bei y615,
während die zweite Pendingkarte bis ungefähr y628 reicht. Überlappung sichtbar.
Die Werte sind Screenshotkoordinaten, keine behaupteten DOM-/Hitmessungen.

Quellbezug: HermesV2MemoryArea rendert PendingList vor resource-split.
hermes-v2-resources.css gibt pending und resource-split beide min-height:0;
Pending bleibt standardmäßig schrumpfbar im vertikalen Ressourcen-Flexcontainer.
Dies passt zur sichtbaren Überlagerung; genaue DOM-Reproduktion und Korrektur
gehören Root nach diesem readonlyReview. Keine Behauptung von Datenverlust oder
unbedienbarem aktiven Pendingwrite, dessen native Aktionen sind hier disabled.
Der Bildbefund wurde beim abschließenden Selbstansehen gemeldet. Browserlease
war bereits zurückgegeben; deshalb keine weitere Browserinteraktion behauptet.

## C1/C2/C3: tatsächliche unabhängige Nachprüfung

Alle nachfolgenden Größen nach Elternclipping plus tatsächlichem Centerhit.
C1 Desktop: Neu laden92,17×44,Menü44×44,Denktiefe130,89×44,Anhang129,97×44.
C3: drei Shelfschalter44×44; Projektselect486×44 mit16px-Schrift;
Abbrechen96,08×44; Sitzung erstellen150,92×44. Null Createwrites.
Memory-/Diagnose-Verwaltungslinks jeweils186,36×44 mit echtem Hit.
Nach19 echten Historyklicks4000 DOMrows und echtes Speichergrenzenbanner:
Erneut abgleichen144,36×44. Sämtliche früheren C3-Ziele damit geschlossen.

C2 Hilfe über echten /help-Command: bei1440 und390 je Escape und Schließen.
Bevorzugter Closefokus und Rückgabe in den Composer alle viermal korrekt.
Danach zweizeiliger Tastaturentwurf mit Shift+Enter unverändert, null Submit.
Modellpicker hält14 Tabs im Dialog, Escape gibt Triggerfokus zurück.
Mobile Sitzungssuche nach ID zeigt genau eine Zeile, Sidebardrawer sichtbar.
Secretinput336×44/16px/maskiert; synthetische Eingabe per Requestcancel entfernt,
keine Secretantwort gesendet. Freigabeoptionen jeweils164×44 mit echten Hits.

## Größen, Streaming, Toolausgaben und Themes

1440×900,1024×768,768×1024,390×844,390×500 tatsächlich in Dark und Light.
Dokumentbreite jedes Mal exakt Viewportbreite, Eingabe16px/44px und erreichbar.
60 echte synthetische Tokens,je12 pro Größe: Eingabe-x/-Breite konstant.
message.started bis sichtbarem Stop54ms, keine allgemeine Backendlatenzgarantie.
Toolscrollhöhe320/307/320/320/200px statt über100000px hoher Karte.
Alle drei Tooltexte exakt175021Zeichen gegen vollständige Fixturequelle geprüft.
Lokaler benannter Scrollbereich: Tabfokus, sichtbarer Ring,End104816,Home0,
echtes Wheel600. Kein Textverlust aus der Höhenbegrenzung.
Zusätzlicher kleiner Gegenfall bei1440/390: Tool-/Reasoningsummary,
Nachrichten-Copy und Code-Copy alle44px hoch mit vollen Trefferflächen.
Einzeiliger Code beginnt unter dem Copybutton, keine Überdeckung.

Light verwendet die vorhandene Themefunktion mit allen22 Farbrollen aus der
etablierten synthetischen Lightfixture. Keine Drei-Tokens-Probe/CSSkorrektur;
kein eingebautes Lightpreset behauptet. Normale und Standalonefläche sowie
Modellbottomsheet angesehen. Bestehende dunkle globale Quietbuttons/Glasflächen
in normaler Shell und Panel bleiben sichtbar, Text und Aktionen lesbar.
Reduced Motion tatsächlich emuliert:matchMedia=true,0laufende Animationen,
Streamingcursor animationName=none. Kein Geräte-/60fps-Benchmark behauptet.

Echtes Orbitnode450×650 auf1440×900,Surface448×612,kein künstliches CSSresize.
Input237,14×44/16px und Stop80,05×44 vollständig innerhalb aller Clips erreichbar.
Alle fünf Bereichstabs44px hoch mit Centerhit. Vollständiger langer CWD im title
des fokussierbaren Kontextfelds exakt erhalten. Panelchat ohne iframe.
Normale Desktopfläche und Panel auch mit vollständigem Lighttheme angesehen.

## Kurze Höhe und bewusst erhaltene Grenze

Originaltrigger390×500:laufend,offene Freigabe,offene Workansicht,10fertige Anhänge.
Standalone initialer Stop80,05×44 bei y370,normal bei y414,je volle44px sichtbar
und realer Hit,ohne vorheriges scrollIntoView. Null Freigabe-/Promptwrites.
Zusätzliche4000Rows plus Speichergrenzenbanner:initiale sichtbare Stophöhe0.
Echtes Bodywheel und Tastaturfokus erreichen jeweils44px bei y312 mit Centerhit.
Unter dieser Zusatzlast fing Work/Banner auch den direkten Klick auf eine alte
Toolsummary ab. Gesunder separater1440er-Read prüft alle drei Volltexte erfolgreich.
Diese Druckgrenze wird nicht als alter unerreichbarer M4 oder als grün für jede
Kombination ausgegeben. iOS-Tastatur und nichtnull Hardware-Safeareas ungetestet;
vorhandene env(safe-area-inset-*)-Regeln gelesen,kein echter Gerätebeleg.

## Belege, Prüfungen und ehrliche Fehlversuche

`generated/browser-results.json`:17benannte Blöcke,14grün,3rote Erstversuche.
Separat grüne Wiederholungen erhalten, keine alte Assertion überschrieben.
Erstfehler:Suchlocator ohne Leerzeichen,Toolklick unter beschriebener Zusatzlast,
ungültiger Secretfixture-Vertrag vor Parse. Zusätzlich breiterer Suchlocator
mehrdeutig; Secret mit tatsächlichen label/hint-Feldern danach gesund.
Inline-Themescript wurde von CSP abgewiesen; dieselbe bestehende Themefunktion
danach via Playwright-evaluate ausgeführt. Kein CSP-/Produktcode gelockert.
Node require/import ist in der MCP-Sandbox nicht verfügbar; keine Ersatzbrowser.
Null Produkt-Pageerrors. MCP-Blöcke besitzen keinen OS-Exitcode.

29Screenshots erstellt und selbst über view_image angesehen, alle im Reviewtemp:
dark-/light-{1440x900,1024x768,768x1024,390x844,390x500}.png;
new-session-desktop,dark-Memory,dark-Diagnose,large-tool-desktop;
dark-model-390,light-model-390,dark-sidebar-search-390;
short-initial-{standalone,normal},normal-{dark,light}-1440;
real-panel-{dark,light}-450x650,history-banner-1440;
short-pressure-{initial,wheel},output-counter-{1440,390},secret-mobile,jeweils.png.

pnpm typecheck Exit0. Architekturerstlauf Exit1 durch eigene generierte Fixture/
JSONartefakte im falschen Ordner. Diese eigenen generierten Dateien unverändert
nach generated/ verschoben, keine Checker-/Baselineänderung. Danach Architektur
Exit0. Handgeschriebene eigene Harnesses höchstens58Zeilen; Themeableitung138.
Kein Volltestmarathon, keine Produktionsbuilds. Erstlogs bleiben erhalten.

## Freeze, Cleanup und Übergabe

Vor/nach270/270Frontendquellen exakt zum finalen528er-Manifest identisch.
Gesamtmanifest schon beim Start522/528identisch; sechs Backenddateien gehörten
den parallel autorisierten Autoren. Während Review normalize-history geändert.
Keine Behauptung eines unveränderten Backendfreezes. Hashbelege generated/.

cleanup.json:Viewer/Timer/Requests/Claims/Workreads/-actions/Ressourcenreads/
-actions/Uploads alle0. HTTPfixture und Orbitroute entfernt,Pageerrorlistener
entfernt,Maps geleert. Storage exakt zur ersten Beobachtung vor erfolgreichem
Appaufruf zurück:Cookies[],Origins[],Sessionstorage{}. Eigene Metrik entfernt.
Einziger Tab wieder about:blank,Viewport1280×720,Mediaoverrides zurückgesetzt.
Kein unrouteWebSocket verfügbar:verbliebene Handler inert ohne Daten/Viewer/Timer.
Keine SW-/Cachebaseline vor erstem Appaufruf; bestehende Registrierungen unberührt.
Rootserver PID3904419 unverändert und nicht beendet. Browserlease ausdrücklich
zurückgegeben,danach keine MCP-Browserinteraktion. Root besitzt P11-V1-Repro/Fix,
weiteren UXreview und den echten Schluss-Smoke. Keine eigenmächtige Scopeausweitung.

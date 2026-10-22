# Phase 10: unabhängiger Bediencheck C

17.10.2026. Neue Codexinstanz nach unterbrochenem Erstlauf. Originalauftrag
vollständig gelesen, besonders §§12,16 Phase10,18; Paket C, alte Befunde und
Autorenantworten gelesen. AGENTS.md, sprachstil, design-system-guide und
mobile-design angewandt. Keine Produktänderung und keine eigene Phase11- oder
Gesamtfreigabe. Urteil: C1/C2 geschlossen, C3 Low offen, kein neuer High/Blocker.

## Tatsächlicher Aufbau

Rootserver19470 mit Sourcebackend/HERMES_ENABLED=false und aktuellem Tempbuild.
Keine Nutzerpreview, Dienste, Slots, Accounts oder echten Hermesaktionen verwendet.
Interaktiver Browser ausschließlich Playwright-MCP, erst navigate, dann snapshot.
Bei Übernahme nur Tab0 about:blank und keine alte Kontextfixture vorgefunden.
Eigene Artefakte ausschließlich `temp/hermes-v2/phase10-c-complete/`.

Eigener Profiler19471 vorher per ss frei geprüft, Vite nur127.0.0.1/strictPort,
WRAPT_DEV_BACKEND_URL=http://127.0.0.1:19470. Kopierter temporärer Devtransform
instrumentiert tatsächliche Komponentenfunktionen und React Profiler. Kein
Produktdebugflag, keine zweite UI-/Storeimplementierung. Dev/StrictModewerte
sind keine Produktionsbenchmark oder allgemeine Latenzgarantie.

Fixture mit echten Contracts validiert:60 Sitzungen,24 Working-Summaries,
4000 Historynachrichten, drei Tools mit jeweils175021 Zeichen/5000 Textzeilen.
19 echte Historyklicks ergeben4000 DOMrows,60 Sidebarrows und23 sichtbare
Workingrows neben der aktiven Auswahl. Gemessene Ladezeit6610ms am Tempbuild.

## C1 und C2 unabhängig wiederholt

C1 bei1440: Neu laden92,17×44, Sitzungsmenü44×44, Denktiefe130,89×44,
Datei anhängen129,97×44. Tatsächliche sichtbare Clipfläche und Centerhit geprüft,
keine bloße CSSbehauptung. Alter gesunder Trigger bleibt grün.

C2 zweimal nur Tastatur: Composer /help, Enter, Closefokus, Escape bei1440/390.
Fokus kehrt jeweils direkt in den Composer zurück. Danach Tastaturentwurf mit
Shift+Enter bleibt zweizeilig, null message.submit. Modellpicker hält Fokus über
14 Tabs und stellt Trigger wieder her; Sidebar über16 Tabs mit Suche auf genau
eine Sitzung ebenfalls gesund. Der frühere BODY-Fokus ist nicht reproduzierbar.

## C3 Low: weitere tatsächliche Desktopziele unter44px

Gesundes Soll: interaktive Ziele mindestens44×44, gemäß beiden Designskills.
Trigger:1440px, jeweilige Fläche öffnen, Ziel tatsächlich in Sicht scrollen.

- Drei Shelf-Schalter Einklappen/Ausklappen32×44, Centerhit gesund, keinerlei
  ::before/::after-Flächenerweiterung. `.hermesv2-shelf-collapse`.
- Bei4000Rows plus Liveturn zeigt das echte Speichergrenzenbanner
  Erneut abgleichen144,36×36. `.hermesv2-action-error .quiet-button`.
- Neue Sitzung: Projektselect486×36, Abbrechen96,08×36 und Sitzung erstellen
  150,92×36. Selectschrift16px, Close44×44, Dialog ohne Create wieder geschlossen.
- Memory und Diagnose: Hermes-Verwaltung öffnen jeweils186,36×16 mit echtem
  Centerhit und ohne Pseudoelement-Erweiterung. Dies sind separate sichtbare Links.

Alle übrigen im aktuellen Chat-/Sidebarzustand gerenderten button/a/summary bei
1024/768/390 mindestens44px; vereinzelte43,984px während Layout/Animation sind
keine zusätzliche Fehlerklasse. Ressourcenziele Cron/Skills im Desktopscan gesund.
Versteckter Dateiuploadinput1×1 wird über den44px-Anhangbutton bedient und ist
kein eigener Fehlbefund. Root früh informiert, Korrektur erst nach diesem Freeze.

## Last, Größen, Tools und Status

1440×900,1024×768,768×1024,390×844 und390×500: Dokumentbreite jeweils exakt
Viewportbreite; Eingabe16px,44px hoch und tatsächlich erreichbar. Drei große
Toolvolltexte bleiben unverändert. Lokale Toolhöhe320/307/320/320/200px.
Geöffnete175021-Zeichen-Ausgabe exakt mit Fixturequelle verglichen, Tabfokus mit
sichtbarem Ring, End104816, Home0 und echtes Wheel650. Karte dominiert nicht
den Chat durch die frühere105170px-Gesamthöhe.

message.started bis sichtbarem Stop190ms. Danach je20 echte Tokens in den fünf
Größen: Eingabe-x und -Breite jeweils konstant, keine Dokumentüberbreite.
Das ist die gemessene UIreaktion nach Fakeevent, keine Backendlatenzgarantie.

Zusätzlicher450×650-Host in1440×900 per temporärer reiner Elementgröße geprüft:
Containerlayout klappt auf schmal, Input und Stop44px mit Centerhit. Screenshot
narrow-host-450x650.png. Kein echter Orbitpanel-/Devicehardwarebeleg. Interne
Toolbar kann horizontal scrollen; primärer Chatinhalt bleibt im450px-Host.

Gesunder bisheriger Shortstoptrigger unabhängig grün:390×500, laufender Turn,
offene Freigabe, Workregion und10 fertige Anhänge, Stop initial44px/Centerhit.
Zusätzliche Grenzlast4000Rows plus Speichergrenzenbanner macht den Chatkörper
höher; Stop dann initial0px sichtbar. Echtes Wheel und Tastaturfokus erreichen
jeweils44px vollständig. Dies bleibt eine erreichbare Scrollgrenze, kein neuer
unerreichbarer Stop wie der behobene Phase9-M4. Screenshot short-stop-pressure.png
zeigt diese Grenze ehrlich, short-stop-control.png die gesunde Gegenkontrolle.

## Weitere Tastatur- und Themabelege

Workdetails per Enter geöffnet, nächste Aktion per Tab erreichbar, sichtbarer
Fokusring. Approval per Tastatur genau einmal gesendet; gesunde Wiederholung nach
300ms Scrollruhe164×44/Centerhit, genau eine zusätzliche Fakeantwort.
Modellwechsel per Tab/Enter setzt tatsächlich fast:fast-model. Picker bleibt
danach offen, zeigt neue Auswahl und lässt sich mit Escape schließen.
Secretkarte: maskiertes Eingabefeld16px/44px und Tab zum Senden; synthetischen
Wert anschließend durch Requestcancel entfernt, keine Secretantwort gesendet.

Ressourcentabs Chat→Cron→Skills→Memory→Diagnose mit Pfeilen/Enter und Fokus geprüft.
Cron-Create-Dialog hält16 Tabs im Dialog und kehrt nach Escape zum Trigger zurück.
Textfelder16px,44px, Textarea114px. Checkbox selbst13px, nicht als Textinput oder
eigener Vergleich mit einem44px-Button umgedeutet. Null Ressourcenwrites.

Dark in fünf Größen selbst visuell angesehen. Vollständige22 Light-Farbrollen
über das vorhandene applyAppearanceTheme mit einem temporären customLighttheme,
keine unvollständige Drei-Tokens-Probe und keine CSSkorrektur. Light1440/390 und
Modell-Bottomsheet selbst angesehen. Kein eingebautes Lightpreset behauptet.
Shared Glasdarstellung bleibt bestehen. Reduced Motion tatsächlich emuliert:
matchMedia=true, null laufende Animationen, Streamingcursor animationName=none.

## Memoisierung und A4

Eigene positive Warmcounter: Sidebarrow6→16 nach echtem Titel-/Attentionupdate,
Cronregion8→14 nach echter Ressourceninvalidierung und sichtbarem neuen Jobnamen.
Nach weiteren30 Chattokens Croncounter22→22. Fehlender Counter zählt nie als0.
Memo verhindert damit nicht die geprüften echten Sidebar-/Ressourcenupdates.

Original12.3/A4 unabhängig an vollständiger19470-App bestätigt: echte geparkte
Route3s ohne Ereignisse null V2-Reads/Frames. Gezielte Invalidierung aktiv und
geparkt jeweils4 Reads, keine zusätzlichen Clientframes oder Stopaktion.
Echter Easter-Egg-Flagoff danach3s trotz neuer Invalidierung null Reads/Frames,
Viewer0; Hintergrundfake weiterhin running. Keine Periodik belegt.
Bewertung: erfüllt das Originalziel reduziertes UIpolling/Flagoffnull im geprüften
Fenster. Strengeres Rootziel null Invalidierungsreads beim Parking bleibt bewusst
unerfüllt; daraus entsteht kein Original-DOD-Blocker oder Runtimefixauftrag.

## Belege, Prüfgrenzen und Cleanup

generated/browser-results.json enthält Messwerte und die ursprünglichen sechs
benannten Tastaturblöcke:5 grün,1 früher Approvalhit-Sample rot. Gesunde konkrete
Wiederholung separat als approvalKeyboard erhalten, keine alte Assertion ersetzt.
Weitere Harnesskorrekturen:120ms-Toolscrollsample früh unklar, direkte/250ms-
Kontrollen gesund; falscher ungesendeter Workreason vor Parse verworfen und nur
eigener ungesendeter Cursor korrigiert; fehlenden Surfaceklassenselektor berichtigt;
falsche Erwartung automatisches Modellpickerschließen durch tatsächliches Escape
ersetzt. Kein solcher Tool-/Harnessfehler als Produktfinding gezählt. Null Pageerrors.
MCPblöcke haben keinen OS-Exitcode. Alte Originalharnesses/Rotartefakte unverändert.

pnpm typecheck Exit0; pnpm architecture:file-lines Exit0. Handdateien höchstens44
Zeilen. Keine Produkt-, Versions-, Commit-, Push- oder Neustartaktion.
Vor/nach528/528 Sourcehashes identisch, einschließlich ModalDialog/useModalFocus;
RootmanifestSHA6a785985d37598c6a940a82410d0cf93ba4cf5ae64691c2d865569499a68354c
bytegleich. Einzelbelege generated/freeze-before.json und freeze-after.json.

generated/cleanup.json:0 Viewer/Timer/Requests/Claims/Workreads/-actions/
Resourcereads/-actions/Uploads. Maps geleert, HTTPmuster und Pagelistener entfernt.
Storage exakt gegen die zu Beginn erfasste Baseline hergestellt, Sessionstorage
beider Origins leer;19471 Localstorage leer. Baseline erst nach initialem Flag-off-
Shellaufruf erfasst, kein perfekter ursprünglicher Restore behauptet. Keine SW-/
Cachebaseline vor erstem Aufruf; bestehende Registrierungen unberührt. Kein
unrouteWebSocket verfügbar, verbleibende Handler inert ohne Inhalte/Verbindung/Timer.

Tab0 wieder about:blank, keine Extratabs. Eigener VitePID3588409 gezielt beendet,
19471 frei; Root19470 unverändert PID3561491. Browser an Root zurückgegeben;
danach keine weitere MCPinteraktion. C3 bleibt Low für gezielte Korrektur und
frisches unabhängiges Visualreview. Phase11 und realer Hauptturn bleiben getrennt.

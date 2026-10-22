# Phase 9: kurzer Chatkörper, M4-Korrektur

17.10.2026. Enger CSS-Fix nach dem terminalen unabhängigen R3-Bericht
`plans/hermes-v2-phase9-context-gate-r3.md` und ausdrücklicher Rootfreigabe.
Keine eigene UX- oder Phase 9-Gesamtfreigabe. Der tatsächliche Browsernachweis
und das frische unabhängige Gate bleiben bei Root.

## Ausgangspunkt und Änderung

Der Reviewer maß bei 390×500 mit offener Freigabe, geöffneter Aufgabenansicht,
einer Unteraufgabe und zehn fertigen Anhängen einen 423 px hohen Chatinhalt.
Dem standen 285 px in Route und 318 px in Standalone gegenüber. Stop war dabei
0 beziehungsweise 18 px sichtbar. Der gesamte Chatkörper hatte overflow:hidden;
echtes Wheel über dem Composer konnte die verdeckten Aktionen nicht erreichen.

Die vorhandene Hermesfläche ist jetzt ein Größencontainer für beide Achsen.
Sie behält width/height 100% und min-height 0. Die kurzen Höhenregeln richten sich
nach der tatsächlichen Fläche, auch bei einem 500 px hohen Panel in einem hohen
Browserfenster. Es gibt keine neue Größenabfrage in JavaScript.

Bei schmaler Fläche bleibt der Kopf mit Titel und bisherigen 44 px-Aktionen in
einer Zeile. Nur dekoratives Logo und Experimentell-Hinweis weichen reversibel.
Die vertikalen Kopfabstände nutzen den vorhandenen space-1-Token. Klassisch,
Fenster und Sitzungsöffner bleiben erhalten; Standalone behält seine Safe Area.

Bei tatsächlicher Containerhöhe bis 640 px reserviert das Verlaufspadding keine
32 px Mindesthöhe mehr. Die native Textarea und die vorhandene scrollbare
Anhangliste bleiben 44 px hoch. Lange Entwürfe und sämtliche Anhänge bleiben
vollständig erhalten und nativ scrollbar. Die spezifischere Textarearegel
gewinnt unabhängig von der Importfolge gegenüber dem bisherigen 220 px-Maximum.
Die bestehende kurze Workregel nutzt dieselbe tatsächliche Containerhöhe;
die geöffnete Region behält ihre 98 px Mindesthöhe und eigene Scrollfläche.

Der gesamte Chatkörper erlaubt jetzt echten vertikalen Scroll statt verstecktem
Überlauf. Dadurch bleiben nachfolgende Work-Sendeaktionen, ihre Sperrgründe
und Hinweise über Wheel, Touch und Fokus erreichbar. Keine neuen Overlays,
Stickybuttons, Portale oder programmgesteuerten Scrollbewegungen. Das bestehende
Requestdeck und die Workregion behalten ihre eigenen Scrollwege.

Die drei Kontextfelder bleiben mit ihren Rohwerten und 44 px-Feldern unverändert.
Keine Request-, Composer-, Runtime-, Lease-, Auswahl-, Unknown- oder APIlogik
wurde verändert. Keine Metadaten, Sperrgründe oder sekundären Aktionen entfernt.
Design-system-guide und mobile-design angewandt, nur bestehende Wrapt-Tokens.

## Scope und Kontrollen

Genau vier bestehende CSS-Dateien unter `apps/web/src/components/hermes/v2/`:

- hermes-v2.css: Größencontainer, kompakter Kopf und vertikaler Chatkörperscroll,
  316 Zeilen.
- hermes-v2-messages.css: vertikales Verlaufspadding bei kurzer eigener Fläche,
  364 Zeilen.
- hermes-v2-composer.css: begrenzte native Eingabe-/Anhanghöhe bei kurzer Fläche,
  385 Zeilen.
- hermes-v2-work.css: vorhandene kurze Workregel auf echte Containerhöhe bezogen,
  262 Zeilen.

Die beiden Dateien oberhalb 350 Zeilen bleiben ihren bisherigen fachlichen
Styles zugeordnet. Keine neue Verantwortung, breite Formatierung oder Aufteilung
nach Zeilenzahl. Keine TSX-, Runtime-, Contract- oder Serverquelle geändert.

Alle eigenen Prüfungen Exit 0:

- 71/71 unveränderte Fälle in sieben Dateien: ChatSurface, SessionContext,
  ReadObserver, ComposerArea, WorkPanel, SelectionTiming und V2Shell.
- 25/25 weitere unveränderte Fälle: useComposerAttachments, WorkSendActions und
  ModelPicker. Zusammen 96 gesunde Kontrollen in zehn Dateien.
- Vollständiges `pnpm typecheck`: Extension-Contracts, Contracts, Server, Web
  und E2E-Typen grün.
- `pnpm exec eslint apps/web/src/components/hermes/v2 --max-warnings=0` grün.
- Alle vier CSS-Dateien mit bestehendem PostCSS erfolgreich geparst.
- `pnpm architecture:file-lines` grün, keine Baseline geändert.

Keine CSS-Mirror-UnitTests angelegt. jsdom belegt keine visuellen Bounds.
Roots zwei additive gesunde Initialhit-E2Es waren auf dem unveränderten alten
Bundle tatsächlich rot, vor jedem Scrollen, Stopklick oder Freigabeantwort.
Das sind fremde Vorherbelege. Der neue Build und die unveränderten Nachherfälle
bleiben bei Root, einschließlich tatsächlicher nichtnull Bounds in Route,
Standalone, Orbit und Normalpanel, vollständig getroffenem 44 px-Stop vor/nach
echtem Bodywheel sowie erreichbaren sekundären Aktionen und Sperrgründen.

## Freeze und Grenzen

Finaler Vierdateifreeze mit Einzelhashes:
`temp/hermes-v2/phase9-short-stop-fixes/short-stop-code-freeze.json`.
Manifest-SHA256:
`ce944971088f711a8364354c498a2305a5f7624e7e2ac72eae6f7919c1e009c5`.
Einzelzeilen und Vergleich stehen daneben in `freeze-integrity.json`, sämtliche
eigenen Prüfprotokolle in demselben Ordner.

Gegen den unangetasteten 516er-Rootfreeze unterscheiden sich exakt die vier oben
genannten freigegebenen CSS-Dateien; die übrigen 512 Quellen bleiben bytegleich.
Der Vierdateifreeze der M3-Kontextkorrektur bleibt 4/4 identisch. Alte Manifeste,
Tests, Fakes, Assertions und Reviewerartefakte wurden nicht geändert. M1 bleibt
in seiner bisherigen Surfaceauswahl erhalten, M2-Lesemarker und L1-Touchgrößen
bleiben innerhalb der geänderten CSS-Dateien erhalten.

Keine Agents, MCP-/Browser-, Dienst-, Preview-, Core-/CLI-, Git-, Build-,
Versions- oder Neustartaktionen. Root besitzt Browser, Build, E2Es und Version.
Nach finalem Freeze Quellen-/Teststopp bis zum frischen unabhängigen Gegencheck.
Phase 10 bleibt gesperrt.

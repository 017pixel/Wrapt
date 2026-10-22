# Phase9: unmittelbare Sitzungswahl, M1-Korrektur

17.10.2026. Enger Autorenfix für M1 aus
`plans/hermes-v2-phase9-codex-ux-fallback-gate.md`, ausdrücklich von Root
freigegeben. Quellenstopp und neuer Freeze; unabhängiger Gegencheck steht aus.
Keine eigene UX-, Browser- oder Phase9-Gesamtfreigabe.

## Vorher und nachher

Der unabhängige Browserreview belegte zweimal in acht unmittelbaren Versuchen:
Eine echte andere Sidebarzeile änderte bereits die URL; eine direkt danach
gelieferte gehaltene Createantwort verdrängte diese bewusste Auswahl wieder.
Nach vollständigen Effects und zusätzlichem Wartefenster blieb die Auswahl gesund.
Das echte native Createergebnis war gültig; betroffen war dessen Auswahlwirkung.

Die Surface meldete den Zeilenklick unmittelbar nur an useHermesV2Selection.
Der Runtimeowner erhielt die neue Auswahl erst über den nachfolgenden Hookeffect.
In diesem Fenster konnte ein alter Createcapture noch als gültig erscheinen.
Die frühere Host-R2-Korrektur bleibt bestehen und wird nicht zurückgenommen.

Jetzt nutzt ausschließlich die bewusste Sidebarauswahl den bereits vorhandenen
synchronen `chat.selectSession`-Aktionsweg. Der bestehende ChatOwners.select
aktualisiert dabei sofort Ownerauswahl und bestehende Generation; sein vorhandener
Rückmeldecallback schreibt weiterhin die zugehörige URL beziehungsweise den Host.
Die neue bewusste Auswahl entwertet deshalb das alte Create bereits im Klickhandler.
Eine gültige späte native Antwort liefert weiter ihre echte ID zurück, darf aber
über die bestehenden Captureregeln weder Seed noch Owner-/Hostauswahl übernehmen.
Die vorhandene Bereinigung des nicht geleasten nativen Attachs bleibt erhalten.

## Exakte Quellen

- `apps/web/src/components/hermes/v2/HermesV2Surface.tsx`: nur selectFromPanel.
  Ein stabiler Alias für chat.selectSession und die passende useCallbackdependency
  ersetzen die bisherige reine URL-/Hostrückmeldung. Keine Layoutänderung.
- Neue eigenständige Regression:
  `apps/web/src/components/hermes/v2/HermesV2SelectionTiming.test.tsx`.

Keine Änderungen an ChatActions, ChatOwners, Hookeffects, Kontext-/Lease-/Request-
oder Sendguards. Keine neue API, Abstraktion, Renderseitenwirkung oder Verbindung.
Keine CSS-, Server-, Vertrags-, globalen oder bestehenden Testdateien geändert.
Root besitzt die beiden separaten CSSkorrekturen für M2/L1 und den frischen Build.

## Gesunde unmittelbare Regression

Die neue Suite benutzt echte Surface, Sidebarzeile, Erstelldialog, Chathook,
Runtime und Fake-Gateway. Nur Chatdarstellung und Sidebar-Viewmodelquelle sind
reduziert; Auswahlhandler und Dialog bleiben echt. Ein transparenter Actionswrapper
zeichnet die unveränderte tatsächliche Createpromise auf.

Route, Standalone, Orbit und Normalpanel werden jeweils geprüft. Nach echtem
Createklick und Escape wird die echte andere Zeile geklickt. Ein document-
Clicklistener liefert das gehaltene ACK direkt nach Reacts Zeilenhandler, vor
anschließenden passiven Effects. Dort wird die tatsächliche Runtimeauswahl erfasst.

Vorher: vier gesunde Wechselvarianten rot, weil der Runtimeowner an dieser
unmittelbaren Grenze noch `saved` statt `other` meldete; vier unveränderte
aktuelle Createkontrollen grün. Dies ist ein eigener Komponentenbeleg für das
fehlende synchrone Entwerten, kein behaupteter viermaliger Browser-URLfehler.
Der rohe Vorherlauf bleibt in `before.log` erhalten.

Nachher: dieselben acht Fälle grün. Die vier Wechselvarianten prüfen zusätzlich:
gültige native ID als Promiseergebnis, kein Seed, keine Lease der späten ID,
genau eine Abbestellung, richtige aktuelle Owner-/Hostauswahl, fremden Owner,
vorherigen und aktuellen Draft sowie anschließend eine erfolgreiche neue
bewusste Erstellung. Genau zwei bewusste Createwrites und null Nachrichtenwrites.
Weitere Queryparameter bleiben erhalten. Die vier Kontrollen erstellen ohne
Zeilenwechsel weiterhin normal und senden jeweils genau einen Createwrite.

## Prüfungen

Alle folgenden Abschlussläufe Exit 0; Gruppen überschneiden sich, keine Addition:

- Neue Timingdatei: 8/8 grün, auch abschließend nach der lokalen Testtypkorrektur.
- Host-/Umfeldgruppe plus Timing: 172/172 in 21 Dateien, darin 164 unveränderte
  bestehende Fälle. Exakter argv/Exit und Log: `host-timing-exit.json` und
  `host-timing.log`.
- Frühere R1-Reviewerdateien unverändert: 18/18 grün, `reviewer-r1.log`.
- Frühere R2-Reviewerdateien unverändert: 18/18 grün, `reviewer-r2.log`.
  Host-A-B-A, Parking, Unknown/NoRetry und aktuelle Handlungen bleiben erhalten.
- Laufzeitgruppe: 728/728 in 55 Dateien, einschließlich der bisherigen zwölf
  Autoren-Createfälle. Owner, Transport, Request, Composer, Work, Resource und
  Organisation. Exakter argv/Exit und Ausgabe: `runtime-exit.json`/`runtime.log`.
- Volles `pnpm typecheck` grün, einschließlich Extension-Contracts, Contracts,
  Server, Web und E2E-Typen. Der erste Lauf meldete nur die irrtümlich verwendete
  Playwrightoption exact:true im neuen RTLtest. Die Option wurde in dieser neuen
  Datei entfernt; keine alte Assertion oder Fixture verändert.
- ESLint beider eigenen Dateien mit `--max-warnings=0` grün. Der stabile Alias
  vermeidet eine Abhängigkeit vom bei jedem Render neuen gesamten Chatobjekt.
- `pnpm architecture:file-lines` grün. Der erste Lauf meldete ausschließlich
  Roots generiertes 402-Zeilen-Browserartefakt; Root verschob es byteerhaltend in
  generated. Surface 344 Zeilen, neue Testdatei 172 Zeilen, keine Baseline geändert.

Alle genannten eigenen Logs liegen in `temp/hermes-v2/phase9-selection-fixes/`.
Browser und tatsächliches Bundle/URL-Rechecking bleiben bei Root und dem neuen
unabhängigen Gegencheck. Keine eigene Browserwiederholung wird behauptet.

## Freeze

Enger neuer Zweidateifreeze:
`temp/hermes-v2/phase9-selection-fixes/selection-code-freeze.json`.
SHA256: `b5d90bd1ec8b91a175b46278406f6009308e2c092c3bc4f156fee157dc1f1316`.
Finaler Surface-SHA:
`df451c6f5ceb1a0c70b0a0d025979348f650e0e25e392037b39ec859cb4ce100`.

Alte Manifeste und Reviewartefakte bleiben unangetastet. Alter Hoststand 13/13
und Hostfixstand 16/16 weiterhin identisch. Beim Phase8-Manifest bleibt die bereits
freigegebene Abweichung genau chat-actions.ts und useHermesV2Chat.ts, also 119/121
identisch. Dieser Auswahlfix fügt dort keine weitere Abweichung hinzu. Vollständige
Hashprüfung: `freeze-integrity.json`. Root erstellt den integrierten Freeze neu.

Reactflächen unmounted, Queryclient geleert, Runtime/Fakesockets geschlossen,
Stores zurückgesetzt und eigene Timer/Spies bereinigt. Keine weiteren Agents,
Browser-MCP-, Dienste-, Preview-, Core-/CLI-/Gitaktionen oder Produktionsbuilds.
Nach Abgabe Quellenstopp bis zum frischen unabhängigen Gegencheck.

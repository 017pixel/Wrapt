# Hermes V2 Phase 7: unabhängiges Backend-/Contracts-Gate

Stand: 17.10.2026. **Verdikt: needs fixes. Ein High, zwei Medium und ein Low offen.**
Ausschließlich Phase-7-Backend und Contracts. Keine Phase 8, UI-, Browser-,
Realruntime- oder Gesamtfreigabe. Keine Produktkorrekturen vorgenommen.

## Grundlage und Verfahren

Originalauftrag, Interface, Workhandoff, Backendauftrag und Autorenbericht gelesen.
Frühere Phase-2-Security-/Protokollgates samt Antworten R1 bis R5, Phase-4-
Backendgates samt Antworten R1 bis R4 und sämtliche übergebenen Phase-6-Gates/
Fixantworten vollständig abgeglichen. Autoren-PASS oder grüne Bestandstests ersetzen
keine eigenen Gegenprüfungen. Persönlichen sprachstil und Projekt-AGENTS angewandt.

Selbst geprüft: native Workquellen, Normalisierung/Patches, Zustandsgrenzen,
Targetautorisierung, Capture/Send/Nachcheck, MutationOutcome, Manager/Pool,
Lifecycle, tatsächliche Browserprojektion, Queryoptin und öffentliche Contracts.
Installierte Corequellen nur statisch gelesen, insbesondere methods_subagents.py,
methods_tools.py, methods_prompt.py, server.py, session_lifecycle.py und deren Verträge.
Native dauerhafte Lineage ist sichtbar, garantiert aber keine exakte Steuerbarkeit.

Eigene Skripte, Fakes, SQLite, Logs und Ergebnisse ausschließlich unter
`temp/hermes-v2/phase7-backend-gate/`. Eigene Fixture neu geschrieben; vorhandene
FakeGateway-Klasse als isolierte Loopbackgegenstelle wiederverwendet. Keine
Produktfunktionen ersetzt. FS-Kontrollen halten ausschließlich echte lstat-Ergebnisse.

## H1, High: Begrenzung vor dynamischer Redaction verrät bekannte Secretpräfixe

Fundstellen relativ zu `apps/server/src/hermes/v2/`:
`work/normalize.ts:32`, `:41`, `:48`, `:19`; `work/redact.ts:11`;
Ausgabepfade `work/operations.ts:39`, `:56`, `redact-browser.ts:73`, `:75`, `:78`.

`nullableText`/`boundedOutput` schneiden zuerst. Der finale dynamische Redactor
bekommt danach nur ein Fragment und findet seinen vollständigen registrierten Wert nicht.
Das ist eine neue belegte Lücke in Workanzeigefeldern, keine Routing-ID-Maskierung.

Repro `findings.mts`, Gruppen secret-read-goal/model/error/command und secret-event-goal:
21 Zeichen langes Dummy-Secret registrieren. Vor den vollständigen Wert so viel
neutralen Text setzen, dass die Feldgrenze genau dessen letztes Zeichen abschneidet.
Echter Fake-Roster beziehungsweise subagent.start läuft durch den Manager und den
normalen finalen Sendepfad. **Ist: 20 von 21 Secretzeichen im gültigen Browserframe.**
Goal, Modell, Delegationsfehler und Prozesscommand bestätigen dieselbe Kette.
Dies benötigt keine übergroße Native-Tailantwort; native Goals/Commands sind frei längig.

Weitere defensive Gegenfälle bestätigen es für übergroße Tail-/Kill-/Prozessoutputs
sowie eine UTF-8-Bytegrenze. Diese zusätzlichen Größenfälle überschreiten teilweise
die normale Ausgabe des installierten Core und werden nicht als reale Normalgröße behauptet.

Gesunde Kontrollen: vollständiger Wert innerhalb der Grenze wird bei denselben neun
Feld-/Ausgabevarianten maskiert. behavior-controls.mts registriert ein Secret außerdem
über einen echten Fake-Serverrequest/Response und prüft verschachtelte JSON-Echos;
Routing-ID bleibt exakt. Nur eigene synthetische Werte verwendet.

Auswirkung: fast vollständige bekannte Zugangswerte werden erneut an Browser ausgegeben.
Fix: bekannte Inhalte vor jeder Zeichen-/Bytekürzung redigieren. Bereits begrenzte oder
später bekannt gewordene Werte benötigen zusätzlich konservativen Präfixschutz.
Finale dynamische Redaction und unveränderte Routing-IDs beibehalten.

## M1, Medium: begrenzter Roster lässt erledigte Background/Btw-Aufgabe wieder laufen

Fundstellen: `work/state.ts:29`, `:33`, `:54`, `:56`;
`work/operations.ts:24`, jeweils unter demselben V2-Verzeichnis.

Repro `findings.mts`, background/btw-receipt-after-100/130-other-completions:
Beim echten prompt.background beziehungsweise prompt.btw sendet der Fake zuerst
complete für dessen konkrete task_id, danach 100 andere konkrete Completions,
erst danach die eigene RPC-Quittung. Alle Ereignisse passieren den echten WebSocket.
Keine direkte State-/SQL-Manipulation, exakt ein nativer Startaufruf, kein Retry.

Die erste abgeschlossene Zeile wird an der 100er-Grenze gelöscht. Es bleibt kein
Settlementbeleg für diese laufende Startoperation. Das spätere Receipt setzt genau
jene ID wieder auf running/text=null. **Ist: work.read meldet running und active=true,
obwohl der konkrete Abschluss bereits empfangen wurde.** coverage.truncated=true
macht die gegenteilige positive Statusbehauptung nicht korrekt.

Gesunde Kontrollen je kind: null beziehungsweise 99 andere Completions vor Receipt
lassen dieselbe Zeile completed und active=false. 130 weitere reproduzieren den Fehler.
Fix: Settlement für noch offene Receipts unabhängig vom sichtbaren 100er-Roster sichern;
bei verlorener Evidenz unbekannt/teilweise bleiben, niemals einen belegten Abschluss
allein aus späterem Receipt wieder zu running machen. Keine unbegrenzte Historie nötig.

## M2, Medium: belegter eigener Prozess hält nur nach work.read den Schutztransport

Fundstellen: `manager.ts:93`, `:94`; `work/service.ts:62`;
`background-state.ts:30`; `pool.ts:80`, `:91`.

Repro `lifecycle-controls.mts`, hydrateWork=false: regulär eine eigene Session über
session.create erzeugen. Danach session.subscribe/Snapshot mit nativem eigenen
running-Prozess laden. backgroundActive=true ist tatsächlich frisch belegt;
ownedBinding ist exakt, Workoptin aktiv, Hauptturn idle. Es gab noch kein work.read.
Die letzte Browserconnection mit v2-disabled freigeben.

**Ist: retainRuntime=false, Managerrecords sofort leer und echter Fake-Upstreamsocket
schließt vor Prozesssettlement.** Der neue Schutz hängt am UI-Readmarker observed,
obwohl der normale Snapshot bereits denselben nativen Prozess nachgewiesen hat.

Gesunde Kontrolle: gleiche Folge mit work.read hält Manager und Socket bis frischem
Settlement. Eigene Background- und Btw-Starts halten jeweils auch ohne Rosterread
bis zur konkreten Completion; deren korrekter Pfad ist nicht Gegenstand dieses Befunds.

Belegte Auswirkung ist der vorzeitige lokale Schutz-/Beobachtungsverlust. Ein realer
Prozesskill wurde nicht ausgeführt oder behauptet. Der installierte Core parkt einen
letzten False-Flag-Viewer nach Disconnect und aktiviert seinen Orphan-Reaper
(session_lifecycle.py:1001, :1035). Dessen allgemeine Grenze bleibt akzeptiert;
der hier vermeidbare Disconnect trotz frisch belegter Arbeit verletzt die Phase-7-Haltung.
Fix: native Prozessbeobachtung aus Snapshot/Lifecycle ebenfalls bis bestätigtem
Settlement berücksichtigen, unabhängig davon, ob das Panel schon work.read aufgerufen hat.

## L1, Low: abgeschnittener Queuekopf behauptet ungekürzte Abdeckung

Fundstellen: `work/service.ts:78`, `:80`; `normalize-values.ts:8`.
Repro `findings.mts`, queue-cut-200001: natives Activatequeued.user mit 200001
ASCII-Zeichen. work.read liefert 200000 Zeichen und coverage.truncated=false.
Gesunde Kontrolle mit genau 200000 Zeichen bleibt korrekt ungekürzt.
Fix: Kürzung des tatsächlichen Queuekopfs in dasselbe Abdeckungsmerkmal aufnehmen.
Keine zusätzliche Queue, Anzahl oder Übernahme einer Submitquittung erforderlich.

## Unabhängige Kontrollen und erhaltene Altgrenzen

- Eigene **80/80** Awaitgruppen grün: Interrupt, Kill, Background und Btw jeweils
  vor Send und nach echter Nativeantwort. Gleiche Scopebestätigung bleibt gültig;
  beobachtetes Profil-/Scope-/CWD-A-B-A, neue Abogeneration, ersetzte Connection,
  Workoptout, readonly, HOME-Umbindung und Transportverlust ergeben vor Send
  not_sent/null Sends, danach unknown/genau einen Send und Runtimehaltung.
- Eigene **10/10** Verhaltensgruppen grün: frischer eigener Roster und exakte IDs,
  keine historischen/unlisted/globalen Ziele; found=false/available=false und alle
  vier Killstatus; zwei Queue-ACKs behalten ersten nativen Kopf, Steer bleibt rejected.
  Reads tatsächlich am RPC-Await coalesced, Stop während Read und Tail erreichbar,
  alte Rosterantwort nach neuerem Patch verworfen. Tokens erzeugen keine neuen Reads/
  Invalidierungen. Domänen, Delegationsindex, Zyklen/Orphans, explizites null erhalten.
  Echtes work=1-WebSocketquery und tatsächliche Legacyframeprojektion geprüft.
- **248/248** unveränderte externe positive Altgruppen erneut grün: R1/R2/R3 138,
  vier frische Skripte 56 und jüngstes unabhängiges Phase-6-Gate 54. Darin bleiben
  nachsend Attachment-/SQL-, ursprüngliche Profil/HOME-, Status-FS- und History-
  Kontextbindungen samt UID-/Organisationsschutz erhalten.
- Zusätzlich acht unveränderte Phase-4-Kontrollskripte, **28/28** Gruppen grün:
  Rowkonflikt/UID-Verlust, EQUAL/COVERS, private ACKs, Coverage/Wake und Kataloggrenze.
- Sechs Originalbugrepros unverändert ausgeführt. Beide R2-Historyrepros Exit0.
  Drei R1-Repros Exit1, weil die inzwischen verhinderten Bugs weiter erwartet werden;
  ihre gesunden Vergleichsfälle bestehen. home-fs-boundary: null Stage/null Dateien/
  not_sent; Exit1 ausschließlich wegen seiner unbedingten Datei-Vorassertion Zeile41.
  Keiner dieser Exit1-Läufe zählt als gesunder Check oder als neues Finding.
- Eigene Findingsprüfungen enthalten gesunde Vergleichsfälle und scheiternde gesunde
  Sollassertionen. findings.mts und lifecycle-controls.mts enden daher ausdrücklich
  mit Exit1. run-own.py bewahrt diesen Fehlerstatus; keine Bugassertion als PASS gezählt.

## Pflichtchecks, Freeze und Übergabe

Hermes-Suite mit --cache=false: **496/496**, 52 Dateien grün. Composer-/Organization-/
Work-Contracts: **9/9**, drei Dateien grün. Isolierter Contractsbuild, explizite
Servertypen und fachlich begrenztes ESLint mit max-warnings=0 grün.
pnpm typecheck zweimal ausgeführt: Contracts/Server grün, jeweils Exit2 wegen paralleler
Webdatei work-panel-fixtures.tsx:64, readonly requestStates gegen mutable Typ.
E2E-Typcheck dadurch nicht erreicht. Kein vollständiges Typecheckgrün behauptet.
pnpm architecture:file-lines abschließend grün. Ein eigener zuerst zu lang formatierter
Hash-JSON wurde kompakt serialisiert; keine Baseline erhöht. Alle Handdateien unter400,
dieser Bericht unter200 Zeilen. Befehle/Einzelergebnisse: verify.py, run-own.py und Logs.

SHA-256 vor/nach: **159/159** Backendfreezequellen identisch, keine neue Backend-/
Contractquelle. Alle **46 alten Hermes-Testdateien** gegenüber dem jüngsten Phase-6-
Gate identisch. Breiter Zusatzvergleich weist ausschließlich parallele Arbeitsartefakte
außerhalb dieses Freezes aus; Einzelheiten in freeze-final.json. Altberichte und
unveränderte externe Altregressionen erhalten. Backendfreeze ist nicht verletzt.

Akzeptiert bleiben fehlender atomarer externer Core-CAS, Dateisnapshot-/Vision-/PDF-
Garantie und zusätzliche native HOME-Attestation; Metadaten-TTL löscht keine Coredateien.
Fehlerdelegationen und Nebenaufgaben haben weiterhin ausdrücklich Teilabdeckung.
Unbekannte Mutation/Identität darf konservativ gehalten bleiben. Das rechtfertigt
keine neuen positiven Statusbehauptungen entgegen bereits empfangenen Abschlüssen.

Nur diesen neuen Bericht und eigene temporäre Artefakte geschrieben. Alle eigenen
Fakes, SQLite, FS-Hooks, Dateihandles und Loopbacks geschlossen beziehungsweise
zurückgesetzt; keine eigenen Fallverzeichnisse zurückgelassen. Keine echten Core-/
CLI-/Dienst-/Browser-/Preview-/Account-/Nutzerdatenaktionen, kein Git, keine weiteren
Agents, kein produktiver Webbuild und kein Restart. Versionspflege verbleibt bei Root.
**Vor Backend-/Contracts-PASS H1, M1 und M2 beheben und unabhängig nachprüfen; L1 mitführen.**

# Hermes V2 Phase 8: gezielte Korrektur R2-M1

Stand 17.10.2026. Vollständigen unabhängigen R2-Bericht, gesunden ausführbaren
Mehrzyklusrepro und dessen roten Wirkungsbeleg gelesen. Root hat ausschließlich
R2-M1 zur Korrektur freigegeben. Produktcode erneut eingefroren; frisches R3 folgt.
Kein eigenes unabhängiges Gateurteil und keine Phase9-Freigabe.

## Ursache und enger Fix

Der bisherige bewusste Abgleich teilte seine Reservierung nur über den Readslot.
Ein noch laufender erneuter Abgleich von bereits reconciled A konnte deshalb
von einem später entstandenen unknown B desselben Ziels übernommen werden.
Der Read begann vor B und durfte dessen neue Wiederholungssperre nicht lösen.

Genau zwei Produktionsdateien geändert:

- `resource-reads.ts`: readFresh erhält zusätzlich den konkreten Aktionsschlüssel.
  Die fresh-Map reserviert pro Action.key und speichert weiterhin Slot und Capture.
  Nur derselbe Vorgang im gültigen Kontext teilt sein Promise. Ein anderer Vorgang
  hält die beim eigenen bewussten Aufruf offene Readkette fest, wartet diese ab,
  prüft Kontext/Scope und reserviert danach seinen eigenen neuen Read.
- `resource-mutations.ts`: reconcileAction reicht die vorhandene eindeutige key
  für Cronziel, Createkatalog und genaue Sessionpreview an readFresh weiter.
  Andere Actions, Hintergrundreads oder ein alter Abgleich setzen seine neue
  reconciled-Markierung nicht. Erfolg bleibt an geprüften neuen Read und Capture gebunden.

Die gute aktuelle Nutzerhandlung bleibt erlaubt: Nach wirklichem Abgleich von A
darf ein neuer bewusster Write B senden. Ebenso darf der Nutzer A nochmals prüfen.
B benötigt anschließend seinen eigenen Abgleich; ein dritter Write bleibt bis zu
dessen Erfolg gesperrt. Kein Noop für alte Aktionen, keine künstliche globale Writesperre.

Die Reservierungen bleiben am bestehenden32er-Aktionsbudget begrenzt, auch wenn
alte bereits abgeglichene Actions während offener Reads aus der Anzeige verdrängt
werden. Bei ausgeschöpftem Budget bleibt der Vorgang ungeklärt und CLIENT_BUSY sichtbar.
Nach Abschluss kann der Nutzer bewusst erneut lesen; keine automatische Mutation.
finally und Kontextabort räumen Reservierungen auf. Die native Inhaltsmenge wird
dadurch nicht kopiert oder dauerhaft archiviert.

Normales Readcoalescing, höchstens eine Hintergrundfolge und maximal zwei parallele
HTTPreads bleiben erhalten. R1-Frischegrenze und monotone Connection-ID-/Epochbarriere
bleiben unverändert. Keine öffentliche Hook-/UI-/Gateway-/Server-/Contractänderung.

## Additive dauerhafte Mehrzyklusregressionen

Neue `resource-reconcile-cycles.test.ts`,128 Zeilen, zehn Fälle:

- Tatsächliche zweite Fakewirkung B während altem Abgleich A; neuer B-Read liefert
  gültigen Stand, Fehler, falsches Ziel oder missing. Alter Snapshot entsperrt B nie;
  tatsächlicher dritter Resume bleibt vor neuem Beleg gesperrt. Kein optimistischer Cleanup.
- Je80 gleichzeitige Abgleichklicks teilen innerhalb eines Vorgangs, A und B erhalten
  trotzdem getrennte neue Reads. Keine zusätzlichen Writes, Maps nach Abschluss leer.
- Create und Sessiondelete erneut am tatsächlichen ready-Emit; jeder neue unknown-
  Vorgang erhält seinen eigenen bewussten Read ohne automatischen weiteren Write/Delete.
- Hidden-A-B-A während beider Zyklusreservierungen bestätigt keinen alten Vorgang.
- 130 wirkliche Unknown-/Abgleichzyklen halten Actions begrenzt und räumen Reads frei.
- 32 offene Vorgangsreservierungen bleiben auch bei Verdrängen eines alten Anzeige-
  eintrags begrenzt; nach deren Abschluss funktioniert ein neuer bewusster Abgleich.

Alle Fälle verwenden echte ResourceRuntime-/ResourceClientpfade und synthetische
HTTPantworten. Keine ersetzten Guards, keine Änderung bestehender Assertions.

## Ausgeführte Prüfungen und Grenzen

- **726/726 Featurefälle**,55 Dateien:716 bisherige unverändert plus zehn neue.
- **39/39 unveränderte unabhängige R2-Fälle**, tatsächlicher Exit0; beide zuvor
  roten gesunden Mehrzyklusfälle einschließlich realem zusätzlichem Write sind grün.
- Unverändertes R1 bleibt **86/87, Exit1** ausschließlich wegen des von Root und R2
  bestätigten ungültigen Createfixtures mit TypeError vor POST. Dieser Fall und der
  ursprüngliche Bericht bleiben unverändert; der gesunde Ersatz und R2-Createfälle sind grün.
- **702/702 unveränderte externe Kontrollen**:172+30+38+93+79+157+44+89, jeweils Exit0.
- Gezielter ScopeLint, separate E2Etypen und architecture:file-lines jeweils Exit0.
  Alle eigenen Dateien unter400 Zeilen; größtes betroffenes Modul216.
- Volles pnpm typecheck und separate Webtypen Exit2 ausschließlich im parallelen
  fremden UIteil: CronArea.test.tsx:158 unvollständiger ResourceError, CronForm.test.tsx:107
  await in nichtasync Funktion; Surface:6/26/66/171/182/187 ungenutzte Regionsumbauwerte,
  :309–326 noch alte Komponenten-/resources-Namen. Keine eigenen Typfehler oder Fremdedits.

Belege unter `temp/hermes-v2/phase8-client/fixes-r2/`: new-regressions.log,
review-r2.log, review-r1.log, features.log, phase4/5/6/7-*.log, web-types.log,
typecheck.log, e2e-types.log, architecture.log und checks.json mit tatsächlichen Exitcodes.
Keine Dienste, Browser, Previews, Gitaktionen, weiteren Agents, Hermes-CLI oder echte Corewrites.

## Eindeutiger neuer Freeze und Stopp

`temp/hermes-v2/phase8-client/fixes-r2-code-freeze.json`:121 Source-/Testdateien.
SHA256 `cd27bcf14b1a58ca1fc56a002046848e9cf23be484abb2296669763e059019a2`.
118/120 vorherige Dateien bytegleich; nur resource-reads und resource-mutations
geändert, eine additive Testdatei. Alter120er-Freeze unangetastet, dessen Manifest-
SHA256 bleibt `35e0f89497b3daefa9f327ae268d8d46563a831a4ffa07ecd6dbe5f76be73a6b`.
Fremde Repros, Berichte, Baselines und Altassertions wurden nicht verändert.
Produktcode bleibt bis ausdrücklicher Rootfreigabe für das unabhängige R3 eingefroren.

# Hermes V2: unabhängiges Phase-8-Clientgate R3

Stand: 17.10.2026. **Urteil: PASS ausschließlich im eingefrorenen nichtvisuellen
Phase-8-Client.** R2-M1 ist geschlossen. Die gesunden R1-M1-Fälle und R1-L1 bleiben
geschlossen. Keine neuen bestätigten High-/Medium-/Low-Findings in diesem Scope.
Kein Backend-, UI-, Browser-, Gesamtphasen- oder Gesamtfeature-PASS.
Keine Phase-9-Freigabe. Originalauftrag und Gesamt-DoD bleiben unverändert.

## Prüfgrenze und Integrität

Neuer unabhängiger Reviewer, kein Autor und kein Fortsetzen einer älteren Runde.
AGENTS.md, sprachstil und config-infos angewandt. Vollständigen Originalbrief,
Phase-8-Implementierungsbericht, beide festen Schnittstellen, R1/R2-Gates und beide
Fixantworten gegen tatsächliche Quellen und gebaute Contracts geprüft.
Phase-7-R1/R2/R3 samt Antworten, Phase-6-R1/R2 samt Formatwiederherstellung,
Phase-5-R1/R2 samt Antwort, Phase-4-R1 bis R8 samt Antworten und Phase-3-/Phase-2-
Security-/Protokoll-/Vorsendberichte nachgelesen. Alte Gates werden nicht erweitert.

Aktueller Freeze vor und nach Review: **121/121 SHA-256-identisch**.
Manifest: temp/hermes-v2/phase8-client/fixes-r2-code-freeze.json,
SHA256 **cd27bcf14b1a58ca1fc56a002046848e9cf23be484abb2296669763e059019a2**.
Eigener Vergleich: 118/120 vorherige Dateien bytegleich; ausschließlich resource-reads
und resource-mutations geändert, resource-reconcile-cycles.test.ts additiv.
Der alte 120er-Freeze bleibt bei SHA256
35e0f89497b3daefa9f327ae268d8d46563a831a4ffa07ecd6dbe5f76be73a6b.
Der ursprüngliche 118er-Freeze bleibt ebenfalls unangetastet, SHA256
812a9d5f98fa11cf49087d4110f88a9c4bffe3bd690196ae2fe7d4e49afc3846.

Gegen den Phase-7-97er-Freeze weiterhin 91 bytegleiche Dateien und genau die sechs
genehmigten Änderungen: gateway-client, chat-runtime, chat-store, organization-runtime,
organization-state und chat-composer-transport.test. Keine weitere Altänderung.
Zusätzlich **831 erfasste historische Berichte, Repros, Configs, Logs, Freezes und
gebaute Vertragsdateien unverändert**. Von insgesamt 832 beobachteten Dateien änderte
sich allein plans/hermes-v2-progress.md durch parallele Rootarbeit, außerhalb des Gates.
Belege: generated/integrity-before.json, phase7-change-map.json und freeze-check.json.

Neue Repros, isolierte Config und tatsächliche Logs ausschließlich unter
temp/hermes-v2/phase8-client-review-r3-20261017/. Produktpfade nachfolgend relativ zu
apps/web/src/components/hermes/v2/. Keine Produkt- oder Fremdartefaktänderung durch mich.

## R2-M1: konkreter späterer unknown-Vorgang unabhängig geschlossen

resource-reads.ts:60 erhält den Aktionsschlüssel; :62/:79 reservieren danach.
Nur derselbe konkrete Vorgang im gültigen Kontext teilt sein Promise.
:70/:75 warten die beim eigenen Intent offene Readkette ab, :76 prüft Kontext und
Scope erneut, :77 beginnt anschließend den ausreichend neuen Read.
resource-mutations.ts:183/:185/:186 reichen für genaue Sessionpreview, Createkatalog
und Cronziel jeweils die echte Action.key weiter. :188 markiert nur diesen Vorgang.
Reservation bleibt vor reentranten Emits; finally und Kontextabort räumen sie frei.

Die **unveränderte R2-Originalsuite besteht 39/39, Exit 0**, einschließlich ihrer
beiden zuvor roten gesunden Mehrzyklus-Sollfälle und aller 37 positiven Kontrollen.
Es gibt keine Änderung oder Lockerung fremder Assertions.

Eigene cycles.test.ts erzeugt konkrete Fakewirkungen über echte ResourceRuntime-,
ResourceClient- und HTTPpfade: Write A verändert den Job und verliert seine Quittung.
A wird bewusst abgeglichen. Ein erneuter A-Abgleich hält einen vor B erfassten Snapshot.
Der neue bewusste Write B bleibt zulässig, verändert denselben Job tatsächlich und
wird ein eigener unknown-Eintrag. B erhält einen eigenen bewussten Abgleichintent.
Nach Rückgabe des alten A-Snapshots bleibt B gesperrt; sein tatsächlicher neuer GET
beginnt nach diesem Intent. Ein Resume-Klick davor erzeugt weder dritten HTTPwrite
noch dritte Fakewirkung. Der ausreichend neue gültige B-Read zeigt dessen Wirkung.

Danach sendet erst ein neuer bewusster Resume den **dritten tatsächlichen POST**,
ändert paused auf false und erhält eine exakt korrelierte confirmed-Quittung.
Der Fehlerfall, falsches Ziel, ungültiges JSON und echter 25-Sekunden-Timeout halten
B gesperrt. Auch ein erfolgreicher gewöhnlicher Refresh entsperrt B nicht.
Ein weiterer bewusster gültiger Abgleich ermöglicht danach denselben echten dritten
Write. Nach 30 Sekunden jeweils kein automatischer Mutationsretry.

Missing bleibt korrekt getrennt: Im eigenen Fake verschwindet das Ziel tatsächlich.
Ein neuer genauer 404/TARGET_UNAVAILABLE-Read zählt als bewusster Abgleich, der alte
Vorgang bleibt unknown/result=null. Ein neuer bewusster HTTPversuch darf senden,
bekommt beim weiterhin fehlenden Ziel not_sent und erzeugt keine dritte Fakewirkung.
Kein bestätigter Delete, kein optimistischer Cleanup und keine geratene Wiederherstellung.

Je 80 gleiche Abgleichklicks für A und B sowie 80 reentrante B-Klicks teilen innerhalb
des Vorgangs. A und das später entstandene B erhalten getrennte ausreichend neue
HTTPreads. Ein offener erneuter A-Abgleich sperrt weder einen guten neuen Zielwrite
noch eine bewusste Änderung eines anderen Ziels. Keine künstliche globale Writesperre.

## R1-Frische, Create, Kontext, Budget und Sessiongrenzen

Eigene gesunde Createfälle starten vor der Hintergrundkette beziehungsweise synchron
am tatsächlichen ready-Emit. Beim echten POST gilt ready/stale=false; der Fake erzeugt
wirklich einen Job und verliert erst die Quittung. Der alte Folgeread enthält ihn
noch nicht. Erst der nach dem Intent gestartete neue GET zeigt ihn und gleicht ab.
Ein weiterer bewusster Create erzeugt den zweiten Job, ohne automatische Wiederholung.
Ein eigener Mehrzyklusfall bestätigt zusätzlich **drei bewusste POSTs mit drei
tatsächlich verschiedenen erzeugten Jobs**; B braucht seinen eigenen neuen Katalogread.

Der einzige rote R1-Originalfall bleibt transparent ungültig: Original-own.log und
mein unveränderter neuer Lauf zeigen denselben TypeError an
reconcile-freshness.test.ts:127 beim Zugriff auf eine nicht existente Action.key.
Eigene unveränderte Ablaufnachbildung belegt list.status=loading/stale=true,
null POSTs, null Fakewirkungen und eine leere Actionliste. Dieser Fall beweist keinen
Createfehler. R1 unverändert **86/87, Exit 1**, ausschließlich dieser TypeError;
sämtliche anderen 86 verbindlichen gesunden Fälle bestehen. Kein roter Lauf als PASS.
Originaltest, Originalbericht, Originaldaten und Createguard bleiben unangetastet.

Eigene Doppelzyklusfälle prüfen Hidden-/Active-/Enabled-/Area-/Owner-/Ziel-/Signal-/
Dokument-/Connection-ID-/Epoch-/Scope-A-B-A. Beide alten Fortsetzungen verlieren ihre
Bindung, alte Reads werden abgebrochen, B wird nicht reconciled und nichts wiederholt.
Identische ID-/Epochframes erhalten hingegen Generation und Read ohne Zusatzsocket
oder Lease. R1-L1 und seine unveränderten Originalkontrollen bleiben grün.

135 echte Unknown-/Abgleichzyklen halten Actions/Scopes höchstens 32 und Readversions
höchstens neun; offene Maps sind danach leer. 32 gleichzeitig reservierte alte Vorgänge
bleiben auch beim Verdrängen eines Anzeigeeintrags begrenzt. Ein guter neuer Write
bleibt möglich; sein Abgleich meldet bei vollem Budget CLIENT_BUSY und entsperrt nichts.
Nach Freigabe funktioniert ein neuer bewusster Abgleich samt anschließendem Write.
Die unveränderten R2-Queuefälle bestätigen maximal zwei parallele HTTPreads und
Kontextprüfung vor queued Freshstart. Normales begrenztes Coalescing bleibt erhalten.

Sessionunknown verlangt weiterhin einen neuen GET der genauen vollen Preview-ID.
Valid/missing/falsches Ziel bleiben getrennt; Reconcile entfernt keinen Bestand.
Alte Tokens bleiben ungültig. Erst ein neuer originaler Token und exakt korreliertes
ACK bereinigen bestätigte IDs, requested muss enthalten sein, affectedIdsComplete=false.
Unveränderte R1-Fälle prüfen die tatsächlichen Chat-/Organisationscleanuppfade samt
neuer Arbeit/Requests/Queue, unknown Sends, fremden Owner-A-B-A und fremden Drafts/Dateien.
Sessioninvalidierung ist keine Deletequittung. Native Kompressionskette und rekursive
Delegates, eigenständige Branch/Reset sowie Wrapts Owner/fullID-Preview und frischer
Abwesenheitsnachweis nach nativem ok nur lesend geprüft. Dies ist kein Backendgate.

HTTPpfade/Methoden, Same-Origincredentials, no-store, Sync-Version und strikte gebaute
Schemas mit den Routen abgeglichen. Unveränderte R1-Kontrollen erhalten sichere
Teilupdates/Slugprojekt-IDs, script/additional/workdir, Token-/ACK-Korrelation,
4-MiB-/UTF8-/Timeout-/Fetch-/Readergrenzen, Unknown ohne Replay, readonly Knowledge,
exakte Skillnamen, ehrliche null/partial/truncated und sichere Copyprojektion nur onclick.
Der globale Ressourcenbeobachter liegt vor dem Leasefilter am vorhandenen resources=1-
Socket. StrictMode-/Unmount-/Ownerhookkontrollen bleiben unverändert grün.

## Tatsächliche Checks, Cleanup und Grenze

- Features aus dem aktuellen Freeze: **726/726**, 55 Dateien, Exit 0.
- Historische Originalconfigs unverändert: **702/702**, sämtliche Läufe Exit 0;
  Phase4 172, Phase5 30+38, Phase6 93+79, Phase7 157+44+89.
- Phase8-R2 unverändert **39/39, Exit 0**; Phase8-R1 **86/87, Exit 1**, Ursache oben.
- Eigene neue Suite: **29/29**, drei Dateien, tatsächlicher Exit 0.
- Scoped TypeScript aller 121 Dateien plus eigener Repros und Scope-ESLint mit
  --no-ignore/--max-warnings=0: jeweils Exit 0. Keine fremden UIkorrekturen.
- Vollständiges pnpm typecheck, separate E2Etypen und architecture:file-lines:
  jeweils Exit 0 in meinem Lauf. Typgrün erteilt keine UI-/Backendfreigabe.
- Eigene Handdateien höchstens 162 Zeilen; dieser Bericht unter 190.
  Keine Grenze oder Architekturbaseline verändert.

Aufrufe und tatsächliche Exitcodes stehen in generated/*-exit.json und checks.json,
vollständige Ausgaben in den zugehörigen Logs. Reproduktion der eigenen Suite:
pnpm --filter @wrapt/web exec vitest run --config
../../temp/hermes-v2/phase8-client-review-r3-20261017/vitest.config.mjs --cache=false --reporter=verbose.

Alle eigenen Runtime-/Fake-/Read-/Socket-/Timer-/Listenerressourcen und Prüfprozesse
beendet; jeder Fall prüft geschlossene Sockets, leere Readmaps und null Timer.
Keine weiteren Agents, Dienste, Browser, Previews, Slots, Nutzersessions, Git-, Account-,
Hermes-CLI- oder echten Coreaktionen. Einzige neue dauerhafte Datei ist dieser Bericht;
angeforderte Repros/Logs verbleiben im eigenen Tempordner.
Partieller Reconnect, next-only Queue, fehlender garantierter Lineage-StopTree und die
historischen Sicherheits-/Retentiongrenzen bleiben erhalten. Root besitzt Integration,
echte Browser-/Runtimeabnahme, Versionierung und sämtliche weiteren Phasenfreigaben.

# Hermes V2: unabhängiges Phase-8-Clientgate R2

Stand: 17.10.2026. **Urteil: needs fixes ausschließlich im eingefrorenen
nichtvisuellen Phase-8-Client.** Ein neues Medium bleibt offen. Kein High und
kein neues Low belegt. Die ursprünglichen gesunden R1-M1-Abläufe und R1-L1 sind
korrigiert; die bewusste Frischegrenze hält noch nicht über mehrere Aktionszyklen.
Keine UI-, Backend-, Browser-, Gesamtphasen-, Gesamtfeature- oder Phase-9-Freigabe.

Neuer unabhängiger Reviewer und eigene Repros, kein Fortsetzen des R1-Kindthreads.
AGENTS.md, sprachstil und für die isolierte Testconfig config-infos angewandt.
Originalbrief, beide Phase-8-Schnittstellen, Implementierungs- und Fixbericht,
R1-Gate und dessen tatsächliche Repros/Logs gegen Quellen und gebaute Contracts
geprüft. Phase-7-R1/R2/R3 samt Antworten, Phase-6-R1/R2 samt Formatwiederherstellung,
Phase-5-R1/R2 und Antworten, Phase-4-R1 bis R8 samt Antworten sowie Phase-3- und
Phase-2-Vorsend-/Protokollgrenzen nachgelesen. Frühere Gates werden nicht erweitert.
Produktpfade unten relativ zu apps/web/src/components/hermes/v2/.

**R2-M1, Medium: ein alter bewusster Abgleich entsperrt einen späteren Write.**

Quellen: resource-reads.ts:60 bis :75, insbesondere die gemeinsame Rückgabe bei :63;
resource-mutations.ts:177 bis :188. Die fresh-Map kennt nur den Readslot und einen
Kontextcapture. Sie unterscheidet keinen konkreten unknown-Vorgang oder späteren
Abgleichintent. reconcile akzeptiert auch einen weiterhin unknown, aber bereits
reconciled=true gewordenen alten Vorgang. Ein späterer Vorgang kann dadurch ein
vor seinem eigenen Write und Abgleich gestartetes Freshpromise übernehmen.

Gesunder ausführbarer Repro: reconcile-cycle.test.ts:9 im eigenen R2-Ordner,
zwei Varianten mit erfolgreichem beziehungsweise fehlerhaftem erforderlichem neuen
Read. Ausschließlich echte ResourceRuntime-/ResourceClient-/HTTPpfade:

1. Pause A tatsächlich senden, Quittung verlieren, unknown A bewusst erfolgreich
   abgleichen. A bleibt unknown mit reconciled=true, ein neuer Klick ist erlaubt.
2. A erneut bewusst abgleichen und dessen tatsächlichen Detail-HTTPread halten.
   Sein Snapshot wurde vor dem folgenden Write erfasst. Gleiche Auswahl, gleicher
   Owner, Scope und Bindung, kein Kontextwechsel oder ersetzter Produktguard.
3. Pause B für dasselbe Ziel tatsächlich senden, Fakejob verändern und auch diese
   Quittung verlieren. B ist ein eigener unknown-Eintrag mit reconciled=false.
   Der Katalog ist weiterhin ready und autorisiert diesen ausdrücklichen Write.
4. Jetzt B bewusst abgleichen. Statt eines neuen HTTPreads teilt readFresh das
   bereits vor B gestartete Promise von A. Dessen alten Snapshot beantworten.
5. B wird reconciled=true; es bleibt bei einem Detailread statt der erforderlichen
   zwei. Ein weiterer ausdrücklicher Resume-Klick sendet tatsächlich einen dritten
   Write statt weiterhin bei zwei Sends gesperrt zu bleiben. Der erforderliche
   neue Read hätte in einer Variante einen Fehler geliefert, wird aber nie gestartet.

Beide gesunden Sollfälle sind rot. Auch die Fakewirkung ist konkret belegt: der
zweite Send verändert den Job, die Anzeige übernimmt anschließend wieder dessen
Vorwrite-Snapshot. Kein automatischer Replay und kein Backend-/Authbypass behauptet.
Der öffentliche Clientvertrag erlaubt den Ablauf. Ergänzend bleibt der alte
Abgleichbutton im gelesenen cron-detail.tsx:73 bei jedem unknown sichtbar, auch
reconciled=true; dies ist nur Aufruferbeleg, kein Browser-/UIgate.

Die Sperre muss den konkreten späteren Vorgang bis zu dessen ausreichend neuem
Abgleich erhalten. Gleiche Doppelklicks desselben Vorgangs dürfen weiterhin teilen.
Keine Produktkorrektur vorgenommen. Root vor Bericht früh informiert, anschließend
auch der tatsächliche zusätzliche Write gemeldet.

Reproduktion vom Reporoot:
`pnpm --filter @wrapt/web exec vitest run --config ../../temp/hermes-v2/phase8-client-review-r2-20261017/vitest.config.mjs reconcile-cycle.test.ts --cache=false --reporter=verbose`.
cycle.log enthält zwei rote und einen gesunden grünen Gegenfall, tatsächlicher Exit 1.

Die ursprüngliche R1-M1-Folge ist gezielt geschlossen: resource-reads.ts:65 hält die
vor dem Intent offene Readkette fest, :70 wartet einschließlich ihres begrenzten
Folgereads, :71 prüft Kontext/Scope erneut, :72 startet danach den Read. Reservation
liegt vor dem ersten Emit. Drei eigene Timings prüfen ersten offenen Read sowie
Folgeread vor/nach dem Write bis zum tatsächlichen HTTPstart und erlauben einen
zweiten bewussten Write erst nach erfolgreichem neuem Beleg. Frischer Fehler und
falsches Ziel entsperren nicht; missing bleibt sichtbar und bereinigt keinen Bestand.
Ein Scopewechsel bestätigt den alten Vorgang nicht. Hintergrundrefresh allein
entsperrt weiterhin nichts. Die neue R2-Ursache betrifft das darüber hinausgehende
Teilen bereits bewusster Reads verschiedener Aktionszyklen.

Die offene R1-Belegeinwendung ist bestätigt. Original-own.log enthält beim
Createfall bereits den TypeError an reconcile-freshness.test.ts:127. Nach dem
gehaltenen ersten Katalogread läuft dessen Folge bereits loading/stale. createCron
wird vor POST korrekt abgewiesen, keine Action entsteht, anschließend liest der
Test deren nicht existente key. Dieser eine rote R1-Fall beweist keine Createwirkung.
Der ursprüngliche Bericht behauptet deshalb einen gesunden M1-Nachweis zu viel.
Originalreport, Originaltest und Guard bleiben unverändert. Die neue unveränderte
R1-Ausführung ergibt **86/87, Exit 1**, ausschließlich dieser TypeError; sämtliche
anderen Fälle einschließlich drei früher roter gesunder M1- und beider L1-Fälle grün.

Der Autorenersatz in resource-freshness.test.ts ist anhand der Quelle geprüft.
Eigene create-session.test.ts ergänzt zwei unabhängige gesunde Createvarianten:
Write synchron am tatsächlichen ready-Emit beziehungsweise vor der Hintergrundkette.
Beide belegen ready/stale=false beim echten POST, genau einen erzeugten Fakejob,
verlorene Quittung und unknown. Der alte Folgeread zeigt diesen Job noch nicht;
erst der nach dem Intent gestartete neue HTTPread zeigt ihn und entsperrt. Auch
nach 30 Sekunden kein Retry; erst ein neuer bewusster Klick erzeugt einen zweiten
Job. Eine weitere eigene Kontrolle bestätigt separat das ungesunde R1-Fixture mit
loading/stale, null POSTs und leerer Actionliste. Keine Guardlockerung.

R1-L1, zuvor Low, ist geschlossen. resource-runtime.ts:84 bis :100 beobachtet die
wertbasierte Bindung aus Connection-ID und Epoche und führt echte Änderungen durch
den monotonen Resetpfad. Eigene ID-/Epochwechsel sowie beide A-B-A-Varianten aborten
alte Reads, verwerfen späte Antworten und alte Token und laden aktuell erneut.
Identische wiederholte Frames erhalten Generation und laufenden Read ohne Zusatzread,
Socket oder Lease. Gehaltene mutierende Sends werden unknown ohne Replay; aktueller
Hintergrundread entsperrt sie nicht. Hidden beobachtet die Bindung ohne dort zu lesen.
Kein nachgewiesener normaler Server-IDwechsel oder Native-/Profilbypass behauptet.

Weitere eigene Kontrollen: 80 reentrante Abgleichklicks teilen einen Read;
Hidden-/Active-/Area-/Owner-/Ziel-/Signal-/ID-/Epoch-/Scope-A-B-A während des Wartens
verwerfen alte Fortsetzungen. Bei zwei besetzten HTTPplätzen wartet der neue Read,
startet nach dem Intent und bleibt bei höchstens zwei parallelen Reads. Hidden vor
queued Freshstart verhindert den HTTPsend. Offene/fresh-Maps und Warteschlange sind
nach Abschluss leer. 130 Unknown-/Abgleichzyklen halten Actions/Scopes höchstens 32,
Readversions höchstens neun; Dispose gibt Scopes und fresh-Slots frei.

Sessionunknown wird über einen neuen Read der genauen vollen Preview-ID abgeglichen.
Gültige, missing und widersprüchliche Zielantworten bleiben getrennt; kein weiterer
Delete und keine Bestandsbereinigung allein durch Reconcile. Wiederholte R1-Kontrollen
bestätigen originale Token, Scope-/Ziel-/ACK-Korrelation, neue Arbeit/Requests/Queue,
unknown Sends und fremde Owner-A-B-A sowie Erhalt fremder Drafts/Dateien/Auswahl.
Sessioninvalidierung allein ist keine Deletequittung. Native sessions.py und
hermes_state_sessions.py nur lesend geprüft: Kompressionskette und rekursive Delegates,
Branch/Reset eigenständig. Wrapts ACK erfordert erneut angefragte Abwesenheit;
confirmedAbsentSessionIds bleibt exakt, affectedIdsComplete=false. Kein Backendgate.

HTTPpfade, Same-Origincredentials, Sync-Version, no-store und strikte gebaute Zod-Hüllen
mit Routen abgeglichen. Wiederholte R1-Fälle erhalten sichere Teilupdates/Slug-IDs,
script/additional/workdir, exakte Skillnamen, Memory-/Pending-null/partial/truncated,
readonly und Copy nur auf Aktion aus validierter Projektion samt echter Ablehnung.
4-MiB-/UTF8-/Timeout-/Fetch-/Readergrenzen und Unknown ohne Retry bleiben grün.
Der Ressourcenbeobachter liegt vor dem Leasefilter am vorhandenen resources=1-Socket.
StrictMode-/Unmount-/Ownerhookkontrollen bleiben in der unveränderten R1-Suite grün.

Tatsächlich ausgeführte Prüfungen, jeweils mit eigenem Log und *-exit.json:

- Features aus dem 120er-Freeze: **716/716**, 54 Dateien, Exit 0.
- Unveränderte externe Originalconfigs Phase4/5/6/7: **702/702**,
  172+30+38+93+79+157+44+89, alle tatsächlicher Exit 0.
- Phase8-R1 unverändert **86/87, Exit 1**, einziger Fehler das oben erklärte Fixture.
- Eigene neue R2-Suite **37 grün, zwei rot von 39**, fünf Dateien, Exit 1.
  Beide roten Fälle ausschließlich R2-M1; kein roter Lauf als PASS gewertet.
- Vier vollständig gesunde eigene Dateien separat **36/36, Exit 0**; gesunder
  Createzyklus der Findingdatei separat **1/1, Exit 0**, zwei Findingfälle übersprungen.
- Scoped TypeScript aller 120 Dateien plus eigener Repros, Scope-ESLint mit
  --no-ignore/--max-warnings=0 sowie separate E2Etypen jeweils Exit 0.
- Vollständiges pnpm typecheck Exit 2: ausschließlich parallele fremde UItests,
  HermesV2CronForm.test.tsx:7 unbenutzter Typ und
  HermesV2SessionDeleteSheet.test.tsx:97 HTMLElement.disabled. Keine eigenen Typfehler.
  Keine UIkorrektur durch mich und kein globales Typgrün behauptet.
- pnpm architecture:file-lines Exit 0. Eigene Handdateien jeweils unter 400,
  dieser Bericht unter 200 physischen Zeilen; keine Grenze oder Baseline geändert.

Ein erster eigener Lauf enthielt eine unbegründete Zwei-Send-Erwartung beim
Scopewechsel. Nur die eigene Fixture/Erwartung korrigiert; finales Soll erhält die
Sperre. own-initial.log bleibt als Fehlerbeleg erhalten, kein Produktfinding daraus.

120/120 Source-/Testdateien vor und nach Prüfung SHA-256-identisch zum Fixfreeze;
Manifest **35e0f89497b3daefa9f327ae268d8d46563a831a4ffa07ecd6dbe5f76be73a6b**.
Eigener Vergleich bestätigt 115/118 alte Dateien bytegleich, ausschließlich
resource-reads/mutations/runtime geändert, zwei neue Regressionstestdateien.
Zusätzlich alle 552 zuvor erfassten historischen Berichte, Repros, Configs, Logs,
Freezes und gebauten Vertragsdateien unverändert. Belege unter
`temp/hermes-v2/phase8-client-review-r2-20261017/`, Integrität und Checkübersicht in generated/.

Alle eigenen Runtime-, Fake-, Reader-, Socket-, Timer- und Prüfprozessressourcen
beendet; Cleanupassertionen einschließlich null Timer bestanden. Keine Produktedits,
Altassertions-/Altberichtänderungen, Subagents, Browser, Dienste, Previews, Slots,
Git-, Account-, Hermes-CLI- oder echte Coremutationen. Einzige neue dauerhafte Datei
ist dieser Bericht; verlangte Repros/Logs verbleiben im eigenen Tempordner.
Partielle Reconnectabdeckung, next-only Queue und fehlender garantierter Lineage-
StopTree bleiben dokumentierte Grenzen. Root besitzt Fixfreigabe, frisches Gate,
UI-/Backendintegration, globale Pflichtchecks und Versionierung.

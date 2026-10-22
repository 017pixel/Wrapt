# Hermes V2: unabhängiges Phase-4-Client-Gate R5

Stand: 16.10.2026. **Urteil: needs fixes. Ein neues Medium-Finding.**
Die konkreten Ursachen aus R1 bis R4 sind geschlossen. Drei neue rote gesunde
Assertions belegen unten einen verlorenen geteilten Membership-Backfill.
Kein konkret nachgewiesenes High-Finding. Kein Gesamtfeature-, Backend-, UI-
oder Browser-PASS. Der Phase-3-R3-PASS bleibt in seinem damaligen Scope erhalten.

## Prüfgrenze und Verfahren

Frischer Recheck des eingefrorenen nonvisuellen Phase-4-Webscopes: sidebar-types/
resolver/dnd/time/preferences/empty, organization-client/response/policy/owner/
state/queries/actions/runtime/pagination, useHermesV2Sidebar, chat-read-evidence
und erforderliche Chat-/Store-/Owner-/Gatewaypfade samt Tests. Produktpfade unten
relativ zu apps/web/src/components/hermes/v2/.

AGENTS.md und sprachstil angewandt. Originalbrief insbesondere Kapitel 5, 11 bis
13, Phase 4, Tests und DoD, organisation-handoff, evidence-gate-r4, verbindliche
phase4-interface-decisions und phase4-web-implementation berücksichtigt.
Vorherige Clientgates und Fixantworten abgeglichen; vollständige R4-Antwort mit
aktuellen Readketten geprüft. Alle 36 neuen dauerhaften R4-Fixfälle selbst ausgeführt.

Server/Contracts ausschließlich lesend zum Vertragsverständnis. Keine Servertests
oder Backendfreigabe. Keine Komponenten-, CSS-, realen Observer- oder Browserchecks.
Keine Dienste, Browser, Ports, Previews, Nutzersessions, echten Coremutationen,
Gitoperationen oder weiteren Agents. Keine Produktdateien, Altberichte oder alten
externen Repros geändert. Eigene Repros/Ausgaben ausschließlich unter
temp/hermes-v2/phase4-client-review/r5*. Einziger neuer dauerhafter Bericht hier.

## Bisherige Findings unabhängig verifiziert

- R1-M1: Offset-1-History übernimmt frische vollständige Projektionen und Handles,
  auch bei gleicher UID mit anderer Row-ID. Vor eigenem sichtbarem B ein Readversuch,
  danach zwei, fehlgeschlagenes A plus erfolgreiches B. Alte Generation liest B nicht.
- R1-M2: bekannte alte Mitglieder werden beim ausdrücklichen Refresh und bei
  metadata.invalidated erneuert, einschließlich belegter Requestactivity ohne
  weitere Chatlease. Der neue Ownerabbruchfall unten hat eine andere Ursache.
- R1-M3: unveränderte native Rows setzen neuere REST-Summaries nicht zurück.
  Tatsächlich neue native Beobachtungen bleiben gegen verspätete RESTreads geschützt.
- R1-M4: erfolgreiche Reorders verlangen die eindeutige vollständige Zielmenge.
  Fremde/fehlende/doppelte/zusätzliche Items werden vor Metadaten/Undo verworfen.
  Andere Reihenfolge, leere passende Menge und abweichende aktuelle 409 bleiben erlaubt.
- R2-M1: per-ID-Readordnung schützt Lookup und Katalog auch bei gleichem observedAt.
  Ein älterer Erfolg bleibt erlaubt, solange kein neuerer erfolgreicher Stand vorliegt.
- R2-M2: Missing entwertet Summary/Activity, erhält private Organisation und sperrt
  alte Wiederbelebung. Neuere native/REST-Belege und echte Wiederverfügbarkeit bleiben.
  Lookup verlangt eine vollständige eindeutige Partition; unbekannte Counts bleiben null.
- R2-M3: reale terminale Teilseite offset=4900/hasMore=true/nextOffset=null wird
  übernommen und beendet Folgereads. Vollständige Grenzseiten bleiben vollständig;
  vorzeitiger Nullfortschritt und widersprüchliche Vollständigkeit bleiben Fehler.
- R3-M1: Projektbelege bleiben owner-/anfragegebunden. Allgemeine und andere
  Projektantworten mit gleicher CWD schließen sie nicht aus. CWD-/Missingrevisionen,
  Wiederverfügbarkeit, P→Q→P und Unmount verlangen jeweils eigene Neubestätigung.
- R3-M2: alte Membershipkonflikte, Catch/Finally und wartende Resets verändern
  weder den geleerten noch einen neuen Zyklus. Aktuelle 409 bleiben wirksam.
- R4-H1: Pinvorbereitung endet vor jeder deaktivierten Iteration. Der alte externe
  17-Aufruf-Testwächter wird nicht erreicht, deaktivierte Iterationen bleiben null.
  Owner-/Generationsabbruch und fehlender Cursor-/Mengenfortschritt enden ebenfalls;
  gültige 101 Pins und aktuelle HTTP-Fehler funktionieren weiterhin.
- R4-M1: Fresh-Singleflight, Invalidierung→Lookup, Refresh über Katalog/Gruppen/
  Notices und weitere Batches behalten ihren Anfangszyklus. Off/On übernimmt keine
  alte private ID. Gültige Freshreads bleiben erhalten; sortierte JSON-ID-Schlüssel
  teilen dieselbe Menge und verwechseln unterschiedliche gültige Mengen nicht.

## R5-M1: Ownerabbruch verliert den Backfill einer schon angenommenen Membershipseite

**Severity: Medium. Orte:** organization-queries.ts:94, :105, :119 bis :121
und :143. Repros: r5-shared-read.test.ts:76 und :124 im genannten Temp-Verzeichnis.
Kein Methodenmock oder Testwächter im neuen Repro, echter Client-/Runtimepfad.

Eine Pin-ID außerhalb der ersten 100 Katalogrows erhält ihre gültige Membershipseite.
Deren Summary-Lookup bleibt ausstehend. Eine zweite Sidebar wartet auf denselben
geteilten Gruppenread. Erst jetzt den ersten Owner schließen oder dessen Generation
durch Sichtbarkeitswechsel ersetzen; danach die gültige Lookupantwort mit Titel
und waiting_input/openRequestCount=1 liefern. Der zweite Owner bleibt aktiv.

Erwartet: Der gültige zweite Owner erhält den noch fehlenden begrenzten Backfill
oder kann ihn nachladen. Seine Row zeigt die bestätigte offene Anfrage in Needs input.
Ist: Die Lookupantwort wird wegen des ungültigen ersten Owners korrekt verworfen,
aber der globale Membershipzustand ist bereits complete=true/revision!=null.
Der wartende zweite Read startet deshalb nichts neu. Auch ausdrücklich loadMembers
kehrt wegen complete sofort zurück. Row bleibt ID-Ersatz, requestCount=null, Pinned;
loading=false und error=null. Kein zusätzlicher Chat oder Flagwechsel ist nötig.

Ein dritter Gegenfall beginnt mit bekannter alter Summary und idle. Beim ausdrücklich
geteilten Refresh schließt der erste Owner während des erneuten Lookups. Die zweite
Sidebar behält danach Titel Veraltet/requestCount=0/Pinned statt Frisch/1/Needs input.
Das ist keine Grenze einer noch unbekannten ID oder ungeladenen Katalogseite.

Ursache: Membershipvollständigkeit wird vor dem ownergebundenen Lookup gesetzt.
Dessen Abbruch hinterlässt keine nachholbare Backfillverantwortung; wartende Leser
prüfen nur reset/revision===null. Ein vollständiger Sidebar-refresh repariert beide
Varianten, bloßes Gruppenladen nicht. Ohne Ownerabbruch funktioniert derselbe Ablauf.
Fixrichtung: ausstehenden Summary-/Activitybackfill für einen gültigen aktuellen
Owner erhalten beziehungsweise gezielt übernehmbar machen. Alte Zyklen und
ungültige Owner weiter sperren; keine pauschale Read- oder Mutationswiederholung.

## Selbst ausgeführte Checks

- 19 Featuredateien: **214/214 grün**, einschließlich aller 88 Phase-3-Fälle,
  sämtlicher R1/R2/R3-Autorenfälle und der 36 neuen R4-Fixfälle. r5-feature-tests.txt.
- Alle sieben bisherigen externen Dateien vor Ergänzungen unverändert ausgeführt:
  **88/88 grün**, r5-external-before.txt. Die korrigierte R1-M1-Zählung bleibt erhalten.
- Zwei eigene Dateien, 22 neue Fälle: **19 grün, drei rote gesunde Assertions**
  zu genau einer neuen Ursache. Gesamtlauf **107 grün, drei rot, 110 Fälle**:
  `pnpm --filter @wrapt/web exec vitest run --config ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
  Ausgabe: temp/hermes-v2/phase4-client-review/r5-results.txt.
- Neue grüne Gegenfälle: alte 201-ID-Metadatenkette stoppt vor weiteren Batches;
  altes Finally löscht keinen neuen Singleflight; beendeter Freshwaiter erzeugt
  keinen Folgeread, schon gestarteter gültiger Sharedread bleibt nutzbar.
  Neun zusätzliche Promisegrenzen der 70-Handle-ACK-Kette über Off/On, A→B während
  frischer Metadaten, alte Belegerneuerung und gültige/abgebrochene Refreshketten grün.
- Vollständiges pnpm typecheck grün, einschließlich Contracts/Server/Web/E2E-Typen.
  Gezieltes ESLint sämtlicher nonvisuellen Module/Hooks und Tests mit
  --max-warnings=0 grün. Ausgaben: r5-typecheck.txt und r5-lint.txt.
- pnpm architecture:file-lines grün, einschließlich dieses Berichts. Eigene
  Reprofile unter 400 Zeilen, Bericht unter 150. r5-architecture.txt.
  SHA-256-Recheck der zentralen Organisationsdateien, chat-read-evidence und aller
  alten externen Testdateien bestätigt den unveränderten Freeze: r5-freeze-check.txt.

Streamgrenze, gemeinsame Uhr/Undo, Suchlimit, 101 Pins, GET-Invalidierungsrace,
StrictMode, keine Token-Neusortierung, exakte Readmengen, hängendes A neben B/B2
und 8200er-Grenze samt Reset bleiben in den ausgeführten Bestandsfällen grün.
R5-M1 benötigt Korrektur und frischen Recheck. UI, Browser, Backend und
Versionierung der Gesamtintegration bleiben bei ihren getrennten Gates.

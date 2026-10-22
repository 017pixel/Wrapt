# Hermes V2: unabhängiges Phase-4-Client-Gate R6

Stand: 16.10.2026. **Urteil: needs fixes. Ein neues Medium-Finding.**
R5-M1 ist in den ursprünglichen Ownerabbruch-/Erfolgsabläufen geschlossen.
Zwei neue rote gesunde Assertions belegen verlorenen Backfill nach einem Fehler
auf einer nichtterminalen Membershipseite. Kein konkret nachgewiesenes High-Finding.
Kein Gesamtfeature-, UI-, Browser- oder Backend-PASS. Phase-3-R3 bleibt erhalten.

## Prüfgrenze und Verfahren

Frischer gezielter Recheck des eingefrorenen nonvisuellen Phase-4-Webclients:
Organisation-/Sidebarlogik, Queries/Owner/Lifecycle, Hook und Readbelegketten samt
notwendigen Chat-/Store-/Gatewaypfaden. Produktpfade unten relativ zu
apps/web/src/components/hermes/v2/. Keine Komponenten-/CSS-/Observerfreigabe.

AGENTS.md und sprachstil angewandt. Originalbrief insbesondere Kapitel 5, 11 bis
13, Phase 4, Tests und DoD, organisation-handoff, evidence-gate-r4, verbindliche
phase4-interface-decisions und phase4-web-implementation berücksichtigt.
Clientgates und Antworten R1 bis R5 gelesen; R5-Antwort vollständig mit dem aktuellen
Membershippfad abgeglichen. Alle acht neuen dauerhaften R5-Fälle selbst ausgeführt.

Keine Produktdateien, Altberichte oder alten Repros geändert. Keine Browser,
Server, Dienste, Ports, Previews, Nutzerdaten, echten Coreaufrufe, Gitoperationen
oder weiteren Agents. Eigene Gegenfälle und Ausgaben ausschließlich unter
temp/hermes-v2/phase4-client-review/r6*. Einziger neuer dauerhafter Bericht hier.
Typprüfung des Servers ist kein Backendgate; separate Freigaben nicht übernommen.

## R5-Korrektur und gesunde Gegenfälle

organization-queries.ts:98 übergibt den ursprünglichen Runtimeguard an den bereits
gestarteten gemeinsamen Seitentask. Seite und zugehöriger Summary-/Activitylookup
werden dadurch bei Release, neuer Ownergeneration oder neuer Query fertiggestellt.
Unbekannte und veraltete alte Pinchats erreichen den gültigen zweiten Owner mit
frischem Titel, requestCount=1 und Needs input. Die 110 alten externen Fälle bestehen.

Eigene neue Gegenfälle prüfen zusätzlich Abbruch vor der Membershipantwort und
Unmount mit anschließender Neuanlage derselben Owner-ID. Ein bereits autorisierter
Backfill bleibt gemeinsam nutzbar; der alte Owner lädt keine weitere Pinseite,
mutiert nichts und erzeugt keine Chatlease. Eine wartende Pinvorbereitung bleibt
bis zum Backfill gebunden und endet bei eigener Generationsänderung.

Flag-off, Off/On und letzter Unmount entwerten alte globale Lookupantworten weiterhin.
Neuer Runtimezustand bleibt unverändert. Neuere REST-/native Summarybelege werden
nicht zurückgesetzt. Gültiges Missing entfernt alte Requestactivity, erhält den
privaten Pin und erlaubt spätere Wiederverfügbarkeit. Terminaler Backfillfehler
erreicht den gültigen wartenden Owner, wiederholt sich nicht automatisch und lässt
sich durch ausdrückliches Gruppenladen reparieren. Nichtterminaler Fall siehe unten.

## Bisherige Ursachen bleiben geschlossen

- R1-M1: erneuerte ältere History übernimmt vollständige Projektion/Handles auch
  bei neuer Row-ID derselben UID. Vor eigenem sichtbarem B ein Readversuch, danach
  zwei, fehlgeschlagenes A plus B. Alte Auswahl-/Snapshotgeneration liest B nicht.
- R1-M2: bekannte alte Membershipsummaries und Activity werden bei Refresh und
  Metadata-Invalidierung erneuert, ohne weitere Chatabos. R1-M3: unveränderte native
  Rows überschreiben neuere RESTdaten nicht; echte native Änderungen bleiben geschützt.
- R1-M4: Reordererfolg verlangt eindeutige vollständige Zielmenge. Fremde/fehlende/
  doppelte/zusätzliche Items werden vor Metadaten/Undo als unknown verworfen.
  Andere Reihenfolge, passende leere Menge und abweichender aktueller 409 bleiben erlaubt.
- R2-M1: per-ID-Readordnung schützt Lookup/Katalog bei gleichen observedAt-Werten.
  Älterer Erfolg bleibt bis zum neueren Erfolg erlaubt. R2-M2: Missing entwertet
  Summary/Activity unter derselben Ordnung, erhält Organisation und verhindert
  alte Wiederbelebung. Vollständige Lookuppartition und unbekannte Counts bleiben.
- R2-M3: reale terminale 5000er-Teilseite wird übernommen und beendet Folgereads;
  vollständige Grenzseiten bleiben vollständig, vorzeitiger Nullfortschritt fehlerhaft.
- R3-M1: Projektbelege bleiben owner-/anfragegebunden. Allgemeine/andere Projekte
  mit gleicher CWD schließen sie nicht aus. CWD-/Missingrevisionen, Wiederverfügbarkeit,
  Projektwechsel und Unmount verlangen eigene Neubestätigung. R3-M2: alte 409,
  Catch/Finally und wartende Resets verändern weder geleerten noch neuen Runtime.
- R4-H1: Pinvorbereitung endet bei Flag-/Ownerabbruch und fehlendem Fortschritt.
  Der externe 17-Aufruf-Wächter wird nicht erreicht; gültige 101 Pins bleiben möglich.
  R4-M1: Fresh-Singleflight, Invalidierung, Refresh, Notices und Readbatches behalten
  Anfangszyklus/Ownergeneration. Sortierte JSON-ID-Schlüssel bleiben kollisionsfrei.

## R6-M1: fehlgeschlagener Backfill einer nichtterminalen Seite wird übersprungen

**Severity: Medium. Orte:** organization-queries.ts:105, :121, :123 und :132.
Repro: temp/hermes-v2/phase4-client-review/r6-backfill-retry.test.ts:33,
zwei Fälle mit unbekannter beziehungsweise bekannter veralteter Summary.

101 private Pins außerhalb der ersten Katalogseite. Pinvorbereitung von A lädt
die ersten 100 Membershipitems und wartet auf deren echten Summarylookup. B wartet
auf denselben Task; A wird geschlossen. Der Lookup antwortet mit HTTP 503. B erhält
korrekt den Fehler; kein automatischer Retry. Anschließend Fehler schließen und
über die echte Sidebaraktion ausdrücklich loadMembers("pinned") erneut anfordern.

Erwartet: Der fehlgeschlagene begrenzte Backfill bleibt nachholbar; erfolgreiche
weitere Pagination darf diese Verantwortung nicht als vollständig erledigt verlieren.
Ist: cursor="second" und hasMore=true wurden bereits vor dem Lookup übernommen.
Catch setzt nur complete=false. Der nächste Aufruf lädt deshalb Seite zwei samt
deren einzigem Summary und setzt complete=true. Weitere loadMembers-Aufrufe sind
No-ops. Die erste Row bleibt ID-Ersatz/requestCount=null/Pinned beziehungsweise
Veraltet/requestCount=0/Pinned. Eine verfügbare offene Eingabe wird nicht nachgelesen.

Beide Repros prüfen danach als gesunden Gegenteilfall vollständiges refresh:
dieses lädt die erste Seite erneut und zeigt sofort Frischer offener Request/1/
Needs input. Normale erfolgreiche Pagination und terminaler Fehlerretry bestehen.
Es geht um bereits bekannte geladene Mitgliedschaft, nicht zusätzliche Katalogtiefe.

Ursache: Seitenfortschritt wird vor dem zugehörigen Backfill endgültig übernommen;
bei Fehler bleibt für nichtterminale Seiten keine erneuerbare Backfillverantwortung.
Fixrichtung: fehlgeschlagene Seite beziehungsweise ihre IDs für einen ausdrücklichen
erneuten Abruf erhalten. Zyklus-/Readordnung, gemeinsame Ownership und fehlende
automatische Retries bewahren. Keine Mutation oder neue Pollschleife erforderlich.

## Selbst ausgeführte Prüfungen

- 20 Featuredateien: **222/222 grün**, einschließlich aller 88 Phase-3- und acht
  neuen R5-Autorenfälle. Ausgabe: r6-feature-tests.txt im genannten Temp-Verzeichnis.
- Neun bisherige externe Dateien unverändert: **110/110 grün**, r6-external-before.txt.
  Zwei eigene neue Dateien: **13 grün, zwei rote gesunde Assertions**, 15 Fälle.
  Gesamtlauf **123 grün, zwei rot, 125 Fälle** in elf Dateien, r6-results.txt.
  Kommando: pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose.
- Vollständiges pnpm typecheck grün, einschließlich Contracts/Server/Web/E2E-Typen.
  Gezieltes ESLint aller nonvisuellen Organisations-/Sidebar-/Chat-/Gatewaymodule
  und Hooks samt Tests mit --max-warnings=0 grün. r6-typecheck.txt und r6-lint.txt.
- pnpm architecture:file-lines grün einschließlich dieses Berichts. Neue Repros
  jeweils unter 400 Zeilen, Bericht unter 150. Ausgabe: r6-architecture.txt.
  SHA-256-Abgleich der 81 erfassten Produkt-/Altbericht-/Altreprodateien unverändert,
  r6-freeze-check.txt. Keine alten externen Assertions abgeschwächt.

Streamgrenze, gemeinsame Uhr/Undo, Suche/5000er-Limit, StrictMode, GET-Invalidierung,
keine Token-Neusortierung, exakte sichtbare Reads, hängendes A neben B/B2 und
begrenzte Caches samt Reset bleiben in den ausgeführten Bestandsfällen grün.
R6-M1 bleibt offen. Gesamtintegration und Versionierung liegen weiter beim Root.

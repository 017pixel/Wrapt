# Hermes V2: unabhängiges Phase-4-Client-Gate R7

Stand: 16.10.2026. **Urteil: needs fixes. Ein neues Medium-Finding.**
R6-M1 ist in den ursprünglichen Abläufen geschlossen. Zwei neue rote gesunde
Assertions belegen eine verlorene Pinlisteninvalidierung während des Backfills.
Kein konkret nachgewiesenes High-Finding. Kein Gesamtfeature-, UI-, Browser- oder
Backend-PASS. Der Phase-3-R3-PASS bleibt in seinem damaligen Scope erhalten.

## Prüfgrenze und Verfahren

Frischer gezielter Recheck des eingefrorenen nonvisuellen Phase-4-Webclients:
Organisation-/Sidebarlogik, Queries/Owner/Lifecycle, Hook und Readbelegketten samt
notwendigen Chat-/Store-/Gatewaypfaden. Produktpfade unten relativ zu
apps/web/src/components/hermes/v2/. Keine Komponenten-/CSS-/Observerfreigabe.

AGENTS.md und sprachstil angewandt. Originalbrief vollständig gelesen, besonders
Kapitel 5, 11 bis 13, Phase 4, Tests und DoD. organisation-handoff, evidence-gate-r4,
verbindliche phase4-interface-decisions und phase4-web-implementation abgeglichen.
Clientgates/Fixantworten R1 bis R6 und Phase-3-Gates berücksichtigt; R6-Gate und
R6-Antwort vollständig mit dem aktuellen Membership-Commitpunkt geprüft.

Keine Produktdateien, Altberichte oder alten Repros geändert. Keine Browser,
Server, Dienste, Ports, Previews, Nutzerdaten, echten Coreaufrufe, Gitoperationen
oder weiteren Agents. Eigene Gegenfälle und Ausgaben ausschließlich unter
temp/hermes-v2/phase4-client-review/r7*. Einziger neuer dauerhafter Bericht hier.
Separate Backend-/UX-Freigaben sind keine eigenen Prüfnachweise dieses Gates.

## R6-M1 geschlossen und positive Gegenfälle

organization-queries.ts:120 bis :125 übernimmt ids/revision/cursor/hasMore/complete
erst nach erfolgreichem zugehörigem Lookup und erneuter Runtimeprüfung. Ein Fehler
behält den zuletzt vollständig bearbeiteten Seitenstand. Beide unveränderten
externen R6-Fehlerfälle bestehen jetzt, ebenso alle neun neuen Autorenregressionen.

Eigene zusätzliche Fälle bestätigen unbekannte und veraltete alte Pins, offene
Eingabe nach ausdrücklichem Retry, terminalen Fehlerretry und Fehler auf der zweiten
nichtterminalen Seite einer 201-Pin-Liste. Erfolgreiche Seite eins bleibt erhalten;
erneut angefordert wird derselbe fehlgeschlagene Cursor, danach normale Pagination.
101 Pins werden vollständig bestätigt; ein weiterer Gruppenread bleibt ohne IO.
Fehler erzeugen keine automatische Wiederholung und keine Mutation oder Chatlease.

Ein gültiger wartender Owner erhält Seite samt Backfill auch nach Generationwechsel
oder Unmount des ersten Owners vor der Membershipantwort. Dessen Vorbereitung lädt
keine weitere Seite. Ein wartender Reset übernimmt einen Backfillfehler, ohne selbst
automatisch neu zu senden; ein neuer ausdrücklicher Start funktioniert weiterhin.
Flag-off, Off/On und letzter Unmount entwerten alte Erfolge, Fehler und Resetketten.
Gültiger aktueller 409 bleibt sichtbar und übernimmt aktuelle eigene Metadaten.

Gültiges Missing schließt den begrenzten Backfill ehrlich ab, entfernt alte
Requestactivity und erhält den privaten Pin. Wiederverfügbarkeit wird übernommen.
Neuere native/REST-/Missingbelege werden vom älteren erfolgreichen Backfill nicht
zurückgesetzt. Die unten belegte verlorene Invalidierung betrifft Vollständigkeit,
nicht diese monotone Summaryordnung oder die gemeinsame Runtimeverantwortung.

## Frühere Ursachen bleiben geschlossen

- R1-M1: erneuerte Offset-1-History übernimmt vollständige Projektion/Handles,
  auch bei gleicher UID und anderer Row-ID. Vor eigenem sichtbarem B ein Readversuch,
  danach zwei, fehlgeschlagenes A plus B. Alte Auswahl-/Snapshotgeneration liest B nicht.
- R1-M2: bekannte alte Membershipsummaries/Activity werden beim Refresh und bei
  Metadata-Invalidierung erneuert, ohne weitere Chatabos. R1-M3: unveränderte native
  Rows überschreiben keine neueren RESTdaten; echte native Änderungen bleiben geschützt.
- R1-M4: Reordererfolg verlangt eindeutige vollständige Zielmenge. Fremde/fehlende/
  doppelte/zusätzliche Items werden vor Metadaten/Undo als unknown verworfen.
  Andere Reihenfolge, leere passende Menge und abweichende aktuelle 409 bleiben erlaubt.
- R2-M1: per-ID-Readordnung schützt Lookup/Katalog auch bei gleichem observedAt;
  ein älterer Erfolg bleibt bis zum neueren Erfolg erlaubt. R2-M2: Missing entwertet
  Summary/Activity, erhält Organisation und verhindert alte Wiederbelebung. Neuere
  Belege, Wiederverfügbarkeit, vollständige Lookuppartition und unbekannte Counts bleiben.
- R2-M3: reale terminale 5000er-Teilseite wird übernommen und beendet Folgereads.
  Vollständige Grenzseiten bleiben vollständig; vorzeitiger Nullfortschritt bleibt Fehler.
- R3-M1: Projektbelege bleiben owner-/anfragegebunden. Allgemeine/andere Projekte
  mit gleicher CWD schließen sie nicht aus. CWD-/Missingrevisionen, Wiederverfügbarkeit,
  Projektwechsel und Unmount verlangen eigene Neubestätigung. R3-M2: alte 409,
  Catch/Finally und wartende Resets verändern weder geleerten noch neuen Runtime.
- R4-H1: Pinvorbereitung endet bei Flag-/Ownerabbruch und fehlendem Fortschritt;
  der externe 17-Aufruf-Wächter wird nicht erreicht. R4-M1: Fresh-Singleflight,
  Invalidierung, Refresh, Notices und Readbatches behalten Anfangszyklus/Ownergeneration.
  Sortierte JSON-ID-Schlüssel bleiben kollisionsfrei; kein Mutationsretry.
- R5-M1: bereits autorisierte globale Membershipseite und Summarybackfill behalten
  den ursprünglichen Runtimezyklus. Individuelle Ownerfortsetzungen bleiben gebunden;
  gültige zweite Owner verlieren weder unbekannte noch veraltete wartende Chats.

## R7-M1: terminaler Backfill überschreibt neuere Pinlisteninvalidierung

**Severity: Medium. Orte:** organization-queries.ts:124 bis :125 sowie :105 bis :107;
Invalidierung in organization-state.ts:35 bis :36.
Repros: r7-membership-commit.test.ts:108 und r7-membership-invalidation.test.ts:29
im genannten Temp-Verzeichnis. Echter Client-/Runtimepfad, keine Methodenmocks.

Eine terminale Pinseite enthält old mit pinRevision=0. Ihren zugehörigen Lookup
halten. Währenddessen ausdrücklich frische Metadaten beziehungsweise ein echtes
normalisiertes metadata.invalidated empfangen: old ist jetzt ungepinnt, revision=1,
pinRevision=1. Die neuen Metadaten werden korrekt übernommen, complete wird false.
Erst danach den ursprünglichen gültigen Summarybackfill auslaufen lassen.

Erwartet: Die inzwischen belegte Listenänderung bleibt entwertend. Ausdrückliches
loadMembers("pinned") kann die aktuelle Liste begrenzt erneut lesen und bestätigen.
Ist: Der alte Commit setzt wieder complete=true/hasMore=false/pinRevision=0.
Die gemeinsame pinRevision bleibt 1; pinMembershipComplete ist korrekt false.
Trotzdem kehrt loadMembers wegen member.complete sofort zurück. Beide gesunden
Assertions erwarten zwei Membershiprequests, beobachten dauerhaft nur einen.
Die aktuelle leere Pinliste wird nicht angefragt, der Ladeversuch meldet keinen Fehler.

Der zusätzliche echte Ereignisfall bestätigt die Ursache ohne direkten Querytrigger.
Sein zeitlicher Gegenteilfall, dieselbe Invalidierung erst nach dem Backfill, besteht:
complete bleibt false und ausdrückliches Gruppenladen übernimmt die aktuelle Liste.
Neuere private Rowmetadaten und Summaryactivity bleiben in beiden Abläufen erhalten.
Reorder bleibt durch pinMembershipComplete gesperrt, kein illegaler Reorder nachgewiesen.

Ursache: Der verschobene Seitencommit bestätigt Vollständigkeit ohne Barriere gegen
eine während des Await eingegangene neuere Listeninvalidierung. Fixrichtung:
diese Entwertung am Commitpunkt erhalten und ausdrückliches Nachladen ermöglichen.
R6-Fehlercursor, gemeinsame Ownership, alte Zyklusbarrieren und keine automatischen
Retries dabei bewahren. Keine neue Abfragequelle oder Mutation erforderlich.

## Selbst ausgeführte Prüfungen

- 21 Featuredateien: **231/231 grün**, einschließlich aller 88 Phase-3-Fälle und
  neun neuen R6-Autorenfälle. Ausgabe: r7-feature-tests.txt im Temp-Verzeichnis.
- Alle elf bisherigen externen Dateien unverändert: **125/125 grün**,
  r7-external-before.txt. Die dokumentierte R1-M1-Zählung 1 vor B/2 nach B bleibt.
- Drei eigene Dateien, 21 neue Fälle: **19 grün, zwei rote gesunde Assertions**
  zu genau R7-M1. Gesamtlauf: **144 grün, zwei rot, 146 Fälle** in 14 Dateien.
  Kommando: pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose.
  Ausgabe: r7-results.txt. Separate neue Läufe: r7-commit-results.txt,
  r7-invalidation-results.txt und r7-lifecycle-results.txt.
- Vollständiges pnpm typecheck grün, einschließlich Contracts/Server/Web/E2E-Typen.
  Gezieltes ESLint sämtlicher nonvisuellen Module/Hooks und Tests mit
  --max-warnings=0 grün. r7-typecheck.txt und r7-lint.txt. Kein Backendgate.
- pnpm architecture:file-lines grün einschließlich dieses Berichts.
  Neue Repros jeweils unter 400 Zeilen, Bericht unter 150. r7-architecture.txt.
  SHA-256-Abgleich der 88 erfassten Produkt-/Altbericht-/Altreprodateien unverändert,
  r7-freeze-check.txt. Keine alten externen Assertions abgeschwächt.

Streamgrenze, gemeinsame Uhr/Undo, Suche, StrictMode, GET-Invalidierung, keine
Token-Neusortierung, exakte sichtbare Reads, hängendes A neben B/B2 und begrenzte
Caches samt Reset bleiben in den ausgeführten Bestandsfällen grün. R7-M1 bleibt
offen. Gesamtintegration und Versionierung liegen weiter beim Root.

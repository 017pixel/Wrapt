# Hermes V2: unabhängiges Phase-4-Client-Gate R4

Stand: 16.10.2026. **Urteil: needs fixes. Ein neues High- und ein Medium-Finding.**
Alle ursprünglichen M1 bis M4, die drei R2-Ursachen und beide R3-Ursachen sind in
ihren konkreten Abläufen geschlossen. Zwei weitere Lifecyclefehler sind unten
belegt. Kein Gesamtfeature-, Backend-, UI- oder Browser-PASS. Der frühere
Phase-3-R3-PASS bleibt im damaligen Scope erhalten.

## Prüfgrenze und Verfahren

Frischer Recheck des eingefrorenen nonvisuellen Phase-4-Webscopes: sidebar-types/
resolver/dnd/time/preferences/empty, organization-client/response/policy/owner/
state/queries/actions/runtime/pagination, useHermesV2Sidebar, chat-read-evidence
und notwendige Chat-/Store-/Owner-/Gatewaypfade samt Tests. Produktpfade unten
relativ zu apps/web/src/components/hermes/v2/.

AGENTS.md und sprachstil angewandt. Originalbrief insbesondere Kapitel 5, 11 bis
13, Phase 4, Tests und DoD, organisation-handoff, evidence-gate-r4, verbindliche
phase4-interface-decisions und phase4-web-implementation gelesen. Alle früheren
Clientgates und Fixantworten berücksichtigt; R3-Gate und R3-Fixantwort vollständig
mit aktuellem Code abgeglichen. Alle 24 neuen R3-Autorenregressionen ausgeführt.

Server/Contracts ausschließlich lesend zum Vertragsverständnis. Keine Servertests
oder Backendfreigabe. Keine Bewertung von Komponenten, CSS, realen Observern oder
Browserintegration. Keine Dienste, Browser, Ports, Nutzersessions, Previews,
echten Coremutationen, Gitoperationen oder weiteren Agents. Keine Produktdatei,
Altberichte oder bisherigen externen Repros geändert. Eigene Repros/Ausgaben nur
unter temp/hermes-v2/phase4-client-review/r4*. Einziger dauerhafter Bericht hier.

## Altfindings unabhängig verifiziert

- R1-M1 geschlossen: ältere Offset-1-Projektion übernimmt frische Inhalte/Handles,
  auch bei derselben UID mit anderer Row-ID. Vor eigenem sichtbarem B genau ein
  Readversuch, danach zwei, fehlgeschlagenes A plus B. Alter Generationscallback
  liest B nicht; Auswahlwechsel verwirft eine ausstehende Erneuerung.
- R1-M2 geschlossen: bekannte alte Membership-IDs erhalten beim Sidebarrefresh
  und bei metadata.invalidated neue Summaries und belegte Requestactivity.
  Needs-input-Vorrang ohne zusätzliche Chatlease bleibt erhalten.
- R1-M3 geschlossen: unverändertes natives A wird durch B oder Listen-Loading
  nicht erneut als Änderung konsumiert. Neuere RESTdaten bleiben; echte native
  Änderungen gewinnen weiterhin gegen verspätete alte RESTantworten.
- R1-M4 geschlossen: erfolgreiche Reorders sind an die eindeutige vollständige
  Zielmenge gebunden. Fremde/fehlende/doppelte/zusätzliche Items werden vor
  Metadaten/Undo verworfen. Andere Reihenfolge, leere Menge und abweichende aktuelle
  409-Menge bleiben erlaubt. Keine automatische Mutationswiederholung.
- R2-M1 geschlossen: per-ID-Readordnung erhält neueren Lookup/Katalog bei gleichem
  und verschiedenem observedAt. Älterer Erfolg darf bis zum neueren Erfolg sichtbar
  bleiben; ein später gestarteter fehlgeschlagener Read verdrängt ihn nicht.
- R2-M2 geschlossen: Missing entfernt Summary/Activity, erhält private Organisation
  und verhindert alte Wiederbelebung. Neuer nativer/REST-Stand wird nicht durch
  alte Missingantwort gelöscht. Wiederverfügbarkeit und unbekannte Counts stimmen.
- R2-M3 geschlossen: reale terminale Teilseite bei offset=4900 mit hasMore=true,
  nextOffset=null wird übernommen und beendet Folgereads. Vollständige Grenzseite
  wird nicht fälschlich partial; vorzeitiger Nullfortschritt bleibt Fehler.
- R3-M1 geschlossen: eigene bestätigte Projektmitgliedschaft bleibt trotz
  allgemeinem oder anderem Projektkatalog mit derselben CWD und Lookup mit
  projectId=null erhalten. Labels bleiben im Ownerkontext. CWD-Wechsel/Missing
  entwerten dauerhaft bis zur eigenen Neubestätigung. Alte Projektantwort nach
  Missing/Wiederverfügbarkeit, P→Q→P oder Unmount/Reacquire bestätigt nichts neu.
  Neubestätigung eines Owners bestätigt den anderen Owner nicht mit.
- R3-M2 geschlossen: alte Membership-409 schreiben weder bei Flag-off noch Off/On
  in geleerten/neuen State. Catch/Finally und wartender Membershipreset sind
  zyklusgebunden. Aktuelle 409 übernehmen weiterhin Stand, Pinrevision und Fehler.
  Die unten genannten Fortsetzungen liegen in anderen, noch ungebundenen Pfaden.

## R4-H1: Pinvorbereitung läuft nach Flag-off endlos in Microtasks

**Severity: High. Ort:** organization-actions.ts:50 bis :53, insbesondere :52;
Abbruchpfad organization-queries.ts:90, :112 und :121.
Repro: temp/hermes-v2/phase4-client-review/r4-reorder.test.ts:19.

Über die echte Sidebaraktion preparePinnedReorder einen Membershipread starten,
dessen Antwort halten. Flag ausschalten, danach den alten Read auslaufen lassen.
Dispose leert den State; seine leere Pinmitgliedschaft hat hasMore=true und
complete=false. Der alte Membershipread beendet sich ohne Fehlerweitergabe, weil
sein Zyklus ungültig ist. Erwartet: Die alte Vorbereitung endet ebenfalls.

Ist: Die while-Schleife prüft weder Owner noch Zyklus oder enabled. pinsComplete()
bleibt false, hasMore bleibt true. Jeder folgende members-Aufruf bei Flag-off
liefert sofort eine erfüllte Promise, ohne den Zustand zu ändern. Die Schleife
setzt sich deshalb unbegrenzt als Microtaskkette fort und kann den UI-Thread
blockieren. Weder HTTP-Timeout noch ein weiterer UI-Klick beendet diese Kette.

Der Repro delegiert die ersten 16 deaktivierten Iterationen an den unveränderten
Originalpfad und bricht ausschließlich beim 17. Aufruf mit einem Testwächter ab.
Die gesunde Assertion erwartet null, beobachtet 17. Kein HTTP-/Clientresultat wird
ersetzt; der Wächter verhindert nur einen hängenden Testprozess. Das unbegrenzte
Weiterlaufen folgt aus der unveränderten Schleifenbedingung und dem echten No-op.
Aktuelle vollständige Pinliste und aktueller HTTP-Fehler funktionieren im Gegenteilfall.
Fixrichtung: Vorbereitung vor jeder Folgeseite an ihren ursprünglichen gültigen
Owner/Zyklus binden und bei Abbruch beenden, ohne Mutationsretry.

## R4-M1: alte zusammengesetzte Reads starten im neuen Zyklus weiter

**Severity: Medium. Orte:** organization-queries.ts:71 bis :74,
organization-runtime.ts:165 und organization-actions.ts:31 bis :34.
Repros: r4-lifecycle.test.ts:30, :43, :56 und :67 im temporären Verzeichnis.

Zwei überlappende Metadatenreads derselben ID starten, der zweite mit fresh=true.
Nach abgeschlossenem Bodyread, aber vor dessen Promisefortsetzung aus-/einschalten
und neu erwerben. Erwartet: Wartende Arbeit des alten Zyklus endet. Ist: Nach
await existing erfasst metadata erst den inzwischen neuen Zyklus samt neuem
Signal, sendet erneut die alte ID und übernimmt deren private Metadaten. Bei
sechs benachbarten Microtaskgrenzen entstehen ein zusätzlicher GET und pinRank=0
für old-only, obwohl diese ID im neuen Katalog/Membership nicht vorkommt.

Derselbe Fehler ist ohne direkten Queryaufruf belegt: native Summary für old-only
plus gültiges metadata.invalidated während des Metadatenreads, danach Off/On.
Die alte Warteschlange lädt old-only im neuen Zyklus und übernimmt dessen Pin.
Kein Cross-Principal-Leak behauptet, belegt ist die verletzte Lifecyclegrenze.

Zusätzliche Auslöser derselben fehlenden Bindung: flushInvalidations startet nach
seinem alten await metadata einen Lookup mit dem neuen Runtime-Signal. Ein alter
Sidebar-refresh läuft nach verworfenem Katalog weiter und sendet drei zusätzliche
Membershipreads in den bereits vollständig neu geöffneten Zyklus. Diese Pfade
haben vor ihren Folgeaufrufen ebenfalls keine ursprüngliche Zyklus-/Ownerprüfung.

Dauerhaftes Flag-off bleibt in den ergänzenden Metadata-/Refreshfällen ohne HTTP
und private Übernahme. Im unveränderten Zyklus wird der ausdrücklich frische
Metadatenread weiterhin korrekt ausgeführt. Fixrichtung: gesamte Readkette schon
vor dem ersten Await binden und nach jedem Await vor neuem Send prüfen. Eine neue
untergeordnete Funktion darf veraltete Arbeit nicht als aktuellen Zyklus übernehmen.

## Selbst ausgeführte Checks

- 17 gezielte Featuredateien: **178/178 grün**, einschließlich aller 88 Phase-3-
  Regressionen und 24 R3-Autorenfälle. Ausgabe: r4-feature-tests.txt.
- Alle bisherigen vier externen Dateien unverändert vor neuen Repros ausgeführt:
  **47/47 grün**. Ausgabe: r4-external-before.txt.
- Drei eigene R4-Dateien: **41 Fälle, 25 grün, 16 rote gesunde Assertions** zu den
  zwei neuen Ursachen. Sieben neue Projekt-/Grenzfälle sind sämtlich grün.
- Gesamter externer Lauf: **72 grün, 16 rot, 88 Fälle**. Kommando:
  `pnpm --filter @wrapt/web exec vitest run --config ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
  Ausgabe: temp/hermes-v2/phase4-client-review/r4-results.txt.
- Vollständiges `pnpm typecheck`: grün einschließlich Contracts/Server/Web/E2E;
  Ausgabe r4-typecheck.txt. Dies ist kein Backendgate.
- Gezieltes ESLint aller nonvisuellen Sidebar-/Organisation-/Chat-/Gatewaymodule
  und Chat-/Sidebarhooks samt Tests mit --max-warnings=0: grün, r4-lint.txt.
- `pnpm architecture:file-lines`: grün, auch nach Bericht; r4-architecture.txt.
  Bericht <=170 Zeilen; eigene Reprofile jeweils unter 400 Zeilen.

Streamgrenze, gemeinsame Uhr/Undo, 101 Pins unter Suche, GET-Invalidierungsrace,
StrictMode, keine Token-Neusortierung, exakte sichtbare Readmengen und hängendes
A neben eigenem B/B2 bleiben in den ausgeführten Fällen grün. Eigener 8200er-Fall
bestätigt begrenzte Metadaten/Missing-/Locationmarker und vollständigen Reset.
Die zwei neuen Fehler benötigen Korrektur und frischen Recheck. Browserbelege,
Backendgate und Versionierung der Gesamtintegration bleiben im getrennten Scope.

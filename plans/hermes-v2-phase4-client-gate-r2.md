# Hermes V2: unabhängiges Phase-4-Client-Gate R2

Stand: 16.10.2026. **Urteil: needs fixes. Drei offene Medium-Findings.**
Die fünf ursprünglichen Gegenfälle sind grün. Vier neue rote gesunde Assertions
belegen die drei unten genannten Ursachen. Kein konkret nachgewiesenes High-Finding.
Kein Gesamtfeature-, Backend-, UI- oder Browser-PASS.

## Prüfgrenze und Verfahren

Frische Prüfung des erneut eingefrorenen nonvisuellen Phase-4-Webscopes:
sidebar-types/resolver/dnd/time/preferences/empty, organization-client/response/
policy/owner/state/queries/actions/runtime, useHermesV2Sidebar, chat-read-evidence
und notwendige Chat-/Store-/Owner-/Gatewaypfade samt Tests.

AGENTS.md und sprachstil angewandt. Originalbrief besonders Kapitel 5, 11 bis 13,
Phase 4, Tests und DoD sowie organisation-handoff, evidence-gate-r4,
phase4-interface-decisions, phase4-web-implementation und phase4-client-fixes gelesen.
Die jüngsten Interfaceentscheidungen gelten. Phase-3-Gates R1/R2/R3 und deren
Fixantworten berücksichtigt. Der Phase-3-R3-PASS bleibt im damaligen Scope erhalten.

Server/Contracts ausschließlich zum Verständnis gelesen. Keine Servertests oder
Backendfreigabe. Keine Komponenten-/CSS-/Observerbewertung, Dienste, Browser,
Ports, Nutzersessions, Previews, echten Coremutationen, Commits, Pushes oder Agents.
Keine Produktdateien geändert. Ursprünglicher Gatebericht und die 13 externen
Repros unverändert gelassen. Eigene neue Repros und Prüfausgaben ausschließlich
unter `temp/hermes-v2/phase4-client-review/`; einziger neuer dauerhafter Bericht hier.

## Recheck der vier ursprünglichen Ursachen

- M1 geschlossen: `chat-messages.ts:59` übernimmt erneuerte ältere Projektionen
  vollständig. Offset-1-Fall und neue UID-Kopie mit anderer Row-ID bestehen.
  Vor eigenem sichtbarem B-Callback genau ein Readversuch, danach genau zwei:
  fehlgeschlagenes A plus erfolgreiches B. Auch ein alter Generationscallback mit
  B bestätigt nichts. Eine bei Auswahlwechsel ausstehende Erneuerung wird verworfen.
- M2 im ursprünglichen sequentiellen Ablauf geschlossen:
  `organization-queries.ts:100` lädt bekannte Membership-IDs bei Refresh erneut;
  Invalidierung verwendet denselben Pfad. Beide externen Gegenfälle bestehen,
  ohne zusätzliche Chatlease. Neue parallele/fehlende Ergebnisse siehe R2-M1/M2.
- M3 geschlossen: `organization-runtime.ts:102` vergleicht mit eigenem zuletzt
  konsumiertem nativen Stand. Unverändertes A bleibt bei REST-Aktualisierung und
  anschließendem neuen B korrekt. Reine Listen-Loadingänderungen erzeugen keine
  native Beobachtung. Echte native Änderungen gewinnen weiterhin gegen alte RESTreads.
- M4 geschlossen: `organization-client.ts:103` bindet erfolgreiche Reorders an
  die eindeutige vollständige Zielmenge. Fremde/fehlende/zusätzliche/doppelte IDs
  werden vor Metadaten/Undo als PROTOCOL_MISMATCH/unknown verworfen. Andere Reihenfolge
  und leere passende Menge funktionieren; 409 darf abweichende aktuelle Pins liefern.

Alle sechs Autorenregressionen wurden in den 144 Featuretests selbst ausgeführt:
Offset-1-Erneuerung, beide Membership-Refreshanlässe, unverändertes natives A,
fremde Reorderantwort im echten Aktionspfad sowie vollständige Reorder-/409-Mengen.

## R2-M1: älterer paralleler Lookup überschreibt frisch erneuerten Stand

**Severity: Medium. Orte:** `organization-queries.ts:104` und
`organization-state.ts:42`, insbesondere :46 und :51. Pfade jeweils unter
`apps/web/src/components/hermes/v2/`.
Repro: `temp/hermes-v2/phase4-client-review/r2-counterexamples.test.ts:71`, zwei Fälle.

Altes Pinmitglied außerhalb der ersten Katalogseite laden. Expliziten Membership-
Refresh starten und dessen Lookup mit alter Summary/idle zurückhalten. Danach
metadata.invalidated empfangen; dessen zweiter Lookup liefert Frisch/waiting_input.
Die Sidebar zeigt den neuen Stand korrekt. Erst jetzt den alten Lookup freigeben.

Erwartet: Der nach Invalidierung erneuerte Stand und Needs-input-Vorrang bleiben.
Ist: Titel springt immer auf Veraltet zurück. Bei gleichem observedAt in derselben
Millisekunde überschreibt auch idle den neuen Requestzustand, Gruppe wird Pinned.
Bei 10 ms Abstand bleibt Needs input erhalten, der Titel wird trotzdem zurückgesetzt.
Kein neues natives Ereignis und kein Owner-/Flagwechsel sind dafür nötig.

Die Beobachtungsbarriere schützt nur native Änderungen. Parallele REST-Lookups
haben dieselbe Beobachtungsrevision; Summarys besitzen keine eigene Readbarriere,
Activity akzeptiert außerdem Gleichstand. Fixrichtung: begrenzte pro-ID-Ordnung
beziehungsweise Invalidierungsbarriere für konkurrierende Summary-/Activityreads,
auch zwischen Lookup und Katalog. Native Barriere und keine Mutationsretries erhalten.

## R2-M2: missingSessionIds lassen alte Summary und Requestactivity stehen

**Severity: Medium. Ort:** `organization-queries.ts:105` bis :107.
Repro: `temp/hermes-v2/phase4-client-review/r2-counterexamples.test.ts:90`.

Bekanntes altes Pinmitglied mit Titel Gelöscht und waiting_input laden. Anschließend
liefert dessen ausdrücklicher Refresh sessions=[], activity={}, missingSessionIds=[old].
Das entspricht dem vorhandenen Lookupvertrag für eine nicht mehr lesbare Core-Sitzung.
Erwartet: Private Organisation bleibt; der fehlende Summarystand wird ehrlich als
ID-Ersatz und unbekannte Activity gezeigt, solange kein neuerer Beleg vorliegt.
Ist: missingSessionIds werden ignoriert. Alter Titel, missingSummary=false und
waiting_input/Needs input bleiben auch nach erneutem ausdrücklichem Refresh stehen.

Das ist weder eine ungeladene Seite noch ein erfundener neuer Request: Der konkrete
Lookup ist abgeschlossen und meldet fehlende Abdeckung. Fixrichtung: solche IDs
unter denselben Generation-/Beobachtungsbarrieren aus Summary/Activity entwerten
oder ausdrücklich als veraltet/unbestätigt kennzeichnen. Keine privaten Metadaten
löschen und keine inzwischen neu belegten nativen Informationen verwerfen.

## R2-M3: letzte echte Katalogseite wird am 5000er-Limit verworfen

**Severity: Medium. Orte:** `organization-client.ts:62` und
`organization-queries.ts:29`. Vertragsabgleich ausschließlich lesend mit
`apps/server/src/hermes/v2/organization/catalog.ts:63`.
Repro: `temp/hermes-v2/phase4-client-review/r2-counterexamples.test.ts:135`.

50 Seiten zu 100 explizit laden. Die letzte Antwort hat offset=4900, limit=100,
hasMore=true, nextOffset=null, coverage=partial und eine echte letzte Summary.
Genau diese Kombination liefert der Server bei mehr als 5000 Core-Sitzungen:
weitere Daten existieren, dürfen aber jenseits der Tiefengrenze nicht geladen werden.

Erwartet: letzte Seite übernehmen, limitReached/partial=true, hasMore=false im
Client und keinen weiteren Read anbieten. Ist: PROTOCOL_MISMATCH vor Übernahme;
letzte Rows fehlen, nextOffset bleibt 4900 und limitReached=false. Der Benutzer
kann dieselbe abgewiesene Seite erneut laden. Beide genannten Guards lehnen null ab.

Der bisherige grüne externe Limitfall liefert nextOffset=5000 und trifft diese
reale Antwortform deshalb nicht. Fixrichtung: terminale Teilabdeckung an der
bestätigten Tiefengrenze akzeptieren, Fortschrittsfehler vor der Grenze weiter ablehnen.

## Selbst ausgeführte Prüfungen

- Gezieltes Vitest der 14 fachlichen Featuredateien: **144/144 grün**, einschließlich
  aller 88 Phase-3-Fälle und sechs neuen Autorenregressionen.
- Bisherige externe edges/healthy vor Hinzufügen neuer Fälle: **13/13 grün**.
- Zehn neue unabhängige R2-Fälle: **6 grün, 4 rote gesunde Erwartungen**.
  Gesamter externer Lauf jetzt **19 grün, 4 rot** in drei Dateien. Kommando:
  `pnpm --filter @wrapt/web exec vitest run --config ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
  Ausgabe: `temp/hermes-v2/phase4-client-review/r2-results.txt`.
- Vollständiges `pnpm typecheck`: grün, einschließlich Contracts/Server/Web/E2E-Typen.
  Ausgabe unter `temp/hermes-v2/phase4-client-review/r2-typecheck.txt`.
- Gezieltes ESLint sämtlicher Sidebar-/Organisation-/Chat-/Gatewaymodule und
  Chat-/Sidebarhooks samt zugehörigen Tests mit `--max-warnings=0`: grün.
- `pnpm architecture:file-lines`: grün, auch nach Hinzufügen dieses Berichts.
  Neue Reprodatei 149 Zeilen, Bericht unter 180 Zeilen. Alle geprüften Dateien <=400.

Streamgrenze, gemeinsame Uhr/Undo, 101 Pins unter Suchfilter, Invalidierung während
GET, StrictMode, keine Token-Neusortierung, exakte Readmengen, hängendes A neben
eigenem Batch B/B2 und Flag-off ohne Leak/Retry bleiben in den ausgeführten Fällen grün.
Die drei neuen Ursachen benötigen gezielte Korrekturen und einen frischen Recheck.
Browserbelege und Backendgate bleiben beim Root und den getrennten Prüfern.

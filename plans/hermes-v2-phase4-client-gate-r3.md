# Hermes V2: unabhängiges Phase-4-Client-Gate R3

Stand: 16.10.2026. **Urteil: needs fixes. Zwei neue offene Medium-Findings.**
Alle ursprünglichen M1 bis M4 und die drei R2-Ursachen sind geschlossen.
Acht neue rote gesunde Assertions belegen die zwei unten genannten Ursachen.
Kein konkret nachgewiesenes High-Finding. Kein Gesamtfeature-, Backend-, UI-
oder Browser-PASS. Der frühere Phase-3-R3-PASS bleibt in seinem Scope erhalten.

## Prüfgrenze und Verfahren

Frische Prüfung des erneut eingefrorenen nonvisuellen Phase-4-Webscopes:
sidebar-types/resolver/dnd/time/preferences/empty, organization-client/response/
policy/owner/state/queries/actions/runtime und neue organization-pagination,
useHermesV2Sidebar, chat-read-evidence und erforderliche Chat-/Store-/Owner-/
Gatewaypfade samt Tests. Pfade unten unter apps/web/src/components/hermes/v2/.

AGENTS.md und sprachstil angewandt. Originalbrief besonders Kapitel 5, 11 bis 13,
Phase 4, Tests und DoD, organisation-handoff, evidence-gate-r4, jüngste verbindliche
phase4-interface-decisions, phase4-web-implementation sowie beide Fixantworten
gelesen. Phase-3-Gates R1/R2/R3 und deren Fixantworten berücksichtigt.

Server/Contracts ausschließlich lesend zum Vertragsverständnis verwendet.
Keine Servertests oder Backendfreigabe. Keine Bewertung von Komponenten, CSS,
realen Observern oder Browserintegration. Keine Dienste, Browser, Ports,
Nutzersessions, Previews, echten Coremutationen, Commits, Pushes oder Agents.
Keine Produktdateien oder bisherigen Gateberichte geändert. Die 23 vorhandenen
externen Repros unverändert gelassen. Eigene Repros und Ausgaben ausschließlich
unter temp/hermes-v2/phase4-client-review/. Einziger neuer dauerhafter Bericht hier.

## Altfindings unabhängig geschlossen

- R1-M1: erneuerte Offset-1-History übernimmt neue Projektion und Beleg. Eigener
  zusätzlicher Fall mit derselben UID, anderer physischer Row-ID und anderem Text
  erhält Reihenfolge und ersetzt vollständig. Vor eigenem sichtbarem B-Callback
  genau ein Readversuch; alter Generationscallback liest B nicht; aktueller
  sichtbarer B-Callback ergibt genau zwei Versuche, fehlgeschlagenes A plus B.
- R1-M2: bekannte Mitglieder außerhalb der ersten Katalogseite erhalten beim
  ausdrücklichen Refresh und metadata.invalidated neue Titel und Requestactivity.
  Keine weitere Chatlease. Beide ursprünglichen externen Gegenfälle bestehen.
- R1-M3: unveränderte native A-Row setzt neueren REST-Stand beim Hinzufügen von B
  oder bei Listen-Loadingänderungen nicht zurück. Echte neue native Beobachtungen
  bleiben gegenüber verspäteten RESTreads geschützt.
- R1-M4: erfolgreiche Reorders verlangen die eindeutige vollständige Zielmenge.
  Fremde, doppelte, fehlende und zusätzliche Items werden vor Metadaten/Undo
  verworfen. Andere Reihenfolge, leere passende Menge und abweichende 409-Menge
  bleiben erlaubt. Kein automatischer Mutationsretry.
- R2-M1: lokale Readordnung schützt neueren Lookup bei 0 und 10 ms Abstand sowie
  beide Gegenordnungen Lookup/Katalog. Eigene Gegenteilfälle bestätigen: solange
  der neuere Read aussteht oder scheitert, darf ein älterer erfolgreicher Read
  weiterhin den letzten belegten Stand liefern.
- R2-M2: Missing entwertet Summary und Activity, erhält private Organisation und
  blockiert ältere Wiederbelebung. Alte Missingantwort löscht weder neueren REST-
  noch nativen Stand. Wiederverfügbarkeit und ehrliche unbekannte Activity bleiben
  erhalten. Eigener Grenzfall bestätigt begrenzte Missingmarker bis 8200, sichtbaren
  Überlauf und vollständigen Reset. Lookup verlangt die vollständige Partition.
- R2-M3: reale letzte partielle Seite mit offset=4900, hasMore=true und
  nextOffset=null wird vollständig übernommen; keine weiteren Reads. Vorzeitiger
  Nullfortschritt und widersprüchliche vollständige Grenzseite bleiben Fehler.
  Eigener Gegenteilfall mit vollständiger Seite an der 5000er-Grenze endet ohne
  falsches partial/limitReached. Die alte nextOffset=5000-Variante bleibt grün.

Alle sechs R1-Autorenregressionen und zehn R2-Autorenregressionen selbst ausgeführt.

## R3-M1: fremder Readkontext entfernt bestätigte Projektkatalogtreffer

**Severity: Medium. Orte:** organization-state.ts:56, organization-queries.ts:48
und organization-runtime.ts:185. Repros: r3-lifecycle.test.ts:114 und :126
im genannten temporären Verzeichnis.

Eine Sidebar mit projectId=known erhält A aus ihrem serverseitig validierten
Projektkatalog. Anschließend lädt eine zweite, allgemeine Sidebar dieselbe ID.
Deren gültige Summary hat projectId=null. Erwartet: A bleibt im bestätigten
Projektkatalog sichtbar. Ist: der gemeinsame Sessioncache ersetzt das komplette
Objekt, anschließend entfernt der Projektfilter A. loadedCount bleibt trotzdem 1.

Ein zweiter Repro benötigt keine zweite Fläche: Nach bestätigtem Projektkatalog
führt metadata.invalidated für A zum bekannten Summary-Lookup. Dieser liefert
gültig projectId=null; dieselbe Projektrow verschwindet. Private Pinmetadaten
werden dabei korrekt übernommen, die Row wird trotzdem herausgefiltert.

Das Antwortformat ist real: serverseitig setzt organization/catalog.ts:55 die
angefragte Projekt-ID, während lookup in :74 über normalizeSession ohne vorherige
Projektion projectId=null liefert; pool.ts:34 ergänzt keine Projektzuordnung.
Keine Backendfreigabe daraus abgeleitet. Ein frischerer Read eines anderen
Kontexts beweist keine Aufhebung der bestätigten Projektmitgliedschaft.
Fixrichtung: validierte Projektzugehörigkeit an ihren Anfrage-/Ownerkontext binden;
ein gemeinsames requestabhängiges projectId eignet sich nicht als Filterbeleg.
Aktuelle CWD-/Projektwechsel weiterhin korrekt entwerten beziehungsweise prüfen.

## R3-M2: alte Membership-Konflikte schreiben nach Flag-off in geleerten State

**Severity: Medium. Orte:** organization-queries.ts:95 bis :98;
organization-client.ts:37 verarbeitet 409 vor seinem Abortguard in :49.
Repros: r3-lifecycle.test.ts:151 und :164 im temporären Verzeichnis.

Membership-Refresh über echten OrganizationClient mit schemagültiger HTTP-409-
Konfliktantwort starten. An drei benachbarten Promisegrenzen während Verarbeitung
Flag ausschalten. dispose leert den State nachweislich. Anschließend den alten
Read auslaufen lassen, Flag bleibt aus. Erwartet: State bleibt leer und alte
Antwort hat keine Nebenwirkung. Ist: metadata.size steigt wieder von 0 auf 1;
alte private Pinmetadaten werden übernommen, Mitgliederzustand wird zurückgesetzt.
Kein neuer Request wird benötigt. Der Repro ersetzt keine Client-/Querymethode.

Der Erfolgspfad prüft cycle nach Await. Der Catchpfad übernimmt dagegen jeden
OrganizationConflict samt Serverzeit und resetMembers ohne dieselbe Barriere.
Ergänzender sofortiger Off/On-Fall zeigt die Übernahme auch in einen neuen Zyklus;
drei entsprechende Assertions scheitern ebenfalls. Kein realer Cross-Principal-
Leak behauptet. Nachgewiesen ist die fehlende Lifecyclegrenze für private Daten.
Fixrichtung: auch Fehler-/Konfliktnebenwirkungen vor jeder Zustandsänderung an
den erfassten gültigen Zyklus binden. Gültigen Konflikt im unveränderten Zyklus
weiter übernehmen; dieser zusätzliche gesunde Gegenteilfall besteht bereits.

## Selbst ausgeführte Checks

- Gezieltes Vitest der 15 fachlichen Featuredateien: **154/154 grün**, einschließlich
  aller 88 Phase-3-Regressionen. Ausgabe: r3-feature-tests.txt unter dem Temp-Pfad.
- Unveränderte externe edges/healthy/R2-Fälle vor neuen Tests: **23/23 grün**.
  Ausgabe: r3-external-before.txt. Neue r3-lifecycle.test.ts enthält 24 Fälle:
  **16 grün, 8 rote gesunde Assertions** zu den beiden neuen Ursachen.
- Gesamter externer Lauf: **39 grün, 8 rot, 47 Fälle**. Kommando:
  `pnpm --filter @wrapt/web exec vitest run --config ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
  Ausgabe: temp/hermes-v2/phase4-client-review/r3-results.txt.
- Vollständiges `pnpm typecheck`: grün, einschließlich Contracts/Server/Web und
  E2E-Typen. Ausgabe: r3-typecheck.txt. Dies ist kein Backendgate.
- Gezieltes ESLint der nonvisuellen Module und Tests mit `--max-warnings=0`: grün.
  Ausgabe: r3-lint.txt. Keine UI-Dateien in diesem Lintscope.
- `pnpm architecture:file-lines`: grün, auch nach Hinzufügen dieses Berichts.
  Ausgabe: r3-architecture.txt. Neue Reprodatei 177 Zeilen, Bericht unter 180.

Streamgrenze, gemeinsame Uhr/Undo, 101 Pins unter Suchfilter, GET-Invalidierungsrace,
StrictMode, keine Token-Neusortierung, exakte sichtbare Reads und hängendes A neben
eigenem B/B2 bleiben in den ausgeführten Fällen grün. Normale verspätete Summary-/
Missingantworten über Off/On bleiben ebenfalls verworfen. Die zwei neuen Ursachen
brauchen Korrektur und einen frischen Recheck. Browserbelege, Backendgate und
Versionierung der Gesamtintegration bleiben im separaten Root-/Autorenscope.

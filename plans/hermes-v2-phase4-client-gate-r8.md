# Hermes V2: unabhängiges Phase-4-Client-Gate R8

Stand: 16.10.2026. **Urteil: PASS ausschließlich im geprüften nonvisuellen Client-Scope.**
R7-M1 und alle früheren konkret nachgewiesenen Clientursachen sind geschlossen.
Keine offenen unabhängig reproduzierten High-/Medium-Findings in diesem Recheck.
Kein UI-, Browser-, Backend-, Gesamtphase-4- oder Gesamtfeature-PASS.
Der Phase-3-R3-PASS bleibt in seinem damaligen Scope erhalten.

## Prüfgrenze und Verfahren

Frischer Recheck der vier eingefrorenen Änderungen organization-queries/state/
runtime/actions und ihrer bestehenden Sidebar-/Owner-/Chat-/Readgrenzen.
Produktpfade unten relativ zu apps/web/src/components/hermes/v2/.
AGENTS.md und sprachstil angewandt. Originalauftrag insbesondere Kapitel 5,
11 bis 13, Phase 4, Tests und DoD, organisation-handoff, evidence-gate-r4,
verbindliche phase4-interface-decisions und phase4-web-implementation abgeglichen.
Clientgates und Autorenantworten R1 bis R7 berücksichtigt; R7-Gate und vollständige
R7-Antwort mit dem aktuellen Commitpunkt und seinen beiden Awaitgrenzen geprüft.

Server/Contracts ausschließlich lesend zum Vertragsverständnis. Keine Servertests
oder Übernahme fremder Backend-/UX-/Browserfreigaben als eigene Evidenz.
Keine Produktdateien, alten Berichte oder alten externen Repros geändert.
Keine Browser, Server, Dienste, Ports, Previews, Nutzerdaten, echten Coreaufrufe,
Gitoperationen oder weiteren Agents. Eigene neue Gegenfälle/Ausgaben nur unter
temp/hermes-v2/phase4-client-review/r8*. Einziger neuer dauerhafter Bericht hier.

## R7-M1 geschlossen

organization-state.ts:29 bis :52 entwertet alle drei Membershiplisten bei akzeptierter
höherer Rowrevision, neu bekannter Organisation oder höherer Pinrevision. Identische
Rows, verworfene ältere Rows und neue unorganisierte Baselines entwerten nicht.
Eigene Seitenmetadaten erhalten den Fehlercursor der gerade bearbeiteten Gruppe.

organization-queries.ts:110 bis :133 erfasst die Entwertung vor dem Members-HTTPread,
prüft bereits neueren Row-/Pinstand und erfasst nach eigenen Metadaten eine zweite
Barriere für den Lookup. Ein überholter Abschluss übernimmt belegte Rows/Summaries,
setzt aber complete=false/hasMore=false/cursor=null. Ein ausdrücklicher neuer
Gruppenread beginnt bei Cursor null und bestätigt die aktuelle vollständige Liste.
Die beiden früher roten externen R7-Assertions bestehen unverändert.

organization-runtime.ts:131 bis :135 entwertet bereits beim echten gültigen
metadata.invalidated. Ein hängender oder fehlerhafter Metadaten-GET kann daher
keinen alten Seitenabschluss mehr legitimieren. Höhere Pinrevisionen aus leerem
aktuellem 409 entwerten über organization-actions.ts:108 bis :111 ebenfalls.

## Eigene R8-Gegenfälle und positive Grenzen

- r8-event-barriers.test.ts, neun Fälle: echte normalisierte Invalidierung einer
  neuen organisierten Row jeweils vor Membersantwort und während Summarylookup,
  für Pins/Snooze/Settled. Metadaten-GET bleibt zunächst ausstehend und scheitert.
  Alter Abschluss bleibt unvollständig, ohne automatische Wiederholung. Explizites
  Nachladen übernimmt beide Mitglieder samt offener Anfrage und Needs-input-Vorrang.
  Bereits vollständig verarbeitete Invalidierung verhindert ebenfalls alte
  Bestätigung; Wiederholung desselben konsumierten Ereignisses bleibt ohne IO.
- r8-pagination-lifecycle.test.ts, 17 Fälle: reguläre 101er-Pagination aller drei
  Gruppen mit eigenen neuen Metadaten/Pinrevisionen beendet jede Seite erst nach
  Backfill, verlangt ausdrückliche Folgeseite und bleibt danach ohne Folgetraffic.
  Invalidierung plus Fehler auf Seite zwei verwirft den alten Folgecursor korrekt;
  ausdrücklicher Retry beginnt bei Seite eins und zeigt den aktuellen Request.
- Leerer gültiger Aktions-409 während Backfill entwertet alle drei Gruppen, übernimmt
  Pinrevision und Fehler, erzeugt kein Undo und genau einen Mutationssend.
  Aktuelle leere Seite kann anschließend ihre eigene höhere Revision bestätigen.
- Ownergeneration/Unmount von A vor Membersantwort oder während Lookup erhält den
  bereits autorisierten gemeinsamen Backfill für B. A lädt keine weitere Seite;
  B kann den entwerteten Abschluss ausdrücklich neu bestätigen. Flag-off und Off/On
  sperren alte Erfolge samt wartendem Reset, private Daten und spätere Folgerequests.

Neue Fälle verwenden echte OrganizationClient-/Runtimepfade mit synthetischen
HTTP-/Gatewayantworten. Keine neuen Methodenmock-Ersetzungen oder Testwächter.
Die 26 dauerhaften R7-Autorenfälle wurden zusätzlich vollständig ausgeführt,
einschließlich alter/identischer Metadaten, Baseline und nichtterminaler Entwertung.

## Alle bisherigen Ursachen bleiben geschlossen

- R1-M1: vollständige ältere Historyprojektion einschließlich frischem Handle.
  Vor eigenem sichtbarem B genau ein Readversuch, danach zwei, fehlgeschlagenes A
  plus B. Alte Auswahl-/Snapshotgeneration bestätigt B nicht.
- R1-M2: bekannte Membershipsummaries/Requestactivity werden bei Refresh und
  Invalidierung erneuert, ohne zusätzliche Chatlease. R1-M3: unveränderte native
  Rows überschreiben neuere RESTdaten nicht; echte native Änderungen bleiben geschützt.
- R1-M4: Reordererfolg verlangt eindeutige vollständige Zielmenge. Fremde, fehlende,
  doppelte und zusätzliche Items werden vor Metadaten/Undo als unknown verworfen.
  Andere Reihenfolge, passende leere Menge und abweichender aktueller 409 bleiben erlaubt.
- R2-M1: monotone per-ID-Readordnung für Lookup/Katalog, auch bei gleicher Uhrzeit;
  älterer Erfolg bleibt bis zum neueren Erfolg erlaubt. R2-M2: Missing entwertet
  Summary/Activity, erhält Organisation und sperrt alte Wiederbelebung. Neuere native
  Belege, Wiederverfügbarkeit, vollständige Lookuppartition und unbekannte Counts bleiben.
- R2-M3: reale terminale 5000er-Teilseite wird übernommen und beendet Folgereads.
  Vollständige Grenzseiten bleiben vollständig, vorzeitiger Nullfortschritt fehlerhaft.
- R3-M1: owner-/anfragegebundene Projektbelege, CWD-/Missingentwertung und eigene
  Neubestätigung bleiben erhalten; gleicher CWD anderer Kontexte schließt nicht aus.
  R3-M2: alte 409/Catch/Finally/Resetketten verändern keinen geleerten/neuen Runtime.
- R4-H1: Pinvorbereitung endet bei Flag-/Ownerabbruch und fehlendem Fortschritt;
  der externe 17-Aufruf-Wächter wird nicht erreicht. R4-M1: Fresh-Singleflight,
  Invalidierung, Refresh, Notices und Readbatches behalten Anfangszyklus/Generation.
  Sortierte JSON-ID-Schlüssel bleiben kollisionsfrei; kein Mutationsretry.
- R5-M1: globale Seite samt Backfill behält ursprünglichen Runtime, individuelle
  Fortsetzungen bleiben ownergebunden. R6-M1: fehlgeschlagener Backfill bestätigt
  keinen Seitenfortschritt; ohne neue Invalidierung bleibt derselbe Fehlercursor
  ausdrücklich erneut ladbar. Unbekannte/veraltete alte Pins erreichen Needs input.

## Selbst ausgeführte Checks

- 22 Featuredateien: **257/257 grün**, darin alle 88 Phase-3-Fälle und alle bisherigen
  Autorenregressionen. Ausgabe: r8-feature-tests.txt im genannten Temp-Verzeichnis.
- Alle 14 bisherigen externen Dateien unverändert: **146/146 grün**,
  r8-external-before.txt. Zwei neue Testdateien: **26/26 grün**. Gesamtlauf:
  **172/172 grün** in 16 Dateien, r8-results.txt. Kommando: pnpm --filter @wrapt/web
  exec vitest run --config ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs
  --reporter=verbose. Einzelbelege: r8-event-results.txt und r8-pagination-results.txt.
- Vollständiges pnpm typecheck grün einschließlich Contracts/Server/Web/E2E-Typen,
  r8-typecheck.txt. Gezieltes ESLint der 58 nonvisuellen Module/Hooks und Tests mit
  --max-warnings=0 grün, r8-lint.txt. Typprüfung ist kein Backendgate.
- pnpm architecture:file-lines grün einschließlich dieses Berichts. Eigene neue
  Dateien unter 400, Bericht unter 150 Zeilen. Ausgabe: r8-architecture.txt.
  SHA-256-Abgleich des Produktscopes, bisherigen Clientberichte/Fixantworten und
  aller Altrepros unverändert; r8-freeze-check.txt. Separate Rootdokumentation liegt
  außerhalb dieses Freezevergleichs. Keine alten Assertions abgeschwächt.

Streamgrenze, gemeinsame Uhr/Undo, Suche, StrictMode, keine Token-Neusortierung,
exakte sichtbare Reads, hängendes A neben B/B2 und begrenzte Caches samt Reset bleiben
in den ausgeführten Fällen grün. Gesamtintegration und Versionierung liegen beim Root.

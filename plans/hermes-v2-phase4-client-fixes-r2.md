# Phase 4: Clientkorrekturen nach Gate R2

Stand: 16.10.2026. Die drei neuen Medium-Ursachen aus
`hermes-v2-phase4-client-gate-r2.md` sind im nonvisuellen Autorenscope korrigiert.
Scope erneut eingefroren. Ein frischer unabhängiger R3-Recheck bleibt erforderlich;
kein Selbstreview-PASS und keine Freigabe von Phase 4 insgesamt.

## R2-M1: parallele Summary-/Activityreads ordnen

`organization-state.ts` verwendet eine gemeinsame lokale Beobachtungsordnung für
native Änderungen und gestartete REST-Summaryreads. Lookup und Katalog erhalten
vor dem Await eine monotone Requestrevision. Je Session wird die zuletzt angewandte
Revision gespeichert; eine ältere Antwort kann weder neuere Summaryfelder noch
neuere Activity überschreiben. Gleich datiertes observedAt ist damit kein Gleichstand
in der Readordnung. Auch neue native Beobachtungen bleiben geschützt.

`organization-queries.ts` übernimmt beide RESTpfade über `applySummaryRead`.
Es gibt keine Mutationswiederholung und keinen zusätzlichen Request durch diese
Ordnung. Die per-ID-Map bleibt auf die bestehende gemeinsame Cachegrenze begrenzt;
Überlauf wird wie bisher sichtbar und ergibt keine ungeprüfte Übernahme.

Eigene Regressionen prüfen zwei parallele Lookups mit 0 beziehungsweise 10 ms
Abstand sowie beide Gegenordnungen zwischen Lookup und Katalog. Jeweils bleibt
der neuere Titel samt belegtem wartenden Zustand nach der alten Antwort erhalten.
Die unabhängigen Fälle für echte native Änderungen und alle R1-Fixes bleiben grün.

## R2-M2: missingSessionIds ehrlich anwenden

Ein abgeschlossener Lookup entwertet angegebene fehlende IDs unter derselben
Beobachtungsordnung: Summary, Activity und abgeleiteter Rowcache werden entfernt.
Private Organisation, Membership und Aufmerksamkeit werden dabei nicht gelöscht.
Die Row zeigt ID-Ersatz, missingSummary=true und unbekannte Activity/Counts.
Eine neue vollständig gelieferte Summary ohne Activity behält ebenfalls keinen
unbelegten alten Requestzustand als scheinbar aktuelle Beobachtung.

Die angenommene Missing-Beobachtung bleibt als begrenzte Revision erhalten.
Ein älterer erfolgreicher Read kann die gelöschte Projektion deshalb nicht wieder
einsetzen. Umgekehrt darf eine alte Missing-Antwort eine inzwischen neuere native
Projektion nicht löschen. Tatsächlich spätere Wiederverfügbarkeit wird übernommen.

`organization-client.ts` verlangt eine eindeutige vollständige Lookupantwort aus
gelieferten Rows und Missing-IDs. Überlappungen, fehlende Zuordnungen und fremde IDs
werden vor Zustandsübernahme als Protokollfehler verworfen. Der Serververtrag und
die öffentliche UI-API bleiben unverändert.

Eigene Regressionen prüfen fehlende bekannte Pinrow samt zuvor wartender Activity,
Erhalt ihrer privaten Organisation, alte Wiederbelebungsantwort, spät eintreffendes
Missing nach nativer Änderung, echte Wiederverfügbarkeit und ungültige Partitionen.

## R2-M3: reale letzte Katalogseite übernehmen

`organization-pagination.ts` beschreibt die bestätigte terminale Teilabdeckung.
Client und Querypfad akzeptieren hasMore=true/nextOffset=null/coverage=partial
ausschließlich an der zentralen 5000er-Tiefengrenze. Die letzte tatsächliche Seite
wird vor der Anzeigegrenze vollständig übernommen. Der Client bietet danach keinen
weiteren Read an und zeigt limitReached/partial, hasMore=false und nextOffset=null.

Vor dieser Grenze bleibt fehlender Fortschritt ein Protokollfehler; eine angeblich
vollständige Seite mit hasMore=true und null-Fortschritt ist ebenfalls unzulässig.
Die bisher unterstützte Grenzantwort mit nextOffset=5000 bleibt funktionsfähig.

Eigene Regression lädt 50 explizite Seiten, übernimmt die letzte echte Row und
prüft ausbleibenden Folgetraffic. Negative Fälle prüfen null vor der Grenze und
die widersprüchliche vollständige Grenzantwort.

## Dateien und Prüfungen

Produktänderungen ausschließlich unter `apps/web/src/components/hermes/v2/`:
`organization-state.ts`, `organization-queries.ts`, `organization-client.ts`,
neue reine `organization-pagination.ts`. Stabile UI-/Hooktypen unverändert.
Neue `organization-read-order.test.ts` enthält zehn positive/negative Regressionen.

- 154/154 Featuretests in 15 Dateien grün: alle 144 Bestandsfälle einschließlich
  der 88 Phase-3-Regressionen sowie zehn neue R2-Autorenfälle.
- Externe 23/23 Repros grün, einschließlich aller 13 Original-/R1- und zehn R2-Fälle;
  keine externe Datei geändert. Kommando: `pnpm --filter @wrapt/web exec vitest run
  --config ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
- Gezieltes ESLint der nonvisuellen Module/Tests mit `--max-warnings=0` grün.
- Vollständiges `pnpm typecheck` einschließlich Contracts, Server, Web und E2E grün.
- `pnpm architecture:file-lines` grün; alle eigenen Dateien unter 400 Zeilen.

Keine UI-/Server-/Contracts-/Root-E2E-Änderungen, Dienste, Browser, echten Requests,
Commits oder zusätzlichen Agents. Versionierungen bleibt gemäß Teilauftrag bei
Root für die gesamte Featureintegration. Keine Phase-5-Arbeit begonnen.

# Phase 4: Backendkorrekturen nach unabhängigem Gate

Stand 16.10.2026. H1 und M1 bis M5 gezielt korrigiert. Produktstand nach den unten
genannten Prüfungen eingefroren; ein frischer unabhängiger R2-Recheck steht aus.
Keine Aussage über UI, Browserlauf oder das gesamte Feature.

## Reproduktion und Kontrollen

Den vollständigen Gate-Bericht sowie beide Gegenbeispielskripte und die positiven
Kontrollen gelesen und vor der Änderung unverändert selbst ausgeführt.
`counterexamples.ts` und `manager-counterexamples.ts` beendeten die erfolgreiche
Fehlerreproduktion erwartungsgemäß mit Exit 0. Das war kein gesunder Produktlauf.
Originalskripte und Reviewberichte sind unverändert.

Die gesunden Gegenassertionen stehen jetzt dauerhaft in
`apps/server/src/hermes/v2/organization/review-regressions.test.ts` mit elf Fällen.
Die unveränderten vier positiven Reviewgruppen laufen nach der Korrektur weiterhin grün.

## H1: physische Row-Wiederverwendung

Ein erkannter Konflikt hinterlegt eine dauerhafte, inhaltsfreie Sperre für
`(scope,row_id)`. Diese physische ID liefert danach in keiner Sessionprojektion
einen neuen UID-Gleichheitszeugen. Die bisherigen Quellen und privaten ACKs bleiben
erhalten. Der Livepfad prüft dieselbe Sperre vor jedem Row-zu-UID-Alias.

Regressionen prüfen reguläres Subscribe, Snapshot-Read, ersten Abschluss, reguläres
History mit UID-Wechsel und zweiten Abschluss. Die neue Livequelle bleibt ungelesen;
der alte ACK bestätigt weiterhin ausschließlich die alte logische Antwort.
Weitere Kontrollen prüfen DB-Wiederöffnung, eine zweite Sessionprojektion derselben
physischen ID sowie weiterhin gültige andere Row-IDs.

## M1: gemischte History ohne vollständige UID-Abdeckung

Eine sichtbare terminale Assistantantwort ohne gültige UID setzt auch neben gültigen
Rows `identity-unknown/MESSAGE_IDENTITY_MISSING`. Ein inhaltsfreier Signaturnachweis
erfasst gültige UID-Werte und numerische fehlende Rowzeugen; keine Antworttexte.
Der Anchor überspringt die ungeklärte Row nicht.

Wiederholte identische Lücken bleiben revisionsstabil, zusätzliche ungeklärte Rows
ändern die Abdeckung. Erst ein tatsächlicher vollständiger UID-Beleg erlaubt einen
Fakt. User-, Toolcalling- und versteckte Zwischenrows erfinden keinen Abschluss.

## M2: EQUAL-Kanonisierung

`equality.ts` bildet ausschließlich bewiesene EQUAL-Komponenten ab. Factlookup,
ACK-Lookup, SQL-View und Readresultat verwenden dieselbe Identität. Beim Verbinden
bereits vorhandener Fakten bleibt der älteste logische Fakt mit ID/Cursor bestehen;
stärkerer Livebeleg ergänzt seinen Typ. COVERS wird niemals traversiert.

Der echte Managerfall mit zwei separaten Sequenzen derselben bestätigten finalen
Row/UID behält einen Fakt, den privaten Read und den effektiven Settle-Stand.
Zusätzliche Kontrolle verbindet zwei schon vorhandene Fakten über einen gemeinsamen
Zeugen und prüft erhaltene Identität, getrennte Owner und nicht gelesene COVERS-Ziele.

## M3: Wiederverfügbarkeit aller bestätigten Projektionen

Wieder verfügbarer exakt gleicher Inhalt aktualisiert alle bestätigten
Source-/Sessionprojektionen seiner EQUAL-Identität und invalidiert deren Views.
Eine kleine zusätzliche SQLite-Tabelle hält die Verfügbarkeitsrevision je Projektion;
unterschiedliche Root-/Tip-Revisionszahlen werden nicht miteinander verglichen.
Neue CONTENT_AVAILABLE-Signaturen wecken auch bei zwei aufeinanderfolgenden Quellen.

Der öffentliche Servicepfad mit Replay-Eviction, Root-/Tip-Snooze, verspäteter exakter
Originalprojektion und Read bestätigt: beide bleiben ohne neue Aktion dauerhaft wach.
Kontrollen prüfen unterschiedliche Revisionszahlen, erneut wirksames bewusstes Snooze
und einen weiteren Wiederverfügbarkeitswechsel nach diesem Snooze.

## M4: private ACK-Invalidierung

Ein neuer ACK sammelt alle bestätigten Sessionprojektionen seiner EQUAL-Identität
und berührt jede einmal, ausschließlich für den handelnden Owner. Die gewünschte
Sessionrevision bleibt der Responsebezug. Fremde ACKs/Metadaten werden nicht geändert.

Die Regression friert den Tiphandle bereits vor Bestätigung der Lineage ein,
verbindet danach beide UID-Quellen und prüft Root-/Tip-Unread, beide eigenen
Revisionen sowie exakt zwei eigene Invalidierungen. Der zweite Owner bleibt ungelesen
und revisionsgleich. Die alte Handlemenge wird nicht erweitert.

## M5: abgeschnittene Katalogseite

`hasMore` vergleicht die tatsächlich erlaubte native Seitentiefe mit `total`.
Bei Offset 4950, Limit 100 und total 5025 bleiben 50 gelieferte Rows deshalb partial,
mit `hasMore=true` und `nextOffset=null` am unveränderten 5000er-Limit.
Die positive Gegenprobe total 5000 bleibt korrekt vollständig. Kein weiterer Scan.

## Dateien und Prüfung

Geändert ausschließlich Organisation-Backend: `schema`, `sources`, `projection`,
`repository`, `views`, `acks`, `reconcile`, `catalog`; neu `equality` und die Regressionen.
Contracts, Web, Root-E2Es, Manager und Appregistrierung unverändert; Manager 395 Zeilen.

- Gezielte neue Regressionen: 11/11 grün.
- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 315/315 grün in 29 Dateien,
  einschließlich aller 304 bisherigen Hermesfälle.
- Unveränderte `positive-controls.ts`: vier gesunde Prüfgruppen grün.
- `pnpm typecheck`: grün; nach letzter Ergänzung Server-Typecheck erneut grün.
- `pnpm --filter @wrapt/server exec eslint src/hermes/v2 --max-warnings=0`: grün.
- `pnpm architecture:file-lines`: grün, keine Baseline erhöht, alle neuen Dateien unter 400.

Nur Fakes und eigene temporäre SQLite/Loopbackressourcen verwendet und geschlossen.
Keine echten Coreaufrufe, Dienste, Browser, Nutzerdatenbanken, Gitoperationen oder Phase 5.
Produktfreeze gilt ab diesem Abschluss; Root kann den unabhängigen R2-Recheck starten.

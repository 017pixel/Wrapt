# Phase 4: kombinierte Coverage nach Backendgate R3

Stand 16.10.2026. R3-M1 gezielt korrigiert. Physischer Alias-/ACK-Schutz und
vorherige M1-bis-M5-Korrekturen bleiben erhalten. Produktstand nach den genannten
Checks wieder für einen frischen unabhängigen Recheck eingefroren.

## Reproduktion

Gate R3, neues Gegenbeispiel sowie gesunde R3-Kontrollen vollständig gelesen.
`r3-additional-counterexamples.ts` vor dem Fix selbst unverändert ausgeführt:
Exit 0 bestätigte Revision 1 trotz zusätzlicher UID-loser Antwort und weiterhin
effektiven Settle. Dieses Ergebnis war Fehlerreproduktion, kein gesunder Testlauf.
Externe Skripte und sämtliche alten Berichte wurden nicht geändert.

## Korrektur

Physische Konflikte und zusätzliche ungeklärte Antwortmaterialien behalten getrennte,
inhaltsfreie persistente Mengen. Die kleine neue Tabelle `hermes_v2_missing_identities`
enthält nur Scope, Session und validierten numerischen Rowbezug; bei fehlender Row-ID
einen begrenzten Positionsbezug. Sie speichert keinen Inhalt, Hash eines Textes,
Completion-Fakt oder ACK.

`identity-coverage.ts` bildet aus beiden Materialmengen dieselbe zusammengesetzte
Coverage-Signatur. Sowohl der physische Sourcespfad als auch der Reconciler verwenden
sie. Sources kann dadurch die Missing-Komponente nicht mit seiner Teilsignatur
überschreiben. Der Reconciler kehrt beim bekannten Rowkonflikt nicht mehr vor der
Prüfung neuer UID-loser Materialien zurück.

Eine bereits physisch gesperrte Row zählt nicht nochmals als neue UID-Lücke.
Wiederholtes Beobachten desselben Materials verändert die Mengen nicht. Ein neuer
physischer Konflikt oder eine zusätzliche UID-lose terminale Assistantrow verändert
dagegen die gemeinsame Signatur und erhöht die Coverage-Revision.
Die diagnostische Reason bleibt bei physischem Konflikt `ROW_IDENTITY_CHANGED`,
seine Existenz verdeckt aber keine weiteren beobachteten Identitätsmängel.

Die Mengen werden weder durch Organisieren noch durch Read oder DB-Neuöffnung
zurückgesetzt. Damit weckt neue Abdeckung dauerhaft; ein ausdrückliches erneutes
Snooze/Settle kann den dann bekannten Stand wieder organisieren.
Die zusätzliche Materialbeobachtung autorisiert keinen Read und errät keinen Abschluss.

## Dauerhafte gesunde Regressionen

Vier neue Tests in `organization/identity-coverage.test.ts` prüfen:

- Exakter R3-Gegenfall: Baseline A/B, physischer Konflikt C, Settle, neue UID-lose
  Row 4. Coverage steigt, Settle wird unwirksam, Attention bleibt nach Read und
  identischen Folgescans; Faktenzahl bleibt null und alte ACKs bleiben privat erhalten.
- Umgekehrte Reihenfolge: zuerst UID-Lücke, dann physischer Konflikt. Erneutes
  Snooze wirkt bei Null/A/C-Wechsel derselben gesperrten Row; Row 5 weckt neu.
- DB-Wiederöffnung, umgeordnete beziehungsweise kleinere Historyseite und Wiederkehr
  bekannter Materialien bleiben stabil. Ein weiterer physischer Konflikt weckt erneut.
- Zwei zusätzliche UID-lose Rows werden gemeinsam erkannt. Duplikate und UID-lose
  User-/Toolcalling-Zwischenrows erzeugen keine weitere Revision, Fakten oder ACKs.

## Dateien und Checks

Geändert ausschließlich `organization/schema.ts`, `sources.ts`, `reconcile.ts`;
neu `identity-coverage.ts` und `identity-coverage.test.ts`.
Manager bleibt unverändert bei 395 Zeilen. Source-EQUAL/COVERS, private ACK-
Invalidierung, Katalog, API, Contracts, Web, Root-E2Es und Appregistrierung unverändert.

- Neue Kombinationstests 4/4 grün; zusammen mit Rowidentitäts-/Reviewregressionen 21/21.
- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 325/325 grün in 31 Dateien,
  einschließlich aller bisherigen 321 Hermesfälle.
- Contracts-Organisationstests 3/3 grün.
- Unveränderte R2-healthy-counterexamples, R2-healthy-manager und R2-positive-controls:
  fünf, drei und sechs gesunde Gruppen grün.
- Unveränderte ursprüngliche positive-controls sowie R3-healthy-row-identity und
  R3-positive-controls: vier, zwei und drei Gruppen grün.
- `pnpm typecheck`: grün einschließlich Contracts, Server, Web und E2E.
- ESLint für `src/hermes/v2` mit `--max-warnings=0`: grün.
- `pnpm architecture:file-lines`: grün; neue Module 21/117 Zeilen, keine Baseline erhöht.

Keine echten Coreaufrufe, Nutzerdatenbanken, Browser, Dienste, Gitoperationen oder
weiteren Agents. Alle Fakes mit eigenen temporären Datenbanken/Loopbackressourcen
wurden geschlossen. Keine Phase 5. Produktfreeze gilt ab diesem Abschluss.

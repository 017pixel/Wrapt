# Phase 4: H1-Korrektur nach Backendgate R2

Stand 16.10.2026. Die beiden zusätzlich nachgewiesenen H1-Varianten sind gezielt
korrigiert. M1 bis M5 bleiben unverändert geschlossen. Nach den genannten Checks
gilt erneut Produktfreeze bis zum frischen unabhängigen Recheck.

## Vorherige Reproduktion

Gate R2 und `r2-additional-counterexamples.ts` vollständig gelesen. Das unveränderte
Skript vor dem Fix selbst ausgeführt: beide BUG-Assertions mit Exit 0 bestätigt.
Das war erfolgreiche Fehlerreproduktion, kein gesunder Testlauf.
Alle externen Repros, positiven Kontrollskripte und alten Berichte sind unverändert.

## H1a: frühere UID verschwindet

Die physische Rowprüfung läuft jetzt vor dem frühen Return für fehlende/ungültige
UIDs und vor Rollen-/Darstellungsfiltern. Existiert für dieselbe Scope/Row bereits
ein bestätigter UID-Zeuge und die neue Projektion bestätigt keine UID, wird die
vorhandene dauerhafte physische Sperre gesetzt. Der frühere UID-Zeuge kann keine
weitere Eventquelle aliasen. Frühere Quellen und private ACKs bleiben erhalten.

Im regulären History-Ausgabepfad erfolgt diese Identitätsprüfung bereits vor der
Vollständigkeitsprüfung des sichtbaren Textes. Ein Widerspruch wird dadurch auch
bei einer gekürzten oder nicht als Assistant dargestellten Row nicht übergangen.
ReadEvidence entsteht weiterhin ausschließlich nach den bisherigen Vollständigkeits-
und Projektionsprüfungen; eine bloß beobachtete Rawrow ist kein Lesebeleg.

Drei echte Managerregressionen prüfen null, fehlende und ungültige UID:
Subscribe mit Row A, ausdrücklicher Snapshot-Read, erster Abschluss, reguläres
History mit neuer UID-loser Antwort, weiterer Abschluss auf derselben Row.
Die neue Quelle bleibt ungelesen, der alte ACK bei A. Ein zusätzlicher Scan ist
für die Sperre nicht erforderlich. Wiederkehr der alten UID hebt sie nicht auf.

## H1b: widersprüchlicher Zeuge in anderer Session

Vorhandene physische Zeugen werden über `(scope,row_id)` geprüft, nicht nur innerhalb
der aktuellen Session. Eine andere UID in Root, Tip oder einer weiteren Projektion
derselben Profil-DB löst dieselbe permanente Sperre aus. Bereits widersprüchliche
Legacy-Zeugen werden ebenfalls erkannt. Andere Scope/Rows sind davon nicht betroffen.
Ein kleiner SQLite-Index unterstützt diese physische Suche.

Der Managerfall lädt Root/Row A und liest nur diese Antwort. Nach bestätigter
Compression-Lineage lädt Tip erstmals dieselbe physische Row mit UID B.
Der spätere Rootabschluss erhält keinen alten UID-Alias und bleibt ungelesen.
Beide betroffenen Projektionen zeigen die ungeklärte Identität.
Eine andere physische Row bleibt gültig und liefert über eine weitere tatsächliche
Subscribe-Projektion weiterhin einen Readbeleg. Ein anderer Owner erhält keinen ACK.

## Stabilität derselben bekannten Sperre

Eine kleine zusätzliche inhaltsfreie Tabelle hält die je Session bekannten
physischen Konflikte. Coverage verwendet deren monotone Anzahl als Signatur,
nicht die wechselnde UID oder die aktuell gelesene Projektion.
Dies verändert keine Source-Menge und autorisiert keinen MAX-/Cursor-Read.

Alternierende Root-A-/Tip-B-History und zusätzliche Reconciliation verändern die
Coverage-Revision derselben bekannten Row nicht erneut. Null/A/B-Wechsel bleibt
auch nach Settle stabil. Ein tatsächlich weiterer physischer Konflikt erhöht
die Abdeckung und weckt neu. Beide Sperren und die stabilen Revisionen überstehen
DB-Wiederöffnung. Die früheren permanenten Sperren und privaten ACKs werden nicht gelöscht.

Eine weitere echte Managerkontrolle bestätigt den gesunden Fall: dieselbe UID
derselben physischen Row in Root/Tip bleibt gültig und korrekt privat gelesen.

## Dateien und Prüfung

Produktänderungen ausschließlich in `organization/sources.ts`, `projection.ts`,
`schema.ts` und der neuen `row-identity.test.ts`. Manager unverändert 395 Zeilen.
Contracts, API, Appregistrierung, Web und Root-E2Es unverändert.

- Neue dauerhafte Regressionen: 6/6 grün.
- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 321/321 grün in 30 Dateien,
  einschließlich aller bisherigen 315 Hermesfälle und M1-bis-M5-Regressionen.
- Unveränderte `r2-healthy-counterexamples.ts`: fünf gesunde Gegenassertionen grün.
- Unveränderte `r2-healthy-manager.ts`: drei Manager-/Servicegruppen grün.
- Unveränderte `r2-positive-controls.ts`: sechs zusätzliche Kontrollgruppen grün.
- Unveränderte ursprüngliche `positive-controls.ts`: alle vier Gruppen grün.
- `pnpm typecheck`: grün einschließlich Server, Web, Contracts und E2E.
- ESLint für `src/hermes/v2` mit `--max-warnings=0`: grün.
- `pnpm architecture:file-lines`: grün; neue Testdatei 140 Zeilen,
  Sources 78, Projection 107, Schema 68; keine Baseline erhöht.

Nur Fakes mit eigenen temporären Datenbanken und Loopbackressourcen verwendet
und geschlossen. Keine echten Coreaufrufe, Nutzerdatenbanken, Browser, Dienste,
Gitoperationen, weiteren Agents oder Phase 5. Produktstand für unabhängigen Recheck eingefroren.

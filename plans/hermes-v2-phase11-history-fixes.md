# Hermes V2 Phase 11: P11-B3 History-/Snapshotbudget

Stand 18.10.2026. P11-B3 implementiert und gezielt geprüft. Dies ist der
Autorenbericht, kein unabhängiges Schlussgate und kein Gesamtfeature-PASS.

## Auftrag und Scope

AGENTS.md und sprachstil sowie den vollständigen Originalauftrag mit 1687 Zeilen,
`temp/hermes-v2/final-review-findings.md` und
`plans/hermes-v2-phase11-backend-gate.md` vollständig gelesen.
Nur P11-B3 bearbeitet. Keine Subagents, echten Core-/CLI-/Nutzerdatenaktionen,
Dienste, Nutzerpreviews, Gitoperationen, Produktionsbuilds, Restarts oder
Versionsänderungen. Attachment-, resources/context-, Host- und Scopecheckquellen
blieben von dieser Arbeit unberührt. Vorhandene Repros, Assertions und Berichte
nicht verändert. Andere Autoren arbeiten gleichzeitig im gemeinsamen Checkout.

## Verhalten und Umsetzung

Der letzte Browserausgabepfad prüft History, Subscribe-/Create-Snapshots und
Snapshot-Pushes nach vollständiger Maskierung gegen exakt 4194304 UTF8-Bytes des
gesamten JSON-Frames, einschließlich Envelope. Das kleinere Browser-Sendbudget
und alle Clientlimits bleiben unverändert. Keine öffentliche Vertragsänderung.

Bei Übergröße bleiben alle bereits projizierten Nachrichten erhalten. Kleine
Textfelder bleiben vollständig; große Text-, Reasoning- und Inputfelder sowie
Queued-/Inflight-/Korrekturtexte teilen das übrige Budget. Die Quote berücksichtigt
JSONescaping und UTF8; der abschließende Gesamtframe wird erneut gemessen.
Neue Schnitte teilen keine Surrogatpaare und enden mit dem sichtbaren Hinweis
`[Ausgabe wegen Empfangsbudget gekürzt]`. Kürzung ist reine Ausgabeprojektion.
Quellframes, native Messages und gecachte Snapshots werden dabei nicht verändert.

IDs, Row-IDs, logische IDs, Routing, Status, Cursor, Timestamp, Requests und
Anhänge werden nicht aus Budgetgründen entfernt. `offset`, `returned` und
`hasMore` behalten ihre Bedeutung als native Seitenzählung. Die bisherige
Normalisierung einschließlich bestehender Hidden-/Toolprojektion und des
200-Nachrichten-Vertrags wurde nicht um eine neue Zeilenauswahl ergänzt.

Eine Ausgabe mit gekürztem oder durch späte Maskierung verändertem Inhalt trägt
keinen Vollständigkeitslesebeleg mehr: Ein vorhandenes `readEvidence` wird für
diese Row auf null gesetzt; unveränderte kleine Rows behalten ihren Beleg.
Initial gekürzte Historytexte werden bereits bei der Normalisierung markiert
und erhalten dadurch keinen ursprünglichen Volltextzeugen.

Die gezielten Awaittests zeigten außerdem die bisherige frühe Feldbegrenzung im
generischen Finalmaskierer: Bei später Secretkenntnis konnte bereits dort Inhalt
ohne Kürzungshinweis verschwinden. Der fachlich direkte History-/Snapshotpfad
maskiert deshalb seine Felder anhand ihrer tatsächlichen Vertragsgrenzen und
benennt Feldverlust vor dem Gesamtbudgetcheck. Alle anderen Ausgabetypen behalten
ihren bisherigen Maskierungspfad. Originale statische Credentialbereiche und
dynamische überlappende Rawtreffer werden weiterhin vor der Kürzung geschützt.

Falls unverändert benötigte Metadaten allein das Budget aufbrauchen, gibt es einen
kleinen `RATE_LIMITED`-Fehler mit derselben Result-ID, bei Snapshot-Push null.
Requests werden dafür weder still verworfen noch inhaltlich gekürzt. Ein solches
Create-Result meldet konservativ `unknown`, Reads `not_sent`.

## Geänderte und neue Dateien

- `apps/server/src/hermes/v2/browser-output.ts`: finalen History-/Snapshotpfad einhängen.
- `apps/server/src/hermes/v2/normalize-history.ts`: sichtbare Feldkürzung für Text/Reasoning.
- `apps/server/src/hermes/v2/history-output-text.ts`: Rawschutz und Kürzungshinweis.
- `apps/server/src/hermes/v2/history-output-redaction.ts`: fachlich direkte finale Maskierung.
- `apps/server/src/hermes/v2/history-output-budget.ts`: exaktes Empfangsbudget ohne Zeilenverlust.
- `apps/server/src/hermes/v2/history-output-budget.test.ts`: zehn additive Grenzfälle.
- `apps/server/src/hermes/v2/history-output-await.test.ts`: vier additive echte Manager-/Awaitfälle.
- Dieser Bericht.

Eigene Beobachtungsartefakte ausschließlich
`temp/hermes-v2/phase11-history-fixes/`: bytegleiche Repro-/Environmentkopien,
eigene additive `repro-assertions.mts`, Vorher-/Nachher-Ergebnisse und Testlogs.
Alle sieben Produkt-/Testdateien höchstens 101 physische Zeilen.

## Exakte Originalrepros

`history-budget.mts`, `snapshot-budget.mts` und `environment.mts` vor dem ersten
Lauf bytegleich aus `phase11-backend-review/` in das eigene Verzeichnis kopiert.
Jeweils vor und nach dem Fix mit unverändertem tatsächlichem GatewayClient über
FakeSocket und echtem Manager ausgeführt. Keine Registry-/Normalizermocks.
Die alten Repros sind Beobachtungsharnesses; ihre ursprünglichen Assertions
wurden nicht nachträglich umgeschrieben. Eine eigene additive Assertion prüft
die aktuellen Ergebnisse und die Bytegleichheit aller drei Kopien.

Vorher: History maskiert 5005069 Bytes, Subscribe maskiert 5005559 Bytes, jeweils
Client `incompatible`. Gesunde Kontrollen 2505069 bzw. 2505559 Bytes und online.
Native Antwort jeweils 2501668 Bytes, 25 Nachrichten, also gültig unter 4 MiB.

Nachher: History maskiert 4194294 Bytes, Subscribe maskiert 4194284 Bytes,
jeweils Client `online` und weiterhin alle 25 Nachrichten. Die beiden gesunden
Kontrollen bleiben in Größe und Zustand unverändert. Beide Repros belegen
abschließend Timer 0. `repro-assertions.mts`: Exit 0 für alle vier Clientzustände,
Zeilenzahl, Empfangsgrenze, native Gültigkeit und Bytegleichheit.

SHA256 der Originale und eigenen Kopien:

- History: `a1983f0f77a059f53f26c4731371cc229f29b20416e26f69bc9980ace7750c64`
- Snapshot: `6002ee006ab73779e2b2951d6404e6661d3283c7951e8994bab2335f2250317f`
- Environment: `c1970887f8765fa5af171b04a98b28a96076e333505074ba9066d8e3df301f2f`

## Tests und Pflichtchecks

- Kombinierter gezielter Serverlauf: 172/172 Tests in 14 Dateien, Exit 0.
  Enthält die 14 neuen Fälle sowie unveränderte Rawoutput-/Securityoutput-,
  Encoding-/Prefixoverlap-/Streamraw-, Historyidentitäts-, Manager-,
  Organisationsevidence-/Rowidentity-/Reviewregressions-/Identitycoverage-
  und Workfinalbudget-Tests. `tests-final.log` enthält den vollständigen Befehl.
- Die vier neuen Awaitfälle halten den tatsächlichen HOME-lstat nach echtem
  Dashboard-Historyread und Normalisierung. Während der gehaltenen Awaitgrenze
  wird Q über einen echten `request.respond` in einer zweiten synthetischen
  Session desselben Core gelernt. History und Subscribe erhalten alle Row-IDs;
  die kleine Volltextrow behält ihren echten Lesebeleg, gekürzte Rows haben null.
  Frühe Secretkenntnis ist jeweils eine eigene gesunde Kontrolle.
- Zehn direkte Fälle prüfen IDs/Paging/Immutabilität, Subscribe/Create/Push,
  Inflight/Korrekturen, UTF8/JSONescaping, exakt 4 MiB und ein Byte darüber,
  finale Maskenexpansion sowie expliziten Fehler bei gültiger Metadatenüberlastung.
- `pnpm typecheck`: zweimal Exit 0, einschließlich Contracts, Server, Web und E2E.
- Gezielter ESLint über alle sieben Produkt-/Testdateien: Exit 0.
- `pnpm architecture:file-lines`: ausgeführt, Exit 1 ausschließlich wegen fremder
  generierter Dateien unter `temp/hermes-v2/phase11-visual-final-20261018/web-out/`:
  `build-manifest.json` 2299 Zeilen und `assets/noteQueryUpdates-DJNeLNYR.js` 469.
  Diese Artefakte liegen außerhalb meines Scopes und wurden nicht verändert.
- Derselbe Checker mit dokumentiertem `WRAPT_FILE_LINES_ROOT` ausschließlich auf
  `apps/server/src/hermes/v2`, unveränderter Repositorybaseline: Exit 0,
  181 Dateien geprüft. Das ersetzt keinen globalen grünen Check.

Eigene erste neue Tests liefen zunächst 11/14, weil die alte finale Feldkürzung
den neuen Hinweis vermissen ließ. Nach dem fachlichen Fix 13/14: Eine eigene
Cacheerwartung unterschied zunächst nicht zwischen der nun sichtbar markierten
Normalisierungskürzung und der finalen Gesamtquote. Diese neue Erwartung wurde
auf die konkrete Cachelänge und unveränderte Rohdaten präzisiert. Danach 14/14
und im kombinierten Lauf 172/172. Sämtliche Erstlogs bleiben erhalten; keine
bestehende oder fremde Assertion wurde verändert.

## Grenzen und Übergabe

Keine Behauptung einer vollständigen History bei nativen bzw. bereits bestehenden
Normalisierungslücken; keine vollständige Lesebestätigung für gekürzte Inhalte.
Bei reiner Metadatenüberlastung wird bewusst ein begrenzter Fehler statt einer
erfundenen Teilabdeckung gesendet. Das Budget ist die bestehende Empfangsgrenze,
keine allgemeine Latenz-/Speichergarantie. Für normale kleine gültige Ausgaben
ändert sich die Budgetprojektion nicht.

Keine echte Core-/CLI-/Classic-/Browser-Smokeabnahme in diesem Auftrag. Fake-Core
auf OS-vergebenem Loopback-Port, eigene temporäre SQLite-/FS-Fixtures. Die Tests
schließen ihre Pools, WebSockets und Fixturehandles; Originalrepros Timer 0.
Eigene temporäre Test-/Compiler-Caches werden nach Prüfende entfernt. Kein
Nutzerzustand, Port, Slot oder Preview wurde dafür verändert.

Root besitzt weiterhin die unabhängige Nachprüfung von P11-B3, den globalen
Dateigrößencheck nach Bereinigung fremder Testbuild-Artefakte sowie den finalen
realen Hauptturn. P11-B1/B2 gehören dem anderen Autor und werden hier nicht abgenommen.

# Hermes V2 Phase 4: unabhängiges Backend-/Contracts-Gate

Stand: 16.10.2026. **Verdict: needsfixes. Ein High und fünf Medium offen.**
Das Gate gilt ausschließlich für Phase-4-Backend und Contracts. Kein Client-,
Browser-, Laufzeit- oder Gesamtfeature-PASS. Alle sechs Befunde benötigen nach
der Behebung einen frischen unabhängigen Recheck.

## Grundlage und Vorgehen

Originalauftrag gelesen, besonders Kapitel 5, 11 bis 13, Phase 4, Tests und DoD.
Verbindliche Grundlage: organisation-handoff, evidence-addendum, Entwurfs-Gate R4,
phase4-interface-decisions einschließlich letzter Organisationsklarstellung sowie
phase4-backend-implementation. Frühere Transportfreigaben ersetzen dieses Gate nicht.
Alle Organisationsmodule, Contracts und betroffenen Manager-/Session-/Pool-/REST-
Ausgabepfade selbst gelesen. Installierte Hermes-Quellen für Profilkatalog,
Historyprojektion, session.info und active_list ergänzend statisch abgeglichen.

Backend-Fundstellen unten relativ zu `apps/server/src/hermes/v2/organization/`.
Eigene ausführbare Repros und Ergebnisse liegen ausschließlich unter
`temp/hermes-v2/phase4-backend-review/`. Die Skripte prüfen den beobachteten Fehler
mit Assertions; ihr Exitcode 0 bedeutet erfolgreiche Reproduktion, keinen Produkt-PASS.

## H1, High: alter Row-Zeuge liest neue Antwort nach erkannter Row-Wiederverwendung

Fundstellen: `sources.ts:19`, `projection.ts:55`, `repository.ts:125`.
Repro: `manager-counterexamples.ts`, Fall `manager-history-reuse-then-live-complete`.
Über regulären Subscribe-Snapshot Row 1/UID A lesen. Liveabschluss verweist auf Row 1.
Danach liefert reguläres history.read dieselbe physische Row 1 mit neuer UID B.
Der Konflikt wird erkannt, der alte Row-Zeuge A bleibt jedoch gespeichert.
Ein weiterer Liveabschluss der neuen Antwort mit final_assistant_row_id=1 wird
anschließend trotzdem mit A gleichgesetzt. Der alte ACK bestätigt die neue Livequelle.
Ist: `newSourceRead=true`, ohne Darstellung/Read der neuen Antwort; zusätzlich zwei
Fakten im Manager-Repro. Die sichtbare identity-unknown-Lücke verhindert den Alias nicht.
Erwartet: neue Eventquelle bleibt ungelesen und getrennt. Erkannte unzuverlässige
Row-Zuordnung darf keinen Gleichheitsbeweis liefern. Alte ACKs bleiben unverändert.

## M1, Medium: fehlende UID verschwindet zwischen gültigen Historyrows ohne Lücke

Fundstelle: `reconcile.ts:57`, besonders `:70` bis `:75`.
Repro: `counterexamples.ts`, Fall `mixed-missing-uid`.
Baseline enthält Assistant A mit UID. Anschließend dieselbe A plus neue nichtleere
Assistantantwort B, finish_reason=stop, aber ohne message_uid, abgleichen.
Ist: `coverage={state:anchored,revision:0,reason:null}`, keine Attention und kein Fakt.
Eine einzige gültige UID in der Seite genügt hasIdentity; B wird still übersprungen.
Erwartet: kein erfundener Completion-Fakt, aber sichtbare ungeklärte Abdeckung für B.
Die Lückenerkennung und ihr Änderungsnachweis müssen auch gemischte Seiten erfassen.

## M2, Medium: zwei explizite Livebelege derselben UID erzeugen neue Attention

Fundstellen: `sources.ts:29`, `repository.ts:125`, `repository.ts:104`.
Repro: `manager-counterexamples.ts`, Fall `two-live-proofs-same-confirmed-row-uid`.
History mit Row 1/UID A laden. Liveabschluss E1 verweist explizit auf diese finale
Row. E1 sichtbar lesen und Session settlen. Weiterer Livebeleg E2 derselben finalen
Row/UID, bei eigener Sequenz, erzeugt einen zweiten Fakt und weckt die Session.
Ist: zwei Fakten, unreadCount=1, effectiveSettledAt=null, ohne Identitätskonflikt.
Ursache: E1 und E2 hängen an derselben UID-Quelle; Fact-/ACK-Abfragen betrachten nur
eine Gleichheitskante und finden den kanonischen E1-Fakt über die UID nicht.
Erwartet: ein unveränderter logischer Fakt, kein neuer Wake oder ungelesener Abschluss.
Bewiesene UID-Gleichheit kanonisieren; gerichtete Merge-Abdeckung weiterhin nicht
transitiv als Read ausweiten. Dieser Fall verwendet keine covers-Kante.

## M3, Medium: Wiederverfügbarkeit weckt geteilte Compression-Projektion nicht dauerhaft

Fundstellen: `repository.ts:139`, `service.ts:94`, `views.ts:25`.
Repro: `manager-counterexamples.ts`, Fall
`public-service-eviction-reavailability-shared-source`.
Bestätigte Root-/Tip-Lineage teilt dieselbe reine Eventquelle. replayEvicted markiert
sie über den echten Servicepfad unverfügbar und setzt beide Abdeckungslücken.
Tip bewusst snoozen. Ein weiterer Manager projiziert einen verzögerten exakten
Originalframe derselben Quelle; anschließend diesen Beleg in Tip lesen.
Ist: Root wird CONTENT_AVAILABLE/revision 2, Tip bleibt UNAVAILABLE_CONTENT/revision 1.
Nach Read hat Tip keine Attention und wird wieder effektiv snoozed, ohne neue Aktion.
markAvailable aktualisiert ausschließlich source.session_id, obwohl die Quelle
mehrere Sessionprojektionen besitzt. Der Repro braucht keine direkten SQL-Schreibzugriffe.
Erwartet: Wiederverfügbarkeit erreicht jede betroffene Projektion, erhöht dort ihre
Abdeckungsgrenze und entwertet den alten Snooze dauerhaft, auch nach Read.
Der verzögerte Frame wird am Serviceeingang simuliert, kein echter Netzverlust behauptet.

## M4, Medium: privater ACK invalidiert weitere eigene UID-Projektionen nicht

Fundstelle: `acks.ts:25`, Gegenstelle `repository.ts:79`.
Repro: `counterexamples.ts`, Fall `compression-private-ack-fanout`.
Root und bestätigter Compression-Tip zeigen dieselbe UID. Beide eigenen Metadaten
laden. Den vollständigen Tipbeleg lesen. Root-unreadCount ändert sich von 1 auf 0.
Ist: Rootrevision bleibt 0; einzige Invalidierung betrifft Tip. Bereits geöffnete
Root-/Summaryflächen bekommen keine Aktualisierung ihrer tatsächlich geänderten View.
Erwartet: alle betroffenen Sessionprojektionen desselben Owners erhalten Revision
und Invalidierung, einschließlich entsprechender Gleichheitsaliase. Andere Owners
erhalten weder den ACK noch eine dadurch ausgelöste private Änderung.

## M5, Medium: abgeschnittene Katalogseite behauptet vollständige Suchabdeckung

Fundstelle: `catalog.ts:37`, `:60` bis `:64`.
Repro: `counterexamples.ts`, Fall `catalog-depth-truncated-final-page`.
Offset 4950, Browserlimit 100, native total=5025. Zentralgrenze reduziert den
Upstreamread korrekt auf 50. Die Vollständigkeit wird aber mit 4950+100 berechnet.
Ist: 50 Rows, hasMore=false, coverage=complete, nextOffset=null; 25 Rows fehlen.
Erwartet: partial und verbleibende native Rows ehrlich ausweisen. Das feste
Tiefenlimit sowie der Offsetvertrag bleiben erhalten; keine weiteren Scans nötig.

## Selbst ausgeführte Prüfungen

- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 304/304 grün.
- `pnpm --filter @wrapt/contracts exec vitest run src/hermes-v2-organization.test.ts`:
  3/3 grün.
- `counterexamples.ts`: fünf reproduzierte Gegenfälle; `manager-counterexamples.ts`:
  drei weitere Ausführungsgruppen, davon zwei Bestätigungen derselben Befunde.
  Insgesamt sechs unterschiedliche Findings. Ausführung jeweils mit
  `pnpm --filter @wrapt/server exec tsx ../../temp/hermes-v2/phase4-backend-review/<Datei>`.
- `positive-controls.ts`: vier eigene positive Gruppen grün. Tatsächlich laufender
  Turn mit angehängtem Replaytool plus Snapshot-Zodkopie erhält den Assistantbeleg;
  Tool bekommt keinen. Direkter Merge vor Fact bleibt exakt und ownerprivat;
  Altbeleg wächst bei späteren absorbed UIDs nicht. Ungültiger gemischter Batch
  bleibt atomar; Owner-/Scope-/Sessionbindung hält. Frische Notice nach TTL und
  Registrywechsel belegt ausschließlich ihre Fehlerquelle.
- `pnpm typecheck`: grün für Extension-Contracts, Contracts, Server, Web und E2E.
- Gezieltes ESLint für Organisation, Contracts und betroffene Integrationsmodule:
  grün. Kein vollständiger Repository-Lint behauptet.
- `pnpm architecture:file-lines`: grün; Manager 395 Zeilen, keine Baseline erhöht.

Die vollständigen selbst erzeugten Testergebnisse liegen im genannten Tempordner.
Bestandstests bestätigen zusätzlich Auth/Origin, Lazy-Öffnung, 4-MiB-Grenze,
Request-Snooze-Vorrang, CAS/Pinmengen/Undo, Workergrenzen und private Invalidierung.
Sie decken die sechs Gegenbeispiele bisher nicht ab.

## Grenzen

Nur diesen Gate-Bericht und temporäre Repros/Ergebnisdateien geschrieben.
Keine Produkt- oder Webdateien geändert. Fake-Gateways verwendeten ausschließlich
eigene OS-vergebene Loopbackports und wurden geschlossen; Repositories ebenfalls.
Keine echten Hermes-Aufrufe, Transcript-/Nutzerdatenbankzugriffe oder Secret-/Tokenlogs.
Keine Browser, Devserver, Dienste, Previews, Slots, Nutzersessions, Subagents oder
Gitoperationen. Root-Testserver 19470 unberührt. Keine erneute Freigabe der alten
Security-Gates und keine Aussage zum getrennten Phase-4-Clientgate.

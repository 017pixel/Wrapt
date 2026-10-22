# Hermes V2 Phase 4: unabhängiges Backend-/Contracts-Gate R2

Stand: 16.10.2026. **Verdict: needsfixes. H1 bleibt High, zwei belegte Varianten.**
M1 bis M5 sind im geprüften Backendstand geschlossen. Keine weiteren konkreten
High-/Medium-Befunde gefunden. Dieses Gate gilt ausschließlich für das eingefrorene
Phase-4-Organisationsbackend und die Contracts, kein UI-, Client- oder Gesamtfeature-PASS.

## Grundlage und Nachprüfung

Originalauftrag, insbesondere Kapitel 5, 11 bis 13, Phase 4, Tests und DoD gelesen.
Organisation-Handoff, Evidence-Addendum, Entwurfs-Gate R4, Interface-Decisions samt
letzter Klarstellung sowie Backend-Implementierungsbericht zugrunde gelegt.
Ersten Backend-Gatebericht, Fixbericht und alle drei ursprünglichen Reproskripte
vollständig gelesen. Organisationsmodule, geänderte Integrationspfade und Contracts
selbst geprüft. Installierte Hermes-Quellen nur statisch gelesen, keine Coreaufrufe.

Die drei Originalskripte bleiben unverändert. Neue gesunde Gegenassertionen stehen
in `temp/hermes-v2/phase4-backend-review/r2-healthy-counterexamples.ts` und
`r2-healthy-manager.ts`. Sie bestätigen alle ursprünglichen konkreten Abläufe als
korrigiert. Die folgenden zusätzlichen Repros widerlegen jedoch die vollständige
Schließung der H1-Invariante. Exit 0 ihres Skripts bestätigt den Bug.

## H1, High, weiterhin offen: veralteter Row-Zeuge bestätigt neue Antwort

Fundstellen relativ zu `apps/server/src/hermes/v2/organization/`:
`sources.ts:15`, `:23`, `:25` sowie `projection.ts:55`.
Repro: `temp/hermes-v2/phase4-backend-review/r2-additional-counterexamples.ts`.
Das Skript enthält zwei unabhängig ausgeführte Varianten, keine direkten SQL-Schreibzugriffe.

**H1a, UID-Verlust bei Wiederverwendung, regulärer Managerpfad, Repro ab Zeile 30.**
Subscribe zeigt Row 1 mit UID A, deren Snapshotbeleg erfolgreich lesen. Ersten
Liveabschluss mit final_assistant_row_id=1 empfangen. Danach liefert reguläres
history.read Row 1 mit neuem Antworttext, finish_reason=stop und message_uid=null.
Zusätzlich explizit abgleichen: Die neue M1-Erkennung setzt korrekt identity-unknown.
Ein weiterer message.complete verweist auf dieselbe physische Row 1.

Ist: `rowWitness` liefert weiterhin A; die neue Eventquelle wird EQUAL mit A.
`acknowledged("a",newSource)=true`, obwohl ausschließlich der alte Snapshot gelesen
wurde; weiterhin nur ein logischer Fakt. Die Coverage-Lücke verhindert die falsche
Read-Zuordnung nicht. Der frühe `!uid`-Return prüft oder sperrt den alten Zeugen nicht.

Erwartet: Eine beobachtete Row ohne bestätigte neue UID darf den alten Row-Zeugen
nicht weiter als Identitätsbeweis verwenden. Die neue Eventquelle bleibt ungelesen
und getrennt, der alte ACK bleibt ausschließlich bei A. Ungeklärte Abdeckung bleibt sichtbar.

**H1b, widersprüchliche UID erstmals in anderer Projektion, Repro ab Zeile 70.**
Root zeigt physische Row 1/UID A; ihren Beleg lesen. Compression-Lineage Root/Tip
bestätigen. Tip zeigt danach dieselbe physische Row 1 mit UID B und anderem Text.
Anschließend einen Root-Liveabschluss mit final_assistant_row_id=1 projizieren.

Ist: Keine `(scope,row_id)`-Konfliktsperre entsteht. Root behält A, Tip speichert B.
Der Rootabschluss wird über A ebenfalls als gelesen ausgewiesen. Die Konflikttabelle
ist zwar scopeweit, ihre Erkennung sucht den bisherigen Zeugen nur innerhalb einer
Session. Hermes' `messages.id` ist dagegen Primary Key der gesamten Profil-DB
(`hermes_state_common.py:449`), nicht einer einzelnen Session.

Erwartet: Widersprüchliche Zeugen derselben physischen Scope/Row werden unabhängig
von ihrer Sessionprojektion erkannt und sperren weitere Row-Aliase dauerhaft.
Keine Wiederverwendung des veralteten Root-Zeugen für neue Inhalte.

Beide Varianten verletzen dieselbe H1-Read-Invariante und zählen als ein offenes
High. Der ursprüngliche Fall mit UID-Wechsel innerhalb derselben Session ist
behoben. Eine bereits erkannte Sperre übersteht DB-Wiederöffnung und weitere
Sessionprojektionen; genau diese positive Kontrolle besteht ebenfalls.

## M1 bis M5 geschlossen, positive Grenzen geprüft

- M1: UID-lose terminale Antwort auch zwischen zwei gültigen UID-Rows sichtbar
  als identity-unknown. Gleicher Scan bleibt revisionsstabil; zusätzliche ungeklärte
  Row erhöht Revision. Nach vollständigem UID-Nachweis entstehen exakt die neuen
  Antwortfakten. Keine erfundenen Abschlüsse aus User-/Tool-/Zwischenrows.
- M2: Ursprünglicher Managerfall behält Fakt, Read und Settle. Zusätzliche eigene
  Kontrolle mit vier separaten finalen Eventzeugen derselben Row/UID behält einen
  Fakt ohne Wake. EQUAL ist transitiv; COVERS bleibt direkt. A deckt B, B deckt C,
  Read(A) liest C nicht. Alte Eventhandles behalten ihre ursprüngliche Source-Menge.
- M3: Echte Service-Eviction und verspätete Originalprojektion aktualisieren Root
  und Tip. Eigene Kontrolle mit unterschiedlichen Coverage-Ausgangsrevisionen und
  zwei nacheinander wieder verfügbaren Quellen bestätigt jeweils eigene Source-/
  Sessionrevisionen. Erneutes bewusstes Snooze wirkt; nächste Wiederverfügbarkeit
  weckt beide dauerhaft, auch nach dem neuen Read.
- M4: Alter Tiphandle vor Lineagebestätigung liest später dieselbe UID privat.
  Eigene Kontrolle prüft exakt eine Revision und Invalidierung je eigener Root-/
  Tipprojektion. Anderer Owner und separate Branch bleiben ungelesen und revisionsgleich.
  Wiederholter identischer ACK erzeugt keine weitere Invalidierung oder Handleausweitung.
- M5: Offset 4950/Limit 100/total 5025 liefert native Limit 50 und ehrlich
  partial/hasMore=true/nextOffset=null. total 5000 ist vollständig. Eigene Kontrollen
  prüfen Pinbackfills nach der echten Seite, Offset um angefordertes Limit, null
  Suchtreffer mit weiterem Offset sowie keinerlei Upstreamread ab Tiefe 5000.

Die unveränderten ursprünglichen positiven Kontrollen bestehen: echter Replay-
Toolappend plus Snapshot-Zodkopie erhalten ausschließlich den Assistantzeugen;
direkter Merge vor Fakt, eingefrorener Altbeleg, atomare Batchablehnung,
Owner-/Scope-/Sessionbindung und erneuerbare ausschließlich eigene Fehlernotice.

## Selbst ausgeführte Checks

- `pnpm --filter @wrapt/server exec vitest run src/hermes`: **315/315 grün**,
  einschließlich der elf neuen dauerhaften Reviewregressionen.
- `pnpm --filter @wrapt/contracts exec vitest run src/hermes-v2-organization.test.ts`:
  **3/3 grün**.
- Beide neuen gesunden Varianten der Originalrepros: fünf direkte Gegenassertionen
  und drei Manager-/Servicegruppen grün. Unveränderte `positive-controls.ts`: grün.
- Eigene `r2-positive-controls.ts`: sechs zusätzliche gesunde Gruppen grün.
- Eigene `r2-additional-counterexamples.ts`: beide H1-Varianten mit Assertions
  reproduziert. Ausführung der Skripte jeweils über
  `pnpm --filter @wrapt/server exec tsx ../../temp/hermes-v2/phase4-backend-review/<Datei>`.
- `pnpm typecheck`: vollständig grün, einschließlich Server, Web und E2E.
- ESLint für `src/hermes/v2` sowie die vier betroffenen Contractsdateien mit
  `--max-warnings=0`: grün. Kein vollständiger Repository-Lint behauptet.
- `pnpm architecture:file-lines`: grün, 1838 Dateien; Manager weiterhin 395 Zeilen.
- Hashvergleich von 83 Backend-/Contracts-/Integrationsdateien und Originalrepros:
  unverändert während dieses Reviews.

Ergebnisse liegen unter `temp/hermes-v2/phase4-backend-review/r2/`.
Grüne Bestandstests schließen die beiden zusätzlichen Row-Gegenfälle nicht.

## Grenzen und Abschlussbedingung

Nur diesen neuen Bericht und temporäre Reviewartefakte geschrieben. Produktdateien,
erster Gatebericht, Fixbericht und Originalrepros unverändert. Ausschließlich
Fake-Testressourcen mit temporärer eigener SQLite und OS-vergebenen Loopbackports;
alle Fixtures geschlossen. Keine App-/Devserver, Browser, echten Coreaufrufe,
Nutzerdatenbanken, Secret-/Tokenlogs, Dienste, Previews, Slots, Nutzersessions,
Subagents oder Gitoperationen. Root-Testserver 19470 unberührt.

H1a und H1b müssen vor Backend-/Contracts-PASS geschlossen und in einem frischen
unabhängigen Recheck geprüft werden. Keine erneute Freigabe der früheren
Phase-2-Security-Gates und keine Aussage zum getrennten Phase-4-Clientgate.

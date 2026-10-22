# Hermes V2 Phase 4: unabhängiges Backend-/Contracts-Gate R3

Stand: 16.10.2026. **Verdict: needsfixes. Kein High offen, ein Medium belegt.**
H1a und H1b sind in den unabhängig nachgestellten Abläufen geschlossen.
M2 bis M5 bleiben geschlossen. Der isolierte ursprüngliche M1-Fall besteht;
eine neue Kombination aus bekannter Rowsperre und späterer UID-Lücke verletzt
jedoch dieselbe Coverage-/Wake-Invariante. Kein UI-, Client- oder Gesamtfeature-PASS.

## Grundlage und Vorgehen

Originalauftrag insbesondere Kapitel 5, 11 bis 13, Phase 4, Tests und DoD geprüft.
Organisations-Handoff, Evidence-Addendum, Entwurfs-Gate R4, Interface-Decisions
einschließlich jüngster Klarstellung und Backend-Implementierungsbericht gelesen.
Ersten Gate-/Fixbericht, vollständigen R2-Gatebericht und fixes-r2 gelesen.
Alle ursprünglichen Repro-/Kontrollskripte einschließlich
`r2-additional-counterexamples.ts` vollständig gelesen und unverändert gelassen.
R3-Quellen, Schema, Projektion und sechs neue dauerhafte Regressionen selbst geprüft;
Reconciliation, Identität, ACKs, Gleichheit, Verfügbarkeit, Views und Katalog abgeglichen.

Neue Repros/Kontrollen liegen unter `temp/hermes-v2/phase4-backend-review/`;
Ausgaben und Prüfprotokolle im Unterordner `r3/`. Die alten Bugassertionen sind
keine gesunden Tests. Für deren zwei R2-H1-Abläufe enthält die separate Datei
`r3-healthy-row-identity.ts` gesunde Gegenassertionen; beide bestehen.

## H1a und H1b, zuvor High, geschlossen

Fundstellen: `organization/sources.ts:15`, `:24`, `:26` und `projection.ts:28`, `:55`,
jeweils relativ zu `apps/server/src/hermes/v2/`.

- H1a: Subscribe mit UID A, alten Snapshot ausdrücklich lesen, erster Abschluss,
  reguläres History mit derselben physischen Row ohne UID, weiterer Abschluss.
  Ist jetzt: Rowzeuge null, neue Eventquelle nicht gelesen, zwei getrennte Fakten;
  ursprünglicher ACK bleibt bei A. Null, fehlende und ungültige UID sind zusätzlich
  im tatsächlichen Managerpfad durch die sechs neuen Regressionen abgedeckt.
- H1b: Root liest Row 1/UID A; bestätigte Compression-Lineage; Tip zeigt erstmals
  dieselbe physische Row mit UID B; anschließender Root-Liveabschluss.
  Ist jetzt: scopeweite Rowsperre, beide Zeugen null und beide Projektionen
  identity-unknown. Der neue Rootabschluss bleibt ungelesen, der alte ACK erhalten.

Eigene zusätzliche Kontrollen in `r3-positive-controls.ts` bestehen:
UID-/Rowprüfung vor User-, Hidden-, Verification- und Kürzungsrückgaben;
persistente Sperre nach DB-Wiederöffnung; keine Erweiterung alter Handlemengen.
Dieselbe UID derselben Row in Root/Tip bleibt vor einem Konflikt gültig;
Branch-ACK bleibt getrennt. Andere physische Rows und andere Scopes bleiben gültig.
Null/A/B alterniert über Root, Tip und Branch ohne neue Coverage-Revision derselben
bekannten Konfliktmenge, auch nach Settle und DB-Wiederöffnung. Eine zweite
tatsächlich widersprüchliche physische Row erhöht die Revision und weckt;
erneutes bewusstes Snooze bleibt bei wiederholtem unverändertem Scan wirksam.

## R3-M1, Medium, offen: bekannte Rowsperre verdeckt neue ungeklärte Antwort

Fundstellen: `organization/reconcile.ts:59`, `:65`, besonders `:76` und `:77`;
`organization/sources.ts:31` bis `:34`.
Verbindliche Erwartung: `plans/hermes-v2-organisation-handoff.md:79`;
neue ungeklärte Materialien erhöhen die Coverage-Revision, bekannte unveränderte nicht.

Repro: `temp/hermes-v2/phase4-backend-review/r3-additional-counterexamples.ts:6`.
Ausschließlich reguläre Repository-/Projektions-/Reconciler-/Actions-Aufrufe mit
Fake-Dashboard und eigener temporärer SQLite, keine direkten SQL-Schreibzugriffe.

1. Baseline mit Row 1/UID A und Row 2/UID B abgleichen.
2. Row 1 zeigt UID C. Der Scan erkennt den physischen Konflikt korrekt:
   identity-unknown/ROW_IDENTITY_CHANGED, Coverage-Revision 1.
3. Diese bekannte Lückenversion bewusst settlen, ohne irgendeinen ACK.
4. Eine zusätzliche neue Row 4 mit nichtleerem Assistantinhalt,
   finish_reason=stop und message_uid=null an die gemischte Seite anhängen.
   Dieselbe Session erneut abgleichen.

**Ist, durch Assertions bestätigt:** Coverage bleibt Revision 1,
attention.requiresAttention=false, effectiveSettledAt bleibt gesetzt, Faktenzahl 0.
Die neue UID-lose Antwort bleibt organisatorisch verborgen. Exit 0 des Repros
bestätigt diesen Bug; Ausgabe liegt in `r3/additional-counterexamples.txt`.

**Erwartet:** zusätzliche ungeklärte Row erzeugt eine neue Coverage-Version und
dauerhaften Wake, ohne erfundenen Completion-Fakt oder Read. Unveränderte weitere
Scans dürfen diese neue Version anschließend nicht erneut erhöhen.

Ursache: Der physische Konfliktsatz erhält nur seine bekannte Anzahl. Anschließend
kehrt der Reconciler bei ROW_IDENTITY_CHANGED vor der Verarbeitung der neu berechneten
Missing-UID-Signatur zurück. Die dauerhaft sichtbare alte Lücke allein genügt nicht,
weil Settle deren bekannte Revision bereits organisiert hat. Die Abdeckung muss
zusätzliche ungeklärte Materialien erfassen und zugleich den stabilen Konfliktsatz
bewahren. Der neue physische Alias-/ACK-Schutz selbst wird dadurch nicht widerlegt.

## Erhaltene Altfixes und positive Belege

- Ursprünglicher M1 ohne vorherigen Rowkonflikt: fehlende UID zwischen gültigen Rows
  bleibt sichtbar; gleicher Scan stabil, zusätzliche UID-Lücke erhöht Revision.
- M2: mehrere explizite finale Eventzeugen derselben UID behalten einen logischen
  Fakt, Read und Settle. EQUAL darf transitiv sein; COVERS bleibt direkt.
  A deckt B und B deckt C: Read(A) liest C nicht. Alte Handles wachsen nicht.
- M3: echte Fake-Service-Eviction und Wiederverfügbarkeit wecken Root/Tip dauerhaft,
  auch nach Read. Unterschiedliche Ausgangsrevisionen und zwei nacheinander
  wiederhergestellte Quellen behalten je Projektion eigene Revisionen.
- M4: alter Tiphandle vor Lineagebestätigung invalidiert nach ACK eigene Root-/
  Tipprojektionen genau einmal. Anderer Owner und separate Branch bleiben unverändert.
- M5: Offset 4950/Limit 100/total 5025 liest native 50 Rows und meldet partial,
  hasMore=true, nextOffset=null. total 5000 vollständig; keine Reads ab Tiefe 5000.
  Native Pinbackfills und leere Suchseiten verändern den Offsetvertrag nicht.
- Replay-Toolappend plus Snapshot-Zodkopie erhalten nur den Assistantzeugen;
  direkter Merge vor Fact bleibt exakt. Gemischter ungültiger ACK-Batch bleibt atomar,
  Owner/Scope/Sessionbindung hält. Frische Fehlernotice nach TTL/Registrywechsel
  belegt ausschließlich ihre eigene Fehlerquelle.

## Selbst ausgeführte Checks

- `pnpm --filter @wrapt/server exec vitest run src/hermes`: **321/321 grün**, 30 Dateien,
  einschließlich sechs neuer Rowidentitäts- und elf bisheriger Reviewregressionen.
- `pnpm --filter @wrapt/contracts exec vitest run src/hermes-v2-organization.test.ts`:
  **3/3 grün**.
- Unveränderte `r2-healthy-counterexamples.ts`: fünf Gruppen grün;
  `r2-healthy-manager.ts`: drei Gruppen grün; `r2-positive-controls.ts`: sechs Gruppen
  grün; ursprüngliche `positive-controls.ts`: vier Gruppen grün.
- Neue `r3-healthy-row-identity.ts` und `r3-positive-controls.ts`: grün.
  Neue `r3-additional-counterexamples.ts`: Medium-Bug erfolgreich reproduziert.
  Skripte jeweils mit `pnpm --filter @wrapt/server exec tsx ../../temp/hermes-v2/phase4-backend-review/<Datei>` ausgeführt.
- `pnpm typecheck`: vollständig grün einschließlich Web und E2E-Typen.
- ESLint für `apps/server/src/hermes/v2` sowie fünf betroffene Contractsdateien
  mit `--max-warnings=0`: grün. Kein vollständiger Repository-Lint behauptet.
- `pnpm architecture:file-lines`: grün, 1853 Dateien; Manager weiterhin 395 Zeilen.
- Hashvergleich bestätigt unveränderte Backend-/Contracts-/Integrationsdateien und
  alle sieben vorherigen Repro-/Kontrollskripte. Zwei parallel von Root bearbeitete
  Fortschritts-/Browserberichte liegen außerhalb dieses Backendfreezes.

## Grenzen und Abschlussbedingung

Nur diesen neuen Bericht und eigene temporäre Reviewartefakte geschrieben.
Keine Produktänderungen oder Überschreibung früherer Berichte/Repros. Tests verwenden
ausschließlich Fakes, eigene temporäre SQLite und isolierte Fake-Loopbackressourcen;
alle Fixtures geschlossen. Keine App-/Devserver, Browser, Dienste, echten Coreaufrufe,
Nutzerdatenbanken, Secret-/Tokenlogs, Previews, Slots, Nutzersessions, Gitoperationen
oder Subagents. Root-Testserver 19470 unberührt.

R3-M1 vor Backend-/Contracts-PASS beheben und frisch nachprüfen. Die grünen Tests
decken diesen zusätzlichen kombinierten Gegenfall nicht ab. Keine erneute Freigabe
der früheren Security-Gates und keine Aussage zum getrennten Client-R4-/UI-Gate.

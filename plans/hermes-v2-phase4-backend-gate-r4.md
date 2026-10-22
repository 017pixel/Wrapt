# Hermes V2 Phase 4: unabhängiges Backend-/Contracts-Gate R4

Stand: 16.10.2026. **Verdict: PASS ausschließlich für Phase-4-Backend und Contracts.**
R3-M1 ist geschlossen. Die zuvor geschlossenen H1a/H1b und M1 bis M5 bleiben
in den selbst ausgeführten Gegenprüfungen geschlossen. Keine belegten offenen
High-/Medium-Befunde im vereinbarten Recheck-Scope.
Kein UI-, Client-, Browser-, Laufzeit- oder Gesamtfeature-PASS.

## Grundlage und Vorgehen

Originalauftrag, besonders Kapitel 5, 11 bis 13, Phase 4, Tests und DoD gelesen.
Organisations-Handoff, Evidence-Addendum, Entwurfs-Gate R4, Interface-Decisions
einschließlich jüngster Organisationsklarstellung und Backend-Dateimap geprüft.
Alle drei bisherigen Backend-Gates und ihre Fixantworten vollständig gelesen,
ebenso die ursprünglichen und zusätzlichen R2-/R3-Repros sowie positiven Kontrollen.
Phase-2-Security-/Protokoll-Gates R1 bis R5 samt Antworten als Altgrenzen abgeglichen;
dieser Bericht erteilt dafür keine neue eigenständige Sicherheitsfreigabe.

Produktquellen selbst geprüft: neue Identitätsabdeckung, Schema, Sources,
Reconciliation, Projektion, Repository, EQUAL/COVERS, ACKs, Verfügbarkeit, Views,
Actions, Cursor, Summary/Activity, Scope/Auth sowie betroffene Ausgabeintegration.
Die vier neuen dauerhaften Tests wurden gelesen und ausgeführt. Zusätzlich eigene
gesunde Gegenassertionen und eine Reihenfolgenmatrix mit regulären fachlichen
Aufrufen ausgeführt. Eigene neue Repros schreiben keine SQL-Daten direkt.

## R3-M1, zuvor Medium: geschlossen

Fundstellen relativ zu `apps/server/src/hermes/v2/organization/`:
`identity-coverage.ts:4`, `:12`, `:18`; `sources.ts:31`;
`reconcile.ts:66`, `:67`, `:80`, `:84`; `schema.ts:37`.

Den unveränderten Originalrepro in eine neue Datei
`temp/hermes-v2/phase4-backend-review/r4-healthy-combined.ts` kopiert und nur
Bugassertionen durch gesunde Gegenassertionen ersetzt. Die Originaldatei bleibt erhalten.

Exakte Folge: Baseline Row 1/UID A und Row 2/UID B; Row 1 wechselt auf UID C;
bekannte Coverage-Revision 1 bewusst settlen; zusätzliche terminale Assistantrow 4
ohne UID beobachten; erneut abgleichen.
Erwartet und tatsächlich: Revision **1 auf 2**, `requiresAttention=true`,
`effectiveSettledAt=null`, weiterhin null Completion-Fakten und kein Rowzeuge für 4.
Die diagnostische Reason bleibt korrekt `ROW_IDENTITY_CHANGED`.
Der bekannte physische Konflikt verdeckt das neue Material damit nicht mehr.

Die neue persistente Missing-Menge und der physische Konfliktsatz gehen gemeinsam
in dieselbe Signatur ein. Sources überschreibt deren Missing-Anteil nicht mehr.
Der Reconciler erfasst weitere UID-lose Materialien auch bei bestehendem Konflikt.
Eine bereits gesperrte physische Row wird dabei nicht nochmals als neue Lücke gezählt.
Diese Mengen autorisieren weder Read noch Completion und speichern keinen Antworttext.

## Zusätzliche unabhängige R4-Kontrollen

`temp/hermes-v2/phase4-backend-review/r4-positive-controls.ts` besteht in vier
Varianten: Konflikt zuerst oder UID-Lücke zuerst, jeweils mit Settle oder Snooze.
Jede Variante prüft außerdem:

- Zweite Ursache erhöht Coverage und weckt beide bekannten Ownerprojektionen.
  Ein erneuter Read des alten exakten Handles stellt die Organisation nicht wieder her.
  ACK bleibt privat, die eingefrorene Source-Menge unverändert, Faktenzahl null.
- Wiederholte identische Sources-/Reconcileprojektionen verändern weder Coverage
  noch Metadatenrevisionen und erzeugen keine weiteren Invalidierungen.
- Erneutes bewusstes Organisieren wirkt. Zwei tatsächlich angeforderte Historyseiten
  mit Offsets 0/64, kleinere und umgeordnete Seiten behalten den bekannten Stand.
- DB schließen/wieder öffnen und neue Reconcilerinstanz erhalten Signatur und
  Organisationsgrenze. Null/A/C-Wechsel derselben gesperrten Row erzeugt keinen Wake.
- Weitere UID-lose Row 5, zusätzlicher physischer Bezug über `_row_id` und ein
  weiterer echter Rowkonflikt wecken jeweils neu. Bekannte Duplikate und derselbe
  Bezug über `row_id` erhöhen die Revision nicht erneut. UID-lose User-, Toolcalling-
  und Verificationrows erzeugen keine zusätzliche Antwortlücke oder Completion.

## Erhaltene Altfixes und positive Gegenfälle

- H1a/H1b: regulärer Manager-Historypfad mit UID-Verlust sowie widersprüchliche
  Root-/Tip-Row sperren den scopeweiten physischen Zeugen dauerhaft. Neue Livequelle
  bleibt ungelesen; alter ACK bleibt bei alter Antwort. Prüfung vor frühen Returns,
  DB-Reopen und weitere Sessionprojektionen bestehen. Gleiche UID bleibt vor einem
  Konflikt gültig; andere Rows/Scopes und getrennte Branch-ACKs bleiben unbeeinträchtigt.
- M1 isoliert: gemischte gültige/UID-lose Rows bleiben sichtbar. Gleicher Scan stabil,
  weiteres Material erhöht Coverage; bestätigte spätere UIDs erlauben echte Fakten.
- M2: mehrere finale Eventzeugen derselben UID behalten einen logischen Fakt und
  Settle. EQUAL ist transitiv, COVERS bleibt direkt: A deckt B, B deckt C,
  Read(A) liest C nicht. Alte Handles wachsen nicht.
- M3: Fake-Service-Eviction und exakte Wiederverfügbarkeit wecken Root/Tip dauerhaft,
  auch nach Read. Unterschiedliche Ausgangsrevisionen und zwei nacheinander wieder
  verfügbare Quellen behalten eigene Source-/Sessionrevisionen.
- M4: ACK über vor Lineagebestätigung ausgegebenen Tiphandle invalidiert eigene
  Root-/Tipprojektionen jeweils einmal. Anderer Owner und Branch unverändert;
  wiederholter ACK erzeugt keine weitere Invalidierung oder Handleausweitung.
- M5: Offset 4950/Limit 100/total 5025 liest native 50 Rows und meldet partial,
  hasMore=true, nextOffset=null. total 5000 vollständig, kein Read ab Tiefe 5000.
  Pinbackfills und leere Suchseiten behalten den vereinbarten Offsetvertrag.
- Replay-Toolappend und Snapshot-Zodkopie erhalten ausschließlich Assistantzeugen.
  Direkter Merge vor Fact bleibt exakt; ungültiger gemischter ACK-Batch atomar.
  Owner-/Scope-/Sessionbindung und frische eigene Fehlernotice nach TTL bestehen.

## Selbst ausgeführte Checks

- `pnpm --filter @wrapt/server exec vitest run src/hermes`: **325/325 grün**, 31 Dateien.
- `pnpm --filter @wrapt/contracts exec vitest run src/hermes-v2-organization.test.ts`:
  **3/3 grün**.
- Unveränderte R2-healthy-counterexamples, R2-healthy-manager, R2-positive-controls,
  R3-healthy-row-identity, R3-positive-controls und ursprüngliche positive-controls:
  **23 gesunde Gruppen grün**. R4-Gegenassertion und vier eigene Matrixvarianten grün.
  Ausführung jeweils mit `pnpm --filter @wrapt/server exec tsx <Skriptpfad>`.
- `pnpm typecheck`: vollständig grün einschließlich Web- und E2E-Typen.
- ESLint für `src/hermes/v2` und fünf betroffene Contractsdateien mit
  `--max-warnings=0`: grün. Kein vollständiger Repository-Lint behauptet.
- `pnpm architecture:file-lines`: grün, 1861 Dateien; Manager weiterhin 395 Zeilen.
- SHA-256-Vergleich von 101 Backend-/Contracts-/Integrationsdateien, Altberichten
  und vorhandenen Reproskripten: während des Reviews unverändert.

Protokolle und Freezevergleich: `temp/hermes-v2/phase4-backend-review/r4/`.
Alte Exit-0-Bugassertionen wurden nicht als gesunde Produktchecks gewertet.

## Grenzen

Nur diesen neuen Bericht und temporäre Reviewartefakte geschrieben. Keine Produkt-
oder Webdateien und keine alten Berichte/Repros geändert. Ausschließlich eigene
temporäre SQLite und vorhandene Fake-Testtransporte auf OS-vergebenen Loopbackports;
alle Fixtures geschlossen. Kein App-/Devserver, Browser, Dienst, echter Coreaufruf,
Nutzerdatenzugriff, Secret-/Tokenlog, Preview, Slot, Nutzersession, Git oder Subagent.
Root-Testserver 19470 unberührt. Begrenzte Offlineabdeckung bleibt unverändert ehrlich.
Das getrennte Client-R4-H1/M1-Pflichtgate und die Gesamtfeature-Abnahme bleiben offen.

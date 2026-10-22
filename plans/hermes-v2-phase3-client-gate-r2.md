# Phase 3: unabhängiges Client-/State-/Hook-Gate R2

Stand: 2026-10-16, geprüfter R2-Freeze vor den anschließend begonnenen Korrekturen.
**Urteil: needs fixes. Zwei offene Medium-Findings.**
Kein Gesamtfeature-PASS. Fehlende Phasen 4 bis 11 werden hier nicht bewertet.

## Scope und Verfahren

Vollständige Anlage, chat-handoff, chat-design-review, chat-design-gate-r2,
phase3-client-implementation, erstes Client-Gate und phase3-client-fixes gelesen.
Scope: nonvisuelle gateway-/chat-Module, useHermesV2Chat und sechs Testdateien.
Keine Produktdatei geändert, keine Dienste, Browser, echte Coreaufrufe oder Gitoperationen.
Keine erneute Phase-2-Redaktionsprüfung und kein UI-/CSS-Gate.

Alle 78 Bestandstests selbst ausgeführt. Zusätzlich 14 gesunde unabhängige
Assertions bestanden. Zwei weitere gesunde Randfall-Assertions scheiterten.
Eigene Repros: `/tmp/hermes-v2-phase3-gate-r2.suOqGL/healthy.test.ts` und
`/tmp/hermes-v2-phase3-gate-r2.suOqGL/edges.test.ts`. Die Fakes nutzen die öffentlichen
normalisierten Frames und echte Client-/Runtime-/Reducerimplementierungen.
Die Fehler wurden vor dem Bericht an Parent und Autor gemeldet. Der Autor bearbeitet
inzwischen seine Module; dieser Bericht bewertet ausdrücklich den davor geprüften Stand.

## R2-M1: fremder Turn übernimmt die Identität eines eigenen Pending-Prompts

**Severity: Medium. Orte am geprüften Stand:** chat-events.ts:7 bis 14 und
79 bis 87; chat-state.ts:75 bis 101; chat-actions.ts:136 bis 147.

Ausführbarer gesunder Repro in edges.test.ts, erster Test:

1. Idle-Session A, eigenen Prompt explizit mit queue-Modus senden, RPC-Antwort halten.
2. Einen gleichzeitig über Classic gestarteten Turn per message.started empfangen.
3. Dessen message.completed liefert persistedTurn mit userRowId 41,
   assistantRowId 42 und complete:true.
4. Eigene Submitantwort lautet status:queued und userRowId:null.
5. Einen nachgelagerten Subscribe halten, damit kein späterer Snapshot das Race verdeckt.

Ergebnis: Der eigene lediglich gequeuete Text steht als belegte fremde Userrow 41
im Store. Die gesunde Assertion, dass genau diese falsche Zuordnung fehlt, scheitert.
Es gibt weder einen eigenen positiven Receipt für 41 noch einen Textvergleich im Repro.
Dies ist ein nachgewiesener Clientanzeige-/Identitätsfehler, keine SQLite-Mutation.

Ursache: turnFor übernimmt einen Placeholder samt eigener pending userId beim ersten
message.started. Completion promoviert diese Userzeile unbesehen auf die fremde
persistedTurn.userRowId. Die korrekte neue Queuebereinigung sucht anschließend nur
die ursprüngliche live:user:<Operation-ID>, die bereits umbenannt wurde.
Auch der neue positive Receiptpfad sucht ausschließlich diese ursprüngliche ID;
dadurch kann ein späteres streaming-Receipt für die eigene Row 43 dieselbe zuvor
falsch promovierte Zeile nicht mehr korrigieren. Diese zweite Reihenfolge wurde dem
Autor als zusätzliche Regression mitgeteilt, der ausgeführte Repro belegt Queue/null.

Fix: Die eigene Pending-Operation nicht allein über den ersten beobachteten Turn an
einen User binden. Die konkrete Operation-zu-Userrow-Brücke ist ihr positiver
Submitreceipt. Unkorrelierte Completion darf diese Pendingzeile nicht promovieren.
Assistant-/Toolidentität weiterhin aus ihren eigenen Belegen ableiten. Autoritative
Snapshots dürfen neu projizieren; eine verspätete Antwort darf alte Zeilen nicht erfinden.

Regressionen: Queue/null und streaming/43 nach fremdem Complete/41, eigenes
Complete/42 vor Receipt/42, Snapshot und History-UID dazwischen, neuer Draft und
anderer Owner. Keine Text-Deduplizierung oder vermutete Assistantverbindung ergänzen.

## R2-M3: Live-session.updated umgeht den neuen inneren Session-ID-Guard

**Severity: Medium. Orte am geprüften Stand:** chat-runtime.ts:194 bis 211,
chat-events.ts:91 bis 92; chat-response-guards.ts schützt nur RPC-Readresultate.

Ausführbarer gesunder Repro in edges.test.ts, zweiter Test:
Ein nach den öffentlichen Schemas gültiges session.updated hat außen sessionId A,
innen jedoch payload.session.id B. Der A-Owner zeigt danach Session B, die Verbindung
bleibt online. Ein tatsächlich im Fake ausgeführter Folge-Submit adressiert weiterhin A.
Diagnose: observedSession=b, observedConnection=online, message.submit.sessionId=a.
Gesund erwartet: bisherigen A-Kontext behalten, PROTOCOL_MISMATCH/incompatible,
keine folgende Mutation. Die erste Assertion scheitert; der Folge-Send ist mit erfasst.

Ursache: Eventrouting prüft nur die äußere ID. Reduktion und Listenprojektion übernehmen
die innere Session ungeprüft. Der neue Guard für Subscribe/History greift dort nicht.
Dies ist eine fehlende konsistente Protokollgrenze bei einem widersprüchlichen
Serverframe, kein Nachweis, dass der vorhandene Core aktuell fremde Daten sendet.

Fix: Vor Reduktion und upsertSummary die innere Stored-ID an die äußere binden.
Bei Widerspruch denselben Fail-closed-Pfad nutzen, fremden Inhalt nicht projizieren,
Schreibbarkeit schließen, Retry und Mutationsreplay verhindern. Bestehende unbekannte
Mutationsausgänge bleiben unbekannt; ein Coreturn wird dadurch nicht gestoppt.
Regressionen: zwei Owner, falsche innere ID, kein Folgeschreiben, valider serverseitig
bereits auf Stored-ID projizierter Alias und ausstehende Mutation beim Protokollfehler.

## Geschlossene frühere Pfade

- R1-M1 direkt: Receipt vor/nach History vereint genau die ursprüngliche optimistische
  Userzeile mit Row 42 und bewahrt die echte History-UID. Echte gleiche Texte mit
  verschiedener Row/UID bleiben getrennt. Snapshot verhindert Zeilenauferstehung;
  ein neuer Draft eines anderen Owners bleibt erhalten. Offen bleibt R2-M1 oben.
- R1-M2 geschlossen: späte Modellechos überschreiben weder Snapshotauswahl noch
  session.updated. Auch erneute gleiche/null-Beobachtung erhöht die Barriere.
  deferred, confirmationRequired und confirmed funktionieren im unveränderten Kontext.
  Kein Mutationsretry, kein unnötiger Folge-Read nach entwertetem Echo beobachtet.
- R1-M3 direkt: falsche innere Subscribe-/History-ID mit zwei Ownern wird vor der
  Projektion geschlossen. Kein Fremdtext, kein Folgeschreiben und 60 Sekunden kein
  Retry. Korrekte Stored-ID mit anderem Coretitel bleibt lesbar und schreibbar.
  Eine gleichzeitig ausstehende Submitmutation bleibt beim Protokollclose unknown.
  Offen bleibt der Liveeventpfad R2-M3 oben.
- Bootstrap-Minimalfix bleibt geschlossen. Kein Redesign und keine neue Coreprüfung.

## Checks und Grenzen

- Sechs vorhandene Feature-Testdateien, 78/78 Tests selbst grün:
  chat-state, gateway-client, chat-runtime, chat-runtime-races, useHermesV2Chat,
  chat-client-fixes, jeweils mit .test.ts beziehungsweise .test.tsx.
- `pnpm --filter @wrapt/web exec vitest run --config /tmp/hermes-v2-phase3-gate-r2.suOqGL/vitest.config.mjs`:
  14 gesunde zusätzliche Rechecks grün, zwei gesunde Edge-Assertions rot, wie oben.
- Gezieltes ESLint der nonvisuellen chat-/gateway-/Hookmodule und Tests mit
  `--max-warnings=0`: grün. `pnpm architecture:file-lines`: grün, 1744 Dateien.
- `pnpm --filter @wrapt/web typecheck` ausgeführt: blockiert durch parallele
  HermesV2ChatSurface.test.tsx-Aufrufe ohne benötigtes Argument, Zeilen 73 und 81.
  Kein diagnostizierter Fehler im geprüften Client-Scope. Parent kennt den separaten
  GLM-UI-Testblocker; Gesamtcheck nach deren Freeze bleibt nötig.

78 Bestandstests decken weiterhin Owner-/Generation-/Draftguards, StrictMode,
20 Leases an einem Socket, Flag-off mit v2-disabled, Budgets/Stopreserve/Drain,
Unknown ohne automatischen Retry, Snapshot-/Historybarrieren und begrenzte Speicher ab.
Die zwei Randfälle zeigen die verbleibenden Grenzen dieser positiven Testabdeckung.
Parent-Runtime-/CLI-/Classic-/Browserbelege aus phase3-runtime-smoke sind ergänzend;
sie ersetzen die eigenen Raceprüfungen dieses Gates nicht.

Nach diesem Review keine Produktedits durch den Reviewer. Für die bereits begonnenen
gezielten Korrekturen sind neue gesunde Regressionen und ein unabhängiger R3-Recheck
nötig. Das R2-Urteil bleibt bis dahin needs fixes.

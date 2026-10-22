# Phase 3: unabhängiges Client-/State-/Hook-Gate

Stand: 2026-10-16. **Urteil: needs fixes. Drei offene Medium-Findings.**
Der zusätzlich gefundene High-Integrationsfehler beim Kaltstart ist durch einen
separaten Parent-Fix während dieses Reviews geschlossen und unten getrennt belegt.
Kein vollständiges Phase-3-/Gesamtfeature-PASS, keine Bewertung fehlender Phasen 4–11.

## Scope und Verfahren

Originalauftrag Core Chat/State/Transport/Phase 3, chat-handoff, chat-design-review,
chat-design-gate-r2 und phase3-client-implementation vollständig im relevanten Scope
gelesen. Geprüft: gateway-client/pending/protocol, chat-policy/types/owners/store/
messages/state/events/actions/runtime, useHermesV2Chat und deren fünf Testdateien.
Keine UI-/CSS-Bewertung, keine erneute Phase-2-Secret-/Securityprüfung.

Alle 64 vorhandenen Tests selbst ausgeführt. Zusätzlich sechs isolierte Reprofälle
unter `/tmp/hermes-v2-phase3-gate.4ExbHf/review.test.ts`, mit eigener Vitest-Konfiguration.
Sie verwenden öffentliche normalisierte Frames und die vorhandene Fake-Fixture.
Die Repro-Assertions belegen den jeweils beobachteten Fehlerzustand, keine Produktkorrektur.
Keine Produktdatei, Dienste, Nutzerpreview, Root-Testinstanz oder echter Core angefasst.

## M1: Submit-Rowreceipt wird verworfen, Userrow erscheint doppelt

**Ort:** chat-actions.ts:136–150, chat-state.ts:65–79, chat-messages.ts:19–21.

Repro: Idle-Session A, genau ein Submit mit Text X. Das gültige Resultat lautet
`{status:"streaming",userRowId:42}`. Noch während des Turns lädt loadOlder die
native erste Historyseite mit Userrow 42 und Text X. Ergebnis: zwei Userzeilen,
eine mit rowId=42 und eine mit rowId=null. Es wurde nur ein Prompt gesendet.
Der vorhandene persistierte Row-Beleg ist damit schon verfügbar; kein Textvergleich nötig.

Ursache: submit verarbeitet status, ignoriert aber result.data.userRowId vollständig.
Die optimistische Userzeile behält ausschließlich ihre lokale ID. History entfernt
Livezeilen nur bei belegter gleicher ID/Row-ID/UID. Bis Completion/Pushsnapshot bleibt
die doppelte Zeile sichtbar; bei ausbleibender Completion auch nach History-Nachladen.

Fix: Nur die zu diesem Submit gehörende optimistische ID über den positiven
userRowId-Receipt an die echte Userrow binden und mit bestehender History vereinen.
Capture/Session/Snapshotbarriere beachten, alte Livezeile nicht nach Snapshot wieder
einführen. Receipt beweist genau die Userrow, keine Assistant-/Toolrow und keinen
vollständig abgeschlossenen Turn. Ohne Receipt weiterhin konservativ, kein Textdedupe.
Regression: Receipt vor/nach History, Snapshot dazwischen, neue Drafts/Sessionwechsel,
zwei echte gleiche Prompts und complete:false ohne erfundenen Assistant-Beleg.

## M2: verspätetes Modellresultat überschreibt neuere autoritative Auswahl

**Ort:** chat-actions.ts:195–200; chat-runtime.ts:190–228.

Zwei Repros: Modelländerung A wird im Fake-Core angewendet, nur ihre Browserantwort
bleibt ausstehend. Danach ändert eine externe Quelle auf B. Ein gültiger neuer
Pushsnapshot beziehungsweise session.updated(seq=1) zeigt B korrekt. Nun kommt das
alte Resultat von A. Die Anzeige wird wieder A, obwohl die Fake-Core-Projektion B bleibt.
Den folgenden Detailread hält der Repro zurück, damit der fehlerhafte Zustand sichtbar ist.
Dies benötigt weder Ownerwechsel noch kaputte Envelopes.

Ursache: Nach await client.request schreibt model() result.data.selection ungeprüft
in den Sessionstore. Es prüft weder Snapshotgeneration noch eine neuere Selection-
Beobachtung. result.selection ist das Echo dieser Aktion, kein Latest-State-Cursor.
Ein nachgelagerter Resync kann den Zustand später reparieren, verhindert das Race aber nicht.

Fix: Das Echo nur bei unveränderter lokaler Session-/Selectionrevision übernehmen,
ansonsten neuere Snapshot-/Sessioneventdaten behalten und lesend abgleichen.
Nur Snapshotgeneration reicht nicht: session.updated muss dieselbe Barriere bilden.
Mutationsannahme/Fehler weiterhin anzeigen, keine alte Mutation wiederholen.
Regression: beide belegten Ereignisquellen, deferred/confirmation, Session-/Ownerwechsel
und eine tatsächlich erst nach dem Snapshot angewendete Änderung mit frischem Sessionevent.

## M3: Domänen-ID in Resultat wird nicht an angefragte Session gebunden

**Ort:** chat-runtime.ts:114–120, chat-actions.ts:86–93;
gateway-pending.ts:24–29 prüft ausschließlich RPC-ID und Op.

Repro 1: session.subscribe(A) bekommt eine syntaktisch gültige Antwort mit derselben
RPC-ID/Op, aber snapshot.session.id=B und B-Nachrichten. Store-Schlüssel/sessionId
bleibt A, sichtbare Session wird B. Danach sendet Submit mit dem sichtbaren B-Kontext
tatsächlich an A. Repro 2: history.read(A) bekommt data.sessionId=B und mischt die
B-History ungeprüft in A. Beide Frames bestehen die öffentlichen Zod-Schemas.

Dies ist eine fehlende fachliche Fail-closed-Prüfung bei einer widersprüchlichen
Serverantwort, keine Behauptung eines aktuell nachgewiesenen Core-Datenleaks.
Die vorhandene Backendprüfung ersetzt diese explizite Client-/Ownergrenze nicht.

Fix: Vor jeder Projektion snapshot.session.id und history.data.sessionId gegen die
erfasste angefragte Stored-ID prüfen. Bei Widerspruch PROTOCOL_MISMATCH/keine Daten-
übernahme; misslungenen Subscribe nicht writable/synced setzen. Der laufende Core-Turn
bleibt unberührt. Entsprechende innere Session-IDs bei Sessionevents konsistent halten.
Regression: korrekte RPC-Korrelation plus falsche innere Session-ID, zwei Owner A/B,
alte Resultate und ein nachfolgender Schreibversuch ohne erfolgreiche A-Synchronisierung.

## Geschlossen während des Reviews: Bootstrap-Deadlock

Parent zeigte es an seiner eigenen echten Source-App/Session; zusätzlicher eigener
Fake-Repro sendet den tatsächlich initialen connection=offline statt autoOnline.
GatewayClient.ready wartet vor dem ersten RPC auf online. Zuvor begann GatewayManager
upstream.connect aber erst in handle(), also nach genau diesem ersten RPC.
Ergebnis: kein erster sessions.list/subscribe, offline und readonly trotz erreichbarem Core.
autoOnline=true der bisherigen Web-Fixture verdeckte den Integrationsfehler.

Parent änderte separat manager.add(): autorisierter expliziter Browser startet den
vorhandenen Singleflight-Connect. Import/Konstruktion bleiben lazy, disabled wird
abgewiesen, Flag-off während Token-Await öffnet keinen Socket, Fehler bleiben generisch.
Quellprüfung manager.ts:49–59 und eigene Ausführung von bootstrap.test.ts:
vier Tests grün, zwei Browser verwenden einen Core-Socket und online ohne ersten RPC.
Der isolierte Initial-offline-Repro bleibt als Evidenz des früheren Deadlocks erhalten;
er simuliert absichtlich keinen nun durch den Parent hinzugefügten Server-Connect.

## Bestätigte Clientgrundlagen

- Owner, Auswahl und Draft sind getrennt; Mehrfach-Leases einer Session, A/B,
  echte React-StrictMode-Replays und 20 aktive Sessions an einem Tab-Socket getestet.
- Mehrstufige Schreibaktionen prüfen vor Folge-Send Owner-/Auswahlbindung;
  neue Drafts bleiben bei spätem Submit erhalten. Kein automatischer erster Prompt nach Create.
- Flag-off räumt sofort mit tatsächlichem Closegrund v2-disabled auf;
  60 Sekunden ohne Folgetraffic/Stop/Replay, Timerbereinigung in vorhandenen Tests bestätigt.
- Gemeinsames Budget 192/256, Pending-Mutationsdrain, Readgenerationen, Stopreserve
  einschließlich freier Pending-Slots und kontrollierte Rotation in Tests bestätigt.
- Unknown-Submit bleibt bei Timeout/Verlust bestehen. Nur ausdrückliches Resend nach
  Resync/Doppelwirkungsbestätigung oder lokale Continue-Aktion hebt ihn auf.
  Verlorene Secretantwort erhält keinen gespeicherten Resendtext.
- Synchrone geordnete Events ohne RAF-Altbatch, kleinere Same-Epoch-Snapshotcursor,
  alte History-/Catalog-/Subscriberesultate und Eventbufferüberlauf geprüft.
- Row-/UID-Crosswalk ohne Textdedupe; unterschiedliche gleiche Texte bleiben getrennt.
  Toolvorkommen sind turnbezogen, historisches complete und error:null bleiben Outcome unknown.
- History-/Text-/Draft-/Send-/Framegrenzen und Retry-/RPC-/Handshake-Cleanup sind explizit.
  Keine zusätzliche Transcriptpersistenz im geprüften Client.

## Ausgeführte Checks und Reproduktion

- `pnpm --filter @wrapt/web exec vitest run` mit chat-state.test.ts,
  gateway-client.test.ts, chat-runtime.test.ts, chat-runtime-races.test.ts,
  useHermesV2Chat.test.tsx im Featureordner: 5 Dateien/64 Tests grün.
- `pnpm --filter @wrapt/web exec vitest run --config /tmp/hermes-v2-phase3-gate.4ExbHf/vitest.config.mjs`:
  sechs beobachtete Reproabläufe grün, davon zweimal Modellrace und zweimal Session-ID-Mismatch.
- `pnpm --filter @wrapt/server exec vitest run src/hermes/v2/bootstrap.test.ts`: 4 Tests grün.
- `pnpm --filter @wrapt/web typecheck`: grün.
- Gezieltes ESLint für chat-*.ts, gateway-*.ts und useHermesV2Chat samt Hooktest:
  `--max-warnings=0`, grün. `pnpm architecture:file-lines`: grün.

Root-Browserläufe sind ergänzende Parent-Evidenz, nicht selbst ausgeführte Nachweise
dieses Gates. Der erwähnte ältere UI-Build deckt spätere Client-Races nicht automatisch ab.
Nach M1–M3 gezielte gesunde Regressionen und unabhängiger Recheck erforderlich.
Sidebar-/Suchpagination, Requests-UI, Cron und übrige spätere Featurephasen sind bewusst
offen und kein zusätzlicher Befund dieses begrenzten Gates.

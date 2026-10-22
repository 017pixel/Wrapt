# Hermes V2 Phase 2: unabhängiger Protokoll-/Sicherheits-Recheck R4

**Entscheidung: needs fixes. Zwei Medium-Befunde, kein neuer High-Befund.**
Die ursprünglichen Repros A/B/C sind im geprüften Stand geschlossen. Die genaue
Vorsendgrenze und Claimfreigabe sind noch unvollständig. Deshalb keine Freigabe
zur Parent-Appintegration aus diesem Gate; das Gesamtfeature ist ohnehin nicht freigegeben.

Stand: 16.10.2026, geteilter Checkout. Originalattachment, sämtliche angegebenen
Security-Gates/Fixberichte einschließlich `hermes-v2-phase2-protocol-error-fixes.md`
gelesen. Betroffene Produktquellen, Fake und neue Tests direkt geprüft.
Nur dieser neue Bericht wurde angelegt. Keine Implementierung, Registrierung,
Git-Aktion, Dienste, Nutzerpreviews, echten Hermes-Calls/Claims oder weiteren Agents.

## R4-M1, Medium: Mutation wird bereits vor Sendannahme als möglicherweise gesendet behandelt

Belege relativ zu `apps/server/src/hermes/v2/`: `upstream.ts:77`, `:79`, `:87`,
`:90`, `mutation-outcome.ts:14`, `:24`, `session-service.ts:69`.
Pending hält das angeforderte `mutation`-Boolean, keinen tatsächlichen Sendzustand.
Der gemeinsame Catch für Serialisierung und synchrones `socket.send` meldet bei
Mutationen stets `unknown`. `MutationOutcome` behandelt auch jeden gewöhnlichen
Fehler von `respond` pauschal als möglicherweise gesendet.

Eigene Fault-Injection: Nur den betreffenden Mutationsframe in `socket.send`
synchron abweisen, bevor die ursprüngliche Sendfunktion aufgerufen wird.
Submit, Create und Clarify-Lock liefern `GATEWAY_OFFLINE/unknown`, Response liefert
`OPERATION_FAILED/unknown`. Der Fake empfängt jeweils null Mutationen/Responses.
Nach Wiederherstellung des Sends bleiben Response und Lock `REQUEST_CLAIMED`.

Zusätzlicher Kapazitätsrepro: frischer Fake, `maxSessions:1`, Verbindung mittels
`sessions.list`, ausschließlich Create-Send synchron abweisen. Es entsteht keine
Runtime und kein Sessionrecord. Trotzdem bleiben nach Flag-off Schutzreservierung
und Socket erhalten; nach Wiederanmeldung scheitert Create mit `RATE_LIMITED`.
Die identitätslose Reservierung ist ohne jemals erzeugte Runtime nicht belegbar abbaubar.

Erforderlich: Serialisierung vor der Sendmarkierung; tatsächliche Annahme an der
Transportgrenze erfassen. Nachweisliche Vorsendablehnung bleibt `not_sent` und
gibt ihre Reservierung frei. Callback-/Timeout-/Result-/Folgefehler nach möglicher
Annahme bleiben `unknown`. Keine automatischen Mutationswiederholungen ergänzen.
Der Repro injiziert eine bewiesene Vorsendablehnung; er behauptet nicht, dass jeder
beliebige Transportfehler oder Throw sicher wirkungslos ist.

## R4-M2, Medium: nachweislich ungesendete Response behält ihren Claim

Belege: `operations.ts:60` bis `:64`, `request-registry.ts:75`, `:84`.
`request.respond` übernimmt das Claimtoken, verwendet es bei Sendfehlern aber nicht
zur Freigabe. Auch ein korrekt als `not_sent` eingeordneter Fehler bleibt gesperrt.
Ein aktueller Open-Requests-Abgleich am weiterhin lebenden Transport löst ihn nicht.
Die Korrektur von R4-M1 allein behebt diesen zweiten Pfad daher nicht.

Eigener separater Repro: `upstream.respond` vor jeglichem Send einmal mit
`GatewayError(..., "not_sent")` abbrechen. Erste Browserantwort ist korrekt
`GATEWAY_OFFLINE/not_sent`. Originalfunktion wiederherstellen und bewusst erneut
antworten: `REQUEST_CLAIMED/not_sent`, null Fake-Responses, Transport weiter online.
Ohne Transportende, externe Beantwortung oder Poolentsorgung bleibt der Request blockiert.

Erforderlich: Bei bewiesenem `not_sent` ausschließlich das eigene Claimtoken lösen.
Bei `unknown` bestehenden Transportende-/Open-Abgleich beibehalten. Keine fremden
oder neueren Claims lösen, keinen automatischen Retry auslösen.

## Ausführbarer gemeinsamer Minimalrepro für beide Response-Pfade

Vom Repo-Root aus; ausschließlich vorhandener Fake auf OS-zugeteiltem Loopback-Port.
Die vorhandene Testfixture legt ihr CWD temporär an und entfernt es im Cleanup.

```sh
node --import ./apps/server/node_modules/tsx/dist/loader.mjs --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { securityFixture, clientMessage as msg } from './apps/server/src/hermes/v2/security-test.fixture.ts';
import { GatewayError } from './apps/server/src/hermes/v2/errors.ts';
for (const mode of ['sync-send', 'known-not-sent']) {
  const f = await securityFixture();
  try {
    const s = f.gateway.seed('r4-own-fake');
    await f.manager.handle('tab', msg({ op: 'session.subscribe', sessionId: s.id }));
    f.gateway.request(s, 'approval', { choices: ['once', 'deny'] });
    for (let i = 0; i < 100; i++) {
      if (f.manager.sessions.records.get(s.id).snapshot.requests.length) break;
      await delay(3);
    }
    const q = f.manager.sessions.records.get(s.id).snapshot.requests[0];
    assert.ok(q);
    const body = { op: 'request.respond', sessionId: s.id, requestKey: q.key,
      epoch: q.epoch, response: { kind: 'approval', choice: 'once' } };
    const socket = f.manager.upstream.socket; // TS-private, nur im JS-Fault-Repro.
    const send = socket.send.bind(socket);
    const respond = f.manager.upstream.respond.bind(f.manager.upstream);
    if (mode === 'sync-send') {
      socket.send = (raw, ...args) => {
        if (JSON.parse(raw).id === 'srq-test') throw Error('FAKE_PRE_SEND');
        return send(raw, ...args);
      };
    } else {
      f.manager.upstream.respond = () => {
        throw new GatewayError('GATEWAY_OFFLINE', 'Fake vor Send.', 'not_sent');
      };
    }
    await f.manager.handle('tab', msg(body));
    const first = f.messages.at(-1);
    assert.equal(first.outcome, mode === 'sync-send' ? 'unknown' : 'not_sent');
    socket.send = send;
    f.manager.upstream.respond = respond;
    await f.manager.handle('tab', msg(body));
    assert.equal(f.messages.at(-1).code, 'REQUEST_CLAIMED');
    assert.equal(f.gateway.responses.length, 0);
    console.log(mode, first.outcome, f.messages.at(-1).code);
  } finally {
    await f.close();
  }
}
NODE
```

## Bestätigte Korrekturen A/B/C

A: Angenommene Submit-/Stop-/Steer-/Modell-/Lock-Mutationen mit ungültigem Resultat
bleiben `unknown`. Ebenso fehlendes Resultat, RPC-Error, falscher ID-Typ, unbekannte
numerische ID bis Timeout, defektes JSON und nachgelagerter Request-Abgleich.
Korrelations-ID bleibt korrekt; genau ein Mutationssend, kein Retry. Create/Resume
mit nachgelagertem Schema-/CWD-/Snapshotproblem bewahren den möglichen Send.
Resume mit verbotenem Antwort-CWD bleibt bewusst nur lesbar. Ein fehlerhafter
Activate-Preflight vor Submit bleibt `not_sent` und sendet keinen Prompt.

B: Reservierung liegt vor Create/Resume-Send. Eigene Repros mit Vertrag 9, leerer,
fehlender oder falscher Live-ID, Nullantwort, malformed Frame und Flag-off während
Resume halten die fremde True-Flag-Runtime. Zwei bereits eingereihte Subscribes
senden nach Abbruch keinen zweiten Resume. Auch Receive-/Normalizer-/RPC-ID-Fehler
quarantänisieren ohne absichtlichen Last-Viewer-Kill. Mainabschluss allein reicht
nicht: Subagent, Prozess und offener Request halten einzeln den Socket. Erst nach
belegtem Ende aller Ebenen wird freigegeben. Widersprüchliche Identität bleibt
geschützt. Im ereignisfreien Prüfintervall entsteht keine neue Lifecycle-Pollfolge.
Quellen: `attachment-protection.ts:25`, `:63`, `manager.ts:65`, `:219`, `:241`.
Installierter Core `session_lifecycle.py:1001` bestätigt die Disconnect-Gefahr.

C: Installiertes `server.py:746` bis `:761` baut Globalframes mit leerer Session-ID.
Alle 15 unterstützten Globaltypen unabhängig mit zwei abonnierten Sessions geprüft:
nur `sessions.changed` erzeugt Listeninvalidation, fremde Payloadinhalte gelangen
nicht zum Browser, Sessioncursor bleiben unverändert. Anschließender
Fake-Sessionevent erreicht nur seine Bindung. Leere Message-/Thinking-/Tool-/Subagent-/
Error-IDs und unbekannte globale Typen werden abgewiesen; ungültige Seq/Payload ebenso.
Quellen: `upstream-schemas.ts:10`, `manager.ts:222`, `:227`. Kein Wildcard-Fanout.

## Alte Findings und ausgeführte Checks

H1 bleibt geschlossen: poolweite Secretkenntnis und kanonische JSON-Varianten
direkt geprüft; eigener Zwei-Principal-Fake maskiert geschachtelte Toolinputs und
Outputs. H2 bleibt geschlossen: eigener Create/Submit/Epochwechsel verwirft
Ownership; Flag-off hält die fremde Runtime bis Completion. M2 bleibt geschlossen:
eigene sechs Mutationsvarianten mit Flag-off im letzten Preflight senden nichts.
M3 bleibt geschlossen: 200.000 kurze Secretzeichen in Text/Reasoning bleiben bei
zwei Principals gültig und maskiert. Requeststatus bleibt `sent`, keine Annahmezusage.
Altes M1 für verlorene Sends bleibt geschlossen: eigener Transportverlust, gleicher
Epoch und autoritativer Abgleich erlauben genau einen bewussten Retry. Der neue
bewiesene Vorsendfall ist davon getrennt und in R4-M2 noch offen.

- `pnpm --filter @wrapt/server exec vitest run src/hermes`: 21 Dateien, 211 Tests grün.
- Eigene Inline-Fakes ohne neue Skriptdateien: 40 positive Assertiongruppen;
  sechs zusätzliche Fault-/Kapazitätsgruppen bestätigen die beiden offenen Befunde.
- `pnpm typecheck`: alle Packages, Server, Web und E2E grün.
- `pnpm exec eslint apps/server/src/hermes/v2 packages/contracts/src/hermes-v2*.ts --max-warnings=0`: grün.
- `pnpm architecture:file-lines`: abschließend grün, 1698 Dateien, Manager 391 Zeilen.

## Grenzen und Übergabe

Parent-Belege `hermes-v2-phase2-runtime-smoke.md` und
`temp/hermes-v2/real-gateway-smoke.json` gelesen: beide Browser erhalten echten
persistierten Abschluss und Invalidation; History/Reload ohne Framefehler.
Das ist ergänzende Parent-Evidenz, kein eigener Realtest und keine Widerlegung der
Fehlerpfade. Alle eigenen Fake-Sockets/Pools wurden entsorgt. Keine Realcalls.
Bekannte Grenzen bleiben Netz-/Library-Abbruch, Orphan-Reaper, Filesystem-TOCTOU,
flüchtige Secretkenntnis und begrenztes Replay. Vor Parent-Appintegration zuerst
R4-M1/R4-M2 schließen und gezielt unabhängig nachprüfen; keine Gesamtfeature-Abnahme.

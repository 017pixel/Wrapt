# Hermes V2 Phase 2: unabhängiger Vorsend-Recheck R5

**Entscheidung: PASS. R4-M1 und R4-M2 geschlossen.**
Keine offenen High-/Medium-Befunde im eng vereinbarten Recheck-Scope.
Der Parent darf Appintegration und Phase 3 beginnen. Das ist kein Gesamtfeature-PASS.

Stand: 16.10.2026, geteilter Checkout. Ausschließlich die beiden R4-Mediums
und direkt betroffene Regressionen geprüft. Originalattachment sowie alle sieben
angegebenen Security-/Protokoll-Gates und Fixberichte vollständig gelesen,
einschließlich der vollständigen R5-Antwort `hermes-v2-phase2-presend-fixes-r5.md`.
Produktpfade und Assertions selbst geprüft; frühere Gates nicht bloß übernommen.
Parent-Smokebericht und `temp/hermes-v2/real-gateway-smoke.json` ergänzend gelesen.

## R4-M1, Medium: geschlossen

Belege unter `apps/server/src/hermes/v2/`: `send-boundary.ts:5`, `:11`, `:26`,
`upstream.ts:72`, `:80`, `:97`, `mutation-outcome.ts:8`, `:19` sowie
`session-service.ts`, Funktionen `create` und `attach`.

Serialisierung liegt vor Send und RPC-Pending. Synchrone Ablehnung vor dem
Originalsend ergibt bei unveränderten lokalen Schreib-/Pufferzeugen `not_sent`.
Pending und eigene Create-/Resume-Schutzreservierung werden freigegeben.
Die lokale Quelle von ws **8.21.3** wurde direkt gelesen, insbesondere
`websocket.js:120`, `:448` und `sender.js:351`, `:500`, `:550`.
Prüfruntime: Node **v26.5.1**. Ein Throw allein beweist keinen Vorsendfehler.

Eigene Matrix: Create, Resume, Submit, Stop, Steer, Modell, Response und Lock,
jeweils synchrone Vorsendablehnung und Serialisierungsfehler. Alle 16 Gruppen:
`not_sent`, null zusätzliche Mutationen, Pending leer, keine Schutzreservierung,
gleicher lebender Transport; erst bewusster Retry sendet genau einmal.
Zwei weitere Create-Gruppen mit `maxSessions:1` bestätigen: null Runtime/Records,
kein Retain nach Vorsendfehler, Flag-off entsorgt den Socket und eine frische
Browseranmeldung kann erfolgreich erstellen. Keine Phantom-Kapazität verbleibt.

Gegenmatrix mit fünf Formen, Create/Resume/Submit/Response/Lock, jeweils:

- Originalsend ausführen, danach synchron werfen.
- Ersten echten Node-Socket-Write annehmen, zweiten Write synchron ablehnen.
- Originalsend mit anschließendem Write-Callbackfehler.
- Lokalen Callback und bei RPC zusätzlich die Antwort unterdrücken, Timeout abwarten.
- Ohne Write und ohne Callback zurückkehren, Timeout abwarten.

Alle 25 Gruppen ergeben `unknown`, genau einen Sendversuch, erhaltenen Schutz
und bei Requests keinen eigenen Unlock. Der Teilwrite-Repro prüft tatsächlich
zwei Writeaufrufe und einen veränderten Byte-/Pufferzeugen; er setzt nicht bloß
ein Fehlerflag. Unvollständige Frames bleiben im eigenen Testtransport.
Bei fehlendem Socketzeugen, allein geändertem Puffer und beobachtetem synchronem
Callback bleibt die direkte Sendgrenze ebenfalls konservativ `unknown`.
Zyklische/BigInt-Serialisierung bleibt `not_sent`. Keine automatische Wiederholung.

## R4-M2, Medium: geschlossen

Belege: `operations.ts:63` bis `:70`, `:78` bis `:88`,
`request-registry.ts`, tokengebundenes `unlock`, und `mutation-outcome.ts:19`.
Nur ein operationsweit bewiesenes `not_sent` löst `answer.token`.
Bei `unknown` bleiben Transportende und autoritativer Open-Abgleich erforderlich.

Den ausführbaren R4-Minimalrepro mit beiden Modi erneut ausgeführt, nur die
Erfolgsassertions korrigiert: `sync-send` und `known-not-sent` ergeben zuerst
`GATEWAY_OFFLINE/not_sent`, null Responses und keinen automatischen Retry.
Der bewusste Folgeversuch am selben Transport ergibt `result/status=sent`
und genau eine Response. Response und Clarify-Lock bestehen auch die getrennten
Serialisierungs-/Sendfehlerprüfungen mit anschließendem bewussten Retry.

Zwei eigene asynchrone Rennen: Alte Response hält einen verzögerten Fehler;
nach echtem Fake-Transportende und frischem Open-Abgleich beansprucht entweder
derselbe oder ein anderer Principal den Request neu. Erst dann kommt das alte
`not_sent`. Ausschließlich der alte Token wird an `unlock` übergeben;
beide neuen Claims bleiben gesperrt, null Responses. Aktive fremde Claims und
verspätete Lock-Unlocks bestehen zusätzlich die gezielten Bestandstests.

## Direkt berührte Regressionen A/B/C

A: Nach erfolgreichem lokalem Response-Write bleibt ein späterer ausdrücklich
`not_sent`-Lesefehler operationsweit `unknown`; kein Claim-Unlock. Angenommene
Mutationen mit defektem Resultat sowie Create-/Resume-Folgefehler bestehen die
gezielten Protokolltests. `sent` bleibt eine lokale Sendbestätigung.

B: Eigener Resume-Repro mit Originalsend plus Throw hält die fremde
`close_on_disconnect:true`-Runtime nach Flag-off. Hauptabschluss, Subagentende
und Prozessende reichen einzeln nicht; offener Request hält weiter. Erst dessen
Settlement entfernt den Schutzsocket. Kein Stop/Close, kein zweiter Resume.
Ein Writefehler der unbekannten Serverrequest-Ablehnung quarantänisiert ebenfalls
geschützt und entsorgt erst nach belegtem Settlement.

C: Nach `not_sent` bleiben globale Leer-ID-Events kompatibel: einmalige
Listeninvalidation, keine Übernahme fremder Payload, unveränderter Sessioncursor
und anschließender Sessionabschluss. Gültige unbekannte `srq-*`-Requests erhalten
weiterhin genau eine `-32601`-Antwort. Der vorhandene vollständige Globaltyp-Test
und die negativen Session-ID-Prüfungen bestehen ebenfalls.

## Ausgeführte Checks und Grenzen

- **57 eigene positive Prüfgruppen**: 2 R4-Repros, 18 Vorsend-/Kapazitäts-,
  25 Unknown-, 8 Token-/Zeugen- und 4 gezielte A/B/C-Gruppen, inline ohne Skriptdateien.
- `pnpm --filter @wrapt/server exec vitest run --cache=false` mit ausschließlich
  `src/hermes/v2/{presend,protocol-errors,protocol-events,security-mutations,request-registry}.test.ts`
  als fünf expliziten Argumenten: **116 Tests grün**, einschließlich aller 13 neuen.
- `pnpm typecheck`: Extension-Contracts, Contracts, Server, Web und E2E grün.
- `pnpm architecture:file-lines`: grün, 1700 Dateien; Manager 391 Zeilen.
- SHA-256-Vergleich der 46 V2-/Hermes-V2-Contracts-Dateien zur eigenen Baseline:
  unverändert. Alle eigenen Fake-Sockets, Pools, CWDs und fünf Vitest-Setup-Ordner entfernt.

Einzige neue Schreibdatei ist dieser Bericht. Keine Produktänderung, Registrierung,
Gitoperation, Dienste, Previews, echte Hermes-Anfrage, neue Datenbank oder Subagents.
Keine erneute volle Hermes-Suite oder unverwandte Auditwelle ausgeführt.
Die Parent-Belege bestätigen positiven echten Abschluss/History/Reload, ersetzen
aber keinen eigenen Fehlerpfadnachweis; hier fanden ausschließlich Fakes statt.
Die Sendzeugen gelten für die geprüfte lokale ws-/Node-Implementierung.
Netz-/Library-Abbruch, Orphan-Reaper, Filesystem-TOCTOU, flüchtige Secretkenntnis
und begrenztes Replay bleiben die dokumentierten Grenzen. Keine neue Gesamtfreigabe.

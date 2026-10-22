# Hermes V2: Phase-5-Clientimplementierung

Stand: 16.10.2026. Nonvisueller Phase-5-Client umgesetzt und Produktdateien
eingefroren. Autorenbericht, kein unabhängiger Gate-PASS und keine Gesamtfreigabe.
Phase 6 unbegonnen. Phase-4-Organisationsdateien unverändert.

## Auftrag und stabile UI-API

Originalauftrag, vollständiger requests-handoff, phase5-client-task und
Phase-4-Clientgate R8 gelesen. Die additive Schnittstelle zuerst veröffentlicht
und Root unmittelbar gemeldet. respond(request,response): Promise<void> bleibt.
Neu lockRequest(request,questionId,answer:string|null): Promise<void> sowie
requestStates: readonly {key,epoch,status:'pending'|'unknown'}[]. Beide Actions
resolven, Fehler stehen im Viewmodel. Die Liste enthält keine Antwortwerte.
Root und GLM besitzen weiterhin ihre jeweiligen UI-/Browserfixtures.

## Umsetzung und betroffene Dateien

- chat-requests.ts hält die synchrone Klicksperre gemeinsam pro Epoche und opaque
  Requestkey. Unterschiedliche Root-/Tip-Session-IDs teilen sie; jeder Send prüft
  trotzdem seine ausgewählte kanonische Sitzung und genau deren offene Anfrage.
  Respond/Lock kollidieren bewusst, andere Requests bleiben unabhängig.
- chat-request-response.ts validiert über den öffentlichen Zod-Vertrag und die
  aktuellen angebotenen Optionen. Aktuelle lockedAnswers überschreiben veraltete
  lokale Clarifywerte, einschließlich null. Multiple bleibt JSON im Stringfeld;
  Freitext, cancel und Setup picked:null behalten die native Semantik.
- chat-types.ts, chat-actions.ts und useHermesV2Chat.ts veröffentlichen und
  verdrahten die vereinbarte API. chat-owners.ts projiziert gemeinsame Zustände
  passend zur aktuellen eigenen Session/Epoche ohne globalen Active-Session-Zustand.
- chat-runtime.ts versorgt die Requestprojektion ausschließlich bei Snapshots,
  tatsächlich geänderten Requests und Dispose. Tokens lösen keine Owner-/Request-
  Statusbenachrichtigungen aus. Belegtes Schließen entfernt dieselbe Anfrage auch
  aus lokal bekannten Aliasansichten. Bestehender Socket und GatewayPending bleiben.

Vor dem ersten Await werden Owner, Auswahl, Sitzung und Requestepoche geprüft
und der gemeinsame Eintrag synchron gesetzt. Nach jeder Vorbereitung und direkt
vor Send werden Owner, tatsächliche Dokumentsichtbarkeit, active/visible, Flag,
aktueller Request, Socket, Synchronisierung und Schreibbarkeit erneut geprüft.
Ein Wechsel im Microtaskfenster nach prepare ist ausdrücklich abgesichert.

Nach einem autorisierten Send gehört der Eintrag dem ursprünglichen Runtime.
Ownerausstieg entzieht einem gültigen zweiten Owner weder Status noch Cleanup.
Mapeintragsidentität begrenzt späte Erfolge/Fehler auf denselben Eintrag; Flag-off,
Off/On, neue Epoche oder ein neuer gleichnamiger Eintrag werden nicht verändert.

Respond status='sent' bestätigt keinen verschwundenen Core-Request. Solange er
weiter offen projiziert wird, bleibt pending bestehen und verhindert zweiten Send.
Erst request.closed beziehungsweise ein aktueller Snapshot ohne die Anfrage
entfernt die Sperre. Lock wird erst nach autoritativem lockedAnswers für diese
Frage wieder frei, sofern weitere Fragen offen sind. Der letzte Lock kann schließen.

Unklarer Send, Timeout, Socketverlust oder verlorener Bestätigungsread behalten
unknown ohne Antwortwerte. Kein automatischer Retry und kein Secret-Resendtext.
Eine weiterhin offen bestätigte Anfrage bleibt gesperrt; Abgleich/Classic sind
der Rückweg. Ein belegter Lock kann weitere Fragen freigeben. Zustände sind auf
maximal chatPolicy.maxPending begrenzt und werden bei Dispose vollständig geleert.
Nachweislich nicht gesendete Fehler geben die Sperre frei. Fehlertexte stammen
aus festen deutschen Meldungen, freie Servertexte werden dafür nicht übernommen.

Secretwerte existieren nur flüchtig im Transportpfad. Keine Antwort in Entries,
Draft, unknownSend, Fehler, Persistenz oder Wiederholungspayload; GatewayPending
speichert weiterhin nur Metadaten. DOM-Maskierung und synchrones Leeren gehören
zum getrennten GLM-Scope und werden hier nicht als geprüft ausgegeben.

## Eigene Regressionen und Bestandsänderung

Neue Dateien chat-requests.test.ts, chat-request-lifecycle.test.ts,
chat-request-response.test.ts und Public-Zod-Fixtures chat-request-test-fixtures.ts.
useHermesV2Chat.test.tsx ergänzt zwei echte Hookfälle unter StrictMode beziehungsweise
zur Grenze ohne Tokenbenachrichtigung. Insgesamt 51 zusätzliche Fälle:

- Synchrone Doppelantwort, zwei Owner, Root-/Tip-Alias, Respond/Lock-Kollision,
  unabhängiger anderer Request und begrenzte gemeinsame Einträge samt Dispose.
- Cancel, stale Key/Epoche/Sitzung, Auswahlwechsel, Release, geparkt, verborgen,
  tatsächliches hidden und Readonly während Vorbereitung; letzter Microtaskguard.
- Ownerausstieg nach Send jeweils Erfolg/not_sent/unknown und beide Aliasformen;
  Sessionwechsel nach Send erhält fremden neuen Draft und Bs gemeinsamen Status.
- Bestätigtes Respond mit noch offenem Snapshot, Lock-Snapshotbarriere, null,
  aktuelle lockedAnswers, letzter Lock, verlorener Lock mit späterem echten Beleg.
- Flag-off/OffOn, späte alte Antwort, neuer gleichnamiger Eintrag, lokale Timeouts,
  Sendthrow, fehlender Bestätigungsread, Reconnect und weiterhin kein Replay.
- Tatsächlich angebotene Approvaloptionen, Clarify-Multiple/Freitext/Cancel,
  Setup-ID-/Kardinalitätsprüfung und alle fünf Secret-/Vaultmethoden mit Dummywerten.
  Store, Ownerview und Draft enthalten keine Secret-/Retrywerte; Serverfehlertext
  wird nicht ins Request-Viewmodel kopiert.

Mit Root abgestimmt: Der bestehende eigene Phase-3-Secret-Racetest erhält nun einen
tatsächlich offenen Public-Request im Snapshot. Unknown erwartet er ausschließlich
im gemeinsamen requestStates statt im Draft-unknownSend. Die Assertion gegen
automatisches Replay bleibt erhalten. Keine externen Repros verändert.

## Ausgeführte Checks

- 25 nonvisuelle Featuredateien: **308/308 grün**, 257 Bestand plus 51 neue Fälle.
- Alle unveränderten Phase-4-Externfälle einschließlich R8: **172/172 grün** in
  16 Dateien, mit temp/hermes-v2/phase4-client-review/vitest.config.mjs.
- Gezieltes ESLint der geänderten nonvisuellen Module, Hook und eigenen Tests
  mit --max-warnings=0 grün. architecture:file-lines grün; größte geänderte Datei
  chat-runtime.ts mit 308, Requestmodul 147 Zeilen, alle unter 400.
- Vollständiges pnpm typecheck ausgeführt. Contracts und Server grün, Web zu
  diesem Zwischenstand ausschließlich wegen noch laufender GLM-UI-Dateien rot.
  Root übernimmt die vollständige Wiederholung nach UI-Freeze. Separates
  pnpm typecheck:e2e zusätzlich grün.

Keine Browser, Dienste, Previews, echten Coreaufrufe, Gitoperationen oder weiteren
Agents. Server/Contracts/Organisation/UI unverändert. Unabhängiger Clientreview,
UI-/Security-/Browserabnahme und Gesamtversionierung bleiben bei Root.

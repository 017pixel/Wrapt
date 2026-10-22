# Phase 7: fester Serververtrag

Stand: 17.10.2026. Root hat Phase 7 ausdrücklich freigegeben. Alle Ops verwenden
den vorhandenen Gateway, Sessionabo und `{v:1,id:<UUID>,op,sessionId,...}`.
Opt-in: `/api/v1/hermes/v2/gateway?work=1`, kombinierbar mit `composer=1&readEvidence=1`.
Ohne work=1 sind neue Ops verboten und neue work.*-Events werden tatsächlich entfernt.
Bestehende strikte Legacyframes, subagents.read und alte Events bleiben kompatibel.
Keine zusätzlichen Standaloneverbindungen oder Sidebarleases nötig.

## Reads und vollständige Listen

`work.read` hat keine weiteren Parameter. Resultdata ist `HermesV2WorkRoster` aus
`@wrapt/contracts/hermes-v2`, Schema `hermesV2WorkRosterSchema`:

- revision: monotone nichtnegative Beobachtungsrevision innerhalb derselben Sessionbindung.
- subagents: höchstens100 vollständige `HermesV2WorkSubagent`-Zeilen.
- delegations: höchstens100 vollständige `HermesV2WorkDelegation`-Zeilen.
- processes: höchstens100 vollständige `HermesV2WorkProcess`-Zeilen.
- tasks: höchstens100 vollständige `HermesV2WorkTask`-Zeilen.
- queuedText: string|null, ausschließlich der native nächste Kopf aus dem bestehenden
  writable/Activate-Reply. Kein Wert aus letzter Submitquittung, keine FIFO/Anzahl.
- coverage: `{subagents:"live-and-observed",delegations:"recent-failures-partial",
  processes:"session",tasks:"observed-partial",queue:"next-only",truncated:boolean}`.

Listen sind ein vollständiger Ersatz der belegten begrenzten Sicht, keine Patches.
Verschwinden belegt keinen erfolgreichen Abschluss. Native Livekinder plus konkret
beobachtete Ereignisse, kürzlich fehlgeschlagene Delegationen, sessiongebundene Prozesse
und tatsächlich beobachtete Nebenaufgaben sind getrennte Domänen. Teilabdeckung bleibt
auch bei leerer Liste ausdrücklich bestehen. Stille native Delegationslesefehler sind
nicht unterscheidbar von keiner jüngsten Fehlerdelegation.
Bei während des Reads geänderter Workrevision wird der alte Read als STALE_REQUEST
verworfen; keinen älteren vollständigen Roster über neuere Patches legen.

## Identitäten und Werte

Subagent: `{kind:"subagent",id,parentId,depth,delegationId,goal,model,startedAt,
status,toolCount,lastTool,acceptingSteer,durationMs}`. Alle außer kind/id sind nullable.
status ist queued|running|completed|failed|error|timeout|interrupted|null.

Fehlerdelegation: `{kind:"delegation",delegationId,taskIndex,status,goal,error,
dispatchedAt,completedAt}`. Identität ist **beide** delegationId+taskIndex;
alle übrigen Felder nullable. Keine Kindersteuerung über Fehlerdelegationen.

Prozess: `{kind:"process",id,command,status,startedAt,uptimeSeconds,output,exitCode}`.
id ist die native Prozesskennung, niemals die Chatsession. output ist string, alle
weiteren Nutzfelder nullable. Output höchstens16KiB, Exitcode ganzzahlig oder null.

Nebenaufgabe: `{kind:"background"|"btw",id,status:"running"|"completed",text:string|null}`.
id ist echte task_id. Identitäten stets über kind plus native Kennung bilden;
gleichlautende IDs verschiedener Domänen sind verschiedene Zeilen.
Zeitwerte sind Unix-Millisekunden oder null. Routing-IDs werden nie redigiert;
Anzeigetexte, Ziele, Fehler, Modelle und Ausgaben werden begrenzt und redigiert.
Beobachtete Nebenaufgabentexte werden auf16KiB begrenzt. Auch die Gesamtantwort
hält das Browserbudget; weggelassene Zeilen oder Texte setzen coverage.truncated.

## Teilereignisse

`work.updated`: vorhandener Eventenvelope, payload `{revision,change}`.
change ist `HermesV2WorkPatch`: Subagent-, Delegations- oder Nebenaufgabenzeile mit
Pflichtidentität und sonst **optionalen** Feldern. Ausgelassen bedeutet unverändert,
explizit null bedeutet unbekannt. Niemals fehlendes Goal/Modell/Start/Count löschen.
Ein konkreter nativer Ereignistyp oder Payload belegt einen Zustand, Tokenmengen nicht.

`work.invalidated`: payload `{revision,reason:"roster"|"queue"}`. Bei sichtbarer aktiver
Session begrenzt zusammenfassen und work.read anfordern; keine dauerhafte Pollschleife.
Thinking-/Tokenfortschritt invalidiert weder Sidebar noch Katalog.
Completion vor Startreceipt bleibt terminal, späteres Receipt setzt sie nicht running.
Eine Completion mit konkreter task_id ist auch ohne Startsnapshot gültiger Abschluss.
Fehlende laufende Nebenaufgaben werden nach Reconnect niemals erfunden.

## Native Aktionen und exakte Resultdata

| op | Zusatzparameter | result.data |
| --- | --- | --- |
| work.subagent.interrupt | subagentId | `{id,found:boolean}` |
| work.subagent.tail | subagentId | `{id,available:boolean,text,truncated:boolean}` |
| work.process.kill | processId | `{id,status,exitCode,output,error}` |
| work.background | text | `{kind:"background",taskId}` |
| work.btw | text | `{kind:"btw",taskId}` |

Killstatus ist killed|already_exited|not_found|error. error ist string|null.
Tailtext und Killoutput höchstens16KiB. Keine freie RPC-/Shell-/globale Stopaktion.
Native Ziel-ID wird vor jedem Interrupt/Tail/Kill durch frischen eigenen Roster geprüft.
Sichtbarkeit über dauerhafte Lineage garantiert keine exakte aktuelle Steuerbarkeit;
found=false/available=false sind gültige ehrliche Nativeantworten.
Alle Mutationen verwenden vorhandene SessionOperationQueue/MutationOutcome und
gefrorene Owner-/Connection-/Abo-/Live-/Epoch-/Transport-/CWD-/Scopebindung.
Nach möglicher Annahme und erkanntem Kontextverlust unknown, niemals automatischer Retry.
Ein Nebenabschluss beendet weder Hauptturn noch andere Nebenaufgaben.

Queue weiter über `message.submit` mit `mode:"queue"` und nativem queued=true.
Steer weiter über `session.steer`; Resultstatus queued|redirected|rejected erhalten.
Continue nutzt bestehenden Chatpfad. StopTree ist unsupported und hat keine Op.

Quellen: installierter Core07908be, methods_subagents.py, methods_tools.py,
methods_prompt.py, session_auto_continue.py und deren contracts. Contracts sind
die verbindliche TS-/Zoddefinition. Keine neue Hermesruntime oder Inhalts-SQLite.

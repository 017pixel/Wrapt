# Phase 7: feste nicht visuelle Client-/UI-Schnittstelle

Stand 17.10.2026. Rootfreigabe und gebauter Serververtrag liegen vor.
Wire ausschließlich gemäß `hermes-v2-phase7-interface.md`. Bestehende Chat-,
Request-, Composer- und Organisationsschnittstellen bleiben erhalten.

## Actions auf HermesV2Chat

```ts
refreshWork(): Promise<void>;
interruptSubagent(subagentId: string): Promise<void>;
readSubagentTail(subagentId: string): Promise<void>;
killProcess(processId: string): Promise<void>;
startBackground(text: string): Promise<void>;
startBtw(text: string): Promise<void>;
```

Bestehendes `submit(text?,"queue")` reiht nativ ein, `steer(text)` bleibt vorhanden.
Alle diese Actions resolven mit Fehlern/Zuständen im Viewmodel. Ein erfülltes
Promise<void> ist kein Erfolgsreceipt. Kein automatischer Mutationsretry.
`stop()` bleibt unabhängig von Workreads/-aktionen erreichbar.
Continue verwendet bewusst `submit(text)`; kein Resume-/StopTree-RPC.

## Viewmodel

`HermesV2Chat.work: ChatWorkView` ist ownergebunden. Typen und datenfreier
`emptyChatWork` kommen aus `chat-work-types.ts`. Keine eigenen Wireannahmen nötig.

```ts
interface ChatWorkView {
  available: boolean;
  loading: boolean;
  error: ChatErrorInfo | null;
  revision: number | null;
  coverage: HermesV2WorkRoster['coverage'] | null;
  subagents: readonly ChatWorkSubagentView[];
  delegations: readonly (HermesV2WorkDelegation & {key:string})[];
  processes: readonly (HermesV2WorkProcess & {key:string})[];
  tasks: readonly (HermesV2WorkTask & {key:string})[];
  counts: {subagents:number|null;processes:number|null;tasks:number|null};
  queue: {head:string|null;observed:boolean};
  actions: readonly ChatWorkActionView[];
}
interface ChatWorkSubagentView extends HermesV2WorkSubagent {
  key: string;
  parentKey: string | null;
  treeDepth: number;
  flat: boolean;
}
type ChatWorkAction = 'subagent.interrupt'|'subagent.tail'|'process.kill'
  |'background'|'btw'|'steer'|'queue';
interface ChatWorkActionView {
  key: string;
  action: ChatWorkAction;
  targetId: string | null;
  text: string | null;
  status: 'pending'|'confirmed'|'unknown'|'not_sent';
  result: ChatWorkResult | null;
  error: ChatErrorInfo | null;
}
type ChatWorkResult =
  | {kind:'subagent.interrupt';id:string;found:boolean}
  | {kind:'subagent.tail';id:string;available:boolean;text:string;truncated:boolean}
  | {kind:'process.kill';id:string;status:'killed'|'already_exited'|'not_found'|'error';
      exitCode:number|null;output:string;error:string|null}
  | {kind:'background'|'btw';taskId:string}
  | {kind:'steer';status:'queued'|'redirected'|'rejected'}
  | {kind:'queue';status:'streaming'|'queued'|'steered'|'redirected';userRowId:number|null};
```

confirmed bedeutet bestätigtes Nativeantwortresultat, ausdrücklich auch
found=false, available=false, already_exited, not_found, error oder rejected.
Die UI zeigt den konkreten Resultatwert. unknown ist möglicher ausgeführter Write;
not_sent ist nachweislich ungesendet beziehungsweise ein fehlgeschlagener Read.
Resultatwiderspruch nach tatsächlichem Send bleibt unknown, keine Erfolgsbehauptung.
Identische offene Aktion auf dasselbe Ziel/Text im tatsächlichen Ownerkontext
teilt dieselbe offene Operation. Andere Ziele/Wünsche bleiben unabhängig.
Nach Abschluss ist ein neuer bewusster Klick erlaubt. Aktionen sind begrenzt,
neueste am Ende. Native task_id steht ausschließlich im bestätigten Resultat.

queue.head stammt ausschließlich aus Snapshot/work.read. observed=false bedeutet
unbekannt, head=null bei observed=true bedeutet kein belegter nächster Kopf.
Queuequittungen stehen separat unter actions/action=queue. Ein zweites Einreihen
darf den ersten nativen Kopf weder ersetzen noch den Composer pauschal sperren.
Keine FIFO-Liste, Gesamtanzahl, Lösch- oder Sortieraktion behaupten.

## Darstellung und Lebensdauer

Rosterzeilen behalten die nativen nullable Felder. key enthält Domäne plus native
Identität, bei Delegationen beide delegationId+taskIndex. UI benutzt key für React
und native id für die jeweilige Action. Fehlerdelegationen haben keine Kindactions.
Der Client liefert sichere Baumreihenfolge. Fehlende Eltern, Zyklen oder fehlende
Hierarchiebelege ergeben flat=true, parentKey=null, treeDepth=0.

counts bleiben null bis zu einem vollständigen aktuellen Read. Danach zählen sie
belegte aktive Zeilen der begrenzten Sicht, keine globale vollständige Aktivität.
coverage bleibt ausdrücklich partiell bei Delegationen/Nebenaufgaben; truncated
anzeigen. Fehlender Roster ist keine belegte Null, Verschwinden kein Erfolg.
Teilereignisse erhalten ausgelassene Felder, explizit null ist unbekannt.
Konkreter Abschluss vor Startquittung bleibt abgeschlossen. Ein Abschluss mit
echter task_id darf ohne Start erscheinen, fehlende laufende Tasks werden nie erfunden.
Nebenabschlüsse ändern den Hauptturnstatus nicht.

Reads laufen nur bei sichtbarer aktiver ausgewählter Sitzung. Initiale und
strukturierte Invalidierungen werden begrenzt zusammengefasst; explizites
refreshWork ist möglich. Tail ausschließlich auf bewussten Klick, kein Polling.
Fehler stehen in work.error beziehungsweise actions[].error; bewusster neuer Read
klärt belegbare aktuelle Daten, wiederholt keine unbekannte Mutation.
Owner-/Session-/Sichtbarkeits-/Flag-/Socket-/Abo-/Snapshotwechsel entwerten alte
Antworten, Ziele und offene lokale Workzustände. UI schließt eigene Dialogziele
ebenfalls bei diesem Kontextwechsel. Keine Zusatzleases für Sidebarzeilen.

## Commands

`ChatCommandIntent` ergänzt native action `queue` und `steer`.
`resolveChatCommand` behält kanonischen Katalog, Aliase und Skillanweisungen.
UI führt Argumente ausschließlich bei bewusster Auswahl/Submit über die genannten
Actions aus; ohne Argument darf sie Eingabe fokussieren. Kein Ausführen in onChange,
keine rohe Slashzeile senden, kein freier Commanddispatch.

UI/Root besitzen Komponenten, Overlays, Browser-/E2E-Fixtures und Versionierung.
Clientautor besitzt ausschließlich nicht visuelle Workmodule und gezielte Integration.

# Hermes V2 Phase 8: fester nichtvisueller Clientvertrag

Stand 17.10.2026. Phase8 und die hier benannten Altverdrahtungen sind von Root
freigegeben. Grundlage ist der vollständig gelesene, gebaute Backendvertrag
`plans/hermes-v2-phase8-interface.md`. UI besitzt keine API- oder Fachzustandslogik.

## Hook und Lebensdauer

Export `useHermesV2Resources` aus `useHermesV2Resources.ts`, Typen aus
`resource-types.ts`. Fachtypen werden unverändert aus `@wrapt/contracts/hermes-v2`
übernommen; Layoutlabels bleiben in der UI.

```ts
type ResourceArea = "cron" | "skills" | "memory" | "diagnostics" | "session-delete";
interface HermesV2ResourcesOptions {
  ownerId: string;             // bereits gemounteter Chatowner, kein weiterer Owner
  enabled: boolean; active: boolean; visible: boolean;
  area: ResourceArea | null;
  signal: AbortSignal;
  deleteSessionId?: string | null;
}
```

Flag, Optionen, Dokumentvisibility und bestehender Owner werden zusammen geprüft.
Der Chatowner bleibt bestehen; sein eigener actualActive-Guard darf während einer
Ressourcenfläche false sein. Ressourcenaktivität kommt ausdrücklich aus diesen
Optionen und berechtigt niemals Chat-/Requestaktionen. Nullauswahl ist erlaubt.
Kein Acquire/Subscribe, zusätzlicher Socket, Poller oder Persistenzcache.

Hidden, Parking, Flagoff, Abbruch, Unmount, Ownerwechsel und A-B-A entwerten lokale
Generationen, Reads, Bestätigungen und verspätete Actionantworten. Native Inhalte
werden beim Verlassen der Fläche verworfen. Möglicherweise gesendete Aktionen sind
dadurch nicht storniert; deren lokale Quittung wird ehrlich unknown.

## Viewmodel

```ts
interface ResourceError {
  code: string; message: string;
  outcome: "not_sent" | "rejected" | "unknown";
  status: number | null; retryable: false;
}
interface ResourceRead<T> {
  status: "idle" | "loading" | "ready" | "missing" | "error";
  data: T | null; error: ResourceError | null; stale: boolean;
}
interface ResourceConfirmation {
  key: string; generation: number; targetId: string;
  operation: "cron.run" | "cron.delete" | "session.delete";
  paused: boolean | null;
}
interface ResourceActionView {
  key: string; operation: "cron.create" | "cron.update" | "cron.pause"
    | "cron.resume" | "cron.run" | "cron.delete" | "session.delete";
  targetId: string | null;
  status: "pending" | "confirmed" | "not_sent" | "rejected" | "unknown";
  result: HermesV2CronMutation | HermesV2SessionDeleted | null;
  error: ResourceError | null; reconciled: boolean;
}
interface HermesV2Resources {
  generation: number; available: boolean; area: ResourceArea | null;
  connection: ChatConnectionView; // derselbe tatsächliche Gatewayclient
  cron: {
    list: ResourceRead<HermesV2CronList>; selectedId: string | null;
    detail: ResourceRead<HermesV2CronDetail>; runs: ResourceRead<HermesV2CronRuns>;
  };
  skills: {
    list: ResourceRead<HermesV2ResourceSkills>; selectedName: string | null;
    detail: ResourceRead<HermesV2ResourceSkillDetail>;
  };
  memory: ResourceRead<HermesV2Memory>; pending: ResourceRead<HermesV2Pending>;
  diagnostics: ResourceRead<HermesV2Diagnostics>;
  sessionDeletion: ResourceRead<HermesV2SessionDeletionPreview>;
  actions: readonly ResourceActionView[];
  actionError: ResourceError | null;
  copy: { status: "idle" | "pending" | "copied" | "error"; error: ResourceError | null };
  // zusätzlich die folgenden Methoden
}
```

ready mit leerer nativer Liste ist empty; idle/error/missing sind keine erfolgreiche
leere Liste. Teilbelege, null, truncated, coverage und ResourceText.status bleiben
unverändert erhalten. Daten sind untrusted Text, keine HTML-/Dateipfadfreigabe.

## Aktionen und konkrete Bedeutungen

```ts
refresh(): Promise<void>; // nur aktuelle sichtbare Fläche, bewusst neu lesen
selectCron(jobId: string | null): void;
refreshCronDetail(): Promise<void>;
refreshCronRuns(): Promise<void>;
selectSkill(name: string | null): void; // ausschließlich aktuell exakt gelisteter Name
prepareCronConfirmation(operation: "run" | "delete"): ResourceConfirmation | null;
prepareSessionDeletion(): ResourceConfirmation | null;
createCron(fields: HermesV2CronFields): Promise<void>;
updateCron(jobId: string, updates: Partial<HermesV2CronFields>): Promise<void>;
pauseCron(jobId: string): Promise<void>;
resumeCron(jobId: string): Promise<void>;
runCron(confirmation: ResourceConfirmation): Promise<void>;
deleteCron(confirmation: ResourceConfirmation): Promise<void>;
deleteSession(confirmation: ResourceConfirmation): Promise<void>;
reconcileAction(key: string): Promise<void>; // bewusster Read, niemals Wiederholung
copyDiagnostics(): Promise<void>; // nur ausdrücklicher Klick, sichere Projektion
clearActionError(): void;
```

Promise<void> resolvt mit abgeschlossenem lokalem Ablauf, nicht mit einem behaupteten
Erfolg. Ausschließlich ActionView.status=confirmed plus validiertes result ist eine
positive native Quittung. Fehler bleiben im Viewmodel; UI hält eigene Formularentwürfe
bei Fehlern. Verschiedene Ziele sind unabhängig, gleicher Zielschlüssel wird synchron
reserviert. Offene Aktionen und Quittungen bleiben begrenzt; kein Textaktionsarchiv.

Cronwrites verwenden scope eines frischen Reads und ausschließlich sichere Fields;
additional/execution/workdir werden niemals zurückserialisiert. Vor Run/Delete muss
das ausgewählte Detail frisch geladen sein. Der echte Clienttoken bindet vollständige
ID, aktuelle Generation, Scope und konkreten Read; kopierte/alte Tokens gelten nicht.
paused=null ist unbekannt, paused=true verlangt in der UI den Hinweis, dass Run den
Job aktivieren/claimen kann. Delete nennt die vollständige ID. 409 wird rejected oder
not_sent gemäß Backendhülle, keine optimistische Entfernung. Nach confirmed erfolgt
gezieltes Neulesen; ein dann fehlender OneShot ist missing bei erhaltener Runquittung.

unknown sperrt einen erneuten Write zum Ziel, bis reconcileAction erfolgreich frisch
gelesen hat. Erst ein nachfolgender bewusster Aufruf darf neu schreiben. Keine
automatische Mutation, auch nicht nach 401, Timeout, Abort oder ungültigem JSON.
Scopewechsel verlangt neuen Read und neue Bestätigung, nicht Übernahme alter Quittung.

Skills und Pending bleiben readonly; editorPath=/ki-skills und review.adminPath=/hermes
kommen aus dem Vertrag. Memory behauptet nur builtinOnly und die beiden festen Texte.
copyDiagnostics schreibt ausschließlich die validierte redigierte Diagnose plus den
schmalen tatsächlichen lokalen Verbindungsstatus; Fehler sind sichtbar, kein Autocopy.

## Sitzungsdelete und enger Altdateischnitt

deleteSessionId steuert den frischen Previewread ohne Lease. Nur deletable=true
erlaubt einen Token. UI nennt Kompressionskette samt rekursiven delegierten Unteraufgaben
(Branch/Reset eigenständig), effect=compression-chain und zeigt den vollen Schlüssel.
Ungeklärte Arbeit, laufende Sitzung oder offene Requests werden nicht umgangen.
Nach ACK gelten Owner-/Bereichs-/Generations-/Scopeguards weiterhin. Nur bestätigte
confirmedAbsentSessionIds werden entfernt; requestedSessionId muss exakt passen und
in diesen IDs enthalten sein. affectedIdsComplete=false bleibt sichtbar und begründet
Katalogneulesen; keine angenommene Kettenmitgliedschaft oder Löschung aus partieller Liste.
409/unknown/stale ACK behalten Katalog und Auswahl.

Root genehmigt: Gateway resources=1 am vorhandenen Socket; ChatRuntime beobachtet
resources.invalidated vor Leasefilter. Cronereignisse invalidieren nur geöffnete Cron-
Reads. Sessionsereignisse lösen Katalogabgleich aus, ersetzen keine Deletequittung.
Bestätigtes eigenes Delete nutzt engen ChatRuntime-Cleanup sowie
OrganizationRuntime/State.forgetDeletedSessions für ausschließlich bestätigte IDs.
Aktuelle andere Auswahl, Turns, Requests und fremde Ownergenerationen bleiben geschützt.

Besitz neue resource-* Module/Tests und Hook; minimale gateway-client/chat-runtime/
chat-store/organization-runtime/organization-state-Verdrahtung. UI, Server, Contracts,
Root-E2E und Versionsdateien liegen außerhalb dieses Scopes. Jede Datei maximal400
Zeilen. Keine weiteren Agents, realen Coremutationen, Dienste, Browser oder Gitaktionen.

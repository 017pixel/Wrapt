import {
  hermesV2WorkRosterSchema, hermesV2WorkSubagentSchema, hermesV2WorkDelegationSchema,
  hermesV2WorkTaskSchema, type HermesV2ClientMessage, type HermesV2ErrorCode,
  type HermesV2Event, type HermesV2ServerMessage, type HermesV2Snapshot,
  type HermesV2WorkDelegation,
  type HermesV2WorkPatch, type HermesV2WorkProcess, type HermesV2WorkRoster,
  type HermesV2WorkSubagent, type HermesV2WorkTask,
} from "../../packages/contracts/src/hermes-v2";

type Operation = Extract<HermesV2ClientMessage, { op: "work.read" | "work.subagent.interrupt"
  | "work.subagent.tail" | "work.process.kill" | "work.background" | "work.btw" }>;
type Reply = Extract<HermesV2ServerMessage, { type: "result"; op: Operation["op"] }>;
type Fail = (code: HermesV2ErrorCode, outcome: "not_sent" | "unknown", message: string) => void;
interface Gateway {
  readonly stories: Map<string, { snapshot: HermesV2Snapshot }>;
  emit(sessionId: string, type: HermesV2Event["type"], payload: unknown): void;
}

export const isBrowserWorkOperation = (message: HermesV2ClientMessage): message is Operation =>
  ["work.read", "work.subagent.interrupt", "work.subagent.tail", "work.process.kill",
    "work.background", "work.btw"].includes(message.op);

const child = (id: string): HermesV2WorkSubagent => ({
  kind: "subagent", id, parentId: null, depth: null, delegationId: null, goal: null,
  model: null, startedAt: null, status: null, toolCount: null, lastTool: null,
  acceptingSteer: null, durationMs: null,
});

/** Strukturierte öffentliche Testdaten. Keine eigene Runtime oder reale Prozesse. */
export class HermesV2BrowserWork {
  readonly rosters = new Map<string, HermesV2WorkRoster>();
  readonly observations: Array<{ op: Operation["op"]; sessionId: string; target?: string; text?: string }> = [];
  holdReads = false;
  holdActions = false;
  loseNextAction = false;
  failNextAction: "not_sent" | "unknown" | null = null;
  completeBeforeReceipt = false;
  interruptFound = true;
  killStatus: "killed" | "already_exited" | "not_found" | "error" = "killed";
  tail = { available: true, text: "Eigene begrenzte Unteragentenausgabe", truncated: false };
  private pendingReads: Array<() => void> = [];
  private pendingActions: Array<() => void> = [];
  private taskCounter = 0;

  constructor(private readonly gateway: Gateway) {}

  roster(sessionId: string): HermesV2WorkRoster {
    let roster = this.rosters.get(sessionId);
    if (!roster) {
      roster = { revision: 0, subagents: [], delegations: [], processes: [], tasks: [],
        queuedText: null, coverage: { subagents: "live-and-observed",
          delegations: "recent-failures-partial", processes: "session",
          tasks: "observed-partial", queue: "next-only", truncated: false } };
      this.rosters.set(sessionId, roster);
    }
    return roster;
  }

  seedSubagent(sessionId: string, id: string, values: Partial<HermesV2WorkSubagent> = {}) {
    const row = { ...child(id), ...values, kind: "subagent" as const, id };
    this.roster(sessionId).subagents.push(row);
    this.roster(sessionId).revision++;
    return row;
  }

  seedDelegation(sessionId: string, delegationId: string, taskIndex: number,
    values: Partial<HermesV2WorkDelegation> = {}) {
    const row: HermesV2WorkDelegation = { status: "failed", goal: "Eigene fehlgeschlagene Teilaufgabe",
      error: "Synthetischer Aufgabenfehler", dispatchedAt: null, completedAt: null,
      ...values, kind: "delegation", delegationId, taskIndex };
    this.roster(sessionId).delegations.push(row);
    this.roster(sessionId).revision++;
    return row;
  }

  seedProcess(sessionId: string, id: string, values: Partial<HermesV2WorkProcess> = {}) {
    const row: HermesV2WorkProcess = { command: "Synthetischer Testprozess", status: "running",
      startedAt: null, uptimeSeconds: null, output: "Begrenzte Prozessausgabe", exitCode: null,
      ...values, kind: "process", id };
    this.roster(sessionId).processes.push(row);
    this.roster(sessionId).revision++;
    return row;
  }

  patch(sessionId: string, change: HermesV2WorkPatch): void {
    const roster = this.roster(sessionId);
    if (change.kind === "subagent") {
      const previous = roster.subagents.find((row) => row.id === change.id) ?? child(change.id);
      roster.subagents = [...roster.subagents.filter((row) => row.id !== change.id),
        hermesV2WorkSubagentSchema.parse({ ...previous, ...change })];
    } else if (change.kind === "delegation") {
      const match = (row: HermesV2WorkDelegation) => row.delegationId === change.delegationId && row.taskIndex === change.taskIndex;
      const previous = roster.delegations.find(match) ?? { kind: "delegation" as const,
        delegationId: change.delegationId, taskIndex: change.taskIndex, status: null,
        goal: null, error: null, dispatchedAt: null, completedAt: null };
      roster.delegations = [...roster.delegations.filter((row) => !match(row)),
        hermesV2WorkDelegationSchema.parse({ ...previous, ...change })];
    } else {
      const match = (row: HermesV2WorkTask) => row.kind === change.kind && row.id === change.id;
      const previous = roster.tasks.find(match);
      if (previous || change.status) {
        const row = { text: null, ...previous, ...change,
          status: previous?.status === "completed" ? "completed" as const : change.status ?? previous!.status };
        roster.tasks = [...roster.tasks.filter((entry) => !match(entry)), hermesV2WorkTaskSchema.parse(row)];
      }
    }
    roster.revision++;
    this.gateway.emit(sessionId, "work.updated", { revision: roster.revision, change });
  }

  completeTask(sessionId: string, kind: "background" | "btw", id: string, text = "Eigene Nebenaufgabe abgeschlossen") {
    this.patch(sessionId, { kind, id, status: "completed", text });
  }

  queueHead(sessionId: string, text: string | null): void {
    this.snapshot(sessionId).queuedText = text;
    this.invalidate(sessionId, "queue");
  }

  invalidate(sessionId: string, reason: "roster" | "queue" = "roster"): void {
    this.gateway.emit(sessionId, "work.invalidated", { revision: ++this.roster(sessionId).revision, reason });
  }

  finishReads(): void { for (const finish of this.pendingReads.splice(0)) finish(); }
  finishActions(): void { for (const finish of this.pendingActions.splice(0)) finish(); }
  dispose(): void { this.pendingReads = []; this.pendingActions = []; this.rosters.clear(); }

  handle(message: Operation, reply: (frame: Reply) => void, fail: Fail,
    loseSocket: () => void, optIn: boolean): void {
    if (!optIn) { fail("UNSUPPORTED_COMMAND", "not_sent", "Diese Verbindung hat keine Aufgabenansicht."); return; }
    const snapshot = this.snapshot(message.sessionId);
    const roster = this.roster(message.sessionId);
    const base = { v: 1 as const, type: "result" as const, id: message.id };
    if (message.op === "work.read") {
      const data = hermesV2WorkRosterSchema.parse(structuredClone({ ...roster, queuedText: snapshot.queuedText }));
      const finish = () => reply({ ...base, op: message.op, data });
      if (this.holdReads) this.pendingReads.push(finish); else finish();
      return;
    }
    if (!snapshot.writable) { fail("SESSION_UNAVAILABLE", "not_sent", "Die Testsitzung ist nur lesbar."); return; }
    const failure = this.failNextAction;
    this.failNextAction = null;
    if (failure === "not_sent") { fail("STALE_REQUEST", "not_sent", "Die eigene Testbindung hat sich geändert."); return; }
    let result: Reply;
    if (message.op === "work.subagent.interrupt" || message.op === "work.subagent.tail") {
      if (!roster.subagents.some((row) => row.id === message.subagentId)) {
        fail("STALE_REQUEST", "not_sent", "Dieses Kind gehört nicht zum aktuellen eigenen Roster."); return;
      }
      this.observations.push({ op: message.op, sessionId: message.sessionId, target: message.subagentId });
      if (message.op === "work.subagent.interrupt") {
        if (this.interruptFound) this.patch(message.sessionId, { kind: "subagent", id: message.subagentId, status: "interrupted" });
        result = { ...base, op: message.op, data: { id: message.subagentId, found: this.interruptFound } };
      } else result = { ...base, op: message.op, data: { id: message.subagentId, ...this.tail } };
    } else if (message.op === "work.process.kill") {
      const process = roster.processes.find((row) => row.id === message.processId);
      if (!process) { fail("STALE_REQUEST", "not_sent", "Dieser Prozess gehört nicht zur eigenen Sitzung."); return; }
      this.observations.push({ op: message.op, sessionId: message.sessionId, target: message.processId });
      if (this.killStatus === "killed" || this.killStatus === "already_exited") {
        process.status = "exited"; process.exitCode = 0;
      }
      result = { ...base, op: message.op, data: { id: message.processId, status: this.killStatus,
        exitCode: process.exitCode, output: process.output,
        error: this.killStatus === "error" ? "Synthetischer Prozessfehler" : null } };
      this.invalidate(message.sessionId);
    } else {
      const kind = message.op === "work.background" ? "background" : "btw";
      const taskId = `${kind}-browser-${++this.taskCounter}`;
      this.observations.push({ op: message.op, sessionId: message.sessionId, text: message.text });
      this.patch(message.sessionId, { kind, id: taskId,
        status: this.completeBeforeReceipt ? "completed" : "running",
        text: this.completeBeforeReceipt ? "Abschluss vor Startquittung" : null });
      result = kind === "background"
        ? { ...base, op: "work.background", data: { kind, taskId } }
        : { ...base, op: "work.btw", data: { kind, taskId } };
    }
    if (failure === "unknown") { fail("GATEWAY_OFFLINE", "unknown", "Ausgang der eigenen Testaktion unbekannt."); return; }
    if (this.loseNextAction) { this.loseNextAction = false; loseSocket(); return; }
    const finish = () => reply(result);
    if (this.holdActions) this.pendingActions.push(finish); else finish();
  }

  private snapshot(sessionId: string): HermesV2Snapshot {
    const snapshot = this.gateway.stories.get(sessionId)?.snapshot;
    if (!snapshot) throw new Error("Eigene strukturierte Testsession fehlt.");
    return snapshot;
  }
}

import type { HermesV2Event, HermesV2WorkPatch, HermesV2WorkRoster } from "@wrapt/contracts/hermes-v2";
import type { GatewayManager } from "../manager.js";
import type { OrganizationService } from "../organization/service.js";
import type { SessionRecord, UpstreamEvent } from "../types.js";
import { GatewayError } from "../errors.js";
import { backgroundRowsActive, beginBackgroundObservation } from "../background-state.js";
import { captureWork } from "./binding.js";
import { boundedOutputResult, normalizeWorkPatch, workTextResult, workTextTruncated } from "./normalize.js";
import { readNativeRoster } from "./roster.js";
import { WorkState, terminalWork } from "./state.js";
import { TaskReceipts } from "./receipts.js";
import { boundWorkRoster } from "./output-budget.js";

export class WorkService {
  readonly state: WorkState;
  readonly receipts: TaskReceipts;
  private reads = new Map<string, Promise<HermesV2WorkRoster>>();
  constructor(private manager: GatewayManager, private organization: OrganizationService | undefined,
    private emit: (event: HermesV2Event, record: SessionRecord) => void) {
    this.state = new WorkState(manager.policy.workRows, () => JSON.stringify([this.organization?.scopes.revision ?? 0, manager.upstream.transportId]));
    this.receipts = new TaskReceipts(manager.policy.maxPending);
  }
  capture(connection: string, session: string) { return captureWork(this.manager, connection, session, this.organization); }
  publish(record: SessionRecord, change: HermesV2WorkPatch, seq: number | null = null): void {
    if ((change.kind === "background" || change.kind === "btw") && typeof change.text === "string") {
      const bounded = boundedOutputResult(change.text, this.manager.secrets);
      if (bounded.truncated) this.state.get(record).truncated = true;
      change = { ...change, text: bounded.text };
    }
    if ((change.kind === "background" || change.kind === "btw") && change.status === "completed")
      this.receipts.complete(record, change.kind, change.id);
    const revision = this.state.update(record, change);
    if (revision === null) return;
    const state = this.state.get(record);
    if (change.kind === "subagent" && Object.hasOwn(change, "status")) change = { ...change, status: state.subagents.get(change.id)!.status };
    if (change.kind === "delegation" && Object.hasOwn(change, "status"))
      change = { ...change, status: state.delegations.get(JSON.stringify([change.delegationId, change.taskIndex]))!.status };
    if (change.kind === "background" || change.kind === "btw") change = { ...change, status: state.tasks.get(`${change.kind}\0${change.id}`)!.status };
    this.emit({ sessionId: record.storedId, epoch: record.epoch, seq, type: "work.updated", payload: { revision, change } }, record);
  }
  invalidate(record: SessionRecord, reason: "roster"|"queue"): void {
    this.emit({ sessionId: record.storedId, epoch: record.epoch, seq: null, type: "work.invalidated",
      payload: { revision: this.state.invalidate(record), reason } }, record);
  }
  observe(record: SessionRecord, event: UpstreamEvent): void {
    const patch = normalizeWorkPatch(event, this.manager.secrets);
    if (patch && workTextTruncated(event.payload, this.manager.secrets)) this.state.get(record).truncated = true;
    if (!patch && (/^subagent\.(spawn_requested|start|progress|thinking|tool|complete)$/.test(event.type) || event.type === "background.complete" || event.type === "btw.complete")) {
      this.state.unknown(record); this.state.get(record).truncated = true;
    }
    if (patch) this.publish(record, patch, event.seq ?? null);
    if (patch && event.type === "subagent.complete") this.state.settle(record, patch);
    if (["subagent.spawn_requested", "subagent.start", "subagent.complete", "background.complete", "btw.complete"].includes(event.type)) this.invalidate(record, "roster");
    if (["message.start", "message.complete", "session.info"].includes(event.type)) this.invalidate(record, "queue");
  }
  read(connection: string, session: string): Promise<HermesV2WorkRoster> {
    const record = this.manager.requireSession(session, connection);
    const key = JSON.stringify([connection, session, record.liveId, record.epoch, this.manager.subscriptions.get(connection, session),
      this.manager.upstream.transportId, this.organization?.scopes.revision]);
    const existing = this.reads.get(key); if (existing) return existing;
    const pending = this.readCurrent(connection, session).finally(() => { if (this.reads.get(key) === pending) this.reads.delete(key); });
    this.reads.set(key, pending); return pending;
  }
  private async readCurrent(connection: string, session: string): Promise<HermesV2WorkRoster> {
    const binding = await this.capture(connection, session); binding.assert();
    const state = this.state.get(binding.record); const revision = state.revision;
    state.observed = true;
    const observe = beginBackgroundObservation(binding.record);
    const native = await readNativeRoster(this.manager.upstream, binding.live!, this.manager.policy.workRows, this.manager.secrets);
    binding.assert(); await binding.current(); binding.assert();
    if (this.state.get(binding.record) !== state || state.revision !== revision) throw new GatewayError("STALE_REQUEST", "Die Laufaufgaben wurden während des Lesens aktualisiert.", "not_sent", true);
    for (const row of [...native.subagents, ...native.delegations]) this.state.update(binding.record, row);
    const agents = new Map(state.subagents);
    for (const row of native.subagents) {
      const observed = agents.get(row.id);
      agents.set(row.id, observed && (terminalWork(observed.status) || state.settled.has(`subagent:${row.id}`)) && !terminalWork(row.status) ? { ...row, ...observed } : row);
    }
    const delegations = new Map(state.delegations);
    for (const row of native.delegations) delegations.set(JSON.stringify([row.delegationId, row.taskIndex]), row);
    const limit = this.manager.policy.workRows;
    const queued = binding.reply.queued?.user;
    const queue = workTextResult(queued, 200_000, this.manager.secrets);
    observe(native.truncated || backgroundRowsActive([...native.subagents, ...native.processes]), this.state.active(binding.record));
    const roster: HermesV2WorkRoster = { revision: state.revision, subagents: [...agents.values()].slice(0, limit), delegations: [...delegations.values()].slice(0, limit),
      processes: native.processes, tasks: [...state.tasks.values()].slice(0, limit),
      queuedText: queued === undefined ? null : queue.text,
      coverage: { subagents: "live-and-observed", delegations: "recent-failures-partial", processes: "session",
        tasks: "observed-partial", queue: "next-only", truncated: native.truncated || state.truncated || agents.size > limit || delegations.size > limit || queue.truncated } };
    return boundWorkRoster(roster, this.manager.policy.browserBytes / 2, "rows");
  }
  clear(): void { this.reads.clear(); this.receipts.clear(); }
}

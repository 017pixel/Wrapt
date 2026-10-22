import { hermesV2DiagnosticsSchema, type HermesV2CronFields, type HermesV2CronMutation,
  type HermesV2SessionDeleted } from "@wrapt/contracts/hermes-v2";
import type { ResourceRuntime } from "./resource-runtime";
import type { OwnerRecord } from "./chat-owners";
import type { ResourceCapture } from "./resource-context";
import type { ResourceSlot } from "./resource-state";
import type { ResourceActionView, ResourceConfirmation, ResourceOperation } from "./resource-types";
import { ResourceFailure, resourceError, staleResource } from "./resource-error";
import { resourcePolicy } from "./resource-policy";
import { resourceSessionProtected } from "./resource-delete-guards";

type Receipt = HermesV2CronMutation | HermesV2SessionDeleted;
interface OpenAction {
  key: string; target: string; controller: AbortController; capture: ResourceCapture; promise: Promise<void>;
  sent: boolean;
  deletionOwners: ReadonlyMap<OwnerRecord, number> | undefined;
}
interface ConfirmationEvidence { capture: ResourceCapture; read: object; scope: string }
export class ResourceMutations {
  private open = new Map<string, OpenAction>();
  private scopes = new Map<string, string>();
  private confirmations = new WeakMap<ResourceConfirmation, ConfirmationEvidence>();
  private copying: object | null = null;
  constructor(private readonly runtime: ResourceRuntime) {}
  invalidateConfirmations(slot?: ResourceSlot): void {
    if (slot !== undefined && slot !== "cronDetail" && slot !== "cronList" && slot !== "sessionDeletion") return;
    this.confirmations = new WeakMap();
  }
  invalidate(): void {
    this.invalidateConfirmations();
    for (const entry of this.open.values()) {
      entry.controller.abort();
      const status = entry.sent ? "unknown" : "not_sent";
      this.replace(entry.key, { status, result: null, error: staleResource(status).info, reconciled: false });
    }
    this.open.clear();
    this.copying = null;
  }
  private error(error: unknown): void { this.runtime.state.error = resourceError(error); this.runtime.emit(); }
  private evidence(id: string | null, operation: ResourceOperation): string {
    const { context, state } = this.runtime;
    context.capture();
    if (operation === "session.delete") {
      const read = state.reads.sessionDeletion;
      if (id !== null && resourceSessionProtected(this.runtime.chat, id)) {
        throw new ResourceFailure("NATIVE_CONFLICT", "Für diese Sitzung ist noch Arbeit oder eine offene Anfrage ungeklärt.");
      }
      if (context.options?.area !== "session-delete" || read.status !== "ready" || read.stale
        || read.data?.requestedSessionId !== id || !read.data.deletable || read.data.scope !== context.scope) throw staleResource();
      return read.data.scope;
    }
    if (context.options?.area !== "cron") throw staleResource();
    const list = state.reads.cronList;
    const detail = state.reads.cronDetail;
    const target = id === null ? null : detail.status === "ready" && !detail.stale && detail.data?.job.id === id && detail.data.job.valid
      ? detail.data : list.status === "ready" && !list.stale && list.data?.jobs.some((job) => job.id === id && job.valid) ? list.data : null;
    const source = id === null ? list.status === "ready" && !list.stale ? list.data : null : target;
    if (!source || source.scope !== context.scope) throw staleResource();
    return source.scope;
  }
  prepareCron(operation: "run" | "delete"): ResourceConfirmation | null {
    try {
      const { state, context } = this.runtime;
      const read = state.reads.cronDetail;
      if (read.status !== "ready" || read.stale || !read.data?.job.valid || read.data.job.id !== state.selectedCron) throw staleResource();
      const scope = this.evidence(state.selectedCron, `cron.${operation}`);
      const token = Object.freeze({ key: crypto.randomUUID(), generation: context.generation, targetId: state.selectedCron!,
        operation: `cron.${operation}` as const, paused: read.data.job.paused });
      this.confirmations.set(token, { capture: context.capture(), read: read.data, scope });
      return token;
    } catch (error) { this.error(error); return null; }
  }
  prepareSession(): ResourceConfirmation | null {
    try {
      const { context, state } = this.runtime;
      const id = context.options?.deleteSessionId ?? null;
      const scope = this.evidence(id, "session.delete");
      const token = Object.freeze({ key: crypto.randomUUID(), generation: context.generation,
        targetId: id!, operation: "session.delete" as const, paused: null });
      this.confirmations.set(token, { capture: context.capture(), read: state.reads.sessionDeletion.data!, scope });
      return token;
    } catch (error) { this.error(error); return null; }
  }
  create(fields: HermesV2CronFields): Promise<void> {
    const copy = { ...fields };
    return this.perform("cron.create", null, (scope, signal) => this.runtime.client.cronCreate(scope, copy, signal));
  }
  update(id: string, fields: Partial<HermesV2CronFields>): Promise<void> {
    const copy = { ...fields };
    return this.perform("cron.update", id, (scope, signal) => this.runtime.client.cronUpdate(scope, id, copy, signal));
  }
  cron(id: string, operation: "pause" | "resume"): Promise<void> {
    return this.perform(`cron.${operation}`, id, (scope, signal) => this.runtime.client.cronAction(scope, id, operation, signal));
  }
  confirmed(token: ResourceConfirmation, operation: ResourceConfirmation["operation"]): Promise<void> {
    const target = `${this.runtime.context.scope}:${operation === "session.delete" ? "session" : "cron"}:${token.targetId}`;
    const open = this.open.get(target);
    if (open) return open.promise;
    const evidence = this.confirmations.get(token);
    try {
      if (!evidence || token.operation !== operation || token.generation !== this.runtime.context.generation
        || !this.runtime.context.valid(evidence.capture) || evidence.scope !== this.runtime.context.scope) throw staleResource();
      const current = operation === "session.delete" ? this.runtime.state.reads.sessionDeletion.data : this.runtime.state.reads.cronDetail.data;
      if (current !== evidence.read) throw staleResource();
      this.confirmations.delete(token);
      return this.perform(operation, token.targetId, (scope, signal) => operation === "session.delete"
        ? this.runtime.client.sessionDelete(scope, token.targetId, signal)
        : this.runtime.client.cronAction(scope, token.targetId, operation === "cron.run" ? "trigger" : "delete", signal));
    } catch (error) { this.error(error); return Promise.resolve(); }
  }
  private perform(operation: ResourceOperation, id: string | null, request: (scope: string, signal: AbortSignal) => Promise<Receipt>): Promise<void> {
    const target = `${this.runtime.context.scope}:${operation === "session.delete" ? "session" : "cron"}:${id ?? "<create>"}`;
    const existing = this.open.get(target);
    if (existing) return existing.promise;
    let scope: string;
    let capture: ResourceCapture;
    try {
      scope = this.evidence(id, operation);
      capture = this.runtime.context.capture();
      if (this.runtime.state.actions.some((entry) => this.target(entry) === target && entry.status === "unknown" && !entry.reconciled)) {
        throw new ResourceFailure("UNKNOWN_OUTCOME", "Die vorherige Annahme ist unklar. Bitte dieses Ziel zuerst bewusst neu lesen.");
      }
      if (this.runtime.state.actions.length >= resourcePolicy.actions) {
        const disposable = this.runtime.state.actions.findIndex((entry) => entry.status !== "pending" && (entry.status !== "unknown" || entry.reconciled));
        if (disposable < 0) throw new ResourceFailure("CLIENT_BUSY", "Zu viele ungeklärte Ressourcenaktionen sind offen.");
        const removed = this.runtime.state.actions.splice(disposable, 1)[0]!;
        this.scopes.delete(removed.key);
      }
    } catch (error) { this.error(error); return Promise.resolve(); }
    const key = crypto.randomUUID();
    const controller = new AbortController();
    let resolve: () => void = () => {};
    const promise = new Promise<void>((done) => { resolve = done; });
    const deletionOwners = operation === "session.delete" ? new Map([...this.runtime.chat.owners.records.values()].map((owner) => [owner, owner.generation])) : undefined;
    const entry = { key, target, controller, capture, promise, sent: false, deletionOwners };
    this.scopes.set(key, scope);
    this.open.set(target, entry);
    this.runtime.state.actions = [...this.runtime.state.actions, { key, operation, targetId: id, status: "pending", result: null, error: null, reconciled: false }];
    this.runtime.state.error = null;
    this.runtime.emit();
    void this.execute(entry, scope, request).finally(resolve);
    return promise;
  }
  private async execute(entry: OpenAction, scope: string, request: (scope: string, signal: AbortSignal) => Promise<Receipt>): Promise<void> {
    try {
      // Ein synchroner Listener kann die Fläche während des Pending-Emits schließen.
      this.runtime.context.assert(entry.capture);
      if (entry.controller.signal.aborted) throw staleResource();
      entry.sent = true;
      const result = await request(scope, entry.controller.signal);
      this.runtime.context.assert(entry.capture, true);
      if (this.open.get(entry.target) !== entry) throw staleResource("unknown");
      this.open.delete(entry.target);
      if ("confirmedAbsentSessionIds" in result) {
        const action = this.runtime.state.actions.find((value) => value.key === entry.key)!;
        // ACK und Generation sind geprüft, bevor der eigene Cleanup die Ownerauswahl ändert.
        this.runtime.forget(result.confirmedAbsentSessionIds, entry.deletionOwners);
        this.runtime.state.actions = [...this.runtime.state.actions.filter((value) => value.key !== entry.key), { ...action, status: "confirmed", result, error: null }];
      }
      this.replace(entry.key, { status: "confirmed", result, error: null });
      this.runtime.emit();
      if (!("confirmedAbsentSessionIds" in result)) await this.runtime.reads.refresh();
    } catch (error) {
      const current = this.runtime.state.actions.find((action) => action.key === entry.key);
      if (current?.status === "pending") {
        const info = resourceError(error, "unknown");
        this.replace(entry.key, { status: info.outcome, result: null, error: info, reconciled: false });
        this.runtime.state.error = info;
        this.runtime.emit();
      }
    } finally { if (this.open.get(entry.target) === entry) this.open.delete(entry.target); }
  }
  private replace(key: string, updates: Partial<ResourceActionView>): void {
    this.runtime.state.actions = this.runtime.state.actions.map((entry) => entry.key === key ? { ...entry, ...updates } : entry);
  }
  private target(entry: ResourceActionView): string { return `${this.scopes.get(entry.key)}:${entry.operation === "session.delete" ? "session" : "cron"}:${entry.targetId ?? "<create>"}`; }
  async reconcile(key: string): Promise<void> {
    const action = this.runtime.state.actions.find((entry) => entry.key === key);
    if (!action || action.status !== "unknown" || !this.runtime.context.visible()) return;
    const capture = this.runtime.context.capture();
    if (this.scopes.get(key) !== capture.scope) { this.error(staleResource()); return; }
    let success = false;
    if (action.operation === "session.delete" && this.runtime.context.options?.deleteSessionId === action.targetId) success = await this.runtime.reads.readFresh("sessionDeletion", key);
    else if (action.operation.startsWith("cron.") && this.runtime.context.options?.area === "cron") {
      if (action.targetId === null) success = await this.runtime.reads.readFresh("cronList", key);
      else if (action.targetId === this.runtime.state.selectedCron) success = await this.runtime.reads.readFresh("cronDetail", key);
    }
    if (success && this.runtime.context.valid(capture)) { this.replace(key, { reconciled: true }); this.runtime.emit(); }
  }
  async copy(): Promise<void> {
    if (this.copying) return;
    const read = this.runtime.state.reads.diagnostics;
    let capture: ResourceCapture;
    try {
      capture = this.runtime.context.capture();
      if (this.runtime.context.options?.area !== "diagnostics" || read.status !== "ready" || read.stale || !read.data) throw staleResource();
    } catch (error) { this.error(error); return; }
    const copyToken = {};
    this.copying = copyToken;
    this.runtime.state.copy = { status: "pending", error: null }; this.runtime.emit();
    try {
      this.runtime.context.assert(capture);
      const diagnostics = hermesV2DiagnosticsSchema.parse(read.data);
      const connection = this.runtime.chat.client.getSnapshot();
      await this.runtime.clipboard(JSON.stringify({ diagnostics, localConnection: { state: connection.state, attempt: connection.attempt } }, null, 2));
      this.runtime.context.assert(capture);
      this.runtime.state.copy = { status: "copied", error: null };
    } catch (error) {
      if (this.runtime.context.valid(capture)) this.runtime.state.copy = { status: "error", error: resourceError(error) };
    } finally { if (this.copying === copyToken) this.copying = null; this.runtime.emit(); }
  }
  prune(): void {
    const kept = new Set(this.runtime.state.actions.map((entry) => entry.key));
    for (const key of this.scopes.keys()) if (!kept.has(key)) this.scopes.delete(key);
  }
}

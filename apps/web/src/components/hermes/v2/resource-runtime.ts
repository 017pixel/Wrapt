import type { HermesV2Event } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { getChatRuntime, type ChatRuntime } from "./chat-runtime";
import type { OwnerRecord } from "./chat-owners";
import { getOrganizationRuntime } from "./organization-runtime";
import { ResourceClient } from "./resource-client";
import { ResourceContext } from "./resource-context";
import { ResourceState, idleResourceRead } from "./resource-state";
import { ResourceReads } from "./resource-reads";
import { ResourceMutations } from "./resource-mutations";
import { ResourceFailure, resourceError } from "./resource-error";
import type { HermesV2ResourcesOptions, ResourceActions, ResourceView } from "./resource-types";

export class ResourceRuntime {
  readonly context: ResourceContext;
  readonly state = new ResourceState();
  readonly reads = new ResourceReads(this);
  readonly actions = new ResourceMutations(this);
  readonly methods: ResourceActions;
  private listeners = new Set<() => void>();
  private stops: (() => void)[] = [];
  private abortStop: (() => void) | null = null;
  private identity: { owner: object | null; generation: number; socket: number; binding: string | null; visible: boolean } | null = null;
  private view: ResourceView;
  constructor(readonly chat: ChatRuntime = getChatRuntime(), readonly client = new ResourceClient(),
    readonly clipboard: (text: string) => Promise<void> = (text) => navigator.clipboard.writeText(text),
    readonly forget: (ids: readonly string[], owners?: ReadonlyMap<OwnerRecord, number>) => void = (ids, owners) => {
      const cleaned = chat.forgetDeletedSessions(ids, owners);
      getOrganizationRuntime().forgetDeletedSessions(cleaned);
    }) {
    this.context = new ResourceContext(chat);
    this.methods = {
      refresh: () => this.reads.refresh(), selectCron: (id) => this.selectCron(id),
      refreshCronDetail: async () => { await this.reads.read("cronDetail"); },
      refreshCronRuns: async () => { await this.reads.read("cronRuns"); },
      selectSkill: (name) => this.selectSkill(name),
      prepareCronConfirmation: (operation) => this.actions.prepareCron(operation),
      prepareSessionDeletion: () => this.actions.prepareSession(),
      createCron: (fields) => this.actions.create(fields), updateCron: (id, fields) => this.actions.update(id, fields),
      pauseCron: (id) => this.actions.cron(id, "pause"), resumeCron: (id) => this.actions.cron(id, "resume"),
      runCron: (confirmation) => this.actions.confirmed(confirmation, "cron.run"),
      deleteCron: (confirmation) => this.actions.confirmed(confirmation, "cron.delete"),
      deleteSession: (confirmation) => this.actions.confirmed(confirmation, "session.delete"),
      reconcileAction: (key) => this.actions.reconcile(key), copyDiagnostics: () => this.actions.copy(),
      clearActionError: () => { this.state.error = null; this.emit(); },
    };
    this.view = this.state.view(0, false, null, chat.client.getSnapshot());
  }
  getSnapshot = (): ResourceView => this.view;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  mount(options: HermesV2ResourcesOptions): () => void {
    this.context.mounted = true;
    this.stops.push(this.chat.owners.subscribe(options.ownerId, () => this.sync()));
    this.stops.push(this.chat.client.subscribe(() => this.sync()));
    this.stops.push(this.chat.observeResources((event) => this.event(event)));
    this.stops.push(useAppPreferences.subscribe(() => this.sync()));
    const visibility = () => this.sync();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibility);
      this.stops.push(() => document.removeEventListener("visibilitychange", visibility));
    }
    this.update(options);
    return () => this.dispose();
  }
  update(options: HermesV2ResourcesOptions): void {
    const old = this.context.options;
    this.context.options = options;
    if (!old || old.signal !== options.signal) {
      this.abortStop?.();
      const abort = () => this.sync();
      options.signal.addEventListener("abort", abort, { once: true });
      this.abortStop = () => options.signal.removeEventListener("abort", abort);
    }
    if (!old || old.ownerId !== options.ownerId || old.area !== options.area || old.enabled !== options.enabled
      || old.active !== options.active || old.visible !== options.visible || old.signal !== options.signal
      || old.deleteSessionId !== options.deleteSessionId) {
      this.reset(true);
      this.identity = null;
    }
    this.sync();
  }
  private sync(): void {
    const owner = this.context.options ? this.chat.owners.records.get(this.context.options.ownerId) : null;
    const binding = this.chat.client.getComposerBinding();
    const next = { owner: owner ?? null, generation: owner?.generation ?? -1,
      socket: this.chat.client.generation, binding: binding ? JSON.stringify([binding.id, binding.epoch]) : null, visible: this.context.visible() };
    const old = this.identity;
    this.identity = next;
    if (!old || old.owner !== next.owner || old.generation !== next.generation || old.socket !== next.socket || old.binding !== next.binding || old.visible !== next.visible) {
      this.reset(false);
      this.emit();
      if (next.visible) void this.reads.refresh();
    } else this.emit();
  }
  private reset(selection: boolean): void {
    this.context.generation++;
    this.context.scope = null;
    this.reads.abortAll();
    this.actions.invalidate();
    this.state.clearContents();
    this.actions.prune();
    if (selection) { this.state.selectedCron = null; this.state.selectedSkill = null; }
  }
  acceptScope(scope: string): boolean {
    if (this.context.scope === null) { this.context.scope = scope; return true; }
    if (scope === this.context.scope) return true;
    this.reset(false);
    this.context.scope = scope;
    this.emit();
    queueMicrotask(() => { if (this.context.visible()) void this.reads.refresh(); });
    return false;
  }
  private selectionChanged(): void {
    this.context.generation++;
    this.reads.abortAll();
    this.actions.invalidate();
    this.state.error = null;
  }
  selectCron(id: string | null): void {
    if (!this.context.visible() || this.context.options?.area !== "cron" || id === this.state.selectedCron) return;
    if (id !== null && !this.state.reads.cronList.data?.jobs.some((job) => job.id === id)) {
      this.state.error = resourceError(new ResourceFailure("TARGET_UNAVAILABLE", "Dieser Job ist nicht im aktuellen Katalog belegt.")); this.emit(); return;
    }
    this.selectionChanged(); this.state.selectedCron = id;
    this.state.reads.cronDetail = idleResourceRead(); this.state.reads.cronRuns = idleResourceRead();
    this.emit();
    if (id !== null) void Promise.all([this.reads.read("cronDetail"), this.reads.read("cronRuns")]);
  }
  selectSkill(name: string | null): void {
    if (!this.context.visible() || this.context.options?.area !== "skills" || name === this.state.selectedSkill) return;
    if (name !== null && !this.state.reads.skills.data?.skills.some((skill) => skill.name === name)) {
      this.state.error = resourceError(new ResourceFailure("TARGET_UNAVAILABLE", "Dieser Skill ist nicht im aktuellen Katalog belegt.")); this.emit(); return;
    }
    this.selectionChanged(); this.state.selectedSkill = name; this.state.reads.skillDetail = idleResourceRead(); this.emit();
    if (name !== null) void this.reads.read("skillDetail");
  }
  private event(event: Extract<HermesV2Event, { type: "resources.invalidated" }>): void {
    if (!this.context.visible()) return;
    if (event.payload.resource === "cron" && this.context.options?.area === "cron") this.reads.invalidate(["cronList", "cronDetail", "cronRuns"]);
    if (event.payload.resource === "sessions" && this.context.options?.area === "session-delete") this.reads.invalidate(["sessionDeletion"]);
  }
  emit(): void {
    this.view = this.state.view(this.context.generation, this.context.visible(), this.context.options?.area ?? null, this.chat.client.getSnapshot());
    for (const listener of this.listeners) listener();
  }
  dispose(): void {
    this.context.mounted = false;
    this.reset(true);
    this.stops.splice(0).forEach((stop) => stop());
    this.abortStop?.(); this.abortStop = null; this.identity = null;
    this.state.actions = []; this.actions.prune(); this.emit();
  }
}

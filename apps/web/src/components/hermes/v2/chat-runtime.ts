import type { HermesV2Event, HermesV2ServerMessage, HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import type { HermesV2ChatActions, HermesV2ChatOptions } from "./chat-types";
import { GatewayClient } from "./gateway-client";
import { ChatError, errorInfo, type GatewayOperation, type OperationResult } from "./gateway-protocol";
import { ChatStore } from "./chat-store";
import { ChatOwners, type OwnerRecord } from "./chat-owners";
import { applyChatSnapshot } from "./chat-state";
import { applyChatEvent } from "./chat-events";
import { ChatActions } from "./chat-actions";
import { ChatRequests } from "./chat-requests";
import { ChatComposer } from "./chat-composer";
import { ChatAttachments } from "./chat-attachments";
import { ChatAttachmentClient } from "./chat-attachment-client";
import { ChatWork } from "./chat-work";
import { resourceSessionProtected } from "./resource-delete-guards";
import { chatPolicy } from "./chat-policy";
import { assertEventSession, assertResultSession } from "./chat-response-guards";

interface SessionLease {
  count: number;
  token: number;
  syncedCycle: number;
  syncCycle: number;
  syncing: Promise<void> | null;
  buffer: HermesV2Event[];
  bufferBytes: number;
  overflow: boolean;
  subscription: number;
}
export class ChatRuntime {
  readonly store = new ChatStore();
  readonly owners = new ChatOwners((before, after) => this.selectionChanged(before, after), (id) => this.requests.states(id),
    (owner) => this.composer.view(owner), (owner) => { this.composer.invalidate(owner); this.work.invalidate(owner); }, (owner) => this.work.view(owner));
  readonly requests = new ChatRequests(this);
  readonly composer = new ChatComposer(this);
  readonly work = new ChatWork(this);
  readonly attachments: ChatAttachments;
  readonly client: GatewayClient;
  private actions: ChatActions;
  private leases = new Map<string, SessionLease>();
  private created = new Set<string>();
  private stopFlag: (() => void) | null = null;
  private stopVisibility: (() => void) | null = null;
  private cycle = 0;
  private previousOnline = false;
  private onlineGeneration = -1;
  private onlineBinding: string | null = null;
  private listToken = 0;
  private listPromise: Promise<void> | null = null;
  private listDirty = false;
  private organizationListeners = new Set<(event: HermesV2Event) => void>();
  private resourceListeners = new Set<(event: Extract<HermesV2Event, { type: "resources.invalidated" }>) => void>();

  constructor(client = new GatewayClient(), attachmentClient = new ChatAttachmentClient()) {
    this.client = client;
    client.enableComposer();
    client.enableWork();
    client.enableResources();
    this.attachments = new ChatAttachments(this, attachmentClient);
    this.actions = new ChatActions(this);
    client.subscribe(() => this.connectionChanged());
    client.onFrame((frame, generation) => { if (generation === client.generation) this.receive(frame); });
  }
  enabled(): boolean { return useAppPreferences.getState().hermesV2Enabled; }
  sessionIsLeased(id: string): boolean { return (this.leases.get(id)?.count ?? 0) > 0; }
  sessionIsSynced(id: string): boolean { return this.leases.get(id)?.syncedCycle === this.cycle; }
  sessionSubscription(id: string): number { return this.leases.get(id)?.subscription ?? -1; }
  acquire(options: HermesV2ChatOptions): () => void {
    if (!this.enabled()) return () => {};
    const owner = this.owners.acquire(options);
    if (!this.stopFlag) {
      this.stopFlag = useAppPreferences.subscribe((state) => { if (!state.hermesV2Enabled) this.dispose("v2-disabled"); });
      const visibility = () => {
        if (document.visibilityState !== "hidden") return;
        for (const entry of this.owners.records.values()) { this.composer.invalidate(entry); this.work.invalidate(entry); this.owners.emit(entry); }
        this.work.sync();
      };
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", visibility);
        this.stopVisibility = () => document.removeEventListener("visibilitychange", visibility);
      }
    }
    this.client.start();
    this.work.sync();
    return () => {
      this.owners.release(owner);
      queueMicrotask(() => {
        if (![...this.owners.records.values()].some((record) => record.mounted)) this.dispose("v2-navigation");
      });
    };
  }
  update(options: HermesV2ChatOptions): void { this.owners.update(options); this.work.sync(); }
  actionsFor(ownerId: string): HermesV2ChatActions { return this.actions.forOwner(ownerId); }
  observeOrganization(listener: (event: HermesV2Event) => void): () => void {
    this.organizationListeners.add(listener);
    this.listToken++;
    return () => { this.organizationListeners.delete(listener); };
  }
  observeResources(listener: (event: Extract<HermesV2Event, { type: "resources.invalidated" }>) => void): () => void {
    this.resourceListeners.add(listener);
    return () => { this.resourceListeners.delete(listener); };
  }
  forgetDeletedSessions(ids: readonly string[], owners?: ReadonlyMap<OwnerRecord, number>): readonly string[] {
    const safe = new Set(ids.filter((id) => !resourceSessionProtected(this, id, owners)));
    this.listToken++;
    for (const owner of this.owners.records.values()) {
      if (owner.mounted && owner.sessionId && safe.has(owner.sessionId)) this.owners.select(owner, null);
      for (const id of safe) owner.drafts.delete(id);
    }
    for (const id of safe) { this.created.delete(id); this.leases.delete(id); }
    this.store.forgetDeletedSessions(safe);
    this.refreshQuietly();
    return [...safe];
  }
  async refreshEvidence(ownerId: string, handles: readonly string[]): Promise<void> {
    const capture = this.owners.capture(ownerId);
    if (!capture.sessionId) return;
    const state = this.store.get(capture.sessionId);
    const offsets = state.messages.filter((message) => message.readEvidence && handles.includes(message.readEvidence))
      .map((message) => message.readOffset ?? 0);
    if (offsets.length) await this.actions.refreshEvidence(capture, offsets);
  }
  dispose(reason: "v2-disabled" | "v2-navigation"): void {
    this.stopFlag?.();
    this.stopFlag = null;
    this.stopVisibility?.(); this.stopVisibility = null;
    this.cycle++;
    this.listToken++;
    this.listDirty = false;
    this.created.clear();
    this.leases.clear();
    this.requests.dispose();
    this.attachments.dispose();
    this.work.dispose();
    this.owners.clear();
    this.client.dispose(reason);
    this.store.clear();
  }
  async read<O extends GatewayOperation["op"]>(operation: Extract<GatewayOperation, { op: O }>, valid = () => true): Promise<OperationResult<O>> {
    await this.client.ready();
    if (!this.enabled() || !valid()) throw new ChatError("STALE_READ", "Die Hermes-Auswahl hat sich geändert.");
    const generation = this.client.generation;
    const result = await this.client.request(operation);
    if (!this.enabled() || !valid() || generation !== this.client.generation) {
      throw new ChatError("STALE_READ", "Die Hermes-Antwort wurde durch einen neuen Abgleich ersetzt.");
    }
    try { assertResultSession(operation, result); }
    catch (error) { this.client.failProtocol(); throw error; }
    return result;
  }
  async refreshSessions(query?: string): Promise<void> {
    const token = ++this.listToken;
    this.store.setList({ ...this.store.getList(), loading: true, error: null });
    try {
      // query ist der belegte Exact-Title-RPC, keine globale Fuzzy-Suche.
      const result = await this.read({ op: "sessions.list", limit: 100, ...(query ? { query } : {}) }, () => token === this.listToken);
      if (token !== this.listToken || !this.enabled()) return;
      this.store.setList({ items: result.data.sessions, hasMore: result.data.hasMore, loading: false, error: null });
    } catch (error) {
      if (token === this.listToken && this.enabled()) this.store.setList({ ...this.store.getList(), loading: false, error: errorInfo(error) });
      throw error;
    }
  }
  seed(snapshot: HermesV2Snapshot): void {
    this.created.add(snapshot.session.id);
    const previousRequests = this.store.get(snapshot.session.id).requests;
    this.store.set(snapshot.session.id, applyChatSnapshot(this.store.get(snapshot.session.id), snapshot));
    this.requests.snapshot(previousRequests, snapshot.requests);
    this.upsertSummary(snapshot.session);
  }
  ensureSubscribed(id: string, force = false): Promise<void> {
    const lease = this.leases.get(id);
    if (!lease?.count) return Promise.reject(new ChatError("SESSION_UNAVAILABLE", "Diese Sitzung ist nicht mehr geöffnet."));
    if (lease.syncing && lease.syncCycle === this.cycle) return force
      ? lease.syncing.then(() => this.ensureSubscribed(id, true)) : lease.syncing;
    if (!force && lease.syncedCycle === this.cycle) return Promise.resolve();
    const token = ++lease.token;
    lease.subscription++;
    const cycle = this.cycle;
    lease.syncCycle = cycle;
    this.store.update(id, (state) => ({ ...state, loading: true, error: null }));
    this.composer.sync(id);
    const valid = () => this.leases.get(id) === lease && lease.count > 0 && token === lease.token && cycle === this.cycle;
    const syncing = (async () => {
      const state = this.store.get(id);
      const result = await this.read({ op: "session.subscribe", sessionId: id,
        ...(state.epoch ? { cursor: { epoch: state.epoch, seq: state.cursor } } : {}) }, valid);
      if (valid()) {
        this.snapshot(id, result.data.snapshot);
        lease.syncedCycle = cycle;
        this.work.sync();
      }
    })().catch((error: unknown) => {
      if (valid()) {
        // Ein fehlgeschlagener Abgleich kann das serverseitige Abo entfernt haben.
        lease.syncedCycle = -1;
        this.store.update(id, (state) => ({ ...state, loading: false, writable: false, error: errorInfo(error) }));
      }
      throw error;
    }).finally(() => { if (lease.syncing === syncing) lease.syncing = null; });
    lease.syncing = syncing;
    return syncing;
  }
  async resync(owner: OwnerRecord): Promise<void> {
    const capture = this.owners.capture(owner.id);
    const previousError = capture.draft.error;
    if (!capture.sessionId) throw new ChatError("SESSION_NOT_FOUND", "Bitte zuerst eine Sitzung auswählen.");
    await this.ensureSubscribed(capture.sessionId, true);
    this.owners.assert(capture);
    await this.actions.history(capture, true);
    this.owners.assert(capture);
    if (capture.draft.error === previousError) capture.draft.error = null;
    if (capture.draft.unknown) capture.draft.unknown.resynced = true;
    this.owners.emit(owner);
  }
  upsertSummary(summary: HermesV2Snapshot["session"]): void {
    const list = this.store.getList();
    const exists = list.items.some((entry) => entry.id === summary.id);
    this.store.setList({ ...list, items: exists ? list.items.map((entry) => entry.id === summary.id ? summary : entry) : [summary, ...list.items].slice(0, 100) });
  }
  private selectionChanged(before: string | null, after: string | null): void {
    if (before) {
      const lease = this.leases.get(before);
      if (lease && --lease.count === 0) {
        lease.token++;
        this.leases.delete(before);
        if (this.owners.records.size && this.client.getSnapshot().state === "online") {
          void this.read({ op: "session.unsubscribe", sessionId: before }, () => !this.leases.has(before)).catch(() => {
            // Disconnect/Rotation löst das Browser-Abo ebenfalls, kein Mutationsretry.
          });
        }
      }
    }
    if (after) {
      const existing = this.leases.get(after);
      if (existing) existing.count++;
      else {
        const seeded = this.created.delete(after);
        this.leases.set(after, { count: 1, token: 0, syncedCycle: seeded ? this.cycle : -1,
          syncCycle: -1, syncing: null, buffer: [], bufferBytes: 0, overflow: false, subscription: 0 });
        this.store.get(after);
        if (!seeded && this.client.getSnapshot().state === "online") this.syncQuietly(after);
      }
    }
    this.store.evictUnleased(new Set(this.leases.keys()));
    this.work.sync();
  }
  private connectionChanged(): void {
    const online = this.client.getSnapshot().state === "online";
    const binding = this.client.getComposerBinding();
    const bindingKey = binding ? JSON.stringify([binding.id, binding.epoch]) : null;
    if (online && (!this.previousOnline || this.onlineGeneration !== this.client.generation || bindingKey !== this.onlineBinding)) {
      this.cycle++;
      this.onlineGeneration = this.client.generation;
      this.onlineBinding = bindingKey;
      for (const id of this.leases.keys()) this.syncQuietly(id);
      this.refreshQuietly();
    } else if (!online && this.previousOnline) {
      this.owners.invalidateResync();
      for (const [id, lease] of this.leases) {
        lease.token++;
        lease.syncedCycle = -1;
        lease.buffer = [];
        lease.bufferBytes = 0;
        lease.overflow = false;
        this.store.update(id, (state) => ({ ...state, writable: false, loading: false, loadingOlder: false,
          catalog: { ...state.catalog, loading: false }, error: this.client.getSnapshot().error ?? state.error }));
      }
    }
    this.previousOnline = online;
    this.composer.sync();
  }
  private receive(frame: HermesV2ServerMessage): void {
    if (!this.enabled()) return;
    if (frame.type === "snapshot") {
      const lease = this.leases.get(frame.snapshot.session.id);
      if (lease) { lease.token++; this.snapshot(frame.snapshot.session.id, frame.snapshot); lease.syncedCycle = this.cycle; this.work.sync(); }
    } else if (frame.type === "event") {
      const event = frame.event;
      try { assertEventSession(event); }
      catch { this.client.failProtocol(); return; }
      if (event.type === "metadata.invalidated" && event.sessionId !== event.payload.sessionId) { this.client.failProtocol(); return; }
      if (event.type === "resources.invalidated") {
        if (event.sessionId !== null || event.seq !== null) { this.client.failProtocol(); return; }
        for (const listener of this.resourceListeners) listener(event);
        if (event.payload.resource === "sessions") {
          for (const listener of this.organizationListeners) listener(event);
          this.refreshQuietly();
        }
        return;
      }
      if (event.type === "metadata.invalidated" || event.type === "sessions.invalidated") {
        for (const listener of this.organizationListeners) listener(event);
        if (event.type === "sessions.invalidated") this.refreshQuietly();
        return;
      }
      const id = event.sessionId;
      const lease = id ? this.leases.get(id) : undefined;
      if (!id || !lease) {
        if (event.type === "session.updated") for (const listener of this.organizationListeners) listener(event);
        return;
      }
      if (this.store.get(id).loading) {
        lease.bufferBytes += JSON.stringify(event).length;
        if (lease.buffer.length >= chatPolicy.maxBufferedEvents || lease.bufferBytes > chatPolicy.maxFrameBytes) {
          lease.buffer = [];
          lease.bufferBytes = 0;
          lease.overflow = true;
          this.store.update(id, (state) => ({ ...state, error: { code: "RESYNC_REQUIRED", message: "Die Sitzung wird neu abgeglichen.", outcome: "not_sent" } }));
        } else lease.buffer.push(event);
      } else this.event(id, event);
    }
  }
  private snapshot(id: string, snapshot: HermesV2Snapshot): void {
    const lease = this.leases.get(id);
    const previousRequests = this.store.get(id).requests;
    this.store.set(id, applyChatSnapshot(this.store.get(id), snapshot));
    this.requests.snapshot(previousRequests, snapshot.requests);
    this.composer.sync(id);
    this.upsertSummary(snapshot.session);
    this.work.snapshot(id);
    if (lease) {
      const buffered = lease.buffer;
      lease.buffer = [];
      lease.bufferBytes = 0;
      for (const event of buffered) this.event(id, event);
      if (lease.overflow) {
        lease.overflow = false;
        this.syncQuietly(id, true);
      }
    }
  }
  private event(id: string, event: HermesV2Event): void {
    const before = this.store.get(id);
    const next = applyChatEvent(before, event);
    if (next === before) return;
    this.store.set(id, next);
    this.work.event(id, event);
    if (next.cwdRevision !== before.cwdRevision) this.work.sync();
    if (event.type === "request.closed") this.requests.closed(event.payload.requestKey, event.epoch);
    if (event.type === "request.opened") this.requests.snapshot([], next.requests);
    if (["session.updated", "message.started", "message.completed", "request.opened", "request.closed", "subagent.updated", "background.completed"].includes(event.type)) {
      for (const listener of this.organizationListeners) listener(event);
    }
    if (event.type === "session.updated") this.upsertSummary(event.payload.session);
    if (event.type === "session.updated") this.composer.sync(id);
    if (event.type === "message.completed" && event.payload.persistedTurn?.complete) this.syncQuietly(id, true);
  }
  private syncQuietly(id: string, force = false): void {
    void this.ensureSubscribed(id, force).catch(() => {
      // Der Session-Store enthält den sichtbaren Fehler; kein automatischer Schreibretry.
    });
  }
  private refreshQuietly(): void {
    if (this.organizationListeners.size) return;
    if (this.listPromise) { this.listDirty = true; return; }
    this.listPromise = this.refreshSessions().catch(() => {
      // Der Listen-Store enthält den Fehler; erneuter Anlass oder expliziter Retry lädt neu.
    }).finally(() => {
      this.listPromise = null;
      if (this.listDirty && this.enabled() && this.client.getSnapshot().state === "online") {
        this.listDirty = false;
        this.refreshQuietly();
      }
    });
  }
}

let sharedRuntime: ChatRuntime | null = null;
/** Bloßes Importieren erzeugt weder Runtime noch Socket. */
export function getChatRuntime(): ChatRuntime {
  sharedRuntime ??= new ChatRuntime();
  return sharedRuntime;
}

import { type HermesV2ClientMessage, type HermesV2Event, type HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import { randomUUID } from "node:crypto";
import { errorMessage, GatewayError, protocolError } from "./errors.js";
import { GatewayUpstream } from "./upstream.js";
import { GatewaySessions } from "./session-service.js";
import type { RequestRegistry } from "./request-registry.js";
import type { SecretRedactor } from "./secret-redactor.js";
import { sendBrowserMessage } from "./browser-output.js";
import { SessionOperationQueue } from "./operation-queue.js";
import type { OrganizationService } from "./organization/service.js";
import type { AttachmentService } from "./attachments/service.js";
import { MutationOutcome } from "./mutation-outcome.js";
import { normalizeEvent } from "./normalize-events.js";
import { performOperation } from "./operations.js";
import { supportedRequestMethods } from "./request-validation.js";
import { refreshBackground } from "./background-state.js";
import { GatewayRequestLifecycle } from "./request-lifecycle.js";
import { WorkService } from "./work/service.js";
import { createMutationGuard, SubscriptionGenerations } from "./binding-guard.js";
import type { HermesV2Policy } from "./policy.js";
import type { BrowserConnection, ConnectionState, GatewayDependencies, GatewayFrame, SessionRecord, UpstreamEvent } from "./types.js";

export class GatewayManager {
  readonly upstream: GatewayUpstream;
  readonly sessions: GatewaySessions;
  readonly work: WorkService;
  private readonly requests: GatewayRequestLifecycle;
  readonly connections = new Map<string, BrowserConnection>();
  readonly subscriptions = new SubscriptionGenerations();
  private queues = new SessionOperationQueue();
  private epoch: string | null = null;
  private disposed = false;
  private incompatible = false;
  private queuedOperations = 0;
  private lastRelease = "navigation";
  private readonly streamScope = `${randomUUID()}:`;

  constructor(
    readonly principal: string,
    private readonly deps: GatewayDependencies,
    readonly policy: HermesV2Policy,
    readonly registry: RequestRegistry,
    readonly secrets: SecretRedactor,
    private readonly onUnused: () => void,
    private readonly organization: OrganizationService | undefined = deps.organization,
    readonly attachments?: AttachmentService,
    readonly invalidateCatalog: () => void = () => this.publishSessionsInvalidation(),
  ) {
    this.upstream = new GatewayUpstream({
      authority: deps.authority, token: deps.dashboard.token, policy,
      onFrame: (frame) => this.receive(frame), onState: (state, epoch) => this.connectionState(state, epoch),
      onTransportClosed: (id) => this.registry.endTransport(id),
      onProtocolError: () => this.protectProtocolFault(),
    });
    this.sessions = new GatewaySessions(deps, this.upstream, policy, secrets, () => {
      if (!this.disposed && this.connections.size === 0) this.onUnused();
    }, this.organization, (record, messages, profile, context) => this.attachments?.history(this.principal, record.canonicalId, profile, messages, context));
    this.work = new WorkService(this, this.organization, (event, record) => this.broadcast(event, record));
    this.requests = new GatewayRequestLifecycle(this, deps.authority, (event, record) => this.broadcast(event, record),
      (record, event) => this.attention(record, "request", event, null), onUnused);
  }

  add(connection: BrowserConnection): void {
    if (this.disposed) throw new GatewayError("GATEWAY_OFFLINE", "Die Gateway-Verbindung wurde geschlossen.");
    if (!this.deps.enabled()) throw new GatewayError("FORBIDDEN", "Der Hermes-V2-Gateway ist deaktiviert.");
    if (this.connections.size >= this.policy.maxPending) throw new GatewayError("RATE_LIMITED", "Zu viele Browser-Verbindungen.");
    this.connections.set(connection.id, connection);
    this.organization?.attach(this.principal, connection.id);
    this.send(connection, { v: 1, type: "connection", state: this.upstream.state, epoch: this.upstream.epoch });
    // Das explizite Browser-Abo beginnt den Handshake; der Client wartet vor
    // seinem ersten RPC auf online. Import und Pool-Konstruktion bleiben lazy.
    void this.upstream.connect().catch((error: unknown) => {
      if (this.connections.get(connection.id) === connection) this.send(connection, errorMessage(error, null));
    });
  }

  release(connectionId: string, reason: string): void {
    this.connections.delete(connectionId);
    this.subscriptions.detach(connectionId);
    this.organization?.detach(this.principal, connectionId);
    this.registry.detach(this.principal, connectionId);
    this.secrets.finish(`${this.streamScope}${encodeURIComponent(connectionId)}:`);
    for (const record of this.sessions.records.values()) record.subscribers.delete(connectionId);
    this.lastRelease = reason;
    if (this.connections.size === 0) this.onUnused();
  }

  finishStream(connectionId: string, sessionId: string): void {
    this.secrets.finish(`${this.streamScope}${encodeURIComponent(connectionId)}:${encodeURIComponent(JSON.stringify(sessionId))}:`);
  }

  get retainRuntime(): boolean {
    if (this.queuedOperations > 0 || this.sessions.protection.active) return true;
    return [...this.sessions.records.values()].some((record) => {
      const active = ((record.liveId !== null || record.epoch !== this.upstream.epoch) && (record.snapshot.running !== false || record.backgroundActive !== false)) || record.snapshot.requests.length > 0;
      const owned = record.ownedBinding?.epoch === this.upstream.epoch && record.ownedBinding.liveId === record.liveId;
      return this.work.state.active(record) || record.backgroundProtected === true
        || active && (this.lastRelease !== "v2-disabled" || !owned);
    });
  }

  get disposeImmediately(): boolean { return this.lastRelease === "v2-disabled"; }

  async handle(connectionId: string, message: HermesV2ClientMessage): Promise<void> {
    if (!this.connections.has(connectionId)) return;
    if (this.queuedOperations >= this.policy.maxPending) {
      this.send(this.connections.get(connectionId)!, errorMessage(new GatewayError("RATE_LIMITED", "Zu viele gleichzeitige Anfragen."), message.id));
      return;
    }
    this.queuedOperations++;
    const key = "sessionId" in message ? message.sessionId : "global";
    const operation = async () => {
      const connection = this.connections.get(connectionId);
      if (!connection) return;
      const outcome = new MutationOutcome();
      try {
        if (this.incompatible) throw protocolError();
        if (!this.deps.enabled()) throw new GatewayError("FORBIDDEN", "Der Hermes-V2-Gateway ist deaktiviert.");
        await this.upstream.connect();
        const result = await performOperation(this, connectionId, message, outcome);
        const currentConnection = this.connections.get(connectionId);
        if (currentConnection) this.send(currentConnection, result);
        if (result.type === "result" && (result.op === "session.create" || result.op === "session.subscribe")) {
          const record = this.sessions.records.get(result.data.snapshot.session.id)!;
          if (!currentConnection) {
            record.subscribers.delete(connectionId);
            this.registry.detach(this.principal, connectionId, record.storedId);
          }
          for (const id of record.subscribers) if (id !== connectionId) {
            const other = this.connections.get(id);
            if (other) this.send(other, { v: 1, type: "snapshot", snapshot: result.data.snapshot });
          }
          this.flush(record);
        }
      } catch (error) {
        const failure = outcome.error(error);
        if (failure.code === "PROTOCOL_MISMATCH") this.incompatible = true;
        const record = this.sessions.records.get(key);
        if (failure.outcome === "unknown" && record) {
          if (message.op.startsWith("work.")) this.work.state.unknown(record);
          record.snapshot.running = null;
          record.backgroundActive = null;
          this.sessions.protection.holdKnown(record.canonicalId, record.liveId, record.epoch);
        }
        const connectionNow = this.connections.get(connectionId);
        if (connectionNow) this.send(connectionNow, errorMessage(failure, message.id));
        if (record?.hydrating) this.abortSnapshot(record);
      }
    };
    const pending = message.op === "work.read" || message.op === "work.subagent.tail" ? operation() : this.serial(key, operation);
    return pending.finally(() => {
      this.queuedOperations--;
      if (this.connections.size === 0) this.onUnused();
    });
  }

  requireSession(id: string, connectionId: string): SessionRecord {
    const record = this.sessions.records.get(id);
    if (!this.connections.has(connectionId) || !record || !record.subscribers.has(connectionId)) throw new GatewayError("FORBIDDEN", "Diese Verbindung hat die Session nicht abonniert.");
    if (record.liveId && record.epoch !== this.upstream.epoch) throw new GatewayError("SESSION_UNAVAILABLE", "Die Session muss erneut verbunden werden.", "not_sent", true);
    return record;
  }

  mutationGuard(connectionId: string, record?: SessionRecord): () => void {
    return createMutationGuard(this, () => !this.disposed && this.deps.enabled(), connectionId, record);
  }

  async runAttachmentStage<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    if (this.queuedOperations >= this.policy.maxPending) throw new GatewayError("RATE_LIMITED", "Zu viele gleichzeitige Anfragen.");
    this.queuedOperations++;
    try { return await this.queues.serial(sessionId, operation); }
    finally { this.queuedOperations--; if (this.connections.size === 0) this.onUnused(); }
  }

  async snapshot(record: SessionRecord): Promise<HermesV2Snapshot> {
    record.hydrationRevision = (record.hydrationRevision ?? 0) + 1;
    if (this.organization) {
      try { await this.organization.context(); }
      catch { /* Ein unbekannter Profilkontext liefert keine geratenen Lesebelege. */ }
    }
    record.hydrating = true;
    record.buffered.length = 0;
    record.bufferedBytes = 0;
    const snapshot = await this.sessions.refresh(record);
    if (record.liveId && snapshot.writable) {
      await this.syncRequests(record);
      await refreshBackground(this.upstream, record, () => this.work.state.active(record));
    }
    return snapshot;
  }

  abortSnapshot(record: SessionRecord): void {
    record.hydrating = false;
    record.buffered.length = 0;
    record.bufferedBytes = 0;
    record.snapshot.writable = false;
  }

  requestContext(record: SessionRecord, connectionId: string, epoch: string) {
    return this.requests.context(record, connectionId, epoch);
  }

  async syncRequests(record: SessionRecord): Promise<void> {
    await this.requests.sync(record);
  }

  publishMetadataInvalidation(sessionId: string, revision: number): void {
    this.broadcast({ sessionId, epoch: this.epoch ?? "unknown", seq: null, type: "metadata.invalidated", payload: { sessionId, revision } });
  }
  publishSessionsInvalidation(): void {
    this.broadcast({ sessionId: null, epoch: this.epoch ?? "unknown", seq: null, type: "sessions.invalidated", payload: {} });
  }
  publishResourcesInvalidation(resource: "cron" | "sessions", sessionIds: string[] = []): void {
    this.broadcast({ sessionId: null, epoch: this.epoch ?? "unknown", seq: null, type: "resources.invalidated", payload: { resource, sessionIds } });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.upstream.dispose();
    this.sessions.protection.dispose();
    this.work.clear();
    for (const id of this.connections.keys()) this.registry.detach(this.principal, id);
    this.registry.detach(this.principal, `runtime:${this.principal}`);
    this.connections.clear();
    this.sessions.records.clear();
    this.secrets.finish(this.streamScope);
  }

  private receive(frame: GatewayFrame): void {
    try {
      if (frame.kind === "request") {
        if (!supportedRequestMethods.has(frame.request.method) || typeof frame.request.params.session_id !== "string") {
          void this.upstream.respond(frame.request.id, null).catch(() => this.upstream.protocolFault());
          return;
        }
        if (this.upstream.quarantined) return;
        for (const record of this.sessions.records.values()) {
          if (record.liveId === frame.request.params.session_id) this.requests.observe(record, frame.request, true);
        }
        return;
      }
      const event = frame.event;
      this.sessions.protection.onEvent(event);
      if (this.upstream.quarantined) return;
      if (event.type === "cron.changed") { this.publishResourcesInvalidation("cron"); return; }
      if (event.type === "sessions.changed") {
        this.organization?.changed();
        this.broadcast({ sessionId: null, epoch: this.upstream.epoch ?? "unknown", seq: null, type: "sessions.invalidated", payload: {} });
        return;
      }
      for (const record of this.sessions.records.values()) {
        if (![record.storedId, record.canonicalId, record.liveId].includes(event.session_id ?? "")) continue;
        if (record.hydrating) {
          const bytes = Buffer.byteLength(JSON.stringify(event));
          if (record.buffered.length >= this.policy.maxBufferedEvents || record.bufferedBytes + bytes > this.policy.sendQueueBytes) throw new GatewayError("RATE_LIMITED", "Die Hermes-Verbindung ist überlastet.");
          record.buffered.push(event);
          record.bufferedBytes += bytes;
        } else this.applyEvent(record, event);
      }
    } catch {
      for (const connection of this.connections.values()) this.send(connection, errorMessage(protocolError(), null));
      this.upstream.protocolFault();
    }
  }

  private protectProtocolFault(): boolean {
    this.incompatible = true;
    for (const record of this.sessions.records.values()) {
      if (!record.liveId) continue;
      record.ownedBinding = null;
      record.snapshot.running = null;
      record.snapshot.writable = false;
      record.backgroundActive = null;
      this.sessions.protection.holdKnown(record.canonicalId, record.liveId, record.epoch);
    }
    return this.retainRuntime;
  }

  private applyEvent(record: SessionRecord, event: UpstreamEvent): void {
    if (event.session_id === record.liveId && event.seq !== undefined) {
      if (event.seq <= record.seq) return;
      record.seq = event.seq;
      record.snapshot.cursor = event.seq;
    }
    if (event.type === "request.cancel") {
      if (typeof event.payload?.id === "string" && record.liveId) this.registry.cancel(this.deps.authority, record.epoch, record.liveId, event.payload.id);
      return;
    }
    this.work.observe(record, event);
    const normalized = normalizeEvent(event, record, this.secrets);
    if (!normalized) return;
    if (event.type === "session.info" && typeof event.payload?.profile_name === "string") record.profileName = event.payload.profile_name;
    try { this.organization?.observe(record, event, normalized); }
    catch { /* Organisationsfehler dürfen eine fremde laufende Runtime nicht beenden. */ }
    const rawStream = normalized.type === "message.delta" || normalized.type === "reasoning.delta" ? event.payload!.text as string : undefined;
    this.broadcast(normalized, record, rawStream);
    if (["subagent.spawn_requested", "subagent.start", "subagent.complete", "background.complete", "btw.complete"].includes(event.type)) {
      record.backgroundActive = null;
      this.checkBackground(record);
    }
    if (normalized.type === "message.completed" || normalized.type === "session.error") {
      const rowId = normalized.type === "message.completed" ? normalized.payload.persistedTurn?.assistantRowId : null;
      const cursor = record.liveId && event.seq ? { epoch: record.epoch, liveId: record.liveId, seq: event.seq } : null;
      this.attention(record, normalized.type === "message.completed" ? "completed" : "error", rowId ? `row:${rowId}` : `${record.epoch}:${record.liveId}:${event.seq ?? record.turnId}`, cursor);
      record.backgroundActive = null;
      this.checkBackground(record);
    }
  }

  private attention(record: SessionRecord, kind: "completed" | "error" | "request", eventId: string, cursor: { epoch: string; liveId: string; seq: number } | null): void {
    try { this.deps.onAttention?.({ principal: this.principal, sessionId: record.storedId, kind, eventId, completedAt: null, cursor }); }
    catch { /* Eine optionale Benachrichtigung darf den Hermes-Transport nicht beenden. */ }
  }

  private checkBackground(record: SessionRecord): void {
    void refreshBackground(this.upstream, record, () => this.work.state.active(record)).then(() => {
      if (this.connections.size === 0) this.onUnused();
    }).catch(() => { /* Unbekannte Runtime-Arbeit bleibt geschützt, ohne Pollschleife. */ });
  }

  private connectionState(state: ConnectionState, epoch: string | null): void {
    if (state !== "online") this.secrets.finish(this.streamScope);
    if (state === "incompatible") this.incompatible = true;
    for (const connection of this.connections.values()) this.send(connection, { v: 1, type: "connection", state, epoch });
    if (state !== "online" || !epoch || this.disposed) return;
    const previous = this.epoch;
    this.epoch = epoch;
    this.organization?.epoch(epoch);
    this.sessions.protection.resync();
    this.registry.expireEpoch(this.deps.authority, epoch);
    if (!previous) return;
    for (const record of this.sessions.records.values()) {
      if (record.epoch !== epoch) {
        record.ownedBinding = null;
        record.backgroundActive = null;
        record.snapshot.running = null;
      }
      void this.serial(record.storedId, async () => {
        if (this.disposed) return;
        try {
          if (record.epoch !== epoch) {
            record.liveId = null;
            record.seq = 0;
            record.buffered.length = 0;
            await this.sessions.attach(record.storedId);
          }
          const snapshot = await this.snapshot(record);
          for (const id of record.subscribers) {
            const connection = this.connections.get(id);
            if (connection) this.send(connection, { v: 1, type: "snapshot", snapshot });
          }
          this.flush(record);
        } catch (error) {
          record.hydrating = false;
          record.snapshot.writable = false;
          for (const id of record.subscribers) {
            const connection = this.connections.get(id);
            if (connection) this.send(connection, errorMessage(error, null));
          }
        }
      });
    }
  }

  private flush(record: SessionRecord): void {
    const pending = record.buffered;
    record.buffered = [];
    record.bufferedBytes = 0;
    record.hydrating = false;
    for (const event of pending) this.applyEvent(record, event);
  }

  private broadcast(event: HermesV2Event, record?: SessionRecord, rawStream?: string): void {
    for (const connection of this.connections.values()) {
      if (!record || record.subscribers.has(connection.id)) this.send(connection, { v: 1, type: "event", event }, rawStream);
    }
  }

  private send(connection: BrowserConnection, message: Parameters<BrowserConnection["send"]>[0], rawStream?: string): void {
    sendBrowserMessage(connection, message, this.secrets, this.streamScope,
      (frame) => this.organization?.frame(this.principal, frame, connection.readEvidence === true) ?? frame, this.policy.browserBytes, rawStream);
  }

  private async serial(key: string, operation: () => Promise<void>): Promise<void> {
    return this.queues.serial(key, operation);
  }
}

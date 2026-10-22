import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hermesV2SnapshotSchema, type HermesV2ClientMessage, type HermesV2Snapshot, type HermesV2Message } from "@wrapt/contracts/hermes-v2";
import { CwdPolicy } from "./cwd-policy.js";
import { GatewayError, protocolError } from "./errors.js";
import { normalizeHistory } from "./normalize-history.js";
import { withReplayTools } from "./snapshot-tools.js";
import { normalizeInflight, normalizeSession, selection } from "./normalize-sessions.js";
import { normalizeComposerSettings } from "./normalize-settings.js";
import { text, timestamp } from "./normalize-values.js";
import { activeSchema, detailSchema, historySchema, listSchema, parse, replaySchema, sessionReplySchema } from "./upstream-schemas.js";
import type { GatewayDependencies, SessionRecord } from "./types.js";
import type { GatewayUpstream } from "./upstream.js";
import type { HermesV2Policy } from "./policy.js";
import type { SecretRedactor } from "./secret-redactor.js";
import { MutationOutcome } from "./mutation-outcome.js";
import { AttachmentProtection } from "./attachment-protection.js";
import type { OrganizationService } from "./organization/service.js";
import { captureHistoryContext, type HistoryContext } from "./history-context.js";
import { observeSessionContext } from "./session-context.js";
import { HermesClientError } from "../client.js";

export class GatewaySessions {
  readonly records = new Map<string, SessionRecord>();
  readonly protection: AttachmentProtection;
  private readonly cwd: CwdPolicy;

  constructor(private readonly deps: GatewayDependencies, private readonly upstream: GatewayUpstream, private readonly policy: HermesV2Policy, private readonly secrets: SecretRedactor, onProtectionChanged: () => void,
    private readonly organization: OrganizationService | undefined = deps.organization,
    private readonly attachmentHistory?: (record: SessionRecord, messages: HermesV2Message[], profile: string | undefined, context: HistoryContext) => void | Promise<void>) {
    this.cwd = new CwdPolicy(deps.allowedRoots, deps.deniedRoots);
    this.protection = new AttachmentProtection(upstream, policy.maxSessions, onProtectionChanged, (hold) => {
      for (const record of this.records.values()) {
        if (record.epoch !== hold.epoch || record.liveId !== hold.liveId) continue;
        record.snapshot.running = false;
        record.snapshot.session.running = false;
        record.snapshot.requests = [];
        record.backgroundActive = false;
      }
    });
  }

  async list(query: string | undefined, limit: number) {
    const saved = parse(listSchema, await this.upstream.call("session.list", { title: query ?? "", limit: limit + 1 }));
    const active = parse(activeSchema, await this.upstream.call("session.active_list", {}));
    const live = new Map(active.sessions.map((row) => [row.session_key, row]));
    const sessions = saved.sessions.slice(0, limit).map((row) => {
      const current = live.get(row.id);
      const summary = normalizeSession(row.id, row);
      if (current) {
        const record = this.records.get(row.id);
        const scope = this.organization?.scopes.confirmed;
        const bound = scope && record?.profileName === scope.profile && record.liveId === current.id && record.epoch === this.upstream.epoch;
        summary.running = bound && (current.status === "working" || current.status === "starting") ? true : null;
        summary.model = text(current.model, 200) || summary.model;
      }
      return summary;
    });
    for (const record of this.records.values()) if (record.snapshot.session.draft && sessions.length < limit && !sessions.some((session) => session.id === record.storedId)) sessions.push(record.snapshot.session);
    return { sessions, hasMore: saved.sessions.length > limit };
  }

  async create(message: Extract<HermesV2ClientMessage, { op: "session.create" }>, beforeSend: () => void, outcome: MutationOutcome): Promise<SessionRecord> {
    this.checkCapacity();
    const cwd = await this.cwd.validate(await this.deps.resolveProjectCwd(message.projectId));
    beforeSend();
    const protection = this.protection.reserve(null);
    try {
      const raw = await outcome.call(this.upstream, "session.create", {
        cwd, ...(message.title ? { title: message.title } : {}), ...(message.selection ? message.selection : {}),
        close_on_disconnect: false, idempotency_key: randomUUID(),
      });
      this.protection.observe(protection, raw);
      const value = parse(sessionReplySchema, raw);
      if (!value.stored_session_id) throw protocolError();
      await this.cwd.validate(value.info.cwd);
      const record = this.record(value.stored_session_id, value.session_id, true);
      record.profileName = typeof value.info.profile_name === "string" ? value.info.profile_name : null;
      record.snapshot.session = { ...normalizeSession(record.storedId, { ...value.info, title: message.title ?? value.info.title }), projectId: message.projectId, draft: true };
      record.snapshot.selection = selection(value.info);
      this.protection.release(protection);
      return record;
    } catch (error) {
      const failure = outcome.error(error);
      if (failure.outcome === "not_sent") this.protection.release(protection);
      else this.protection.resync();
      throw failure;
    }
  }

  async attach(id: string, beforeResume?: () => void, outcome = new MutationOutcome()): Promise<SessionRecord> {
    let record = this.records.get(id);
    if (record?.liveId && record.epoch === this.upstream.epoch) {
      try { await this.cwd.validate(record.snapshot.session.cwd); }
      catch (error) { this.block(record, error); }
      return record;
    }
    if (!record) this.checkCapacity();
    const detail = parse(detailSchema, await this.deps.dashboard.get(`/api/sessions/${encodeURIComponent(id)}`));
    if (detail.id !== id) throw new GatewayError("SESSION_NOT_FOUND", "Die genaue Hermes-Session wurde nicht gefunden.");
    try { await this.cwd.validate(detail.cwd); }
    catch (error) {
      record ??= this.record(id, null, false);
      record.snapshot.session = normalizeSession(id, detail);
      record.snapshot.writable = false;
      record.snapshot.blockedReason = error instanceof GatewayError ? error.message : "Unbekanntes Arbeitsverzeichnis.";
      return record;
    }
    const descendant = parse(z.object({ requested_session_id: z.string(), session_id: z.string(), path: z.array(z.string()).max(1_000) }), await this.deps.dashboard.get(`/api/sessions/${encodeURIComponent(id)}/latest-descendant`));
    if (descendant.requested_session_id !== id || descendant.path[0] !== id || descendant.path.at(-1) !== descendant.session_id) throw protocolError();
    const target = parse(detailSchema, await this.deps.dashboard.get(`/api/sessions/${encodeURIComponent(descendant.session_id)}`));
    if (target.id !== descendant.session_id) throw protocolError();
    await this.cwd.validate(target.cwd);
    beforeResume?.();
    const protection = this.protection.reserve(target.id);
    try {
      const raw = await outcome.call(this.upstream, "session.resume", {
        session_id: target.id, lazy: true, omit_messages: true, close_on_disconnect: false,
      });
      this.protection.observe(protection, raw);
      const reply = parse(sessionReplySchema, raw);
      if ((reply.stored_session_id ?? reply.session_key ?? reply.resumed) !== target.id) throw protocolError();
      record ??= this.record(id, reply.session_id, false);
      // Resume kann eine fremde Live-Session wiederverwenden; deren Disconnect-Flag ist unbekannt.
      record.ownedBinding = null;
      record.backgroundActive = null;
      record.liveId = reply.session_id;
      record.canonicalId = target.id;
      record.epoch = this.upstream.epoch!;
      record.profileName = typeof reply.info.profile_name === "string" ? reply.info.profile_name : null;
      record.snapshot.session = normalizeSession(id, { ...target, ...reply.info }, record.snapshot.session);
      record.snapshot.running = typeof reply.running === "boolean" ? reply.running : typeof reply.info.running === "boolean" ? reply.info.running : null;
      record.snapshot.inflight = normalizeInflight(reply.inflight, this.secrets);
      try { await this.cwd.validate(reply.info.cwd); }
      catch (error) { this.block(record, error); }
      if (record.snapshot.writable) this.protection.release(protection);
      else this.protection.resync();
      return record;
    } catch (error) {
      const failure = outcome.error(error);
      if (failure.outcome === "not_sent") this.protection.release(protection);
      else this.protection.resync();
      throw failure;
    }
  }

  async refresh(record: SessionRecord): Promise<HermesV2Snapshot> {
    if (record.liveId && record.snapshot.writable) {
      try {
        await this.cwd.validate(record.snapshot.session.cwd);
        if (!record.snapshot.session.draft) {
          const detail = parse(detailSchema, await this.deps.dashboard.get(`/api/sessions/${encodeURIComponent(record.canonicalId)}`));
          if (detail.id !== record.canonicalId) throw protocolError();
          await this.cwd.validate(detail.cwd);
        }
      } catch (error) {
        if (error instanceof GatewayError && error.code === "PROTOCOL_MISMATCH") throw error;
        this.block(record, error);
      }
    }
    if (!record.liveId || !record.snapshot.writable) {
      const history = await this.history(record.storedId, 200, 0);
      record.snapshot.messages = history.messages;
      record.snapshot.hasOlder = history.hasMore;
      return record.snapshot;
    }
    for (let attempt = 0; attempt < this.policy.snapshotAttempts; attempt++) {
      const before = parse(replaySchema, await this.upstream.call("session.events.since", { session_id: record.liveId, last_seen: 0 }));
      const history = record.snapshot.session.draft ? { messages: [], hasMore: false } : await this.history(record.storedId, 200, 0);
      const reply = parse(sessionReplySchema, await this.upstream.call("session.activate", { session_id: record.liveId, omit_messages: true }));
      const after = parse(replaySchema, await this.upstream.call("session.events.since", { session_id: record.liveId, last_seen: before.latest_seq }));
      if (before.epoch !== this.upstream.epoch || after.epoch !== before.epoch) throw protocolError();
      if (before.latest_seq !== after.latest_seq) continue;
      try { await this.cwd.validate(reply.info.cwd); }
      catch (error) {
        this.block(record, error);
        record.snapshot.messages = history.messages;
        record.snapshot.hasOlder = history.hasMore;
        return record.snapshot;
      }
      const running = typeof reply.running === "boolean" ? reply.running : typeof reply.info.running === "boolean" ? reply.info.running : null;
      const session = normalizeSession(record.storedId, { ...reply.info, running, message_count: reply.message_count }, record.snapshot.session);
      const projectedMessages = withReplayTools(history.messages, before.events, { epoch: before.epoch, liveId: record.liveId, running }, this.secrets);
      const snapshot = hermesV2SnapshotSchema.parse({
        session, epoch: before.epoch, cursor: after.latest_seq, writable: true, blockedReason: null,
        selection: selection(reply.info), reasoningEffort: typeof reply.info.reasoning_effort === "string" ? text(reply.info.reasoning_effort, 100) : null,
        composer: normalizeComposerSettings(reply.info),
        running, turnStartedAt: timestamp(reply.turn_started_at ?? reply.info.turn_started_at),
        inflight: normalizeInflight(reply.inflight, this.secrets), queuedText: reply.queued ? text(reply.queued.user, 200_000, this.secrets) : null,
        requests: [], messages: projectedMessages, hasOlder: history.hasMore,
      });
      this.organization?.copyRows(projectedMessages, snapshot.messages);
      observeSessionContext(record, reply.info);
      record.snapshot = snapshot;
      if (before.truncated) this.organization?.replayEvicted(record, before.events[0]?.seq ?? before.latest_seq + 1);
      record.seq = after.latest_seq;
      return snapshot;
    }
    throw new GatewayError("SESSION_UNAVAILABLE", "Die Session wird gerade aktualisiert. Bitte erneut verbinden.", "not_sent", true);
  }

  async history(id: string, limit: number, offset: number) {
    // Die Seite gehört zum Kontext vor dem Read, auch wenn ein gleichnamiges Profil zurückkehrt.
    const context = captureHistoryContext(this.organization);
    let value: unknown;
    try {
      // Eine zusätzliche ältere Rohzeile belegt die nächste Seite ohne zweiten Request.
      value = await this.deps.dashboard.get(`/api/sessions/${encodeURIComponent(id)}/messages?limit=${limit + 1}&offset=${offset}&order=latest&inline_images=false`);
    } catch (error) {
      // Neue Live-Sitzungen werden erst mit dem ersten Turn im Dashboard gespeichert.
      if (error instanceof HermesClientError && (error.status === 404 || error.status === 410)) {
        return { sessionId: id, messages: [], offset, returned: 0, hasMore: false };
      }
      throw error;
    }
    const result = parse(historySchema, value);
    const hasMore = result.messages.length > limit;
    // order=latest liefert die ausgewählte Seite chronologisch, der Zeuge steht vorn.
    const raw = { ...result, messages: result.messages.slice(-limit) };
    const known = this.records.get(id);
    if (raw.session_id !== id && raw.session_id !== known?.canonicalId) throw protocolError();
    const messages = normalizeHistory(raw.messages, id, offset, this.secrets);
    if (known && context && await context.current()) await this.attachmentHistory?.(known, messages, raw.profile, context);
    if (context && await context.current()) this.organization?.history(context, id, raw, messages);
    else for (const row of messages) delete row.attachments;
    return { sessionId: id, messages, offset, returned: raw.messages.length, hasMore };
  }

  async writable(record: SessionRecord) {
    if (!record.liveId || !record.snapshot.writable || record.epoch !== this.upstream.epoch) {
      throw new GatewayError("PROJECT_FORBIDDEN", "Diese Session ist momentan nur lesbar.");
    }
    await this.cwd.validate(record.snapshot.session.cwd);
    if (!record.snapshot.session.draft) {
      const detail = parse(detailSchema, await this.deps.dashboard.get(`/api/sessions/${encodeURIComponent(record.storedId)}`));
      if (detail.id !== record.storedId) throw protocolError();
      await this.cwd.validate(detail.cwd);
    }
    const reply = parse(sessionReplySchema, await this.upstream.call("session.activate", { session_id: record.liveId, omit_messages: true }));
    observeSessionContext(record, reply.info, true);
    await this.cwd.validate(reply.info.cwd);
    record.snapshot.session.cwd = reply.info.cwd;
    return reply;
  }

  private checkCapacity(): void {
    if (this.records.size >= this.policy.maxSessions) throw new GatewayError("RATE_LIMITED", "Zu viele offene Hermes-Sessions.");
  }

  private block(record: SessionRecord, error: unknown): void {
    record.snapshot.writable = false;
    record.snapshot.blockedReason = error instanceof GatewayError ? error.message : "Das Arbeitsverzeichnis ist nicht verfügbar.";
  }

  private record(id: string, liveId: string | null, owned: boolean): SessionRecord {
    const epoch = this.upstream.epoch;
    if (!epoch) throw protocolError();
    const snapshot: HermesV2Snapshot = {
      session: normalizeSession(id, {}), epoch, cursor: 0, writable: liveId !== null, blockedReason: null,
      selection: null, reasoningEffort: null, running: liveId ? false : null, turnStartedAt: null,
      inflight: null, queuedText: null, requests: [], messages: [],
    };
    const record: SessionRecord = {
      storedId: id, canonicalId: id, liveId, epoch, snapshot, ownedBinding: owned && liveId ? { epoch, liveId } : null,
      turnId: randomUUID(), seq: 0, hydrating: false, buffered: [], bufferedBytes: 0,
      backgroundActive: owned ? false : null, subscribers: new Set(),
    };
    this.records.set(id, record);
    return record;
  }
}

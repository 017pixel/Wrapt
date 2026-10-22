import { randomUUID } from "node:crypto";
import type { HermesV2Request, HermesV2Response } from "@wrapt/contracts/hermes-v2";
import { GatewayError } from "./errors.js";
import { normalizeRequest, validateAnswer } from "./request-validation.js";
import type { UpstreamRequest } from "./types.js";

interface Viewer {
  principal: string;
  connectionId: string;
  sessionId: string;
  closed(key: string): void;
}
interface Entry {
  key: string;
  authorityKey: string;
  origin: string;
  liveId: string;
  epoch: string;
  raw: UpstreamRequest;
  views: Map<string, Viewer>;
  claim: { token: string; owner: string; transportId: string; ended: boolean } | null;
}
interface Context {
  origin: string;
  liveId: string;
  epoch: string;
  principal: string;
  sessionId: string;
  connectionId: string;
  transportId: string;
}

/** Poolweiter Claim verhindert lokale Doppelantworten auch über mehrere Principals. */
export class RequestRegistry {
  private entries = new Map<string, Entry>();
  private authorityKeys = new Map<string, string>();

  observe(raw: UpstreamRequest, context: Context, closed: Viewer["closed"]): HermesV2Request | null {
    if (raw.params.session_id !== context.liveId) return null;
    const authorityKey = JSON.stringify([context.origin, context.epoch, context.liveId, raw.id]);
    const existingKey = this.authorityKeys.get(authorityKey);
    let entry = existingKey ? this.entries.get(existingKey) : undefined;
    if (!entry) {
      if (this.entries.size >= 3_200) throw new GatewayError("RATE_LIMITED", "Zu viele offene Hermes-Anfragen.");
      entry = { key: randomUUID(), authorityKey, origin: context.origin, liveId: context.liveId, epoch: context.epoch, raw, views: new Map(), claim: null };
      if (!normalizeRequest(raw, entry.key, context.sessionId, context.epoch)) return null;
      this.entries.set(entry.key, entry);
      this.authorityKeys.set(authorityKey, entry.key);
    } else if (!entry.claim) entry.raw = raw;
    entry.views.set(JSON.stringify([context.principal, context.connectionId, context.sessionId]), {
      principal: context.principal, connectionId: context.connectionId, sessionId: context.sessionId, closed,
    });
    return normalizeRequest(entry.raw, entry.key, context.sessionId, context.epoch);
  }

  claim(key: string, context: Context, response: HermesV2Response, beforeClaim?: () => void): { id: string; result: Record<string, unknown>; token: string } {
    const entry = this.require(key, context);
    const request = normalizeRequest(entry.raw, key, context.sessionId, context.epoch);
    if (!request) throw new GatewayError("STALE_REQUEST", "Diese Hermes-Anfrage ist nicht mehr verfügbar.");
    const result = validateAnswer(request, response);
    const token = this.acquire(entry, context, beforeClaim);
    return { id: entry.raw.id, result, token };
  }

  lock(key: string, context: Context, questionId: string, answer: string | null): { id: string; token: string } {
    const entry = this.require(key, context);
    const request = normalizeRequest(entry.raw, key, context.sessionId, context.epoch);
    if (request?.kind !== "clarify" || !request.questions.some((question) => question.id === questionId)) {
      throw new GatewayError("INVALID_MESSAGE", "Die Frage gehört nicht zu dieser Anfrage.");
    }
    validateAnswer(request, { kind: "clarify", answers: { [questionId]: answer } });
    return { id: entry.raw.id, token: this.acquire(entry, context) };
  }

  unlock(key: string, token: string): void {
    const entry = this.entries.get(key);
    if (entry?.claim?.token === token) entry.claim = null;
  }

  endTransport(transportId: string): void {
    for (const entry of this.entries.values()) if (entry.claim?.transportId === transportId) entry.claim.ended = true;
  }

  reconcile(origin: string, epoch: string, liveId: string, rawIds: readonly string[], transportId: string): void {
    const present = new Set(rawIds);
    for (const entry of [...this.entries.values()]) {
      if (entry.origin !== origin || entry.epoch !== epoch || entry.liveId !== liveId) continue;
      if (!present.has(entry.raw.id)) this.close(entry.key);
      // Erst eine neue autoritative Sicht nach Ende des alten Sends erlaubt einen bewussten neuen Versuch.
      else if (entry.claim?.ended && entry.claim.transportId !== transportId) entry.claim = null;
    }
  }

  cancel(origin: string, epoch: string, liveId: string, rawId: string): void {
    const key = this.authorityKeys.get(JSON.stringify([origin, epoch, liveId, rawId]));
    if (key) this.close(key);
  }

  detach(principal: string, connectionId: string, sessionId?: string): void {
    for (const entry of this.entries.values()) {
      for (const [key, viewer] of entry.views) {
        if (viewer.principal === principal && viewer.connectionId === connectionId && (sessionId === undefined || viewer.sessionId === sessionId)) entry.views.delete(key);
      }
    }
  }

  expireEpoch(origin: string, epoch: string): void {
    for (const entry of [...this.entries.values()]) if (entry.origin === origin && entry.epoch !== epoch) this.close(entry.key);
  }

  dispose(): void { this.entries.clear(); this.authorityKeys.clear(); }

  private acquire(entry: Entry, context: Context, beforeClaim?: () => void): string {
    if (entry.claim) throw new GatewayError("REQUEST_CLAIMED", "Eine andere Oberfläche beantwortet diese Anfrage bereits.");
    beforeClaim?.();
    const token = randomUUID();
    entry.claim = { token, owner: JSON.stringify([context.principal, context.connectionId]), transportId: context.transportId, ended: false };
    return token;
  }

  private require(key: string, context: Context): Entry {
    const entry = this.entries.get(key);
    const viewer = entry?.views.get(JSON.stringify([context.principal, context.connectionId, context.sessionId]));
    if (!entry || !viewer || viewer.sessionId !== context.sessionId || entry.origin !== context.origin || entry.epoch !== context.epoch || entry.liveId !== context.liveId) {
      throw new GatewayError("STALE_REQUEST", "Diese Hermes-Anfrage ist abgelaufen oder gehört zu einer anderen Verbindung.");
    }
    return entry;
  }

  private close(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.authorityKeys.delete(entry.authorityKey);
    for (const viewer of entry.views.values()) viewer.closed(key);
  }
}

import { randomBytes, randomUUID } from "node:crypto";
import type { BrowserContext, Route } from "@playwright/test";
import {
  hermesV2ActivitySchema, hermesV2CatalogQuerySchema, hermesV2MembersPageSchema,
  hermesV2NoticesPageSchema, hermesV2OrganizationBatchSchema,
  hermesV2OrganizationMutationSchema, hermesV2OrganizeSchema, hermesV2ReadAckSchema,
  hermesV2ReadResultSchema, hermesV2ReorderSchema, hermesV2SummaryLookupResultSchema,
  hermesV2SummaryLookupSchema, hermesV2SummaryPageSchema, hermesV2UndoSchema,
  type HermesV2Activity, type HermesV2Organization, type HermesV2Session,
  type HermesV2Snapshot,
} from "../../packages/contracts/src/hermes-v2";

interface BrowserGateway {
  readonly stories: Map<string, { snapshot: HermesV2Snapshot }>;
  metadataChanged(sessionId: string, revision: number): void;
}
interface SavedUndo { items: HermesV2Organization[]; revisions: Map<string, number>; expiresAt: number }

/** Ausschließlich Browser-Testdaten. Alle Antworten durch die echten Contracts prüfen. */
export class HermesV2BrowserOrganization {
  readonly calls: Array<{ method: string; path: string; body: unknown }> = [];
  readonly metadata = new Map<string, HermesV2Organization>();
  readonly activity = new Map<string, HermesV2Activity>();
  readonly evidence = new Map<string, { sessionId: string; factId: string }>();
  private undo = new Map<string, SavedUndo>();
  private pinRevision = 0;
  private membershipRevision = 0;
  rejectNextAction = false;

  constructor(private readonly gateway: BrowserGateway) {}

  item(sessionId: string): HermesV2Organization {
    let item = this.metadata.get(sessionId);
    if (!item) {
      item = {
        sessionId, revision: 0, pinRevision: this.pinRevision, pinRank: null,
        snoozedAt: null, snoozedUntil: null, settledAt: null,
        effectiveSnoozedUntil: null, effectiveSettledAt: null,
        organizationCursor: 0, organizationCoverageRevision: 0,
        attention: { unreadCount: 0, requiresAttention: false, latest: null },
        coverage: { state: "anchored", revision: 0, reason: null }, serverNow: Date.now(),
      };
      this.metadata.set(sessionId, item);
    }
    return { ...structuredClone(item), pinRevision: this.pinRevision, serverNow: Date.now() };
  }

  setActivity(sessionId: string, state: HermesV2Activity["state"]): void {
    this.activity.set(sessionId, hermesV2ActivitySchema.parse({
      state, turnStartedAt: state === "working" ? Date.now() - 60_000 : null,
      openRequestCount: state === "waiting_input" ? 1 : 0, subagentCount: null,
      backgroundCount: null, observedAt: Date.now(), coverage: "observed",
    }));
  }

  newAnswer(sessionId: string): string {
    const item = this.item(sessionId);
    const factId = randomUUID();
    const handle = randomBytes(32).toString("hex");
    item.revision++;
    item.effectiveSnoozedUntil = null;
    item.effectiveSettledAt = null;
    item.attention = { unreadCount: 1, requiresAttention: true,
      latest: { id: factId, kind: "new-answer", unread: true, relevant: true, observedAt: Date.now(), completedAt: Date.now() } };
    this.metadata.set(sessionId, item);
    this.evidence.set(handle, { sessionId, factId });
    this.gateway.metadataChanged(sessionId, item.revision);
    return handle;
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route("**/api/v1/hermes/v2/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace("/api/v1/hermes/v2", "");
      const body: unknown = request.method() === "POST" ? request.postDataJSON() : null;
      this.calls.push({ method: request.method(), path, body });
      await this.handle(route, path, url.searchParams, body);
    });
  }

  private summaries(ids?: readonly string[]): HermesV2Session[] {
    return [...this.gateway.stories.values()].map(({ snapshot }) => snapshot.session)
      .filter((session) => !ids || ids.includes(session.id));
  }

  private activities(sessions: readonly HermesV2Session[]): Record<string, HermesV2Activity> {
    return Object.fromEntries(sessions.map((session) => [session.id, this.activity.get(session.id) ?? {
      state: "idle", turnStartedAt: null, openRequestCount: 0, subagentCount: null,
      backgroundCount: null, observedAt: Date.now(), coverage: "observed",
    }]));
  }

  private async handle(route: Route, path: string, query: URLSearchParams, body: unknown): Promise<void> {
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/sessions") {
      const input = hermesV2CatalogQuerySchema.parse(Object.fromEntries(query));
      const all = this.summaries();
      const page = all.slice(input.offset, input.offset + input.limit);
      const q = input.q?.toLocaleLowerCase() ?? "";
      const sessions = page.filter((session) => `${session.title} ${session.id} ${session.cwd ?? ""}`.toLocaleLowerCase().includes(q));
      const nextOffset = input.offset + input.limit < all.length ? input.offset + input.limit : null;
      await respond(hermesV2SummaryPageSchema.parse({
        sessions, activity: this.activities(sessions), offset: input.offset, limit: input.limit,
        nextOffset, hasMore: nextOffset !== null, coverage: nextOffset === null ? "complete" : "partial", serverNow: Date.now(),
      }));
      return;
    }
    if (path === "/sessions/lookup") {
      const { sessionIds } = hermesV2SummaryLookupSchema.parse(body);
      const sessions = this.summaries(sessionIds);
      await respond(hermesV2SummaryLookupResultSchema.parse({ sessions, activity: this.activities(sessions),
        missingSessionIds: sessionIds.filter((id) => !sessions.some((session) => session.id === id)), serverNow: Date.now() }));
      return;
    }
    if (path === "/organization") {
      await respond(hermesV2OrganizationBatchSchema.parse(query.getAll("sessionId").map((id) => this.item(id))));
      return;
    }
    if (path === "/organization/members") {
      const group = query.get("group");
      const limit = Math.min(100, Number(query.get("limit") ?? 100));
      const offset = Number(query.get("cursor")?.split(":").at(-1) ?? 0);
      const items = [...this.metadata.values()].filter((item) => group === "pinned" ? item.pinRank !== null
        : group === "snoozed" ? item.snoozedUntil !== null : item.settledAt !== null);
      const more = offset + limit < items.length;
      await respond(hermesV2MembersPageSchema.parse({
        group, items: items.slice(offset, offset + limit).map((item) => this.item(item.sessionId)),
        hasMore: more, nextCursor: more ? `v1:${offset + limit}` : null,
        pinRevision: this.pinRevision, membershipRevision: this.membershipRevision, serverNow: Date.now(),
      }));
      return;
    }
    if (path === "/organization/notices") {
      await respond(hermesV2NoticesPageSchema.parse({ sessionId: query.get("sessionId"), items: [],
        nextCursor: null, hasMore: false, serverNow: Date.now() }));
      return;
    }
    if (path === "/organization/read") {
      const input = hermesV2ReadAckSchema.parse(body);
      const sources = input.evidence.map((handle) => this.evidence.get(handle));
      if (sources.some((source) => source?.sessionId !== input.sessionId)) {
        await respond({ code: "READ_EVIDENCE_INVALID", message: "Lesebeleg ungültig." }, 400);
        return;
      }
      const item = this.item(input.sessionId);
      const ids = sources.flatMap((source) => source ? [source.factId] : []);
      if (item.attention.latest && ids.includes(item.attention.latest.id)) {
        item.attention.unreadCount = 0;
        item.attention.requiresAttention = false;
        item.attention.latest.unread = false;
      }
      item.revision++;
      this.metadata.set(input.sessionId, item);
      await respond(hermesV2ReadResultSchema.parse({ revision: item.revision,
        acknowledgedSources: sources.length, pendingSources: item.attention.unreadCount,
        readFactIds: ids, serverNow: Date.now() }));
      this.gateway.metadataChanged(input.sessionId, item.revision);
      return;
    }
    if (path === "/organization/action") {
      const input = hermesV2OrganizeSchema.parse(body);
      const before = this.item(input.sessionId);
      if (this.rejectNextAction || input.expectedRevision !== before.revision) {
        this.rejectNextAction = false;
        await this.conflict(route, [before]);
        return;
      }
      const item = structuredClone(before);
      const now = Date.now();
      if (input.action === "pin") {
        item.pinRank = Math.max(-1, ...[...this.metadata.values()].map((entry) => entry.pinRank ?? -1)) + 1;
        this.pinRevision++;
      }
      if (input.action === "unpin") { item.pinRank = null; this.pinRevision++; }
      if (input.action === "snooze") {
        if (this.activity.get(input.sessionId)?.state === "waiting_input") {
          await respond({ code: "OPEN_REQUEST", message: "Offene Anfrage zuerst beantworten." }, 409);
          return;
        }
        item.snoozedAt = now; item.snoozedUntil = input.snoozedUntil;
        item.effectiveSnoozedUntil = input.snoozedUntil;
        item.settledAt = item.effectiveSettledAt = null;
      }
      if (input.action === "settle") {
        item.settledAt = item.effectiveSettledAt = now;
        item.snoozedAt = item.snoozedUntil = item.effectiveSnoozedUntil = null;
      }
      if ((input.action === "snooze" || input.action === "settle") && item.attention.latest?.kind !== "decision-error") {
        item.attention.requiresAttention = false;
        item.attention.unreadCount = 0;
        if (item.attention.latest) item.attention.latest.relevant = false;
      }
      if (input.action === "wake" || input.action === "unsettle") {
        item.snoozedAt = item.snoozedUntil = item.effectiveSnoozedUntil = null;
        item.settledAt = item.effectiveSettledAt = null;
      }
      await this.changed(route, [before], [item]);
      return;
    }
    if (path === "/organization/reorder") {
      const input = hermesV2ReorderSchema.parse(body);
      const before = input.entries.map((entry) => this.item(entry.sessionId));
      const pins = [...this.metadata.values()].filter((item) => item.pinRank !== null);
      if (input.expectedPinRevision !== this.pinRevision || pins.length !== input.entries.length
        || before.some((item, index) => item.revision !== input.entries[index]!.expectedRevision)) {
        await this.conflict(route, before);
        return;
      }
      this.pinRevision++;
      await this.changed(route, before, before.map((item, index) => ({ ...item, pinRank: index })));
      return;
    }
    if (path === "/organization/undo") {
      const { handle } = hermesV2UndoSchema.parse(body);
      const saved = this.undo.get(handle);
      if (!saved || saved.expiresAt < Date.now()
        || saved.items.some((item) => this.item(item.sessionId).revision !== saved.revisions.get(item.sessionId))) {
        await this.conflict(route, []);
        return;
      }
      this.undo.delete(handle);
      const before = saved.items.map((item) => this.item(item.sessionId));
      this.pinRevision++;
      await this.changed(route, before, saved.items, false);
      return;
    }
    await respond({ message: "Nicht im eigenen Browserfixture enthalten." }, 404);
  }

  private async changed(route: Route, before: HermesV2Organization[], after: HermesV2Organization[], undoable = true): Promise<void> {
    const items = after.map((item, index) => ({ ...item, revision: before[index]!.revision + 1, pinRevision: this.pinRevision, serverNow: Date.now() }));
    for (const item of items) this.metadata.set(item.sessionId, item);
    this.membershipRevision++;
    const handle = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 10_000;
    if (undoable) this.undo.set(handle, { items: before, revisions: new Map(items.map((item) => [item.sessionId, item.revision])), expiresAt });
    await route.fulfill({ json: hermesV2OrganizationMutationSchema.parse({ items,
      undo: undoable ? { handle, expiresAt } : null, serverNow: Date.now() }) });
    for (const item of items) this.gateway.metadataChanged(item.sessionId, item.revision);
  }

  private conflict(route: Route, items: HermesV2Organization[]): Promise<void> {
    return route.fulfill({ status: 409, json: { code: "ORGANIZATION_CONFLICT", items,
      pinRevision: this.pinRevision, serverNow: Date.now() } });
  }
}

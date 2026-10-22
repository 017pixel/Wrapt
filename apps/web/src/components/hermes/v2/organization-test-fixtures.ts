import { hermesV2OrganizationSchema, type HermesV2Activity, type HermesV2Organization, type HermesV2Session } from "@wrapt/contracts/hermes-v2";
import { snapshot } from "./chat-test-fixtures";

export const evidenceA = "a".repeat(64), evidenceB = "b".repeat(64), undoHandle = "c".repeat(64);
export const now = 1_800_000_000_000;
export function metadata(id = "a", patch: Partial<HermesV2Organization> = {}): HermesV2Organization {
  return hermesV2OrganizationSchema.parse({ sessionId: id, revision: 0, pinRevision: 0, pinRank: null,
    snoozedAt: null, snoozedUntil: null, settledAt: null, effectiveSnoozedUntil: null, effectiveSettledAt: null,
    organizationCursor: 0, organizationCoverageRevision: 0, attention: { unreadCount: 0, requiresAttention: false, latest: null },
    coverage: { state: "baseline", revision: 0, reason: null }, serverNow: now, ...patch });
}
export const activity = (patch: Partial<HermesV2Activity> = {}): HermesV2Activity => ({ state: "unknown", turnStartedAt: null,
  openRequestCount: null, subagentCount: null, backgroundCount: null, observedAt: now, coverage: "partial", ...patch });
export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export class TestOrganization {
  sessions: HermesV2Session[] = [snapshot().session];
  items = new Map<string, HermesV2Organization>();
  calls: { path: string; query: URLSearchParams; body: Record<string, unknown> | null; signal: AbortSignal | null }[] = [];
  handle: ((call: TestOrganization["calls"][number]) => Response | Promise<Response> | null) | null = null;
  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "https://workbench.test");
    const call = { path: url.pathname.replace("/api/v1/hermes/v2/", ""), query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null, signal: init?.signal ?? null };
    this.calls.push(call);
    const custom = this.handle?.(call); if (custom) return custom;
    const id = call.query.get("sessionId") ?? String(call.body?.sessionId ?? "a");
    if (call.path === "sessions") {
      const offset = Number(call.query.get("offset")), limit = Number(call.query.get("limit"));
      const page = this.sessions.slice(offset, offset + limit), q = call.query.get("q")?.toLowerCase();
      return jsonResponse({ sessions: q ? page.filter((session) => `${session.title} ${session.id} ${session.cwd}`.toLowerCase().includes(q)) : page,
        activity: {}, offset, limit, hasMore: offset + limit < this.sessions.length,
        nextOffset: offset + limit < this.sessions.length ? offset + limit : null, coverage: offset + limit < this.sessions.length ? "partial" : "complete", serverNow: now });
    }
    if (call.path === "sessions/lookup") {
      const ids = call.body!.sessionIds as string[];
      return jsonResponse({ sessions: this.sessions.filter((session) => ids.includes(session.id)), activity: {},
        missingSessionIds: ids.filter((target) => !this.sessions.some((session) => session.id === target)), serverNow: now });
    }
    if (call.path === "organization") return jsonResponse(call.query.getAll("sessionId").map((target) => this.items.get(target) ?? metadata(target)));
    if (call.path === "organization/members") {
      const group = call.query.get("group");
      const items = [...this.items.values()].filter((item) => group === "pinned" ? item.pinRank !== null : group === "snoozed" ? item.snoozedUntil !== null : item.settledAt !== null);
      return jsonResponse({ group, items, nextCursor: null, hasMore: false, pinRevision: 0, membershipRevision: 0, serverNow: now });
    }
    if (call.path === "organization/notices") return jsonResponse({ sessionId: id, items: [], nextCursor: null, hasMore: false, serverNow: now });
    if (call.path === "organization/read") return jsonResponse({ revision: 1, acknowledgedSources: (call.body!.evidence as string[]).length, pendingSources: 0, readFactIds: [], serverNow: now });
    if (call.path === "organization/action") {
      const old = this.items.get(id) ?? metadata(id), action = call.body!.action;
      const value = metadata(id, { ...old, revision: old.revision + 1,
        pinRank: action === "pin" ? 0 : action === "unpin" ? null : old.pinRank,
        snoozedUntil: action === "snooze" ? Number(call.body!.snoozedUntil) : action === "wake" ? null : old.snoozedUntil,
        effectiveSnoozedUntil: action === "snooze" ? Number(call.body!.snoozedUntil) : action === "wake" ? null : old.effectiveSnoozedUntil });
      this.items.set(id, value); return jsonResponse({ items: [value], undo: { handle: undoHandle, expiresAt: now + 10_000 }, serverNow: now });
    }
    return jsonResponse({ items: [], undo: null, serverNow: now });
  };
}

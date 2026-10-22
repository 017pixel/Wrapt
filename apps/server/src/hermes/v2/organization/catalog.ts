import { z } from "zod";
import { realpath } from "node:fs/promises";
import { relative, isAbsolute, sep } from "node:path";
import type { HermesV2Activity, HermesV2CatalogQuery, HermesV2Session, HermesV2SummaryLookupResult, HermesV2SummaryPage } from "@wrapt/contracts/hermes-v2";
import { hermesV2IdSchema } from "@wrapt/contracts/hermes-v2";
import { normalizeSession } from "../normalize-sessions.js";
import type { DashboardReader } from "../types.js";
import type { OrganizationScope } from "./scope.js";
import { organizationPolicy } from "./policy.js";
import { OrganizationError } from "./errors.js";

export const unknownActivity = (now: number): HermesV2Activity => ({ state: "unknown", turnStartedAt: null,
  openRequestCount: null, subagentCount: null, backgroundCount: null, observedAt: now, coverage: "partial" });
export async function mapBounded<T, R>(items: readonly T[], work: (value: T) => Promise<R>, concurrency = 2): Promise<R[]> {
  let next = 0;
  const output: R[] = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; output[index] = await work(items[index]!); }
  }));
  return output;
}
const nativeRow = z.object({ id: hermesV2IdSchema, profile: z.string() }).passthrough();
export type ActivityReader = (owner: string, scope: OrganizationScope, sessions: readonly HermesV2Session[]) => Promise<Record<string, HermesV2Activity>>;
export class SummaryCatalog {
  constructor(private dashboard: DashboardReader, private activity: ActivityReader,
    private projectCwd: (id: string) => Promise<string>, private now = Date.now,
    private onRows: (scope: OrganizationScope, rows: readonly unknown[]) => void = () => {},
    private project: (session: HermesV2Session) => HermesV2Session = (session) => session) {}
  private async read(path: string): Promise<unknown> {
    const raw = await this.dashboard.get(path);
    if (Buffer.byteLength(JSON.stringify(raw)) > organizationPolicy.httpBytes) throw new OrganizationError(502, "SUMMARY_TOO_LARGE", "Der Hermes-Katalog ist zu groß.");
    return raw;
  }
  async page(owner: string, scope: OrganizationScope, query: HermesV2CatalogQuery): Promise<HermesV2SummaryPage> {
    if (query.offset >= organizationPolicy.catalogDepth) return { sessions: [], activity: {}, offset: query.offset, limit: query.limit,
      nextOffset: null, hasMore: false, coverage: "partial", serverNow: this.now() };
    const limit = Math.min(query.limit, organizationPolicy.catalogDepth - query.offset);
    const params = new URLSearchParams({ profile: scope.profile, full: "false", limit: String(limit), offset: String(query.offset), order: "recent", archived: "include" });
    const raw = z.object({ sessions: z.array(nativeRow).max(organizationPolicy.catalogDepth + organizationPolicy.maxPins), total: z.number().int().nonnegative(),
      errors: z.array(z.unknown()).optional(), storage: z.record(z.string(), z.unknown()).optional() }).parse(await this.read(`/api/profiles/sessions?${params}`));
    if (raw.errors?.length || Object.keys(raw.storage ?? {}).length || raw.sessions.some((row) => row.profile !== scope.profile)) throw new OrganizationError(503, "SUMMARY_UNAVAILABLE", "Der Sessionkatalog ist nicht vollständig lesbar.");
    // Native Pin-Backfills hängen hinter der angeforderten Seite, sie verändern keinen Offset.
    const page = raw.sessions.slice(0, limit);
    this.onRows(scope, page);
    const root = query.projectId ? await realpath(await this.projectCwd(query.projectId)) : null;
    const filtered = await mapBounded(page, async (row) => {
      if (root) {
        if (typeof row.cwd !== "string") return null;
        let cwd: string;
        try { cwd = await realpath(row.cwd); } catch { return null; }
        const child = relative(root, cwd);
        if (isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`)) return null;
      }
      const session = normalizeSession(row.id, row);
      session.projectId = query.projectId ?? null;
      const needle = query.q?.trim().toLocaleLowerCase();
      return !needle || [session.id, session.title, session.cwd ?? ""].some((value) => value.toLocaleLowerCase().includes(needle)) ? session : null;
    });
    const sessions = filtered.filter((row): row is HermesV2Session => row !== null).map(this.project);
    const next = query.offset + query.limit;
    const more = query.offset + limit < raw.total;
    return { sessions, activity: await this.activity(owner, scope, sessions), offset: query.offset, limit: query.limit,
      nextOffset: more && next < organizationPolicy.catalogDepth ? next : null, hasMore: more,
      coverage: more ? "partial" : "complete", serverNow: this.now() };
  }
  async lookup(owner: string, scope: OrganizationScope, ids: readonly string[]): Promise<HermesV2SummaryLookupResult> {
    const entries = await mapBounded([...new Set(ids)], async (id) => {
      try {
        const raw = z.object({ id: hermesV2IdSchema, profile: z.string().optional() }).passthrough().parse(await this.read(`/api/sessions/${encodeURIComponent(id)}?profile=${encodeURIComponent(scope.profile)}`));
        if (raw.id !== id || (raw.profile !== undefined && raw.profile !== scope.profile)) return null;
        return normalizeSession(id, raw);
      } catch { return null; }
    });
    const sessions = entries.filter((value): value is HermesV2Session => value !== null).map(this.project);
    return { sessions, activity: await this.activity(owner, scope, sessions), missingSessionIds: ids.filter((id) => !sessions.some((row) => row.id === id)), serverNow: this.now() };
  }
}

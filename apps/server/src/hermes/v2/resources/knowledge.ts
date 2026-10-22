import { z } from "zod";
import type { HermesV2Memory, HermesV2Pending } from "@wrapt/contracts/hermes-v2";
import type { ResourceContext } from "./context.js";
import type { ResourceHost } from "./host.js";
import { object, timestamp } from "../normalize-values.js";
import { mapBounded } from "../organization/catalog.js";
import { readResourceFile, pendingNames } from "./files.js";
import { resourceJson, resourceText } from "./projection.js";
import { resourcePolicy } from "./policy.js";

const nativeTime = z.iso.datetime({ offset: true });
export function resourceTime(value: unknown): number | null {
  if (typeof value === "string") { if (!nativeTime.safeParse(value).success) return null;
    const parsed = Date.parse(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
  return timestamp(value);
}
export async function memoryRead(host: ResourceHost, binding: ResourceContext): Promise<HermesV2Memory> {
  const raw = object(await host.read(binding, host.path(binding, "/api/memory")));
  const providers = Array.isArray(raw.providers) ? raw.providers : [];
  let truncated = !Array.isArray(raw.providers);
  const projected = providers.slice(0, 100).flatMap((value) => {
    const row = object(value); if (typeof row.name !== "string" || row.name.length > 100) return [];
    const display = (entry: unknown, limit: number) => { if (typeof entry !== "string") return null;
      const result = resourceText(host.secrets, entry, limit); truncated ||= result.truncated; return result.text; };
    const setup = typeof row.setup === "string" ? display(row.setup, 4000) : row.setup ? resourceJson(host.secrets, row.setup, 4000) : null;
    if (setup && typeof setup !== "string") truncated ||= setup.truncated;
    return [{ name: row.name, description: display(row.description, 2000) ?? "", available: typeof row.available === "boolean" ? row.available : null,
      configured: typeof row.configured === "boolean" ? row.configured : null, status: display(row.status, 500), setup: typeof setup === "string" ? setup : setup?.text ?? null }];
  });
  const files = await mapBounded(["MEMORY.md", "USER.md"] as const, async (name) => {
    const file = await readResourceFile(binding, ["memories"], name); const masked = resourceText(host.secrets, file.raw, resourcePolicy.fileBytes, true);
    return { name, text: file.raw === null ? null : masked.text, status: file.status, bytes: file.bytes, truncated: file.truncated || masked.truncated };
  }, resourcePolicy.workers);
  const active = resourceText(host.secrets, raw.active, 100);
  return { scope: binding.token, active: typeof raw.active === "string" ? active.text : null,
    providers: projected, files, builtinOnly: true, truncated: truncated || active.truncated || providers.length > 100 || projected.length !== Math.min(providers.length, 100) || files.some((file) => file.truncated) };
}
const pendingRecord = z.object({ id: z.string().regex(/^[a-f0-9]{8}$/), subsystem: z.enum(["memory", "skills"]),
  action: z.string(), summary: z.string(), origin: z.enum(["foreground", "background_review"]), created_at: z.union([z.number().nonnegative(), z.string()]), payload: z.record(z.string(), z.unknown()) });
const actions = { memory: new Set(["add", "replace", "remove", "batch"]), skills: new Set(["create", "edit", "patch", "write_file", "remove_file", "delete", "batch", "absorb"]) };
export async function pendingRead(host: ResourceHost, binding: ResourceContext): Promise<HermesV2Pending> {
  const entries: Array<{ subsystem: "memory" | "skills"; name: string }> = []; let partial = false;
  for (const subsystem of ["memory", "skills"] as const) {
    const found = await pendingNames(binding, subsystem); partial ||= found.partial;
    for (const name of found.names) { if (entries.length >= resourcePolicy.pendingRecords) { partial = true; break; } entries.push({ subsystem, name }); }
  }
  const records = await mapBounded(entries, async ({ subsystem, name }) => {
    const id = name.slice(0, -5); const file = await readResourceFile(binding, ["pending", subsystem], name);
    const unknown = { id, subsystem, status: "unknown" as const, action: null, summary: null, origin: null, createdAt: null,
      payload: { text: null, status: "unknown" as const, bytes: file.bytes, truncated: file.truncated }, matchedEntryComplete: false, truncated: file.truncated };
    if (file.raw === null || file.truncated) return unknown;
    let parsed;
    try { parsed = pendingRecord.safeParse(JSON.parse(file.raw)); } catch { return unknown; }
    if (!parsed.success || parsed.data.id !== id || parsed.data.subsystem !== subsystem || !actions[subsystem].has(parsed.data.action)
      || parsed.data.payload.action !== parsed.data.action || resourceTime(parsed.data.created_at) === null) return unknown;
    const row = parsed.data; const payload = resourceJson(host.secrets, row.payload, resourcePolicy.pendingText);
    const summary = resourceText(host.secrets, row.summary, 4000);
    const operations = row.action === "batch" ? row.payload.operations : [row.payload];
    const pinned = Array.isArray(operations) && operations.length > 0 && operations.every((entry) => {
      const op = object(entry); return !["replace", "remove"].includes(String(op.action)) || typeof op.matched_entry === "string" && !!op.matched_entry;
    });
    return { id, subsystem, status: "pending" as const, action: row.action, summary: summary.text, origin: row.origin,
      createdAt: resourceTime(row.created_at), payload: { text: payload.text, status: "available" as const, bytes: file.bytes, truncated: payload.truncated },
      matchedEntryComplete: pinned && !payload.truncated, truncated: payload.truncated || summary.truncated };
  }, resourcePolicy.workers);
  return { scope: binding.token, records, coverage: partial || records.some((row) => row.status === "unknown") ? "partial" : "bounded",
    truncated: partial || records.some((row) => row.truncated), review: { supported: false, adminPath: "/hermes" } };
}

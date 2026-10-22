import { hermesV2ModelCatalogSchema, type HermesV2Command, type HermesV2ModelCatalog, type HermesV2Subagent } from "@wrapt/contracts/hermes-v2";
import { z } from "zod";
import { parse } from "./upstream-schemas.js";
import { nullableText, number, object, text, timestamp } from "./normalize-values.js";
import { selection } from "./normalize-sessions.js";
import { commandMetadata } from "./normalize-command-metadata.js";
import type { SecretRedactor } from "./secret-redactor.js";

const native = new Map<string, HermesV2Command["action"]>([
  ["/new", "new"], ["/resume", "resume"], ["/stop", "stop"], ["/model", "model"],
  ["/help", "help"], ["/queue", "queue"], ["/steer", "steer"], ["/title", "title"],
]);

export function normalizeCommands(value: unknown): HermesV2Command[] {
  const pair = z.array(z.string().max(2_000)).max(2);
  const raw = parse(z.object({ pairs: z.array(pair).max(2_000), skills: z.record(z.string(), z.unknown()).optional(), categories: z.array(z.object({ name: z.string().max(200), pairs: z.array(pair).max(2_000) })).max(100).optional() }), value);
  const shadowed = new Set(raw.categories?.filter((category) => ["User commands", "Plugin commands"].includes(category.name)).flatMap((category) => category.pairs.flatMap((pair) => pair[0] ? [pair[0].toLowerCase()] : [])) ?? []);
  const entries = new Map<string, HermesV2Command>();
  for (const pair of raw.pairs) {
    const key = pair[0];
    if (!key || !/^\/\S+$/u.test(key) || [...key].some((character) => character.charCodeAt(0) < 32) || key.length > 200) continue;
    const blocked = shadowed.has(key.toLowerCase());
    const canonical = object(object(value).canon)[key];
    if (!blocked && typeof canonical === "string" && canonical !== key) continue;
    const skill = Object.hasOwn(raw.skills ?? {}, key) && !blocked;
    const action = blocked ? null : skill ? "skill" : native.get(key.toLowerCase()) ?? null;
    const metadata = commandMetadata(value, key, shadowed);
    entries.set(key, {
      key, label: key, description: text(pair[1], 2_000), kind: skill ? "skill" : action ? "builtin" : "unsupported",
      action, ...metadata, argumentHint: metadata.subcommands?.length ? metadata.subcommands.join(" | ").slice(0, 200) : metadata.argumentMode === "text" ? "Text" : null,
      disabledReason: action ? null : "Dieser Befehl ist in der klassischen Hermes-Oberfläche verfügbar.",
    });
  }
  return [...entries.values()];
}

/** Provider und einzelne Modelle werden unabhängig geprüft; Metadaten sind Composer-opt-in. */
export function normalizeModels(value: unknown, metadata = false): HermesV2ModelCatalog {
  const raw = parse(z.object({ providers: z.array(z.unknown()).max(100) }).passthrough(), value);
  const identity = z.string().min(1).max(200);
  const providers = raw.providers.flatMap((entry) => {
    const provider = object(entry);
    const slug = z.string().min(1).max(100).safeParse(provider.slug);
    if (!slug.success) return [];
    const capabilities = object(provider.capabilities);
    const pricing = object(provider.pricing);
    const unavailable = new Set(Array.isArray(provider.unavailable_models) ? provider.unavailable_models : []);
    // Hermes liefert Listen von IDs. Ältere/eigene Provider können Modellobjekte oder Mappings melden.
    const reported = Array.isArray(provider.models) ? provider.models : Object.keys(object(provider.models));
    const ids = [...new Set(reported.flatMap((entry) => {
      const id = identity.safeParse(typeof entry === "string" ? entry : object(entry).id);
      return id.success && !unavailable.has(id.data) ? [id.data] : [];
    }))].slice(0, 2_000);
    const name = text(provider.name, 200) || slug.data;
    const note = ids.length ? null : reported.length ? "Keine gültigen oder verfügbaren Modelle gemeldet." : "Keine Modelle gemeldet.";
    const reportedCount = z.number().int().nonnegative().safeParse(provider.total_models);
    return [{
      id: slug.data, label: note ? `${name.slice(0, 160)} (Keine Modelle)` : name, available: provider.authenticated !== false,
      ...(metadata ? { reportedModelCount: reportedCount.success ? reportedCount.data : reported.length, note } : {}),
      models: ids.map((id) => ({
        id, label: id, reasoningEfforts: [], fast: object(capabilities[id]).fast === true,
        priceInput: nullableText(object(pricing[id]).input, 100), priceOutput: nullableText(object(pricing[id]).output, 100),
        reportedReasoning: typeof object(capabilities[id]).reasoning === "boolean" ? object(capabilities[id]).reasoning as boolean : null,
        canDisableReasoning: typeof object(capabilities[id]).can_disable_reasoning === "boolean" ? object(capabilities[id]).can_disable_reasoning as boolean : null,
      })),
    }];
  });
  return hermesV2ModelCatalogSchema.parse({ providers, current: selection(raw) });
}

export function normalizeSubagent(value: unknown, secrets?: SecretRedactor): HermesV2Subagent | null {
  const row = object(value);
  const display = (value: unknown, limit: number) => typeof value === "string" ? text(secrets?.boundedText(value, limit) ?? value, limit) : null;
  if (typeof row.subagent_id !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(row.subagent_id)) return null;
  return {
    id: row.subagent_id, parentId: typeof row.parent_id === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(row.parent_id) ? row.parent_id : null,
    goal: display(row.goal, 10_000) ?? "", status: text(row.status, 100) || "unknown", model: display(row.model, 200),
    startedAt: timestamp(row.started_at), durationMs: typeof row.duration_seconds === "number" ? number(row.duration_seconds) * 1_000 : null,
    toolCount: Math.floor(number(row.tool_count)), lastTool: display(row.last_tool ?? row.tool_name, 200),
  };
}

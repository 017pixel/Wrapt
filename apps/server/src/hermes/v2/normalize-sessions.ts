import type { HermesV2Inflight, HermesV2Selection, HermesV2Session, HermesV2Usage } from "@wrapt/contracts/hermes-v2";
import { nullableText, number, object, text, timestamp } from "./normalize-values.js";
import type { SecretRedactor } from "./secret-redactor.js";

export function selection(value: unknown): HermesV2Selection | null {
  const row = object(value);
  return typeof row.model === "string" && row.model && typeof row.provider === "string" && row.provider
    ? { model: row.model.slice(0, 200), provider: row.provider.slice(0, 100) } : null;
}
export function normalizeSession(id: string, value: unknown, previous?: HermesV2Session): HermesV2Session {
  const row = object(value);
  return {
    id, title: text(row.title ?? previous?.title, 200) || "Hermes-Session",
    preview: text(row.preview ?? previous?.preview, 1_000), source: text(row.source ?? previous?.source, 100),
    model: nullableText(row.model, 200) ?? previous?.model ?? null,
    provider: nullableText(row.provider, 100) ?? previous?.provider ?? null,
    cwd: nullableText(row.cwd, 4_096) ?? previous?.cwd ?? null, projectId: previous?.projectId ?? null,
    messageCount: typeof row.message_count === "number" ? Math.floor(number(row.message_count)) : previous?.messageCount ?? 0,
    updatedAt: timestamp(row.last_active ?? row.updated_at) ?? previous?.updatedAt ?? timestamp(row.started_at),
    running: typeof row.running === "boolean" ? row.running : previous?.running ?? null,
    startedAt: timestamp(row.started_at) ?? previous?.startedAt ?? null, draft: previous?.draft ?? false,
  };
}
export function normalizeInflight(value: unknown, secrets?: SecretRedactor): HermesV2Inflight | null {
  if (!value || typeof value !== "object") return null;
  const row = object(value);
  if (row.display_kind === "hidden") return null;
  return {
    user: text(row.user, 200_000, secrets), assistant: text(row.assistant, 200_000, secrets), streaming: row.streaming === true,
    displayKind: nullableText(row.display_kind, 100), displayText: nullableText(object(row.display_metadata).display_text, 200_000, secrets),
    corrections: Array.isArray(row.corrections) ? row.corrections.slice(0, 100).map((entry) => text(entry, 200_000, secrets)) : [],
    error: row.error ? "Der Hermes-Turn wurde unterbrochen oder ist fehlgeschlagen." : null, recoverable: row.recoverable === true,
  };
}
export function normalizeUsage(value: unknown): HermesV2Usage | null {
  if (!value || typeof value !== "object") return null;
  const row = object(value);
  return {
    input: number(row.input), output: number(row.output), reasoning: number(row.reasoning),
    contextUsed: typeof row.context_used === "number" ? number(row.context_used) : null,
    contextMax: typeof row.context_max === "number" ? number(row.context_max) : null,
    costUsd: typeof row.cost_usd === "number" ? number(row.cost_usd) : null,
  };
}

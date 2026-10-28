import type { SecretRedactor } from "../secret-redactor.js";
import { protectedText } from "../normalize-values.js";

/** Gemeinsame vollständige dynamische Maskierung vor statischer Redaction und jeglicher Kürzung. */
export function resourceText(secrets: SecretRedactor, value: unknown, maximum = 4000, bytes = false) {
  if (typeof value !== "string") return { text: "", truncated: false };
  return protectedText(value, secrets, maximum, bytes);
}
export function resourceJson(secrets: SecretRedactor, value: unknown, maximum = 16_384) {
  return resourceText(secrets, JSON.stringify(value), maximum);
}
const routing = new Set(["scope", "id", "jobId", "sessionId", "requestedSessionId", "confirmedAbsentSessionIds", "sessionIds", "subsystem", "action", "origin",
  "operation", "outcome", "slashCommand", "effect", "adminPath", "editorPath", "provenance", "mode", "coverage"]);
const limits: Record<string, number> = { name: 200, active: 100, phase: 100, state: 100, status: 500, title: 200, prompt: 20_000, schedule: 1000, workdir: 4096,
  key: 200, value: 4000, description: 2000, summary: 4000, lastError: 4000, lastStatus: 200, nextRunAt: 200, lastRunAt: 200,
  error: 2000, setup: 4000, reason: 500, slashCommand: 200, version: 200, gatewayState: 200, epoch: 200, lastResult: 200, lastCheckedAt: 100 };
/** Finale Prüfung nach den Ressourcenawaits; Kennungen bleiben unverändert. */
export function redactResource<T>(value: T, secrets: SecretRedactor): T {
  function walk(entry: unknown, key = "", parent: Record<string, unknown> = {}, container = ""): { value: unknown; cut: boolean } {
    if (typeof entry === "string") {
      if (routing.has(key) || key === "state" && ["connecting", "online", "reconnecting", "offline", "incompatible", "unavailable"].includes(entry) && "subscriptions" in parent || key === "status" && ["pending", "unknown", "available", "empty", "missing", "unreadable"].includes(entry)
        || key === "name" && (parent.readOnly === true || ["MEMORY.md", "USER.md"].includes(entry))) return { value: entry, cut: false };
      const maximum = key === "text" ? "startedAt" in parent || ["payload", "logs", "logTail"].includes(container) ? 16_384 : 65_536
        : key === "name" && "configured" in parent ? 100 : key === "status" && "startedAt" in parent ? 100 : key === "description" && parent.readOnly === true ? 4000 : limits[key] ?? 4000;
      const result = resourceText(secrets, entry, maximum, key === "text");
      return { value: result.text, cut: result.truncated };
    }
    if (Array.isArray(entry)) {
      const rows = entry.map((row) => walk(row, key)); return { value: rows.map((row) => row.value), cut: rows.some((row) => row.cut) };
    }
    if (!entry || typeof entry !== "object") return { value: entry, cut: false };
    const source = entry as Record<string, unknown>; const output: Record<string, unknown> = {}; let cut = false;
    for (const [name, child] of Object.entries(source)) { const next = walk(child, name, source, key); output[name] = next.value; cut ||= next.cut; }
    if (cut && "truncated" in output) output.truncated = true;
    if (cut && "matchedEntryComplete" in output) output.matchedEntryComplete = false;
    return { value: output, cut };
  }
  return walk(value).value as T;
}

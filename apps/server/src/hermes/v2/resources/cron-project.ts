import type { HermesV2CronJob } from "@wrapt/contracts/hermes-v2";
import { hermesV2CronIdSchema, hermesV2CronRepeatSchema } from "@wrapt/contracts/hermes-v2";
import { object } from "../normalize-values.js";
import type { SecretRedactor } from "../secret-redactor.js";
import { resourceJson, resourceText } from "./projection.js";

const fields = new Set(["id", "name", "prompt", "schedule", "repeat", "enabled", "state", "next_run_at", "last_run_at", "last_status", "last_error", "workdir", "script", "no_agent", "profile"]);
function scheduleInput(value: unknown): string | null {
  if (typeof value === "string") return value;
  const schedule = object(value);
  if (schedule.kind === "cron" && typeof schedule.expr === "string") return schedule.expr;
  if (schedule.kind === "once" && typeof schedule.run_at === "string") return schedule.run_at;
  if (schedule.kind === "interval" && typeof schedule.minutes === "number" && Number.isInteger(schedule.minutes) && schedule.minutes > 0) return `every ${schedule.minutes}m`;
  return null;
}
export function cronJob(raw: unknown, secrets: SecretRedactor): HermesV2CronJob | null {
  const row = object(raw); const id = hermesV2CronIdSchema.safeParse(row.id); if (!id.success) return null;
  let truncated = false;
  const display = (value: unknown, limit: number) => { if (typeof value !== "string") return null;
    const result = resourceText(secrets, value, limit); truncated ||= result.truncated; return result.text; };
  const schedule = scheduleInput(row.schedule);
  const repeat = object(row.repeat); const parsedRepeat = hermesV2CronRepeatSchema.safeParse("times" in repeat ? repeat.times : row.repeat ?? null);
  const extra = Object.entries(row).filter(([key]) => !fields.has(key));
  const additional = extra.slice(0, 50).map(([key, value]) => {
    const label = resourceText(secrets, key, 200); const result = resourceJson(secrets, { [key]: value }, 4000);
    return { key: label.text, value: result.text, truncated: label.truncated || result.truncated };
  });
  truncated ||= extra.length > 50 || additional.some((field) => field.truncated);
  const noAgent = typeof row.no_agent === "boolean" ? row.no_agent : null;
  const nativeError = row.last_status === "delivery_failed" ? row.last_delivery_error || row.last_error : row.last_error || row.last_delivery_error;
  return { id: id.data, name: display(row.name, 200) ?? "", prompt: display(row.prompt, 20_000) ?? "",
    schedule: display(schedule, 1000),
    repeat: parsedRepeat.success ? parsedRepeat.data : null, completedRuns: typeof repeat.completed === "number" && Number.isInteger(repeat.completed) && repeat.completed >= 0 ? repeat.completed : null,
    paused: typeof row.enabled === "boolean" ? !row.enabled : null, state: display(row.state, 100), nextRunAt: display(row.next_run_at, 200), lastRunAt: display(row.last_run_at, 200),
    lastStatus: display(row.last_status, 200), lastError: display(nativeError, 4000), workdir: display(row.workdir, 4096),
    execution: { mode: noAgent === true ? "script" : noAgent === false ? "agent" : "unknown", script: display(row.script, 4000), noAgent },
    additional, valid: typeof row.prompt === "string" && typeof row.enabled === "boolean" && parsedRepeat.success && schedule !== null, truncated };
}

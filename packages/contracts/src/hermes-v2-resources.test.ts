import { describe, expect, it } from "vitest";
import { hermesV2CronCreateSchema, hermesV2CronUpdateSchema, hermesV2CronConfirmSchema, hermesV2ResourceErrorSchema,
  hermesV2SessionDeleteSchema, hermesV2SessionDeletedSchema, hermesV2EventSchema, hermesV2CronRunsSchema } from "./hermes-v2.js";
const scope = "a".repeat(64);
const create = { scope, name: "Test", prompt: "Aufgabe", schedule: "0 8 * * *", repeat: null, paused: false, projectId: "wrapt" };
describe("Enge additive Ressourcenverträge", () => {
  it("erweitert Laufdaten um optionale exakte Chatziele ohne alte Antworten ungültig zu machen", () => {
    const run = { id: "cron_job-1_20261026", startedAt: null, status: null, text: "", truncated: false };
    const result = { scope, jobId: "job-1", runs: [run], truncated: false };
    expect(hermesV2CronRunsSchema.safeParse(result).success).toBe(true);
    expect(hermesV2CronRunsSchema.safeParse({ ...result, runs: [{ ...run, sessionId: run.id }] }).success).toBe(true);
    expect(hermesV2CronRunsSchema.safeParse({ ...result, runs: [{ ...run, sessionId: "../escape" }] }).success).toBe(false);
  });
  it.each(["wrapt", "chappie", "mein-projekt", "00000000-0000-4000-8000-000000000000"])("erhält vorhandene Projektkennung %s", (projectId) => {
    expect(hermesV2CronCreateSchema.parse({ ...create, projectId }).projectId).toBe(projectId);
  });
  it.each(["profile", "workdir", "script", "no_agent", "base_url", "enabled_toolsets", "context_from"])("verbietet den freien Cronparameter %s", (key) => {
    expect(hermesV2CronCreateSchema.safeParse({ ...create, [key]: "untrusted" }).success).toBe(false);
    expect(hermesV2CronUpdateSchema.safeParse({ scope, updates: { [key]: "untrusted" } }).success).toBe(false);
  });
  it("fordert nichtleeres Update, echte Bestätigung und feste Löschwirkung", () => {
    expect(hermesV2CronUpdateSchema.safeParse({ scope, updates: {} }).success).toBe(false);
    expect(hermesV2CronConfirmSchema.safeParse({ scope }).success).toBe(false);
    expect(hermesV2SessionDeleteSchema.safeParse({ scope, confirm: true }).success).toBe(false);
    expect(hermesV2SessionDeleteSchema.parse({ scope, confirm: "delete-compression-chain" }).scope).toBe(scope);
  });
  it("erfindet keine vollständige Liste gelöschter IDs und keinen Retry", () => {
    const deleted = { scope, outcome: "confirmed", requestedSessionId: "exact-full-id", alreadyAbsent: false, confirmedAbsentSessionIds: ["exact-full-id"], affectedIdsComplete: false, effect: "compression-chain" };
    expect(hermesV2SessionDeletedSchema.safeParse(deleted).success).toBe(true);
    expect(hermesV2SessionDeletedSchema.safeParse({ ...deleted, affectedIdsComplete: true }).success).toBe(false);
    expect(hermesV2ResourceErrorSchema.safeParse({ code: "UNKNOWN_OUTCOME", message: "Unbekannt", outcome: "unknown", retryable: true }).success).toBe(false);
  });
  it("liefert globale Ressourceninvalidierung nur mit der festen schmalen Payload", () => {
    const event = { type: "resources.invalidated", sessionId: null, epoch: "epoch", seq: null, payload: { resource: "cron", sessionIds: [] } };
    expect(hermesV2EventSchema.safeParse(event).success).toBe(true);
    expect(hermesV2EventSchema.safeParse({ ...event, payload: { resource: "config", sessionIds: [] } }).success).toBe(false);
  });
});

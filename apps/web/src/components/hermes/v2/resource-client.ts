import { z } from "zod";
import {
  hermesV2CronListSchema, hermesV2CronDetailSchema, hermesV2CronRunsSchema,
  hermesV2CronMutationSchema, hermesV2CronCreateSchema, hermesV2CronUpdateSchema,
  hermesV2CronConfirmSchema, hermesV2CronIdSchema, hermesV2ResourceActionSchema,
  hermesV2MemorySchema, hermesV2PendingSchema, hermesV2ResourceSkillsSchema,
  hermesV2ResourceSkillDetailSchema, hermesV2DiagnosticsSchema,
  hermesV2SessionDeletionPreviewSchema, hermesV2SessionDeleteSchema,
  hermesV2SessionDeletedSchema, hermesV2ResourceErrorSchema, hermesV2IdSchema,
  type HermesV2CronFields,
  hermesV2ConfigurationSchema, hermesV2ConfigurationUpdateSchema, type HermesV2ConfigurationUpdate,
} from "@wrapt/contracts/hermes-v2";
import { WRAPT_SYNC_VERSION } from "../../../lib/apiClient/transport";
import { ResourceFailure, staleResource } from "./resource-error";
import { resourcePolicy } from "./resource-policy";
import { awaitResource, readResourceResponse } from "./resource-response";

type CronMutation = z.infer<typeof hermesV2CronMutationSchema>;
export class ResourceClient {
  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}
  private validate<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ResourceFailure("INVALID_RESOURCE_REQUEST", "Die Ressourcenaktion ist ungültig.");
    return parsed.data;
  }
  private async request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, method = "GET", body?: unknown): Promise<T> {
    const mutation = method !== "GET";
    if (signal.aborted) throw staleResource();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, resourcePolicy.requestTimeoutMs);
    let sent = false;
    try {
      if (signal.aborted) throw staleResource();
      sent = true;
      const response = await awaitResource(this.fetcher(`/api/v1/hermes/v2/${path}`, { method, cache: "no-store", credentials: "same-origin",
        headers: { Accept: "application/json", "X-Wrapt-Sync-Version": WRAPT_SYNC_VERSION,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal }), controller.signal, mutation);
      const value = await readResourceResponse(response, controller.signal, mutation);
      if (controller.signal.aborted) throw staleResource(mutation ? "unknown" : "not_sent");
      if (!response.ok) {
        const error = hermesV2ResourceErrorSchema.safeParse(value);
        if (!error.success) throw new ResourceFailure("PROTOCOL_MISMATCH", "Die Ressourcenablehnung konnte nicht bestätigt werden.", mutation ? "unknown" : "not_sent", response.status);
        throw new ResourceFailure(error.data.code, error.data.message, error.data.outcome, response.status);
      }
      const result = schema.safeParse(value);
      if (!result.success) throw new ResourceFailure("PROTOCOL_MISMATCH", "Die Ressourcenantwort ist nicht kompatibel.", mutation ? "unknown" : "not_sent");
      return result.data;
    } catch (error) {
      if (error instanceof ResourceFailure) throw error;
      throw new ResourceFailure("RESOURCE_UNAVAILABLE", "Die Verbindung zu den Hermes-Ressourcen wurde unterbrochen.", mutation && sent ? "unknown" : "not_sent");
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  }
  configuration(signal: AbortSignal) { return this.request("configuration", hermesV2ConfigurationSchema, signal); }
  async saveConfiguration(input: HermesV2ConfigurationUpdate, signal: AbortSignal) {
    const body = this.validate(hermesV2ConfigurationUpdateSchema, input);
    const result = await this.request("configuration", hermesV2ConfigurationSchema, signal, "PUT", body);
    if (result.scope !== body.scope) throw new ResourceFailure("PROTOCOL_MISMATCH", "Der Konfigurationskontext hat sich geändert.", "unknown");
    return result;
  }
  cronList(signal: AbortSignal) { return this.request("cron/jobs", hermesV2CronListSchema, signal); }
  async cronDetail(id: string, signal: AbortSignal) {
    id = this.validate(hermesV2CronIdSchema, id);
    const result = await this.request(`cron/jobs/${encodeURIComponent(id)}`, hermesV2CronDetailSchema, signal);
    if (result.job.id !== id) throw new ResourceFailure("PROTOCOL_MISMATCH", "Das Jobdetail gehört zu einem anderen Ziel.");
    return result;
  }
  async cronRuns(id: string, signal: AbortSignal) {
    id = this.validate(hermesV2CronIdSchema, id);
    const result = await this.request(`cron/jobs/${encodeURIComponent(id)}/runs?limit=20`, hermesV2CronRunsSchema, signal);
    if (result.jobId !== id) throw new ResourceFailure("PROTOCOL_MISMATCH", "Der Verlauf gehört zu einem anderen Job.");
    return result;
  }
  async cronCreate(scope: string, fields: HermesV2CronFields, signal: AbortSignal) {
    const body = this.validate(hermesV2CronCreateSchema, { ...fields, scope });
    const result = await this.request("cron/jobs", hermesV2CronMutationSchema, signal, "POST", body);
    this.checkCron(result, scope, "create");
    return result;
  }
  async cronUpdate(scope: string, id: string, updates: Partial<HermesV2CronFields>, signal: AbortSignal) {
    id = this.validate(hermesV2CronIdSchema, id);
    const body = this.validate(hermesV2CronUpdateSchema, { scope, updates });
    const result = await this.request(`cron/jobs/${encodeURIComponent(id)}`, hermesV2CronMutationSchema, signal, "PUT", body);
    this.checkCron(result, scope, "update", id);
    return result;
  }
  async cronAction(scope: string, id: string, operation: "pause" | "resume" | "trigger" | "delete", signal: AbortSignal) {
    id = this.validate(hermesV2CronIdSchema, id);
    const confirmed = operation === "trigger" || operation === "delete";
    const body = this.validate(confirmed ? hermesV2CronConfirmSchema : hermesV2ResourceActionSchema, confirmed ? { scope, confirm: true } : { scope });
    const path = `cron/jobs/${encodeURIComponent(id)}${operation === "delete" ? "" : `/${operation}`}`;
    const result = await this.request(path, hermesV2CronMutationSchema, signal, operation === "delete" ? "DELETE" : "POST", body);
    this.checkCron(result, scope, operation, id);
    return result;
  }
  private checkCron(result: CronMutation, scope: string, operation: CronMutation["operation"], id?: string): void {
    if (result.scope !== scope || result.operation !== operation || (id !== undefined && result.jobId !== id)
      || (result.job !== null && result.job.id !== result.jobId) || (operation === "create" && result.job === null)
      || (operation === "delete" && result.job !== null)) throw new ResourceFailure("PROTOCOL_MISMATCH", "Die Jobquittung gehört nicht zur gesendeten Aktion.", "unknown");
  }
  skills(signal: AbortSignal) { return this.request("skills", hermesV2ResourceSkillsSchema, signal); }
  async skillDetail(name: string, signal: AbortSignal) {
    name = this.validate(z.string().min(1).max(200), name);
    const result = await this.request(`skills/detail?${new URLSearchParams({ name })}`, hermesV2ResourceSkillDetailSchema, signal);
    if (result.skill.name !== name) throw new ResourceFailure("PROTOCOL_MISMATCH", "Der Skillinhalt gehört zu einem anderen Namen.");
    return result;
  }
  memory(signal: AbortSignal) { return this.request("memory", hermesV2MemorySchema, signal); }
  pending(signal: AbortSignal) { return this.request("pending", hermesV2PendingSchema, signal); }
  diagnostics(signal: AbortSignal) { return this.request("diagnostics", hermesV2DiagnosticsSchema, signal); }
  async sessionPreview(id: string, signal: AbortSignal) {
    id = this.validate(hermesV2IdSchema, id);
    const result = await this.request(`sessions/${encodeURIComponent(id)}/deletion`, hermesV2SessionDeletionPreviewSchema, signal);
    if (result.requestedSessionId !== id) throw new ResourceFailure("PROTOCOL_MISMATCH", "Die Löschvorschau gehört zu einer anderen Sitzung.");
    return result;
  }
  async sessionDelete(scope: string, id: string, signal: AbortSignal) {
    id = this.validate(hermesV2IdSchema, id);
    const body = this.validate(hermesV2SessionDeleteSchema, { scope, confirm: "delete-compression-chain" });
    const result = await this.request(`sessions/${encodeURIComponent(id)}`, hermesV2SessionDeletedSchema, signal, "DELETE", body);
    if (result.scope !== scope || result.requestedSessionId !== id || !result.confirmedAbsentSessionIds.includes(id)
      || new Set(result.confirmedAbsentSessionIds).size !== result.confirmedAbsentSessionIds.length) {
      throw new ResourceFailure("PROTOCOL_MISMATCH", "Die Löschquittung bestätigt nicht die angefragte Sitzung.", "unknown");
    }
    return result;
  }
}

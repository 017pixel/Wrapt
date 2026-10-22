import type { HermesV2CronJob, HermesV2Diagnostics, HermesV2Memory, HermesV2Pending,
  HermesV2ResourceSkills } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway } from "./chat-test-fixtures";
import { ResourceClient } from "./resource-client";
import { ResourceRuntime } from "./resource-runtime";
import type { HermesV2ResourcesOptions, ResourceArea } from "./resource-types";

export const resourceScope = "a".repeat(64);
export const resourceText = (text: string | null = "Begrenzter Text") => ({ text, status: text === null ? "missing" as const : text === "" ? "empty" as const : "available" as const, bytes: text?.length ?? null, truncated: false });
export const cronJob = (id = "job-a", patch: Partial<HermesV2CronJob> = {}): HermesV2CronJob => ({ id, name: id, prompt: "Testauftrag", schedule: "every 1h",
  repeat: null, completedRuns: 0, paused: false, state: "scheduled", nextRunAt: null, lastRunAt: null, lastStatus: null, lastError: null,
  workdir: null, execution: { mode: "agent", script: null, noAgent: false }, additional: [], valid: true, truncated: false, ...patch });
export const cronFields = { name: "Job", prompt: "Auftrag", schedule: "every 1h", repeat: null, paused: false, projectId: "wrapt" };
export const pendingData = (): HermesV2Pending => ({ scope: resourceScope, records: [], coverage: "bounded", truncated: false, review: { supported: false, adminPath: "/hermes" } });
export const memoryData = (): HermesV2Memory => ({ scope: resourceScope, active: "builtin", providers: [], builtinOnly: true,
  files: [{ name: "MEMORY.md", ...resourceText() }, { name: "USER.md", ...resourceText("") }], truncated: false });
export const skillsData = (): HermesV2ResourceSkills => ({ scope: resourceScope, skills: [{ name: "read-only", description: "Skill", enabled: true,
  usage: null, provenance: "agent", slashCommand: null, readOnly: true }], truncated: false, editorPath: "/ki-skills" });
export const diagnosticsData = (): HermesV2Diagnostics => ({ scope: resourceScope,
  connection: { state: "online", epoch: "native", subscriptions: 0, protectedRuntime: true },
  dashboard: { reachable: true, version: "test", gatewayState: null, error: null },
  update: { phase: null, pending: null, lastResult: null, lastCheckedAt: null, logTail: resourceText(null) },
  logs: resourceText("Redigierte Diagnose"), truncated: false, adminPath: "/hermes" });
export const jsonResource = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
export const resourceRejection = (code = "NATIVE_CONFLICT", outcome = "rejected", status = 409) => jsonResource({ code, outcome, retryable: false, message: "Native Ablehnung" }, status);
export async function settleResources(): Promise<void> { for (let index = 0; index < 200; index++) await Promise.resolve(); }
export function heldResource<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export interface ResourceRequest { path: string; method: string; body: Record<string, unknown> | null; signal: AbortSignal; init: RequestInit }
export async function resourceFixture(area: ResourceArea | null = "cron", overrides: Partial<HermesV2ResourcesOptions> = {}) {
  useAppPreferences.setState({ hermesV2Enabled: true });
  const gateway = new TestGateway(); gateway.composer = true;
  const chat = new ChatRuntime(gateway.createClient());
  const selection: (string | null)[] = [];
  const ownerOptions = { ownerId: "resource-owner", sessionId: null as string | null, active: false, visible: true,
    onSelectSession: (id: string | null) => { selection.push(id); } };
  const release = chat.acquire(ownerOptions);
  await settleResources();
  const requests: ResourceRequest[] = [];
  const jobs = new Map([cronJob(), cronJob("job-b")].map((job) => [job.id, job]));
  let handler: ((request: ResourceRequest) => Response | Promise<Response> | undefined) | null = null;
  let scope = resourceScope;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const request: ResourceRequest = { path: String(input).replace("/api/v1/hermes/v2/", ""), method: init.method ?? "GET",
      body: init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null, signal: init.signal as AbortSignal, init };
    requests.push(request);
    const handled = handler?.(request);
    if (handled) return handled;
    const id = decodeURIComponent(request.path.split("/")[request.path.startsWith("sessions/") ? 1 : 2] ?? "");
    if (request.method !== "GET") {
      if (request.path.startsWith("sessions/")) return jsonResource({ scope, outcome: "confirmed", requestedSessionId: id,
        alreadyAbsent: false, confirmedAbsentSessionIds: [id], affectedIdsComplete: false, effect: "compression-chain" });
      const operation = request.path === "cron/jobs" ? "create" : request.method === "PUT" ? "update" : request.method === "DELETE" ? "delete" : request.path.split("/")[3];
      const jobId = operation === "create" ? "created-job" : id;
      const job = operation === "delete" ? null : jobs.get(jobId) ?? cronJob(jobId);
      return jsonResource({ scope, outcome: "confirmed", operation, jobId, job });
    }
    if (request.path === "cron/jobs") return jsonResource({ scope, jobs: [...jobs.values()], truncated: false });
    if (request.path.startsWith("cron/jobs/") && request.path.includes("/runs")) return jsonResource({ scope, jobId: id, runs: [], truncated: false });
    if (request.path.startsWith("cron/jobs/")) return jobs.has(id) ? jsonResource({ scope, job: jobs.get(id) }) : resourceRejection("TARGET_UNAVAILABLE", "not_sent", 404);
    if (request.path === "skills") return jsonResource({ ...skillsData(), scope });
    if (request.path.startsWith("skills/detail?")) return jsonResource({ scope, skill: skillsData().skills[0], content: resourceText(), editorPath: "/ki-skills" });
    if (request.path === "memory") return jsonResource({ ...memoryData(), scope });
    if (request.path === "pending") return jsonResource({ ...pendingData(), scope });
    if (request.path === "diagnostics") return jsonResource({ ...diagnosticsData(), scope });
    return jsonResource({ scope, requestedSessionId: id, title: id, deletable: true, reason: null, effect: "compression-chain" });
  };
  const copies: string[] = [], forgotten: string[][] = [];
  const runtime = new ResourceRuntime(chat, new ResourceClient(fetcher), async (text) => { copies.push(text); }, (ids) => { forgotten.push([...ids]); });
  const controller = new AbortController();
  let options: HermesV2ResourcesOptions = { ownerId: ownerOptions.ownerId, enabled: true, active: true, visible: true, area, signal: controller.signal, ...overrides };
  runtime.mount(options);
  await settleResources();
  return { chat, gateway, runtime, controller, requests, jobs, copies, forgotten, selection, ownerOptions, release,
    view: runtime.getSnapshot, actions: runtime.methods,
    setHandler(value: typeof handler) { handler = value; }, setScope(value: string) { scope = value; },
    update(patch: Partial<HermesV2ResourcesOptions>) { options = { ...options, ...patch }; runtime.update(options); },
    async select(id = "job-a") { runtime.methods.selectCron(id); await settleResources(); },
    cleanup() { runtime.dispose(); chat.dispose("v2-navigation"); useAppPreferences.setState({ hermesV2Enabled: false }); } };
}
export type ResourceFixture = Awaited<ReturnType<typeof resourceFixture>>;

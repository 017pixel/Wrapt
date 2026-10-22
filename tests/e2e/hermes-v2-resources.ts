import type { BrowserContext, Route, WebSocketRoute } from "@playwright/test";
import {
  hermesV2ConfigurationSchema, hermesV2ConfigurationUpdateSchema,
  hermesV2CronCreateSchema, hermesV2CronUpdateSchema, hermesV2CronConfirmSchema, hermesV2CronJobSchema,
  hermesV2ResourceActionSchema, hermesV2ResourceErrorSchema, hermesV2CronMutationSchema,
  hermesV2CronListSchema, hermesV2CronDetailSchema, hermesV2CronRunsSchema,
  hermesV2MemorySchema, hermesV2PendingSchema, hermesV2ResourceSkillsSchema,
  hermesV2ResourceSkillDetailSchema, hermesV2DiagnosticsSchema, hermesV2SessionDeleteSchema,
  hermesV2SessionDeletionPreviewSchema, hermesV2SessionDeletedSchema, hermesV2ServerMessageSchema,
  type HermesV2CronJob, type HermesV2Snapshot, type HermesV2ResourceError,
} from "../../packages/contracts/src/hermes-v2";
import { browserCron, browserMemory, browserPending, browserSkills, browserDiagnostics,
  resourceScope, resourceText } from "./hermes-v2-resource-data";

interface Gateway {
  readonly stories: Map<string, { snapshot: HermesV2Snapshot }>;
  readonly viewers: Set<{ socket: WebSocketRoute; resources: boolean }>;
}
interface Captured { method: string; path: string; body: unknown }
interface Pending { route: Route; finish: () => Promise<void> }
interface Schema { parse(data: unknown): unknown }

/** Native Daten ausschließlich synthetisch; jede Antwort durch öffentliche Contracts. */
export class HermesV2BrowserResources {
  readonly calls: Captured[] = [];
  readonly jobs = new Map<string, HermesV2CronJob>([["own-cron", browserCron()],
    ["other-cron", browserCron("other-cron", { name: "Zweiter Prüfjob", paused: false, state: "scheduled" })]]);
  configuration = { profile: "default", model: "browser-model", approvalMode: "manual", values: { timezone: "Europe/Berlin", maxTurns: 90, compressionEnabled: true } };
  memory = browserMemory();
  pending = browserPending();
  skills = browserSkills();
  diagnostics = browserDiagnostics();
  skillContent = "# Eigener Skill\n\nNur synthetischer Inhalt.";
  scope = resourceScope;
  holdReads = false;
  holdActions = false;
  readonly holdReadPaths = new Set<string>();
  failNextRead: HermesV2ResourceError | null = null;
  failReadPath: string | null = null;
  failNextAction: "not_sent" | "rejected" | "unknown" | null = null;
  loseNextActionReply = false;
  oneShotDisappears = false;
  rejectSchedule = false;
  deletionAllowed = true;
  private reads: Pending[] = [];
  private actions: Pending[] = [];
  private created = 0;

  constructor(private readonly gateway: Gateway) {}

  async install(context: BrowserContext): Promise<void> {
    await context.route("**/api/v1/hermes/v2/**", async (route) => {
      const request = route.request(), url = new URL(request.url());
      const path = url.pathname.replace("/api/v1/hermes/v2", "");
      const deletion = /^\/sessions\/[^/]+(?:\/deletion)?$/.test(path)
        && (request.method() === "DELETE" || path.endsWith("/deletion"));
      if (!path.startsWith("/cron/") && !["/configuration", "/memory", "/pending", "/skills", "/skills/detail", "/diagnostics"].includes(path) && !deletion) {
        await route.fallback(); return;
      }
      const body: unknown = ["POST", "PUT", "DELETE"].includes(request.method()) ? request.postDataJSON() : null;
      this.calls.push({ method: request.method(), path, body });
      if (request.method() === "GET") await this.read(route, path, url.searchParams);
      else await this.mutate(route, path, body);
    });
  }

  invalidate(resource: "cron" | "sessions" = "cron", sessionIds: string[] = []): void {
    const frame = hermesV2ServerMessageSchema.parse({ v: 1, type: "event", event: {
      sessionId: null, epoch: "browser-epoch", seq: null,
      type: "resources.invalidated", payload: { resource, sessionIds },
    } });
    for (const viewer of this.gateway.viewers) if (viewer.resources) viewer.socket.send(JSON.stringify(frame));
  }

  async finishReads(): Promise<void> { for (const pending of this.reads.splice(0)) await pending.finish().catch(() => {}); }
  async finishActions(): Promise<void> { for (const pending of this.actions.splice(0)) await pending.finish().catch(() => {}); }
  dispose(): void {
    for (const pending of [...this.reads, ...this.actions]) void pending.route.abort().catch(() => {});
    this.reads = []; this.actions = [];
  }

  private async reply(route: Route, schema: Schema, value: unknown, action = false): Promise<void> {
    const data = schema.parse(structuredClone(value));
    const finish = () => route.fulfill({ json: data, headers: { "Cache-Control": "no-store" } });
    const hold = action ? this.holdActions : this.holdReads || this.holdReadPaths.has(new URL(route.request().url()).pathname.replace("/api/v1/hermes/v2", ""));
    if (hold) (action ? this.actions : this.reads).push({ route, finish });
    else await finish();
  }

  private async fail(route: Route, code: HermesV2ResourceError["code"], outcome: HermesV2ResourceError["outcome"], status = 503): Promise<void> {
    await route.fulfill({ status, json: hermesV2ResourceErrorSchema.parse({ code, outcome,
      message: code === "NATIVE_CONFLICT" ? "Der eigene Prüfjob läuft bereits." : "Synthetischer Ressourcenausgang.", retryable: false }) });
  }

  private async read(route: Route, path: string, query: URLSearchParams): Promise<void> {
    if (this.failNextRead && (!this.failReadPath || this.failReadPath === path)) {
      const error = this.failNextRead; this.failNextRead = null;
      await route.fulfill({ status: 503, json: hermesV2ResourceErrorSchema.parse(error) }); return;
    }
    if (path === "/configuration") { await this.reply(route, hermesV2ConfigurationSchema, { ...this.configuration, scope: this.scope }); return; }
    if (path === "/cron/jobs") {
      await this.reply(route, hermesV2CronListSchema, { scope: this.scope, jobs: [...this.jobs.values()], truncated: false }); return;
    }
    const cron = path.match(/^\/cron\/jobs\/([^/]+)(\/runs)?$/);
    if (cron) {
      const job = this.jobs.get(decodeURIComponent(cron[1]!));
      if (!job) { await this.fail(route, "TARGET_UNAVAILABLE", "not_sent", 404); return; }
      if (cron[2]) await this.reply(route, hermesV2CronRunsSchema, { scope: this.scope, jobId: job.id,
        runs: [{ id: "own-run", startedAt: 1_800_000_000_000, status: "completed", text: "Eigener abgeschlossener Browserlauf", truncated: false }], truncated: false });
      else await this.reply(route, hermesV2CronDetailSchema, { scope: this.scope, job });
      return;
    }
    if (path === "/memory") { await this.reply(route, hermesV2MemorySchema, { ...this.memory, scope: this.scope }); return; }
    if (path === "/pending") { await this.reply(route, hermesV2PendingSchema, { ...this.pending, scope: this.scope }); return; }
    if (path === "/skills") { await this.reply(route, hermesV2ResourceSkillsSchema, { ...this.skills, scope: this.scope }); return; }
    if (path === "/skills/detail") {
      const skill = this.skills.skills.find((item) => item.name === query.get("name"));
      if (!skill) { await this.fail(route, "TARGET_UNAVAILABLE", "not_sent", 404); return; }
      await this.reply(route, hermesV2ResourceSkillDetailSchema, { scope: this.scope, skill,
        content: resourceText(this.skillContent), editorPath: "/ki-skills" }); return;
    }
    if (path === "/diagnostics") { await this.reply(route, hermesV2DiagnosticsSchema, { ...this.diagnostics, scope: this.scope }); return; }
    const sessionId = decodeURIComponent(path.split("/")[2]!);
    const snapshot = this.gateway.stories.get(sessionId)?.snapshot;
    if (!snapshot) { await this.fail(route, "TARGET_UNAVAILABLE", "not_sent", 404); return; }
    const deletable = this.deletionAllowed && snapshot.running === false && !snapshot.requests.length;
    await this.reply(route, hermesV2SessionDeletionPreviewSchema, { scope: this.scope, requestedSessionId: sessionId,
      title: snapshot?.session.title ?? sessionId, deletable, reason: deletable ? null : "Die Sitzung ist noch beschäftigt oder ungeklärt.", effect: "compression-chain" });
  }

  private async mutate(route: Route, path: string, body: unknown): Promise<void> {
    const failure = this.failNextAction; this.failNextAction = null;
    if (failure === "not_sent" || failure === "rejected") {
      await this.fail(route, failure === "rejected" ? "NATIVE_CONFLICT" : "STALE_RESOURCE_CONTEXT", failure, 409); return;
    }
    if (path === "/configuration") {
      const input = hermesV2ConfigurationUpdateSchema.parse(body);
      if (input.scope !== this.scope || JSON.stringify(input.expected) !== JSON.stringify(this.configuration.values)) {
        await this.fail(route, "STALE_RESOURCE_CONTEXT", "not_sent", 409); return;
      }
      Object.assign(this.configuration.values, input.changes);
      if (await this.loseOrFail(route, failure)) return;
      await this.reply(route, hermesV2ConfigurationSchema, { ...this.configuration, scope: this.scope }, true); return;
    }
    const session = path.match(/^\/sessions\/([^/]+)$/);
    if (session) {
      const input = hermesV2SessionDeleteSchema.parse(body), id = decodeURIComponent(session[1]!);
      if (input.scope !== this.scope) { await this.fail(route, "STALE_RESOURCE_CONTEXT", "not_sent", 409); return; }
      const snapshot = this.gateway.stories.get(id)?.snapshot;
      if (!this.deletionAllowed || snapshot?.running !== false || snapshot.requests.length) {
        await this.fail(route, "NATIVE_CONFLICT", "rejected", 409); return;
      }
      this.gateway.stories.delete(id);
      if (await this.loseOrFail(route, failure)) return;
      this.invalidate("sessions", [id]);
      await this.reply(route, hermesV2SessionDeletedSchema, { scope: this.scope, outcome: "confirmed", requestedSessionId: id,
        alreadyAbsent: false, confirmedAbsentSessionIds: [id], affectedIdsComplete: false, effect: "compression-chain" }, true); return;
    }
    const match = path.match(/^\/cron\/jobs(?:\/([^/]+))?(?:\/(pause|resume|trigger))?$/);
    if (!match) { await this.fail(route, "INVALID_RESOURCE_REQUEST", "not_sent", 400); return; }
    const method = route.request().method(), id = match[1] ? decodeURIComponent(match[1]) : null;
    const operation = !id ? "create" : match[2] === "trigger" ? "trigger" : match[2] ?? (method === "DELETE" ? "delete" : "update");
    let job = id ? this.jobs.get(id) : undefined;
    if (id && !job) { await this.fail(route, "TARGET_UNAVAILABLE", "not_sent", 404); return; }
    if (operation === "create") {
      const input = hermesV2CronCreateSchema.parse(body);
      if (input.scope !== this.scope) { await this.fail(route, "STALE_RESOURCE_CONTEXT", "not_sent", 409); return; }
      if (this.rejectSchedule) { await this.fail(route, "UPSTREAM_REJECTED", "rejected", 400); return; }
      job = browserCron(`created-${++this.created}`, { name: input.name, prompt: input.prompt,
        schedule: input.schedule, repeat: input.repeat, paused: input.paused, state: input.paused ? "paused" : "scheduled" });
    } else if (operation === "update") {
      const input = hermesV2CronUpdateSchema.parse(body);
      if (input.scope !== this.scope) { await this.fail(route, "STALE_RESOURCE_CONTEXT", "not_sent", 409); return; }
      if (this.rejectSchedule) { await this.fail(route, "UPSTREAM_REJECTED", "rejected", 400); return; }
      const updates = { ...input.updates }; delete updates.projectId;
      job = hermesV2CronJobSchema.parse({ ...job!, ...updates });
    } else {
      const input = operation === "trigger" || operation === "delete"
        ? hermesV2CronConfirmSchema.parse(body) : hermesV2ResourceActionSchema.parse(body);
      if (input.scope !== this.scope) { await this.fail(route, "STALE_RESOURCE_CONTEXT", "not_sent", 409); return; }
      if (operation === "pause" || operation === "resume") job = { ...job!, paused: operation === "pause" };
      if (operation === "trigger") job = { ...job!, paused: false, state: "completed", lastStatus: "completed" };
    }
    this.jobs.set(job!.id, job!);
    const removed = operation === "delete" || operation === "trigger" && this.oneShotDisappears;
    if (removed) this.jobs.delete(job!.id);
    if (await this.loseOrFail(route, failure)) return;
    this.invalidate();
    await this.reply(route, hermesV2CronMutationSchema, { scope: this.scope, outcome: "confirmed", operation,
      jobId: job!.id, job: operation === "delete" ? null : job }, true);
  }

  private async loseOrFail(route: Route, failure: "not_sent" | "rejected" | "unknown" | null): Promise<boolean> {
    if (failure === "unknown") { await this.fail(route, "UNKNOWN_OUTCOME", "unknown"); return true; }
    if (this.loseNextActionReply) { this.loseNextActionReply = false; await route.abort("connectionreset"); return true; }
    return false;
  }
}

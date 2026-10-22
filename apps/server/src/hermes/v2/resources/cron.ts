import type { HermesV2CronFields, HermesV2CronMutation, HermesV2CronRuns } from "@wrapt/contracts/hermes-v2";
import { object } from "../normalize-values.js";
import type { ResourceContext } from "./context.js";
import type { ResourceHost, ResourceMutation } from "./host.js";
import { ResourceError } from "./errors.js";
import { cronJob } from "./cron-project.js";
import { resourceText } from "./projection.js";
import { resourceTime } from "./knowledge.js";

const base = "/api/cron/jobs";
type CronInput = { [K in keyof HermesV2CronFields]?: HermesV2CronFields[K] | undefined };
const missing = () => new ResourceError(404, "TARGET_UNAVAILABLE", "Der genaue Job ist im bestätigten Profil nicht verfügbar.");
export async function cronList(host: ResourceHost, binding: ResourceContext) {
  const raw = await host.read(binding, host.path(binding, base));
  if (!Array.isArray(raw)) throw new ResourceError(503, "RESOURCE_UNAVAILABLE", "Die native Jobliste ist nicht bestätigt.");
  const jobs = raw.slice(0, 100).filter((entry) => object(entry).profile === undefined || object(entry).profile === binding.scope.profile)
    .map((job) => cronJob(job, host.secrets)).filter((job) => job !== null);
  return { scope: binding.token, jobs, truncated: raw.length > 100 || jobs.length !== Math.min(raw.length, 100) || jobs.some((job) => job.truncated) };
}
export async function cronTarget(host: ResourceHost, binding: ResourceContext, id: string) {
  const raw = await host.read(binding, host.path(binding, base));
  if (!Array.isArray(raw) || raw.filter((entry) => object(entry).id === id).length !== 1) throw missing();
  const listed = object(raw.find((entry) => object(entry).id === id));
  if (listed.profile !== undefined && listed.profile !== binding.scope.profile) throw missing();
  const row = object(await host.read(binding, host.path(binding, `${base}/${encodeURIComponent(id)}`)));
  if (row.id !== id || row.profile !== undefined && row.profile !== binding.scope.profile) throw missing();
  return row;
}
export async function cronDetail(host: ResourceHost, binding: ResourceContext, id: string) {
  const job = cronJob(await cronTarget(host, binding, id), host.secrets); if (!job) throw missing();
  return { scope: binding.token, job };
}
export async function cronRuns(host: ResourceHost, binding: ResourceContext, id: string, limit: number): Promise<HermesV2CronRuns> {
  await cronTarget(host, binding, id);
  const raw = object(await host.read(binding, host.path(binding, `${base}/${encodeURIComponent(id)}/runs?limit=${limit}`)));
  if (!Array.isArray(raw.runs)) throw new ResourceError(503, "RESOURCE_UNAVAILABLE", "Die native Laufhistorie ist nicht bestätigt.");
  const runs = raw.runs.slice(0, limit).map((entry) => {
    const row = object(entry); const content = resourceText(host.secrets, row.content ?? row.output ?? row.text ?? row.preview ?? "", 16_384);
    const status = typeof row.status === "string" ? resourceText(host.secrets, row.status, 100) : null;
    return { id: typeof row.id === "string" && row.id.length <= 200 ? row.id : null, startedAt: resourceTime(row.started_at ?? row.created_at), status: status?.text ?? null,
      text: content.text, truncated: content.truncated || status?.truncated === true || row.truncated === true };
  });
  return { scope: binding.token, jobId: id, runs, truncated: raw.truncated === true || raw.runs.length > limit || runs.some((row) => row.truncated) };
}
async function fields(host: ResourceHost, binding: ResourceContext, input: CronInput) {
  const output: Record<string, unknown> = {};
  for (const key of ["name", "prompt", "schedule", "repeat"] as const) if (key in input) output[key] = input[key];
  let cwd: Awaited<ReturnType<ResourceContext["cwd"]>> | null = null;
  if ("projectId" in input) {
    let path: string;
    try { path = await host.deps.resolveProjectCwd(input.projectId ?? null); } catch { throw new ResourceError(403, "PROJECT_FORBIDDEN", "Das Projekt ist nicht verfügbar."); }
    await binding.current(); cwd = await binding.cwd(path); output.workdir = cwd.canonical;
  }
  return { output, cwd };
}
export async function cronMutate(host: ResourceHost, binding: ResourceContext, mutation: ResourceMutation,
  operation: HermesV2CronMutation["operation"], id: string | null, input: CronInput = {}): Promise<HermesV2CronMutation> {
  const prepared = await fields(host, binding, input);
  let expectedWorkdir: string | null = null;
  let existing: Awaited<ReturnType<ResourceContext["cwd"]>> | null = null;
  if (id !== null) {
    const target = await cronTarget(host, binding, id);
    if (["update", "resume", "trigger"].includes(operation)) {
      if (typeof target.workdir !== "string" || !target.workdir) throw new ResourceError(403, "PROJECT_FORBIDDEN", "Der native Arbeitsordner ist nicht bestätigt.");
      existing = await binding.cwd(target.workdir);
      expectedWorkdir = target.workdir;
    }
  }
  await existing?.current(); await prepared.cwd?.current();
  const path = host.path(binding, id === null ? base : `${base}/${encodeURIComponent(id)}`);
  const guard = async () => {
    if (id !== null) {
      const current = await cronTarget(host, binding, id);
      if (existing && current.workdir !== expectedWorkdir) throw new ResourceError(409, "STALE_RESOURCE_CONTEXT", "Der native Arbeitsordner hat sich geändert.");
    }
    await existing?.current(); await prepared.cwd?.current(); binding.assert();
  };
  const send = (method: "post" | "put" | "delete", targetPath: string, body?: unknown) => mutation.send(host, binding, method, targetPath, body, guard);
  const receipt = (value: unknown) => {
    const raw = object(value); const job = cronJob(raw, host.secrets);
    if (!job?.valid || id !== null && job.id !== id || raw.profile !== undefined && raw.profile !== binding.scope.profile)
      throw new ResourceError(503, "UNKNOWN_OUTCOME", "Die native Jobquittung ist nicht bestätigt.");
    return job;
  };
  let ack: unknown;
  if (operation === "create") ack = await send("post", path, { ...prepared.output, paused: input.paused, deliver: "local" });
  else if (operation === "update") {
    if (input.paused === true) { ack = await send("post", host.path(binding, `${base}/${encodeURIComponent(id!)}/pause`)); receipt(ack); }
    if (Object.keys(prepared.output).length) {
      ack = await send("put", path, { updates: prepared.output }); receipt(ack);
      if (prepared.cwd) {
        if (object(ack).workdir !== prepared.cwd.canonical) throw new ResourceError(503, "UNKNOWN_OUTCOME", "Der geänderte native Arbeitsordner ist nicht bestätigt.");
        expectedWorkdir = prepared.cwd.canonical;
      }
    }
    if (input.paused === false) ack = await send("post", host.path(binding, `${base}/${encodeURIComponent(id!)}/resume`));
  } else ack = await send(operation === "delete" ? "delete" : "post", operation === "delete" ? path : host.path(binding, `${base}/${encodeURIComponent(id!)}/${operation}`));
  await existing?.current(); await prepared.cwd?.current();
  const raw = object(ack);
  if (operation === "delete") {
    if (raw.ok !== true) throw new ResourceError(503, "UNKNOWN_OUTCOME", "Die native Löschquittung ist nicht bestätigt.");
    return { scope: binding.token, outcome: "confirmed", operation, jobId: id!, job: null };
  }
  const job = receipt(ack);
  return { scope: binding.token, outcome: "confirmed", operation, jobId: job.id, job };
}

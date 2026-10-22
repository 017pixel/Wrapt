import { buildPluginSource } from "./code-build.js";
import type { PluginBuildJob } from "./code-build-process.js";

process.once("message", (job: PluginBuildJob) => {
  let reply;
  try { reply = { result: buildPluginSource(job.source, job.options) }; }
  catch (error) { reply = { error: error instanceof Error ? error.message : "Der Compiler ist fehlgeschlagen." }; }
  process.send?.(reply, () => { if (process.connected) process.disconnect?.(); });
});

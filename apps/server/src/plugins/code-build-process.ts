import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LocalPluginSource } from "@wrapt/extension-contracts";
import type { PluginBuildOptions, PluginBuildResult } from "./code-build.js";

export interface PluginBuildJob { source: LocalPluginSource; options: PluginBuildOptions }
type BuildReply = { result: PluginBuildResult } | { error: string };

/** Der Compiler läuft außerhalb des HTTP-Prozesses; nur ein fertiger Build wird veröffentlicht. */
export async function buildPluginSourceInProcess(source: LocalPluginSource, options: PluginBuildOptions, timeoutMs: number): Promise<PluginBuildResult> {
  const staged = `${options.outputDirectory}.compile-${randomUUID()}`;
  const previous = `${options.outputDirectory}.previous-${randomUUID()}`;
  const compiled = fileURLToPath(new URL("./code-build-worker.js", import.meta.url));
  const worker = existsSync(compiled) ? compiled : fileURLToPath(new URL("./code-build-worker.ts", import.meta.url));
  const require = createRequire(import.meta.url);
  let child: ChildProcess | undefined;
  let closed: Promise<void> | undefined;
  try {
    const result = await new Promise<PluginBuildResult>((resolve, reject) => {
      child = fork(worker, [], {
        execArgv: worker.endsWith(".ts") ? ["--import", pathToFileURL(require.resolve("tsx/esm")).href] : [],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        serialization: "advanced",
      });
      const compiler = child;
      closed = new Promise((resolve) => compiler.once("close", () => resolve()));
      const timer = setTimeout(() => { compiler.kill(); reject(new Error("Der Plugin-Build hat zu lange gedauert.")); }, timeoutMs);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Der Compiler-Prozess wurde beendet (${code ?? "Signal"}).`)); });
      child.once("message", (message: BuildReply) => {
        clearTimeout(timer);
        if ("error" in message) reject(new Error(message.error));
        else resolve(message.result);
      });
      child.send({ source, options: { ...options, outputDirectory: staged } } satisfies PluginBuildJob, (error) => { if (error) { clearTimeout(timer); compiler.kill(); reject(error); } });
    });
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return { ...result, directory: options.outputDirectory };
    if (existsSync(options.outputDirectory)) renameSync(options.outputDirectory, previous);
    try { renameSync(staged, options.outputDirectory); }
    catch (error) {
      if (existsSync(previous)) renameSync(previous, options.outputDirectory);
      throw error;
    }
    rmSync(previous, { recursive: true, force: true });
    return { ...result, directory: options.outputDirectory };
  } finally {
    if (child?.exitCode === null) child.kill();
    await closed;
    // Auch nach einem Timeout können innere Compiler-Stagingverzeichnisse übrig sein.
    if (existsSync(dirname(staged))) {
      for (const name of readdirSync(dirname(staged))) {
        if (name === basename(staged) || name.startsWith(`${basename(staged)}.stage-`) || name.startsWith(`${basename(staged)}.previous-`)) {
          rmSync(join(dirname(staged), name), { recursive: true, force: true });
        }
      }
    }
  }
}

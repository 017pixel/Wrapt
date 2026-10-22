import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginProcess } from "./code-process.js";

const fixtures: { directory: string; runtime: PluginProcess }[] = [];
afterEach(async () => {
  for (const { directory, runtime } of fixtures.splice(0)) { await runtime.stop(true); rmSync(directory, { recursive: true, force: true }); }
});

function runtime(source: string, timeoutMs = 3000) {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-plugin-process-"));
  const releaseDirectory = join(directory, "release");
  mkdirSync(releaseDirectory);
  const entrypoint = join(releaseDirectory, "server.mjs");
  writeFileSync(entrypoint, source);
  const instance = new PluginProcess({ id: "personal.process", version: "0.1.0", entrypoint, sourceDirectory: directory, dataDirectory: join(directory, "data"), releaseDirectory }, {
    timeoutMs, shutdownTimeoutMs: 100, handle: () => null,
  });
  fixtures.push({ directory, runtime: instance });
  return instance;
}

describe("ausführbare Plugin-Prozesse", () => {
  it("aktiviert erst nach Handshake und führt echte persistente RPC-Aktionen aus", async () => {
    const instance = runtime(`export default { setup(ctx) {
      const tasks = ctx.storage.collection('tasks');
      ctx.rpc.register('save', { async handler(input) { return tasks.put(input.id, { title: input.title }); } });
      ctx.rpc.register('list', { async handler() { return tasks.list(); } });
    } };`);
    expect(await instance.start()).toMatchObject({ rpc: ["save", "list"] });
    await expect(instance.call("rpc", { name: "list" })).rejects.toThrow("aktiviert");
    await instance.call("activate");
    expect(await instance.call("rpc", { name: "save", input: { id: "a", title: "Funktioniert" }, request: { userId: "demo", requestId: "first" } })).toMatchObject({ value: { title: "Funktioniert" } });
    expect(await instance.call("rpc", { name: "list", request: { userId: "demo", requestId: "second" } })).toHaveLength(1);
  });

  it("verwirft eine fehlerhafte Aktivierung und beendet den Prozess", async () => {
    const instance = runtime("export default { setup() { throw new Error('Absichtlich fehlerhaft'); } };");
    await expect(instance.start()).rejects.toThrow("Absichtlich fehlerhaft");
    expect(instance.child.exitCode !== null || instance.child.signalCode !== null).toBe(true);
  });

  it("beendet endlos laufenden Plugin-Code nach dem Zeitlimit", async () => {
    const instance = runtime("export default { setup(ctx) { ctx.rpc.register('hang', { handler() { while (true) {} } }); } };", 1500);
    await instance.start();
    await instance.call("activate");
    await expect(instance.call("rpc", { name: "hang" }, 100)).rejects.toThrow("Zeitlimit");
    expect(instance.child.exitCode !== null || instance.child.signalCode !== null).toBe(true);
  });

  it("wartet beim Einfrieren auf laufende Aktionen und weist neue Aufrufe zurück", async () => {
    const instance = runtime(`export default { setup(ctx) {
      ctx.rpc.register('save', { async handler() { await new Promise(r => setTimeout(r, 100)); await ctx.storage.set('saved', true); } });
      ctx.rpc.register('read', { handler() { return ctx.storage.get('saved'); } });
    } };`);
    await instance.start();
    await instance.call("activate");
    const save = instance.call("rpc", { name: "save" });
    await instance.call("freeze");
    await save;
    await expect(instance.call("rpc", { name: "read" })).rejects.toThrow("gewechselt");
    await instance.call("thaw");
    expect(await instance.call("rpc", { name: "read" })).toBe(true);
  });
});

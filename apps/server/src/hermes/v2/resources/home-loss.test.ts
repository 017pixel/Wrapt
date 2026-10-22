import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";

const lstat = fs.lstat;
describe("Monotone HOME-Identitätsverluste", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  let moved = false;
  beforeEach(async () => { f = await resourceFixture(); moved = false; });
  async function restore() {
    if (!moved) return;
    await fs.rm(f.root, { recursive: true, force: true }); await fs.rename(`${f.root}-saved`, f.root); moved = false;
  }
  afterEach(async () => { fs.lstat = lstat; syncBuiltinESMExports(); await restore(); await f.close(); });
  async function move() { await fs.rename(f.root, `${f.root}-saved`); moved = true; }
  it.each(["directory", "missing", "symlink"])("widerruft einen vom alten Kontext erkannten Verlust dauerhaft: %s", async (mode) => {
    const old = await f.scope(); const binding = await f.pool.resources!.context();
    await move();
    if (mode === "directory") await fs.mkdir(f.root);
    if (mode === "symlink") await fs.symlink(`${f.root}-saved`, f.root);
    await expect(binding.current()).rejects.toMatchObject({ code: "STALE_RESOURCE_CONTEXT" });
    await restore();
    await expect(binding.current()).rejects.toMatchObject({ code: "STALE_RESOURCE_CONTEXT" });
    const rejected = await f.request("POST", "/cron/jobs/job-1/pause", { scope: old });
    expect(rejected.statusCode).toBe(409); expect(f.writes).toHaveLength(0);
    const fresh = await f.scope(); expect(fresh).not.toBe(old); expect(await f.scope()).toBe(fresh);
    expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope: fresh })).statusCode).toBe(200);
  });
  it("behält einen asynchron beobachteten Ersatzinode auch nach Wiederherstellung vor dem Assert", async () => {
    const binding = await f.pool.resources!.context(); const old = binding.token; let observed = false; let count = 0;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      if (!observed && String(args[0]) === f.root && ++count === 2) {
        observed = true; await move(); await fs.mkdir(f.root); const replacement = await lstat(...args); await restore(); return replacement;
      }
      return lstat(...args);
    }) as typeof fs.lstat; syncBuiltinESMExports();
    await expect(binding.current()).rejects.toMatchObject({ code: "STALE_RESOURCE_CONTEXT" });
    expect(observed).toBe(true); expect(await f.scope()).not.toBe(old);
    expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope: old })).statusCode).toBe(409); expect(f.writes).toHaveLength(0);
  });
  it("bestätigt unveränderte Identität ohne neue Generation und ohne Chatlease", async () => {
    const binding = await f.pool.resources!.context(); await binding.current(); binding.assert();
    expect(await f.scope()).toBe(binding.token); expect(f.pool.existing()).toHaveLength(0);
  });
});

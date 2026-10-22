import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hermesV2CronListSchema, hermesV2MemorySchema, hermesV2PendingSchema } from "@wrapt/contracts/hermes-v2";
import { resourceFixture } from "./resource.fixture.js";
import { resourceOutput } from "./output.js";
import { memoryRead, pendingRead } from "./knowledge.js";
import { resourceText } from "./projection.js";

const original = fs.lstat;
describe("Ressourcenredaction nach echten späten Awaits", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); });
  afterEach(async () => { fs.lstat = original; syncBuiltinESMExports(); await f.close(); });
  function learnAtHome(values: string[], nth = 1) {
    let count = 0; let observed = false;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await original(...args);
      if (String(args[0]) === f.root && ++count === nth) { observed = true; for (const value of values) f.pool.resources!.secrets.remember(value); }
      return stat;
    }) as typeof fs.lstat;
    syncBuiltinESMExports(); return () => observed;
  }
  for (const position of ["prefix", "middle", "suffix"] as const) for (const reverse of [false, true]) it(`schützt späten abgeschnittenen Cronlangwert mit ${position}-Teilwert, Reihenfolge=${reverse}`, async () => {
    const short = "PARTSECRET";
    const long = position === "prefix" ? short + "z".repeat(30_000) : position === "middle" ? "z".repeat(10_000) + short + "z".repeat(20_000) : "z".repeat(30_000) + short;
    f.jobs.get("job-1")!.prompt = long;
    let armed = false; let count = 0; let delayed = false;
    f.hook((_method, path) => { if (path.startsWith("/api/cron/jobs?")) armed = true; });
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await original(...args);
      if (armed && String(args[0]) === f.root && ++count === 3) {
        delayed = true; for (const value of reverse ? [long, short] : [short, long]) f.pool.resources!.secrets.remember(value);
      }
      return stat;
    }) as typeof fs.lstat; syncBuiltinESMExports();
    const response = await f.request("GET", "/cron/jobs"); expect(response.statusCode).toBe(200); expect(delayed).toBe(true);
    const data = hermesV2CronListSchema.parse(response.json()); expect(data.jobs[0]!.prompt).toBe("***"); expect(data.jobs[0]!.id).toBe("job-1");
  });
  it.each([false, true])("schützt gecachten Memorypräfix am letzten echten HOME-lstat, Reihenfolge=%s", async (reverse) => {
    const secret = "MEMORY-" + "😀".repeat(30_000) + "-END"; const short = "😀😀";
    await fs.writeFile(join(f.root, "memories/MEMORY.md"), secret);
    const host = f.pool.resources!; const binding = await host.context(); const cached = await memoryRead(host, binding);
    expect(cached.files[0]!.text).toContain("MEMORY-"); const observed = learnAtHome(reverse ? [secret, short] : [short, secret]);
    const output = await resourceOutput(host, binding, hermesV2MemorySchema, cached);
    expect(observed()).toBe(true); expect(output.files[0]!.text).toBe("***"); expect(output.files[0]!.truncated).toBe(true);
    expect(cached.files[0]!.text).toContain("MEMORY-");
  });
  it("kennzeichnet späte Pendingmaskenverluste und unvollständigen gepinnten Beleg", async () => {
    await fs.writeFile(join(f.root, "pending/memory/1234abcd.json"), JSON.stringify({ id: "1234abcd", subsystem: "memory", action: "replace", summary: "Test", origin: "foreground", created_at: "2023-11-14T22:13:20.000Z", payload: { action: "replace", matched_entry: "Q".repeat(10_000) + "!" } }));
    const host = f.pool.resources!; const binding = await host.context(); const cached = await pendingRead(host, binding); expect(cached.records[0]!.matchedEntryComplete).toBe(true);
    const observed = learnAtHome(["Q"]); const output = await resourceOutput(host, binding, hermesV2PendingSchema, cached);
    expect(observed()).toBe(true); expect(output.records[0]!.matchedEntryComplete).toBe(false); expect(output.records[0]!.payload.truncated).toBe(true); expect(output.truncated).toBe(true);
    expect(Buffer.byteLength(output.records[0]!.payload.text!)).toBeLessThanOrEqual(16_384); expect(output.records[0]!.createdAt).toBe(1_700_000_000_000);
  });
  it.each([false, true])("wendet echtes Gesamtbudget nach früher/später Maskenexpansion an, spät=%s", async (late) => {
    f.jobs.clear(); for (let index = 0; index < 100; index++) f.jobs.set(`job-${index}`, f.job(`job-${index}`, { prompt: "Q".repeat(12_000) + "!" }));
    let count = 0; let armed = false;
    if (!late) f.pool.resources!.secrets.remember("Q");
    f.hook((_method, path) => { if (path.startsWith("/api/cron/jobs?")) armed = true; });
    if (late) {
      fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => { const stat = await original(...args);
        if (armed && String(args[0]) === f.root && ++count === 3) f.pool.resources!.secrets.remember("Q"); return stat;
      }) as typeof fs.lstat; syncBuiltinESMExports();
    }
    const response = await f.request("GET", "/cron/jobs"); expect(response.statusCode).toBe(200); const output = response.json();
    expect(Buffer.byteLength(response.body)).toBeLessThanOrEqual(1_048_576); expect(output.jobs.length).toBeLessThan(100); expect(output.truncated).toBe(true);
    expect(output.jobs.every((row: { id: string; prompt: string; truncated: boolean }) => /^job-\d+$/.test(row.id) && !row.prompt.includes("Q") && row.truncated)).toBe(true);
  });
  it.each([false, true])("behält tatsächliche Zeichen-/UTF8grenzen bei schrumpfender und wachsender Maske, bytes=%s", (bytes) => {
    const secrets = f.pool.resources!.secrets; secrets.remember("Q");
    const expanded = resourceText(secrets, "QQQQ!", 6, bytes); expect(expanded).toEqual({ text: "******", truncated: true });
    secrets.remember("😀😀😀"); const shrink = resourceText(secrets, "😀😀😀!", 6, bytes); expect(shrink).toEqual({ text: "***!", truncated: false });
  });
  it("erhält ein wirkliches UTF8-Ersatzzeichen und verwirft ausschließlich unvollständige Randbytes", () => {
    const secrets = f.pool.resources!.secrets;
    expect(resourceText(secrets, "a\uFFFD", 4, true)).toEqual({ text: "a\uFFFD", truncated: false });
    expect(resourceText(secrets, "ä😀!", 5, true)).toEqual({ text: "ä", truncated: true });
    expect(resourceText(secrets, "ä😀!", 6, true)).toEqual({ text: "ä😀", truncated: true });
    expect(resourceText(secrets, "ä😀!", 7, true)).toEqual({ text: "ä😀!", truncated: false });
  });
});

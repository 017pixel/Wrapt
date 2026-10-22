import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { expect } from "vitest";
import { deferred } from "../attachments/await-context.fixture.js";
import { workFixture } from "./test.fixture.js";

/** Echte Nativeantworten und ein echter verzögerter HOME-lstat, nur in eigenen Fakes. */
export async function redactionFixture() {
  const f = await workFixture(); const original = fs.lstat;
  let restore = () => {};
  async function learn(value: string) {
    const id = `srq-${randomUUID()}`;
    f.core.request(f.session, "secret", { label: "Synthetische Regression" }, id);
    const record = f.client.manager.sessions.records.get(f.session.id)!;
    await expect.poll(() => record.snapshot.requests.length).toBe(1);
    const request = record.snapshot.requests[0]!;
    expect(await f.client.run({ op: "request.respond", sessionId: f.session.id, epoch: request.epoch,
      requestKey: request.key, response: { kind: "secret", value } })).toMatchObject({ type: "result" });
    await expect.poll(() => f.core.responses.some((entry) => entry.id === id)).toBe(true);
  }
  function holdPostNative() {
    const entered = deferred(); const release = deferred(); const hook = f.core.resultHook!;
    let native = false; let held = false;
    f.core.resultHook = (method, params, raw) => {
      const result = hook(method, params, raw); if (method === "process.list") native = true; return result;
    };
    fs.lstat = (async (...args: Parameters<typeof original>) => {
      const stat = await original(...args);
      if (native && !held && String(args[0]) === f.home) { held = true; entered.resolve(); await release.promise; }
      return stat;
    }) as typeof original;
    syncBuiltinESMExports();
    restore = () => { release.resolve(); fs.lstat = original; syncBuiltinESMExports(); f.core.resultHook = hook; };
    return { entered: entered.promise, release: release.resolve };
  }
  return { ...f, learn, holdPostNative, close: async () => { restore(); await f.close(); } };
}

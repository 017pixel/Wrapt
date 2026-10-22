import { randomUUID } from "node:crypto";
import { mkdir, readdir, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "../phase6-test.fixture.js";

describe("Anhangsbindung über asynchrone Grenzen", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  async function capture() {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const service = f.pool.attachments!; const binding = await service.capture("a", browser.id, session.id);
    const { row } = service.reserve("a", randomUUID(), binding, "datei.txt", "text/plain");
    return { session, browser, service, binding, row };
  }
  it.each(["close", "flag", "generation", "live", "epoch", "profile", "cwd", "abort"])("verwirft %s vor NativeStage ohne file.attach", async (change) => {
    const { browser, service, binding, row } = await capture(); const controller = new AbortController();
    if (change === "close") browser.manager.release(browser.id, "v2-disabled");
    if (change === "flag") f.deps.enabled = () => false;
    if (change === "generation") { browser.manager.subscriptions.detach(browser.id, "session"); browser.manager.subscriptions.attach(browser.id, "session"); }
    if (change === "live") binding.record.liveId = "anderes-live";
    if (change === "epoch") binding.record.epoch = "anderer-epoch";
    if (change === "profile") binding.record.profileName = "other";
    if (change === "cwd") binding.record.snapshot.session.cwd = join(f.root, "other");
    if (change === "abort") controller.abort();
    await expect(service.stage(binding, row, Buffer.from("x"), controller.signal)).rejects.toMatchObject({ outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
    expect(service.store.get("a", row.upload_id)?.state).toBe("not_sent");
  });
  it("ein Transport-/Epochenwechsel zwischen Capture und Stage sendet nichts", async () => {
    const { browser, service, binding, row } = await capture();
    const transport = browser.manager.upstream.transportId; f.core.disconnect("epoch-2");
    await expect.poll(() => browser.manager.upstream.transportId !== transport).toBe(true);
    await expect(service.stage(binding, row, Buffer.from("x"), new AbortController().signal)).rejects.toMatchObject({ outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it("ein CWD-Symlinkwechsel mit gleicher Schreibweise vor Stage wird über realpath erkannt", async () => {
    await mkdir(join(f.root, "first")); await mkdir(join(f.root, "second"));
    const link = join(f.root, "workspace"); await symlink(join(f.root, "first"), link);
    const session = f.core.seed("session"); session.cwd = link; const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const service = f.pool.attachments!; const binding = await service.capture("a", browser.id, session.id);
    const { row } = service.reserve("a", randomUUID(), binding, "a.txt", "text/plain");
    await unlink(link); await symlink(join(f.root, "second"), link);
    await expect(service.stage(binding, row, Buffer.from("x"), new AbortController().signal)).rejects.toMatchObject({ outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it.each(["close", "generation", "cwd", "profile", "abort"])("%s nach möglicher Nativeannahme bleibt unknown und löscht keine Datei", async (change) => {
    const { browser, service, binding, row } = await capture(); const controller = new AbortController();
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, value) => {
      const result = hook(method, params, value);
      if (method === "file.attach") {
        if (change === "close") browser.manager.release(browser.id, "v2-disabled");
        if (change === "generation") { browser.manager.subscriptions.detach(browser.id, "session"); browser.manager.subscriptions.attach(browser.id, "session"); }
        if (change === "cwd") binding.record.snapshot.session.cwd = join(f.root, "other");
        if (change === "profile") binding.record.profileName = "other";
        if (change === "abort") controller.abort();
      }
      return result;
    };
    await expect(service.stage(binding, row, Buffer.from("x"), controller.signal)).rejects.toMatchObject({ outcome: "unknown" });
    expect(service.store.get("a", row.upload_id)?.state).toBe("unknown");
    expect(await readdir(join(f.root, "attachments"))).toHaveLength(1);
    expect(f.core.calls.filter((call) => call.method === "file.attach")).toHaveLength(1);
  });
  it("Unklarheit schützt eine inzwischen fremd arbeitende Runtime bereits vor Freigabe der Stagequeue", async () => {
    const { session, browser, service, binding, row } = await capture(); const hook = f.core.resultHook!;
    binding.record.backgroundActive = false;
    f.core.resultHook = (method, params, value) => {
      const result = hook(method, params, value);
      if (method === "file.attach") { session.running = true; browser.manager.release(browser.id, "v2-disabled"); }
      return result;
    };
    await expect(service.stage(binding, row, Buffer.from("x"), new AbortController().signal)).rejects.toMatchObject({ outcome: "unknown" });
    expect(browser.manager.retainRuntime).toBe(true);
    expect(session.running).toBe(true); expect(f.core.server.clients.size).toBe(1);
    f.core.event(session, "message.complete", { content: "fertig" });
    await expect.poll(() => browser.manager.retainRuntime).toBe(false);
  });
});

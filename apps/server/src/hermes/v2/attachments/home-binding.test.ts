import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "../phase6-test.fixture.js";

describe("M1B: HOME bleibt am bestätigten kanonischen Ziel", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  async function context() {
    const home = join(f.root, "profil"); const cwd = join(f.root, "workspace"); const other = join(f.root, "anderes-home");
    await Promise.all([mkdir(home), mkdir(cwd), mkdir(other)]);
    f.custom((path) => path === "/api/profiles" ? { profiles: [{ name: "default", path: home }] } : undefined);
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => {
      if (method !== "file.attach") return hook(method, params, raw);
      const root = join(realpathSync(home), "attachments"); mkdirSync(root, { recursive: true });
      const name = String(params.name); const path = join(root, name);
      writeFileSync(path, Buffer.from(String(params.data_url).split(",")[1]!, "base64"), { flag: "wx" });
      return { attached: true, uploaded: true, name, path, ref_path: path, ref_text: `@file:${path}` };
    };
    const session = f.core.seed("home-session"); session.cwd = cwd; const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const service = f.pool.attachments!; const binding = await service.capture("a", browser.id, session.id);
    const row = service.reserve("a", randomUUID(), binding, "datei.txt", "text/plain").row;
    const originalHome = join(f.root, "urspruengliches-home");
    const change = () => { renameSync(home, originalHome); symlinkSync(other, home); };
    return { home, originalHome, cwd, other, session, browser, service, binding, row, change };
  }
  it("HOME-Austausch vor Capture verhindert bereits die neue Bindung", async () => {
    const c = await context(); c.change();
    await expect(c.service.capture("a", c.browser.id, c.session.id)).rejects.toMatchObject({ outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it.each(["before", "activate"])("HOME-Austausch %s Stage bleibt not_sent bei unverändertem Workspace", async (when) => {
    const c = await context();
    if (when === "before") c.change();
    else {
      const hook = f.core.resultHook!; let changed = false;
      f.core.resultHook = (method, params, raw) => { const value = hook(method, params, raw);
        if (method === "session.activate" && !changed) { changed = true; c.change(); } return value; };
    }
    await expect(c.service.stage(c.binding, c.row, Buffer.from("Eigene Bytes"), new AbortController().signal))
      .rejects.toMatchObject({ outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
    expect(c.service.store.get("a", c.row.upload_id)?.state).toBe("not_sent");
    expect(realpathSync(c.cwd)).toBe(c.binding.cwd);
  });
  it("HOME-Austausch nach NativeStage bleibt unknown; die bereits erzeugte Originaldatei bleibt erhalten", async () => {
    const c = await context(); const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => { const value = hook(method, params, raw); if (method === "file.attach") c.change(); return value; };
    await expect(c.service.stage(c.binding, c.row, Buffer.from("Eigene Bytes"), new AbortController().signal))
      .rejects.toMatchObject({ outcome: "unknown" });
    expect(c.service.store.get("a", c.row.upload_id)?.state).toBe("unknown");
    expect(c.service.store.get("a", c.row.upload_id)?.path).toBeNull();
    expect(await readdir(join(c.originalHome, "attachments"))).toHaveLength(1);
    expect(await readdir(c.other)).toEqual([]);
  });
  it("bereits Ready: ausgetauschtes HOME sperrt Status, Download und Submit ohne weitere Coremutation", async () => {
    const c = await context();
    const status = await c.service.stage(c.binding, c.row, Buffer.from("Eigene Bytes"), new AbortController().signal); c.change();
    for (const path of [`/hermes/v2/attachments/${status.attachment!.id}`, `/hermes/v2/attachments/uploads/${status.uploadId}`])
      expect((await f.request(path)).json()).toMatchObject({ code: "STALE_REQUEST", outcome: "not_sent" });
    expect(await c.browser.run({ op: "message.submit", sessionId: c.session.id, text: "x", attachmentIds: [status.attachment!.id] }))
      .toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.core.calls.filter((call) => call.method === "file.attach")).toHaveLength(1);
    expect(f.core.calls.some((call) => call.method === "prompt.submit")).toBe(false);
  });
  it("unverändertes getrenntes HOME/Workspace erlaubt Stage und privaten Download", async () => {
    const c = await context(); const status = await c.service.stage(c.binding, c.row, Buffer.from("Eigene Bytes"), new AbortController().signal);
    expect(status.state).toBe("ready");
    const row = c.service.store.byId("a", c.binding.scope.id, c.row.id); expect(row.root).toBe(join(c.home, "attachments"));
    expect((await f.request(`/hermes/v2/attachments/${c.row.id}`)).body).toBe("Eigene Bytes");
  });
});

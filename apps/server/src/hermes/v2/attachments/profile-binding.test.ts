import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "../phase6-test.fixture.js";

describe("M1A: frische native Profilidentität", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  async function context() {
    const session = f.core.seed("profile-session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const service = f.pool.attachments!;
    return { session, browser, service };
  }
  function profile(value: string | undefined) {
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => {
      const result = hook(method, params, raw);
      return method === "session.activate" ? { ...result as object,
        info: { ...(result as { info: object }).info, profile_name: value } } : result;
    };
  }
  it.each(["anderes-profil", undefined])("Capture ignoriert alte Recordidentität bei frischem Profil %s", async (value) => {
    const { session, browser, service } = await context(); profile(value);
    await expect(service.capture("a", browser.id, session.id)).rejects.toMatchObject({ outcome: "not_sent" });
    expect(browser.manager.sessions.records.get(session.id)?.profileName).toBe(value ?? null);
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it.each(["anderes-profil", undefined])("frisches Profil %s nach Capture verhindert NativeStage", async (value) => {
    const { session, browser, service } = await context();
    const binding = await service.capture("a", browser.id, session.id);
    const row = service.reserve("a", randomUUID(), binding, "datei.txt", "text/plain").row; profile(value);
    await expect(service.stage(binding, row, Buffer.from("Eigene Bytes"), new AbortController().signal))
      .rejects.toMatchObject({ outcome: "not_sent" });
    expect(service.store.get("a", row.upload_id)?.state).toBe("not_sent");
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it("gültiger Upload bleibt gültig; erst danach beobachteter Profilwechsel verhindert den Submit", async () => {
    const { session, browser } = await context();
    const uploaded = await f.upload(browser, session.id); expect(uploaded.statusCode, uploaded.body).toBe(200);
    profile("anderes-profil");
    expect(await browser.run({ op: "message.submit", sessionId: session.id, text: "x", attachmentIds: [uploaded.json().attachment.id] }))
      .toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.core.calls.filter((call) => call.method === "file.attach")).toHaveLength(1);
    expect(f.core.calls.some((call) => call.method === "prompt.submit")).toBe(false);
  });
  it.each(["activate", "event"])("Profilwechsel nach Nativeannahme aus %s bleibt unknown ohne Freigabe", async (source) => {
    const { session, browser, service } = await context(); const hook = f.core.resultHook!; let changed = false;
    f.core.resultHook = (method, params, raw) => {
      const result = hook(method, params, raw);
      if (method === "file.attach") {
        changed = true;
        if (source === "event") f.core.event(session, "session.info", { profile_name: "anderes-profil" });
      }
      return method === "session.activate" && changed ? { ...result as object,
        info: { ...(result as { info: object }).info, profile_name: "anderes-profil" } } : result;
    };
    const upload = randomUUID(); const response = await f.upload(browser, session.id, Buffer.from("Eigene Bytes"), upload);
    expect(response.json()).toMatchObject({ outcome: "unknown" });
    expect(service.store.get("a", upload)?.state).toBe("unknown");
    expect(service.store.get("a", upload)?.path).toBeNull();
    expect(await readdir(join(f.root, "attachments"))).toHaveLength(1);
    expect(f.core.calls.filter((call) => call.method === "file.attach")).toHaveLength(1);
  });
  it("unverändert bestätigtes Profil erhält Capture, Stage, Submit und Download", async () => {
    const { session, browser, service } = await context(); profile("default");
    const uploaded = await f.upload(browser, session.id); expect(uploaded.statusCode, uploaded.body).toBe(200);
    const id = uploaded.json().attachment.id as string;
    expect(await browser.run({ op: "message.submit", sessionId: session.id, text: "x", attachmentIds: [id] }))
      .toMatchObject({ type: "result", op: "message.submit", data: { userRowId: 1 } });
    expect((await f.request(`/hermes/v2/attachments/${id}`)).statusCode).toBe(200);
    expect(service.store.byId("a", f.pool.organization!.scopes.confirmed!.id, id).canonical).toBe(session.id);
  });
});

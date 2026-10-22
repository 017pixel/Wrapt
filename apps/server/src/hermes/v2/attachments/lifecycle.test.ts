import { randomUUID } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hermesV2UploadStatusSchema } from "@wrapt/contracts/hermes-v2";
import { composerFixture } from "../phase6-test.fixture.js";

describe("Anhangslebenszyklus am echten Adapter mit Fake-Core", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  const files = () => f.core.calls.filter((call) => call.method === "file.attach");
  async function ready() {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const response = await f.upload(browser, session.id);
    expect(response.statusCode, response.body).toBe(200);
    const status = hermesV2UploadStatusSchema.parse(response.json());
    expect(status.state).toBe("ready");
    return { session, browser, status, attachment: status.attachment! };
  }
  it("lädt begrenzt hoch, sendet eine absolute native Referenz und bindet Karten nur an die positive Userrow", async () => {
    const { browser, session, attachment } = await ready();
    const result = await browser.run({ op: "message.submit", sessionId: session.id, text: "Bitte lesen", attachmentIds: [attachment.id] });
    expect(result).toMatchObject({ type: "result", op: "message.submit", data: { userRowId: 1 } });
    const sent = f.core.calls.find((call) => call.method === "prompt.submit")!.params;
    expect(sent.text).toBe(`Bitte lesen\n\n@file:${join(f.root, "attachments", `${attachment.id}.txt`)}`);
    expect(Object.keys(files()[0]!.params).sort()).toEqual(["data_url", "name", "session_id"]);
    expect(files()[0]!.params.session_id).toBe(session.liveId);
    const history = await browser.run({ op: "history.read", sessionId: session.id });
    expect(history).toMatchObject({ type: "result", op: "history.read", data: { messages: [{ role: "user", rowId: 1, attachments: [{ id: attachment.id }] }] } });
    // Der Core speichert tatsächlich die absolute Referenz im Usertext; kein Geheimhaltungsversprechen.
    expect(JSON.stringify(history)).toContain(f.root);
    const second = f.browser("a");
    expect(await second.run({ op: "session.subscribe", sessionId: session.id })).toMatchObject({ type: "result", data: {
      snapshot: { messages: [{ attachments: [{ id: attachment.id }] }] } } });
    const legacy = f.browser("a", false);
    const legacyHistory = await legacy.run({ op: "session.subscribe", sessionId: session.id });
    expect(JSON.stringify(legacyHistory)).not.toContain('"attachments"');
    const other = f.browser("b"); await other.run({ op: "session.subscribe", sessionId: session.id });
    expect(JSON.stringify(await other.run({ op: "history.read", sessionId: session.id }))).not.toContain(attachment.id + '"');
    const download = await f.request(`/hermes/v2/attachments/${attachment.id}`);
    expect(download.statusCode).toBe(200); expect(download.body).toBe("Dateiinhalt");
    expect(download.headers).toMatchObject({ "content-type": "application/octet-stream", "x-content-type-options": "nosniff", "cache-control": "no-store" });
    expect(download.headers["content-disposition"]).toContain("attachment;");
  });
  it("Upload-UUID bleibt idempotent; Status und Download sind privat und kontextgebunden", async () => {
    const { browser, session, status, attachment } = await ready();
    const duplicate = await f.upload(browser, session.id, Buffer.from("Anderer Inhalt"), status.uploadId);
    expect(duplicate.statusCode).toBe(200); expect(duplicate.json()).toEqual(status); expect(files()).toHaveLength(1);
    expect((await f.request(`/hermes/v2/attachments/uploads/${status.uploadId}`)).json()).toEqual(status);
    for (const url of [`/hermes/v2/attachments/uploads/${status.uploadId}`, `/hermes/v2/attachments/${attachment.id}`])
      expect((await f.request(url, undefined, "b")).statusCode).toBe(404);
    const next = f.core.seed("next"); await browser.run({ op: "session.subscribe", sessionId: next.id });
    expect((await f.upload(browser, next.id, Buffer.from("neu"), status.uploadId)).statusCode).toBe(409);
    expect(await browser.run({ op: "message.submit", sessionId: next.id, text: "", attachmentIds: [attachment.id] }))
      .toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "prompt.submit")).toBe(false);
  });
  it("Queued/null Receipt erfindet keine Karten und mehrfaches bewusstes Verwenden erhält beide positive Belege", async () => {
    const { browser, session, attachment } = await ready();
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, value) => method === "prompt.submit" ? { status: "queued" } : hook(method, params, value);
    await browser.run({ op: "message.submit", sessionId: session.id, text: "x", attachmentIds: [attachment.id] });
    expect(JSON.stringify(await browser.run({ op: "history.read", sessionId: session.id }))).not.toContain('"attachments"');
    f.core.resultHook = hook;
    for (let i = 0; i < 2; i++) await browser.run({ op: "message.submit", sessionId: session.id, text: "gleich", attachmentIds: [attachment.id] });
    const history = await browser.run({ op: "history.read", sessionId: session.id });
    expect(history.type === "result" && history.op === "history.read" && history.data.messages.filter((row) => row.attachments?.length).map((row) => row.rowId)).toEqual([2, 3]);
  });
  it("Resultfehler nach file.attach bleiben unknown, behalten Coredateien und senden niemals automatisch erneut", async () => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, value) => { const result = hook(method, params, value); return method === "file.attach" ? { attached: "falsch" } : result; };
    const uploadId = randomUUID(); const response = await f.upload(browser, session.id, Buffer.from("Inhalt"), uploadId);
    expect(response.json()).toMatchObject({ code: "PROTOCOL_MISMATCH", outcome: "unknown", uploadId });
    expect((await f.request(`/hermes/v2/attachments/uploads/${uploadId}`)).json()).toMatchObject({ state: "unknown", attachment: null });
    expect(await readdir(join(f.root, "attachments"))).toHaveLength(1); expect(files()).toHaveLength(1);
  });
  it("Dateiaustausch macht Download und Submit unzulässig, ohne das Original zu löschen", async () => {
    const { browser, session, attachment } = await ready();
    const path = join(f.root, "attachments", `${attachment.id}.txt`);
    await writeFile(path, "Manipuliert");
    expect((await f.request(`/hermes/v2/attachments/${attachment.id}`)).statusCode).toBe(403);
    expect(await browser.run({ op: "message.submit", sessionId: session.id, text: "x", attachmentIds: [attachment.id] }))
      .toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "prompt.submit")).toBe(false);
    expect(await readdir(join(f.root, "attachments"))).toHaveLength(1);
  });
});

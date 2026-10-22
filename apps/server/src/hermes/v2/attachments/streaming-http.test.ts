import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "../phase6-test.fixture.js";

describe("HTTP-Body bleibt außerhalb der Sessionqueue", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  it("Stop wird trotz noch unvollständigem HTTP-Upload gesendet; file.attach wartet auf den vollständigen Body", async () => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const stream = new Readable({ read() {} }); const upload = randomUUID();
    const response = f.app.inject({ method: "POST", url: "/api/v1/hermes/v2/attachments?sessionId=session", payload: stream,
      headers: { host: "workbench.test", origin: "http://workbench.test", "tailscale-user-login": "a",
        "content-type": "multipart/form-data; boundary=stream-boundary", "x-hermes-v2-connection-id": browser.id,
        "x-hermes-v2-upload-id": upload } }).then((value) => value);
    stream.push('--stream-boundary\r\nContent-Disposition: form-data; name="file"; filename="stream.txt"\r\nContent-Type: text/plain\r\n\r\nTeil');
    await expect.poll(() => f.pool.attachments!.store.get("a", upload)?.state).toBe("receiving");
    expect(await browser.run({ op: "session.stop", sessionId: session.id })).toMatchObject({ type: "result", op: "session.stop" });
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
    stream.push("\r\n--stream-boundary--\r\n"); stream.push(null);
    expect((await response).statusCode).toBe(200);
    expect(f.core.calls.findIndex((call) => call.method === "session.interrupt"))
      .toBeLessThan(f.core.calls.findIndex((call) => call.method === "file.attach"));
  });
  it("Close während des offenen HTTP-Bodys beendet den Upload vor einer neuen Coremutation", async () => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const stream = new Readable({ read() {} }); const upload = randomUUID();
    const response = f.app.inject({ method: "POST", url: "/api/v1/hermes/v2/attachments?sessionId=session", payload: stream,
      headers: { host: "workbench.test", origin: "http://workbench.test", "tailscale-user-login": "a",
        "content-type": "multipart/form-data; boundary=x", "x-hermes-v2-connection-id": browser.id, "x-hermes-v2-upload-id": upload } }).then((value) => value);
    stream.push('--x\r\nContent-Disposition: form-data; name="file"; filename="x.txt"\r\n\r\nx');
    await expect.poll(() => f.pool.attachments!.store.get("a", upload)?.state).toBe("receiving");
    browser.manager.release(browser.id, "v2-disabled");
    stream.push("\r\n--x--\r\n"); stream.push(null);
    const result = await response;
    expect(result.json()).toMatchObject({ outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
    expect(f.pool.attachments!.store.get("a", upload)?.state).toBe("not_sent");
  });
});

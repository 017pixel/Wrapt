import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "../phase6-test.fixture.js";
import { attachmentPolicy } from "./policy.js";

describe("Anhangs-HTTP: Grenzen vor nativen Mutationen", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  async function browser() {
    const session = f.core.seed("session"); const client = f.browser();
    await client.run({ op: "session.subscribe", sessionId: session.id });
    return { session, client };
  }
  it("prüft Auth, Origin, fremde Connection, Composeroptin und Abo vor file.attach", async () => {
    const { session, client } = await browser();
    const other = f.browser("b"); await other.run({ op: "session.subscribe", sessionId: session.id });
    const legacy = f.browser("a", false); await legacy.run({ op: "session.subscribe", sessionId: session.id });
    const detached = f.browser("a");
    for (const headers of [{ "tailscale-user-login": "fremd" }, { origin: "http://evil.test" },
      { "x-hermes-v2-connection-id": other.id }, { "x-hermes-v2-connection-id": legacy.id },
      { "x-hermes-v2-connection-id": detached.id }, { "x-hermes-v2-connection-id": randomUUID() }]) {
      expect((await f.upload(client, session.id, Buffer.from("x"), randomUUID(), headers)).statusCode).toBeGreaterThanOrEqual(400);
    }
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it("lässt nur ein file-Feld zu und begrenzt Bytes vor Base64/RPC", async () => {
    const { session, client } = await browser();
    for (const bytes of [Buffer.alloc(0), Buffer.alloc(attachmentPolicy.fileBytes + 1)]) {
      const response = await f.upload(client, session.id, bytes);
      expect(response.statusCode, response.body).toBe(bytes.length ? 413 : 400);
      expect(response.json().outcome).toBe("not_sent");
    }
    const field = '--wrapt-test-boundary\r\nContent-Disposition: form-data; name="profile"\r\n\r\nother\r\n';
    expect((await f.upload(client, session.id, Buffer.from("x"), randomUUID(), {}, field)).statusCode).toBeGreaterThanOrEqual(400);
    const file = '--wrapt-test-boundary\r\nContent-Disposition: form-data; name="file"; filename="extra.txt"\r\n\r\nx\r\n';
    expect((await f.upload(client, session.id, Buffer.from("x"), randomUUID(), {}, file)).statusCode).toBeGreaterThanOrEqual(400);
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it("feste Connection-/Upload-Header und striktes Query erlauben keine Pfad-/Profilparameter", async () => {
    const { session, client } = await browser();
    for (const query of ["&profile=other", "&path=/etc/passwd", "&cwd=/tmp", "&ref_text=@file:x"])
      expect((await f.upload(client, session.id + query)).statusCode).toBe(400);
    for (const headers of [{ "x-hermes-v2-upload-id": "../../etc/passwd" }, { "x-hermes-v2-connection-id": "a" }])
      expect((await f.upload(client, session.id, Buffer.from("x"), randomUUID(), headers)).statusCode).toBe(400);
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it("begrenzt Uploadkonkurrenz pro Principal und insgesamt und gibt jeden Platz explizit frei", async () => {
    const service = f.pool.attachments!;
    const releaseA = service.acquire("a");
    expect(() => service.acquire("a")).toThrow();
    const releaseB = service.acquire("b"); expect(() => service.acquire("c")).toThrow();
    releaseA(); const releaseC = service.acquire("c"); releaseB(); releaseC();
    const newer = service.acquire("a"); releaseA();
    expect(() => service.acquire("a")).toThrow(); newer(); expect(service.acquire("a")).toBeTypeOf("function");
  });
  it("maskiert später bekannte Secrets auch in Status und Dateinamen, ohne opaque IDs zu ändern", async () => {
    const { session, client } = await browser();
    const response = await f.upload(client, session.id);
    const status = response.json(); client.manager.secrets.remember("test");
    const current = (await f.request(`/hermes/v2/attachments/uploads/${status.uploadId}`)).json();
    expect(current.attachment.id).toBe(status.attachment.id); expect(current.attachment.name).not.toContain("test");
    const download = await f.request(`/hermes/v2/attachments/${status.attachment.id}`);
    expect(download.headers["content-disposition"]).not.toContain("test");
  });
  it("abgelaufener Ready-Status liefert 404 statt eines widersprüchlichen ready/null-Resultats", async () => {
    const { session, client } = await browser(); const response = await f.upload(client, session.id); const status = response.json();
    f.pool.organization!.repo.run("UPDATE hermes_v2_attachments SET expires_at=? WHERE id=?", Date.now() - 1, status.attachment.id);
    const expired = await f.request(`/hermes/v2/attachments/uploads/${status.uploadId}`);
    expect(expired.statusCode).toBe(404); expect(expired.json()).toMatchObject({ code: "SESSION_NOT_FOUND", outcome: "not_sent" });
  });
});

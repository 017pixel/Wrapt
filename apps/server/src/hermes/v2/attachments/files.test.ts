import { mkdir, readFile, readdir, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "../phase6-test.fixture.js";
import { quoteReference } from "./files.js";

describe("native Dateireferenzen und Downloadidentität", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  async function ready() {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const response = await f.upload(browser, session.id);
    expect(response.statusCode, response.body).toBe(200);
    return { session, browser, id: response.json().attachment.id as string };
  }
  it.each(["symlink", "inode", "same-size"])("verwirft %s nach Ready bei Download und vor Submit", async (change) => {
    const { session, browser, id } = await ready(); const path = join(f.root, "attachments", `${id}.txt`);
    if (change === "symlink") {
      const target = join(f.root, "secret.txt"); await writeFile(target, "Dateiinhalt");
      await unlink(path); await symlink(target, path);
    }
    if (change === "inode") { const next = join(f.root, "next"); await writeFile(next, "Dateiinhalt"); await rename(next, path); }
    if (change === "same-size") await writeFile(path, "X".repeat(Buffer.byteLength("Dateiinhalt")));
    expect((await f.request(`/hermes/v2/attachments/${id}`)).statusCode).toBe(403);
    expect(await browser.run({ op: "message.submit", sessionId: session.id, text: "", attachmentIds: [id] })).toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "prompt.submit")).toBe(false);
  });
  it("ein symlinktes Stagingverzeichnis wird vor file.attach abgelehnt", async () => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    await mkdir(join(f.root, "other")); await symlink(join(f.root, "other"), join(f.root, "attachments"));
    expect((await f.upload(browser, session.id)).json()).toMatchObject({ outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "file.attach")).toBe(false);
  });
  it.each(["outside", "bytes", "reference"])("falsches natives %s nach Send bleibt unknown ohne Löschung/Pfadleck", async (change) => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id }); const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, value) => {
      const result = hook(method, params, value);
      if (method !== "file.attach") return result;
      const file = result as { path: string; ref_text: string };
      if (change === "outside") return { ...file, path: join(f.root, "outside", String(params.name)) };
      if (change === "reference") return { ...file, ref_text: "@file:/etc/passwd" };
      // Gleiche Länge mit anderem Inhalt muss trotzdem abgelehnt werden.
      writeFileSync(file.path, "X".repeat(Buffer.byteLength("Dateiinhalt")));
      return result;
    };
    const response = await f.upload(browser, session.id);
    expect(response.json()).toMatchObject({ outcome: "unknown" }); expect(response.body).not.toContain(f.root);
    expect(await readdir(join(f.root, "attachments"))).toHaveLength(1);
    const path = join(f.root, "attachments", (await readdir(join(f.root, "attachments")))[0]!);
    expect((await readFile(path)).toString()).toBe(change === "bytes" ? "X".repeat(Buffer.byteLength("Dateiinhalt")) : "Dateiinhalt");
  });
  it("zitiert absolute Referenzen im nativen Format und verweigert Steuerzeichen/unbelegbare Quotes", () => {
    expect(quoteReference("/path with space/file")).toBe("`/path with space/file`");
    expect(quoteReference("/path`with space/file")).toBe('"/path`with space/file"');
    expect(() => quoteReference("/path\nfile")).toThrow(); expect(() => quoteReference('/path`"\'file')).toThrow();
  });
});

import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awaitContextFixture, deferred } from "./await-context.fixture.js";

describe("M1-Nachsend: eingefrorene Anhangsbindung vor dem Rowbeleg", () => {
  let f: Awaited<ReturnType<typeof awaitContextFixture>>;
  const original = fs.lstat;
  beforeEach(async () => { f = await awaitContextFixture(); });
  afterEach(async () => { fs.lstat = original; syncBuiltinESMExports(); await f.close(); });
  async function ready() {
    const response = await f.upload(f.client, f.session.id, Buffer.from("Eigene Bytes"));
    expect(response.statusCode, response.body).toBe(200);
    const status = response.json();
    const file = f.service.store.byId("a", f.binding.scope.id, status.attachment.id);
    expect((await f.request(`/hermes/v2/attachments/${file.id}`)).body).toBe("Eigene Bytes");
    return file;
  }
  function associations(id: string) {
    return f.pool.organization!.repo.all<{ user_row: number }>(
      "SELECT user_row FROM hermes_v2_attachment_messages WHERE attachment_id=? ORDER BY user_row", id).map((row) => row.user_row);
  }
  it.each(["none", "partial-event", "other-profile", "unknown-profile", "home"] as const)(
    "Promptantwort nach Änderung %s bestätigt nur nachgewiesene Rowzuordnungen", async (change) => {
      const file = await ready();
      const hook = f.core.resultHook!;
      f.core.resultHook = (method, params, raw) => {
        const result = hook(method, params, raw);
        if (method === "prompt.submit") {
          if (change === "partial-event") f.core.event(f.session, "session.info", { title: "Partielle Info" });
          if (change === "other-profile") f.core.event(f.session, "session.info", { profile_name: "anderes-profil" });
          if (change === "unknown-profile") f.core.event(f.session, "session.info", { profile_name: null });
          if (change === "home") f.changeHome();
        }
        return result;
      };
      const result = await f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Lesen", attachmentIds: [file.id] });
      const stored = f.service.store.get("a", file.upload_id)!;
      const healthy = change === "none" || change === "partial-event";
      if (healthy) {
        expect(result).toMatchObject({ type: "result", op: "message.submit", data: { status: "streaming", userRowId: 1 } });
        expect(stored.user_row).toBe(1); expect(associations(file.id)).toEqual([1]);
        expect(f.client.manager.sessions.records.get(f.session.id)?.profileName).toBe("default");
      } else {
        expect(result).toMatchObject({ type: "error", outcome: "unknown" });
        expect(stored).toMatchObject({ user_row: null, revision: file.revision, expires_at: file.expires_at });
        expect(associations(file.id)).toEqual([]);
        expect(f.client.manager.sessions.records.get(f.session.id)?.snapshot.running).toBeNull();
      }
      expect(f.count("file.attach")).toBe(1); expect(f.count("prompt.submit")).toBe(1);
      const path = change === "home" ? file.path!.replace(f.home, f.saved) : file.path!;
      expect(await fs.readFile(path, "utf8")).toBe("Eigene Bytes");
    });
  it.each(["same-scope", "other-scope", "return-scope", "other-profile", "unknown-profile", "partial-event"] as const)(
    "Änderung %s während des echten HOME-Nachchecks wird vor SQL ausgewertet", async (change) => {
      const file = await ready(); const entered = deferred(); const release = deferred();
      const hook = f.core.resultHook!; let submitted = false; let held = false;
      f.core.resultHook = (method, params, raw) => {
        const result = hook(method, params, raw);
        if (method === "prompt.submit") submitted = true;
        return result;
      };
      fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
        const stat = await original(...args);
        if (submitted && String(args[0]) === f.home && !held) { held = true; entered.resolve(); await release.promise; }
        return stat;
      }) as typeof fs.lstat;
      syncBuiltinESMExports();
      const pending = f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Lesen", attachmentIds: [file.id] });
      try {
        await entered.promise;
        if (change === "same-scope") await f.selectHome(f.home);
        if (change === "other-scope" || change === "return-scope") await f.selectHome(f.other);
        if (change === "return-scope") await f.selectHome(f.home);
        if (change === "other-profile" || change === "unknown-profile") {
          const profile = change === "other-profile" ? "anderes-profil" : null;
          f.core.event(f.session, "session.info", { profile_name: profile });
          await expect.poll(() => f.client.manager.sessions.records.get(f.session.id)?.profileName).toBe(profile);
        }
        if (change === "partial-event") f.core.event(f.session, "session.info", { title: "Partielle Info" });
        release.resolve(); const result = await pending;
        const healthy = change === "same-scope" || change === "partial-event";
        expect(result).toMatchObject(healthy ? { type: "result", data: { userRowId: 1 } } : { type: "error", outcome: "unknown" });
        expect(f.service.store.get("a", file.upload_id)?.user_row).toBe(healthy ? 1 : null);
        expect(associations(file.id)).toEqual(healthy ? [1] : []);
        expect(f.count("file.attach")).toBe(1); expect(f.count("prompt.submit")).toBe(1);
        expect(await fs.readFile(file.path!, "utf8")).toBe("Eigene Bytes");
      } finally { release.resolve(); }
    });
  it("bestehender sicherer Rowbeleg bleibt bei späterem Kontextverlust erhalten", async () => {
    const file = await ready();
    expect(await f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Erstes Lesen", attachmentIds: [file.id] }))
      .toMatchObject({ type: "result", data: { userRowId: 1 } });
    const before = f.service.store.get("a", file.upload_id)!;
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => {
      const result = hook(method, params, raw);
      if (method === "prompt.submit") f.core.event(f.session, "session.info", { profile_name: null });
      return result;
    };
    expect(await f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Zweites Lesen", attachmentIds: [file.id] }))
      .toMatchObject({ type: "error", outcome: "unknown" });
    expect(f.service.store.get("a", file.upload_id)).toEqual(before); expect(associations(file.id)).toEqual([1]);
    expect(f.count("prompt.submit")).toBe(2); expect(f.count("file.attach")).toBe(1);
    expect(await fs.readFile(file.path!, "utf8")).toBe("Eigene Bytes");
  });
});

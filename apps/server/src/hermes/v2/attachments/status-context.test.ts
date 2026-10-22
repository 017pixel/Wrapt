import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awaitContextFixture, deferred } from "./await-context.fixture.js";

describe("L1: abschließender Scopevergleich im Anhangsstatus", () => {
  let f: Awaited<ReturnType<typeof awaitContextFixture>>;
  const original = fs.lstat;
  beforeEach(async () => { f = await awaitContextFixture(); });
  afterEach(async () => { fs.lstat = original; syncBuiltinESMExports(); await f.close(); });
  it.each(["none", "same", "other", "return"] as const)("echter HOME-lstat-Await mit Bestätigung %s", async (change) => {
    const uploaded = await f.upload(f.client, f.session.id);
    expect(uploaded.statusCode, uploaded.body).toBe(200);
    const status = uploaded.json(); const entered = deferred(); const release = deferred(); let held = false;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await original(...args);
      if (String(args[0]) === f.home && !held) { held = true; entered.resolve(); await release.promise; }
      return stat;
    }) as typeof fs.lstat;
    syncBuiltinESMExports();
    const pending = f.request(`/hermes/v2/attachments/uploads/${status.uploadId}`).then((value) => value);
    try {
      await entered.promise;
      if (change !== "none") await f.selectHome(change === "same" ? f.home : f.other);
      if (change === "return") await f.selectHome(f.home);
      release.resolve(); const response = await pending;
      if (change === "other" || change === "return") {
        expect(response.statusCode).toBe(409); expect(response.json()).toMatchObject({ code: "STALE_REQUEST" });
        expect(response.json().attachment).toBeUndefined();
      } else { expect(response.statusCode).toBe(200); expect(response.json()).toEqual(status); }
      expect(f.service.store.get("a", status.uploadId)?.scope).toBe(f.binding.scope.id);
      expect(f.count("file.attach")).toBe(1); expect(f.count("prompt.submit")).toBe(0);
    } finally { release.resolve(); }
  });
});

import fs from "node:fs/promises";
import { lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awaitContextFixture } from "./await-context.fixture.js";
import { associations, holdBoundary, readyFile, type Boundary, type Fixture } from "./context-boundaries.fixture.js";
import { requireAttachmentHome } from "./scope-check.js";

describe("P11-B2: gemeinsame physische HOME-Bindung", () => {
  let f: Fixture;
  beforeEach(async () => { f = await awaitContextFixture(); });
  afterEach(async () => { await f.close(); });
  function replace() {
    const before = lstatSync(f.home);
    renameSync(f.home, f.saved); mkdirSync(join(f.home, "attachments"), { recursive: true });
    expect(lstatSync(f.home).ino).not.toBe(before.ino);
  }
  function restore() { rmSync(f.home, { recursive: true }); renameSync(f.saved, f.home); }
  const phases: Boundary[] = ["capture", "stage-pre", "stage-post", "submit-pre", "submit-post"];
  for (const phase of phases) it.each(["healthy", "replacement", "capture-aba", "resource-aba", "home-check-aba"] as const)(
    `${phase}: %s`, async (change) => {
      const file = phase.startsWith("submit") ? await readyFile(f) : phase === "capture" ? undefined : f.reserve();
      const oldResource = await f.pool.resources!.context();
      const boundary = holdBoundary(f, phase, file?.path);
      const pending = (phase === "capture" ? f.service.capture("a", f.client.id, f.session.id)
        : phase.startsWith("stage") ? f.service.stage(f.binding, file!, Buffer.from("Eigene Grenzbytes"), new AbortController().signal)
        : f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Lesen", attachmentIds: [file!.id] }))
        .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
      try {
        await boundary.entered;
        const healthy = change === "healthy";
        if (!healthy) {
          replace();
          if (change === "capture-aba") await f.service.capture("a", f.client.id, f.session.id);
          if (change === "resource-aba") expect((await f.pool.resources!.context()).token).not.toBe(oldResource.token);
          if (change === "home-check-aba") await requireAttachmentHome(f.binding.scope);
          if (change.endsWith("aba")) restore();
        }
        boundary.release(); const result = await pending;
        const sent = phase.endsWith("post");
        if (phase.startsWith("submit")) {
          expect(result).toMatchObject({ ok: true, value: healthy ? { type: "result", data: { userRowId: 1 } }
            : { type: "error", outcome: sent ? "unknown" : "not_sent" } });
          expect(f.service.store.get("a", file!.upload_id)).toMatchObject(healthy ? { user_row: 1 } : file!);
          expect(associations(f, file!.id)).toEqual(healthy ? [1] : []);
          expect(f.count("prompt.submit")).toBe(healthy || sent ? 1 : 0); expect(f.count("file.attach")).toBe(1);
        } else {
          expect(result).toMatchObject(healthy ? { ok: true } : { ok: false, error: { code: "STALE_REQUEST",
            ...(phase === "capture" ? {} : { outcome: sent ? "unknown" : "not_sent" }) } });
          expect(f.count("file.attach")).toBe(phase === "capture" ? 0 : healthy || sent ? 1 : 0);
          expect(f.count("prompt.submit")).toBe(0);
          if (file) {
            expect(f.service.store.get("a", file.upload_id)?.state).toBe(healthy ? "ready" : sent ? "unknown" : "not_sent");
            expect(associations(f, file.id)).toEqual([]);
          }
        }
        if (file) {
          const originalHome = change === "replacement" ? f.saved : f.home;
          const files = await fs.readdir(join(originalHome, "attachments"));
          const hasFile = phase.startsWith("submit") || healthy || sent;
          expect(files).toHaveLength(hasFile ? 1 : 0);
          if (hasFile) expect(await fs.readFile(join(originalHome, "attachments", files[0]!), "utf8")).toBe("Eigene Grenzbytes");
          if (change === "replacement") expect(await fs.readdir(join(f.home, "attachments"))).toEqual([]);
        }
        if (healthy) { oldResource.assert(); expect((await f.pool.resources!.context()).token).toBe(oldResource.token); }
        else {
          expect(() => oldResource.assert()).toThrow();
          if (change === "replacement") restore();
          expect((await f.pool.resources!.context()).token).not.toBe(oldResource.token);
          expect(() => f.binding.assert()).toThrow();
        }
      } finally { boundary.release(); await pending; boundary.restore(); }
    });
  it("entwertet bei asynchron beobachtetem Ersatzstat trotz Rückkehr vor dem äußeren Assert", async () => {
    const original = fs.lstat; const row = f.reserve(); let observed = false;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      if (!observed && String(args[0]) === f.home) {
        observed = true; replace(); const replacement = await original(...args); restore(); return replacement;
      }
      return original(...args);
    }) as typeof fs.lstat;
    syncBuiltinESMExports();
    try {
      await expect(f.service.stage(f.binding, row, Buffer.from("Eigene Grenzbytes"), new AbortController().signal))
        .rejects.toMatchObject({ outcome: "not_sent" });
      expect(observed).toBe(true); expect(f.count("file.attach")).toBe(0);
      expect(f.service.store.get("a", row.upload_id)?.state).toBe("not_sent");
      expect(await fs.readdir(join(f.home, "attachments"))).toEqual([]);
      expect(() => f.binding.assert()).toThrow();
    } finally { fs.lstat = original; syncBuiltinESMExports(); }
  });
  it.each(["missing", "symlink"])("Ressourcenbeobachtung widerruft alte Attachments bei HOMEverlust: %s", async (change) => {
    const old = await f.pool.resources!.context();
    renameSync(f.home, f.saved);
    if (change === "symlink") await fs.symlink(f.other, f.home);
    await expect(old.current()).rejects.toMatchObject({ code: "STALE_RESOURCE_CONTEXT" });
    if (change === "symlink") await fs.unlink(f.home);
    renameSync(f.saved, f.home);
    expect(() => f.binding.assert()).toThrow();
    expect((await f.pool.resources!.context()).token).not.toBe(old.token);
    const fresh = await f.service.capture("a", f.client.id, f.session.id); fresh.assert();
    expect(f.count("file.attach")).toBe(0); expect(f.count("prompt.submit")).toBe(0);
  });
  it("erhält bestehende sichere Rowzuordnung bei späterem HOME-A-B-A nach Submit", async () => {
    const file = await readyFile(f);
    expect(await f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Erstes Lesen", attachmentIds: [file.id] }))
      .toMatchObject({ type: "result", data: { userRowId: 1 } });
    const before = f.service.store.get("a", file.upload_id)!;
    const boundary = holdBoundary(f, "submit-post", file.path);
    const pending = f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Zweites Lesen", attachmentIds: [file.id] });
    try {
      await boundary.entered; replace(); await f.pool.resources!.context(); restore();
      boundary.release(); expect(await pending).toMatchObject({ type: "error", outcome: "unknown" });
      expect(f.service.store.get("a", file.upload_id)).toEqual(before); expect(associations(f, file.id)).toEqual([1]);
      expect(f.count("prompt.submit")).toBe(2); expect(f.count("file.attach")).toBe(1);
      expect(await fs.readFile(file.path!, "utf8")).toBe("Eigene Grenzbytes");
    } finally { boundary.release(); await pending; boundary.restore(); }
  });
});

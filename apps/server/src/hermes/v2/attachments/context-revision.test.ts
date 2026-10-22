import fs from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awaitContextFixture } from "./await-context.fixture.js";
import { associations, holdBoundary, readyFile, type Boundary, type Fixture } from "./context-boundaries.fixture.js";

describe("P11-B1: monotone Anhangskontextrevision an echten Awaitgrenzen", () => {
  let f: Fixture;
  beforeEach(async () => { f = await awaitContextFixture(); });
  afterEach(async () => { await f.close(); });
  const phases: Boundary[] = ["capture", "stage-pre", "stage-post", "submit-pre", "submit-post"];
  const changes = ["healthy", "partial", "identical", "profile-aba", "cwd-aba"] as const;
  for (const phase of phases) it.each(changes)(`${phase}: %s`, async (change) => {
    const file = phase.startsWith("submit") ? await readyFile(f) : phase === "capture" ? undefined : f.reserve();
    const revision = f.binding.record.contextRevision ?? 0;
    const boundary = holdBoundary(f, phase, file?.path);
    const pending = (phase === "capture" ? f.service.capture("a", f.client.id, f.session.id)
      : phase.startsWith("stage") ? f.service.stage(f.binding, file!, Buffer.from("Eigene Grenzbytes"), new AbortController().signal)
      : f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Lesen", attachmentIds: [file!.id] }))
      .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
    try {
      await boundary.entered;
      const record = f.binding.record;
      if (change === "partial" || change === "identical") {
        f.core.event(f.session, "session.info", { title: "Kontrollereignis",
          ...(change === "identical" ? { profile_name: "default", cwd: f.cwd } : {}) });
        await expect.poll(() => record.snapshot.session.title).toBe("Kontrollereignis");
      }
      if (change === "profile-aba" || change === "cwd-aba") {
        const profile = change === "profile-aba";
        f.core.event(f.session, "session.info", profile ? { profile_name: "other" } : { cwd: f.other });
        await expect.poll(() => profile ? record.profileName : record.snapshot.session.cwd).toBe(profile ? "other" : f.other);
        f.core.event(f.session, "session.info", profile ? { profile_name: "default" } : { cwd: f.cwd });
        await expect.poll(() => profile ? record.profileName : record.snapshot.session.cwd).toBe(profile ? "default" : f.cwd);
      }
      const healthy = !change.endsWith("aba");
      expect(record.contextRevision ?? 0).toBe(revision + (healthy ? 0 : 2));
      boundary.release(); const result = await pending;
      const sent = phase.endsWith("post");
      if (phase.startsWith("submit")) {
        expect(result).toMatchObject({ ok: true, value: healthy ? { type: "result", data: { userRowId: 1 } }
          : { type: "error", outcome: sent ? "unknown" : "not_sent" } });
        expect(associations(f, file!.id)).toEqual(healthy ? [1] : []);
        const stored = f.service.store.get("a", file!.upload_id)!;
        expect(stored.user_row).toBe(healthy ? 1 : null);
        if (!healthy) expect(stored).toEqual(file);
        expect(f.count("prompt.submit")).toBe(healthy || sent ? 1 : 0);
        expect(f.count("file.attach")).toBe(1);
        expect(await fs.readFile(file!.path!, "utf8")).toBe("Eigene Grenzbytes");
      } else {
        expect(result).toMatchObject(healthy ? { ok: true } : { ok: false, error: { code: "STALE_REQUEST",
          ...(phase === "capture" ? {} : { outcome: sent ? "unknown" : "not_sent" }) } });
        expect(f.count("file.attach")).toBe(phase === "capture" ? 0 : healthy || sent ? 1 : 0);
        expect(f.count("prompt.submit")).toBe(0);
        if (file) {
          expect(f.service.store.get("a", file.upload_id)?.state).toBe(healthy ? "ready" : sent ? "unknown" : "not_sent");
          expect(associations(f, file.id)).toEqual([]);
          const files = await fs.readdir(join(f.home, "attachments"));
          expect(files).toHaveLength(healthy || sent ? 1 : 0);
          if (files.length) expect(await fs.readFile(join(f.home, "attachments", files[0]!), "utf8")).toBe("Eigene Grenzbytes");
        }
      }
    } finally { boundary.release(); await pending; boundary.restore(); }
  });
  it.each(["profile", "cwd"])("erhält einen früheren sicheren Rowbeleg nach späterem %s-A-B-A", async (change) => {
    const file = await readyFile(f);
    expect(await f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Erstes Lesen", attachmentIds: [file.id] }))
      .toMatchObject({ type: "result", data: { userRowId: 1 } });
    const before = f.service.store.get("a", file.upload_id)!;
    const boundary = holdBoundary(f, "submit-post", file.path);
    const pending = f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Zweites Lesen", attachmentIds: [file.id] });
    try {
      await boundary.entered;
      const profile = change === "profile"; const record = f.binding.record;
      f.core.event(f.session, "session.info", profile ? { profile_name: "other" } : { cwd: f.other });
      await expect.poll(() => profile ? record.profileName : record.snapshot.session.cwd).toBe(profile ? "other" : f.other);
      f.core.event(f.session, "session.info", profile ? { profile_name: "default" } : { cwd: f.cwd });
      await expect.poll(() => profile ? record.profileName : record.snapshot.session.cwd).toBe(profile ? "default" : f.cwd);
      boundary.release(); expect(await pending).toMatchObject({ type: "error", outcome: "unknown" });
      expect(f.service.store.get("a", file.upload_id)).toEqual(before); expect(associations(f, file.id)).toEqual([1]);
      expect(f.count("prompt.submit")).toBe(2); expect(f.count("file.attach")).toBe(1);
      expect(await fs.readFile(file.path!, "utf8")).toBe("Eigene Grenzbytes");
    } finally { boundary.release(); await pending; boundary.restore(); }
  });
});

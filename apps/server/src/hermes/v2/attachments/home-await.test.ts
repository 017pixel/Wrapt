import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awaitContextFixture, deferred } from "./await-context.fixture.js";

describe("R2-M1B: HOME nach der letzten zusätzlichen Staging-FS-Grenze", () => {
  let f: Awaited<ReturnType<typeof awaitContextFixture>>;
  const original = fs.lstat;
  beforeEach(async () => { f = await awaitContextFixture(); });
  afterEach(async () => { fs.lstat = original; syncBuiltinESMExports(); await f.close(); });
  it.each([false, true])("letzte echte CWD-lstat-Antwort verzögert, HOME-Wechsel=%s", async (changed) => {
    const homeChecked = deferred(); let delayed = false;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await original(...args);
      if (String(args[0]) === join(f.home, "attachments")) homeChecked.resolve();
      if (String(args[0]) === join(f.cwd, ".hermes", "attachments") && !delayed) {
        delayed = true; await homeChecked.promise;
        if (changed) f.changeHome();
      }
      return stat;
    }) as typeof fs.lstat;
    syncBuiltinESMExports();
    const row = f.reserve();
    const pending = f.service.stage(f.binding, row, Buffer.from("Eigene Bytes"), new AbortController().signal);
    if (changed) {
      await expect(pending).rejects.toMatchObject({ outcome: "not_sent" });
      expect(f.count("file.attach")).toBe(0); expect(await fs.readdir(f.other)).toEqual([]);
      expect(await fs.readdir(join(f.saved, "attachments"))).toEqual([]);
      expect(f.service.store.get("a", row.upload_id)?.state).toBe("not_sent");
    } else {
      expect(await pending).toMatchObject({ state: "ready" }); expect(f.count("file.attach")).toBe(1);
      expect(await fs.readdir(join(f.home, "attachments"))).toHaveLength(1);
    }
    expect(delayed).toBe(true);
  });
});

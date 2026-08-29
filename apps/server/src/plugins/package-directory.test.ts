import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { replacePackageDirectory } from "./package-directory.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("staged Package-Verzeichnisse", () => {
  it("behält den vorherigen Release, wenn das Staging nach Teilwrites scheitert", async () => {
    const root = await mkdtemp(join(tmpdir(), "package-directory-failure-"));
    roots.push(root);
    const target = join(root, "plugin");
    await mkdir(target);
    await writeFile(join(target, "plugin.json"), "alt\n");

    await expect(replacePackageDirectory(target, async (staging) => {
      await writeFile(join(staging, "plugin.json"), "neu\n");
      await writeFile(join(staging, "partial.txt"), "teilweise\n");
      throw new Error("simulierter Diskfehler");
    })).rejects.toThrow("simulierter Diskfehler");

    await expect(readFile(join(target, "plugin.json"), "utf8")).resolves.toBe("alt\n");
    await expect(readFile(join(target, "partial.txt"))).rejects.toThrow();
    await expect(readdir(root)).resolves.toEqual(["plugin"]);
  });

  it("tauscht einen vollständigen neuen Release atomar und entfernt den alten Backuprest", async () => {
    const root = await mkdtemp(join(tmpdir(), "package-directory-success-"));
    roots.push(root);
    const target = join(root, "plugin");
    await mkdir(target);
    await writeFile(join(target, "obsolete.txt"), "alt\n");

    await replacePackageDirectory(target, async (staging) => {
      await writeFile(join(staging, "plugin.json"), "neu\n");
      await writeFile(join(staging, "new.txt"), "neu\n");
    });

    await expect(readFile(join(target, "plugin.json"), "utf8")).resolves.toBe("neu\n");
    await expect(readFile(join(target, "obsolete.txt"))).rejects.toThrow();
    await expect(access(join(target, "new.txt"))).resolves.toBeUndefined();
    expect((await readdir(root)).filter((name) => name.includes(".previous-") || name.includes(".tmp-")).length).toBe(0);
  });
});

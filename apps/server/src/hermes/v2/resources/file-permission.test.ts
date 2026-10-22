import fs from "node:fs/promises";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";

const open = fs.open;
describe("Ressourcendatei mit fehlender Leseberechtigung", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); });
  afterEach(async () => { fs.open = open; syncBuiltinESMExports(); await f.close(); });
  it("meldet die echte stabile 000-Datei unreadable", async () => {
    const path = join(f.root, "memories/MEMORY.md"); await fs.writeFile(path, "Privater Inhalt", { mode: 0o000 });
    try {
      const response = await f.request("GET", "/memory"); expect(response.statusCode).toBe(200);
      expect(response.json().files[0]).toMatchObject({ status: "unreadable", text: null, bytes: null, truncated: false });
      expect(response.body).not.toContain("Privater Inhalt");
    } finally { await fs.chmod(path, 0o600); }
  });
  it.each(["replace", "symlink", "missing"])("behält einen Identitätsverlust beim Openfehler unknown: %s", async (change) => {
    const path = join(f.root, "memories/MEMORY.md"); await fs.writeFile(path, "Vorher"); let observed = false;
    fs.open = (async (...args: Parameters<typeof fs.open>) => {
      if (!observed && String(args[0]) === path) {
        observed = true; await fs.rename(path, `${path}.saved`);
        if (change === "replace") await fs.writeFile(path, "Nachher");
        if (change === "symlink") await fs.symlink(`${path}.saved`, path);
        throw Object.assign(new Error("Keine Berechtigung"), { code: "EACCES" });
      }
      return open(...args);
    }) as typeof fs.open; syncBuiltinESMExports();
    const response = await f.request("GET", "/memory"); expect(response.statusCode).toBe(200); expect(observed).toBe(true);
    expect(response.json().files[0]).toMatchObject({ status: "unknown", text: null });
    expect(response.body).not.toContain("Vorher"); expect(response.body).not.toContain("Nachher");
  });
});

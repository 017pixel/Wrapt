import { accessSync, chmodSync, constants, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureMacPtySpawnHelperExecutable } from "./NodePtyAdapter.js";

describe("node-pty unter macOS", () => {
  it("ergänzt das Ausführungsbit des passenden Hilfsprogramms", () => {
    const root = mkdtempSync(join(tmpdir(), "wrapt-node-pty-"));
    const native = join(root, "prebuilds", "darwin-arm64");
    mkdirSync(native, { recursive: true });
    writeFileSync(join(native, "pty.node"), "native");
    const helper = join(native, "spawn-helper");
    writeFileSync(helper, "helper");
    chmodSync(helper, 0o600);
    try {
      ensureMacPtySpawnHelperExecutable("darwin", root, "arm64");
      expect(() => accessSync(helper, constants.X_OK)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ändert den Dateimodus auf Linux nicht", () => {
    const root = mkdtempSync(join(tmpdir(), "wrapt-node-pty-linux-"));
    const native = join(root, "prebuilds", "darwin-arm64");
    mkdirSync(native, { recursive: true });
    writeFileSync(join(native, "pty.node"), "native");
    const helper = join(native, "spawn-helper");
    writeFileSync(helper, "helper");
    chmodSync(helper, 0o600);
    try {
      ensureMacPtySpawnHelperExecutable("linux", root, "arm64");
      expect(statSync(helper).mode & 0o111).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

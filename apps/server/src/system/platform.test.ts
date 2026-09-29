import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTmuxExecutable, supportsSystemd } from "./platform.js";

describe("Plattformdienste", () => {
  it("verwendet systemd ausschließlich auf Linux", () => {
    expect(supportsSystemd("linux")).toBe(true);
    expect(supportsSystemd("darwin")).toBe(false);
    expect(supportsSystemd("win32")).toBe(false);
  });

  it("findet tmux auf macOS über PATH, wenn der konfigurierte Linux-Pfad fehlt", () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-tmux-path-"));
    const executable = join(directory, "tmux");
    writeFileSync(executable, "#!/bin/sh\nexit 0\n");
    chmodSync(executable, 0o755);
    try {
      expect(resolveTmuxExecutable("/usr/bin/tmux", "darwin", directory)).toBe(executable);
      expect(resolveTmuxExecutable("/usr/bin/tmux", "linux", directory)).toBe("/usr/bin/tmux");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

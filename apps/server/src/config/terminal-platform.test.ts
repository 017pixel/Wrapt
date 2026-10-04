import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wraptConfigSchema } from "./wrapt-config.js";
import { profileHomesFromEnvironment } from "./settings-helpers.js";

describe("Terminalkonfiguration auf allen Plattformen", () => {
  it("liest eine Windows-Konfiguration mit Laufwerkspfaden und konfigurierbarer Shell", () => {
    const source = readFileSync(new URL("../../../../config/wrapt.example.json", import.meta.url), "utf8");
    const raw = JSON.parse(source.replaceAll("/home/your-user", "C:/Users/test").replaceAll("/usr/bin/tmux", "C:/Tools/tmux.exe")) as Record<string, unknown>;
    raw.terminal = { shell: { file: "C:/Programme/PowerShell/7/pwsh.exe", args: ["-NoLogo"] } };
    const config = wraptConfigSchema.parse(raw);
    expect(config.system.homeDirectory).toBe("C:/Users/test");
    expect(config.paths.terminalDefaultCwd).toBe("C:/Users/test");
    expect(config.terminal.shell).toEqual({ file: "C:/Programme/PowerShell/7/pwsh.exe", args: ["-NoLogo"] });
    expect(config.hermes.proxyPrefix).toBe("/hermes");
  });
  it("erhält POSIX-Defaults und liest Windows-Laufwerke sowie UNC-Roots", () => {
    const source = JSON.parse(readFileSync(new URL("../../../../config/wrapt.example.json", import.meta.url), "utf8")) as unknown;
    expect(wraptConfigSchema.parse(source).terminal.shell).toEqual({});
    expect(profileHomesFromEnvironment.parse("C:\\Users\\test,D:/Arbeit,\\\\server\\share")).toEqual(["C:\\Users\\test", "D:/Arbeit", "\\\\server\\share"]);
    expect(profileHomesFromEnvironment.safeParse("C:relativ").success).toBe(false);
  });
});

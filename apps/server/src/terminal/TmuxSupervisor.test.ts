import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { defaultTerminalSocketPath, terminalSupervisorStartArgs, TmuxSupervisor } from "./TmuxSupervisor.js";

const executable = "tmux";
const tmuxAvailable = spawnSync(executable, ["-V"], { stdio: "ignore", timeout: 3_000 }).status === 0;
const created: string[] = [];

describe("Tmux-Supervisor-Plattformpfade", () => {
  it("verwendet XDG_RUNTIME_DIR oder fällt in das konfigurierte Datenverzeichnis zurück", () => {
    expect(defaultTerminalSocketPath("/var/lib/wrapt", "/run/user/501")).toBe("/run/user/501/wrapt/tmux.sock");
    expect(defaultTerminalSocketPath("/Users/test/Library/Application Support/Wrapt", "", "darwin")).toBe(
      join("/Users/test/Library/Application Support/Wrapt", "run", "tmux.sock"),
    );
    const linuxRuntime = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? process.env.UID ?? "1000"}`;
    expect(defaultTerminalSocketPath("/var/lib/wrapt", process.env.XDG_RUNTIME_DIR, "linux")).toBe(`${linuxRuntime}/wrapt/tmux.sock`);
  });

  it("startet die gleiche benannte tmux-Sitzung wie die Linux-Unit", () => {
    expect(terminalSupervisorStartArgs("/Users/test/wrapt/run/tmux.sock")).toEqual([
      "-S", "/Users/test/wrapt/run/tmux.sock", "new-session", "-d", "-s", "wrapt-supervisor",
    ]);
  });
});

afterEach(() => {
  if (!tmuxAvailable) return;
  const supervisor = new TmuxSupervisor(executable);
  for (const name of created.splice(0)) supervisor.terminate(name);
});

describe.skipIf(!tmuxAvailable)("TmuxSupervisor", () => {
  it("imports legacy workbench metadata without changing new session names", () => {
    const supervisor = new TmuxSupervisor(executable);
    const name = `workbench-${randomUUID().replaceAll("-", "")}`;
    const runtimeId = randomUUID();
    const createdSession = spawnSync(executable, ["new-session", "-d", "-s", name, "-c", "/tmp", "sleep 20"], { encoding: "utf8", timeout: 3_000 });
    expect(createdSession.status).toBe(0);
    created.push(name);
    for (const [key, value] of [["@workbench_runtime_id", runtimeId], ["@workbench_kind", "shell"], ["@workbench_project_id", "legacy-project"]] as const) {
      const result = spawnSync(executable, ["set-option", "-t", name, key, value], { encoding: "utf8", timeout: 3_000 });
      expect(result.status).toBe(0);
    }
    expect(supervisor.list()).toContainEqual(expect.objectContaining({
      name,
      runtimeId,
      kind: "shell",
      projectId: "legacy-project",
      managed: true,
    }));
  });

  it("keeps a managed shell alive and discovers its metadata", async () => {
    const supervisor = new TmuxSupervisor(executable);
    const runtimeId = randomUUID();
    const name = supervisor.ensure({
      runtimeId,
      kind: "shell",
      projectId: "test-project",
      cwd: "/tmp",
      command: {
        file: "/bin/bash",
        args: ["--noprofile", "--norc", "-c", "printf 'workbench-tmux-ready\\n'; exec sleep 20"],
        environment: { TERM: "xterm-256color", PATH: "/usr/bin:/bin" },
      },
    });
    created.push(name);
    expect(supervisor.has(name)).toBe(true);
    await vi.waitFor(() => expect(supervisor.capture(name)).toContain("workbench-tmux-ready"));
    expect(supervisor.currentPath(name)).toBe(realpathSync("/tmp"));
    expect(supervisor.isAlternate(name)).toBe(false);
    expect(supervisor.list()).toContainEqual(expect.objectContaining({
      name,
      runtimeId,
      kind: "shell",
      projectId: "test-project",
      managed: true,
    }));

    supervisor.respawn(name, "/tmp", {
      file: "/bin/bash",
      args: ["--noprofile", "--norc", "-c", "printf 'workbench-tmux-respawned\\n'; exec sleep 20"],
      environment: { TERM: "xterm-256color", PATH: "/usr/bin:/bin" },
    });
    await vi.waitFor(() => expect(supervisor.capture(name)).toContain("workbench-tmux-respawned"));
    expect(supervisor.currentPath(name)).toBe(realpathSync("/tmp"));
    expect(supervisor.isAlternate(name)).toBe(false);
    expect(() => supervisor.sendLastCommandHint(name)).not.toThrow();

    // Maus muss pro Session aktiviert sein, damit Apps mit Maus-Reporting
    // (z. B. OpenCode) Mausrad-Scrollen durchgereicht bekommen.
    const options = spawnSync(executable, ["show-options", "-t", name, "mouse"], { encoding: "utf8", timeout: 3_000 });
    expect(options.status).toBe(0);
    expect(options.stdout).toContain("on");

    // tmux bleibt unsichtbar: keine Statusleiste, keine störenden Meldungsfarben.
    const status = spawnSync(executable, ["show-options", "-t", name, "status"], { encoding: "utf8", timeout: 3_000 });
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("off");

    // Der Client bleibt im normalen Puffer, damit xterm den Scrollback behält
    // und das Mausrad direkt scrollen kann.
    const alternate = spawnSync(executable, ["show-options", "-t", name, "alternate-screen"], { encoding: "utf8", timeout: 3_000 });
    expect(alternate.status).toBe(0);
    expect(alternate.stdout).toContain("off");
  });
});

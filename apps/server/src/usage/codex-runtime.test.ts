import { describe, expect, it, vi } from "vitest";
import { isCodexAppServerProcess, restartCodexRuntimeForAccountSwitch, type CodexRuntimeProcess } from "./codex-runtime.js";

function processEntry(pid: number, ppid: number, argv: string[], pgid = pid): CodexRuntimeProcess {
  return { pid, ppid, pgid, argv };
}

const runningCodex = [
  processEntry(100, 1, ["node", "/opt/codex", "app-server"]),
  processEntry(101, 100, ["/opt/codex", "app-server"]),
];

const noCodex = [processEntry(200, 1, ["node", "/srv/t3", "serve"])];

describe("isCodexAppServerProcess", () => {
  it("erkennt den Node-Wrapper und die Binärform", () => {
    expect(isCodexAppServerProcess(["node", "/home/bbecker/.npm-global/bin/codex", "app-server"])).toBe(true);
    expect(isCodexAppServerProcess(["/opt/codex/bin/codex", "app-server"])).toBe(true);
    expect(isCodexAppServerProcess(["codex", "app-server", "--flag"])).toBe(true);
  });

  it("ignoriert interaktive Sitzungen und fremde Prozesse", () => {
    expect(isCodexAppServerProcess(["codex"])).toBe(false);
    expect(isCodexAppServerProcess(["node", "/home/bbecker/.npm-global/bin/codex", "exec", "app-server"])).toBe(false);
    expect(isCodexAppServerProcess(["node", "/opt/other/server.js", "app-server"])).toBe(false);
    expect(isCodexAppServerProcess(["/opt/codex/bin/codex-code-mode-host"])).toBe(false);
  });
});

describe("restartCodexRuntimeForAccountSwitch", () => {
  it("lässt T3 unberührt, wenn kein Codex-App-Server läuft", async () => {
    const restartService = vi.fn();
    const outcome = await restartCodexRuntimeForAccountSwitch({
      serviceUnit: "t3-code.service",
      host: "127.0.0.1",
      port: 3773,
      listProcesses: async () => noCodex,
      restartService,
    });

    expect(outcome).toEqual({ runtimeFound: false, serviceRestarted: false, reachable: true });
    expect(restartService).not.toHaveBeenCalled();
  });

  it("startet den T3-Dienst neu und wartet auf Erreichbarkeit", async () => {
    const restartService = vi.fn(async () => undefined);
    const probeReachable = vi.fn(async () => true);
    const outcome = await restartCodexRuntimeForAccountSwitch({
      serviceUnit: "t3-code.service",
      host: "127.0.0.1",
      port: 3773,
      listProcesses: async () => runningCodex,
      restartService,
      probeReachable,
    });

    expect(outcome).toEqual({ runtimeFound: true, serviceRestarted: true, reachable: true });
    expect(restartService).toHaveBeenCalledWith("t3-code.service");
    expect(probeReachable).toHaveBeenCalledWith("http://127.0.0.1:3773/");
  });

  it("meldet einen fehlgeschlagenen Dienstneustart, ohne zu werfen", async () => {
    const probeReachable = vi.fn(async () => true);
    const outcome = await restartCodexRuntimeForAccountSwitch({
      serviceUnit: "t3-code.service",
      host: "127.0.0.1",
      port: 3773,
      listProcesses: async () => runningCodex,
      restartService: async () => { throw new Error("unit not found"); },
      probeReachable,
    });

    expect(outcome).toEqual({ runtimeFound: true, serviceRestarted: false, reachable: false });
    expect(probeReachable).not.toHaveBeenCalled();
  });

  it("wartet begrenzt auf die Erreichbarkeit von T3", async () => {
    const outcome = await restartCodexRuntimeForAccountSwitch({
      serviceUnit: "t3-code.service",
      host: "127.0.0.1",
      port: 3773,
      healthTimeoutMilliseconds: 0,
      listProcesses: async () => runningCodex,
      restartService: async () => undefined,
      probeReachable: async () => false,
    });

    expect(outcome).toEqual({ runtimeFound: true, serviceRestarted: true, reachable: false });
  });
});

import { describe, expect, it } from "vitest";
import { createLocalPortService, isAllowedProjectPort, isProjectSocket, listeningSocketCommand, parseLsofCurrentDirectory, parseLsofListeningSockets, parseListeningSockets, processCwdCommand } from "./localPortService.js";

describe("local port discovery", () => {
  it("deduplicates IPv4 and IPv6 listeners and keeps process names", () => {
    const sockets = parseListeningSockets([
      'LISTEN 0 4096 0.0.0.0:7000 0.0.0.0:*',
      'LISTEN 0 511 127.0.0.1:3010 0.0.0.0:* users:(("node",pid=123,fd=4))',
      'LISTEN 0 4096 [::]:7000 [::]:*',
    ].join("\n"));
    expect(sockets).toEqual([
      { address: "127.0.0.1", port: 3010, process: "node", pid: 123 },
      { address: "0.0.0.0", port: 7000, process: null, pid: null },
    ]);
  });

  it("keeps project dev servers and drops system services", () => {
    const sockets = parseListeningSockets([
      'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=1,fd=4))',
      'LISTEN 0 4096 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=2,fd=3))',
      'LISTEN 0 4096 127.0.0.53:53 0.0.0.0:* users:(("systemd-resolve",pid=3,fd=5))',
      'LISTEN 0 10 127.0.0.1:34275 0.0.0.0:* users:(("chrome",pid=4,fd=76))',
      'LISTEN 0 16 127.0.0.1:18181 0.0.0.0:* users:(("codexbar",pid=5,fd=6))',
      'LISTEN 0 4096 0.0.0.0:54321 0.0.0.0:*',
    ].join("\n"));
    expect(sockets.filter((socket) => isProjectSocket(socket)).map((socket) => socket.port)).toEqual([5_173, 54_321]);
  });

  it("beschränkt den Testscan auf die freigegebenen Ports", () => {
    const allowed = new Set([3_380, 3_381]);
    expect(isAllowedProjectPort(3_380, allowed)).toBe(true);
    expect(isAllowedProjectPort(3_010, allowed)).toBe(false);
    expect(isAllowedProjectPort(3_010)).toBe(true);
  });

  it("liest Listener und Arbeitsverzeichnisse aus der macOS-lsof-Ausgabe", () => {
    const sockets = parseLsofListeningSockets([
      "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME",
      "python3 5678 benutzer 5u IPv4 0x125 0t0 TCP *:8000 (LISTEN)",
      "node 1234 benutzer 21u IPv4 0x123 0t0 TCP 127.0.0.1:5173 (LISTEN)",
      "node 1234 benutzer 22u IPv6 0x124 0t0 TCP [::1]:5173 (LISTEN)",
    ].join("\n"));
    expect(sockets).toEqual([
      { address: "127.0.0.1", port: 5173, process: "node", pid: 1234 },
      { address: "*", port: 8000, process: "python3", pid: 5678 },
    ]);
    expect(parseLsofCurrentDirectory("p1234\nfcwd\nn/Users/benutzer/Projekte/app\n")).toBe("/Users/benutzer/Projekte/app");
    expect(parseLsofCurrentDirectory("p1234\nfcwd\n")).toBeNull();
  });

  it("wählt lsof auf macOS und behält ss sowie /proc auf Linux", () => {
    expect(listeningSocketCommand("darwin")).toEqual({ file: "lsof", args: ["-nP", "-iTCP", "-sTCP:LISTEN"] });
    expect(processCwdCommand("darwin", 1234)).toEqual({ file: "lsof", args: ["-p", "1234", "-a", "-d", "cwd", "-Fn"] });
    expect(listeningSocketCommand("linux")).toEqual({ file: "ss", args: ["-H", "-ltnp"] });
    expect(processCwdCommand("linux", 1234)).toBeNull();
  });

  it("behandelt fehlendes lsof, fehlende Treffer und Rechtefehler als leere Liste", async () => {
    for (const commandRunner of [
      async () => ({ exitCode: 1, stdout: "" }),
      async () => { throw new Error("lsof: Operation not permitted"); },
    ]) {
      const service = createLocalPortService({
        cacheMilliseconds: 0,
        probeTimeoutMilliseconds: 100,
        platform: "darwin",
        commandRunner,
        projects: async () => [],
      });
      await expect(service.list()).resolves.toMatchObject({ ports: [] });
    }
  });
});

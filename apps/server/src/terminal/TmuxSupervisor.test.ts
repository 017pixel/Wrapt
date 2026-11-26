import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTerminalSocketPath, TERMINAL_SUPERVISOR_UNIT, terminalSupervisorStartArgs, TmuxSupervisor, type TmuxCommandResult } from "./TmuxSupervisor.js";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const ok = (stdout = ""): TmuxCommandResult => ({ status: 0, stdout, stderr: "" });
const noServer = (): TmuxCommandResult => ({ status: 1, stdout: "", stderr: "no server running on /tmp/tmux.sock" });

interface FakeSession {
  cwd: string;
  options: Record<string, string>;
  alternate: boolean;
  dead: boolean;
  exitCode: number | null;
  exitSignal: number | null;
  respawns: number;
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-fake-supervisor-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const sessions = new Map<string, FakeSession>();
  const calls: string[][] = [];
  const state = { serverAvailable: true, scanStatus: 0, scanStderr: "", scanStdout: undefined as string | undefined };
  const runner = (raw: string[]): TmuxCommandResult => {
    calls.push(raw);
    const args = raw.slice(2);
    const name = args[args.indexOf("-t") + 1] ?? "";
    if (args[0] === "list-sessions") return state.serverAvailable ? ok() : noServer();
    if (args[0] === "has-session") return sessions.has(name) ? ok() : { status: 1, stdout: "", stderr: "can't find session" };
    if (args[0] === "new-session") sessions.set(args[3]!, { cwd: args[5]!, options: {}, alternate: false, dead: false, exitCode: null, exitSignal: null, respawns: 0 });
    if (args[0] === "respawn-pane") {
      const session = sessions.get(name);
      if (session) { session.cwd = args[5]!; session.dead = false; session.exitCode = null; session.exitSignal = null; session.respawns += 1; }
    }
    if (args[0] === "set-option") {
      for (let offset = 0; offset < args.length; offset += 6) {
        const session = sessions.get(args[offset + 2]!);
        if (session) session.options[args[offset + 3]!] = args[offset + 4]!;
      }
    }
    if (args[0] === "display-message") return ok(args.at(-1) === "#{alternate_on}" ? (sessions.get(name)?.alternate ? "1" : "0") : sessions.get(name)?.cwd ?? "");
    if (args[0] === "capture-pane") return ok("Bereit\n");
    if (args[0] === "kill-session") sessions.delete(name);
    if (args[0] === "list-panes") {
      if (state.scanStdout !== undefined) return ok(state.scanStdout);
      if (state.scanStatus !== 0) return { status: state.scanStatus, stdout: "", stderr: state.scanStderr };
      return ok([...sessions].map(([sessionName, session]) => [
        sessionName, "1700000000", session.cwd, "bash", "bash", session.options["@wrapt_runtime_id"] ?? "", session.options["@workbench_runtime_id"] ?? "",
        session.options["@wrapt_kind"] ?? "", session.options["@workbench_kind"] ?? "", session.options["@wrapt_project_id"] ?? "", session.options["@workbench_project_id"] ?? "",
        session.dead ? "1" : "0", session.dead && session.exitCode !== null ? String(session.exitCode) : "",
        session.dead && session.exitSignal !== null ? String(session.exitSignal) : "",
      ].join("\t")).join("\n"));
    }
    return ok();
  };
  const socket = join(directory, "tmux.sock");
  const supervisor = new TmuxSupervisor("/fake/tmux", socket, runner);
  cleanup.push(() => supervisor.close());
  return { supervisor, sessions, calls, socket, state };
}

async function recoveryFixture(active = false) {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-fake-recovery-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const socket = join(directory, "eigener-runtime", "tmux.sock");
  const tmuxCalls: string[][] = [];
  const systemctlCalls: string[][] = [];
  const events: string[] = [];
  const control = { available: false, showError: false, startError: false };
  const runner = (raw: string[]): TmuxCommandResult => {
    tmuxCalls.push(raw);
    events.push(`tmux:${raw[2] ?? ""}`);
    if (raw[2] === "list-sessions") return control.available ? ok() : noServer();
    if (raw[2] === "list-panes") return control.available ? ok() : noServer();
    return ok();
  };
  const systemdRunner = (args: string[]): TmuxCommandResult => {
    systemctlCalls.push(args);
    events.push(`systemctl:${args.includes("show") ? "show" : args.includes("restart") ? "restart" : args.includes("start") ? "start" : "other"}`);
    if (args.includes("show")) {
      if (control.showError) throw new Error("systemd nicht erreichbar");
      return ok(active ? "ActiveState=active\nSubState=exited" : "ActiveState=inactive\nSubState=dead");
    }
    if (control.startError) return { status: 1, stdout: "", stderr: "start fehlgeschlagen" };
    control.available = true;
    return ok();
  };
  const supervisor = new TmuxSupervisor("/fake/tmux", socket, runner, systemdRunner);
  cleanup.push(() => supervisor.close());
  return { supervisor, socket, tmuxCalls, systemctlCalls, events, control, directory };
}

describe("Tmux-Supervisor-Plattformpfade", () => {
  it("verwendet XDG_RUNTIME_DIR oder das konfigurierte Datenverzeichnis", () => {
    expect(defaultTerminalSocketPath("/var/lib/wrapt", "/run/user/501")).toBe("/run/user/501/wrapt/tmux.sock");
    expect(defaultTerminalSocketPath("/Users/test/Wrapt", "", "darwin")).toBe(join("/Users/test/Wrapt", "run", "tmux.sock"));
    expect(defaultTerminalSocketPath("/var/lib/wrapt", "", "linux")).toBe(`/run/user/${process.getuid?.() ?? process.env.UID ?? "1000"}/wrapt/tmux.sock`);
  });
  it("startet dieselbe benannte Sitzung wie die Linux-Unit", () => {
    expect(terminalSupervisorStartArgs("/tmp/eigener.sock")).toEqual(["-S", "/tmp/eigener.sock", "new-session", "-d", "-s", "wrapt-supervisor"]);
  });
});

const input = { runtimeId: "runtime-a", kind: "shell" as const, projectId: "projekt", cwd: "/tmp",
  command: { file: "/bin/bash", args: ["-l"], environment: { TERM: "xterm-256color" } } };
const metadata = { runtimeId: "runtime-b", kind: "codex" as const, projectId: "projekt-b" };

it("serialisiert Sessionmutationen und terminiert idempotent", async () => {
  const { supervisor, sessions, calls, socket } = await fixture();
  const results = await Promise.all(Array.from({ length: 3 }, () => supervisor.ensureWithStatus(input)));
  expect(new Set(results.map((result) => result.name)).size).toBe(1);
  expect(results.filter((result) => result.created)).toHaveLength(1);
  expect(calls.filter((args) => args[2] === "new-session")).toHaveLength(1);
  expect(calls.every((args) => args[0] === "-S" && args[1] === socket)).toBe(true);
  expect(sessions.get(results[0]!.name)?.options).toMatchObject({ "@wrapt_runtime_id": "runtime-a", mouse: "off", "alternate-screen": "off", status: "off" });
  const name = results[0]!.name;
  await supervisor.respawn(name, "/tmp", input.command);
  await supervisor.sendLastCommandHint(name);
  await supervisor.terminate(name);
  await supervisor.terminate(name);
  expect(await supervisor.has(name)).toBe(false);
  expect(calls.filter((args) => args[2] === "kill-session")).toHaveLength(1);
});

it("importiert alte Metadaten und behält gespeicherte Namen", async () => {
  const { supervisor, sessions } = await fixture();
  sessions.set("workbench-alt", { cwd: "/tmp", alternate: false, dead: false, exitCode: null, exitSignal: null, respawns: 0, options: { "@workbench_runtime_id": "legacy", "@workbench_kind": "codex", "@workbench_project_id": "alt" } });
  expect(await supervisor.list()).toContainEqual(expect.objectContaining({ name: "workbench-alt", runtimeId: "legacy", kind: "codex", projectId: "alt", managed: true, dead: false, exitCode: null, exitSignal: null }));
  expect(await supervisor.ensure({ ...input, supervisorName: "workbench-alt" })).toBe("workbench-alt");
  expect(sessions.size).toBe(1);
});

it("erhält normale und Alternate-Screen-Captureflags sowie den Attachsocket", async () => {
  const { supervisor, sessions, calls, socket } = await fixture();
  const name = await supervisor.ensure(input);
  expect(await supervisor.currentPath(name)).toBe("/tmp");
  expect(await supervisor.capture(name)).toBe("Bereit\n");
  expect(calls.at(-1)).toEqual(["-S", socket, "capture-pane", "-p", "-e", "-J", "-S", "-10000", "-t", name]);
  sessions.get(name)!.alternate = true;
  expect(await supervisor.capture(name)).toBe("Bereit\n");
  expect(calls.at(-1)).not.toContain("-J");
  expect(supervisor.attachCommand(name).args.slice(0, 2)).toEqual(["-S", socket]);
});

it("unterscheidet leeren Server, fehlenden Server und Scanfehler", async () => {
  const { supervisor, state } = await fixture();
  state.scanStdout = "";
  expect(await supervisor.scan()).toEqual({ available: true, sessions: [] });
  expect(await supervisor.paneStatus("fehlt")).toEqual({ state: "missing", exitCode: null });
  state.scanStdout = undefined;
  state.scanStatus = 1;
  state.scanStderr = "no server running on /tmp/tmux.sock";
  expect(await supervisor.scan()).toEqual({ available: false, sessions: [] });
  expect(await supervisor.paneStatus("fehlt")).toEqual({ state: "unknown", exitCode: null });
  state.scanStderr = "permission denied";
  await expect(supervisor.scan()).rejects.toThrow("permission denied");
  expect(await supervisor.list()).toEqual([]);
});

it("erkennt tote Panes und stellt sie beim Ensure neu start", async () => {
  const { supervisor, sessions } = await fixture();
  const name = await supervisor.ensure(input);
  expect(await supervisor.paneStatus(name)).toEqual({ state: "alive", exitCode: null });
  sessions.get(name)!.dead = true;
  sessions.get(name)!.exitCode = 17;
  expect(await supervisor.paneStatus(name)).toEqual({ state: "dead", exitCode: 17 });
  sessions.get(name)!.exitSignal = 15;
  expect((await supervisor.scan()).sessions[0]).toMatchObject({ name, dead: true, exitCode: 17, exitSignal: 15 });
  expect(await supervisor.paneStatus(name)).toEqual({ state: "dead", exitCode: 17, exitSignal: 15 });
  expect(await supervisor.paneStatus("fehlt")).toEqual({ state: "missing", exitCode: null });
  expect(await supervisor.ensureWithStatus(input)).toEqual({ name, created: false });
  expect(sessions.get(name)).toMatchObject({ dead: false, exitCode: null, exitSignal: null, respawns: 1 });
});

it("startet bei nicht erreichbarem Scan zuerst den Supervisor und legt keine Pane aus dem Backend-Kontext an", async () => {
  const { supervisor, control, events, tmuxCalls } = await recoveryFixture();
  expect(await supervisor.ensureWithStatus(input)).toEqual({ name: "wrapt-runtimea", created: true });
  expect(control.available).toBe(true);
  expect(tmuxCalls.filter((args) => args[2] === "new-session")).toHaveLength(1);
  const unitStart = events.indexOf("systemctl:start");
  const created = events.indexOf("tmux:new-session");
  expect(unitStart).toBeGreaterThan(-1);
  expect(created).toBeGreaterThan(unitStart);
});

it("wirft bei weiterhin nicht erreichbarem Supervisor, statt eine Pane unkontrolliert zu starten", async () => {
  const { supervisor, control, tmuxCalls } = await recoveryFixture();
  control.startError = true;
  await expect(supervisor.ensureWithStatus(input)).rejects.toThrow("Terminal-Supervisor ist nicht erreichbar");
  expect(control.available).toBe(false);
  expect(tmuxCalls.some((args) => args[2] === "new-session")).toBe(false);
});

it("legt beim Respawn fehlende Sessions mit Metadaten an und startet tote neu", async () => {
  const { supervisor, sessions } = await fixture();
  const command = { file: "/bin/codex", args: [], environment: {} };
  expect(await supervisor.respawnWithStatus("workbench-neu", "/tmp", command, metadata)).toEqual({ name: "workbench-neu", created: true });
  expect(sessions.get("workbench-neu")?.options).toMatchObject({ "@wrapt_runtime_id": "runtime-b", "@wrapt_kind": "codex", "@wrapt_project_id": "projekt-b" });
  sessions.get("workbench-neu")!.dead = true;
  sessions.get("workbench-neu")!.exitCode = 2;
  expect(await supervisor.respawnWithStatus("workbench-neu", "/tmp", command, metadata)).toEqual({ name: "workbench-neu", created: false });
  expect(sessions.get("workbench-neu")).toMatchObject({ dead: false, exitCode: null, respawns: 1 });
});

it("meldet einen fehlgeschlagenen Pane-Scan als unknown", async () => {
  const { supervisor, state } = await fixture();
  state.scanStatus = 1;
  state.scanStderr = "tmux timeout";
  expect(await supervisor.paneStatus("irgendeine")).toEqual({ state: "unknown", exitCode: null });
});

it("legt ein fehlendes Runtime-Verzeichnis vor dem Unit-Start an", async () => {
  const { supervisor, socket, systemctlCalls, directory } = await recoveryFixture();
  await rm(dirname(socket), { recursive: true, force: true });
  expect(await supervisor.ensureSupervisorUnit()).toBe(true);
  expect((await stat(dirname(socket))).mode & 0o777).toBe(0o700);
  expect(systemctlCalls.at(-1)).toEqual(["--user", "start", TERMINAL_SUPERVISOR_UNIT]);
  expect(directory).toBeTruthy();
});

it("startet active(exited) per Restart und bündelt gleichzeitige Recovery", async () => {
  const { supervisor, systemctlCalls } = await recoveryFixture(true);
  expect(await Promise.all([supervisor.ensureSupervisorUnit(), supervisor.ensureSupervisorUnit(), supervisor.ensureSupervisorUnit()])).toEqual([true, true, true]);
  expect(systemctlCalls.filter((args) => args.includes("show"))).toHaveLength(1);
  expect(systemctlCalls.filter((args) => args.includes("restart"))).toEqual([["--user", "restart", TERMINAL_SUPERVISOR_UNIT]]);
  expect(systemctlCalls.some((args) => args.includes("start"))).toBe(false);
});

it("gibt bei fehlgeschlagener Statusabfrage nicht vorschnell auf und meldet echte Fehlstarts", async () => {
  const recovered = await recoveryFixture();
  recovered.control.showError = true;
  expect(await recovered.supervisor.ensureSupervisorUnit()).toBe(true);
  expect(recovered.systemctlCalls.at(-1)).toEqual(["--user", "start", TERMINAL_SUPERVISOR_UNIT]);

  const failed = await recoveryFixture();
  failed.control.startError = true;
  expect(await failed.supervisor.ensureSupervisorUnit()).toBe(false);
});

it("nutzt bei Recovery denselben benutzerdefinierten Socket", async () => {
  const { supervisor, socket, tmuxCalls } = await recoveryFixture();
  expect(await supervisor.ensureSupervisorUnit()).toBe(true);
  expect(tmuxCalls.every((args) => args[0] === "-S" && args[1] === socket)).toBe(true);
});

it("lässt den Eventloop bei fünf Sekunden Setup frei und bricht laufende Reads beim Close ab", async () => {
  vi.useFakeTimers();
  const supervisor = new TmuxSupervisor("/fake/tmux", null, async (_args, _timeout, signal) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5_000);
      signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
    return ok();
  });
  try {
    const ready = supervisor.ready();
    const heartbeat = vi.fn();
    setTimeout(heartbeat, 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(heartbeat).toHaveBeenCalledOnce();
    const rejected = expect(ready).rejects.toBeDefined();
    await supervisor.close();
    await rejected;
  } finally { vi.useRealTimers(); }
});

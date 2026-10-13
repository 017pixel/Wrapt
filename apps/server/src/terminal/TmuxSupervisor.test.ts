import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTerminalSocketPath, terminalSupervisorStartArgs, TmuxSupervisor, type TmuxCommandResult } from "./TmuxSupervisor.js";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const ok = (stdout = ""): TmuxCommandResult => ({ status: 0, stdout, stderr: "" });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-fake-supervisor-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const sessions = new Map<string, { cwd: string; options: Record<string, string>; alternate: boolean }>();
  const calls: string[][] = [];
  const runner = (raw: string[]) => {
    calls.push(raw);
    const args = raw.slice(2);
    const name = args[args.indexOf("-t") + 1] ?? "";
    if (args[0] === "has-session") return { ...ok(), status: sessions.has(name) ? 0 : 1 };
    if (args[0] === "new-session") sessions.set(args[3]!, { cwd: args[5]!, options: {}, alternate: false });
    if (args[0] === "set-option") {
      for (let offset = 0; offset < args.length; offset += 6) {
        const session = sessions.get(args[offset + 2]!);
        if (session) session.options[args[offset + 3]!] = args[offset + 4]!;
      }
    }
    if (args[0] === "display-message") return ok(args.at(-1) === "#{alternate_on}" ? (sessions.get(name)?.alternate ? "1" : "0") : sessions.get(name)?.cwd ?? "");
    if (args[0] === "capture-pane") return ok("Bereit\n");
    if (args[0] === "kill-session") sessions.delete(name);
    if (args[0] === "list-panes") return ok([...sessions].map(([sessionName, session]) => [
      sessionName, "1700000000", session.cwd, "bash", "bash", session.options["@wrapt_runtime_id"] ?? "", session.options["@workbench_runtime_id"] ?? "",
      session.options["@wrapt_kind"] ?? "", session.options["@workbench_kind"] ?? "", session.options["@wrapt_project_id"] ?? "", session.options["@workbench_project_id"] ?? "",
    ].join("\t")).join("\n"));
    return ok();
  };
  const socket = join(directory, "tmux.sock");
  const supervisor = new TmuxSupervisor("/fake/tmux", socket, runner);
  cleanup.push(() => supervisor.close());
  return { supervisor, sessions, calls, socket };
}

describe("Tmux-Supervisor-Plattformpfade", () => {
  it("verwendet XDG_RUNTIME_DIR oder das konfigurierte Datenverzeichnis", () => {
    expect(defaultTerminalSocketPath("/var/lib/wrapt", "/run/user/501")).toBe("/run/user/501/wrapt/tmux.sock");
    expect(defaultTerminalSocketPath("/Users/test/Wrapt", "", "darwin")).toBe(join("/Users/test/Wrapt", "run", "tmux.sock"));
  });
  it("startet dieselbe benannte Sitzung wie die Linux-Unit", () => {
    expect(terminalSupervisorStartArgs("/tmp/eigener.sock")).toEqual(["-S", "/tmp/eigener.sock", "new-session", "-d", "-s", "wrapt-supervisor"]);
  });
});

const input = { runtimeId: "runtime-a", kind: "shell" as const, projectId: "projekt", cwd: "/tmp",
  command: { file: "/bin/bash", args: ["-l"], environment: { TERM: "xterm-256color" } } };

it("serialisiert gleichzeitige Sessionmutationen und bündelt die neun Optionen", async () => {
  const { supervisor, sessions, calls, socket } = await fixture();
  const names = await Promise.all(Array.from({ length: 3 }, () => supervisor.ensure(input)));
  expect(new Set(names).size).toBe(1);
  expect(calls.filter((args) => args[2] === "new-session")).toHaveLength(1);
  expect(calls.every((args) => args[0] === "-S" && args[1] === socket)).toBe(true);
  expect(sessions.get(names[0]!)?.options).toMatchObject({ "@wrapt_runtime_id": "runtime-a", mouse: "off", "alternate-screen": "off", status: "off" });
  await supervisor.respawn(names[0]!, "/tmp", input.command);
  await supervisor.sendLastCommandHint(names[0]!);
  await supervisor.terminate(names[0]!);
  expect(await supervisor.has(names[0]!)).toBe(false);
});

it("importiert alte Metadaten und behält gespeicherte Namen", async () => {
  const { supervisor, sessions } = await fixture();
  sessions.set("workbench-alt", { cwd: "/tmp", alternate: false, options: { "@workbench_runtime_id": "legacy", "@workbench_kind": "codex", "@workbench_project_id": "alt" } });
  expect(await supervisor.list()).toContainEqual(expect.objectContaining({ name: "workbench-alt", runtimeId: "legacy", kind: "codex", projectId: "alt", managed: true }));
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

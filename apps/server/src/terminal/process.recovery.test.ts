import { afterEach, describe, expect, it, vi } from "vitest";
import type { PtyAdapter, PtyProcess } from "./NodePtyAdapter.js";
import { createProcessRuntime, type ProcessRuntime } from "./process.js";
import { RECOVERY_MONITOR_INTERVAL_MS, RESPAWN_DELAYS_MS, type RecoveryScan, type RecoverySupervisor } from "./recovery.js";
import { GeometryLease } from "./runtime/GeometryLease.js";
import { OutputJournal } from "./runtime/OutputJournal.js";
import { PendingInputBuffer } from "./runtime/recoveryState.js";
import type { ServerTerminalMessage } from "./protocol.js";
import type { TerminalSession } from "./session.js";
import type { PaneStatus, SupervisorSession, TmuxSupervisor } from "./TmuxSupervisor.js";

class FakePty implements PtyProcess {
  pid = 0;
  writes: string[] = [];
  resizes: Array<[number, number]> = [];
  killed: string[] = [];
  private data: ((data: string) => void) | undefined;
  private exit: ((event: { exitCode: number; signal?: number }) => void) | undefined;

  write(data: string) { this.writes.push(data); }
  resize(cols: number, rows: number) { this.resizes.push([cols, rows]); }
  kill(signal?: string) { this.killed.push(signal ?? "SIGTERM"); }
  onData(callback: (data: string) => void) { this.data = callback; return { dispose: () => { /* bewusst offen für späte Events */ } }; }
  onExit(callback: (event: { exitCode: number; signal?: number }) => void) { this.exit = callback; return { dispose: () => { /* bewusst offen für späte Events */ } }; }
  output(data: string) { this.data?.(data); }
  end(exitCode = 0, signal?: number) { this.exit?.({ exitCode, ...(signal === undefined ? {} : { signal }) }); }
}

interface FakePane { dead: boolean; exitCode: number | null; exitSignal: number | null; }

class FakeSupervisor implements RecoverySupervisor {
  scan?: () => Promise<RecoveryScan> | RecoveryScan;
  readonly panes = new Map<string, FakePane>();
  captureValue = "";
  captureGate: Promise<void> | null = null;
  ensureGate: Promise<void> | null = null;
  failRespawn = false;
  readonly calls = { ensure: 0, respawn: 0, capture: 0, terminate: 0, unit: 0, hint: 0, scan: 0 };

  setPane(name: string, dead: boolean, exitCode: number | null = null, exitSignal: number | null = null) {
    this.panes.set(name, { dead, exitCode, exitSignal });
  }

  removePane(name: string) { this.panes.delete(name); }

  paneStatus(name: string): PaneStatus {
    const pane = this.panes.get(name);
    if (!pane) return { state: "missing", exitCode: null };
    if (!pane.dead) return { state: "alive", exitCode: null };
    return { state: "dead", exitCode: pane.exitCode, exitSignal: pane.exitSignal };
  }

  async scanResult() {
    this.calls.scan += 1;
    const sessions: SupervisorSession[] = [...this.panes].map(([name, pane]) => ({
      name, runtimeId: null, kind: "shell", projectId: null, cwd: "/tmp", command: "bash",
      createdAt: 0, managed: true, dead: pane.dead, exitCode: pane.exitCode, exitSignal: pane.exitSignal,
    }));
    return { available: true, sessions };
  }

  async ensureWithStatus(input: { runtimeId: string; supervisorName?: string | null }) {
    this.calls.ensure += 1;
    if (this.ensureGate) await this.ensureGate;
    const name = input.supervisorName ?? `workbench-${input.runtimeId}`;
    const existing = this.panes.get(name);
    if (!existing) { this.setPane(name, false); return { name, created: true }; }
    if (existing.dead) this.revive(name);
    return { name, created: false };
  }

  async ensure() { return "unused"; }

  async respawnWithStatus(name: string) {
    if (this.failRespawn) throw new Error("Respawn fehlgeschlagen");
    const existed = this.panes.has(name);
    this.revive(name);
    return { created: !existed };
  }

  async respawn(name: string) { this.revive(name); }

  has(name: string) { return this.panes.has(name); }

  async capture() {
    this.calls.capture += 1;
    if (this.captureGate) await this.captureGate;
    return this.captureValue;
  }

  attachCommand(name: string) { return { file: "/fake/tmux", args: ["attach-session", "-t", name] }; }
  currentPath() { return null; }
  terminate(name: string) { this.calls.terminate += 1; this.panes.delete(name); }
  ensureSupervisorUnit() { this.calls.unit += 1; return true; }
  sendLastCommandHint() { this.calls.hint += 1; }

  private revive(name: string) {
    this.calls.respawn += 1;
    this.setPane(name, false);
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function createSession(): TerminalSession {
  return {
    id: "11111111-1111-4111-8111-111111111111", userId: "user", runtimeId: "22222222-2222-4222-8222-222222222222",
    kind: "shell", mode: "agent", profilePath: null, supervisorName: null, projectId: null, pty: null, pid: 0,
    cwd: "/tmp", cols: 80, rows: 24, status: "starting", history: "", createdAt: 0, updatedAt: 0,
    exitCode: null, exitSignal: null, sequence: 0, epoch: 0, lastPersistedAt: undefined,
    clients: new Map(), clientViewports: new Map(), primaryClientId: null, dataListener: null, exitListener: null,
    headless: null, journal: new OutputJournal(), geometry: new GeometryLease(80, 24),
  };
}

let runtime: ProcessRuntime | undefined;

afterEach(async () => {
  await runtime?.shutdown();
  runtime = undefined;
  vi.useRealTimers();
});

function setup() {
  const supervisor = new FakeSupervisor();
  const ptys: FakePty[] = [];
  const messages: ServerTerminalMessage[] = [];
  const adapter: PtyAdapter = { spawn: () => { const pty = new FakePty(); ptys.push(pty); return pty; } };
  runtime = createProcessRuntime({
    adapter, supervisor: supervisor as unknown as TmuxSupervisor, homeDirectory: "/tmp", platform: "linux",
    cliPaths: undefined, onOutput: undefined, persist: () => {}, emit: (_session, message) => messages.push(message),
    cwdRefreshTimers: new Map(), validateCwd: (session) => session.cwd,
  });
  return { supervisor, ptys, messages, process: runtime, session: createSession() };
}

async function startedProcess() {
  const context = setup();
  await context.process.spawn(context.session, true);
  const name = context.session.supervisorName!;
  context.supervisor.setPane(name, false);
  return { ...context, name };
}

async function flushMicrotasks(rounds = 20) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

describe("Terminal-Runtime-Recovery", () => {
  it("hängt nach einem Client-Exit nur neu an und tötet die lebende Shell nicht", async () => {
    const { process, supervisor, ptys, session, name } = await startedProcess();
    const oldPty = ptys[0]!;
    const sequenceBefore = session.sequence;

    oldPty.end(0);
    await flushMicrotasks();

    expect(ptys).toHaveLength(2);
    expect(session.status).toBe("running");
    expect(session.pty).toBe(ptys[1]);
    expect(session.supervisorName).toBe(name);
    expect(supervisor.calls.respawn).toBe(0);
    expect(supervisor.calls.ensure).toBe(1);
    expect(supervisor.calls.terminate).toBe(0);
    expect(supervisor.calls.hint).toBe(0);

    // Späte Events des alten Gateways dürfen den neuen Zustand nicht verändern.
    oldPty.output("veraltet");
    oldPty.end(9);
    await flushMicrotasks();
    expect(session.sequence).toBe(sequenceBefore);
    expect(session.status).toBe("running");
    expect(ptys).toHaveLength(2);
    expect(process).toBeDefined();
  });

  it("beendet eine tote Pane mit Exit 0, statt sie neu zu starten", async () => {
    const { supervisor, ptys, messages, session, name } = await startedProcess();
    supervisor.setPane(name, true, 0, null);

    ptys[0]!.end(0);
    await flushMicrotasks();

    expect(session.status).toBe("exited");
    expect(session.exitCode).toBe(0);
    expect(ptys).toHaveLength(1);
    expect(supervisor.calls.respawn).toBe(0);
    expect(messages).toContainEqual(expect.objectContaining({ type: "terminal.exited", exitCode: 0 }));
  });

  it("startet eine tote Pane mit Exit ungleich 0 nach Backoff neu und setzt die Runtime zurück", async () => {
    vi.useFakeTimers();
    const { process, supervisor, ptys, messages, session, name } = await startedProcess();
    ptys[0]!.output("alte-ausgabe");
    supervisor.setPane(name, true, 7, null);

    ptys[0]!.end(7);
    await flushMicrotasks();
    expect(session.status).toBe("starting");
    expect(messages).toContainEqual(expect.objectContaining({ type: "terminal.restarting" }));
    expect(ptys).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RESPAWN_DELAYS_MS[0]);
    expect(supervisor.calls.respawn).toBe(1);
    expect(ptys).toHaveLength(2);
    expect(session.status).toBe("running");
    expect(session.epoch).toBe(1);
    expect(session.sequence).toBe(0);
    expect(session.history).toBe("");
    expect(session.journal.size).toBe(0);
    expect(session.headless?.parsedSequence).toBe(0);
    expect(supervisor.calls.hint).toBe(0);
    expect(process).toBeDefined();
  });

  it("startet eine fehlende Pane über den Supervisor neu", async () => {
    vi.useFakeTimers();
    const { supervisor, ptys, session, name } = await startedProcess();
    supervisor.removePane(name);

    ptys[0]!.end(0);
    await flushMicrotasks();
    expect(session.status).toBe("starting");
    expect(ptys).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RESPAWN_DELAYS_MS[0]);
    expect(supervisor.calls.ensure).toBe(2);
    expect(supervisor.calls.respawn).toBe(0);
    expect(ptys).toHaveLength(2);
    expect(session.status).toBe("running");
    expect(supervisor.panes.has(session.supervisorName!)).toBe(true);
  });

  it("erkennt tote Panes über den gemeinsamen Scan-Monitor", async () => {
    vi.useFakeTimers();
    const context = setup();
    const { supervisor, ptys, session, process } = context;
    supervisor.scan = () => supervisor.scanResult();
    await process.spawn(session, true);
    const name = session.supervisorName!;
    supervisor.setPane(name, true, 3, null);

    await vi.advanceTimersByTimeAsync(RECOVERY_MONITOR_INTERVAL_MS);
    expect(supervisor.calls.scan).toBe(1);
    expect(session.status).toBe("starting");
    expect(ptys[0]!.killed).toContain("SIGTERM");

    await vi.advanceTimersByTimeAsync(RESPAWN_DELAYS_MS[0]);
    expect(supervisor.calls.respawn).toBe(1);
    expect(ptys).toHaveLength(2);
    expect(session.status).toBe("running");
  });

  it("erkennt fehlende Panes über den gemeinsamen Scan-Monitor", async () => {
    vi.useFakeTimers();
    const context = setup();
    const { supervisor, ptys, session, process } = context;
    supervisor.scan = () => supervisor.scanResult();
    await process.spawn(session, true);
    supervisor.removePane(session.supervisorName!);

    await vi.advanceTimersByTimeAsync(RECOVERY_MONITOR_INTERVAL_MS);
    expect(session.status).toBe("starting");
    await vi.advanceTimersByTimeAsync(RESPAWN_DELAYS_MS[0]);
    expect(supervisor.calls.ensure).toBe(2);
    expect(ptys).toHaveLength(2);
    expect(session.status).toBe("running");
  });

  it("verwirft einen Attach, wenn sich der Epoch während des Captures ändert", async () => {
    const { supervisor, ptys, session, name } = await startedProcess();
    const gate = deferred();
    supervisor.captureGate = gate.promise;
    supervisor.setPane(name, false);

    ptys[0]!.end(0);
    await flushMicrotasks();
    expect(supervisor.calls.capture).toBe(2);
    session.epoch += 1;
    gate.resolve();
    await flushMicrotasks();

    expect(session.epoch).toBe(1);
    expect(ptys).toHaveLength(1);
    expect(session.pty).toBeNull();
  });

  it("verwirft einen Attach, wenn die Session während des Captures geschlossen wird", async () => {
    const { supervisor, ptys, session, name } = await startedProcess();
    const gate = deferred();
    supervisor.captureGate = gate.promise;
    supervisor.setPane(name, false);

    ptys[0]!.end(0);
    await flushMicrotasks();
    session.status = "closed";
    gate.resolve();
    await flushMicrotasks();

    expect(ptys).toHaveLength(1);
    expect(session.pty).toBeNull();
  });

  it("puffert Eingaben während starting begrenzt und liefert sie nach dem Attach", async () => {
    const { process, supervisor, ptys, session } = setup();
    const gate = deferred();
    supervisor.ensureGate = gate.promise;
    const spawning = process.spawn(session, true);

    process.write(session, "abc");
    process.write(session, "def");
    supervisor.ensureGate = null;
    gate.resolve();
    await spawning;
    await flushMicrotasks();

    expect(ptys).toHaveLength(1);
    expect(ptys[0]!.writes).toEqual(["abc", "def"]);
    expect(session.status).toBe("running");
  });

  it("begrenzt den Eingabepuffer bei Überlauf auf die jüngsten Daten", () => {
    const buffer = new PendingInputBuffer(4);
    buffer.push("ab");
    buffer.push("cdefg");
    expect(buffer.length).toBe(4);
    expect(buffer.drain()).toEqual(["defg"]);
    expect(buffer.length).toBe(0);
  });

  it("stoppt nach fünf erfolglosen Versuchen und markiert die Session als interrupted", async () => {
    vi.useFakeTimers();
    const { supervisor, ptys, messages, session, name } = await startedProcess();
    supervisor.failRespawn = true;
    supervisor.setPane(name, true, 5, null);

    ptys[0]!.end(5);
    await flushMicrotasks();
    for (const delay of RESPAWN_DELAYS_MS.slice(0, 5)) {
      await vi.advanceTimersByTimeAsync(delay);
    }

    expect(session.status).toBe("interrupted");
    expect(messages).toContainEqual(expect.objectContaining({ type: "terminal.error", code: "SESSION_INTERRUPTED" }));
    expect(ptys).toHaveLength(1);
  });
});

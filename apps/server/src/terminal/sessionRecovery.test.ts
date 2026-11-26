import { expect, test, vi } from "vitest";
import type { PtyProcess } from "./NodePtyAdapter.js";
import type { ProcessRuntime } from "./process.js";
import { recoverSessionRuntime } from "./sessionRecovery.js";
import type { TerminalSession } from "./session.js";
import { GeometryLease } from "./runtime/GeometryLease.js";
import { OutputJournal } from "./runtime/OutputJournal.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";

function session(): TerminalSession {
  return {
    id: "session-1", userId: "owner", runtimeId: "runtime-1", kind: "shell", mode: "agent",
    profilePath: null, supervisorName: "wrapt-runtime", projectId: null, pty: null, pid: 0,
    cwd: "/tmp", cols: 80, rows: 24, status: "interrupted", history: "", createdAt: 0, updatedAt: 0,
    exitCode: null, exitSignal: null, sequence: 0, epoch: 0, lastPersistedAt: undefined,
    clients: new Map(), clientViewports: new Map(), primaryClientId: null,
    dataListener: null, exitListener: null, headless: null, journal: new OutputJournal(),
    geometry: new GeometryLease(80, 24),
  };
}

const pty = { pid: 0, write() {}, resize() {}, kill() {}, onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }) } satisfies PtyProcess;

test("ein abgebrochener Attach überschreibt keine parallel übernommene, lebende PTY", async () => {
  const current = session();
  const supervisor = {
    scan: vi.fn(() => ({ available: true, sessions: [{
      name: "wrapt-runtime", dead: false, exitCode: null, runtimeId: "runtime-1",
      kind: "shell", projectId: null, cwd: "/tmp", command: "bash", createdAt: 0, managed: true,
    }] })),
    list: vi.fn(() => []),
  } as unknown as TmuxSupervisor;
  const process = {
    spawn: vi.fn(async (target: TerminalSession) => {
      // Die parallele Recovery hat inzwischen erfolgreich angehängt.
      target.pty = pty;
      target.status = "running";
      throw new Error("Terminalstart wurde verworfen.");
    }),
  } as unknown as ProcessRuntime;

  await expect(recoverSessionRuntime({
    allowedRoots: ["/tmp"], deniedRoots: [], process, supervisor, persist: () => {},
  }, current)).resolves.toBeUndefined();

  expect(current.status).toBe("running");
  expect(current.pty).toBe(pty);
});

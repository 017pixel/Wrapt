import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalDatabase } from "./database.js";
import { TerminalManager } from "./Manager.js";
import { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ServerTerminalMessage } from "./protocol.js";

const tmuxAvailable = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); });

test.skipIf(!tmuxAvailable).each(["wrapt", "workbench"])("hängt nach einem Backend-Neustart dieselbe %s-tmux-Shell wieder an", async (namespace) => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-resume-"));
  const socket = join(root, "tmux.sock");
  cleanup.push(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }));
  cleanup.push(() => { spawnSync("tmux", ["-S", socket, "kill-server"], { stdio: "ignore" }); });
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(() => database.close());
  const supervisor = new TmuxSupervisor("tmux", socket);
  const options = { allowedRoots: [root], defaultCwd: root, homeDirectory: root, maxSessions: 2, database, supervisor };
  const first = new TerminalManager(options);
  cleanup.push(() => first.shutdown());
  const session = await first.createSession("owner", { cols: 80, rows: 24 });
  const canonicalName = session.supervisorName!;
  if (namespace === "workbench") {
    const legacyName = canonicalName.replace("wrapt-", "workbench-");
    expect(spawnSync("tmux", ["-S", socket, "rename-session", "-t", canonicalName, legacyName]).status).toBe(0);
    session.supervisorName = legacyName;
  }
  const panePid = () => spawnSync("tmux", ["-S", socket, "display-message", "-p", "-t", session.supervisorName!, "#{pane_pid}"], { encoding: "utf8" }).stdout.trim();
  const beforePid = panePid();
  const before = supervisor.list().find((candidate) => candidate.name === session.supervisorName)?.createdAt;
  first.writeToSession("owner", session.id, "printf '__BEFORE_RECONNECT__\\n'\r");
  await vi.waitFor(() => expect(supervisor.capture(session.supervisorName!)).toContain("__BEFORE_RECONNECT__"));
  first.shutdown();
  const second = new TerminalManager(options);
  cleanup.push(() => second.shutdown());
  const received: ServerTerminalMessage[] = [];
  const detach = second.attachSession("owner", session.id, (message) => received.push(message), "resumed", { cols: 90, rows: 25 }, { epoch: 0, lastSequence: 0 });
  expect(second.getSessionMetadata("owner", session.id)).toMatchObject({ status: "running", cols: 90, rows: 25 });
  second.writeToSession("owner", session.id, "printf '__RESUMED_GATEWAY__\\n'\r");
  await vi.waitFor(() => expect(received.filter((message) => message.type === "terminal.snapshot").map((message) => message.serialized).join("") + received.filter((message) => message.type === "terminal.deltas").flatMap((message) => message.deltas).map((delta) => delta.data).join("")).toContain("__BEFORE_RECONNECT__"));
  await vi.waitFor(() => expect(received.filter((message) => message.type === "terminal.output").map((message) => message.data).join("")).toContain("__RESUMED_GATEWAY__"));
  expect(supervisor.list().find((candidate) => candidate.name === session.supervisorName)?.createdAt).toBe(before);
  expect(panePid()).toBe(beforePid);
  expect(supervisor.list().filter((candidate) => candidate.runtimeId === session.runtimeId)).toHaveLength(1);
  detach();
});

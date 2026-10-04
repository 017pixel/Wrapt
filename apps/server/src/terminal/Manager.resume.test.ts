import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalDatabase } from "./database.js";
import { TerminalManager } from "./Manager.js";
import { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { removeTempTree } from "./terminalTestCleanup.js";

const tmuxAvailable = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });

/**
 * `tmux kill-server` kehrt zurück, sobald der Client die Antwort bekommen hat.
 * Der tmux-Server beendet sich aber erst danach und legt seinen Socket in
 * derselben Zeitdauer noch einmal an. Ohne diese Wartezeit entfernt `rmSync`
 * das Wurzelverzeichnis genau in dem Moment, in dem tmux es wieder anlegt.
 */
async function stopTmuxServer(socket: string) {
  spawnSync("tmux", ["-S", socket, "kill-server"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 100 && existsSync(socket); attempt++) await delay(50);
}

test.skipIf(!tmuxAvailable).each(["wrapt", "workbench"])("hängt nach einem Backend-Neustart dieselbe %s-tmux-Shell wieder an", async (namespace) => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-resume-"));
  const socket = join(root, "tmux.sock");
  cleanup.push(() => removeTempTree(root, () => stopTmuxServer(socket)));
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
  // Die Login-Shell startet unter macOS sichtbar langsamer, weil /etc/profile
  // dort erst den Zsh-Hinweis ausgibt. Eingaben, die vor dem Startbanner
  // ankommen, verwirft bash wieder, deshalb wird die Marke so lange erneut
  // gesendet, bis sie im Pane-Bild steht.
  await vi.waitFor(() => {
    first.writeToSession("owner", session.id, "printf '__BEFORE_RECONNECT__\\n'\r");
    expect(supervisor.capture(session.supervisorName!)).toContain("__BEFORE_RECONNECT__");
  }, { timeout: 30_000, interval: 500 });
  first.shutdown();
  const second = new TerminalManager(options);
  cleanup.push(() => second.shutdown());
  const received: ServerTerminalMessage[] = [];
  const detach = second.attachSession("owner", session.id, (message) => received.push(message), "resumed", { cols: 90, rows: 25 }, { epoch: 0, lastSequence: 0 });
  expect(second.getSessionMetadata("owner", session.id)).toMatchObject({ status: "running", cols: 90, rows: 25 });
  second.writeToSession("owner", session.id, "printf '__RESUMED_GATEWAY__\\n'\r");
  await vi.waitFor(() => expect(received.filter((message) => message.type === "terminal.snapshot").map((message) => message.serialized).join("") + received.filter((message) => message.type === "terminal.deltas").flatMap((message) => message.deltas).map((delta) => delta.data).join("")).toContain("__BEFORE_RECONNECT__"), { timeout: 30_000 });
  await vi.waitFor(() => expect(received.filter((message) => message.type === "terminal.output").map((message) => message.data).join("")).toContain("__RESUMED_GATEWAY__"), { timeout: 30_000 });
  expect(supervisor.list().find((candidate) => candidate.name === session.supervisorName)?.createdAt).toBe(before);
  expect(panePid()).toBe(beforePid);
  expect(supervisor.list().filter((candidate) => candidate.runtimeId === session.runtimeId)).toHaveLength(1);
  detach();
});

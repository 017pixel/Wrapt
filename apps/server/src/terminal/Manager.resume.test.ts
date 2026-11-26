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

/**
 * Die Unit-Recovery ist im Test bewusst nicht erreichbar: Ein frischer Socket
 * gehörte sonst als "fehlender Server" erkannt und würde den echten
 * `wrapt-terminal-supervisor.service` neu starten. Ein eigener Server auf dem
 * privaten Socket bildet die installierte Unit nach.
 */
function startTmuxServer(socket: string) {
  const result = spawnSync("tmux", ["-S", socket, "new-session", "-d", "-s", "wrapt-supervisor"], { stdio: "ignore" });
  expect(result.status).toBe(0);
}

test.skipIf(!tmuxAvailable).each(["wrapt", "workbench"])("hängt nach einem Backend-Neustart dieselbe %s-tmux-Shell wieder an", async (namespace) => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-resume-"));
  const socket = join(root, "tmux.sock");
  cleanup.push(async () => removeTempTree(root, () => stopTmuxServer(socket)));
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(async () => database.close());
  const supervisor = new TmuxSupervisor("tmux", socket);
  startTmuxServer(socket);
  const options = { allowedRoots: [root], defaultCwd: root, homeDirectory: root, maxSessions: 2, database, supervisor };
  const first = new TerminalManager(options);
  cleanup.push(async () => first.shutdown());
  const session = await first.createSession("owner", { cols: 80, rows: 24 });
  const canonicalName = session.supervisorName!;
  if (namespace === "workbench") {
    const legacyName = canonicalName.replace("wrapt-", "workbench-");
    expect(spawnSync("tmux", ["-S", socket, "rename-session", "-t", canonicalName, legacyName]).status).toBe(0);
    session.supervisorName = legacyName;
  }
  const panePid = () => spawnSync("tmux", ["-S", socket, "display-message", "-p", "-t", session.supervisorName!, "#{pane_pid}"], { encoding: "utf8" }).stdout.trim();
  // Die Login-Shell startet unter macOS sichtbar langsamer, weil /etc/profile
  // dort erst den Zsh-Hinweis ausgibt. Eingaben, die vor dem Startbanner
  // ankommen, verwirft bash wieder, deshalb wird die Marke so lange erneut
  // gesendet, bis sie im Pane-Bild steht.
  await vi.waitFor(async () => {
    first.writeToSession("owner", session.id, "printf '__BEFORE_RECONNECT__\\n'\r");
    expect(await supervisor.capture(session.supervisorName!)).toContain("__BEFORE_RECONNECT__");
  }, { timeout: 30_000, interval: 500 });
  // Der Ausgangswert wird erst nach der Marke genommen. Direkt nach dem
  // Anlegen meldet tmux auf macOS noch den Starter des Panes, der beim
  // Shell-Start einmal wechselt. Gemessen werden soll der Wiederverbindungs-
  // fall, nicht der Start der Shell.
  const beforePid = panePid();
  const before = (await supervisor.list()).find((candidate) => candidate.name === session.supervisorName)?.createdAt;
  (await first.shutdown());
  const second = new TerminalManager(options);
  cleanup.push(async () => second.shutdown());
  const received: ServerTerminalMessage[] = [];
  const detach = (await second.attachSession("owner", session.id, (message) => received.push(message), "resumed", { cols: 90, rows: 25 }, { epoch: 0, lastSequence: 0 }));
  expect(second.getSessionMetadata("owner", session.id)).toMatchObject({ status: "running", cols: 90, rows: 25 });
  second.writeToSession("owner", session.id, "printf '__RESUMED_GATEWAY__\\n'\r");
  await vi.waitFor(() => expect(received.filter((message) => message.type === "terminal.snapshot").map((message) => message.serialized).join("") + received.filter((message) => message.type === "terminal.deltas").flatMap((message) => message.deltas).map((delta) => delta.data).join("")).toContain("__BEFORE_RECONNECT__"), { timeout: 30_000 });
  await vi.waitFor(() => expect(received.filter((message) => message.type === "terminal.output").map((message) => message.data).join("")).toContain("__RESUMED_GATEWAY__"), { timeout: 30_000 });
  expect((await supervisor.list()).find((candidate) => candidate.name === session.supervisorName)?.createdAt).toBe(before);
  expect(panePid()).toBe(beforePid);
  expect((await supervisor.list()).filter((candidate) => candidate.runtimeId === session.runtimeId)).toHaveLength(1);
  detach();
}, 60_000);

test.skipIf(!tmuxAvailable)("übernimmt nach einem Backend-Neustart eine tote Pane als beendet", async () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-dead-"));
  const socket = join(root, "tmux.sock");
  cleanup.push(async () => removeTempTree(root, () => stopTmuxServer(socket)));
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(async () => database.close());
  const supervisor = new TmuxSupervisor("tmux", socket);
  startTmuxServer(socket);
  const options = { allowedRoots: [root], defaultCwd: root, homeDirectory: root, maxSessions: 2, database, supervisor };
  const first = new TerminalManager(options);
  cleanup.push(async () => first.shutdown());
  const session = await first.createSession("owner", { cols: 80, rows: 24 });
  const supervisorName = session.supervisorName!;
  await first.shutdown();
  // Die Shell endet sauber; remain-on-exit lässt die tote Pane stehen.
  spawnSync("tmux", ["-S", socket, "send-keys", "-t", supervisorName, "exit 0", "Enter"], { stdio: "ignore" });
  await vi.waitFor(async () => {
    const pane = (await supervisor.scan()).sessions.find((candidate) => candidate.name === supervisorName);
    expect(pane?.dead).toBe(true);
  }, { timeout: 30_000, interval: 250 });
  // Vor dem Neustart ist die Zeile noch als laufend gespeichert.
  expect(database.findSessionById("owner", session.id)?.status).toBe("running");

  const second = new TerminalManager({
    ...options,
    adapter: { spawn: () => { throw new Error("Eine tote Pane darf nicht neu starten."); } },
  });
  cleanup.push(async () => second.shutdown());
  await second.ready();
  expect(database.findSessionById("owner", session.id)).toMatchObject({ status: "exited", exitCode: 0 });

  const received: ServerTerminalMessage[] = [];
  const detach = await second.attachSession("owner", session.id, (message) => received.push(message), "dead-pane");
  expect(second.getSessionMetadata("owner", session.id)).toMatchObject({ status: "exited", exitCode: 0 });
  expect(received.some((message) => message.type === "terminal.snapshot")).toBe(true);
  detach();
}, 60_000);

test.skipIf(!tmuxAvailable)("startet nach einem Backend-Neustart eine fehlende Pane neu", async () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-missing-"));
  const socket = join(root, "tmux.sock");
  cleanup.push(async () => removeTempTree(root, () => stopTmuxServer(socket)));
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(async () => database.close());
  const supervisor = new TmuxSupervisor("tmux", socket);
  startTmuxServer(socket);
  const options = { allowedRoots: [root], defaultCwd: root, homeDirectory: root, maxSessions: 2, database, supervisor };
  const first = new TerminalManager(options);
  cleanup.push(async () => first.shutdown());
  const session = await first.createSession("owner", { cols: 80, rows: 24 });
  const supervisorName = session.supervisorName!;
  await first.shutdown();
  // Der vorab gestartete Supervisor hält den tmux-Server am Leben, damit die
  // eigene Pane sauber als "missing" statt als nicht erreichbarer Server erscheint.
  spawnSync("tmux", ["-S", socket, "kill-session", "-t", supervisorName], { stdio: "ignore" });
  await vi.waitFor(async () => expect((await supervisor.paneStatus(supervisorName)).state).toBe("missing"));

  const second = new TerminalManager(options);
  cleanup.push(async () => second.shutdown());
  await second.ready();
  expect(database.findSessionById("owner", session.id)?.status).toBe("interrupted");

  const received: ServerTerminalMessage[] = [];
  const detach = await second.attachSession("owner", session.id, (message) => received.push(message), "missing-pane", { cols: 100, rows: 30 });
  await vi.waitFor(() => expect(second.getSessionMetadata("owner", session.id).status).toBe("running"), { timeout: 30_000 });
  expect(second.getSessionMetadata("owner", session.id)).toMatchObject({ cols: 100, rows: 30 });
  const recreated = (await supervisor.scan()).sessions.find((candidate) => candidate.name === supervisorName);
  expect(recreated?.dead).toBe(false);
  detach();
}, 60_000);

import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { TerminalDatabase } from "./database.js";
import { TerminalManager } from "./Manager.js";
import { registerTerminalRoutes } from "./routes.js";

const disposers: Array<() => void | Promise<unknown>> = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); });

test("einzelnes Beenden schließt PTY und Registry und gibt die Quote frei", async () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-delete-"));
  disposers.push(() => rmSync(root, { recursive: true, force: true }));
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  disposers.push(() => database.close());
  let killed = 0;
  const manager = new TerminalManager({ allowedRoots: [root], defaultCwd: root, maxSessions: 1, database, adapter: { spawn: () => ({ pid: 0, write() {}, resize() {}, kill() { killed += 1; }, onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }) }) } });
  disposers.push(() => manager.shutdown());
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  manager.resizeSession("owner", session.id, 90, 25);
  expect(manager.listSessions("owner")[0]).toMatchObject({ cols: 90, rows: 25 });
  const current = database.getWorkspace("owner");
  database.saveWorkspace("owner", { ...current.document, entries: [{ id: "entry", runtimeId: session.runtimeId, name: "Test", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null }] }, 0);
  const app = Fastify();
  disposers.push(() => app.close());
  await registerTerminalRoutes(app, { manager, database, allowedUsers: ["owner"] });
  const ended: string[] = [];
  manager.attachSession("owner", session.id, (message) => ended.push(message.type), "client");
  const response = await app.inject({ method: "POST", url: "/terminal/workspace/ops", headers: { "tailscale-user-login": "owner" }, payload: { expectedRevision: 1, operations: [{ type: "deleteEntry", id: "entry" }] } });
  expect(response.statusCode).toBe(200);
  expect(manager.listSessions("owner")).toEqual([]);
  expect(killed).toBe(1);
  expect(ended).toContain("terminal.exited");
  await expect(manager.createSession("owner", { cols: 80, rows: 24 })).resolves.toMatchObject({ status: "running" });
});

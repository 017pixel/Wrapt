import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ProjectResponse } from "@wrapt/contracts";
import { NotificationDatabase } from "../notifications/database.js";
import { PluginHostApi } from "./code-host-api.js";
import { registerIntegrationPluginApi } from "./host-integrations.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wrapt-plugin-integrations-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const notifications = new NotificationDatabase(join(root, "notifications.sqlite"));
  cleanup.push(() => notifications.close());
  const terminals = { listSessions: vi.fn().mockResolvedValue([]), createSession: vi.fn().mockResolvedValue({ id: "own", runtimeId: "runtime" }), writeToSession: vi.fn(), closeSession: vi.fn().mockResolvedValue(undefined) };
  const previews = { list: vi.fn(), openSession: vi.fn(), closeSessionById: vi.fn() };
  const projects = { get: vi.fn().mockResolvedValue({ project: { path: root, availability: "available" } } as ProjectResponse) };
  const api = new PluginHostApi();
  registerIntegrationPluginApi(api, { notifications, terminals, previews, projects });
  const request = { userId: "actual-owner", requestId: "request", signal: new AbortController().signal };
  return { root, api, terminals, previews, request };
}

describe("öffentliche Plugin-Integrationen", () => {
  it("stellt dieselben Eingabeverträge als JSON-Schema bereit und validiert Aufrufe", async () => {
    const f = fixture();
    expect(f.api.describe().find((entry) => entry.name === "notifications.create")?.inputSchema).toMatchObject({ required: expect.arrayContaining(["title", "body", "severity"]) });
    await expect(f.api.call("notifications.create", { title: "" }, f.request)).rejects.toThrow();
    const created = await f.api.call("notifications.create", { title: "Fertig", body: "Prüfung abgeschlossen", severity: "success" }, f.request);
    expect(created).toMatchObject({ title: "Fertig", source: "wrapt" });
    expect(await f.api.call("notifications.list", undefined, f.request)).toMatchObject({ notifications: [created] });
    f.api.register("example.generic", { description: "Fremder Validator", mutates: false, hookable: false, input: { parse: (value) => value }, output: z.string(), handler: () => "ok" });
    expect(() => f.api.describe()).not.toThrow();
  });

  it("übernimmt für Terminal und Preview die Aufrufidentität und keine Identität aus der Nutzlast", async () => {
    const f = fixture();
    await f.api.call("terminal.create", { userId: "foreign" }, f.request);
    expect(f.terminals.createSession).toHaveBeenCalledWith("actual-owner", expect.objectContaining({ kind: "shell", projectId: null }));
    const sessionId = "c8a68855-f89b-45cd-a3cd-a7e35992f208";
    await f.api.call("terminal.write", { sessionId, data: "pwd\r", userId: "foreign" }, f.request);
    expect(f.terminals.writeToSession).toHaveBeenCalledWith("actual-owner", sessionId, "pwd\r");
    await f.api.call("previews.close", { sessionId, userId: "foreign" }, f.request);
    expect(f.previews.closeSessionById).toHaveBeenCalledWith("actual-owner", sessionId);
  });

  it("liest tatsächlichen Git-Status und Diff im registrierten Projekt", async () => {
    const f = fixture();
    await execa("git", ["init", f.root]);
    writeFileSync(join(f.root, "example.txt"), "Eigener Testinhalt\n");
    expect(await f.api.call("git.status", { projectId: "example" }, f.request)).toMatchObject({ output: expect.stringContaining("?? example.txt") });
    await execa("git", ["-C", f.root, "add", "example.txt"]);
    expect(await f.api.call("git.diff", { projectId: "example", staged: true }, f.request)).toMatchObject({ output: expect.stringContaining("+Eigener Testinhalt") });
  });
});

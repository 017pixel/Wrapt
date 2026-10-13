import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { harness } from "./testing/devServerHarness.js";

it("bedient Health und WS-Echo während fünf Sekunden Fake-Setup ohne einen Devserver zu starten", async () => {
  const { create, database, project, runner } = await harness();
  await writeFile(join(project.path, "preview.config.json"), JSON.stringify({
    version: 2, setupCommand: "echo Dummy", mainService: "web",
    services: [{ id: "web", name: "Web", role: "frontend", command: "echo Dummy", port: "auto", portMode: "argument" }],
  }));
  const manager = create(undefined, { runner: async (args) => {
    if (args[0] === "wait-for") await new Promise((resolve) => setTimeout(resolve, 5_000));
    return runner(args);
  } });
  const preview = await manager.commandPreview(project.id);
  database.saveCommandConfirmation("fixture", project.id, preview.commandHash, preview.commandPreview, project.path);
  const app = Fastify();
  await app.register(websocket);
  app.get("/health", async () => ({ ok: true }));
  app.get("/echo", { websocket: true }, (socket) => { socket.on("message", (data) => socket.send(data)); });
  await app.ready();
  const socket = await app.injectWS("/echo");
  try {
    const started = manager.start("fixture", project.id);
    const completed = vi.fn();
    void started.then(completed);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const echo = new Promise<string>((resolve) => socket.once("message", (data: Buffer) => resolve(data.toString())));
    socket.send("antwortet");
    const health = await Promise.all(Array.from({ length: 10 }, () => app.inject({ url: "/health" })));
    expect(health.every((reply) => reply.statusCode === 200)).toBe(true);
    expect(await echo).toBe("antwortet");
    expect(completed).not.toHaveBeenCalled();
    expect((await started).state).toBe("running");
  } finally { socket.terminate(); await manager.close(); await app.close(); }
}, 10_000);

it.each([1, 4, 12])("fragt bei %i laufenden Fake-Sessions den Watchdogzustand genau einmal ab", async (count) => {
  const { create, database, addProject, supervisor } = await harness();
  const manager = create(undefined, { allowedProjectPorts: Array.from({ length: 16 }, (_, index) => 24_000 + index) });
  try {
    for (let index = 0; index < count; index += 1) {
      const project = await addProject(`fixture-${index}`);
      const preview = await manager.commandPreview(project.id);
      database.saveCommandConfirmation("fixture", project.id, preview.commandHash, preview.commandPreview, project.path);
      await manager.start("fixture", project.id);
    }
    supervisor.commands.length = 0;
    await Promise.all([manager.tick(), manager.tick(), manager.tick()]);
    expect(supervisor.commands).toHaveLength(1);
    expect(supervisor.commands[0]).toContain("-a");
  } finally { await manager.close(); }
});

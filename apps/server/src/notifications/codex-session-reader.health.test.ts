import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { appendFile, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { CodexSessionReader } from "./codex-session-reader.js";

it("hält HTTP und WebSocket während eines fünf Sekunden wartenden JSONL-Reads frei", async () => {
  const root = await mkdtemp(join(tmpdir(), "wrapt-codex-health-"));
  const path = join(root, "dummy.jsonl");
  const app = Fastify();
  await app.register(websocket);
  app.get("/health", async () => ({ ok: true }));
  app.get("/echo", { websocket: true }, (socket) => { socket.on("message", (data) => { socket.send(data); }); });
  await app.ready();
  const socket = await app.injectWS("/echo");
  let readSpy: ReturnType<typeof vi.spyOn> | undefined;
  let poll: Promise<void> | undefined;
  try {
    await writeFile(path, '{"type":"session_meta","payload":{"id":"dummy","originator":"codex"}}\n');
    const reader = new CodexSessionReader(root);
    const offsets: Record<string, number> = {}, identities: Record<string, string> = {};
    await reader.poll(offsets, identities, false, () => {});
    await appendFile(path, '{"type":"event_msg","payload":{"type":"task_complete"}}\n');
    const handle = await open(path, "r");
    const prototype = Object.getPrototypeOf(handle) as typeof handle;
    const read = prototype.read;
    await handle.close();
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    let held = false;
    readSpy = vi.spyOn(prototype, "read").mockImplementation(async function (this: typeof handle, ...args) {
      if (!held) { held = true; started(); await delay(5_000); }
      return Reflect.apply(read, this, args);
    });
    let events = 0;
    poll = reader.poll(offsets, identities, true, (batch) => { events += batch.lines.length; });
    await waiting;
    for (let index = 0; index < 20; index += 1) {
      const echo = new Promise<string>((resolve) => socket.once("message", (data: Buffer) => resolve(data.toString())));
      socket.send(String(index));
      const health = await app.inject("/health");
      expect(health.json()).toEqual({ ok: true });
      expect(await echo).toBe(String(index));
    }
    expect(events).toBe(0);
    await poll;
    expect(events).toBe(1);
  } finally {
    await poll;
    readSpy?.mockRestore();
    socket.terminate();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
}, 10_000);

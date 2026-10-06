import { expect, it, vi } from "vitest";
import { harness } from "./testing/devServerHarness.js";

it("ein Tab-Close während des Watchdog-Neustarts verwirft den alten Veröffentlichungswunsch", async () => {
  const { create, supervisor } = await harness();
  const publish = vi.fn(async () => ({ url: "https://test.example", sessionId: "test" }));
  const manager = create(publish);
  await manager.launch("user@example.test", "projekt");
  const name = [...supervisor.sessions.keys()][0]!;
  supervisor.sessions.get(name)!.panes[0]!.dead = true;
  supervisor.sessions.get(name)!.panes[0]!.exitCode = 1;
  const originalStart = manager.start.bind(manager);
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((done) => { entered = done; });
  const gate = new Promise<void>((done) => { release = done; });
  vi.spyOn(manager, "start").mockImplementation(async (...args) => { entered(); await gate; return originalStart(...args); });
  const tick = manager.tick();
  await started;
  await manager.releasePublication("user@example.test", "projekt");
  release();
  await tick;
  await manager.tick();
  expect(publish).toHaveBeenCalledOnce();
  expect(await manager.status("user@example.test", "projekt")).toMatchObject({ state: "running", publicUrl: null });
  expect(supervisor.sessions.get(name)!.options["@wrapt_preview_publication_requested"]).toBe("0");
});

it("eine Freigabe während des Laufzeitstarts verhindert die verspätete Veröffentlichung", async () => {
  const { create } = await harness();
  const publish = vi.fn(async () => ({ url: "https://test.example", sessionId: "test" }));
  const manager = create(publish);
  const originalStart = manager.start.bind(manager);
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((done) => { entered = done; });
  const gate = new Promise<void>((done) => { release = done; });
  vi.spyOn(manager, "start").mockImplementation(async (...args) => { entered(); await gate; return originalStart(...args); });
  const launching = manager.launch("user@example.test", "projekt");
  await started;
  await manager.releasePublication("user@example.test", "projekt");
  release();
  await expect(launching).rejects.toMatchObject({ code: "PREVIEW_PUBLICATION_CLOSED" });
  expect(publish).not.toHaveBeenCalled();
  expect(await manager.status("user@example.test", "projekt")).toMatchObject({ state: "running", publicUrl: null });
});

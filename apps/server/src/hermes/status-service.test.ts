import { afterEach, expect, it, vi } from "vitest";
import { HermesClientError } from "./client.js";
import { HermesStatusService, readHermesUpdateState } from "./status-service.js";

afterEach(() => { vi.useRealTimers(); });

function fixture() {
  let ready = true;
  let sessions = 1;
  let update = readHermesUpdateState();
  const sources = {
    serviceState: vi.fn(async () => "active" as const),
    checkoutCommit: vi.fn(async () => "a".repeat(40)),
    readUpdateState: () => update,
    installed: () => true,
  };
  const get = vi.fn(async (path: string): Promise<unknown> => path === "/api/status"
    ? { version: "fixture", gateway_platforms: { telegram: true } }
    : { provider: "fixture", model: "small" });
  const manager = { get ready() { return ready; }, activeSessionCount: () => sessions };
  const service = new HermesStatusService({ get } as never, manager as never, sources);
  return { service, sources, get,
    setAcp: () => { ready = false; sessions = 3; },
    finishUpdate: () => { update = { ...update, phase: "succeeded", newCommit: "b".repeat(40) }; },
  };
}

it("zehn Verbraucher teilen unabhängige Upstreamreads, ACP bleibt frisch", async () => {
  const f = fixture();
  const result = await Promise.all(Array.from({ length: 10 }, () => f.service.get()));
  expect(f.get).toHaveBeenCalledTimes(2);
  expect(f.sources.serviceState).toHaveBeenCalledTimes(2);
  expect(f.sources.checkoutCommit).toHaveBeenCalledOnce();
  expect(result.every((status) => status.reachable && status.gateway.telegramConnected)).toBe(true);
  f.setAcp();
  expect((await f.service.get()).chat).toMatchObject({ ready: false, activeSessions: 3 });
  expect(f.get).toHaveBeenCalledTimes(2);
});

it("startet Units, HTTP und Modell gleichzeitig statt in einem Wasserfall", async () => {
  const f = fixture();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  f.sources.serviceState.mockImplementation(async () => { await pending; return "active"; });
  const status = f.service.get();
  expect(f.get.mock.calls.map(([path]) => path)).toEqual(["/api/status", "/api/model/info"]);
  expect(f.sources.checkoutCommit).toHaveBeenCalledOnce();
  release();
  await status;
});

it("trennt Teilfehler und invalidiert Status und Commit passend zu Aktionen/Updates", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.get.mockImplementation(async (path) => {
    if (path === "/api/model/info") throw new Error("model offline");
    return { version: "fixture" };
  });
  expect(await f.service.get()).toMatchObject({ reachable: true, model: null });
  f.service.invalidate();
  await f.service.get();
  expect(f.get).toHaveBeenCalledTimes(4);
  expect(f.sources.checkoutCommit).toHaveBeenCalledOnce();
  f.finishUpdate();
  await f.service.get();
  expect(f.sources.checkoutCommit).toHaveBeenCalledTimes(2);
  f.get.mockRejectedValue(new HermesClientError("DASHBOARD_UNREACHABLE", "offline", 502, true));
  vi.advanceTimersByTime(2_000);
  expect(await f.service.get()).toMatchObject({ reachable: false, model: null });
  expect(f.sources.checkoutCommit).toHaveBeenCalledTimes(2);
  f.service.invalidate(true);
  await f.service.get();
  expect(f.sources.checkoutCommit).toHaveBeenCalledTimes(3);
});

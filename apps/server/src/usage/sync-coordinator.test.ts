import { describe, expect, it, vi } from "vitest";
import { UsageSyncCoordinator } from "./sync-coordinator.js";

/** Steuerbares Promise für die Reihenfolge der Zweige im Test. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("UsageSyncCoordinator", () => {
  it("meldet liveRunning erst am Ende des Limit-Zweigs und running erst nach beiden Zweigen", async () => {
    const limits = deferred();
    const analytics = deferred();
    const coordinator = new UsageSyncCoordinator({
      refreshLimits: () => limits.promise,
      refreshAnalytics: () => analytics.promise,
    });

    coordinator.start();
    expect(coordinator.status()).toMatchObject({ running: true, liveRunning: true, lastCompletedAt: null });

    // Die Auswertung endet zuerst: running bleibt true, liveRunning bleibt true.
    analytics.resolve();
    await analytics.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(coordinator.status().running).toBe(true);
    expect(coordinator.status().liveRunning).toBe(true);

    // Erst das Ende der Limitdaten schließt den Sync ab.
    limits.resolve();
    await vi.waitFor(() => expect(coordinator.status().running).toBe(false));
    expect(coordinator.status().liveRunning).toBe(false);
    expect(coordinator.status().lastCompletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("beendet den Sync auch, wenn ein Zweig fehlschlägt", async () => {
    const analytics = deferred();
    const coordinator = new UsageSyncCoordinator({
      refreshLimits: () => Promise.reject(new Error("Limits kaputt")),
      refreshAnalytics: () => analytics.promise,
    });

    coordinator.start();
    await vi.waitFor(() => expect(coordinator.status().liveRunning).toBe(false));
    expect(coordinator.status().running).toBe(true);

    analytics.resolve();
    await vi.waitFor(() => expect(coordinator.status().running).toBe(false));
    expect(coordinator.status().lastCompletedAt).not.toBeNull();
  });

  it("startet einen laufenden Sync nicht doppelt", async () => {
    const limits = deferred();
    const refreshLimits = vi.fn(() => limits.promise);
    const refreshAnalytics = vi.fn().mockResolvedValue(undefined);
    const coordinator = new UsageSyncCoordinator({ refreshLimits, refreshAnalytics });

    coordinator.start();
    coordinator.start();
    expect(refreshLimits).toHaveBeenCalledTimes(1);
    expect(refreshAnalytics).toHaveBeenCalledTimes(1);

    limits.resolve();
    await vi.waitFor(() => expect(coordinator.status().running).toBe(false));

    coordinator.start();
    expect(refreshLimits).toHaveBeenCalledTimes(2);
  });
});

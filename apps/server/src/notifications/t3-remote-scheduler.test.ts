import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteT3PollScheduler, remoteT3SourceKey } from "./t3-remote-scheduler.js";

afterEach(() => vi.useRealTimers());
const sources = Array.from({ length: 4 }, (_, index) => ({ host: `host-${index}`, databasePath: "/state.sqlite" }));

describe("Remote-T3-Pollplanung", () => {
  it.each([1_000, 10_000, 20_000])("hält bei %i ms höchstens einen Read pro Quelle und lässt schnelle Quellen weiterlaufen", async (latency) => {
    vi.useFakeTimers();
    const scheduler = new RemoteT3PollScheduler(5_000, 4, 300_000, () => 0.5);
    const active = new Map<string, number>();
    const maximum = new Map<string, number>();
    const calls = new Map<string, number>();
    const read = async (source: typeof sources[number]) => {
      const key = remoteT3SourceKey(source);
      active.set(key, (active.get(key) ?? 0) + 1);
      maximum.set(key, Math.max(maximum.get(key) ?? 0, active.get(key)!));
      calls.set(key, (calls.get(key) ?? 0) + 1);
      await new Promise((resolve) => setTimeout(resolve, source.host === "host-0" ? latency : 1_000));
      active.set(key, active.get(key)! - 1);
    };
    const pending: Promise<void>[] = [];
    for (let tick = 0; tick < 8; tick += 1) {
      pending.push(scheduler.run(sources, read));
      await vi.advanceTimersByTimeAsync(5_000);
    }
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.all(pending);
    expect([...maximum.values()]).toEqual([1, 1, 1, 1]);
    expect(calls.get(remoteT3SourceKey(sources[1]!))).toBe(8);
    expect(calls.get(remoteT3SourceKey(sources[0]!))).toBe(latency === 1_000 ? 8 : latency === 10_000 ? 4 : 2);
    await scheduler.stop();
  });

  it("begrenzt FIFO-Parallelität und dedupliziert auch wartende Quellen", async () => {
    vi.useFakeTimers();
    const scheduler = new RemoteT3PollScheduler(5_000, 2, 300_000);
    const order: string[] = [];
    let active = 0;
    let maximum = 0;
    const read = vi.fn(async (source: typeof sources[number]) => {
      order.push(source.host);
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      active -= 1;
    });
    const first = scheduler.run(sources, read);
    const duplicate = scheduler.run(sources, read);
    await vi.advanceTimersByTimeAsync(40_000);
    await Promise.all([first, duplicate]);
    expect(order).toEqual(sources.map((source) => source.host));
    expect(maximum).toBe(2);
    expect(read).toHaveBeenCalledTimes(4);
    await scheduler.stop();
  });

  it("begrenzt Fehlerbackoff, setzt ihn nach Erfolg zurück und trennt Datenbanken desselben Hosts", async () => {
    vi.useFakeTimers();
    const scheduler = new RemoteT3PollScheduler(5_000, 2, 15_000, () => 0.5);
    const source = sources[0]!;
    const other = { ...source, databasePath: "/other.sqlite" };
    const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    await scheduler.run([source], read);
    await vi.advanceTimersByTimeAsync(9_999);
    await scheduler.run([source], read);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await scheduler.run([source], read);
    await scheduler.run([other], read);
    expect(read).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(15_000);
    await scheduler.run([source], read);
    await vi.advanceTimersByTimeAsync(5_000);
    await scheduler.run([source], read);
    expect(read).toHaveBeenCalledTimes(5);
    await scheduler.stop();
  });

  it("bricht aktive Reads ab und startet beim Stop keine wartenden SSH-Prozesse", async () => {
    const scheduler = new RemoteT3PollScheduler(5_000, 1, 300_000);
    const read = vi.fn(async (_source, signal: AbortSignal) => {
      await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    });
    const pending = scheduler.run(sources, read);
    await scheduler.stop();
    await pending;
    await scheduler.run(sources, read);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

import { expect, it, vi } from "vitest";
import { createAsyncCache } from "./cache.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it("verwirft einen laufenden alten Ladevorgang nach Invalidierung", async () => {
  const old = deferred<string>();
  const fresh = deferred<string>();
  const loader = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const cache = createAsyncCache(10_000, loader);
  const before = cache.get();
  cache.clear();
  const after = cache.get();
  old.resolve("alter Projektbestand");
  expect(await before).toBe("alter Projektbestand");
  const concurrent = cache.get();
  expect(loader).toHaveBeenCalledTimes(2);
  fresh.resolve("neues Projekt");
  expect(await after).toBe("neues Projekt");
  expect(await concurrent).toBe("neues Projekt");
  expect(await cache.get()).toBe("neues Projekt");
});

it("cached keine Fehler und bündelt den erneuten Versuch", async () => {
  const loader = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(0);
  const cache = createAsyncCache(10_000, loader);
  await expect(cache.get()).rejects.toThrow("offline");
  expect(await Promise.all([cache.get(), cache.get()])).toEqual([0, 0]);
  expect(loader).toHaveBeenCalledTimes(2);
});

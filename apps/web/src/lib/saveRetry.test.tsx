// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSaveRetry } from "./saveRetry";

afterEach(() => vi.useRealTimers());

it("plant Backoff-Läufe und setzt den Zähler nach Erfolg zurück", async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useSaveRetry());
  act(() => { expect(result.current.schedule()).toBe(true); });
  expect(result.current.nextDelayMs()).toBe(2_000);
  expect(result.current.retryAt).toBeGreaterThan(Date.now());
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(result.current.tick).toBe(1);
  expect(result.current.retryAt).toBe(0);
  expect(result.current.attempts).toBe(1);
  act(() => result.current.reset());
  expect(result.current.attempts).toBe(0);
  expect(result.current.nextDelayMs()).toBe(1_000);
});

it("blockiert nach fünf Fehlversuchen bis zur Nutzeraktion", async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useSaveRetry());
  const scheduled: boolean[] = [];
  for (let index = 0; index < 6; index += 1) {
    scheduled.push(result.current.schedule());
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  }
  expect(scheduled).toEqual([true, true, true, true, true, false]);
  expect(result.current.blocked).toBe(true);
  act(() => result.current.trigger());
  expect(result.current.blocked).toBe(false);
  expect(result.current.attempts).toBe(0);
});

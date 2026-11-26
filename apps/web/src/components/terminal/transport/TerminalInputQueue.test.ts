// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { TerminalInputQueue } from "./TerminalInputQueue";
import type { ClientMessage } from "../terminal-types";

afterEach(() => vi.useRealTimers());

test("sendet die erste Taste sofort und bündelt Trackpad-Ereignisse verlustfrei", () => {
  vi.useFakeTimers();
  const send = vi.fn<(message: ClientMessage) => boolean>(() => true);
  const queue = new TerminalInputQueue(send);
  const data = "\x1b[<64;1;1M";
  for (let index = 0; index < 600; index++) {
    expect(queue.enqueue({ type: "terminal.input", sessionId: "one", data })).toBe(true);
    vi.advanceTimersByTime(8);
  }
  queue.flush();
  expect(send.mock.calls.length).toBeLessThan(85);
  expect(send.mock.calls.map(([message]) => (message as { data: string }).data).join("")).toBe(data.repeat(600));
});

test("behält die Reihenfolge verschiedener Sitzungen und leert vor Steueraktionen", () => {
  vi.useFakeTimers();
  const received: string[] = [];
  const queue = new TerminalInputQueue((message) => { if (message.type === "terminal.input") received.push(`${message.sessionId}:${message.data}`); return true; });
  queue.enqueue({ type: "terminal.input", sessionId: "one", data: "a" });
  expect(received).toEqual(["one:a"]);
  queue.enqueue({ type: "terminal.input", sessionId: "one", data: "b" });
  queue.enqueue({ type: "terminal.input", sessionId: "two", data: "c" });
  queue.enqueue({ type: "terminal.input", sessionId: "one", data: "d" });
  queue.flush();
  expect(received).toEqual(["one:a", "one:b", "two:c", "one:d"]);
});

test("meldet bei einem Teilfehler nur den nicht gesendeten Rest und wiederholt nichts", () => {
  vi.useFakeTimers();
  const sent: string[] = [];
  const discard = vi.fn();
  let fail = false;
  const queue = new TerminalInputQueue((message) => {
    if (fail) return false;
    if (message.type === "terminal.input") sent.push(message.data);
    return true;
  }, discard);

  queue.enqueue({ type: "terminal.input", sessionId: "one", data: "a" });
  queue.enqueue({ type: "terminal.input", sessionId: "one", data: "b" });
  queue.enqueue({ type: "terminal.input", sessionId: "two", data: "c" });
  fail = true;
  expect(queue.flush()).toBe(false);

  expect(sent).toEqual(["a"]);
  expect(discard).toHaveBeenCalledWith(["one", "two"]);
  // Der bereits gesendete Block bleibt einmalig; ein weiterer Flush sendet nichts.
  queue.flush();
  expect(sent).toEqual(["a"]);
});

test("meldet unterbrochene Eingaben und führt sie nach Reconnect nicht aus", () => {
  vi.useFakeTimers();
  const send = vi.fn(() => true);
  const discard = vi.fn();
  const queue = new TerminalInputQueue(send, discard);
  queue.enqueue({ type: "terminal.input", sessionId: "one", data: "erste" });
  queue.enqueue({ type: "terminal.input", sessionId: "one", data: "gefährlicher Befehl\r" });
  queue.reset();
  vi.advanceTimersByTime(1_000);
  expect(discard).toHaveBeenCalledWith(["one"]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

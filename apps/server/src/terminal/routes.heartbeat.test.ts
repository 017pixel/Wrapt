import { afterEach, describe, expect, it, vi } from "vitest";
import { attachTerminalSocketHeartbeat } from "./routes.js";

/** Socket-Attrappe mit steuerbarem Pong — ohne echten Netzwerkverkehr. */
function fakeSocket() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return undefined;
    }),
    pong: () => { for (const listener of listeners.get("pong") ?? []) listener(); },
  };
}

describe("Terminal-Socket-Heartbeat", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("pingt im Intervall und räumt einen Client ohne Pong", () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    const stop = attachTerminalSocketHeartbeat(socket, 1_000);

    vi.advanceTimersByTime(1_000);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.terminate).not.toHaveBeenCalled();

    // Ein volles Intervall ohne Pong: Der Client gilt als tot.
    vi.advanceTimersByTime(1_000);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    stop();
  });

  it("bleibt bei beantworteten Pings dauerhaft verbunden", () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    const stop = attachTerminalSocketHeartbeat(socket, 1_000);

    for (let round = 0; round < 5; round += 1) {
      vi.advanceTimersByTime(1_000);
      socket.pong();
    }
    expect(socket.ping).toHaveBeenCalledTimes(5);
    expect(socket.terminate).not.toHaveBeenCalled();
    stop();
  });

  it("beendet das Intervall über die Aufräumfunktion", () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    const stop = attachTerminalSocketHeartbeat(socket, 1_000);
    stop();
    vi.advanceTimersByTime(5_000);
    expect(socket.ping).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
  });
});

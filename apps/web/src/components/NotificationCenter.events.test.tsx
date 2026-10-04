// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification } from "@wrapt/contracts";
import { NotificationCenter } from "./NotificationCenter";

class EventSocket {
  static instances: EventSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly close = vi.fn(() => this.onclose?.());

  constructor(readonly url: string) {
    EventSocket.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  receive(data: string) {
    this.onmessage?.({ data });
  }
}

const notification: Notification = {
  id: "11111111-1111-4111-8111-111111111111",
  source: "wrapt",
  kind: "task.finished",
  severity: "success",
  category: "coding-agent",
  sourceIcon: "wrapt",
  state: "active",
  title: "Aufgabe beendet",
  body: "Die Aufgabe wurde abgeschlossen.",
  link: null,
  remoteId: null,
  createdAt: "2026-10-02T12:00:00Z",
  readAt: null,
  acknowledgedAt: null,
  deletedAt: null,
  resolvedAt: null,
  meta: {},
  report: null,
};

let client: QueryClient;

function renderEvents() {
  return render(<QueryClientProvider client={client}><NotificationCenter /></QueryClientProvider>);
}

function latestSocket() {
  return EventSocket.instances.at(-1)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", EventSocket);
  EventSocket.instances = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Benachrichtigungs-Ereigniskanal", () => {
  it.each([
    { type: "notification.created", notification },
    { type: "notification.updated", notification },
    { type: "notification.removed", id: notification.id },
    { type: "notification.sync" },
  ])("aktualisiert alle Benachrichtigungsabfragen bei $type", (event) => {
    client.setQueryData(["notifications", false], { notifications: [] });
    client.setQueryData(["notifications", true], { notifications: [] });
    client.setQueryData(["usage"], { accounts: [] });
    renderEvents();
    act(() => latestSocket().receive(JSON.stringify(event)));

    expect(client.getQueryState(["notifications", false])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["notifications", true])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["usage"])?.isInvalidated).toBe(false);
  });

  it("ignoriert beschädigtes JSON und Events mit ungültigem Vertrag", () => {
    client.setQueryData(["notifications", false], { notifications: [] });
    renderEvents();
    for (const data of [
      "{",
      JSON.stringify({ type: "unknown.event" }),
      JSON.stringify({ type: "notification.removed", id: "keine-uuid" }),
      JSON.stringify({ type: "notification.updated", notification: null }),
    ]) {
      act(() => latestSocket().receive(data));
      expect(client.getQueryState(["notifications", false])?.isInvalidated).toBe(false);
    }
  });

  it("verbindet nach Abbrüchen mit wachsender Wartezeit und höchstens 15 Sekunden erneut", () => {
    renderEvents();
    const url = latestSocket().url;
    for (const delay of [1_000, 2_000, 4_000, 8_000, 15_000, 15_000]) {
      const count = EventSocket.instances.length;
      act(() => latestSocket().close());
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(EventSocket.instances).toHaveLength(count);
      act(() => vi.advanceTimersByTime(1));
      expect(EventSocket.instances).toHaveLength(count + 1);
      expect(latestSocket().url).toBe(url);
    }
  });

  it("setzt die Wartezeit nach einer erfolgreichen Verbindung zurück", () => {
    renderEvents();
    act(() => latestSocket().close());
    act(() => vi.advanceTimersByTime(1_000));
    act(() => latestSocket().close());
    act(() => vi.advanceTimersByTime(2_000));
    act(() => latestSocket().open());
    act(() => latestSocket().close());
    act(() => vi.advanceTimersByTime(1_000));
    expect(EventSocket.instances).toHaveLength(4);
  });

  it("schließt die offene Verbindung beim Unmount ohne eine neue zu starten", () => {
    const { unmount } = renderEvents();
    const socket = latestSocket();
    act(() => socket.open());
    unmount();
    expect(socket.close).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(30_000));
    expect(EventSocket.instances).toHaveLength(1);
  });

  it("verwirft eine bereits geplante Wiederverbindung beim Unmount", () => {
    const { unmount } = renderEvents();
    act(() => latestSocket().close());
    unmount();
    act(() => vi.advanceTimersByTime(30_000));
    expect(EventSocket.instances).toHaveLength(1);
  });
});

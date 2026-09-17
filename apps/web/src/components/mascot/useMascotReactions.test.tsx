// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMascotReactions } from "./useMascotReactions";

const mocks = vi.hoisted(() => ({
  restartStatus: vi.fn(),
  notifications: vi.fn(),
}));

vi.mock("../../lib/apiClient", () => ({
  apiClient: {
    restartStatus: mocks.restartStatus,
    notifications: mocks.notifications,
  },
}));

const restartBase = {
  jobId: null as string | null,
  target: null,
  exitCode: null,
  step: "",
  message: "",
  startedAt: null,
  logTail: "",
  logFile: null,
};

const succeededStatus = (jobId: string, updatedAt = new Date().toISOString()) => ({
  ...restartBase,
  jobId,
  phase: "succeeded",
  updatedAt,
});

function renderReactions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const react = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useMascotReactions(react), { wrapper });
  return { client, react, hook };
}

/** Lässt Abruf, Benachrichtigung und Wirkung durchlaufen (falsche Timer). */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

describe("useMascotReactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.restartStatus.mockResolvedValue({ ...restartBase, phase: "running" });
    mocks.notifications.mockResolvedValue({
      notifications: [],
      unreadCount: 1,
      unacknowledgedErrorCount: 0,
      nextCursor: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("feiert den gelungenen Neustart genau einmal", async () => {
    vi.useFakeTimers();
    const { client, react, hook } = renderReactions();
    await settle();
    expect(react).not.toHaveBeenCalled();

    const succeeded = succeededStatus("11111111-1111-4111-8111-111111111111");
    act(() => {
      client.setQueryData(["system", "restart-status"], succeeded);
    });
    await settle();
    expect(react).toHaveBeenCalledWith("party");
    expect(react).toHaveBeenCalledTimes(1);

    // Erst nach der Feier wird der Neustart vermerkt.
    expect(window.localStorage.getItem("wrapt.mascot.restart-party.v1")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(window.localStorage.getItem("wrapt.mascot.restart-party.v1")).toBe(succeeded.jobId);
    hook.unmount();

    mocks.restartStatus.mockResolvedValue(succeeded);
    const second = renderReactions();
    await settle();
    expect(second.react).not.toHaveBeenCalled();
  });

  it("holt die Feier nach einem Neuladen mitten in der Sequenz nach", async () => {
    vi.useFakeTimers();
    const { client, react, hook } = renderReactions();
    await settle();

    const succeeded = succeededStatus("44444444-4444-4444-8444-444444444444");
    act(() => {
      client.setQueryData(["system", "restart-status"], succeeded);
    });
    await settle();
    expect(react).toHaveBeenCalledWith("party");

    // Neuladen vor dem Vermerk: die neue Seite feiert erneut.
    hook.unmount();
    expect(window.localStorage.getItem("wrapt.mascot.restart-party.v1")).toBeNull();
    mocks.restartStatus.mockResolvedValue(succeeded);
    const second = renderReactions();
    await settle();
    expect(second.react).toHaveBeenCalledWith("party");
  });

  it("feiert auch nach einem Neuladen, wenn der Abschluss zwischen zwei Abfragen lag", async () => {
    mocks.restartStatus.mockResolvedValue(succeededStatus("22222222-2222-4222-8222-222222222222"));
    const { react } = renderReactions();
    await waitFor(() => expect(react).toHaveBeenCalledWith("party"));
  });

  it("feiert einen alten Neustart nicht nach", async () => {
    mocks.restartStatus.mockResolvedValue(
      succeededStatus("33333333-3333-4333-8333-333333333333", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
    );
    const { client, react } = renderReactions();
    await waitFor(() => expect(client.getQueryData(["system", "restart-status"])).toBeTruthy());
    expect(react).not.toHaveBeenCalled();
  });

  it("hüpft nur bei neu eingetroffenen Benachrichtigungen", async () => {
    const { client, react } = renderReactions();
    await waitFor(() => expect(client.getQueryData(["notifications", false])).toBeTruthy());
    expect(react).not.toHaveBeenCalled();

    client.setQueryData(["notifications", false], {
      notifications: [],
      unreadCount: 2,
      unacknowledgedErrorCount: 0,
      nextCursor: null,
    });
    await waitFor(() => expect(react).toHaveBeenCalledWith("hop"));
    expect(react).toHaveBeenCalledTimes(1);
  });
});

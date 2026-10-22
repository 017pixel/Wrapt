// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalToastRegion } from "./TerminalToastRegion";
import { useTerminalNotifications } from "./useTerminalNotifications";
import { useTerminalNotices } from "./terminalNotifications";
import type { TerminalRenderer } from "./engine/rendererTypes";

afterEach(() => { cleanup(); useTerminalNotices.setState({ notices: [] }); vi.useRealTimers(); });

function renderer(status: TerminalRenderer["status"], error: string | null = null): TerminalRenderer {
  return { status, error, restartBanner: null, restart: vi.fn(), resync: vi.fn() } as unknown as TerminalRenderer;
}

test("kurze Verbindungswechsel bleiben still, längere Unterbrechungen erscheinen außerhalb des Terminals", () => {
  vi.useFakeTimers();
  render(<><section className="terminal-session" /><TerminalToastRegion /></>);
  const view = renderHook(({ state }) => useTerminalNotifications("one", true, state), { initialProps: { state: renderer("connecting") } });
  act(() => vi.advanceTimersByTime(500));
  view.rerender({ state: renderer("connected") });
  act(() => vi.advanceTimersByTime(1_000));
  expect(screen.queryByRole("status")).toBeNull();
  view.rerender({ state: renderer("disconnected") });
  act(() => vi.advanceTimersByTime(1_200));
  const toast = screen.getByRole("status");
  expect(toast.closest(".terminal-session")).toBeNull();
  expect(toast.closest(".terminal-toasts")).toBeTruthy();
  view.rerender({ state: renderer("connected") });
  expect(screen.queryByRole("status")).toBeNull();
});

test("ersetzt wiederholte Fehler und erlaubt Schließen sowie erneutes Verbinden", () => {
  vi.useFakeTimers();
  render(<TerminalToastRegion />);
  const current = renderer("error", "Testfehler");
  renderHook(() => useTerminalNotifications("one", true, current));
  act(() => screen.getByRole("button", { name: "Erneut versuchen" }).click());
  expect(current.resync).toHaveBeenCalledOnce();
  act(() => useTerminalNotices.getState().show({ id: "terminal:one:error", tone: "error", message: "Neuer Fehler" }));
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain("Neuer Fehler");
  act(() => screen.getByRole("button", { name: "Terminalhinweis schließen" }).click());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("geparkte Terminals erzeugen keine Verbindungs-Toasts und hinterlassen keine Timer", () => {
  vi.useFakeTimers();
  const view = renderHook(() => useTerminalNotifications("parked", false, renderer("disconnected")));
  act(() => vi.advanceTimersByTime(30_000));
  expect(useTerminalNotices.getState().notices).toEqual([]);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

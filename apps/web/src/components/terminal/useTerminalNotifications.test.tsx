// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalToastRegion } from "./TerminalToastRegion";
import { useTerminalNotifications } from "./useTerminalNotifications";
import { useTerminalNotices } from "./terminalNotifications";
import type { TerminalRenderer } from "./engine/rendererTypes";

afterEach(() => { cleanup(); useTerminalNotices.setState({ notices: [] }); vi.useRealTimers(); });

function renderer(
  status: TerminalRenderer["status"],
  error: string | null = null,
  restartBanner: { message: string } | null = null,
): TerminalRenderer {
  return { status, error, restartBanner, restart: vi.fn(), resync: vi.fn() } as unknown as TerminalRenderer;
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
  act(() => useTerminalNotices.getState().show({ id: "terminal:error:Neuer Fehler", tone: "error", message: "Neuer Fehler" }));
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain("Neuer Fehler");
  act(() => screen.getByRole("button", { name: "Terminalhinweis schließen" }).click());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("dedupliziert Verbindungshinweise im Split-View pro Socket", () => {
  vi.useFakeTimers();
  render(<TerminalToastRegion />);
  const left = renderHook(({ state }) => useTerminalNotifications("left", true, state), { initialProps: { state: renderer("disconnected") } });
  const right = renderHook(({ state }) => useTerminalNotifications("right", true, state), { initialProps: { state: renderer("disconnected") } });
  act(() => vi.advanceTimersByTime(1_200));

  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toContain("unterbrochen");

  left.rerender({ state: renderer("connected") });
  expect(screen.getAllByRole("status")).toHaveLength(1);
  right.rerender({ state: renderer("connected") });
  expect(screen.queryByRole("status")).toBeNull();
});

test("zeigt während eines automatischen Neustarts keinen zweiten Verbindungstoast", () => {
  vi.useFakeTimers();
  render(<TerminalToastRegion />);
  renderHook(() => useTerminalNotifications("one", true, renderer("connecting", null, { message: "Neuer Versuch 1 von 3" })));

  act(() => vi.advanceTimersByTime(1_200));

  const statuses = screen.getAllByRole("status");
  expect(statuses).toHaveLength(1);
  expect(statuses[0]!.textContent).toContain("Neuer Versuch 1 von 3");
  expect(screen.queryByText(/wird verbunden/)).toBeNull();
});

test("dedupliziert denselben Auth-Fehler aus mehreren Panes", () => {
  render(<TerminalToastRegion />);
  renderHook(() => useTerminalNotifications("left", true, renderer("error", "Terminalzugriff verweigert.")));
  renderHook(() => useTerminalNotifications("right", true, renderer("error", "Terminalzugriff verweigert.")));

  const alerts = screen.getAllByRole("alert");
  expect(alerts).toHaveLength(1);
  expect(alerts[0]!.textContent).toContain("Terminalzugriff verweigert.");
});

test("hält Fehler sichtbar und zeigt sie nach einem Fokus erneut", () => {
  vi.useFakeTimers();
  render(<TerminalToastRegion />);
  renderHook(() => useTerminalNotifications("one", true, renderer("error", "Testfehler")));

  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("alert").textContent).toContain("Testfehler");

  act(() => screen.getByRole("button", { name: "Terminalhinweis schließen" }).click());
  expect(screen.queryByRole("alert")).toBeNull();

  act(() => window.dispatchEvent(new Event("focus")));
  expect(screen.getByRole("alert").textContent).toContain("Testfehler");
});

test("geparkte Terminals erzeugen keine Verbindungs-Toasts und hinterlassen keine Timer", () => {
  vi.useFakeTimers();
  const view = renderHook(() => useTerminalNotifications("parked", false, renderer("disconnected")));
  act(() => vi.advanceTimersByTime(30_000));
  expect(useTerminalNotices.getState().notices).toEqual([]);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test("entfernt sichtbare Verbindungshinweise beim Parken", () => {
  vi.useFakeTimers();
  render(<TerminalToastRegion />);
  const view = renderHook(
    ({ active }: { active: boolean }) => useTerminalNotifications("one", active, renderer("disconnected")),
    { initialProps: { active: true } },
  );
  act(() => vi.advanceTimersByTime(1_200));
  expect(screen.getByRole("status").textContent).toContain("unterbrochen");

  view.rerender({ active: false });
  expect(screen.queryByRole("status")).toBeNull();
  expect(useTerminalNotices.getState().notices).toEqual([]);
});

test("entfernt beim Unmount alle Hinweise des Terminals", () => {
  vi.useFakeTimers();
  render(<TerminalToastRegion />);
  const view = renderHook(() => useTerminalNotifications("one", true, renderer("error", "Testfehler", { message: "Neustart" })));
  expect(useTerminalNotices.getState().notices).toHaveLength(2);
  view.unmount();
  expect(useTerminalNotices.getState().notices).toEqual([]);
});

test("leert den Neustart-Banner, sobald der Snapshot ihn zurücksetzt", () => {
  vi.useFakeTimers();
  render(<TerminalToastRegion />);
  const view = renderHook(
    ({ state }: { state: TerminalRenderer }) => useTerminalNotifications("one", true, state),
    { initialProps: { state: renderer("connecting", null, { message: "Neuer Versuch 1 von 3" }) } },
  );
  expect(screen.getByRole("status").textContent).toContain("Neuer Versuch 1 von 3");

  view.rerender({ state: renderer("connected") });
  expect(screen.queryByRole("status")).toBeNull();
  expect(useTerminalNotices.getState().notices).toEqual([]);
});

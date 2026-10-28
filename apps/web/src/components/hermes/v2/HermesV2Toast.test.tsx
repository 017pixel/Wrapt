// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HermesV2Toast } from "./HermesV2Toast";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("bündelt Meldungen außerhalb der Chatfläche und entfernt die Ecke nach dem Unmount", () => {
  const { container, unmount } = render(<><HermesV2Toast message="Verbindung unterbrochen" /><HermesV2Toast message="Nur lesend" tone="warning" /></>);
  expect(container.textContent).toBe("");
  expect(screen.getAllByRole("complementary")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain("Verbindung unterbrochen");
  expect(screen.getByRole("status").textContent).toContain("Nur lesend");
  unmount();
  expect(screen.queryByLabelText("Hermes-Meldungen")).toBeNull();
});

it("pausiert während der Interaktion und blendet danach automatisch aus", () => {
  vi.useFakeTimers();
  render(<HermesV2Toast message="Katalog nicht erreichbar"><button>Erneut laden</button></HermesV2Toast>);
  fireEvent.pointerEnter(screen.getByRole("alert"));
  act(() => vi.advanceTimersByTime(20_000));
  expect(screen.getByRole("button", { name: "Erneut laden" })).toBeTruthy();
  fireEvent.pointerLeave(screen.getByRole("alert"));
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("schließt nur die gewählte Meldung und führt deren Callback aus", () => {
  const close = vi.fn();
  render(<><HermesV2Toast message="Fehler" onDismiss={close} /><HermesV2Toast message="Hinweis" tone="warning" /></>);
  fireEvent.click(screen.getAllByRole("button", { name: "Hermes-Meldung schließen" })[0]!);
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("status")).toBeTruthy();
});

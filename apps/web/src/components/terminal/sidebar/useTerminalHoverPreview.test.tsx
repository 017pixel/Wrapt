// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTerminalHoverPreview } from "./useTerminalHoverPreview";

afterEach(() => {
  vi.useRealTimers();
});

describe("useTerminalHoverPreview", () => {
  it("zeigt die Vorschau erst nach 300 ms Schweben", () => {
    vi.useFakeTimers();
    const anchor = document.createElement("div");
    const { result } = renderHook(() => useTerminalHoverPreview(true));

    act(() => { result.current.start("eintrag", anchor); });
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current.preview).toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.preview).toEqual({ entryId: "eintrag", anchor });
  });

  it("verwirft eine geplante Vorschau, sobald der Zeiger die Zeile verlässt", () => {
    vi.useFakeTimers();
    const anchor = document.createElement("div");
    const { result } = renderHook(() => useTerminalHoverPreview(true));

    act(() => { result.current.start("eintrag", anchor); });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { result.current.end("eintrag"); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.preview).toBeNull();
  });

  it("zeigt ohne Maus-Bedienung keine Vorschau", () => {
    vi.useFakeTimers();
    const anchor = document.createElement("div");
    const { result } = renderHook(() => useTerminalHoverPreview(false));

    act(() => { result.current.start("eintrag", anchor); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.preview).toBeNull();
  });
});

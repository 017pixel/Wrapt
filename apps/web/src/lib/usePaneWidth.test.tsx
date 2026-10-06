// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { expect, it, vi } from "vitest";
import { usePaneWidth } from "./usePaneWidth";

it("beendet einen aktiven Größenwechsel beim Verlassen der Fläche", () => {
  const remove = vi.spyOn(window, "removeEventListener");
  document.body.style.cursor = "pointer";
  const { result, unmount } = renderHook(() => usePaneWidth({ storageKey: "audit-pane", initial: 200, min: 100, max: 500 }));
  act(() => result.current.startResize({ preventDefault: vi.fn(), clientX: 50 } as unknown as ReactPointerEvent<HTMLElement>));
  expect(document.body.style.cursor).toBe("col-resize");
  unmount();
  expect(document.body.style.cursor).toBe("pointer");
  expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("pointerup", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("pointercancel", expect.any(Function));
  document.body.style.cursor = "";
  remove.mockRestore();
});

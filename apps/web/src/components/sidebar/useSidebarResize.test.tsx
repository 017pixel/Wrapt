// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSidebarResize } from "./useSidebarResize";

let frameCallback: FrameRequestCallback | null = null;

function pointerEvent(type: string, clientX: number, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

function setup(width: number, collapsed = false) {
  const shell = document.createElement("div");
  shell.className = "sidebar-shell";
  const trigger = document.createElement("button");
  trigger.className = "workspace-switcher-trigger";
  shell.append(trigger);
  const handle = document.createElement("div");
  handle.className = "sidebar-resize-handle";
  Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() });
  Object.defineProperty(handle, "hasPointerCapture", { value: () => true });
  Object.defineProperty(handle, "releasePointerCapture", { value: vi.fn() });
  document.body.append(shell, handle);
  const onCommit = vi.fn();
  const view = renderHook(() => useSidebarResize({
    collapsed,
    width,
    maxWidth: 400,
    shellRef: { current: shell },
    onCommit,
  }));
  return { ...view, shell, handle, trigger, onCommit };
}

function startDrag(handle: HTMLDivElement, clientX: number, onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void) {
  onPointerDown({
    preventDefault: vi.fn(),
    pointerType: "mouse",
    button: 0,
    pointerId: 1,
    clientX,
    currentTarget: handle,
  } as unknown as ReactPointerEvent<HTMLDivElement>);
}

function move(clientX: number) {
  window.dispatchEvent(pointerEvent("pointermove", clientX));
  const callback = frameCallback;
  frameCallback = null;
  callback?.(0);
}

beforeEach(() => {
  frameCallback = null;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frameCallback = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => { frameCallback = null; });
});

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  vi.restoreAllMocks();
});

it("schreibt die Breite während des Ziehens direkt ans Element und rastet erst beim Loslassen", () => {
  const { shell, handle, trigger, onCommit, result } = setup(256);

  act(() => startDrag(handle, 256, result.current.onPointerDown));
  expect(shell.classList.contains("is-resizing")).toBe(true);
  expect(document.body.style.cursor).toBe("col-resize");
  expect(document.body.style.userSelect).toBe("none");
  expect(handle.setPointerCapture).toHaveBeenCalledWith(1);

  act(() => move(190));
  expect(shell.style.getPropertyValue("--sidebar-width")).toBe("190px");
  expect(shell.className).toContain("is-narrow");
  expect(trigger.className).not.toContain("is-compact");
  expect(onCommit).not.toHaveBeenCalled();

  act(() => window.dispatchEvent(pointerEvent("pointerup", 190)));
  expect(onCommit).toHaveBeenCalledWith({ collapsed: false, width: 208 });
  expect(shell.classList.contains("is-resizing")).toBe(false);
  expect(shell.className).not.toContain("is-compact");
  expect(trigger.className).not.toContain("is-compact");
  expect(shell.style.getPropertyValue("--sidebar-width")).toBe("208px");
  expect(document.body.style.cursor).toBe("");
});

it("folgt aus dem eingeklappten Zustand dem Zeiger und öffnet erst über 180 px", () => {
  const { shell, handle, onCommit, result } = setup(256, true);

  act(() => startDrag(handle, 56, result.current.onPointerDown));
  act(() => move(140));
  expect(shell.className).toContain("is-collapsed");
  expect(shell.style.getPropertyValue("--sidebar-width")).toBe("140px");

  act(() => move(300));
  expect(shell.className).not.toContain("is-collapsed");
  expect(shell.style.getPropertyValue("--sidebar-width")).toBe("300px");

  act(() => window.dispatchEvent(pointerEvent("pointerup", 300)));
  expect(onCommit).toHaveBeenCalledWith({ collapsed: false, width: 320 });
  expect(shell.style.getPropertyValue("--sidebar-width")).toBe("320px");
});

it("klappt an der Mindestbreite ein und merkt sich die vorherige Breite", () => {
  const { handle, onCommit, result } = setup(320);

  act(() => startDrag(handle, 320, result.current.onPointerDown));
  act(() => move(176));
  act(() => window.dispatchEvent(pointerEvent("pointerup", 176)));
  expect(onCommit).toHaveBeenCalledWith({ collapsed: true, width: 320 });
});

it("klappt auch bei sehr schmalem Zug ein", () => {
  const { handle, onCommit, result } = setup(320);

  act(() => startDrag(handle, 320, result.current.onPointerDown));
  act(() => move(120));
  act(() => window.dispatchEvent(pointerEvent("pointerup", 120)));
  expect(onCommit).toHaveBeenCalledWith({ collapsed: true, width: 320 });
});

it("rastet bei einem Klick ohne Bewegung nicht auf einen anderen Wert", () => {
  const { handle, onCommit, result } = setup(240);

  act(() => startDrag(handle, 240, result.current.onPointerDown));
  act(() => window.dispatchEvent(pointerEvent("pointerup", 240)));
  expect(onCommit).not.toHaveBeenCalled();
});

it("räumt bei pointercancel auf, ohne den Zustand zu ändern", () => {
  const { shell, handle, onCommit, result } = setup(256);

  act(() => startDrag(handle, 256, result.current.onPointerDown));
  act(() => move(200));
  act(() => window.dispatchEvent(pointerEvent("pointercancel", 200)));
  expect(onCommit).not.toHaveBeenCalled();
  expect(shell.style.getPropertyValue("--sidebar-width")).toBe("256px");
  expect(shell.classList.contains("is-resizing")).toBe(false);
  expect(document.body.style.cursor).toBe("");
});

it("ändert die Breite per Pfeiltasten", () => {
  const { onCommit, result } = setup(256);
  const key = (value: string, shiftKey = false) => ({
    key: value,
    shiftKey,
    preventDefault: vi.fn(),
  }) as unknown as ReactKeyboardEvent<HTMLDivElement>;

  act(() => result.current.onKeyDown(key("ArrowLeft")));
  expect(onCommit).toHaveBeenLastCalledWith({ collapsed: false, width: 248 });
  act(() => result.current.onKeyDown(key("ArrowRight", true)));
  expect(onCommit).toHaveBeenLastCalledWith({ collapsed: false, width: 288 });
});

it("klappt per Pfeil links am unteren Rand ein", () => {
  const { onCommit, result } = setup(176);
  const key = {
    key: "ArrowLeft",
    shiftKey: false,
    preventDefault: vi.fn(),
  } as unknown as ReactKeyboardEvent<HTMLDivElement>;

  act(() => result.current.onKeyDown(key));
  expect(onCommit).toHaveBeenCalledWith({ collapsed: true, width: 176 });
});

it("öffnet eingeklappt mit Pfeil rechts und ignoriert Pfeil links", () => {
  const { onCommit, result } = setup(256, true);
  const key = (value: string) => ({
    key: value,
    shiftKey: false,
    preventDefault: vi.fn(),
  }) as unknown as ReactKeyboardEvent<HTMLDivElement>;

  act(() => result.current.onKeyDown(key("ArrowLeft")));
  expect(onCommit).not.toHaveBeenCalled();
  act(() => result.current.onKeyDown(key("ArrowRight")));
  expect(onCommit).toHaveBeenCalledWith({ collapsed: false, width: 256 });
});

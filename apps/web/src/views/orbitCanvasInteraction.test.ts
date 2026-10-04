// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactFlowInstance } from "@xyflow/react";
import { useOrbitCanvasDrag } from "./orbitCanvasInteraction";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(interaction: "node" | "pane") {
  const canvasInteractionRef = { current: interaction as "node" | "pane" | null };
  const endCanvasInteraction = vi.fn(() => { canvasInteractionRef.current = null; });
  const setViewport = vi.fn();
  const instance = { setViewport: vi.fn() };
  const hook = renderHook(() => useOrbitCanvasDrag({
    canvasInteractionRef,
    instanceRef: { current: instance as unknown as ReactFlowInstance },
    beginCanvasInteraction: (next) => { canvasInteractionRef.current = next; },
    endCanvasInteraction,
    setViewport,
  }));
  return { ...hook, canvasInteractionRef, endCanvasInteraction, setViewport, instance };
}

it("hält den Node-Drag bis zum ReactFlow-Abschluss über pointerup und Capture-Verlust hinweg aktiv", () => {
  const { result, canvasInteractionRef, endCanvasInteraction, setViewport } = setup("node");
  const viewport = { x: 100, y: 200, zoom: .68 };
  act(() => result.current.beginNodeDrag(viewport));
  act(() => {
    window.dispatchEvent(new Event("pointerup"));
    window.dispatchEvent(new Event("lostpointercapture"));
  });
  expect(endCanvasInteraction).not.toHaveBeenCalled();
  expect(canvasInteractionRef.current).toBe("node");
  expect(result.current.nodeDragActive).toBe(true);

  // ReactFlows onNodeDragStop beendet Shield und Drag gemeinsam nach dem Mouseup.
  act(() => {
    endCanvasInteraction();
    result.current.completeNodeDrag();
  });
  expect(result.current.nodeDragActive).toBe(false);
  expect(canvasInteractionRef.current).toBeNull();
  expect(setViewport).toHaveBeenCalledWith(viewport);
});

it.each(["pointerup", "lostpointercapture"])("räumt Canvas-Panning bei %s weiterhin auf", (type) => {
  const { canvasInteractionRef, endCanvasInteraction } = setup("pane");
  act(() => window.dispatchEvent(new Event(type)));
  expect(endCanvasInteraction).toHaveBeenCalledOnce();
  expect(canvasInteractionRef.current).toBeNull();
});

it.each(["pointercancel", "blur"])("räumt einen abgebrochenen Node-Drag bei %s auf", (type) => {
  const { canvasInteractionRef, endCanvasInteraction } = setup("node");
  act(() => window.dispatchEvent(new Event(type)));
  expect(endCanvasInteraction).toHaveBeenCalledOnce();
  expect(canvasInteractionRef.current).toBeNull();
});

it("räumt die Interaktion auf, wenn die Seite unsichtbar wird", () => {
  const { endCanvasInteraction } = setup("node");
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(endCanvasInteraction).toHaveBeenCalledOnce();
});

it("entfernt die globalen Listener beim Verlassen des Canvas", () => {
  const { unmount, endCanvasInteraction } = setup("pane");
  unmount();
  for (const type of ["pointerup", "pointercancel", "lostpointercapture", "blur"]) window.dispatchEvent(new Event(type));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(endCanvasInteraction).not.toHaveBeenCalled();
});

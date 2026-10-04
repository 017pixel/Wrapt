import { useCallback, useEffect, useRef, useState } from "react";
import type { OrbitBoard } from "@wrapt/contracts";
import type { ReactFlowInstance } from "@xyflow/react";

type OrbitViewport = OrbitBoard["viewport"];
type CanvasInteraction = "node" | "pane";

interface OrbitCanvasDragOptions {
  canvasInteractionRef: { current: CanvasInteraction | null };
  instanceRef: { current: ReactFlowInstance | null };
  beginCanvasInteraction: (interaction: CanvasInteraction) => void;
  endCanvasInteraction: () => void;
  setViewport: (viewport: OrbitViewport) => void;
}

export function useOrbitCanvasDrag({ canvasInteractionRef, instanceRef, beginCanvasInteraction, endCanvasInteraction, setViewport }: OrbitCanvasDragOptions) {
  const nodeDragViewportRef = useRef<OrbitViewport | null>(null);
  const restoreNodeDragViewportRef = useRef<OrbitViewport | null>(null);
  const nodeDragActiveRef = useRef(false);
  const [nodeDragActive, setNodeDragActive] = useState(false);

  useEffect(() => {
    const handlePointerRelease = () => {
      // D3 beendet den Drag erst mit mouseup/touchend. Der Shield muss bis
      // dahin bleiben, sonst verwirft WebKit das Mouseup auf dem entfernten Ziel.
      if (canvasInteractionRef.current !== "node") endCanvasInteraction();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") endCanvasInteraction();
    };
    window.addEventListener("pointerup", handlePointerRelease, true);
    window.addEventListener("pointercancel", endCanvasInteraction, true);
    window.addEventListener("lostpointercapture", handlePointerRelease, true);
    window.addEventListener("blur", endCanvasInteraction);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointerup", handlePointerRelease, true);
      window.removeEventListener("pointercancel", endCanvasInteraction, true);
      window.removeEventListener("lostpointercapture", handlePointerRelease, true);
      window.removeEventListener("blur", endCanvasInteraction);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canvasInteractionRef, endCanvasInteraction]);

  const beginNodeDrag = (viewport: OrbitViewport | null) => {
    nodeDragActiveRef.current = true;
    setNodeDragActive(true);
    nodeDragViewportRef.current = viewport;
    restoreNodeDragViewportRef.current = null;
  };

  const completeNodeDrag = () => {
    const viewport = nodeDragViewportRef.current;
    nodeDragViewportRef.current = null;
    restoreNodeDragViewportRef.current = viewport;
    nodeDragActiveRef.current = false;
    setNodeDragActive(false);
    applyOrbitViewport(instanceRef.current, viewport, setViewport);
  };

  const beginCanvasPan = useCallback((nodeInteractionActive: boolean) => {
    if (nodeDragActiveRef.current || nodeInteractionActive) return false;
    nodeDragViewportRef.current = null;
    restoreNodeDragViewportRef.current = null;
    return true;
  }, []);

  const completeCanvasPan = useCallback((event: unknown, viewport: OrbitViewport) => {
    const restored = restoreNodeDragViewportRef.current;
    restoreNodeDragViewportRef.current = null;
    if (restored) applyOrbitViewport(instanceRef.current, restored, setViewport);
    else if (event) setViewport(viewport);
  }, [instanceRef, setViewport]);

  const startCanvasPan = useCallback(() => {
    if (!beginCanvasPan(canvasInteractionRef.current === "node")) return;
    beginCanvasInteraction("pane");
  }, [beginCanvasInteraction, canvasInteractionRef, beginCanvasPan]);
  const finishCanvasPan = useCallback((event: unknown, viewport: OrbitViewport) => {
    endCanvasInteraction();
    completeCanvasPan(event, viewport);
  }, [completeCanvasPan, endCanvasInteraction]);

  return { nodeDragActive, beginNodeDrag, completeNodeDrag, startCanvasPan, finishCanvasPan };
}

export function applyOrbitViewport(instance: ReactFlowInstance | null, viewport: OrbitViewport | null, setViewport: (viewport: OrbitViewport) => void) {
  if (!viewport) return;
  void instance?.setViewport(viewport, { duration: 0 });
  setViewport(viewport);
}

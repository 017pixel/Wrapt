import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { getActiveOrbitBoard } from "../stores/orbit";
import { orbitNodeWorldRectangle } from "./orbitSnap";
import { calculateOrbitFocusViewport } from "./orbitFocusViewport";
import { listenForOrbitNodeFocus } from "./orbitFocusRequest";

interface UseOrbitNodeFocusInput {
  wrapperRef: RefObject<HTMLDivElement | null>;
  instanceRef: RefObject<ReactFlowInstance | null>;
  isMobile: boolean;
  inspectorOpen: boolean;
  focusNode: (nodeId: string) => void;
}

export function useOrbitNodeFocus({ wrapperRef, instanceRef, isMobile, inspectorOpen, focusNode }: UseOrbitNodeFocusInput) {
  const animationRef = useRef(false);
  const focus = useCallback((nodeId: string) => {
    const board = getActiveOrbitBoard();
    const node = board.nodes.find((candidate) => candidate.id === nodeId);
    const instance = instanceRef.current;
    const wrapper = wrapperRef.current;
    if (!node || !instance || !wrapper) return;
    focusNode(nodeId);
    const rectangle = orbitNodeWorldRectangle(board, node);
    const bounds = wrapper.getBoundingClientRect();
    const viewport = calculateOrbitFocusViewport({
      node: { x: rectangle.position.x, y: rectangle.position.y, width: rectangle.size.width, height: rectangle.size.height },
      viewport: { width: bounds.width, height: bounds.height },
      insets: isMobile ? { top: 108, right: 12, bottom: 116, left: 12 } : { top: 82, right: inspectorOpen ? 324 : 188, bottom: 72, left: 12 },
      worldBounds: board.worldBounds,
      minZoom: .1,
      maxZoom: 2.2,
    });
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ? 0 : 240;
    animationRef.current = duration > 0;
    void instance.setViewport(viewport, { duration }).finally(() => { animationRef.current = false; });
  }, [focusNode, inspectorOpen, instanceRef, isMobile, wrapperRef]);
  const cancel = useCallback(() => {
    if (!animationRef.current) return;
    const instance = instanceRef.current;
    if (instance) void instance.setViewport(instance.getViewport(), { duration: 0 });
    animationRef.current = false;
  }, [instanceRef]);

  useEffect(() => listenForOrbitNodeFocus(focus), [focus]);
  return { focusNodeInCanvas: focus, cancelFocusAnimation: cancel };
}

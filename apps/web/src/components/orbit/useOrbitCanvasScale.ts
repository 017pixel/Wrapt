import { useLayoutEffect, useState } from "react";
import { useStore } from "@xyflow/react";

/** Liefert die tatsächlich gerenderte Skalierung des Orbit-Viewports. */
export function useOrbitCanvasScale(): number {
  const flowScale = useStore((state) => state.transform[2]);
  const [scale, setScale] = useState(flowScale);

  useLayoutEffect(() => {
    const viewport = document.querySelector<HTMLElement>(".orbit-flow .react-flow__viewport");
    const transform = viewport ? getComputedStyle(viewport).transform : "none";
    if (transform === "none") {
      setScale(flowScale);
      return;
    }

    try {
      const matrix = new DOMMatrixReadOnly(transform);
      const renderedScale = Math.hypot(matrix.a, matrix.b);
      setScale(Number.isFinite(renderedScale) && renderedScale > 0 ? renderedScale : flowScale);
    } catch {
      setScale(flowScale);
    }
  }, [flowScale]);

  return scale;
}

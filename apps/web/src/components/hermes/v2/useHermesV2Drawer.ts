import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useModalFocus } from "../../../lib/useModalFocus";

/** Containerbreite statt Fensterbreite, damit auch schmale Panels passen. */
export function useHermesV2Drawer(
  enabled: boolean,
  active: boolean,
  suspended = false,
) {
  const rootRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(() => window.innerWidth <= 640);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      // Container Queries rechnen vor CSS-Zoom, ebenso die Drawer-Auswahl.
      const width = root.clientWidth || root.getBoundingClientRect().width;
      setCompact((width || window.innerWidth) <= 640);
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(root);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !active || !compact) setOpen(false);
  }, [enabled, active, compact]);

  const modal = enabled && active && compact && open;
  useModalFocus(layerRef, modal && !suspended, () => setOpen(false));
  return { rootRef, layerRef, compact, open, modal, setOpen };
}

import { useEffect } from "react";
import { useResponsiveShell, useVisualViewportVariables } from "../../../lib/useResponsiveShell";
import { HermesV2Surface } from "./HermesV2Surface";

/**
 * Eigenes Fenster: stellt Viewport-Werte und Fenstertitel selbst bereit und
 * rendert dieselbe Fläche wie die Route, nur ohne Wrapt-Navigation.
 */
export function HermesV2Standalone() {
  const shell = useResponsiveShell();
  useVisualViewportVariables();
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Hermes V2 · Wrapt";
    return () => {
      document.title = previousTitle;
    };
  }, []);
  return (
    <div
      className="hermesv2-standalone"
      data-shell-mode={shell.mode}
      data-input-mode={shell.inputMode}
      data-orientation={shell.orientation}
      data-short-height={shell.shortHeight ? "true" : "false"}
    >
      <HermesV2Surface variant="route" standalone />
    </div>
  );
}

import { useEffect, useState, type RefObject } from "react";
import { observeOrbitTerminal } from "./terminalVisibility";

/** Außerhalb des Canvas gilt unverändert die Aktivität der Route/Pane. */
export function useOrbitTerminalActivity(mount: RefObject<HTMLElement | null>, routeActive: boolean, canPause = true): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!mount.current) return;
    return observeOrbitTerminal(mount.current, setVisible);
  }, [mount]);
  return routeActive && (!canPause || visible);
}

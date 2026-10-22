import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { hermesHostPath } from "./hermes-host-path";

/** Nur die gemountete eigene Hostauswahl darf ihren Pfad zurückmelden. */
export function useHermesPathCallback(hostId: string, active: boolean, path: string | null | undefined,
  commit: (path: string) => void): (path: string) => void {
  const context = useMemo(() => ({ hostId, active, path, commit, mounted: false }), [hostId, active, path, commit]);
  const current = useRef(context);
  useLayoutEffect(() => {
    current.current = context;
    context.mounted = true;
    return () => { context.mounted = false; };
  }, [context]);
  return useCallback((value: string) => {
    const next = hermesHostPath(value);
    if (next === null || !context.active || !context.mounted || current.current !== context) return;
    context.commit(next);
  }, [context]);
}

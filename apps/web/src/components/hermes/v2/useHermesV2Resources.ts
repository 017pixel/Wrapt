import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { ResourceRuntime } from "./resource-runtime";
import type { HermesV2Resources, HermesV2ResourcesOptions } from "./resource-types";

/** Pro geöffneter Fläche flüchtig; referenziert nur den vorhandenen Chatowner. */
export function useHermesV2Resources(options: HermesV2ResourcesOptions): HermesV2Resources {
  const { ownerId, enabled, active, visible, area, signal, deleteSessionId } = options;
  const effective = useMemo(() => ({ ownerId, enabled, active, visible, area, signal, deleteSessionId: deleteSessionId ?? null }),
    [ownerId, enabled, active, visible, area, signal, deleteSessionId]);
  const latest = useRef(effective);
  useEffect(() => { latest.current = effective; }, [effective]);
  const runtime = useMemo(() => new ResourceRuntime(), []);
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  useEffect(() => runtime.mount({ ...latest.current, ownerId }), [runtime, ownerId]);
  useEffect(() => { runtime.update(effective); }, [runtime, effective]);
  return { ...view, ...runtime.methods };
}

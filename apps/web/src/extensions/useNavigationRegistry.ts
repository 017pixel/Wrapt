import { useSyncExternalStore, useMemo } from "react";
import { useCodeUiRevision } from "./code-surface";
import { resolveCodeNavigation } from "./code-navigation";
import {
  navigationRegistry,
  type NavigationRegistrySnapshot,
} from "./navigationRegistry";

/** Abonniert die Navigation-Registry; der Snapshot bleibt bei unverändertem Stand referenzstabil. */
export function useNavigationRegistry(): NavigationRegistrySnapshot {
  const revision = useCodeUiRevision();
  const snapshot = useSyncExternalStore(
    navigationRegistry.subscribe,
    navigationRegistry.getSnapshot,
  );
  return useMemo(() => resolveCodeNavigation(snapshot, revision), [snapshot, revision]);
}

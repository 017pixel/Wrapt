import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { wraptQueries } from "../../lib/queryOptions";
import { decodeWorkspaceFragment, WORKSPACES_FRAGMENT_KEY } from "./workspaceModel";
import { parseWorkspaceSnapshot, WORKSPACES_SYNC_KEY } from "./workspaceStorage";
import { resolveWorkspaceSelfName } from "./workspaceStatus";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";

export function WorkspaceRegistrySync() {
  const health = useQuery(wraptQueries.health());
  const initialize = useWorkspaceRegistry((state) => state.initialize);
  const updateSelfName = useWorkspaceRegistry((state) => state.updateSelfName);
  const mergeStored = useWorkspaceRegistry((state) => state.mergeStored);
  const healthSelfName = health.data
    ? resolveWorkspaceSelfName(health.data.instanceName, health.data.appName)
    : null;

  useEffect(() => {
    const fragment = window.location.hash;
    const params = new URLSearchParams(fragment.replace(/^#/, ""));
    const decoded = decodeWorkspaceFragment(fragment);
    const incoming = decoded.some((entry) => entry.url === window.location.origin) ? decoded : undefined;
    if (params.has(WORKSPACES_FRAGMENT_KEY)) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    initialize(window.location.origin, "Dieses Gerät", incoming);
  }, [initialize]);

  useEffect(() => {
    if (!healthSelfName) return;
    updateSelfName(healthSelfName, false);
  }, [healthSelfName, updateSelfName]);

  useEffect(() => {
    const mergeOtherTab = (event: StorageEvent) => {
      if (event.key !== WORKSPACES_SYNC_KEY || !event.newValue) return;
      const incoming = parseWorkspaceSnapshot(event.newValue);
      if (incoming) mergeStored(incoming);
    };
    window.addEventListener("storage", mergeOtherTab);
    return () => window.removeEventListener("storage", mergeOtherTab);
  }, [mergeStored]);

  return null;
}

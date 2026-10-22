import { useCallback, useEffect, useState } from "react";
import type { TerminalWorkspaceV2 } from "@wrapt/contracts";
import { layoutRuntimeIds } from "./workspace/terminalWorkspaceModel";

const WARM_TERMINAL_LIMIT = 4;

/** Ein begrenzter Renderer-Cache. Hover synchronisiert nur vorhandene
 * Sitzungen; er erstellt weder einen Workspace-Eintrag noch eine neue Shell. */
export function useTerminalWarmPanes(document: TerminalWorkspaceV2 | null, areaId: string) {
  const [warmRuntimeIds, setWarmRuntimeIds] = useState<string[]>([]);
  const [preloadRuntimeId, setPreloadRuntimeId] = useState<string | null>(null);
  const rememberWarmRuntimes = useCallback((runtimeIds: readonly string[]) => {
    setWarmRuntimeIds((current) => {
      const next = [...new Set([...runtimeIds, ...current])].slice(0, WARM_TERMINAL_LIMIT);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, []);

  useEffect(() => {
    const known = new Set(document?.entries.map((entry) => entry.runtimeId) ?? []);
    setWarmRuntimeIds((current) => {
      const next = current.filter((id) => known.has(id));
      return next.length === current.length ? current : next;
    });
  }, [document]);

  const preloadEntry = useCallback((entryId: string | null) => {
    const runtimeId = document?.entries.find((entry) => entry.id === entryId)?.runtimeId ?? null;
    setPreloadRuntimeId(runtimeId);
    if (runtimeId) rememberWarmRuntimes([runtimeId, ...layoutRuntimeIds(document?.areaLayouts[areaId]?.paneLayout ?? null)]);
  }, [areaId, document, rememberWarmRuntimes]);

  return { warmRuntimeIds, preloadRuntimeId, rememberWarmRuntimes, preloadEntry };
}

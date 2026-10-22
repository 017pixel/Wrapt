import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { useLayoutStore } from "../../../stores/layout";
import { hermesSessionPath, type HermesShellProps } from "../HermesClassicShell";
import { hermesSessionFromHostPath } from "../hermes-host-path";
import { useHermesPathCallback } from "../useHermesPathCallback";

/**
 * Auswahl der eigenen Oberfläche. Route/Standalone nutzen `?session=` und
 * schreiben nur bei Aktivität; Panels führen ihre Auswahl im Layoutpfad.
 * Geparkte Routen sehen die URL der gerade aktiven Seite und dürfen ihre
 * eigene Auswahl dadurch nicht verlieren; bei Aktivität gilt der aktuelle
 * URL-Wert einschließlich explizit gelöschter Auswahl.
 */
export function useHermesV2Selection(
  variant: HermesShellProps["variant"],
  panelId: string | undefined,
  panelAdminPath: string | undefined,
  frameActive: boolean,
  onHermesPathChange?: (path: string) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeSession = searchParams.get("session");
  const panelSession = useMemo(() => {
    return hermesSessionFromHostPath(panelAdminPath);
  }, [panelAdminPath]);
  const lastRouteSession = useRef<string | null>(null);
  if (frameActive) lastRouteSession.current = routeSession;
  const sessionId =
    variant === "route"
      ? frameActive
        ? routeSession
        : lastRouteSession.current
      : (panelSession ?? null);
  const updateHermesPanel = useLayoutStore((state) => state.updateHermesPanel);
  const commitPath = useCallback(
    (path: string) => {
      const next = hermesSessionFromHostPath(path);
      if (variant === "route") {
        setSearchParams((current) => {
          const params = new URLSearchParams(current);
          if (next === null) params.delete("session");
          else params.set("session", next);
          return params;
        });
        return;
      }
      if (onHermesPathChange) onHermesPathChange(path);
      else if (panelId) {
        updateHermesPanel(panelId, {
          hermesAdminPath: path,
        });
      }
    },
    [variant, panelId, setSearchParams, updateHermesPanel, onHermesPathChange],
  );
  const selectPath = useHermesPathCallback(`${variant}:${panelId ?? ""}`, frameActive,
    variant === "route" ? routeSession : panelAdminPath, commitPath);
  const selectSession = useCallback((next: string | null) => selectPath(next === null ? "/chat" : hermesSessionPath(next)), [selectPath]);
  return { sessionId, selectSession };
}

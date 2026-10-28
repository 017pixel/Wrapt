import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Panel } from "@wrapt/contracts";
import { HermesAdminFrame, safeHermesPath } from "./HermesAdminFrame";
import { useLayoutStore } from "../../stores/layout";
import { useRouteActivity } from "../../lib/routeActivity";
import { hermesHostPath } from "./hermes-host-path";
import { useHermesPathCallback } from "./useHermesPathCallback";

/** Die offizielle Hermes-Chatroute bleibt der Einstiegspunkt der SPA. */
export const DEFAULT_HERMES_PATH = "/chat";

export interface HermesShellProps {
  variant: "route" | "panel";
  minimal?: boolean;
  panel?: Panel;
  active?: boolean;
  onHermesPathChange?: (path: string) => void;
}

export function hermesSessionPath(sessionId: string): string {
  return `/chat?resume=${encodeURIComponent(sessionId)}`;
}

/** Die klassische Hermes-Fläche bleibt mit ihrer bisherigen Pfadlogik erhalten. */
export function HermesClassicShell({ variant, minimal = false, panel, active, onHermesPathChange }: HermesShellProps) {
  const [searchParams] = useSearchParams();
  const routeActive = useRouteActivity();
  const frameActive = active ?? routeActive;
  const panelId = panel?.id;
  const updateHermesPanel = useLayoutStore((state) => state.updateHermesPanel);

  const urlSessionId = searchParams.get("session");
  const urlAdminPath = searchParams.get("path");
  const explicitUrlPath = onHermesPathChange ? null : urlAdminPath ?? (urlSessionId ? hermesSessionPath(urlSessionId) : null);
  const requestedAdminPath = hermesHostPath(explicitUrlPath ?? panel?.hermesAdminPath) ?? DEFAULT_HERMES_PATH;
  const [adminPath, setAdminPath] = useState(requestedAdminPath);
  // Eine geparkte Route sieht weiterhin die URL der gerade aktiven Seite. Sie
  // darf deshalb ihren gemerkten Hermes-Pfad nicht auf `/chat` zurücksetzen.
  useEffect(() => {
    if (!frameActive || (variant === "route" && explicitUrlPath === null)) return;
    setAdminPath(requestedAdminPath);
  }, [explicitUrlPath, frameActive, requestedAdminPath, variant]);
  const commitPath = useCallback((value: string) => {
    const next = safeHermesPath(value);
    setAdminPath(next);
    if (onHermesPathChange) onHermesPathChange(next);
    else if (panelId) updateHermesPanel(panelId, { hermesAdminPath: next });
  }, [panelId, updateHermesPanel, onHermesPathChange]);
  const setAdminPathValue = useHermesPathCallback(`${variant}:${panelId ?? ""}`, frameActive, adminPath, commitPath);

  return (
    <section
      className={`hermes-shell hermes-variant-${variant} ${minimal ? "is-minimal" : ""}`}
      data-surface="admin"
      data-hermes-ui="official"
    >
      <HermesAdminFrame path={adminPath} active={frameActive} onPathChange={setAdminPathValue} />
    </section>
  );
}

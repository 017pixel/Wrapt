import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useAppPreferences } from "../../stores/appPreferences";
import { useRouteActivity } from "../../lib/routeActivity";
import { HermesClassicShell, type HermesShellProps } from "./HermesClassicShell";

export { DEFAULT_HERMES_PATH, hermesSessionPath, type HermesShellProps } from "./HermesClassicShell";

const HermesV2Shell = lazy(() => import("./v2/HermesV2Shell").then((module) => ({ default: module.HermesV2Shell })));

/** Route und Panel wählen dieselbe Oberfläche; Verwaltungslinks bleiben klassisch. */
export function HermesShell(props: HermesShellProps) {
  const enabled = useAppPreferences((state) => state.hermesV2Enabled);
  const [params] = useSearchParams();
  const routeActive = useRouteActivity();
  const active = props.active ?? routeActive;
  const requestedClassic = params.get("ui") === "classic" || params.has("path");
  const [lastClassicSelection, setLastClassicSelection] = useState(requestedClassic);
  useEffect(() => {
    if (active) setLastClassicSelection(requestedClassic);
  }, [active, requestedClassic]);
  const panelPath = props.panel?.hermesAdminPath;
  const panelAdmin = panelPath && panelPath !== "/chat" && !panelPath.startsWith("/chat?");
  // Geparkte Routen sehen die URL der nächsten Seite und behalten ihre eigene UI-Auswahl.
  const classic = (active ? requestedClassic : lastClassicSelection) || panelAdmin;
  if (!enabled || classic) return <HermesClassicShell {...props} />;
  return (
    <Suspense fallback={<div className="route-skeleton" aria-label="Hermes V2 wird geladen"><span /><span /></div>}>
      <HermesV2Shell {...props} />
    </Suspense>
  );
}

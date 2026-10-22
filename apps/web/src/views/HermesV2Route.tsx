import { HermesV2Shell } from "../components/hermes/v2/HermesV2Shell";

/**
 * Eigene Featurefläche von Hermes V2. Route und Standalone teilen dieselbe
 * Shell; Standalone ergänzt nur die Fensterbildung ohne Wrapt-Navigation.
 */
export function HermesV2Route() {
  return <HermesV2Shell variant="route" />;
}

/** Eigenständiges Browserfenster mit kompakter Toolbar und ohne App-Navigation. */
export function HermesV2StandaloneRoute() {
  return <HermesV2Shell variant="route" standalone />;
}

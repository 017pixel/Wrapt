import { useAppPreferences } from "../../../stores/appPreferences";
import { HermesV2Activation } from "./HermesV2Activation";
import { HermesV2Standalone } from "./HermesV2Standalone";
import { HermesV2Surface } from "./HermesV2Surface";
import type { HermesShellProps } from "../HermesClassicShell";

export interface HermesV2ShellProps extends HermesShellProps {
  /** Eigenständige Oberfläche ohne Wrapt-Navigation. */
  standalone?: boolean;
}

/**
 * Native Hermes-Oberfläche (Experiment). Eintritt und Flagvariante: Route,
 * Panel und Orbit teilen dieselbe Fläche; Standalone ergänzt nur die
 * Fensterbildung ohne Doppel-Navigation. Jede Oberfläche besitzt ihre eigene
 * Auswahl: Route/Standalone speichern `?session=`, Panels ihren Layoutpfad
 * als `/chat?resume=`.Feature aus = klassisches Verhalten zurück.
 */
export function HermesV2Shell({
  variant,
  minimal = false,
  panel,
  active,
  standalone = false,
  onHermesPathChange,
}: HermesV2ShellProps) {
  const enabled = useAppPreferences((state) => state.hermesV2Enabled);
  if (!enabled)
    return <HermesV2Activation standalone={standalone} />;
  if (standalone) return <HermesV2Standalone />;
  return (
    <HermesV2Surface
      variant={variant}
      minimal={minimal}
      {...(active === undefined ? {} : { active })}
      {...(panel === undefined ? {} : { panel })}
      {...(onHermesPathChange === undefined ? {} : { onHermesPathChange })}
    />
  );
}

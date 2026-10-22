import { Link } from "react-router";
import { Card } from "../../components/Card";
import { HermesIcon } from "../../components/icons";
import { HERMES_V2_PATH } from "../../lib/hermesV2Routes";
import { useAppPreferences } from "../../stores/appPreferences";

/**
 * Einstellung für die experimentelle Hermes-V2-Oberfläche. Der Schalter persistiert
 * über die vorhandene App-Präferenz; beim Deaktivieren fällt die Hermes-
 * Oberfläche sofort vollständig auf die klassische UI zurück. Styling nur
 * über global vorhandene Klassen und Utility-Farbwerte, damit die Karte
 * unabhängig von der V2-Shell korrekt aussieht.
 */
export function HermesV2Settings() {
  const enabled = useAppPreferences((state) => state.hermesV2Enabled);
  const setHermesV2Enabled = useAppPreferences((state) => state.setHermesV2Enabled);

  return (
    <Card
      title="Hermes V2"
      subtitle="Experimentelle native Hermes-Oberfläche"
      action={<HermesIcon className="h-4 w-4 text-faint" />}
    >
      <div id="settings-hermes-v2">
        <button
          type="button"
          className="settings-toggle-row"
          role="switch"
          aria-checked={enabled}
          onClick={() => setHermesV2Enabled(!enabled)}
        >
          <span className="grid min-w-0 gap-[2px] text-left">
            <strong>Hermes V2 aktivieren</strong>
            <small className="text-xs font-normal text-faint">
              {enabled
                ? "Aktiv — der Hermes-Einstieg zeigt die native Oberfläche."
                : "Aus — die klassische Hermes-Oberfläche bleibt unverändert."}
            </small>
          </span>
          <span className={`settings-toggle-switch ${enabled ? "is-on" : ""}`} aria-hidden="true">
            <span className="settings-toggle-thumb" />
          </span>
        </button>
        {enabled ? (
          <div className="flex flex-wrap gap-2 pt-3">
            <Link className="quiet-button" to={HERMES_V2_PATH}>Hermes V2 öffnen</Link>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

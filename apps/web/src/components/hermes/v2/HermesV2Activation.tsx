import { Link } from "react-router";
import { HermesIcon } from "../../../components/icons";
import { useAppPreferences } from "../../../stores/appPreferences";

/**
 * Aktivierungseinstieg ohne Flag: nur der Schalter, keine Chatfläche.
 * Deaktivieren bleibt jederzeit möglich und löscht keine Sitzungen.
 */
export function HermesV2Activation({ standalone }: { standalone: boolean }) {
  const setHermesV2Enabled = useAppPreferences(
    (state) => state.setHermesV2Enabled,
  );
  return (
    <section className="hermesv2-activation is-route">
      <div className="hermesv2-activation-card">
        <HermesIcon className="hermesv2-brand" />
        <h2 className="hermesv2-activation-title">Hermes V2</h2>
        <p className="hermesv2-activation-subtitle">
          Experimentelle native Hermes-Oberfläche
        </p>
        <p className="hermesv2-activation-copy">
          Hermes V2 nutzt dieselbe Hermes-Installation mit denselben Sitzungen
          wie die bisherige Oberfläche. Die klassische UI bleibt vollständig
          erhalten.
        </p>
        <button
          type="button"
          className="settings-toggle-row hermesv2-activation-toggle"
          role="switch"
          aria-checked={false}
          onClick={() => setHermesV2Enabled(true)}
        >
          <span className="hermesv2-toggle-copy">
            <strong>Hermes V2 aktivieren</strong>
            <small>Experimentell</small>
          </span>
          <span className="settings-toggle-switch" aria-hidden="true">
            <span className="settings-toggle-thumb" />
          </span>
        </button>
        <Link
          className="hermesv2-activation-link"
          to="/settings#einstellungen:easter-eggs"
        >
          {standalone
            ? "Einstellungen in der Workbench öffnen"
            : "In den Einstellungen öffnen"}
        </Link>
      </div>
    </section>
  );
}

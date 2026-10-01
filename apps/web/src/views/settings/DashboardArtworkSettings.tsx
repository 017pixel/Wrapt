import { Card } from "../../components/Card";
import { dashboardArtworks } from "../../lib/dashboardArtwork";
import { useDashboardPreferences } from "../../stores/dashboardPreferences";

export function DashboardArtworkSettings() {
  const enabled = useDashboardPreferences((state) => state.artworkEnabled);
  const artworkId = useDashboardPreferences((state) => state.artworkId);
  const setArtworkEnabled = useDashboardPreferences((state) => state.setArtworkEnabled);
  const setArtworkId = useDashboardPreferences((state) => state.setArtworkId);

  return (
    <Card title="Dashboard-Hintergrund" subtitle="Doku-Motive hinter den Systemwidgets">
      <div className="dashboard-artwork-settings">
        <button
          type="button"
          role="switch"
          aria-label="Dashboard-Hintergrund anzeigen"
          aria-checked={enabled}
          className="settings-toggle-row dashboard-artwork-toggle"
          onClick={() => setArtworkEnabled(!enabled)}
        >
          <span className="dashboard-artwork-toggle-copy">
            <strong>Hintergrundbild anzeigen</strong>
            <small>{enabled ? "Auf dem Dashboard aktiv" : "Auf dem Dashboard ausgeblendet"}</small>
          </span>
          <span className={`settings-toggle-switch ${enabled ? "is-on" : ""}`} aria-hidden="true">
            <span className="settings-toggle-thumb" />
          </span>
        </button>

        <fieldset className="dashboard-artwork-picker">
          <legend>Motiv auswählen</legend>
          <div className="dashboard-artwork-grid">
            {dashboardArtworks.map((artwork) => (
              <label
                key={artwork.id}
                className={`dashboard-artwork-option ${artworkId === artwork.id ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="dashboard-artwork"
                  value={artwork.id}
                  checked={artworkId === artwork.id}
                  onChange={() => setArtworkId(artwork.id)}
                />
                <span className="dashboard-artwork-option-visual">
                  <img src={artwork.src} alt="" loading="lazy" decoding="async" />
                  <span>{artwork.label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Card>
  );
}

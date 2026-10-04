import { useEffect } from "react";
import { Card } from "../../components/Card";
import { dashboardArtworks, type DashboardArtworkId } from "../../lib/dashboardArtwork";
import { preloadDashboardArtwork } from "../../lib/dashboardArtworkPreload";
import { useDashboardPreferences } from "../../stores/dashboardPreferences";

export function DashboardArtworkSettings() {
  const enabled = useDashboardPreferences((state) => state.artworkEnabled);
  const artworkId = useDashboardPreferences((state) => state.artworkId);
  const setArtworkEnabled = useDashboardPreferences((state) => state.setArtworkEnabled);
  const setArtworkId = useDashboardPreferences((state) => state.setArtworkId);

  // Beim Öffnen des Tabs nur das laden, was ohnehin gleich sichtbar wird. Wer
  // den Hintergrund ausgeschaltet lässt, soll dafür keine Bildbytes zahlen.
  useEffect(() => {
    if (enabled) preloadDashboardArtwork(artworkId);
  }, [enabled, artworkId]);

  // Eine bewusste Auswahl wird immer vorgeladen. Wer hier ein Motiv anklickt
  // und danach den Hintergrund einschaltet, sieht es dadurch sofort.
  const chooseArtwork = (nextId: DashboardArtworkId) => {
    setArtworkId(nextId);
    preloadDashboardArtwork(nextId);
  };

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
                  onChange={() => chooseArtwork(artwork.id)}
                />
                <span className="dashboard-artwork-option-visual">
                  <img src={artwork.thumbnail} alt="" loading="lazy" decoding="async" width={320} height={180} />
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
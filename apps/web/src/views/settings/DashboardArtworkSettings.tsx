import { useEffect, useRef } from "react";
import { Card } from "../../components/Card";
import { ChevronLeftIcon, ChevronRightIcon } from "../../components/icons";
import { dashboardArtworks, type DashboardArtworkId } from "../../lib/dashboardArtwork";
import { preloadDashboardArtwork } from "../../lib/dashboardArtworkPreload";
import { useDashboardPreferences } from "../../stores/dashboardPreferences";

export function DashboardArtworkSettings() {
  const enabled = useDashboardPreferences((state) => state.artworkEnabled);
  const artworkId = useDashboardPreferences((state) => state.artworkId);
  const setArtworkEnabled = useDashboardPreferences((state) => state.setArtworkEnabled);
  const setArtworkId = useDashboardPreferences((state) => state.setArtworkId);
  const track = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedIndex = dashboardArtworks.findIndex((artwork) => artwork.id === artworkId);

  useEffect(() => {
    if (enabled) preloadDashboardArtwork(artworkId);
  }, [enabled, artworkId]);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const alignSelection = () => {
      clearTimeout(scrollTimer.current);
      // Sofort ausrichten: Tastaturwahl, Größenwechsel und externe Änderungen
      // dürfen keine Zwischenmotive als neue Auswahl speichern.
      element.scrollTo?.({ left: selectedIndex * element.clientWidth, behavior: "instant" });
    };
    alignSelection();
    const observer = new ResizeObserver(alignSelection);
    observer.observe(element);
    return () => {
      observer.disconnect();
      clearTimeout(scrollTimer.current);
    };
  }, [selectedIndex]);

  const chooseArtwork = (nextId: DashboardArtworkId) => {
    setArtworkId(nextId);
    preloadDashboardArtwork(nextId);
  };

  const selectAfterSwipe = () => {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const element = track.current;
      if (!element?.clientWidth) return;
      const index = Math.max(0, Math.min(dashboardArtworks.length - 1, Math.round(element.scrollLeft / element.clientWidth)));
      const artwork = dashboardArtworks[index];
      if (artwork && artwork.id !== useDashboardPreferences.getState().artworkId) chooseArtwork(artwork.id);
    }, 180);
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
          <div role="region" aria-roledescription="Karussell" aria-label="Dashboard-Hintergründe">
            <div ref={track} className="dashboard-artwork-carousel" onScroll={selectAfterSwipe}>
              {dashboardArtworks.map((artwork) => (
                <label key={artwork.id} className={`dashboard-artwork-option ${artworkId === artwork.id ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="dashboard-artwork"
                    value={artwork.id}
                    checked={artworkId === artwork.id}
                    onChange={() => chooseArtwork(artwork.id)}
                  />
                  <span className="dashboard-artwork-option-visual">
                    <img
                      src={artwork.thumbnail}
                      srcSet={`${artwork.thumbnail} 320w, ${artwork.background} 1280w`}
                      sizes="auto, (max-width: 720px) 100vw, 784px"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={320}
                      height={180}
                      draggable={false}
                    />
                    <span>{artwork.label}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="dashboard-artwork-controls">
              <button type="button" className="icon-button" aria-label="Vorheriger Hintergrund" disabled={selectedIndex === 0}
                onClick={() => chooseArtwork(dashboardArtworks[selectedIndex - 1]!.id)}><ChevronLeftIcon className="h-4 w-4" /></button>
              <span role="status" aria-live="polite">{selectedIndex + 1} / {dashboardArtworks.length}</span>
              <button type="button" className="icon-button" aria-label="Nächster Hintergrund" disabled={selectedIndex === dashboardArtworks.length - 1}
                onClick={() => chooseArtwork(dashboardArtworks[selectedIndex + 1]!.id)}><ChevronRightIcon className="h-4 w-4" /></button>
            </div>
          </div>
        </fieldset>
      </div>
    </Card>
  );
}

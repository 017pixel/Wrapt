import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { TechTldrsIcon } from "../../components/icons";
import { apiClient } from "../../lib/apiClient";
import { useNewsSettings } from "../../lib/useNewsSettings";

export function SettingsNews() {
  return (
    <div id="settings-navigation-news">
      <Card
        title="Tech-News Hintergrund-Sync"
        subtitle="Feeds und Mistral-Aufbereitung serverseitig steuern"
        action={<TechTldrsIcon className="h-4 w-4 text-faint" />}
      >
        <NewsSyncControls />
      </Card>
    </div>
  );
}

function NewsSyncControls() {
  const queryClient = useQueryClient();
  const { enabled, loaded, saving, message, save } = useNewsSettings();

  const enableAndReload = async () => {
    const ok = await save(true);
    if (!ok) return;
    try {
      await apiClient.syncNews();
      window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["news"] }), 2500);
    } catch {
      /* Der Sync läuft versetzt an, der Hinweis oben bleibt trotzdem gültig. */
    }
  };

  if (!loaded) return <div className="settings-notification-skeleton"><span /><span /><span /></div>;
  return (
    <div className="notification-settings">
      <p className="settings-section-note">
        Das Ausblenden unter Seiten-Sichtbarkeit versteckt nur die Navigation in diesem Browser.
        Erst dieser Schalter stoppt den Server: keine Feed-Abfragen, keine Zusammenfassungen,
        keine Embeddings und kein KI-Chat über Mistral. Der gespeicherte Bestand bleibt lesbar
        und wird nach dem Reaktivieren wieder ergänzt.
      </p>
      <button
        type="button"
        className="settings-toggle-row"
        disabled={saving}
        onClick={() => void (enabled ? save(false) : enableAndReload())}
      >
        <span>
          <strong>Hintergrund-Sync</strong>
          <small>{enabled ? "Feeds und Mistral laufen im Hintergrund" : "Pausiert, keine Mistral-Aufrufe"}</small>
        </span>
        <span
          className={`settings-toggle-switch ${enabled ? "is-on" : ""}`}
          role="switch"
          aria-checked={enabled}
          aria-label="Tech-News Hintergrund-Sync"
        >
          <span className="settings-toggle-thumb" />
        </span>
      </button>
      {message ? <p className="text-[12px] text-muted" role="status">{message}</p> : null}
    </div>
  );
}

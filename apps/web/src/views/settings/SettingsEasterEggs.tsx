import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MascotConfig, MascotConfigResponse } from "@wrapt/contracts";
import { Card } from "../../components/Card";
import { SparklesIcon } from "../../components/icons";
import { CapybaraSprite } from "../../components/mascot/CapybaraSprite";
import { useCapybaraBehavior, usePrefersReducedMotion } from "../../components/mascot/useCapybaraBehavior";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";

export function SettingsEasterEggs() {
  const queryClient = useQueryClient();
  const mascot = useQuery(wraptQueries.mascot());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = mascot.data?.mascot.enabled ?? false;

  const save = async (next: MascotConfig) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiClient.saveMascot(next);
      if (response) {
        queryClient.setQueryData<MascotConfigResponse>(wraptQueries.mascot().queryKey, response);
      }
      setMessage(next.enabled ? "Das Capybara ist unterwegs." : "Das Capybara macht Pause.");
    } catch {
      setMessage("Die Einstellung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="document-section">
      <header className="section-heading">
        <div>
          <h2 className="section-title">Easter Eggs</h2>
          <p className="section-subtitle">Kleine Extras abseits des Arbeitsflusses</p>
        </div>
      </header>
      <Card
        title="Capybara"
        subtitle="Pixel-Begleiter in der Statusleiste"
        action={<SparklesIcon className="h-4 w-4 text-faint" />}
      >
        <div className="mascot-setting">
          <CapybaraPreview />
          <div className="mascot-setting-body">
            <button
              type="button"
              className="settings-toggle-row mascot-toggle"
              role="switch"
              aria-checked={enabled}
              aria-busy={saving}
              disabled={saving}
              onClick={() => void save({ enabled: !enabled })}
            >
              <span className="mascot-toggle-copy">
                <strong>Maskottchen anzeigen</strong>
                <small>{saving ? "Wird gespeichert …" : enabled ? "In der Statusleiste aktiv" : "In der Statusleiste pausiert"}</small>
              </span>
              <span
                className={`settings-toggle-switch ${enabled ? "is-on" : ""}`}
                aria-hidden="true"
              >
                <span className="settings-toggle-thumb" />
              </span>
            </button>
            <p className="mascot-setting-hint">
              Klick die Vorschau oder das Capybara unten, um seine Freude zu sehen.
            </p>
          </div>
        </div>
        {message ? <p className="mascot-setting-message" role="status">{message}</p> : null}
      </Card>
    </section>
  );
}

function CapybaraPreview() {
  const reducedMotion = usePrefersReducedMotion();
  const { frame, action, poke } = useCapybaraBehavior("calm", reducedMotion);
  return (
    <button
      type="button"
      className="mascot-preview"
      data-action={action}
      data-frame={frame}
      onClick={poke}
      aria-label="Capybara testen"
    >
      <CapybaraSprite frame={frame} size={95} label="Capybara-Vorschau" />
    </button>
  );
}

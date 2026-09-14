import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type CSSProperties } from "react";
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
  const enabled = mascot.data?.mascot.enabled ?? true;

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
              className="settings-toggle-row"
              disabled={saving}
              onClick={() => void save({ enabled: !enabled })}
            >
              <span><strong>Maskottchen anzeigen</strong></span>
              <span
                className={`settings-toggle-switch ${enabled ? "is-on" : ""}`}
                role="switch"
                aria-checked={enabled}
              >
                <span className="settings-toggle-thumb" />
              </span>
            </button>
            <p className="mascot-setting-hint">
              Das Capybara lebt zwischen Version und Limits in der Statusleiste. Ein Klick begrüßt es;
              es reagiert auf knappe Limits, ruhende Verbindungen und ungespeicherte Arbeitsflächen.
            </p>
          </div>
        </div>
        {message ? <p className="context-menu-settings-message" role="status">{message}</p> : null}
      </Card>
    </section>
  );
}

function CapybaraPreview() {
  const reducedMotion = usePrefersReducedMotion();
  const { frame, offset } = useCapybaraBehavior("calm", reducedMotion);
  return (
    <div
      className="mascot-preview"
      aria-hidden="true"
      style={{ "--capy-offset": `${offset}px` } as CSSProperties}
    >
      <CapybaraSprite frame={frame} pixelSize={4} label="Capybara-Vorschau" />
    </div>
  );
}

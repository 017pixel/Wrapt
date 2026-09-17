import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { MascotConfig, MascotConfigResponse } from "@wrapt/contracts";
import { Card } from "../../components/Card";
import { SparklesIcon } from "../../components/icons";
import { CapybaraSprite } from "../../components/mascot/CapybaraSprite";
import { CapybaraZzz } from "../../components/mascot/CapybaraZzz";
import { useCapybaraBehavior, usePrefersReducedMotion } from "../../components/mascot/useCapybaraBehavior";
import { useCapybaraGaze } from "../../components/mascot/useCapybaraGaze";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";

const PREVIEW_SIZE = 95;
const PREVIEW_NAP_MS = 15_000;

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
              Klick die Vorschau für Freude. Gähnen, Party und Nickerchen löst du direkt aus;
              nach einer Weile Ruhe schläft es von selbst ein.
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
  const previewRef = useRef<HTMLButtonElement>(null);
  // Die Vorschau ist zentriert; die Blickmitte ergibt sich aus ihrer Breite.
  const gaze = useCapybaraGaze(previewRef, true);
  const behavior = useCapybaraBehavior("calm", reducedMotion, undefined, {
    napDelayMs: PREVIEW_NAP_MS,
    gaze,
  });
  return (
    <div className="mascot-preview-frame">
      <button
        ref={previewRef}
        type="button"
        className="mascot-preview"
        data-action={behavior.action}
        data-facing={behavior.facing}
        data-frame={behavior.frame}
        data-gaze={gaze ?? "none"}
        data-sleeping={String(behavior.sleeping)}
        onClick={behavior.poke}
        aria-label="Capybara testen"
      >
        <CapybaraSprite frame={behavior.frame} size={PREVIEW_SIZE} label="Capybara-Vorschau" />
        {behavior.sleeping ? <CapybaraZzz /> : null}
      </button>
      <div className="mascot-preview-actions">
        <button type="button" onClick={() => behavior.play("yawn")}>Gähnen</button>
        <button type="button" onClick={() => behavior.play("party")}>Party</button>
        <button type="button" onClick={() => behavior.nap()}>Nickerchen</button>
      </div>
    </div>
  );
}

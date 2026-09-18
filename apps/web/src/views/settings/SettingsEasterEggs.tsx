import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type CSSProperties } from "react";
import type { MascotConfig, MascotConfigResponse } from "@wrapt/contracts";
import { Card } from "../../components/Card";
import { SparklesIcon } from "../../components/icons";
import { CapybaraConfetti } from "../../components/mascot/CapybaraConfetti";
import { CapybaraSprite } from "../../components/mascot/CapybaraSprite";
import { CapybaraZzz } from "../../components/mascot/CapybaraZzz";
import { useCapybaraBehavior, usePrefersReducedMotion } from "../../components/mascot/useCapybaraBehavior";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";

const PREVIEW_SIZE = 105;
const PREVIEW_NAP_MS = 15_000;
const SCALE_MIN = 50;
const SCALE_MAX = 200;
const SCALE_STEP = 5;

export function SettingsEasterEggs() {
  const queryClient = useQueryClient();
  const mascot = useQuery(wraptQueries.mascot());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = mascot.data?.mascot.enabled ?? false;
  const savedScale = mascot.data?.mascot.scale ?? 1;
  const [scalePercent, setScalePercent] = useState(Math.round(savedScale * 100));

  // Die gespeicherte Größe gilt, sobald sie geladen oder von außen geändert wird.
  useEffect(() => {
    setScalePercent(Math.round(savedScale * 100));
  }, [savedScale]);

  const save = async (next: MascotConfig, note: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiClient.saveMascot(next);
      if (response) {
        queryClient.setQueryData<MascotConfigResponse>(wraptQueries.mascot().queryKey, response);
      }
      setMessage(note);
    } catch {
      setMessage("Die Einstellung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = () => {
    void save(
      { enabled: !enabled, scale: savedScale },
      enabled ? "Das Capybara macht Pause." : "Das Capybara ist unterwegs.",
    );
  };

  const persistScale = () => {
    const nextScale = scalePercent / 100;
    if (Math.abs(nextScale - savedScale) < 0.001) return;
    void save({ enabled, scale: nextScale }, `Das Capybara läuft jetzt mit ${scalePercent} % Größe.`);
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
          <CapybaraPreview scale={scalePercent / 100} />
          <div className="mascot-setting-body">
            <button
              type="button"
              className="settings-toggle-row mascot-toggle"
              role="switch"
              aria-checked={enabled}
              aria-busy={saving}
              disabled={saving}
              onClick={toggleEnabled}
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
            <div className="mascot-scale">
              <div className="mascot-scale-head">
                <label htmlFor="mascot-scale">Größe</label>
                <span className="mascot-scale-value">{scalePercent} %</span>
              </div>
              <input
                id="mascot-scale"
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={SCALE_STEP}
                value={scalePercent}
                disabled={saving}
                aria-valuetext={`${scalePercent} Prozent`}
                onChange={(event) => setScalePercent(Number(event.target.value))}
                onPointerUp={persistScale}
                onKeyUp={persistScale}
                onBlur={persistScale}
              />
            </div>
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

function CapybaraPreview({ scale }: { readonly scale: number }) {
  const reducedMotion = usePrefersReducedMotion();
  const behavior = useCapybaraBehavior("calm", reducedMotion, undefined, {
    napDelayMs: PREVIEW_NAP_MS,
  });
  const spriteSize = Math.round(PREVIEW_SIZE * scale);
  return (
    <div
      className="mascot-preview-frame"
      style={{ "--mascot-preview-sprite": `${spriteSize}px` } as CSSProperties}
    >
      <button
        type="button"
        className="mascot-preview"
        data-action={behavior.action}
        data-facing={behavior.facing}
        data-frame={behavior.frame}
        data-sleeping={String(behavior.sleeping)}
        data-scale={String(scale)}
        onClick={behavior.poke}
        aria-label="Capybara testen"
      >
        <CapybaraSprite frame={behavior.frame} size={spriteSize} label="Capybara-Vorschau" />
        {behavior.sleeping ? <CapybaraZzz /> : null}
        {behavior.frame === "party" ? <CapybaraConfetti /> : null}
      </button>
      <div className="mascot-preview-actions">
        <button type="button" onClick={() => behavior.play("yawn")}>Gähnen</button>
        <button type="button" onClick={() => behavior.play("party")}>Party</button>
        <button type="button" onClick={behavior.nap}>Nickerchen</button>
      </div>
    </div>
  );
}

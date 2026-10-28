import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { MascotConfig, MascotConfigResponse } from "@wrapt/contracts";
import { SettingsRange } from "../../components/SettingsRange";
import { Card } from "../../components/Card";
import { SparklesIcon } from "../../components/icons";
import { CapybaraActor, CAPYBARA_SPRITE_SIZE } from "../../components/mascot/CapybaraActor";
import { CAPYBARA_ITEM_WIDTH, WALK_STEP_MS, useCapybaraBehavior, usePrefersReducedMotion } from "../../components/mascot/useCapybaraBehavior";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { DashboardArtworkSettings } from "./DashboardArtworkSettings";

const PREVIEW_NAP_MS = 15_000;
const SCALE_MIN = 50;
const SCALE_MAX = 200;
const SCALE_STEP = 5;

export function SettingsEasterEggs() {
  const queryClient = useQueryClient();
  const mascot = useQuery(wraptQueries.mascot());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = mascot.data?.mascot.enabled ?? false;
  const savedScale = mascot.data?.mascot.scale ?? 1;
  const [scalePercent, setScalePercent] = useState(Math.round(savedScale * 100));

  // Die gespeicherte Größe gilt, sobald sie geladen oder von außen geändert wird.
  useEffect(() => {
    setScalePercent(Math.round(savedScale * 100));
  }, [savedScale]);

  const save = async (next: MascotConfig) => {
    setSaving(true);
    setError(null);
    try {
      const response = await apiClient.saveMascot(next);
      if (response) {
        queryClient.setQueryData<MascotConfigResponse>(wraptQueries.mascot().queryKey, response);
      }
    } catch {
      setError("Die Einstellung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = () => {
    void save({ enabled: !enabled, scale: savedScale });
  };

  const persistScale = () => {
    const nextScale = scalePercent / 100;
    if (Math.abs(nextScale - savedScale) < 0.001) return;
    void save({ enabled, scale: nextScale });
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
          <section className="mascot-setting-preview" aria-labelledby="mascot-preview-title">
            <h3 id="mascot-preview-title" className="mascot-setting-label">Vorschau und Aktionen</h3>
            <CapybaraPreview scale={scalePercent / 100} />
          </section>
          <section className="mascot-setting-controls" aria-labelledby="mascot-controls-title">
            <h3 id="mascot-controls-title" className="mascot-setting-label">Darstellung</h3>
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
              <SettingsRange
                id="mascot-scale"
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
          </section>
        </div>
        {error ? <p className="mascot-setting-message" role="alert">{error}</p> : null}
      </Card>
      <DashboardArtworkSettings />
    </section>
  );
}

function CapybaraPreview({ scale }: { readonly scale: number }) {
  const reducedMotion = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const spriteSize = Math.round(CAPYBARA_SPRITE_SIZE * scale);
  const itemWidth = Math.round(CAPYBARA_ITEM_WIDTH * scale);
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => setStageWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const behavior = useCapybaraBehavior("calm", reducedMotion, { width: stageWidth, itemWidth }, {
    napDelayMs: PREVIEW_NAP_MS,
  });
  return (
    <div
      className="mascot-preview-frame"
      style={{
        "--mascot-preview-sprite": `${spriteSize}px`,
        "--capy-sprite-size": `${spriteSize}px`,
        "--capy-item-width": `${itemWidth}px`,
        "--capy-offset": `${behavior.offset}px`,
        "--capy-step": `${WALK_STEP_MS}ms`,
      } as CSSProperties}
    >
      <div className="mascot-preview" data-action={behavior.action} data-facing={behavior.facing}>
        <div ref={stageRef} className="status-mascot-stage">
          <CapybaraActor behavior={behavior} size={spriteSize} scale={scale}
            label="Capybara testen" imageLabel="Capybara-Vorschau" onClick={behavior.poke} />
        </div>
      </div>
      <div className="mascot-preview-actions" role="group" aria-label="Capybara-Aktionen testen">
        <button type="button" onClick={() => behavior.play("yawn")}>Gähnen</button>
        <button type="button" onClick={() => behavior.play("party")}>Party</button>
        <button type="button" onClick={() => behavior.play("stretch")}>Strecken</button>
        <button type="button" onClick={() => behavior.play("sniff")}>Schnuppern</button>
        <button type="button" onClick={() => behavior.play("wave")}>Winken</button>
        <button type="button" onClick={() => behavior.play("bow")}>Verbeugen</button>
        <button type="button" onClick={() => behavior.play("wiggle")}>Wackeln</button>
        <button type="button" onClick={behavior.nap}>Nickerchen</button>
      </div>
    </div>
  );
}

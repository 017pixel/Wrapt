import { useEffect, useId, useState } from "react";
import { readOverlayTransparency, subscribeOverlayTransparency, writeOverlayTransparency } from "../lib/overlayTransparency";
import "./OverlayTransparencySettings.css";

export function OverlayTransparencySettings() {
  const id = useId();
  const [intensity, setIntensity] = useState(readOverlayTransparency);

  useEffect(() => subscribeOverlayTransparency(setIntensity), []);

  return (
    <section id="settings-design-transparency" className="overlay-transparency-settings" aria-labelledby={`${id}-label`}>
      <div className="appearance-section-heading">
        <h3><label id={`${id}-label`} htmlFor={id}>Transparenz-Intensität</label></h3>
        <output htmlFor={id}>{intensity} %</output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={300}
        step={1}
        value={intensity}
        aria-valuetext={`${intensity} Prozent`}
        onChange={(event) => setIntensity(writeOverlayTransparency(event.currentTarget.valueAsNumber))}
      />
    </section>
  );
}

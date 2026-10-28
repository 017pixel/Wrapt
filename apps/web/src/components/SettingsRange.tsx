import type { ComponentProps, CSSProperties } from "react";
import "./settings-range.css";

type SettingsRangeProps = Omit<ComponentProps<"input">, "type" | "min" | "max" | "value"> & {
  readonly min: number;
  readonly max: number;
  readonly value: number;
};

export function SettingsRange({ min, max, value, ...props }: SettingsRangeProps) {
  const progress = Math.min(100, Math.max(0, (value - min) / (max - min) * 100));
  return (
    <div className="settings-range" style={{ "--range-fill": `${progress}%` } as CSSProperties}>
      <span className="settings-range-track" aria-hidden="true"><span /></span>
      <input {...props} type="range" min={min} max={max} value={value} />
    </div>
  );
}

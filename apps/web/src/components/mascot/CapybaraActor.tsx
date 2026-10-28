import type { CapybaraBehavior } from "./useCapybaraBehavior";
import { CapybaraConfetti } from "./CapybaraConfetti";
import { CapybaraSprite } from "./CapybaraSprite";
import { CapybaraZzz } from "./CapybaraZzz";

export const CAPYBARA_SPRITE_SIZE = 88;

/** Identische Figur und Effekte in Statusleiste und Vorschau. */
export function CapybaraActor({ behavior, size, scale, label, imageLabel, onClick }: {
  readonly behavior: CapybaraBehavior;
  readonly size: number;
  readonly scale: number;
  readonly label: string;
  readonly imageLabel: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="status-mascot-button"
      data-action={behavior.action}
      data-facing={behavior.facing}
      data-frame={behavior.frame}
      data-sleeping={String(behavior.sleeping)}
      data-scale={String(scale)}
      onClick={onClick}
      aria-label={label}
    >
      <CapybaraSprite frame={behavior.frame} size={size} label={imageLabel} />
      {behavior.sleeping ? <CapybaraZzz /> : null}
      {behavior.frame === "party" ? <CapybaraConfetti /> : null}
    </button>
  );
}

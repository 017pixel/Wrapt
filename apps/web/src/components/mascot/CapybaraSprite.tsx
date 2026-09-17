import { CAPYBARA_FRAMES, type CapybaraFrameName } from "./capybaraFrames";

interface CapybaraSpriteProps {
  readonly frame: CapybaraFrameName;
  readonly label: string;
  readonly size?: number;
  readonly className?: string;
}

/** Rendert einen scharfen 64×64-Pixel-Frame als Bild-Asset. */
export function CapybaraSprite({ frame, label, size = 48, className }: CapybaraSpriteProps) {
  return (
    <img
      className={`capy-sprite${className ? ` ${className}` : ""}`}
      src={CAPYBARA_FRAMES[frame]}
      width={size}
      height={size}
      alt={label}
      decoding="async"
      draggable="false"
    />
  );
}

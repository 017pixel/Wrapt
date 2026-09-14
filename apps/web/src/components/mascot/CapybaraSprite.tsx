import {
  CAPYBARA_FRAMES,
  CAPYBARA_GRID,
  framePixels,
  type CapybaraFrameName,
} from "./capybaraFrames";

interface CapybaraSpriteProps {
  readonly frame: CapybaraFrameName;
  readonly label: string;
  readonly pixelSize?: number;
  readonly className?: string;
}

/**
 * Rendert einen Capybara-Frame als SVG-Raster. `crispEdges` verhindert
 * Weichzeichnung, damit die Pixel auch bei Skalierung scharf bleiben.
 */
export function CapybaraSprite({ frame, label, pixelSize = 2, className }: CapybaraSpriteProps) {
  const pixels = framePixels(CAPYBARA_FRAMES[frame]);
  return (
    <svg
      className={`capy-sprite${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${CAPYBARA_GRID.width} ${CAPYBARA_GRID.height}`}
      width={CAPYBARA_GRID.width * pixelSize}
      height={CAPYBARA_GRID.height * pixelSize}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      focusable="false"
    >
      {pixels.map((pixel) => (
        <rect
          key={`${pixel.x}:${pixel.y}`}
          x={pixel.x}
          y={pixel.y}
          width={1}
          height={1}
          className={`capy-tone-${pixel.tone}`}
        />
      ))}
    </svg>
  );
}

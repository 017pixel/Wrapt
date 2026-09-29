import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  findDevicePreset,
  deviceBezel,
  deviceCutout,
  deviceHasHomeIndicator,
  type DeviceOrientation,
  type DevicePresetId,
} from "../config/devicePresets";
import { normalizePreviewViewportDimension, orientPreviewViewportSize, type PreviewViewportSize } from "../lib/previewViewport";

interface DevicePreviewFrameProps {
  deviceId: DevicePresetId;
  orientation: DeviceOrientation;
  children: ReactNode;
  /** Relativer Korrekturfaktor zur automatisch berechneten Gerätegröße. */
  scaleFactor?: number;
  /** Overlay über dem iframe, solange der Canvas gezogen oder skaliert wird. */
  interactionLocked?: boolean;
  /** Eigene CSS-Viewportmaße; `null` verwendet die Abmessungen des Presets. */
  viewportSize?: PreviewViewportSize | null;
}

/**
 * Rechnet die Skalierung auf ganze Gerätepixel herunter. Halbe physische Pixel
 * sind die Ursache der weißen Haarlinien an Rahmen und Ecken.
 */
function snapToDevicePixels(scale: number, outerWidth: number, outerHeight: number, ratio: number): number {
  const byWidth = Math.floor(scale * outerWidth * ratio) / (outerWidth * ratio);
  const byHeight = Math.floor(scale * outerHeight * ratio) / (outerHeight * ratio);
  return Math.max(0.02, Math.min(byWidth, byHeight));
}

/** Zehn Prozent Luft pro Kante, solange beide Achsen genug Platz bieten. */
export const devicePreviewEdgeInsetRatio = 0.1;
export const devicePreviewScaleFactorMin = 0.5;
export const devicePreviewScaleFactorMax = 2;
export const devicePreviewScaleFactorStep = 0.1;

export function clampDevicePreviewScaleFactor(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(devicePreviewScaleFactorMax, Math.max(devicePreviewScaleFactorMin, value));
}

export function changeDevicePreviewScaleFactor(value: number, direction: -1 | 1): number {
  const next = Math.round((clampDevicePreviewScaleFactor(value) + direction * devicePreviewScaleFactorStep) * 100) / 100;
  return clampDevicePreviewScaleFactor(next);
}

export function calculateDevicePreviewScale({
  stageWidth,
  stageHeight,
  outerWidth,
  outerHeight,
  devicePixelRatio = 1,
}: {
  stageWidth: number;
  stageHeight: number;
  outerWidth: number;
  outerHeight: number;
  devicePixelRatio?: number;
}): number {
  const fillRatio = 1 - devicePreviewEdgeInsetRatio * 2;
  const availableWidth = Math.max(1, stageWidth * fillRatio);
  const availableHeight = Math.max(1, stageHeight * fillRatio);
  const raw = Math.min(availableWidth / outerWidth, availableHeight / outerHeight);
  return snapToDevicePixels(raw, outerWidth, outerHeight, Math.max(1, devicePixelRatio));
}

export function DevicePreviewFrame({ deviceId, orientation, children, scaleFactor = 1, interactionLocked = false, viewportSize = null }: DevicePreviewFrameProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const device = findDevicePreset(deviceId);
  const customWidth = viewportSize ? normalizePreviewViewportDimension(viewportSize.width, device.width ?? 390) : null;
  const customHeight = viewportSize ? normalizePreviewViewportDimension(viewportSize.height, device.height ?? 844) : null;
  const dimensions = customWidth !== null && customHeight !== null
    ? orientPreviewViewportSize({ width: customWidth, height: customHeight }, orientation)
    : { width: device.width, height: device.height };
  const width = dimensions.width;
  const height = dimensions.height;
  const responsive = deviceId === "responsive";
  const bezel = responsive ? 0 : deviceBezel(deviceId);
  const desktop = deviceId.startsWith("desktop-");
  const tablet = deviceId.startsWith("ipad-");

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || width === null || height === null) return;
    const outerWidth = width + bezel * 2;
    const outerHeight = height + bezel * 2;
    let frame = 0;
    // Genau eine Skalenaktualisierung pro Frame; ältere Anforderungen werden verworfen.
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = stage.getBoundingClientRect();
        setFitScale(calculateDevicePreviewScale({
          stageWidth: bounds.width,
          stageHeight: bounds.height,
          outerWidth,
          outerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        }));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [bezel, height, width]);

  if (width === null || height === null) {
    return (
      <div className="preview-responsive-frame">
        {children}
        {interactionLocked ? <span className="device-preview-lock" aria-hidden /> : null}
      </div>
    );
  }

  return (
    <div ref={stageRef} className="device-preview-stage">
      <div
        className={`device-preview-shell ${responsive ? "is-responsive" : desktop ? "is-desktop" : tablet ? "is-tablet" : "is-phone"}`}
        style={{
          // Rahmen als Padding statt Border: Shell, Rahmen und Screen teilen
          // denselben Ursprung, es entstehen keine transformierten Halbpixel.
          width: width + bezel * 2,
          height: height + bezel * 2,
          padding: bezel,
          transform: `translate(-50%, -50%) scale(${fitScale * clampDevicePreviewScaleFactor(scaleFactor)})`,
        }}
      >
        <div className="device-preview-screen" style={{ width, height }}>
          {children}
          {interactionLocked ? <span className="device-preview-lock" aria-hidden /> : null}
          {orientation === "portrait" && deviceCutout(deviceId) !== "none" ? <span className={`device-preview-cutout is-${deviceCutout(deviceId)}`} aria-hidden /> : null}
          {deviceHasHomeIndicator(deviceId) ? <span className={`device-preview-home ${tablet ? "is-tablet" : ""}`} aria-hidden /> : null}
        </div>
      </div>
      <span className="device-preview-caption" aria-hidden>
        {device.label} · {width} × {height}
      </span>
    </div>
  );
}

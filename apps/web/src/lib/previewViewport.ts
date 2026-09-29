import type { DeviceOrientation } from "../config/devicePresets";

export interface PreviewViewportSize {
  width: number;
  height: number;
}

export const previewViewportMinimum = 240;
export const previewViewportMaximum = 2_560;

export function normalizePreviewViewportDimension(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(previewViewportMaximum, Math.max(previewViewportMinimum, Math.round(numeric)));
}

export function orientPreviewViewportSize(
  size: PreviewViewportSize,
  orientation: DeviceOrientation,
): PreviewViewportSize {
  return orientation === "landscape"
    ? { width: size.height, height: size.width }
    : size;
}

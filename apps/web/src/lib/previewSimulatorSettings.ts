import { devicePresets, type DeviceOrientation } from "../config/devicePresets";
import { normalizePreviewViewportDimension, type PreviewViewportSize } from "./previewViewport";

export interface PreviewSimulatorSettings {
  deviceId: string | null;
  orientation: DeviceOrientation;
  viewportSize: PreviewViewportSize | null;
  scaleFactor: number;
  toolbarPosition: { x: number; y: number } | null;
  toolbarWidth: number | null;
}

const defaults: PreviewSimulatorSettings = {
  deviceId: null,
  orientation: "portrait",
  viewportSize: null,
  scaleFactor: 1,
  toolbarPosition: null,
  toolbarWidth: null,
};

export function previewSimulatorSettingsKey(sessionKey: string): string {
  return `wrapt:preview-simulator:${encodeURIComponent(sessionKey)}`;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizePreviewSimulatorSettings(value: unknown): PreviewSimulatorSettings {
  if (!value || typeof value !== "object") return { ...defaults };
  const candidate = value as Partial<PreviewSimulatorSettings>;
  const deviceId = typeof candidate.deviceId === "string"
    && devicePresets.some((device) => device.id === candidate.deviceId)
    ? candidate.deviceId
    : null;
  const viewportSize = candidate.viewportSize && finiteNumber(candidate.viewportSize.width) && finiteNumber(candidate.viewportSize.height)
    ? {
      width: normalizePreviewViewportDimension(candidate.viewportSize.width, 390),
      height: normalizePreviewViewportDimension(candidate.viewportSize.height, 844),
    }
    : null;
  const toolbarPosition = candidate.toolbarPosition
    && finiteNumber(candidate.toolbarPosition.x)
    && finiteNumber(candidate.toolbarPosition.y)
    ? { x: Math.max(0, Math.round(candidate.toolbarPosition.x)), y: Math.max(0, Math.round(candidate.toolbarPosition.y)) }
    : null;
  const toolbarWidth = finiteNumber(candidate.toolbarWidth)
    ? Math.min(1_600, Math.max(280, Math.round(candidate.toolbarWidth)))
    : null;

  return {
    deviceId,
    orientation: candidate.orientation === "landscape" ? "landscape" : "portrait",
    viewportSize,
    scaleFactor: finiteNumber(candidate.scaleFactor) ? Math.min(2, Math.max(0.5, candidate.scaleFactor)) : 1,
    toolbarPosition,
    toolbarWidth,
  };
}

export function readPreviewSimulatorSettings(sessionKey: string, storage?: Pick<Storage, "getItem">): PreviewSimulatorSettings {
  try {
    const source = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    const saved = source?.getItem(previewSimulatorSettingsKey(sessionKey));
    return saved ? normalizePreviewSimulatorSettings(JSON.parse(saved) as unknown) : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function writePreviewSimulatorSettings(
  sessionKey: string,
  settings: PreviewSimulatorSettings,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    const destination = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    destination?.setItem(previewSimulatorSettingsKey(sessionKey), JSON.stringify(normalizePreviewSimulatorSettings(settings)));
  } catch {
    // Der Simulator bleibt bedienbar, wenn der Browser lokalen Speicher sperrt.
  }
}

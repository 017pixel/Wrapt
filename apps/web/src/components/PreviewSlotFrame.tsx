import type { DeviceOrientation } from "../config/devicePresets";
import type { PreviewViewportSize } from "../lib/previewViewport";
import { LocalPreviewRuntime } from "./preview/LocalPreviewRuntime";


/**
 * Bestandsname der lokalen Preview. Die eigentliche Laufzeit liegt in
 * `LocalPreviewRuntime`, damit Sidebar, Vollbild und Browser-Panel
 * dieselbe Implementierung verwenden.
 */
export function PreviewSlotFrame(props: {
  targetPort: number;
  path?: string;
  requestedSlotId?: number | null;
  isolate?: boolean;
  storageProfileId?: string | null;
  previewNodeId?: string | null;
  deviceId?: string | null;
  orientation?: DeviceOrientation;
  reloadKey?: number;
  title?: string;
  lazy?: boolean;
  showControls?: boolean;
  controlsVariant?: "overlay" | "simulator";
  viewportSize?: PreviewViewportSize | null;
  onViewportSizeChange?: (size: PreviewViewportSize | null) => void;
  onDeviceChange?: (deviceId: string | null) => void;
  onSlotAssigned?: (slotId: number, url: string) => void;
  onOrientationChange?: (orientation: DeviceOrientation) => void;
  onFocus?: () => void;
  projectId?: string | null;
  sessionKey?: string;
}) {
  return <LocalPreviewRuntime {...props} />;
}

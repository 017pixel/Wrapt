import type { MouseEventHandler } from "react";
import type { Panel } from "@wrapt/contracts";
import type { DevicePresetId } from "../config/devicePresets";
import { DevicePickerButton } from "./DevicePickerButton";
import { DeviceRotateIcon, ExternalLinkIcon, FullscreenIcon, RefreshIcon, RestoreIcon, CloseIcon } from "./icons";
import { ToolActionMenu } from "./ToolActionMenu";
import type { ResolvedPanel } from "./toolPanelResolution";
import "./tool-panel-actions.css";

interface ToolPanelActionControlsProps {
  panel: Panel;
  resolved: ResolvedPanel | null;
  minimal: boolean;
  actionPlacement: "overlay" | "topbar" | "hidden";
  standalone: boolean;
  isMaximized: boolean;
  externalToolUrl: string | null;
  deviceId: DevicePresetId;
  onDeviceChange: (deviceId: DevicePresetId) => void;
  onRotate: () => void;
  previewSlotId: number | null;
  previewPublicUrl: string | null;
  onReload: () => void;
  onClose: () => void;
  onContextMenu: MouseEventHandler<HTMLDivElement>;
  onToggleFullscreen: () => void;
}

export function ToolPanelActionControls({
  panel,
  resolved,
  minimal,
  actionPlacement,
  standalone,
  isMaximized,
  externalToolUrl,
  deviceId,
  onDeviceChange,
  onRotate,
  previewSlotId,
  previewPublicUrl,
  onReload,
  onClose,
  onContextMenu,
  onToggleFullscreen,
}: ToolPanelActionControlsProps) {
  if (resolved === null || minimal || actionPlacement === "hidden") return null;

  if (standalone) {
    return (
      <div className="panel-standalone-actions" onContextMenu={onContextMenu}>
        {isMaximized ? <button type="button" title="Wiederherstellen" aria-label="Wiederherstellen" onClick={onToggleFullscreen} className="icon-button"><RestoreIcon className="h-4 w-4" /></button> : null}
        <ToolActionMenu
          className="is-inline"
          externalHref={externalToolUrl ?? window.location.href}
          isFullscreen={isMaximized}
          onFullscreen={onToggleFullscreen}
          onReload={onReload}
        />
      </div>
    );
  }

  return (
    <div className={`panel-island ${actionPlacement === "topbar" ? "is-topbar" : ""} ${actionPlacement === "topbar" && panel.type === "code-server" ? "is-flat-toolbar" : ""} ${isMaximized ? "is-maximized-actions" : ""}`} onContextMenu={onContextMenu}>
      {panel.type === "preview" ? <DevicePickerButton deviceId={deviceId} onChange={onDeviceChange} /> : null}
      {panel.type === "preview" && deviceId !== "responsive" ? <button type="button" title="Ausrichtung drehen" aria-label="Ausrichtung drehen" onClick={onRotate} className="icon-button"><DeviceRotateIcon className="h-4 w-4" /></button> : null}
      {panel.type === "preview" && resolved.targetPort ? <span className="preview-slot-badge">{previewSlotId ? `SLOT ${previewSlotId}` : "SLOT"}</span> : null}
      {resolved.url ? <button type="button" title="Neu laden" aria-label="Neu laden" onClick={onReload} className="icon-button"><RefreshIcon className="h-4 w-4" /></button> : null}
      {resolved.url ? <a href={previewPublicUrl ?? externalToolUrl ?? resolved.url} target="_blank" rel="noopener noreferrer" title="In neuem Tab öffnen" aria-label="In neuem Tab öffnen" className="icon-button"><ExternalLinkIcon className="h-4 w-4" /></a> : null}
      {isMaximized ? <button type="button" title="Wiederherstellen" aria-label="Wiederherstellen" onClick={onToggleFullscreen} className="icon-button"><RestoreIcon className="h-4 w-4" /></button> : <button type="button" title="Vollbild" aria-label="Vollbild" onClick={onToggleFullscreen} className="icon-button"><FullscreenIcon className="h-4 w-4" /></button>}
      {!standalone ? <button type="button" title="Schließen" aria-label="Schließen" onClick={onClose} className="icon-button danger"><CloseIcon className="h-4 w-4" /></button> : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, CSSProperties, KeyboardEvent } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DeviceRotateIcon,
  ExternalLinkIcon,
  MinusIcon,
  PlusIcon,
  RefreshIcon,
  ActivityIcon,
} from "../icons";
import { findDevicePreset, getGroupedDevicePresets, type DeviceOrientation, type DevicePresetId } from "../../config/devicePresets";
import {
  normalizePreviewViewportDimension,
  orientPreviewViewportSize,
  previewViewportMaximum,
  previewViewportMinimum,
  type PreviewViewportSize,
} from "../../lib/previewViewport";
import { writeClipboardText } from "../../lib/clipboard";
import {
  devicePreviewScaleFactorMax,
  devicePreviewScaleFactorMin,
} from "../DevicePreviewFrame";
import "./PreviewSimulator.css";

export interface PreviewRuntimeControlsProps {
  variant?: "overlay" | "simulator";
  deviceId: string | null;
  resolvedDeviceId: DevicePresetId;
  orientation: DeviceOrientation;
  viewportSize?: PreviewViewportSize | null;
  onDeviceChange?: ((deviceId: string | null) => void) | undefined;
  onViewportSizeChange?: ((size: PreviewViewportSize | null) => void) | undefined;
  onOrientationChange?: ((orientation: DeviceOrientation) => void) | undefined;
  scaleFactor: number;
  onScaleChange: (direction: -1 | 1) => void;
  bridgeConnected: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  url: string | null;
  externalUrl: string | null;
  diagnosticsOpen: boolean;
  hasErrors: boolean;
  onToggleDiagnostics: () => void;
  toolbarPosition?: { x: number; y: number } | null | undefined;
  toolbarWidth?: number | null | undefined;
  onToolbarPositionChange?: ((position: { x: number; y: number }) => void) | undefined;
  onToolbarWidthChange?: ((width: number) => void) | undefined;
}

interface ToolbarGesture {
  pointerId: number;
  kind: "move" | "resize";
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
}

function defaultViewport(resolvedDeviceId: DevicePresetId): PreviewViewportSize | null {
  const device = findDevicePreset(resolvedDeviceId);
  return device?.width && device.height ? { width: device.width, height: device.height } : null;
}

export function clampPreviewToolbarPosition(
  position: { x: number; y: number },
  stage: { width: number; height: number },
  toolbar: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, Math.floor(stage.width - toolbar.width)), Math.max(0, Math.round(position.x))),
    y: Math.min(Math.max(0, Math.floor(stage.height - toolbar.height)), Math.max(0, Math.round(position.y))),
  };
}

export function PreviewRuntimeControls({
  variant = "overlay",
  deviceId,
  resolvedDeviceId,
  orientation,
  viewportSize = null,
  onDeviceChange,
  onViewportSizeChange,
  onOrientationChange,
  scaleFactor,
  onScaleChange,
  bridgeConnected,
  onBack,
  onForward,
  onReload,
  url,
  externalUrl,
  diagnosticsOpen,
  hasErrors,
  onToggleDiagnostics,
  toolbarPosition = null,
  toolbarWidth = null,
  onToolbarPositionChange,
  onToolbarWidthChange,
}: PreviewRuntimeControlsProps) {
  const [copied, setCopied] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<ToolbarGesture | null>(null);
  const presetSize = defaultViewport(resolvedDeviceId);
  const portraitSize = viewportSize ?? presetSize;
  const displaySize = portraitSize ? orientPreviewViewportSize(portraitSize, orientation) : null;
  const [widthDraft, setWidthDraft] = useState(String(displaySize?.width ?? ""));
  const [heightDraft, setHeightDraft] = useState(String(displaySize?.height ?? ""));
  const simulator = variant === "simulator";
  const toolbarStyle: CSSProperties | undefined = simulator ? {
    ...(toolbarPosition ? { left: toolbarPosition.x, top: toolbarPosition.y } : {}),
    ...(toolbarWidth === null ? {} : { width: toolbarWidth }),
  } : undefined;

  useEffect(() => {
    setWidthDraft(String(displaySize?.width ?? ""));
    setHeightDraft(String(displaySize?.height ?? ""));
  }, [displaySize?.height, displaySize?.width]);

  useEffect(() => {
    if (!simulator || !toolbarPosition || !onToolbarPositionChange) return;
    const controls = controlsRef.current;
    const stage = controls?.closest(".preview-live-stage");
    if (!controls || !stage || typeof ResizeObserver === "undefined") return;
    const keepVisible = () => {
      const stageRect = stage.getBoundingClientRect();
      const toolbarRect = controls.getBoundingClientRect();
      if (stageRect.width <= 0 || stageRect.height <= 0 || toolbarRect.width <= 0 || toolbarRect.height <= 0) return;
      const next = clampPreviewToolbarPosition(toolbarPosition, stageRect, toolbarRect);
      if (next.x !== toolbarPosition.x || next.y !== toolbarPosition.y) onToolbarPositionChange(next);
    };
    const observer = new ResizeObserver(keepVisible);
    observer.observe(stage);
    observer.observe(controls);
    keepVisible();
    return () => observer.disconnect();
  }, [onToolbarPositionChange, simulator, toolbarPosition]);

  const commitSize = () => {
    if (!onViewportSizeChange) return;
    const fallback = displaySize ?? { width: 390, height: 844 };
    const width = widthDraft.trim() ? normalizePreviewViewportDimension(widthDraft, fallback.width) : fallback.width;
    const height = heightDraft.trim() ? normalizePreviewViewportDimension(heightDraft, fallback.height) : fallback.height;
    const next = { width, height };
    onViewportSizeChange(orientation === "landscape" ? orientPreviewViewportSize(next, "landscape") : next);
  };

  const beginToolbarGesture = (event: ReactPointerEvent<HTMLButtonElement>, kind: ToolbarGesture["kind"]) => {
    if (!simulator || !onToolbarPositionChange || (kind === "resize" && !onToolbarWidthChange)) return;
    const bounds = controlsRef.current?.closest(".preview-live-stage")?.getBoundingClientRect();
    const controls = controlsRef.current?.getBoundingClientRect();
    if (!bounds || !controls) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      initialX: toolbarPosition?.x ?? controls.left - bounds.left,
      initialY: toolbarPosition?.y ?? controls.top - bounds.top,
      initialWidth: toolbarWidth ?? controls.width,
    };
  };

  const updateToolbarGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    const bounds = controlsRef.current?.closest(".preview-live-stage")?.getBoundingClientRect();
    if (!gesture || gesture.pointerId !== event.pointerId || !bounds || bounds.width <= 0) return;
    if (gesture.kind === "move") {
      const controls = controlsRef.current?.getBoundingClientRect();
      const width = toolbarWidth ?? controls?.width ?? 0;
      const height = controls?.height ?? 0;
      onToolbarPositionChange?.(clampPreviewToolbarPosition(
        { x: gesture.initialX + event.clientX - gesture.startX, y: gesture.initialY + event.clientY - gesture.startY },
        bounds,
        { width, height },
      ));
      return;
    }
    const availableWidth = Math.max(1, bounds.width - gesture.initialX);
    onToolbarWidthChange?.(Math.min(1_600, availableWidth, Math.max(Math.min(280, availableWidth), gesture.initialWidth + event.clientX - gesture.startX)));
  };

  const finishToolbarGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const adjustToolbarByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, kind: ToolbarGesture["kind"]) => {
    if (!simulator) return;
    const step = event.shiftKey ? 48 : 16;
    if (kind === "move" && onToolbarPositionChange) {
      const delta = event.key === "ArrowLeft" ? { x: -step, y: 0 }
        : event.key === "ArrowRight" ? { x: step, y: 0 }
          : event.key === "ArrowUp" ? { x: 0, y: -step }
            : event.key === "ArrowDown" ? { x: 0, y: step } : null;
      if (delta) {
        event.preventDefault();
        const controls = controlsRef.current?.getBoundingClientRect();
        const bounds = controlsRef.current?.closest(".preview-live-stage")?.getBoundingClientRect();
        const currentX = toolbarPosition?.x ?? (controls && bounds ? controls.left - bounds.left : 8);
        const currentY = toolbarPosition?.y ?? (controls && bounds ? controls.top - bounds.top : 8);
        onToolbarPositionChange(clampPreviewToolbarPosition(
          { x: currentX + delta.x, y: currentY + delta.y },
          bounds ?? { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER },
          controls ?? { width: 0, height: 0 },
        ));
      }
    }
    if (kind === "resize" && onToolbarWidthChange && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const stageWidth = controlsRef.current?.closest(".preview-live-stage")?.getBoundingClientRect().width ?? 1_600;
      const availableWidth = Math.min(1_600, Math.max(1, stageWidth - (toolbarPosition?.x ?? 0)));
      onToolbarWidthChange(Math.min(availableWidth, Math.max(Math.min(280, availableWidth), (toolbarWidth ?? controlsRef.current?.offsetWidth ?? 860) + direction * step)));
    }
  };

  return (
    <div ref={controlsRef} className={`preview-runtime-controls${simulator ? " is-simulator" : ""}${toolbarPosition ? " is-positioned" : ""}`} style={toolbarStyle} role="group" aria-label={simulator ? "Preview-Simulator steuern" : "Preview steuern"}>
      {simulator ? (
        <>
          <button type="button" className="preview-simulator-move" aria-label="Leiste verschieben" title="Leiste verschieben · Pfeiltasten bewegen" onPointerDown={(event) => beginToolbarGesture(event, "move")} onPointerMove={updateToolbarGesture} onPointerUp={finishToolbarGesture} onPointerCancel={finishToolbarGesture} onKeyDown={(event) => adjustToolbarByKeyboard(event, "move")}><span aria-hidden="true">↕</span></button>
          <label className="preview-simulator-preset">
            <span>Gerät</span>
            <select value={deviceId ?? "__default"} onChange={(event) => onDeviceChange?.(event.target.value === "__default" ? null : event.target.value)} aria-label="Geräte-Preset wählen">
              <option value="__default">Standardgerät</option>
              {getGroupedDevicePresets().map((group) => <optgroup key={group.group} label={group.label}>{group.devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</optgroup>)}
            </select>
          </label>
          <fieldset className="preview-simulator-dimensions">
            <legend>Viewport in CSS-Pixeln</legend>
            <label><span>Breite</span><input type="number" min={previewViewportMinimum} max={previewViewportMaximum} step="1" value={widthDraft} onChange={(event) => setWidthDraft(event.target.value)} onBlur={commitSize} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
            <span aria-hidden="true">×</span>
            <label><span>Höhe</span><input type="number" min={previewViewportMinimum} max={previewViewportMaximum} step="1" value={heightDraft} onChange={(event) => setHeightDraft(event.target.value)} onBlur={commitSize} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
            {viewportSize ? <button type="button" className="preview-simulator-reset-size" onClick={() => onViewportSizeChange?.(null)} title="Presetmaße wiederherstellen">Preset</button> : null}
          </fieldset>
          {onOrientationChange && (resolvedDeviceId !== "responsive" || viewportSize) ? (
            <button type="button" className="preview-simulator-action" aria-label="Ausrichtung drehen" title="Ausrichtung drehen" onClick={() => onOrientationChange(orientation === "portrait" ? "landscape" : "portrait")}><DeviceRotateIcon className="h-4 w-4" /></button>
          ) : null}
        </>
      ) : resolvedDeviceId !== "responsive" ? (
        <div className="preview-runtime-scale" role="group" aria-label="Größe der Gerätevorschau">
          <button type="button" aria-label="Gerätevorschau verkleinern" title="Gerätevorschau verkleinern" disabled={scaleFactor <= devicePreviewScaleFactorMin} onClick={() => onScaleChange(-1)}><MinusIcon className="h-4 w-4" /></button>
          <output aria-live="polite">{Math.round(scaleFactor * 100)}%</output>
          <button type="button" aria-label="Gerätevorschau vergrößern" title="Gerätevorschau vergrößern" disabled={scaleFactor >= devicePreviewScaleFactorMax} onClick={() => onScaleChange(1)}><PlusIcon className="h-4 w-4" /></button>
        </div>
      ) : null}

      {simulator && (resolvedDeviceId !== "responsive" || viewportSize) ? (
        <div className="preview-runtime-scale" role="group" aria-label="Größe der Gerätevorschau">
          <button type="button" aria-label="Gerätevorschau verkleinern" title="Gerätevorschau verkleinern" disabled={scaleFactor <= devicePreviewScaleFactorMin} onClick={() => onScaleChange(-1)}><MinusIcon /></button>
          <output aria-live="polite">{Math.round(scaleFactor * 100)}%</output>
          <button type="button" aria-label="Gerätevorschau vergrößern" title="Gerätevorschau vergrößern" disabled={scaleFactor >= devicePreviewScaleFactorMax} onClick={() => onScaleChange(1)}><PlusIcon /></button>
        </div>
      ) : null}

      <button type="button" aria-label="Zurück" title="Zurück" onClick={onBack} disabled={!bridgeConnected}><ChevronLeftIcon className="h-4 w-4" /></button>
      <button type="button" aria-label="Vorwärts" title="Vorwärts" onClick={onForward} disabled={!bridgeConnected}><ChevronRightIcon className="h-4 w-4" /></button>
      <button type="button" aria-label="Neu laden" title="Neu laden" onClick={onReload}><RefreshIcon className="h-4 w-4" /></button>
      {!simulator && onOrientationChange && resolvedDeviceId !== "responsive" ? (
        <button type="button" aria-label="Ausrichtung drehen" title="Ausrichtung drehen" onClick={() => onOrientationChange(orientation === "portrait" ? "landscape" : "portrait")}><DeviceRotateIcon className="h-4 w-4" /></button>
      ) : null}
      <button type="button" className={copied ? "is-copied" : undefined} aria-label={copied ? "Preview-URL kopiert" : "Preview-URL kopieren"} title={copied ? "Kopiert" : "Preview-URL kopieren"} disabled={!url} onClick={() => {
        if (!url) return;
        void writeClipboardText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1_800); }).catch(() => setCopied(false));
      }}>{copied ? <CheckIcon className="preview-runtime-copy-icon h-4 w-4" /> : <CopyIcon className="preview-runtime-copy-icon h-4 w-4" />}</button>
      {externalUrl ? <a href={externalUrl} target="_blank" rel="noopener noreferrer" aria-label="Preview extern öffnen" title="Preview extern öffnen"><ExternalLinkIcon className="h-4 w-4" /></a> : null}
      <button type="button" aria-label="Diagnose öffnen" title="Diagnose" aria-expanded={diagnosticsOpen} onClick={onToggleDiagnostics}>
        <ActivityIcon className="h-4 w-4" />{hasErrors ? <i className="preview-runtime-alert" aria-hidden /> : null}
      </button>
      {simulator ? <button type="button" className="preview-simulator-resize" aria-label="Leistenbreite ändern" title="Leistenbreite ändern · Pfeiltasten passen an" onPointerDown={(event) => beginToolbarGesture(event, "resize")} onPointerMove={updateToolbarGesture} onPointerUp={finishToolbarGesture} onPointerCancel={finishToolbarGesture} onKeyDown={(event) => adjustToolbarByKeyboard(event, "resize")}><span aria-hidden="true">↔</span></button> : null}
      {simulator ? <span className="preview-simulator-disclaimer">Web-Viewport, kein nativer Emulator</span> : null}
    </div>
  );
}

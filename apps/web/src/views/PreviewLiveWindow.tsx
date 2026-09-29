import { useEffect, useMemo, useState } from "react";
import { LocalPreviewRuntime } from "../components/preview/LocalPreviewRuntime";
import { parsePreviewLiveWindowSearch } from "../lib/previewWindow";
import { readPreviewSimulatorSettings, writePreviewSimulatorSettings } from "../lib/previewSimulatorSettings";

export function PreviewLiveWindowRoute() {
  const input = useMemo(() => parsePreviewLiveWindowSearch(window.location.search), []);
  const [settings, setSettings] = useState(() => readPreviewSimulatorSettings(input?.sessionKey ?? "invalid-preview"));
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  useEffect(() => { if (input) document.title = `${input.title} · Preview-Simulator`; }, [input]);
  useEffect(() => { if (input) writePreviewSimulatorSettings(input.sessionKey, settings); }, [input, settings]);
  if (!input) return <main className="preview-live-window is-invalid"><strong>Preview-Ziel ungültig</strong></main>;

  return (
    <main className="preview-live-window">
      <header className="preview-live-window-bar">
        <div className="preview-live-window-title"><span>Web-Viewport-Simulation</span><strong>{input.title}</strong></div>
        <div className="preview-live-url" role="status" aria-label="Preview-Adresse">
          <span>{publicUrl ?? `localhost:${input.port}`}</span>
        </div>
      </header>
      <section className="preview-live-stage" aria-label="Preview-Simulator">
        <LocalPreviewRuntime
          targetPort={input.port}
          path={input.path}
          requestedSlotId={input.requestedSlotId}
          isolate={input.isolate}
          storageProfileId={input.storageProfileId}
          previewNodeId={input.previewNodeId}
          projectId={input.projectId}
          sessionKey={input.sessionKey}
          deviceId={settings.deviceId}
          orientation={settings.orientation}
          viewportSize={settings.viewportSize}
          scaleFactor={settings.scaleFactor}
          onScaleFactorChange={(direction) => setSettings((current) => ({ ...current, scaleFactor: Math.min(2, Math.max(0.5, Math.round((current.scaleFactor + direction * 0.1) * 100) / 100)) }))}
          onDeviceChange={(next) => setSettings((current) => ({ ...current, deviceId: next, viewportSize: null }))}
          onViewportSizeChange={(viewportSize) => setSettings((current) => ({ ...current, viewportSize }))}
          toolbarPosition={settings.toolbarPosition}
          toolbarWidth={settings.toolbarWidth}
          onToolbarPositionChange={(toolbarPosition) => setSettings((current) => ({ ...current, toolbarPosition }))}
          onToolbarWidthChange={(toolbarWidth) => setSettings((current) => ({ ...current, toolbarWidth }))}
          title={input.title}
          showControls
          controlsVariant="simulator"
          onSlotAssigned={(_slotId, url) => setPublicUrl(url)}
          onOrientationChange={(orientation) => setSettings((current) => ({ ...current, orientation }))}
        />
      </section>
    </main>
  );
}

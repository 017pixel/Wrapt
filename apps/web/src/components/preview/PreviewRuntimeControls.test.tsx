// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampPreviewToolbarPosition, PreviewRuntimeControls, type PreviewRuntimeControlsProps } from "./PreviewRuntimeControls";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function simulatorProps(overrides: Partial<PreviewRuntimeControlsProps> = {}): PreviewRuntimeControlsProps {
  return {
    variant: "simulator",
    deviceId: null,
    resolvedDeviceId: "iphone-13",
    orientation: "portrait",
    viewportSize: null,
    onDeviceChange: vi.fn(),
    onViewportSizeChange: vi.fn(),
    onOrientationChange: vi.fn(),
    scaleFactor: 1,
    onScaleChange: vi.fn(),
    bridgeConnected: false,
    onBack: vi.fn(),
    onForward: vi.fn(),
    onReload: vi.fn(),
    url: "https://preview.test/",
    externalUrl: "https://wrapt.test/wrapt/previews/live",
    diagnosticsOpen: false,
    hasErrors: false,
    onToggleDiagnostics: vi.fn(),
    ...overrides,
  };
}

describe("Preview-Simulator-Steuerung", () => {
  it("übernimmt freie Maße, begrenzt Grenzwerte und bietet direkte Steuerungen", () => {
    const props = simulatorProps();
    render(<PreviewRuntimeControls {...props} />);

    const width = screen.getByRole("spinbutton", { name: "Breite" });
    fireEvent.change(width, { target: { value: "3000" } });
    fireEvent.blur(width);
    expect(props.onViewportSizeChange).toHaveBeenCalledWith({ width: 2_560, height: 844 });

    fireEvent.click(screen.getByRole("button", { name: "Ausrichtung drehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Neu laden" }));
    expect(props.onOrientationChange).toHaveBeenCalledWith("landscape");
    expect(props.onReload).toHaveBeenCalledOnce();
    expect((screen.getByRole("link", { name: "Preview extern öffnen" }) as HTMLAnchorElement).getAttribute("href")).toBe(props.externalUrl);
  });

  it("zeigt einen sicheren Responsive-Viewport mit eigenen Maßen", () => {
    const props = simulatorProps({
      resolvedDeviceId: "responsive",
      viewportSize: { width: 640, height: 480 },
      orientation: "landscape",
    });
    render(<PreviewRuntimeControls {...props} />);

    expect((screen.getByRole("spinbutton", { name: "Breite" }) as HTMLInputElement).value).toBe("480");
    expect((screen.getByRole("spinbutton", { name: "Höhe" }) as HTMLInputElement).value).toBe("640");
    expect(screen.getByText("Web-Viewport, kein nativer Emulator")).not.toBeNull();
  });

  it("verschiebt und verbreitert die Leiste per Tastatur", () => {
    const onToolbarPositionChange = vi.fn();
    const onToolbarWidthChange = vi.fn();
    render(<PreviewRuntimeControls {...simulatorProps({
      toolbarPosition: { x: 20, y: 30 },
      toolbarWidth: 600,
      onToolbarPositionChange,
      onToolbarWidthChange,
    })} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Leiste verschieben" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Leistenbreite ändern" }), { key: "ArrowLeft" });

    expect(onToolbarPositionChange).toHaveBeenCalledWith({ x: 36, y: 30 });
    expect(onToolbarWidthChange).toHaveBeenCalledWith(584);
  });

  it("klemmt gespeicherte Positionen beim Laden und nach Stage-Resize in den sichtbaren Bereich", () => {
    let notifyResize: (() => void) | undefined;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) { notifyResize = () => callback([], this as unknown as ResizeObserver); }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    let stageWidth = 500;
    let stageHeight = 400;
    const onToolbarPositionChange = vi.fn();
    const { container } = render(<div className="preview-live-stage"><PreviewRuntimeControls {...simulatorProps({
      toolbarPosition: { x: 900, y: 800 },
      toolbarWidth: 260,
      onToolbarPositionChange,
    })} /></div>);
    const stage = container.querySelector(".preview-live-stage") as HTMLElement;
    const controls = container.querySelector(".preview-runtime-controls") as HTMLElement;
    stage.getBoundingClientRect = () => ({ width: stageWidth, height: stageHeight }) as DOMRect;
    controls.getBoundingClientRect = () => ({ width: 260, height: 100 }) as DOMRect;

    act(() => notifyResize?.());
    expect(onToolbarPositionChange).toHaveBeenLastCalledWith({ x: 240, y: 300 });
    stageWidth = 220;
    stageHeight = 150;
    act(() => notifyResize?.());
    expect(onToolbarPositionChange).toHaveBeenLastCalledWith({ x: 0, y: 50 });
  });

  it("behandelt eine Leiste, die größer als die Stage ist", () => {
    expect(clampPreviewToolbarPosition({ x: 500, y: 500 }, { width: 220, height: 90 }, { width: 280, height: 110 })).toEqual({ x: 0, y: 0 });
  });
});

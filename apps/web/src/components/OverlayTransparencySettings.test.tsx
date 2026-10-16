// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OVERLAY_TRANSPARENCY_STORAGE_KEY } from "../lib/overlayTransparency";
import { OverlayTransparencySettings } from "./OverlayTransparencySettings";

describe("Transparenz-Einstellung", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("zeigt einen beschrifteten nativen Regler mit Standardwert", () => {
    render(<OverlayTransparencySettings />);
    const slider = screen.getByRole("slider", { name: "Transparenz-Intensität" });
    expect(slider.getAttribute("min")).toBe("0");
    expect(slider.getAttribute("max")).toBe("300");
    expect(slider.getAttribute("aria-valuetext")).toBe("100 Prozent");
    expect(screen.getByText("100 %")).toBeTruthy();
  });

  it("speichert die Auswahl sofort und zeigt sie nach erneutem Öffnen", () => {
    const first = render(<OverlayTransparencySettings />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "300" } });
    expect(screen.getByText("300 %")).toBeTruthy();
    expect(localStorage.getItem(OVERLAY_TRANSPARENCY_STORAGE_KEY)).toBe("300");
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("3");
    first.unmount();
    render(<OverlayTransparencySettings />);
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("300");
  });

  it("bleibt bedienbar, wenn das Speichern fehlschlägt", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage voll"); });
    render(<OverlayTransparencySettings />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "250" } });
    expect(screen.getByText("250 %")).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("2.5");
  });

  it("zeigt Änderungen aus einem anderen Tab und ignoriert fremde Einstellungen", () => {
    render(<OverlayTransparencySettings />);
    fireEvent(window, new StorageEvent("storage", {
      key: OVERLAY_TRANSPARENCY_STORAGE_KEY, newValue: "25",
    }));
    expect(screen.getByText("25 %")).toBeTruthy();
    fireEvent(window, new StorageEvent("storage", { key: "anderer-key", newValue: "100" }));
    expect(screen.getByText("25 %")).toBeTruthy();
  });
});

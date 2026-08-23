// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPluginDraft } from "./pluginDefaults";
import { PluginCapabilityPicker } from "./PluginCapabilityPicker";

afterEach(cleanup);

describe("Visuelle Plugin-Flächen", () => {
  it("behält die Plugin-Seite verpflichtend aktiv", () => {
    const onChange = vi.fn();
    render(<PluginCapabilityPicker draft={emptyPluginDraft()} onChange={onChange} />);

    const page = screen.getByRole("checkbox", { name: /Eigene Seite/i });
    expect((page as HTMLInputElement).checked).toBe(true);
    expect((page as HTMLInputElement).disabled).toBe(true);
  });

  it("hält Orbit-Fläche, Orbit-Konfiguration und Wizard-Antwort synchron", () => {
    const onChange = vi.fn();
    render(<PluginCapabilityPicker draft={emptyPluginDraft()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Orbit/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      surfaces: expect.arrayContaining(["page", "sidebar", "orbit"]),
      orbit: expect.objectContaining({ enabled: true }),
      wizard: expect.objectContaining({
        includeOrbit: true,
        surfaces: expect.arrayContaining(["page", "sidebar", "orbit"]),
      }),
    }));
  });
});

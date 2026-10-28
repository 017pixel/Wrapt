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

  it("hält Sidebar-Auswahl und Wizard-Antwort synchron", () => {
    const onChange = vi.fn();
    render(<PluginCapabilityPicker draft={emptyPluginDraft()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Sidebar/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      surfaces: ["page"], wizard: expect.objectContaining({ surfaces: ["page"] }),
    }));
  });

  it("löscht eine Fähigkeit erst nach Bestätigung im Dialog", () => {
    const onChange = vi.fn();
    const draft = emptyPluginDraft();
    draft.capabilities = [{
      id: "aktion-1",
      label: "Export starten",
      kind: "action",
      surface: "page",
      description: "Eine kontrollierte Plugin-Aktion.",
      permission: null,
      enabled: true,
    }];
    render(<PluginCapabilityPicker draft={draft} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Fähigkeit 1 löschen" }));
    // Noch nichts gelöscht: Erst der Dialog, dann die Änderung.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(onChange).toHaveBeenCalledWith({ capabilities: [] });
  });
});

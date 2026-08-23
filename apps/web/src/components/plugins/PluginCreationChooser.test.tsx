// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginCreationChooser } from "./PluginCreationChooser";

afterEach(cleanup);

describe("Plugin-Erstellungs-Chooser", () => {
  it("zeigt genau die drei Erstellungswege und empfiehlt KI", () => {
    render(<PluginCreationChooser open onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Neues Plugin erstellen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mit KI erstellen/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Visuell erstellen/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mit Code erstellen/i })).toBeTruthy();
    expect(screen.getByText("Empfohlen")).toBeTruthy();
  });

  it("gibt die Auswahl zurück und lässt sich schließen", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<PluginCreationChooser open onClose={onClose} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Visuell erstellen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onSelect).toHaveBeenCalledWith("visual");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("zeigt beim Bearbeiten dieselben drei Wege und empfiehlt visuell", () => {
    render(<PluginCreationChooser open purpose="edit" pluginName="Fokus-Timer" onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Plugin bearbeiten" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Visuell bearbeiten/i })).toBeTruthy();
    expect(screen.getByText("Empfohlen")).toBeTruthy();
  });
});

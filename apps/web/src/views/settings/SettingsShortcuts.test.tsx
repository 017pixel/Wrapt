// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultShortcuts, normalizeShortcuts } from "../../config/shortcuts";
import { useAppPreferences } from "../../stores/appPreferences";
import { useShortcutState } from "../../components/shortcuts/shortcutState";
import { SettingsShortcuts } from "./SettingsShortcuts";

beforeEach(() => useAppPreferences.getState().setShortcuts(normalizeShortcuts(defaultShortcuts)));
afterEach(cleanup);

describe("Tastenkürzel einstellen", () => {
  it("nimmt eine Kombination auf, verhindert Doppelbelegung und erlaubt Deaktivieren", () => {
    render(<SettingsShortcuts />);
    const button = screen.getByRole("button", { name: "Einstellungen: Tastenkürzel ändern" });
    fireEvent.click(button);
    expect(useShortcutState.getState().recording).toBe(true);
    fireEvent.keyDown(button, { code: "KeyN", ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("alert").textContent).toContain("bereits");
    fireEvent.keyDown(button, { code: "KeyJ", ctrlKey: true, altKey: true });
    expect(useAppPreferences.getState().shortcuts.bindings.settings?.code).toBe("KeyJ");
    expect(useShortcutState.getState().recording).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: "Einstellungen aktivieren" }));
    expect(useAppPreferences.getState().shortcuts.bindings.settings).toBeNull();
  });

  it("nimmt die Zusatztasten der Zahlenwahl auf und bricht mit Escape ab", () => {
    render(<SettingsShortcuts />);
    const button = screen.getByRole("button", { name: "Seitenwahl mit 1–9 und 0: Tastenkürzel ändern" });
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "AltLeft", altKey: true, shiftKey: true });
    fireEvent.keyUp(button, { code: "ShiftLeft", altKey: true });
    expect(useAppPreferences.getState().shortcuts.numbers).toEqual({ ctrl: false, alt: true, shift: true, meta: false });
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "Escape" });
    expect(useShortcutState.getState().recording).toBe(false);
  });
});

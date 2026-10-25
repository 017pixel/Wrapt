// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { defaultShortcuts, normalizeShortcuts, shortcutConflict } from "../../config/shortcuts";
import { createShortcutController } from "./shortcutController";
import { numberShortcutIndex } from "./navigationTargets";

function setup() {
  const preferences = normalizeShortcuts(defaultShortcuts);
  const showNumbers = vi.fn();
  const navigateNumber = vi.fn(() => true);
  const execute = vi.fn(() => true);
  const recording = vi.fn(() => false);
  const numbersAllowed = vi.fn(() => true);
  const controller = createShortcutController({ preferences: () => preferences, showNumbers, navigateNumber, execute, recording, numbersAllowed });
  const event = (code: string, extra: KeyboardEventInit = {}, type = "keydown") => new KeyboardEvent(type, { code, ctrlKey: true, shiftKey: true, ...extra });
  return { preferences, controller, showNumbers, navigateNumber, execute, recording, numbersAllowed, event };
}

describe("Wrapt-Tastatursteuerung", () => {
  it("zeigt Nummern bei exakt passenden Zusatztasten und erkennt die deutsche Zahlenreihe", () => {
    const s = setup();
    expect(s.controller.handle(s.event("ShiftLeft"))).toBe(false);
    expect(s.showNumbers).toHaveBeenLastCalledWith(true);
    expect(s.controller.handle(s.event("Digit1", { key: "!" }))).toBe(true);
    expect(s.navigateNumber).toHaveBeenLastCalledWith(0);
    expect(s.controller.handle(s.event("Digit0", { key: "=" }))).toBe(true);
    expect(s.navigateNumber).toHaveBeenLastCalledWith(9);
    expect(numberShortcutIndex("KeyQ")).toBeNull();
    expect(s.controller.handle(s.event("Digit2", { altKey: true }))).toBe(false);
  });

  it("führt Direktaktionen aus und lässt fremde Kombinationen unverändert", () => {
    const s = setup();
    for (const [code, action] of [["KeyE", "settings"], ["KeyN", "usage"], ["KeyP", "plugins"], ["KeyS", "server"], ["KeyL", "limits"]]) {
      expect(s.controller.handle(s.event(code!))).toBe(true);
      expect(s.execute).toHaveBeenLastCalledWith(action);
    }
    expect(s.controller.handle(s.event("KeyC"))).toBe(false);
    expect(s.controller.handle(s.event("KeyE", { ctrlKey: false }))).toBe(false);
    s.preferences.bindings.settings = null;
    expect(s.controller.handle(s.event("KeyE"))).toBe(false);
  });

  it("verschluckt Wiederholungen und Folgeereignisse, auch nach Loslassen der Zusatztasten", () => {
    const s = setup();
    expect(s.controller.handle(s.event("Digit2"))).toBe(true);
    expect(s.controller.handle(s.event("Digit2", { repeat: true }))).toBe(true);
    expect(s.navigateNumber).toHaveBeenCalledTimes(1);
    expect(s.controller.handle(s.event("Digit2", {}, "keypress"))).toBe(true);
    expect(s.controller.handle(s.event("Digit2", { ctrlKey: false, shiftKey: false }, "keyup"))).toBe(true);
    expect(s.showNumbers).toHaveBeenLastCalledWith(false);
  });

  it("bricht Hinweise mit Escape ab und setzt den Zustand bei Fokusverlust zurück", () => {
    const s = setup();
    s.controller.handle(s.event("Escape"));
    expect(s.controller.handle(s.event("Digit1"))).toBe(false);
    s.controller.reset();
    expect(s.controller.handle(s.event("Digit1"))).toBe(true);
    s.controller.handle(s.event("ShiftLeft", { shiftKey: false }, "keyup"));
    expect(s.showNumbers).toHaveBeenLastCalledWith(false);
  });

  it("beachtet Aufnahme, Dialoge, Textkomposition und nicht verfügbare Aktionen", () => {
    const s = setup();
    s.recording.mockReturnValue(true);
    expect(s.controller.handle(s.event("KeyE"))).toBe(false);
    s.recording.mockReturnValue(false);
    s.numbersAllowed.mockReturnValue(false);
    expect(s.controller.handle(s.event("Digit1"))).toBe(false);
    expect(s.controller.handle(s.event("KeyE", { isComposing: true }))).toBe(false);
    s.execute.mockReturnValue(false);
    expect(s.controller.handle(s.event("KeyE"))).toBe(false);
  });

  it("übernimmt geänderte Zusatztasten und verhindert doppelte Belegungen", () => {
    const s = setup();
    s.preferences.numbers = { ctrl: false, shift: true, alt: true, meta: false };
    expect(s.controller.handle(s.event("Digit1"))).toBe(false);
    expect(s.controller.handle(s.event("Digit1", { ctrlKey: false, altKey: true }))).toBe(true);
    s.preferences.bindings.settings = { ...s.preferences.numbers, code: "Digit1" };
    expect(shortcutConflict(s.preferences)).toContain("Seitenwahl");
    s.preferences.bindings.settings = s.preferences.bindings.usage;
    expect(shortcutConflict(s.preferences)).toContain("bereits");
  });

  it("bereinigt Doppelbelegungen aus gespeicherten oder synchronisierten Daten", () => {
    const preferences = normalizeShortcuts(defaultShortcuts);
    preferences.bindings.usage = preferences.bindings.settings;
    preferences.bindings.plugins = { ...defaultShortcuts.numbers!, code: "Digit1" };
    const recovered = normalizeShortcuts(preferences);
    expect(recovered.bindings.settings).toEqual(defaultShortcuts.bindings.settings);
    expect(recovered.bindings.usage).toBeNull();
    expect(recovered.bindings.plugins).toBeNull();
    expect(shortcutConflict(recovered)).toBeNull();
  });

  it("normalisiert alte, beschädigte und deaktivierte Einstellungen", () => {
    expect(normalizeShortcuts(undefined)).toEqual(defaultShortcuts);
    expect(normalizeShortcuts({ numbers: null, bindings: { plugins: null } }).bindings.plugins).toBeNull();
    expect(normalizeShortcuts({ numbers: {}, bindings: { usage: { code: "bad" } } })).toEqual(defaultShortcuts);
  });
});

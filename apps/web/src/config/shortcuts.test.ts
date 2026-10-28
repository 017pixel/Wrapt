// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defaultShortcuts, encodeShortcuts, normalizeShortcuts, resolveShortcuts, shortcutActions } from "./shortcuts";

describe("Gemeinsame plattformabhängige Wrapt-Kürzel", () => {
  it("verwendet Alt unter Windows und Control unter macOS bei gleicher Belegung", () => {
    const shared = normalizeShortcuts(defaultShortcuts);
    expect(resolveShortcuts(shared, "Win32").bindings.quickNote).toEqual({ ctrl: false, alt: true, shift: false, meta: false, code: "KeyN" });
    expect(resolveShortcuts(shared, "MacIntel").bindings.quickNote).toEqual({ ctrl: true, alt: false, shift: false, meta: false, code: "KeyN" });
    for (const action of shortcutActions.filter((action) => action !== "quickNote")) {
      expect(resolveShortcuts(shared, "Win32").bindings[action]).toMatchObject({ ctrl: false, shift: true, alt: true, meta: false });
      expect(resolveShortcuts(shared, "MacIntel").bindings[action]).toMatchObject({ ctrl: true, shift: true, alt: false, meta: false });
    }
    expect(resolveShortcuts(shared, "MacIntel").numbers).toEqual({ ctrl: true, shift: true, alt: false, meta: false });
    expect(shared).toEqual(defaultShortcuts);
  });

  it("migriert die alte Quick-Note-Vorgabe und erhält eigene oder deaktivierte Belegungen", () => {
    const legacy = { ...defaultShortcuts, bindings: { ...defaultShortcuts.bindings, quickNote: { ctrl: true, alt: true, shift: true, meta: false, code: "KeyN" } } };
    const migrated = normalizeShortcuts(legacy);
    expect(migrated.bindings.quickNote).toEqual(defaultShortcuts.bindings.quickNote);
    expect(normalizeShortcuts(migrated)).toEqual(migrated);
    const custom = { ctrl: false, alt: false, shift: true, meta: true, code: "KeyJ" };
    expect(normalizeShortcuts({ bindings: { quickNote: custom } }).bindings.quickNote).toEqual(custom);
    expect(normalizeShortcuts({ bindings: { quickNote: null } }).bindings.quickNote).toBeNull();
  });

  it("übernimmt eine Windows-Änderung auf dem Mac und eine Mac-Änderung unter Windows", () => {
    const windows = resolveShortcuts(defaultShortcuts, "Win32");
    windows.bindings.plugins = { ctrl: false, shift: true, alt: true, meta: false, code: "KeyK" };
    const shared = encodeShortcuts(windows, "Win32");
    const mac = resolveShortcuts(shared, "MacIntel");
    expect(mac.bindings.plugins).toEqual({ ctrl: true, shift: true, alt: false, meta: false, code: "KeyK" });
    mac.bindings.plugins = { ...mac.bindings.plugins!, code: "KeyJ" };
    mac.bindings.usage = null;
    mac.numbers = { ctrl: true, shift: false, alt: false, meta: false };
    const received = resolveShortcuts(encodeShortcuts(mac, "MacIntel"), "Win32");
    expect(received.bindings.plugins).toMatchObject({ alt: true, meta: false, code: "KeyJ" });
    expect(received.bindings.usage).toBeNull();
    expect(received.numbers).toEqual({ ctrl: false, shift: false, alt: true, meta: false });
  });

  it("migriert bisher getrennte Windows-Kürzel ohne Verlust und bleibt danach stabil", () => {
    const windows = resolveShortcuts(defaultShortcuts, "Win32");
    windows.bindings.plugins = { ...windows.bindings.plugins!, code: "KeyK" };
    windows.bindings.usage = null;
    const base = normalizeShortcuts(defaultShortcuts);
    base.bindings.settings = { ...base.bindings.settings!, code: "KeyJ" };
    const restored = normalizeShortcuts({ ...base, windows });
    expect(restored.bindings.settings?.code).toBe("KeyJ");
    expect(restored).not.toHaveProperty("windows");
    expect(resolveShortcuts(restored, "MacIntel").bindings.plugins).toMatchObject({ ctrl: true, meta: false, alt: false, code: "KeyK" });
    expect(restored.bindings.usage).toBeNull();
    expect(normalizeShortcuts(restored)).toEqual(restored);
  });

  it("behält beliebige Kombinationen beim Hin- und Zurückübersetzen", () => {
    const shared = normalizeShortcuts(defaultShortcuts);
    shared.bindings.settings = { ctrl: true, shift: false, alt: true, meta: true, code: "KeyJ" };
    for (const platform of ["Win32", "MacIntel", "Linux"]) {
      expect(encodeShortcuts(resolveShortcuts(shared, platform), platform)).toEqual(shared);
    }
  });
});

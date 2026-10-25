import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { injectShortcutBridge, shortcutBridgeScript } from "./shortcutBridge.js";

describe("Werkzeug-Tastatur-Anbindung", () => {
  it("steht vor den Werkzeug-Scripts, übernimmt Nonces und wird nur einmal eingefügt", () => {
    const html = '<html><head><script nonce="native">app()</script></head></html>';
    const result = injectShortcutBridge(html);
    expect(result.indexOf('data-wrapt-shortcuts')).toBeLessThan(result.indexOf('app()'));
    expect(result).toContain('<script nonce="native" data-wrapt-shortcuts="1">');
    expect(injectShortcutBridge(result)).toBe(result);
    expect(injectShortcutBridge("<html>fixture</html>", "header-nonce")).toContain('nonce="header-nonce"');
  });

  it("meldet Ereignisse synchron nach oben und verändert sie ohne Empfänger nicht", () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const dispatchEvent = vi.fn();
    const parent = { CustomEvent: class { constructor(public type: string, public options: unknown) {} }, dispatchEvent };
    const window = { parent, addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener) };
    const source = shortcutBridgeScript.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    vm.runInNewContext(source, { window, document: { addEventListener: vi.fn() } });
    const event = { type: "keydown", code: "Digit1", preventDefault: vi.fn() };
    listeners.get("keydown")!(event);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "wrapt:shortcut-frame", options: { detail: { source: window, event } } }));
    expect(event.preventDefault).not.toHaveBeenCalled();
    listeners.get("blur")!({});
    expect(dispatchEvent).toHaveBeenLastCalledWith(expect.objectContaining({ options: { detail: { source: window, reset: true } } }));
  });

  it("stoppt behandelte Folgeereignisse auch nach dem Parken des Frames", () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const dispatchEvent = vi.fn((message) => { message.options.detail.event?.preventDefault(); });
    const parent = { CustomEvent: class { constructor(public type: string, public options: unknown) {} }, dispatchEvent };
    const window = { parent, addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener) };
    const source = shortcutBridgeScript.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    vm.runInNewContext(source, { window, document: { addEventListener: vi.fn() } });
    const event = (type: string) => ({ type, code: "Digit1", defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation: vi.fn() });
    listeners.get("keydown")!(event("keydown"));
    dispatchEvent.mockClear();
    const up = event("keyup");
    listeners.get("keyup")!(up);
    expect(up.defaultPrevented).toBe(true);
    expect(up.stopImmediatePropagation).toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

});

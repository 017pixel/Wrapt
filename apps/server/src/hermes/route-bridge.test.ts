import { describe, expect, it } from "vitest";
import { routeBridgeScript } from "./route-bridge.js";

describe("Hermes-Routenbrücke", () => {
  it("meldet Routenwechsel nach oben und nimmt Navigationsbefehle entgegen", () => {
    const bridge = routeBridgeScript();
    // Nach oben: die Workbench merkt sich die zuletzt besuchte Hermes-Seite.
    expect(bridge).toContain("route.changed");
    expect(bridge).toContain("window.parent.postMessage");
    // Nach unten: Seitenwechsel ohne Neuladen der SPA.
    expect(bridge).toContain("route.navigate");
    expect(bridge).toContain("history.pushState");
    expect(bridge).toContain("PopStateEvent");
    // Geparkte Hermes-Flächen behalten WebSockets, pausieren aber Polling.
    expect(bridge).toContain("host.activity");
    expect(bridge).toContain("if (hostActive) callback");
  });

  it("nimmt nur Navigationsbefehle vom eigenen Origin mit unverdächtigem Pfad an", () => {
    const bridge = routeBridgeScript();
    expect(bridge).toContain("event.origin !== location.origin");
    expect(bridge).toContain('data.path.startsWith("/")');
    expect(bridge).toContain('data.path.includes("..")');
    expect(bridge).toContain('data.path.startsWith("//")');
  });

  it("bringt einen Dropdown-Notbehelf für geklemmte Hermes-Listen mit", () => {
    const bridge = routeBridgeScript();
    // Der Hermes-Select hat kein Portal: Die Liste bleibt im DOM und wird nur
    // umpositioniert, damit React sie weiter normal aushängen kann.
    expect(bridge).toContain('[role="listbox"]');
    expect(bridge).toContain('[role="combobox"]');
    expect(bridge).toContain("position");
    expect(bridge).toContain("fixed");
    // Nur geklemmte Listen werden angefasst, der Rest bleibt unverändert.
    expect(bridge).toContain("nearestClip");
    // Aufklappen nach oben, wenn unten kein Platz ist.
    expect(bridge).toContain("openUp");
    // Nachpositionieren bei Scroll und Resize, Start direkt nach Injektion.
    expect(bridge).toContain("MutationObserver");
    expect(bridge).toContain("portalize()");
    // Der Notbehelf darf die SPA nie zum Absturz bringen.
    expect(bridge).toContain("catch");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HERMES_CLASSIC_PATH,
  HERMES_V2_PATH,
  HERMES_V2_STANDALONE_PATH,
  hermesV2ClassicHref,
  hermesV2StandaloneHref,
} from "./hermesV2Routes";

describe("hermesV2Routes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("registriert Router-Pfade ohne Basename", () => {
    expect(HERMES_V2_PATH).toBe("/hermes-v2");
    expect(HERMES_V2_STANDALONE_PATH).toBe("/hermes-v2/standalone");
    expect(HERMES_CLASSIC_PATH).toBe("/hermes-agent");
  });

  it("verlinkt klassisch ohne generische Session-ID", () => {
    expect(hermesV2ClassicHref()).toBe("/hermes-agent?ui=classic");
    expect(hermesV2ClassicHref(null)).toBe("/hermes-agent?ui=classic");
  });

  it("übernimmt Session-IDs URL-kodiert in den Classic-Link", () => {
    expect(hermesV2ClassicHref("ordner/id")).toBe(
      "/hermes-agent?ui=classic&session=ordner%2Fid",
    );
    expect(hermesV2ClassicHref("id mit Leerzeichen")).toBe(
      "/hermes-agent?ui=classic&session=id+mit+Leerzeichen",
    );
  });

  it("übernimmt Session-IDs URL-kodiert in den Standalone-Link", () => {
    vi.stubEnv("BASE_URL", "/wrapt/");
    expect(hermesV2StandaloneHref("ordner/id", undefined)).toBe(
      "/wrapt/hermes-v2/standalone?session=ordner%2Fid",
    );
  });

  it("baut Standalone-URLs mit Basename und Schrägstrich sicher", () => {
    for (const baseUrl of ["/wrapt/", "/wrapt"]) {
      vi.stubEnv("BASE_URL", baseUrl);
      const href = hermesV2StandaloneHref();
      // Ohne Fensterursprung (Tests) bleibt ein Pfad unter dem Basispfad.
      const absolute = href.startsWith("/");
      expect(absolute).toBe(true);
      expect(href.endsWith("/hermes-v2/standalone")).toBe(true);
      expect(href).toContain("/wrapt/");
    }
  });
});

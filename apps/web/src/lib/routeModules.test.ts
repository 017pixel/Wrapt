import { describe, expect, it } from "vitest";
import {
  freshAppLoadUrl,
  isDynamicImportFailure,
  STALE_CHUNK_RETRY_PARAM,
} from "./routeModules";

describe("Route-Chunk-Recovery", () => {
  it("markiert einen veralteten Tab genau einmal für einen frischen App-Load", () => {
    const fresh = freshAppLoadUrl("https://wrapt.test/wrapt/plugins?tab=installiert#top");
    expect(fresh).toContain(`${STALE_CHUNK_RETRY_PARAM}=1`);
    expect(fresh).toContain("tab=installiert");
    expect(fresh).toContain("#top");
    expect(freshAppLoadUrl(fresh!)).toBeNull();
  });

  it("erkennt Browserfehler veralteter dynamischer Module, aber keine beliebigen Fehler", () => {
    expect(isDynamicImportFailure(new Error("Failed to fetch dynamically imported module"))).toBe(true);
    expect(isDynamicImportFailure(new Error("Netzwerkfehler beim API-Aufruf"))).toBe(false);
  });
});

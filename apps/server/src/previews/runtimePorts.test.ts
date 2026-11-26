import { describe, expect, it } from "vitest";
import { selectedRuntimeMainPort } from "./runtimePorts.js";
import type { PreviewDevServerDatabase } from "./devServerDatabase.js";
import type { RuntimeProfileResult } from "./runtimeProfiles.js";

function profile(port: number | null): RuntimeProfileResult {
  return {
    source: "detected",
    mainServiceId: "api",
    command: "npm run dev",
    services: [
      { id: "web", port, protocol: "http", label: "Web", probeStatus: "reachable", source: "detected" },
      { id: "api", port: 4000, protocol: "http", label: "API", probeStatus: "reachable", source: "detected" },
    ],
  } as unknown as RuntimeProfileResult;
}

function database(overrides: { mainServiceId?: string | null; mainPort?: number | null }): PreviewDevServerDatabase {
  return {
    projectPreference: () => ({ mainServiceId: "web", mainPort: null, updatedAt: "2026-11-19T00:00:00.000Z", ...overrides }),
  } as unknown as PreviewDevServerDatabase;
}

describe("selectedRuntimeMainPort", () => {
  it("fällt bei einem gespeicherten Hauptdienst ohne Port auf einen gültigen Dienst zurück", () => {
    expect(selectedRuntimeMainPort(database({ mainServiceId: "web" }), [5173, 4000], "user", "projekt", profile(null))).toBe(4000);
  });

  it("nutzt einen gültigen gespeicherten Dienst weiterhin", () => {
    expect(selectedRuntimeMainPort(database({ mainServiceId: "web" }), [5173, 4000], "user", "projekt", profile(5173))).toBe(5173);
  });

  it("nutzt den gespeicherten Hauptport, wenn der Dienst keinen Port mehr hat", () => {
    expect(selectedRuntimeMainPort(database({ mainServiceId: "web", mainPort: 5173 }), [5173, 4000], "user", "projekt", profile(null))).toBe(4000);
  });
});

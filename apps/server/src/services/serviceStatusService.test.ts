import { describe, expect, it } from "vitest";
import type { ServiceConfig } from "../config/schemas.js";
import { createServiceStatusService } from "./serviceStatusService.js";

describe("Service-Status auf anderen Plattformen", () => {
  it("ruft systemctl außerhalb von Linux nicht auf", async () => {
    const service: ServiceConfig = {
      id: "test-unit",
      name: "Testdienst",
      mode: "hybrid",
      publicUrl: null,
      check: { type: "systemd", unit: "wrapt.service" },
    };

    const response = await createServiceStatusService([service], "darwin").list();

    expect(response.services[0]).toMatchObject({
      state: "unknown",
      message: "systemd ist nur unter Linux verfügbar.",
    });
  });
});

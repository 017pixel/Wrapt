import { describe, expect, it } from "vitest";
import { normalizeServiceState, performServiceAction, serviceState, startUpdateService } from "./service-control.js";

describe("Hermes-Dienststatus", () => {
  it("erkennt einen laufenden User-Dienst", () => {
    expect(normalizeServiceState("active", "running", "success")).toBe("active");
  });

  it("bleibt bei fehlendem SubState für active robust", () => {
    expect(normalizeServiceState("active")).toBe("active");
  });

  it("unterscheidet Start, Fehler und Inaktivität", () => {
    expect(normalizeServiceState("activating", "start")).toBe("activating");
    expect(normalizeServiceState("failed", "dead", "failed")).toBe("failed");
    expect(normalizeServiceState("inactive", "dead", "success")).toBe("inactive");
  });

  it("ruft systemd außerhalb von Linux nicht auf", async () => {
    expect(await serviceState("dashboard", "darwin")).toBe("unknown");
    await expect(performServiceAction({ target: "dashboard", action: "stop" }, "darwin"))
      .rejects.toThrow("nur unter Linux verfügbar");
    await expect(startUpdateService(true, "darwin"))
      .rejects.toThrow("nur unter Linux verfügbar");
  });
});

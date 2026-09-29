import { describe, expect, it } from "vitest";
import type { Service } from "@wrapt/contracts";
import { codeServerState, codeServerUnavailableReason } from "./codeServerAvailability";

describe("Code-Server-Status", () => {
  it("liest nur den Editor-Dienst aus der vorhandenen Service-Abfrage", () => {
    const service = { id: "code-server", state: "error" } as Service;
    expect(codeServerState([{ id: "t3-code", state: "active" } as Service, service])).toBe("error");
  });

  it("erlaubt den Editor nur bei aktivem Dienst und erklärtem Projektlink", () => {
    expect(codeServerUnavailableReason(true, "active")).toBeNull();
    expect(codeServerUnavailableReason(true, "inactive")).toMatch(/läuft/);
    expect(codeServerUnavailableReason(true, "error")).toMatch(/läuft/);
    expect(codeServerUnavailableReason(false, "active")).toMatch(/nicht eingerichtet/);
  });
});

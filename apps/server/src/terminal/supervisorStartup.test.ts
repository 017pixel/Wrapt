import { describe, expect, it, vi } from "vitest";
import { ensureSupervisorOnStartup } from "./supervisorStartup.js";

describe("Supervisor-Start", () => {
  it("bricht den Backend-Start bei einem transienten Probe-Timeout nicht ab", async () => {
    const warn = vi.fn();
    const supervisor = { ensureSupervisorUnit: vi.fn(async () => false) };
    await expect(ensureSupervisorOnStartup(supervisor, { runtimeMode: "production", platform: "linux", warn })).resolves.toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("lässt Terminals in der Entwicklung lazy", async () => {
    const supervisor = { ensureSupervisorUnit: vi.fn(async () => false) };
    await expect(ensureSupervisorOnStartup(supervisor, { runtimeMode: "development", platform: "linux" })).resolves.toBe(false);
    expect(supervisor.ensureSupervisorUnit).not.toHaveBeenCalled();
  });

  it("versucht den Supervisor auf macOS auch außerhalb der Produktion", async () => {
    const supervisor = { ensureSupervisorUnit: vi.fn(async () => true) };
    await expect(ensureSupervisorOnStartup(supervisor, { runtimeMode: "development", platform: "darwin" })).resolves.toBe(true);
    expect(supervisor.ensureSupervisorUnit).toHaveBeenCalledOnce();
  });

  it("meldet einen geworfenen Probe-Fehler nur als Warnung", async () => {
    const warn = vi.fn();
    const supervisor = { ensureSupervisorUnit: vi.fn(async () => { throw new Error("timeout"); }) };
    await expect(ensureSupervisorOnStartup(supervisor, { runtimeMode: "production", platform: "linux", warn })).resolves.toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[1]).toBeInstanceOf(Error);
  });
});

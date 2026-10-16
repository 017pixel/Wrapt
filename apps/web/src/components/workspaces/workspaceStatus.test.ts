import { describe, expect, it, vi } from "vitest";
import { apiClient } from "../../lib/apiClient";
import { probeWorkspace, resolveWorkspaceSelfName, workspaceStatusLabels } from "./workspaceStatus";

vi.mock("../../lib/apiClient", () => ({
  apiClient: { probeWorkspace: vi.fn() },
}));

describe("Workspace-Verbindungsstatus", () => {
  it("verwendet Instance-Name, App-Name und dann eine lesbare lokale Bezeichnung", () => {
    expect(resolveWorkspaceSelfName("  MacBook  ", "Wrapt")).toBe("MacBook");
    expect(resolveWorkspaceSelfName(null, " Wrapt ")).toBe("Wrapt");
    expect(resolveWorkspaceSelfName(undefined, undefined)).toBe("Dieses Gerät");
  });

  it("beschriftet alle Statustypen", () => {
    expect(workspaceStatusLabels.live).toBe("Live");
    expect(workspaceStatusLabels["not-tailnet"]).toMatch(/Tailnet/);
    expect(workspaceStatusLabels["not-checked"]).toBe("Noch nicht geprüft");
  });

  it("meldet einen Transportfehler des Probe-Endpunkts als offline", async () => {
    vi.mocked(apiClient.probeWorkspace).mockRejectedValueOnce(new Error("Netzwerkfehler"));
    await expect(probeWorkspace("https://zweit.example.ts.net")).resolves.toEqual({
      status: "offline", reachable: false, version: null, instanceName: null, appName: null, bootId: null,
    });
  });

  it("reicht das serverseitige Probe-Ergebnis unverändert durch", async () => {
    const result = { status: "live" as const, reachable: true, version: "2.7.1", instanceName: "Zweitserver", appName: "Wrapt", bootId: "boot-zweit" };
    vi.mocked(apiClient.probeWorkspace).mockResolvedValueOnce(result);
    await expect(probeWorkspace("https://zweit.example.ts.net")).resolves.toEqual(result);
  });
});

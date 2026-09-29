import { describe, expect, it } from "vitest";
import { deriveWorkspaceStatusFromFetchError, deriveWorkspaceStatusFromHealth, resolveWorkspaceSelfName } from "./workspaceStatus";

const health = {
  status: "ok",
  version: "1.19.2",
  appName: "Wrapt",
  instanceName: "MacBook",
  timestamp: "2026-09-24T10:00:00.000Z",
  bootId: "boot-1",
  webBuildId: 42,
};

describe("Workspace-Verbindungsstatus", () => {
  it("unterscheidet DNS-Fehler, Offline und fehlende Berechtigung aus Fetch-Fehlern", () => {
    expect(deriveWorkspaceStatusFromFetchError(new TypeError("Failed to fetch"))).toBe("offline");
    expect(deriveWorkspaceStatusFromFetchError(new Error("net::ERR_NAME_NOT_RESOLVED"))).toBe("not-tailnet");
    expect(deriveWorkspaceStatusFromFetchError({ status: 401 })).toBe("no-access");
    expect(deriveWorkspaceStatusFromFetchError({ statusCode: 403 })).toBe("no-access");
  });

  it("markiert gleiche Release-Linien als Live und andere Minor-Versionen als Hinweis", () => {
    expect(deriveWorkspaceStatusFromHealth(200, health, "1.19.0").status).toBe("live");
    expect(deriveWorkspaceStatusFromHealth(200, { ...health, version: "1.18.9" }, "1.19.0").status).toBe("incompatible");
    expect(deriveWorkspaceStatusFromHealth(200, { ...health, version: "2.0.0" }, "1.19.0").status).toBe("incompatible");
  });

  it("ordnet HTTP-Fehler ein und erkennt ältere Health-Antworten als inkompatibel", () => {
    expect(deriveWorkspaceStatusFromHealth(401, null, "1.19.0").status).toBe("no-access");
    expect(deriveWorkspaceStatusFromHealth(403, null, "1.19.0").status).toBe("no-access");
    expect(deriveWorkspaceStatusFromHealth(503, null, "1.19.0").status).toBe("offline");
    expect(deriveWorkspaceStatusFromHealth(200, { ...health, instanceName: undefined }, "1.19.0").status).toBe("incompatible");
    expect(deriveWorkspaceStatusFromHealth(200, { error: "not Wrapt" }, "1.19.0").status).toBe("offline");
  });

  it("verwendet Instance-Name, App-Name und dann eine lesbare lokale Bezeichnung", () => {
    expect(resolveWorkspaceSelfName("  MacBook  ", "Wrapt")).toBe("MacBook");
    expect(resolveWorkspaceSelfName(null, " Wrapt ")).toBe("Wrapt");
    expect(resolveWorkspaceSelfName(undefined, undefined)).toBe("Dieses Gerät");
  });
});

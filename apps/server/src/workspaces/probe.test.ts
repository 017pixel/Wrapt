import { describe, expect, it, vi } from "vitest";
import { deriveWorkspaceStatusFromFetchError, deriveWorkspaceStatusFromHealth, probeWorkspaceUrl } from "./probe.js";

const health = {
  status: "ok",
  version: "1.19.2",
  appName: "Wrapt",
  instanceName: "MacBook",
  timestamp: "2026-09-24T10:00:00.000Z",
  bootId: "boot-1",
  webBuildId: 42,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Workspace-Probe", () => {
  it("unterscheidet DNS-Fehler, Offline und fehlende Berechtigung aus Fetch-Fehlern", () => {
    expect(deriveWorkspaceStatusFromFetchError(new TypeError("Failed to fetch"))).toBe("offline");
    expect(deriveWorkspaceStatusFromFetchError(new Error("net::ERR_NAME_NOT_RESOLVED"))).toBe("not-tailnet");
    expect(deriveWorkspaceStatusFromFetchError({ status: 401 })).toBe("no-access");
    expect(deriveWorkspaceStatusFromFetchError({ statusCode: 403 })).toBe("no-access");
    // Node-Verpackung: TypeError mit cause aus undici.
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND forschungs-server"), { code: "ENOTFOUND" });
    expect(deriveWorkspaceStatusFromFetchError(Object.assign(new TypeError("fetch failed"), { cause }))).toBe("not-tailnet");
    expect(deriveWorkspaceStatusFromFetchError(Object.assign(new TypeError("fetch failed"), { cause: new Error("connect ECONNREFUSED") }))).toBe("offline");
    expect(deriveWorkspaceStatusFromFetchError(Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }))).toBe("offline");
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

  it("liest Health über HTTP und übernimmt Version, Instanzname und bootId", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ...health, version: "1.19.0" }));
    const result = await probeWorkspaceUrl("https://zweit.example.ts.net:8443", "1.19.2", fetcher as unknown as typeof fetch);
    expect(result).toEqual({ status: "live", reachable: true, version: "1.19.0", instanceName: "MacBook", appName: "Wrapt", bootId: "boot-1" });
    expect(fetcher).toHaveBeenCalledWith("https://zweit.example.ts.net:8443/api/v1/health", expect.objectContaining({ method: "GET", redirect: "manual" }));
  });

  it("wertet 401 als fehlenden Zugriff und 500 als offline", async () => {
    const denied = await probeWorkspaceUrl("https://zweit.example.ts.net", "1.19.2", (async () => jsonResponse(401, {})) as typeof fetch);
    expect(denied).toMatchObject({ status: "no-access", reachable: false });
    const broken = await probeWorkspaceUrl("https://zweit.example.ts.net", "1.19.2", (async () => jsonResponse(500, {})) as typeof fetch);
    expect(broken).toMatchObject({ status: "offline", reachable: false });
  });

  it("behandelt Redirects und kaputte Antworten als offline", async () => {
    const redirect = await probeWorkspaceUrl("https://zweit.example.ts.net", "1.19.2", (async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })) as typeof fetch);
    expect(redirect).toMatchObject({ status: "offline", reachable: false });
    const notJson = await probeWorkspaceUrl("https://zweit.example.ts.net", "1.19.2", (async () => new Response("<html>", { status: 200 })) as typeof fetch);
    expect(notJson).toMatchObject({ status: "offline", reachable: false });
  });

  it("probiert nur HTTPS oder Loopback-HTTP und fasst sonst den Fetcher nicht an", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, health));
    expect(await probeWorkspaceUrl("http://zweit.example.ts.net", "1.19.2", fetcher as unknown as typeof fetch)).toMatchObject({ status: "offline", reachable: false });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await probeWorkspaceUrl("javascript:alert(1)", "1.19.2", fetcher as unknown as typeof fetch)).toMatchObject({ status: "offline" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await probeWorkspaceUrl("http://127.0.0.1:5199", "1.19.2", fetcher as unknown as typeof fetch)).toMatchObject({ status: "live" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

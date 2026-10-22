import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { isSameOriginReadRequest, isSameOriginRequest, isWebSocketOriginAllowed } from "./same-origin.js";

describe("isSameOriginRequest", () => {
  it("accepts the matching Workbench origin and rejects cross-origin upgrades", async () => {
    const app = Fastify({ trustProxy: ["127.0.0.1"] });
    app.get("/check", (request) => ({ sameOrigin: isSameOriginRequest(request), websocket: isWebSocketOriginAllowed(request) }));
    expect((await app.inject({ url: "/check", headers: { origin: "https://workbench.example:8443", host: "workbench.example:8443", "x-forwarded-proto": "https" } })).json()).toEqual({ sameOrigin: true, websocket: true });
    expect((await app.inject({ url: "/check", headers: { origin: "https://attacker.example", host: "workbench.example:8443", "x-forwarded-proto": "https" } })).json()).toEqual({ sameOrigin: false, websocket: false });
    expect((await app.inject({ url: "/check", headers: { host: "workbench.example:8443" } })).json()).toEqual({ sameOrigin: false, websocket: false });
    await app.close();
  });
});

describe("isSameOriginReadRequest", () => {
  const check = (headers: FastifyRequest["headers"], protocol = "https") =>
    isSameOriginReadRequest({ headers: { host: "workbench.test", ...headers }, protocol } as FastifyRequest);

  it("erlaubt den passenden Origin", () => {
    expect(check({ origin: "https://workbench.test" })).toBe(true);
  });

  it("erlaubt Browser-GETs ohne Origin mit same-origin-Metadaten", () => {
    expect(check({ "sec-fetch-site": "same-origin" })).toBe(true);
  });

  it("erlaubt CLI-Aufrufe ohne Origin und Fetch-Metadata", () => {
    expect(check({})).toBe(true);
  });

  it.each(["cross-site", "same-site", "none", "", "unbekannt"])("weist Fetch-Metadata %j zurück", (site) => {
    expect(check({ "sec-fetch-site": site })).toBe(false);
    expect(check({ origin: "https://workbench.test", "sec-fetch-site": site })).toBe(false);
  });

  it.each(["https://evil.test", "http://workbench.test", "https://workbench.test:8443", "null", "", "ungültig"])("weist den Origin %j auch ohne Fetch-Metadata zurück", (origin) => {
    expect(check({ origin })).toBe(false);
    expect(check({ origin, "sec-fetch-site": "same-origin" })).toBe(false);
  });

  it.each([
    { headers: {}, protocol: "https" },
    { headers: { host: "" }, protocol: "https" },
    { headers: { host: "[ungültig" }, protocol: "https" },
    { headers: { host: "workbench.test" }, protocol: undefined },
    { headers: { host: "workbench.test" }, protocol: "" },
    { headers: { host: "workbench.test" }, protocol: "ftp" },
  ])("weist einen nicht auflösbaren Host oder ein ungültiges Protokoll zurück: %j", (request) => {
    for (const headers of [{}, { "sec-fetch-site": "same-origin" }, { origin: "https://workbench.test" }]) {
      const invalidRequest = { ...request, headers: { ...request.headers, ...headers } };
      expect(isSameOriginReadRequest(invalidRequest as unknown as FastifyRequest)).toBe(false);
    }
  });

  it("berücksichtigt weitergeleiteten Host und Protokoll wie die strikte Prüfung", () => {
    const headers = { host: "localhost:3010", "x-forwarded-host": "workbench.test:8443", "x-forwarded-proto": "https" };
    expect(check(headers, "http")).toBe(true);
    expect(check({ ...headers, origin: "https://workbench.test:8443" }, "http")).toBe(true);
    expect(check({ ...headers, origin: "http://localhost:3010" }, "http")).toBe(false);
    expect(check({ ...headers, "x-forwarded-proto": "ftp" }, "http")).toBe(false);
  });
});

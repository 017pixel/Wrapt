import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { isProtectedWorkbenchRequest, requireWorkbenchAdmin, resolveWorkbenchUser } from "./workbench-identity.js";

function request(
  url: string,
  headers: Record<string, string> = {},
  remoteAddress = "100.64.0.2",
  rawHeaders = Object.entries(headers).flatMap(([name, value]) => [name, value]),
) {
  return { url, raw: { url, rawHeaders, socket: { remoteAddress } }, headers } as unknown as FastifyRequest;
}

describe("Workbench-Identität", () => {
  it("schützt die Hermes-Verwaltung wie die übrigen privaten Bereiche", () => {
    expect(isProtectedWorkbenchRequest(request("/hermes/api/config"))).toBe(true);
    expect(() => resolveWorkbenchUser(request("/hermes/api/config"), { allowedUsers: ["user@example.com"] })).toThrowError(/Identität/);
    expect(() => resolveWorkbenchUser(request("/hermes/api/config"), { allowedUsers: ["user@example.com"] })).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });

  it("lehnt nicht erlaubte Hermes-Identitäten ab", () => {
    expect(() => resolveWorkbenchUser(request("/hermes/api/config", { "tailscale-user-login": "other@example.com" }), { allowedUsers: ["user@example.com"] })).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("trennt Administratoren serverseitig von normalen Workbench-Nutzern", () => {
    const options = { allowedUsers: ["admin@example.com", "member@example.com"], adminUsers: ["admin@example.com"] };
    expect(requireWorkbenchAdmin(request("/api/v1/extensions", { "tailscale-user-login": "admin@example.com" }), options)).toBe("admin@example.com");
    expect(() => requireWorkbenchAdmin(request("/api/v1/extensions", { "tailscale-user-login": "member@example.com" }), options)).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("nutzt für abwärtskompatible Konfiguration den ersten erlaubten Nutzer als Admin", () => {
    expect(requireWorkbenchAdmin(request("/api/v1/extensions", { "tailscale-user-login": "first@example.com" }), { allowedUsers: ["first@example.com", "second@example.com"] })).toBe("first@example.com");
  });

  it("vertraut Loopback nur bei aktiver Einstellung und verwendet den konfigurierten Namen", () => {
    const localRequest = request("/api/v1/health", {}, "127.0.0.1");
    const options = { allowedUsers: ["macuser"], localLoopbackTrust: true, localUsername: "MacUser" };
    expect(resolveWorkbenchUser(localRequest, options)).toBe("macuser");
    expect(() => resolveWorkbenchUser(localRequest, { ...options, localLoopbackTrust: false })).toThrowError(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("lässt den lokalen Benutzer ohne allowedUsers-Eintrag zu, vergibt aber keine Adminrolle", () => {
    const localRequest = request("/api/v1/extensions", {}, "127.0.0.1");
    const options = { allowedUsers: ["member@example.com"], localLoopbackTrust: true, localUsername: "local-user" };
    expect(resolveWorkbenchUser(localRequest, options)).toBe("local-user");
    expect(() => requireWorkbenchAdmin(localRequest, options)).toThrowError(expect.objectContaining({ statusCode: 403 }));
    expect(resolveWorkbenchUser(localRequest, { ...options, allowedUsers: [] })).toBe("local-user");
  });

  it("vergibt den lokalen Bypass nicht an eine Tailnet-Identität", () => {
    expect(() => resolveWorkbenchUser(request(
      "/api/v1/extensions",
      { "tailscale-user-login": "local-user" },
      "100.64.0.8",
    ), {
      allowedUsers: ["member@example.com"], localLoopbackTrust: true, localUsername: "local-user",
    })).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("behandelt lokale Benutzer wie andere erlaubte Benutzer und Administratoren", () => {
    const localRequest = request("/api/v1/extensions", {}, "::1");
    const options = { allowedUsers: ["macuser", "member@example.com"], adminUsers: ["macuser"], localLoopbackTrust: true, localUsername: "macuser" };
    expect(requireWorkbenchAdmin(localRequest, options)).toBe("macuser");
    expect(() => requireWorkbenchAdmin(localRequest, { ...options, adminUsers: ["member@example.com"] })).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    );
    expect(resolveWorkbenchUser(localRequest, { ...options, allowedUsers: ["member@example.com"] })).toBe("macuser");
  });

  it("bevorzugt einen vorhandenen Tailscale-Login auch auf Loopback", () => {
    const localRequest = request("/api/v1/extensions", { "tailscale-user-login": "tailnet@example.com" }, "127.0.0.1");
    expect(() => resolveWorkbenchUser(localRequest, {
      allowedUsers: ["macuser"],
      localLoopbackTrust: true,
      localUsername: "macuser",
    })).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("stuft Forwarded-Anfragen und direkte Tailnet-Verbindungen nicht als lokal ein", () => {
    for (const header of ["x-forwarded-for", "x-forwarded-proto", "x-forwarded-host"]) {
      expect(() => resolveWorkbenchUser(request("/api/v1/extensions", { [header]: "127.0.0.1" }, "127.0.0.1"), {
        allowedUsers: ["macuser"], localLoopbackTrust: true, localUsername: "macuser",
      })).toThrowError(expect.objectContaining({ statusCode: 401 }));
    }
    expect(() => resolveWorkbenchUser(request("/api/v1/extensions", {}, "100.64.0.8"), {
      allowedUsers: ["macuser"], localLoopbackTrust: true, localUsername: "macuser",
    })).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });

  it("erkennt Forwarded-Header unabhängig von ihrer Schreibweise", () => {
    expect(() => resolveWorkbenchUser(request(
      "/api/v1/extensions",
      { "X-Forwarded-For": "127.0.0.1" },
      "127.0.0.1",
    ), {
      allowedUsers: ["macuser"], localLoopbackTrust: true, localUsername: "macuser",
    })).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });

  it("verhindert lokales Vertrauen bei doppelten Forwarded-Headern", () => {
    const duplicateHeaderRequest = request(
      "/api/v1/extensions",
      {},
      "127.0.0.1",
      ["x-forwarded-for", "127.0.0.1", "X-Forwarded-For", ""],
    );
    expect(() => resolveWorkbenchUser(duplicateHeaderRequest, {
      allowedUsers: ["macuser"], localLoopbackTrust: true, localUsername: "macuser",
    })).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });

  it("blockiert auch leere Tailscale-Header vor der lokalen Einstufung", () => {
    expect(() => resolveWorkbenchUser(request("/api/v1/extensions", { "tailscale-user-login": "" }, "127.0.0.1"), {
      allowedUsers: ["macuser"], localLoopbackTrust: true, localUsername: "macuser",
    })).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });

  it("überlässt den T3-WebSocket der eigenen Authentifizierung", () => {
    expect(isProtectedWorkbenchRequest(request("/ws"))).toBe(false);
  });

  it("lässt den lokalen Preview-Doctor ohne Tailscale-Identität durch", () => {
    // Die Doctor-Routen schützen sich selbst über Loopback und Capability-Token.
    expect(isProtectedWorkbenchRequest(request("/api/v1/previews/doctor/status"))).toBe(false);
    expect(isProtectedWorkbenchRequest(request("/api/v1/previews/doctor/logs"))).toBe(false);
    expect(isProtectedWorkbenchRequest(request("/api/v1/previews/doctor/probe"))).toBe(false);
  });
});

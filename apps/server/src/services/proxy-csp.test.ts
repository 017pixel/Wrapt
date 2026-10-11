import { describe, expect, it } from "vitest";
import { mergeProxyContentSecurityPolicy } from "./proxy-csp.js";

describe("Proxy-CSP-Merge (S-007)", () => {
  it("härtet Antworten ohne Upstream-CSP mit einer Minimal-Policy", () => {
    const merged = mergeProxyContentSecurityPolicy({ "content-type": "text/html" });
    const policy = String(merged.headers["content-security-policy"]);
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(merged.changes).toHaveLength(3);
  });

  it("behält die Upstream-CSP und ergänzt nur fehlende Einbettungs-Regeln", () => {
    const merged = mergeProxyContentSecurityPolicy({
      "content-security-policy": "default-src 'self'; script-src 'nonce-abc' 'self'",
    });
    const policy = String(merged.headers["content-security-policy"]);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'nonce-abc' 'self'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(merged.changes).toContain("frame-ancestors 'self' gesetzt");
  });

  it("ersetzt frame-ancestors 'none' nicht still, sondern dokumentiert", () => {
    const merged = mergeProxyContentSecurityPolicy({
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
    });
    const policy = String(merged.headers["content-security-policy"]);
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).not.toContain("frame-ancestors 'none'");
    expect(merged.changes).toContain("frame-ancestors 'none' durch 'self' ersetzt");
  });

  it("fasst script-src nie an, damit Upstream-Inline-Scripts weiterlaufen", () => {
    const merged = mergeProxyContentSecurityPolicy({
      "content-security-policy": "script-src 'unsafe-inline'",
    });
    expect(String(merged.headers["content-security-policy"])).toContain("script-src 'unsafe-inline'");
  });

  it("lässt mehrfache CSP-Header unangetastet", () => {
    const merged = mergeProxyContentSecurityPolicy({ "content-security-policy": ["a", "b"] });
    expect(merged.headers["content-security-policy"]).toEqual(["a", "b"]);
    expect(merged.changes).toHaveLength(0);
  });

  it("liefert kein ausführbares Fremdscript über den generischen Proxy", async () => {
    // Der generische /api/proxy verweigert HTML komplett (415 + default-src
    // 'none'): Ein Upstream mit <script src="https://evil.example/x.js"> wird
    // nie als ausführbares Dokument ausgeliefert. Assert auf Header-Ebene.
    const { createProxyHandler } = await import("../api/proxy.js");
    const { default: Fastify } = await import("fastify");
    const { createServer } = await import("node:http");
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end('<html><head><script src="https://evil.example/x.js"></script></head><body>ok</body></html>');
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    try {
      const address = upstream.address();
      const origin = typeof address === "object" && address !== null ? `http://127.0.0.1:${address.port}` : "";
      const app = Fastify();
      app.get("/proxy/*", createProxyHandler([origin]));
      const response = await app.inject({ url: `/proxy/${encodeURIComponent(`${origin}/seite`)}` });
      expect(response.statusCode).toBe(415);
      expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
      expect(response.body).not.toContain("evil.example");
      await app.close();
    } finally {
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});

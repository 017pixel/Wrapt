import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";

describe("Origin-Grenze der Hermes-V2-Ressourcen", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); });
  afterEach(async () => { await f.close(); });

  const readMemory = (headers: Record<string, string> = {}) => f.app.inject({
    method: "GET",
    url: "/api/v1/hermes/v2/memory",
    headers: { host: "workbench.test", "tailscale-user-login": "a", ...headers },
  });

  it.each([{}, { "sec-fetch-site": "same-origin" }, { origin: "http://workbench.test" }])(
    "liest Memory mit erlaubten Headern: %j", async (headers) => {
      const response = await readMemory(headers);
      expect(response.statusCode).toBe(200);
      expect(response.json().builtinOnly).toBe(true);
      expect(f.writes).toHaveLength(0);
    },
  );

  it.each([
    { origin: "http://evil.test" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { origin: "http://evil.test", "sec-fetch-site": "same-origin" },
    { origin: "http://workbench.test", "sec-fetch-site": "cross-site" },
  ])("weist fremde Leseanfragen vor nativen Reads zurück: %j", async (headers) => {
    const response = await readMemory(headers);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "FORBIDDEN",
      message: "Diese Ressourcenfläche ist nur vom Wrapt-Origin erreichbar.",
    });
    expect(f.paths).toHaveLength(0);
    expect(f.writes).toHaveLength(0);
  });

  it("weist Mutationen mit fremdem Origin zurück", async () => {
    const scope = await f.scope();
    const response = await f.request("POST", "/cron/jobs/job-1/pause", { scope }, "a", "http://evil.test");
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("FORBIDDEN");
    expect(f.writes).toHaveLength(0);
  });

  it("erlaubt weiterhin CLI-Mutationen ohne Origin und Fetch-Metadata", async () => {
    const scope = await f.scope();
    const response = await f.app.inject({
      method: "POST",
      url: "/api/v1/hermes/v2/cron/jobs/job-1/pause",
      headers: { host: "workbench.test", "tailscale-user-login": "a" },
      payload: { scope },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ operation: "pause", outcome: "confirmed" });
    expect(f.writes).toHaveLength(1);
  });

  it("fordert bei Browser-Mutationen weiterhin einen passenden Origin", async () => {
    const scope = await f.scope();
    const response = await f.app.inject({
      method: "POST",
      url: "/api/v1/hermes/v2/cron/jobs/job-1/pause",
      headers: { host: "workbench.test", "tailscale-user-login": "a", "sec-fetch-site": "same-origin" },
      payload: { scope },
    });
    expect(response.statusCode).toBe(403);
    expect(f.writes).toHaveLength(0);
  });
});

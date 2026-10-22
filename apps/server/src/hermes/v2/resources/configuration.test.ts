import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";
import { object } from "../normalize-values.js";

describe("Profilgebundene Hermes-Konfiguration", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  let config: Record<string, unknown>;
  beforeEach(async () => {
    f = await resourceFixture();
    config = { timezone: "Europe/Berlin", model: { default: "test-model" }, agent: { max_turns: 90, secret: "private" }, compression: { enabled: true }, approvals: { mode: "manual" }, api_key: "private" };
    f.hook((method, path, body) => {
      if (new URL(path, "http://fake").pathname !== "/api/config") return undefined;
      if (method === "GET") return config;
      const changes = object(object(body).config);
      for (const [key, value] of Object.entries(changes)) {
        config[key] = typeof value === "object" ? { ...object(config[key]), ...object(value) } : value;
      }
      return { ok: true };
    });
  });
  afterEach(async () => { await f.close(); });
  const read = async () => (await f.request("GET", "/configuration")).json();
  it("liefert nur erlaubte Werte ohne Schlüssel oder vollständige Konfiguration", async () => {
    const data = await read();
    expect(data).toMatchObject({ profile: "default", model: "test-model", values: { timezone: "Europe/Berlin", maxTurns: 90, compressionEnabled: true } });
    expect(JSON.stringify(data)).not.toContain("private");
    expect(data).not.toHaveProperty("api_key");
  });
  it("schreibt nur geänderte Felder und bestätigt neu gelesene Werte", async () => {
    const data = await read();
    const response = await f.request("PUT", "/configuration", { scope: data.scope, expected: data.values, changes: { maxTurns: 100 } });
    expect(response.statusCode).toBe(200);
    expect(response.json().values.maxTurns).toBe(100);
    expect(f.writes).toEqual([{ method: "PUT", path: "/api/config?profile=default", body: { config: { agent: { max_turns: 100 } } } }]);
    expect(object(config.agent).secret).toBe("private");
  });
  it("verhindert das Überschreiben inzwischen geänderter Werte", async () => {
    const data = await read(); config.timezone = "UTC";
    const response = await f.request("PUT", "/configuration", { scope: data.scope, expected: data.values, changes: { maxTurns: 100 } });
    expect(response.statusCode).toBe(409); expect(f.writes).toHaveLength(0);
  });
  it("weist ungültige Zeitzonen und nicht freigegebene Felder zurück", async () => {
    const data = await read();
    for (const changes of [{ timezone: "invalid/location" }, { api_key: "private" }, { maxTurns: 0 }]) {
      const response = await f.request("PUT", "/configuration", { scope: data.scope, expected: data.values, changes });
      expect(response.statusCode).toBe(400);
    }
    expect(f.writes).toHaveLength(0);
  });
  it("bestätigt keinen unklaren Schreibausgang und wiederholt ihn nicht", async () => {
    const data = await read();
    f.hook((method, path) => new URL(path, "http://fake").pathname === "/api/config" ? method === "GET" ? config : { ok: false } : undefined);
    const response = await f.request("PUT", "/configuration", { scope: data.scope, expected: data.values, changes: { compressionEnabled: false } });
    expect(response.json().outcome).toBe("unknown"); expect(f.writes).toHaveLength(1);
  });
});

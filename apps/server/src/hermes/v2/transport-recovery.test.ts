import { afterEach, describe, expect, it, vi } from "vitest";
import { securityFixture, type SecurityFixture } from "./security-test.fixture.js";

describe("Transportabbrüche sind keine Vertragsänderungen", () => {
  let f: SecurityFixture | undefined;
  afterEach(async () => { vi.restoreAllMocks(); await f?.close(); });

  it("verbindet nach Abbruch des Capability-Handshakes erneut", async () => {
    f = await securityFixture();
    f.gateway.dropReplies.add("client.capabilities");
    await expect.poll(() => f!.gateway.connections).toBeGreaterThan(1);
    await expect.poll(() => f!.manager.upstream.state).toBe("online");
    expect(f.manager.upstream.quarantined).toBe(false);
    expect(f.messages.some((entry) => entry.type === "connection" && entry.state === "incompatible")).toBe(false);
  });

  it("verbindet nach unterbrochenem Heartbeat erneut", async () => {
    f = await securityFixture({ heartbeatMs: 20, heartbeatTimeoutMs: 200 });
    await expect.poll(() => f!.manager.upstream.state).toBe("online");
    f.gateway.dropReplies.add("gateway.ping");
    await expect.poll(() => f!.gateway.connections).toBeGreaterThan(1);
    await expect.poll(() => f!.manager.upstream.state).toBe("online");
    expect(f.manager.upstream.quarantined).toBe(false);
    expect(f.messages.some((entry) => entry.type === "connection" && entry.state === "incompatible")).toBe(false);
  });

  it("verbindet nach überschrittener Heartbeat-Frist erneut", async () => {
    f = await securityFixture({ heartbeatMs: 20, heartbeatTimeoutMs: 50 });
    await expect.poll(() => f!.manager.upstream.state).toBe("online");
    const call = f.manager.upstream.call.bind(f.manager.upstream);
    let recover = false;
    vi.spyOn(f.manager.upstream, "call").mockImplementation((method, params, mutation) =>
      method === "gateway.ping" && !recover ? new Promise(() => undefined) : call(method, params, mutation));
    await expect.poll(() => f!.gateway.connections).toBeGreaterThan(1);
    recover = true;
    await expect.poll(() => f!.manager.upstream.state).toBe("online");
    expect(f.manager.upstream.quarantined).toBe(false);
  });

  it("sperrt weiterhin bei einem tatsächlich ungültigen Heartbeat-Vertrag", async () => {
    f = await securityFixture({ heartbeatMs: 20, heartbeatTimeoutMs: 200 });
    f.gateway.resultHook = (method, _params, value) => method === "gateway.ping" ? { ok: "invalid" } : value;
    await expect.poll(() => f!.manager.upstream.state).toBe("incompatible");
    expect(f.manager.upstream.quarantined).toBe(true);
  });
});

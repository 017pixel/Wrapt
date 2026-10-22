import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { FakeGateway } from "./fake-gateway.fixture.js";
import { GatewayPool } from "./pool.js";

describe("Kalter Browser-Gateway-Start", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "hermes-v2-bootstrap-"));
    const gateway = new FakeGateway(root);
    const deps = gateway.dependencies(await gateway.start());
    const pool = new GatewayPool(deps);
    cleanup.push(async () => { pool.dispose(); await gateway.close(); await rm(root, { recursive: true, force: true }); });
    return { gateway, deps, pool };
  }

  it("öffnet erst beim autorisierten Browser und wird ohne ersten RPC online", async () => {
    const { gateway, pool } = await fixture();
    const manager = pool.get("ben");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gateway.connections).toBe(0);
    const frames: HermesV2ServerMessage[] = [];
    manager.add({ id: "tab-a", send: (frame) => frames.push(frame) });
    manager.add({ id: "tab-b", send: (frame) => frames.push(frame) });
    await expect.poll(() => frames.filter((frame) => frame.type === "connection" && frame.state === "online").length).toBe(2);
    expect(gateway.connections).toBe(1);
    expect(gateway.calls.map((call) => call.method)).toEqual(["client.capabilities"]);
    expect(manager.sessions.records.size).toBe(0);
    expect(JSON.stringify(frames)).not.toContain(gateway.token);
  });

  it("verbindet keinen deaktivierten Browser", async () => {
    const { gateway, deps, pool } = await fixture();
    deps.enabled = () => false;
    expect(() => pool.get("ben").add({ id: "tab", send() {} })).toThrow("deaktiviert");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gateway.connections).toBe(0);
  });

  it("öffnet nach letztem Flag-off während des Token-Awaits keinen Core-Socket", async () => {
    const { gateway, deps, pool } = await fixture();
    let completeToken!: (token: string) => void;
    deps.dashboard.token.get = () => new Promise<string>((resolve) => { completeToken = resolve; });
    const manager = pool.get("ben");
    const frames: HermesV2ServerMessage[] = [];
    manager.add({ id: "tab", send: (frame) => frames.push(frame) });
    manager.release("tab", "v2-disabled");
    const count = frames.length;
    completeToken(gateway.token);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(gateway.connections).toBe(0);
    expect(frames).toHaveLength(count);
    expect(manager.upstream.state).toBe("offline");
  });

  it("projiziert Tokenfehler generisch und behandelt den Startfehler", async () => {
    const { deps, pool } = await fixture();
    deps.dashboard.token.get = async () => { throw new Error("PRIVATE-TOKEN-CONTENT"); };
    const frames: HermesV2ServerMessage[] = [];
    pool.get("ben").add({ id: "tab", send: (frame) => frames.push(frame) });
    await expect.poll(() => frames.some((frame) => frame.type === "error")).toBe(true);
    expect(JSON.stringify(frames)).not.toContain("PRIVATE-TOKEN-CONTENT");
    expect(frames.find((frame) => frame.type === "error")).toMatchObject({ code: "GATEWAY_OFFLINE", outcome: "not_sent" });
  });
});

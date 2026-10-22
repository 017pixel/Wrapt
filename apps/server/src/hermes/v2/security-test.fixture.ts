import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hermesV2ClientMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { FakeGateway } from "./fake-gateway.fixture.js";
import { GatewayPool } from "./pool.js";
import type { HermesV2Policy } from "./policy.js";

export const clientMessage = (value: object) => hermesV2ClientMessageSchema.parse({ v: 1, id: randomUUID(), ...value });

/** Isolierte Sicherheitstests teilen nur ihren Fake-Core und niemals Nutzerzustand. */
export async function securityFixture(policy: Partial<HermesV2Policy> = {}) {
  const root = await mkdtemp(join(tmpdir(), "hermes-v2-security-"));
  const gateway = new FakeGateway(root);
  const deps = gateway.dependencies(await gateway.start());
  const control = { enabled: true };
  deps.enabled = () => control.enabled;
  deps.policy = { ...deps.policy, ...policy };
  const pool = new GatewayPool(deps);
  const manager = pool.get("ben");
  const messages: HermesV2ServerMessage[] = [];
  manager.add({ id: "tab", send: (value) => messages.push(value) });
  return {
    root, gateway, deps, control, pool, manager, messages,
    async close() {
      pool.dispose();
      await gateway.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export type SecurityFixture = Awaited<ReturnType<typeof securityFixture>>;

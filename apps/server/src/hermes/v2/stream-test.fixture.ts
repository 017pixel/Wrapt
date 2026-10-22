import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { hermesV2ServerMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { securityFixture, clientMessage as message } from "./security-test.fixture.js";
import type { HermesV2Policy } from "./policy.js";

export type StreamKind = "message.delta" | "reasoning.delta";
export async function streamFixture(policy: Partial<HermesV2Policy> = {}) {
  const f = await securityFixture(policy);
  const session = f.gateway.seed("exact-stream-session");
  await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
  const record = f.manager.sessions.records.get(session.id)!;
  async function learn(value: string) {
    const id = `srq-${randomUUID()}`; const count = f.gateway.responses.length;
    f.gateway.request(session, "secret", { prompt: "Synthetischer Streamtest" }, id);
    await expect.poll(() => record.snapshot.requests.some((row) => row.kind === "secret")).toBe(true);
    const request = record.snapshot.requests.find((row) => row.kind === "secret")!;
    await f.manager.handle("tab", message({ op: "request.respond", sessionId: session.id, epoch: request.epoch, requestKey: request.key, response: { kind: "secret", value } }));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "request.respond" });
    await expect.poll(() => f.gateway.responses.length).toBe(count + 1);
  }
  async function event(type: string, payload: Record<string, unknown> = {}) {
    f.gateway.event(session, type, payload); const seq = session.seq;
    await expect.poll(() => f.messages.some((frame) => frame.type === "event" && frame.event.epoch === f.gateway.epoch && frame.event.seq === seq)).toBe(true);
  }
  const frames = (kind: StreamKind, messages: HermesV2ServerMessage[] = f.messages) => messages.flatMap((frame) => {
    if (frame.type !== "event" || frame.event.type !== kind) return [];
    hermesV2ServerMessageSchema.parse(frame); expect(frame.event.sessionId).toBe(session.id);
    expect(frame.event.payload.text.length).toBeLessThanOrEqual(200_000); return [frame.event];
  });
  const buffer = f.manager.secrets as unknown as { tails: Map<string, string>; streamSuppressed: boolean };
  return { ...f, session, record, learn, event, frames, buffer };
}
export type StreamFixture = Awaited<ReturnType<typeof streamFixture>>;

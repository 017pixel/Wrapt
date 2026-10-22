import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HERMES_V2_TEXT_MAX_LENGTH, hermesV2ServerMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { clientMessage as message, securityFixture, type SecurityFixture } from "./security-test.fixture.js";
import { SecretRedactor } from "./secret-redactor.js";
import { hermesV2Policy } from "./policy.js";

describe("Security: kanonisches JSON und begrenzte Streams", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { await f.close(); });

  async function subscribeBoth() {
    const session = f.gateway.seed("encoded-secret");
    const other = f.pool.get("admin");
    const otherMessages: HermesV2ServerMessage[] = [];
    other.add({ id: "tab", send: (value) => otherMessages.push(value) });
    for (const manager of [f.manager, other]) await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    return { session, other, output: [f.messages, otherMessages] };
  }

  async function secretResponse(sessionId: string, value: string, vault = false) {
    f.gateway.request(f.gateway.sessions.get(sessionId)!, vault ? "vault.save_login" : "secret", { prompt: "Dummy" });
    await expect.poll(() => f.manager.sessions.records.get(sessionId)?.snapshot.requests.length).toBe(1);
    const request = f.manager.sessions.records.get(sessionId)!.snapshot.requests[0]!;
    await f.manager.handle("tab", message({ op: "request.respond", sessionId, requestKey: request.key, epoch: request.epoch, response: { kind: "secret", value } }));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "request.respond" });
  }

  it.each([false, true])("maskiert JSON vor Serialisierung und fragmentierte kanonische Echos bei zwei Principals, Vault=%s", async (vault) => {
    const { session, other, output } = await subscribeBoth();
    const secret = 'R2"QUOTED\\VALUE\n81';
    await secretResponse(session.id, vault ? JSON.stringify({ identifier: "demo", password: secret }) : secret, vault);
    const data = { echo: secret, nested: [{ password: secret, raw: JSON.stringify({ echo: secret }) }] };
    f.gateway.event(session, "tool.start", { tool_id: "json-tool", name: "terminal", args: data });
    f.gateway.event(session, "tool.complete", { tool_id: "json-tool", name: "terminal", result: data });
    const encoded = JSON.stringify({ echo: secret });
    for (const type of ["message.delta", "reasoning.delta"]) {
      f.gateway.event(session, type, { text: encoded.slice(0, 12) });
      f.gateway.event(session, type, { text: encoded.slice(12, 23) });
      f.gateway.event(session, type, { text: encoded.slice(23) });
    }
    await expect.poll(() => output[1]!.filter((value) => value.type === "event" && value.event.type === "reasoning.delta").length).toBe(3);
    const decodedEcho = (value: string) => JSON.parse(value) as { echo: string; nested?: Array<{ password: string; raw: string }> };
    for (const messages of output) {
      for (const type of ["message.delta", "reasoning.delta"] as const) {
        const stream = messages.flatMap((entry) => entry.type === "event" && entry.event.type === type ? [entry.event.payload.text] : []).join("");
        expect(decodedEcho(stream).echo).toBe("***");
      }
      const start = messages.findLast((entry) => entry.type === "event" && entry.event.type === "tool.started");
      const done = messages.findLast((entry) => entry.type === "event" && entry.event.type === "tool.completed");
      if (start?.type !== "event" || start.event.type !== "tool.started" || done?.type !== "event" || done.event.type !== "tool.completed") throw new Error("Toolereignis fehlt");
      for (const json of [start.event.payload.input, done.event.payload.output]) {
        const parsed = decodedEcho(json);
        expect(parsed.echo).toBe("***");
        expect(parsed.nested?.[0]?.password).toBe("***");
        expect(decodedEcho(parsed.nested![0]!.raw).echo).toBe("***");
      }
    }
    session.messages.push({ id: 1, role: "assistant", tool_calls: [{ id: "json-tool", function: { name: "terminal", arguments: data } }] }, { id: 2, role: "tool", tool_call_id: "json-tool", content: "Done", args: data });
    for (const manager of [f.manager, other]) await manager.handle("tab", message({ op: "history.read", sessionId: session.id }));
    for (const messages of output) {
      const result = messages.at(-1);
      if (result?.type !== "result" || result.op !== "history.read") throw new Error("History fehlt");
      expect(decodedEcho(result.data.messages.find((entry) => entry.role === "tool")!.input!).echo).toBe("***");
      expect(JSON.stringify(messages)).not.toContain(secret);
      expect(JSON.stringify(messages)).not.toContain(JSON.stringify(secret).slice(1, -1));
    }
    f.manager.release("tab", "v2-disabled");
    other.release("tab", "v2-disabled");
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
    const fresh = f.pool.get("new-principal");
    const messages: HermesV2ServerMessage[] = [];
    fresh.add({ id: "tab", send: (value) => messages.push(value) });
    await fresh.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    const result = messages.at(-1);
    if (result?.type !== "result" || result.op !== "session.subscribe") throw new Error("Snapshot fehlt");
    expect(decodedEcho(result.data.snapshot.messages.find((entry) => entry.role === "tool")!.input!).echo).toBe("***");
  });

  it("erkennt Rohwert und JSON-Escapes an jeder Chunkgrenze und nimmt Varianten atomar auf", () => {
    const value = 'QUOTE"\\\nEND';
    const encoded = JSON.stringify(value).slice(1, -1);
    const redactor = new SecretRedactor();
    redactor.remember(value);
    for (const variant of [value, encoded]) {
      for (let split = 1; split < variant.length; split++) {
        const channel = `variant:${variant.length}:${split}`;
        expect(redactor.stream(channel, `pre:${variant.slice(0, split)}`) + redactor.stream(channel, `${variant.slice(split)}:post`)).toBe("pre:***:post");
      }
    }
    const bounded = new SecretRedactor({ ...hermesV2Policy, secretValues: 1 });
    expect(() => bounded.remember(value)).toThrow(/ausgelastet/);
    bounded.remember("ACCEPTED");
    expect(bounded.text("ACCEPTED")).toBe("***");
    expect(() => bounded.remember(value)).toThrow(/ausgelastet/);
    expect(bounded.text("ACCEPTED")).toBe("***");
  });

  it.each([{ vault: false, limit: 1 }, { vault: true, limit: 3 }])("weist zusätzliche JSON-Varianten vor Claim/Send atomar ab: Vault=$vault", async ({ vault, limit }) => {
    await f.close();
    f = await securityFixture({ secretValues: limit });
    const session = f.gateway.seed("capacity-json");
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    f.gateway.request(session, vault ? "vault.save_login" : "secret", { prompt: "Dummy" });
    await expect.poll(() => f.manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = f.manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    const send = (value: string) => f.manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "secret", value: vault ? JSON.stringify({ identifier: "demo", password: value }) : value } }));
    await send('NOT"ACCEPTED\\VALUE\n');
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "RATE_LIMITED", outcome: "not_sent" });
    expect(f.gateway.responses).toHaveLength(0);
    await send("FALLBACK");
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "request.respond" });
    expect(f.gateway.responses).toHaveLength(1);
  });

  it.each(["short", "prefix"] as const)("hält Text und Reasoning bei zwei Principals innerhalb der Inhaltsgrenze: %s", async (kind) => {
    const { session, output } = await subscribeBoth();
    const secret = kind === "short" ? "a" : "R2_LONG_SECRET_887";
    await secretResponse(session.id, secret);
    const chunks = kind === "short" ? ["a".repeat(HERMES_V2_TEXT_MAX_LENGTH), "done"]
      : ["R2_LONG_", "Z".repeat(HERMES_V2_TEXT_MAX_LENGTH), "R2_LONG_", "SECRET_887"];
    for (const type of ["message.delta", "reasoning.delta"]) for (const text of chunks) f.gateway.event(session, type, { text });
    await expect.poll(() => output.every((messages) => messages.filter((entry) => entry.type === "event" && entry.event.type === "reasoning.delta").length === chunks.length)).toBe(true);
    for (const messages of output) {
      expect(messages.some((entry) => entry.type === "error")).toBe(false);
      for (const type of ["message.delta", "reasoning.delta"] as const) {
        const events = messages.flatMap((entry) => entry.type === "event" && entry.event.type === type ? [entry.event] : []);
        expect(events).toHaveLength(chunks.length);
        for (const event of events) {
          expect(event.payload.text.length).toBeLessThanOrEqual(HERMES_V2_TEXT_MAX_LENGTH);
          expect(hermesV2ServerMessageSchema.safeParse({ v: 1, type: "event", event }).success).toBe(true);
        }
        expect(events.at(-1)?.payload.text).toBe(kind === "short" ? "done" : "***");
        expect(events.find((event) => event.payload.text.length === HERMES_V2_TEXT_MAX_LENGTH)).toBeDefined();
        const sequences = events.map((event) => event.seq);
        expect(new Set(sequences).size).toBe(events.length);
      }
    }
  });
});

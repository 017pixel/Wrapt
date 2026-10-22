import { describe, beforeEach, afterEach, expect, it } from "vitest";
import { hermesV2ServerMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { clientMessage as message, securityFixture, type SecurityFixture } from "./security-test.fixture.js";
import { withReplayTools } from "./snapshot-tools.js";
import { jsonText } from "./normalize-values.js";
import { sendBrowserMessage } from "./browser-output.js";
import { normalizeInflight } from "./normalize-sessions.js";

describe("Rohtextschutz für Tool, History und Chat", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { await f.close(); });
  async function subscribe() {
    const session = f.gateway.seed("raw-credential-session");
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id })); return session;
  }
  async function learn(session: ReturnType<SecurityFixture["gateway"]["seed"]>, value: string) {
    f.gateway.request(session, "secret", { prompt: "Synthetischer Test" });
    await expect.poll(() => f.manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = f.manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    await f.manager.handle("tab", message({ op: "request.respond", sessionId: session.id, epoch: request.epoch, requestKey: request.key, response: { kind: "secret", value } }));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "request.respond" });
    await expect.poll(() => f.gateway.responses.length).toBe(1);
  }
  it.each(["cred", "entials", "pass", "word"])("erhält sensible Struktur für echte Toolereignisse, History und Replay nach %s", async (secret) => {
    const session = await subscribe(); await learn(session, secret);
    const value = { credentials: { nested: "UNBEKANNTE_CREDENTIAL" }, password: "UNBEKANNTES_PASSWORT", safe: "sichtbar" };
    const before = JSON.stringify(value); const toolId = "credential-password-tool-id";
    f.gateway.event(session, "tool.start", { tool_id: toolId, name: "terminal", args: value });
    f.gateway.event(session, "tool.complete", { tool_id: toolId, name: "terminal", result: value });
    await expect.poll(() => f.messages.some((frame) => frame.type === "event" && frame.event.type === "tool.completed")).toBe(true);
    for (const frame of f.messages.filter((frame) => frame.type === "event" && ["tool.started", "tool.completed"].includes(frame.event.type))) {
      expect(hermesV2ServerMessageSchema.safeParse(frame).success).toBe(true);
      expect(JSON.stringify(frame)).not.toContain("UNBEKANNTE_CREDENTIAL"); expect(JSON.stringify(frame)).not.toContain("UNBEKANNTES_PASSWORT");
      expect(JSON.stringify(frame)).toContain(toolId); expect(JSON.stringify(frame)).toContain("sichtbar");
    }
    session.messages.push({ id: 1, role: "assistant", tool_calls: [{ id: toolId, function: { name: "terminal", arguments: value } }] },
      { id: 2, role: "tool", tool_call_id: toolId, args: value, content: "Ergebnis sichtbar" });
    await f.manager.handle("tab", message({ op: "history.read", sessionId: session.id }));
    const history = f.messages.at(-1); expect(history).toMatchObject({ type: "result", op: "history.read" });
    expect(JSON.stringify(history)).not.toContain("UNBEKANNTE_CREDENTIAL"); expect(JSON.stringify(history)).not.toContain("UNBEKANNTES_PASSWORT");
    expect(JSON.stringify(history)).toContain(toolId); expect(JSON.stringify(history)).toContain("Ergebnis sichtbar");
    const replay = withReplayTools([], [{ type: "tool.start", seq: 10, payload: { tool_id: toolId, args: value } },
      { type: "tool.complete", seq: 11, payload: { tool_id: toolId, result: value } }], { epoch: "epoch", liveId: "live" }, f.manager.secrets);
    expect(replay[0]?.toolId).toBe(toolId); expect(JSON.stringify(replay)).not.toContain("UNBEKANNTE_CREDENTIAL");
    expect(JSON.stringify(replay)).not.toContain("UNBEKANNTES_PASSWORT"); expect(JSON.stringify(value)).toBe(before);
  });
  it.each([["password", "pass"], ["password", "word"], ["api_key", "api"], ["api_key", "key"]])("schützt statischen Tool-/Historyplaintext %s vor der Antwort %s", async (key, secret) => {
    const session = await subscribe(); await learn(session, secret); const value = `${key}=UNBEKANNTER_WERT`;
    f.gateway.event(session, "tool.start", { tool_id: "plain-tool", name: "terminal", args: value });
    f.gateway.event(session, "tool.complete", { tool_id: "plain-tool", name: "terminal", result_text: value });
    await expect.poll(() => f.messages.some((frame) => frame.type === "event" && frame.event.type === "tool.completed")).toBe(true);
    expect(JSON.stringify(f.messages)).not.toContain("UNBEKANNTER_WERT");
    session.messages.push({ id: 1, role: "assistant", tool_calls: [{ id: "plain-tool", function: { name: "terminal", arguments: value } }] });
    await f.manager.handle("tab", message({ op: "history.read", sessionId: session.id }));
    expect(JSON.stringify(f.messages.at(-1))).not.toContain("UNBEKANNTER_WERT");
  });
  for (const [native, expected, reasoning] of [
    ["message.complete", "message.completed", false], ["message.complete", "message.completed", true],
    ["message.interim", "message.interim", false], ["message.delta", "message.delta", false], ["reasoning.delta", "reasoning.delta", false],
  ] as const) it(`schützt vollständigen Rohwert vor Chatbegrenzung: ${native}, Reasoning=${reasoning}`, async () => {
    const session = await subscribe(); const secret = "LONG_PRIVATE_" + "q7".repeat(1000); await learn(session, secret);
    const raw = "x".repeat(199_900) + secret + " Ende";
    f.gateway.event(session, native, { text: reasoning ? "Sichtbarer Text" : raw, ...(reasoning ? { reasoning: raw } : {}), status: "completed", already_streamed: false });
    await expect.poll(() => f.messages.some((frame) => frame.type === "event" && frame.event.type === expected)).toBe(true);
    const frame = f.messages.findLast((frame) => frame.type === "event" && frame.event.type === expected)!;
    expect(hermesV2ServerMessageSchema.safeParse(frame).success).toBe(true); const serialized = JSON.stringify(frame);
    expect(serialized).not.toContain(secret.slice(0, 100)); expect(serialized).toContain(" Ende"); expect(serialized).toContain("x".repeat(100));
  });
  it("prüft gekürzte gecachte Snapshot- und Historyanzeige nach später echter Secretantwort erneut", async () => {
    const session = f.gateway.seed("late-raw-snapshot"); const secret = "LATE_PRIVATE_" + "q7".repeat(1000); const raw = "x".repeat(199_900) + secret;
    session.messages.push({ id: 1, role: "assistant", content: raw, reasoning: raw });
    session.inflight = { user: raw, assistant: raw, corrections: [raw], display_metadata: { display_text: raw }, streaming: true };
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    const snapshot = f.messages.at(-1)!; expect(JSON.stringify(snapshot)).toContain(secret.slice(0, 100));
    await f.manager.handle("tab", message({ op: "history.read", sessionId: session.id })); const history = f.messages.at(-1)!;
    const originals = [snapshot, history].map((frame) => JSON.stringify(frame)); await learn(session, secret);
    const sent: HermesV2ServerMessage[] = [];
    for (const frame of [snapshot, history]) sendBrowserMessage({ id: "late-view", send: (value) => sent.push(value) }, frame, f.manager.secrets, "late:");
    expect(sent).toHaveLength(2);
    for (const frame of sent) {
      expect(hermesV2ServerMessageSchema.safeParse(frame).success).toBe(true); expect(JSON.stringify(frame)).not.toContain(secret.slice(0, 100));
      expect(JSON.stringify(frame)).toContain("x".repeat(100)); expect(JSON.stringify(frame)).toContain(session.id);
    }
    expect([snapshot, history].map((frame) => JSON.stringify(frame))).toEqual(originals);
    const inflight = normalizeInflight(session.inflight, f.manager.secrets)!; expect(inflight.assistant).toContain("***"); expect(inflight.assistant).not.toContain(secret.slice(0, 100));
  });
  it.each([false, true])("vereinigt statische Rawwerte und bekannte lange JSONpräfixe vor JSON-Textkürzung, umgekehrt=%s", (reverse) => {
    const raw = '{"credentials":"UNBEKANNT","safe":"' + "😀".repeat(20_000); const long = raw + '-END"}';
    for (const value of reverse ? [long, "cred"] : ["cred", long]) f.manager.secrets.remember(value);
    expect(jsonText(raw, 100, f.manager.secrets)).toBe("***");
  });
  it.each([0, 1, 2, 3])("hält auch die konservative JSONunterdrückung innerhalb der Grenze %s", (limit) => {
    const value = { safe: "Sichtbar" }; f.manager.secrets.remember(JSON.stringify(value));
    expect(jsonText(value, limit, f.manager.secrets)).toBe("***".slice(0, limit));
  });
});

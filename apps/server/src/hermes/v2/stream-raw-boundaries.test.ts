import { afterEach, describe, expect, it } from "vitest";
import { streamFixture, type StreamFixture } from "./stream-test.fixture.js";

describe("Unveränderte Rawchunks vor dem gemeinsamen Streamabgleich", () => {
  let f: StreamFixture | undefined;
  afterEach(async () => { await f?.close(); });
  for (const kind of ["message.delta", "reasoning.delta"] as const) for (const variant of ["ascii", "raw", "json"]) {
    for (const mode of ["visible", "long-only", "short-first", "long-first"]) for (const large of [false, true]) {
      it(`${kind}, ${variant}, ${mode}, großer erster Chunk=${large}`, async () => {
        f = await streamFixture();
        const prefix = "STREAM_PREFIX_";
        const body = Array.from({ length: 400 }, (_, index) => (index * 982_451_653 + 193).toString(36)).join("_");
        const secret = prefix + (variant === "ascii" ? "SYNTHETIC_" : '"Ä\\\n_') + body;
        const wire = variant === "json" ? JSON.stringify(secret).slice(1, -1) : secret;
        for (const value of mode === "visible" ? [] : mode === "long-only" ? [secret] : mode === "short-first" ? [prefix, secret] : [secret, prefix]) await f.learn(value);
        await f.event("message.start"); f.messages.length = 0;
        // Bei Kurzüberlappung muss bereits der vollständig bekannte kurze Präfix erhalten bleiben.
        const split = large ? 500 : prefix.length;
        const chunks = ["x".repeat(large ? 199_900 : 50) + wire.slice(0, split), wire.slice(split) + " PUBLIC-END!"];
        for (const text of chunks) await f.event(kind, { text });
        const frames = f.frames(kind); expect(frames).toHaveLength(2);
        const output = frames.map((frame) => frame.payload.text).join("");
        expect(output.includes(wire.slice(split, split + 500))).toBe(mode === "visible");
        expect(output).toContain("PUBLIC-END!"); expect(output).toContain("x".repeat(50));
        expect(f.gateway.responses).toHaveLength(mode === "visible" ? 0 : mode === "long-only" ? 1 : 2);
        expect(f.session.events.slice(-2).map((event) => (event.payload as { text: string }).text)).toEqual(chunks);
        expect(f.buffer.tails.size).toBe(0);
      });
    }
  }
  it.each(["message.delta", "reasoning.delta"] as const)("vereinigt statische Rohintervalle und bekannte Werte im vollständigen %s-Chunk", async (kind) => {
    f = await streamFixture(); await f.learn("cred"); await f.learn("pass"); await f.event("message.start");
    const raw = 'PUBLIC-BEGIN {"credentials":"UNBEKANNTER_WERT","password":"FREMDER_WERT","safe":"PUBLIC-END!"}';
    await f.event(kind, { text: raw });
    const output = f.frames(kind).map((frame) => frame.payload.text).join("");
    expect(output).not.toContain("UNBEKANNTER_WERT"); expect(output).not.toContain("FREMDER_WERT");
    expect(output).toContain("PUBLIC-BEGIN"); expect(output).toContain("PUBLIC-END!");
    expect((f.session.events.at(-1)!.payload as { text: string }).text).toBe(raw);
  });
});

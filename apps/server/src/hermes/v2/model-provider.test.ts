import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "./phase6-test.fixture.js";

describe("native Modell- und Anbieterübergabe", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });

  it.each([
    { provider: "openrouter", model: "openai/gpt-5.4-mini" },
    { provider: "openrouter", model: "vendor/model:free" },
    { provider: "custom:api.mistral.ai", model: "mistral-small-latest" },
  ])("bindet $model ausdrücklich an $provider und ausschließlich die Session", async (selection) => {
    const session = f.core.seed("session");
    const original = f.core.resultHook!;
    f.core.resultHook = (method, params, reply) => {
      const value = original(method, params, reply);
      if (method === "model.options") return {
        provider: session.provider, model: session.model,
        providers: [{ slug: selection.provider, name: "Anbieter", authenticated: true, models: [selection.model] }],
      };
      if (method === "config.set" && params.key === "model") {
        // Hermes verwendet --provider; Doppelpunkte gehören zum Modellnamen.
        const words = String(params.value).split(/\s+/u);
        const providerAt = words.indexOf("--provider");
        if (providerAt >= 0) session.provider = words[providerAt + 1]!;
        session.model = words[0]!;
        return { key: "model", value: session.model, deferred: false };
      }
      return value;
    };
    const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const changed = await browser.run({ op: "model.select", sessionId: session.id, selection });
    expect(changed).toMatchObject({ type: "result", op: "model.select", data: { selection, deferred: false } });
    expect(f.core.calls.findLast((call) => call.method === "config.set")).toEqual({
      method: "config.set", params: {
        session_id: session.liveId, key: "model", value: `${selection.model} --provider ${selection.provider} --session`,
      },
    });
    const observed = await browser.run({ op: "catalog.read", sessionId: session.id });
    expect(observed).toMatchObject({ type: "result", op: "catalog.read", data: { models: { current: selection } } });
    expect(f.core.calls.some((call) => call.method === "prompt.submit")).toBe(false);
  });

  it.each([
    { provider: "openrouter --global", model: "model-a" },
    { provider: "test", model: "model-a --global" },
  ])("verweigert eingeschleuste Flags in $provider/$model vor dem Write", async (selection) => {
    const session = f.core.seed("session");
    const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const reply = await browser.run({ op: "model.select", sessionId: session.id, selection });
    expect(reply).toMatchObject({ type: "error", code: "INVALID_MESSAGE", outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "config.set")).toBe(false);
  });
});

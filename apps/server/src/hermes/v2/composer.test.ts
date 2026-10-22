import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composerFixture } from "./phase6-test.fixture.js";
import { normalizeCommands } from "./normalize-catalog.js";

describe("native Composeraktionen und kompatible Projektion", () => {
  let f: Awaited<ReturnType<typeof composerFixture>>;
  beforeEach(async () => { f = await composerFixture(); });
  afterEach(async () => { await f.close(); });
  it("projiziert echte Connection-ID/Settings nur opt-in und entfernt sämtliche additive Katalogfelder", async () => {
    const session = f.core.seed("session");
    const modern = f.browser(); const legacy = f.browser("b", false);
    for (const browser of [modern, legacy]) await browser.run({ op: "session.subscribe", sessionId: session.id });
    expect(modern.messages.find((entry) => entry.type === "connection")).toHaveProperty("connectionId", modern.id);
    expect(legacy.messages.find((entry) => entry.type === "connection")).not.toHaveProperty("connectionId");
    const current = await modern.run({ op: "catalog.read", sessionId: session.id });
    const previous = await legacy.run({ op: "catalog.read", sessionId: session.id });
    expect(current.type === "result" && current.op === "catalog.read" && current.data.hermesEfforts).toContain("ultra");
    expect(JSON.stringify(previous)).not.toMatch(/hermesEfforts|aliases|argumentMode|subcommands|reportedReasoning|canDisableReasoning/);
    const snapshot = legacy.messages.find((entry) => entry.type === "result" && entry.op === "session.subscribe");
    expect(snapshot?.type === "result" && snapshot.op === "session.subscribe" && snapshot.data.snapshot).not.toHaveProperty("composer");
    f.core.event(session, "session.info", { cwd: f.root, approval_mode: "smart", yolo: true, reasoning_effort: "ultra", reasoning_effort_wire: "max" });
    await expect.poll(() => modern.messages.some((entry) => entry.type === "event" && entry.event.type === "session.updated" && entry.event.payload.composer?.reasoning.wire === "max")).toBe(true);
    expect(JSON.stringify(legacy.messages)).not.toContain('"composer"');
  });
  it("behält kanonische Zeilen, belegte Alias-/Argumentmetadaten und case-insensitive Überschattung", () => {
    const commands = normalizeCommands({ pairs: [["/new", "Neu"], ["/skill", "Skill"], ["/help", "Hilfe"]],
      canon: { "/new": "/new", "/n": "/new", "/NATIVE": "/new", "/native": "/new", "/h": "/help" }, skills: { "/skill": {} },
      sub: { new: ["fresh", "branch"] }, commands: { "/new": { argument_mode: "mixed", desktop_subcommands: ["fresh"] } },
      categories: [{ name: "User commands", pairs: [["/N", "Quick"]] }, { name: "Plugin commands", pairs: [["/SKILL", "Plugin"]] }] });
    expect(commands).toHaveLength(3);
    expect(commands[0]).toMatchObject({ aliases: ["/NATIVE"], argumentMode: "mixed", subcommands: ["fresh", "branch"], desktopSubcommands: ["fresh"] });
    expect(commands.find((command) => command.key === "/skill")?.action).toBeNull();
  });
  it("ein Alias wird nicht als zweite ausführbare Katalogzeile projiziert", () => {
    const commands = normalizeCommands({ pairs: [["/new", "Neu"], ["/n", "Alias"]], canon: { "/n": "/new", "/new": "/new" } });
    expect(commands).toHaveLength(1); expect(commands[0]?.aliases).toEqual(["/n"]);
  });
  it("setzt Titel ausschließlich über die native Live-ID, berücksichtigt pending und invalidiert beide Principals", async () => {
    const session = f.core.seed("session"); const browser = f.browser(); const second = f.browser("b");
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    f.pendingTitle(true);
    const result = await browser.run({ op: "session.title", sessionId: session.id, title: "Eigener Titel" });
    expect(result).toMatchObject({ type: "result", op: "session.title", data: { title: "Eigener Titel", pending: true } });
    expect(f.core.calls.filter((call) => call.method === "session.title").at(-1)?.params).toEqual({ session_id: session.liveId, title: "Eigener Titel" });
    expect(second.messages.some((entry) => entry.type === "event" && entry.event.type === "sessions.invalidated")).toBe(true);
  });
  it("setzt nur Session-Effort, trennt requested/Wire und bietet globale Freigabemodi an", async () => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const result = await browser.run({ op: "reasoning.select", sessionId: session.id, effort: "ultra", selection: { provider: "test", model: "model-a" } });
    expect(result).toMatchObject({ type: "result", data: { requested: "ultra", observation: "observed", observed: {
      reasoning: { effort: "ultra", wire: "max" }, approvals: { mode: "manual", effectiveBypass: false, scope: "global", editable: true,
        options: [{ mode: "manual", available: true }, { mode: "smart", available: true }, { mode: "off", available: true }] } } } });
    expect(f.core.calls.filter((call) => call.method === "config.set").map((call) => call.params))
      .toEqual([{ session_id: session.liveId, key: "reasoning", value: "ultra", scope: "session" }]);
  });
  it("schaltet Freigaben über den nativen globalen Key und beobachtet den wirksamen Bypass", async () => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    for (const mode of ["off", "manual", "smart"] as const) {
      expect(await browser.run({ op: "composer.approvals", sessionId: session.id, mode })).toMatchObject({
        type: "result", op: "composer.approvals", data: { mode, observed: { approvals: { mode, effectiveBypass: mode === "off", editable: true } } },
      });
      expect(f.core.calls.filter((call) => call.method === "config.set").at(-1)?.params)
        .toEqual({ session_id: session.liveId, key: "approvals.mode", value: mode });
    }
    const other = f.core.seed("other");
    expect(await browser.run({ op: "session.subscribe", sessionId: other.id })).toMatchObject({ data: { snapshot: { composer: { approvals: { mode: "smart" } } } } });
  });
  it("sendet ohne Composerfreigabe oder nach Verbindungswechsel keinen Freigabewechsel", async () => {
    const session = f.core.seed("session"); const legacy = f.browser("a", false);
    await legacy.run({ op: "session.subscribe", sessionId: session.id });
    expect(await legacy.run({ op: "composer.approvals", sessionId: session.id, mode: "off" })).toMatchObject({ type: "error", outcome: "not_sent" });
    const browser = f.browser(); await browser.run({ op: "session.subscribe", sessionId: session.id });
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, value) => {
      const result = hook(method, params, value);
      if (method === "session.activate") browser.manager.release(browser.id, "v2-disabled");
      return result;
    };
    await browser.run({ op: "composer.approvals", sessionId: session.id, mode: "off" });
    expect(f.core.calls.some((call) => call.method === "config.set")).toBe(false);
  });
  it("Lazy-Agent bleibt unconfirmed; Effort bei Working/anderem Modell/nicht belegtem Disable wird nicht gesendet", async () => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id }); f.lazy(true);
    expect(await browser.run({ op: "reasoning.select", sessionId: session.id, effort: "low", selection: { provider: "test", model: "model-a" } }))
      .toMatchObject({ type: "result", data: { observation: "unconfirmed", observed: { reasoning: { effort: null, wire: null } } } });
    const before = f.core.calls.filter((call) => call.method === "config.set").length;
    session.running = true;
    expect(await browser.run({ op: "reasoning.select", sessionId: session.id, effort: "low", selection: { provider: "test", model: "model-a" } })).toMatchObject({ type: "error", outcome: "not_sent" });
    session.running = false; f.capability(true);
    for (const [effort, model] of [["none", "model-a"], ["low", "model-b"]] as const)
      expect(await browser.run({ op: "reasoning.select", sessionId: session.id, effort, selection: { provider: "test", model } })).toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.core.calls.filter((call) => call.method === "config.set")).toHaveLength(before);
  });
  it("Flagoff/Verbindungswechsel während Preflight verhindern Titel-/Effortsend", async () => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id });
    const original = f.core.resultHook!;
    f.core.resultHook = (method, params, value) => { const result = original(method, params, value); if (method === "model.options") browser.manager.release(browser.id, "v2-disabled"); return result; };
    await browser.run({ op: "reasoning.select", sessionId: session.id, effort: "low", selection: { provider: "test", model: "model-a" } });
    expect(f.core.calls.some((call) => call.method === "config.set")).toBe(false);
  });
  it.each(["model", "running"])("letztes Preflight mit verändertem %s sendet keinen Effort", async (change) => {
    const session = f.core.seed("session"); const browser = f.browser();
    await browser.run({ op: "session.subscribe", sessionId: session.id }); const hook = f.core.resultHook!; let activates = 0;
    f.core.resultHook = (method, params, value) => {
      const reply = hook(method, params, value);
      if (method !== "session.activate" || ++activates !== 3) return reply;
      const result = reply as { info: object };
      return change === "model" ? { ...result, info: { ...result.info, model: "model-b" } } : { ...result, running: true };
    };
    expect(await browser.run({ op: "reasoning.select", sessionId: session.id, effort: "low", selection: { provider: "test", model: "model-a" } }))
      .toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.core.calls.some((call) => call.method === "config.set")).toBe(false);
  });
  it.each(["session.title", "reasoning.select", "composer.approvals"] as const)("ungültige native Antwort bei %s bleibt unknown", async (op) => {
    const session = f.core.seed("session"); const browser = f.browser(); await browser.run({ op: "session.subscribe", sessionId: session.id });
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, value) => { const result = hook(method, params, value); return method === (op === "session.title" ? "session.title" : "config.set") ? { unexpected: true } : result; };
    const input = op === "session.title" ? { op, sessionId: session.id, title: "Neu" } : op === "composer.approvals"
      ? { op, sessionId: session.id, mode: "off" as const } : { op, sessionId: session.id, effort: "low" as const, selection: { provider: "test", model: "model-a" } };
    expect(await browser.run(input)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH", outcome: "unknown" });
  });
});

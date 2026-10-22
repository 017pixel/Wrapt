import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CwdPolicy } from "./cwd-policy.js";
import { normalizeHistory } from "./normalize-history.js";
import { normalizeModels, normalizeCommands } from "./normalize-catalog.js";
import { withReplayTools } from "./snapshot-tools.js";

describe("Hermes V2 Projektionen und Pfade", () => {
  it("prüft das Ziel eines Symlinks und spätere Pfadänderungen real", async () => {
    const base = await mkdtemp(join(tmpdir(), "hermes-v2-path-"));
    try {
      const root = join(base, "allowed");
      const inside = join(root, "project");
      const outside = join(base, "outside");
      const link = join(root, "link");
      await mkdir(inside, { recursive: true });
      await mkdir(outside);
      await symlink(inside, link);
      const policy = new CwdPolicy([root]);
      expect(await policy.validate(link)).toBe(inside);
      await rm(link);
      await symlink(outside, link);
      await expect(policy.validate(link)).rejects.toThrow(/außerhalb/);
      await expect(policy.validate(null)).rejects.toThrow(/kein erlaubtes/);
      await expect(policy.validate(join(root, "missing"))).rejects.toThrow();
    } finally { await rm(base, { recursive: true, force: true }); }
  });

  it("nutzt reale REST-id sowie row_id, blendet hidden aus und projiziert Toolaufrufe", () => {
    const messages = normalizeHistory([
      { id: 3, role: "assistant", content: "Fertig", reasoning_content: "Sichtbar" },
      { row_id: 4, role: "user", text: "Intern", display_kind: "hidden" },
      { id: 5, role: "assistant", content: "", tool_calls: [{ id: "tool-a", function: { name: "terminal", arguments: '{"command":"pwd"}' } }] },
      { id: 6, role: "tool", tool_call_id: "tool-a", tool_name: "terminal", content: "Ausgabe" },
      { id: 7, role: "user", content: "Versteckt", display_content: "Angezeigte Anweisung" },
    ], "stored-a");
    expect(messages.find((entry) => entry.id === "row:3")?.reasoning).toBe("Sichtbar");
    expect(messages.some((entry) => entry.text === "Intern")).toBe(false);
    expect(messages.find((entry) => entry.rowId === 6)).toMatchObject({ text: "Ausgabe", toolStatus: "complete", input: '{"command":"pwd"}' });
    expect(messages.at(-1)?.text).toBe("Angezeigte Anweisung");
  });

  it("rekonstruiert aktive Tools aus strukturiertem Replay und erfindet keine IDs", () => {
    const messages = withReplayTools([], [
      { type: "tool.generating", payload: { name: "terminal" } },
      { type: "tool.start", payload: { tool_id: "tool-a", name: "terminal", args: { command: "pwd" } } },
      { type: "tool.start", payload: { name: "unbekannt" } },
    ], { epoch: "epoch-a", liveId: "live-a" });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ toolId: "tool-a", toolStatus: "running" });
  });

  it("behandelt Quick-/Plugin-Kollisionen als gesperrt und gibt keine Credential-Felder aus", () => {
    const commands = normalizeCommands({ pairs: [["/skill", "Skill"], ["/help", "Quick"]], skills: { "/skill": {} }, categories: [{ name: "Plugin commands", pairs: [["/skill", "Plugin"]] }, { name: "User commands", pairs: [["/help", "Quick"]] }] });
    expect(commands.every((command) => command.action === null && command.kind === "unsupported")).toBe(true);
    const models = normalizeModels({ providers: [{ slug: "test", name: "Test", models: ["a"], api_url: "private", api_key: "dummy-secret", capabilities: { a: { reasoning: true } } }] });
    expect(JSON.stringify(models)).not.toContain("dummy-secret");
    expect(models.providers[0]?.models[0]?.reasoningEfforts).toEqual([]);
  });
  it("isoliert kaputte Provider und Modelle und benennt leere Anbieter", () => {
    const catalog = normalizeModels({ provider: "opencode-go", model: "gpt-6-luna", providers: [
      null, { slug: 42, models: [] },
      { slug: "broken", name: "Fehlerhaft", models: [null, 42, {}, ""], total_models: 12 },
      { slug: "empty", models: null, authenticated: false },
      { slug: "opencode-go", name: "OpenCode Go", models: ["gpt-6-luna", { id: "kimi-k3" }, "gpt-6-luna", null, "blocked"], unavailable_models: ["blocked"] },
      { slug: "mapping", name: "Mapping", models: { "minimax-m3.1-flash-free": {} } },
    ] }, true);
    expect(catalog.providers).toHaveLength(4);
    expect(catalog.providers[0]).toMatchObject({ label: "Fehlerhaft (Keine Modelle)", models: [], reportedModelCount: 12, note: "Keine gültigen oder verfügbaren Modelle gemeldet." });
    expect(catalog.providers[1]).toMatchObject({ id: "empty", available: false, models: [], note: "Keine Modelle gemeldet." });
    expect(catalog.providers[2]?.models.map((model) => model.id)).toEqual(["gpt-6-luna", "kimi-k3"]);
    expect(catalog.providers[3]?.models[0]?.id).toBe("minimax-m3.1-flash-free");
    expect(catalog.current).toEqual({ provider: "opencode-go", model: "gpt-6-luna" });
    expect(normalizeModels({ providers: [{ slug: "legacy", models: [] }] }).providers[0]).not.toHaveProperty("note");
  });
});

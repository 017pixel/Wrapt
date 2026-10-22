import { describe, expect, it } from "vitest";
import type { HermesV2Command } from "@wrapt/contracts/hermes-v2";
import { resolveChatCommand } from "./chat-commands";

const command = (patch: Partial<HermesV2Command> = {}): HermesV2Command => ({ key: "/model", label: "Modell", description: "",
  kind: "builtin", action: "model", argumentHint: null, disabledReason: null, ...patch });
describe("Kataloggebundene Composer-Intents", () => {
  it("führt Alias und kanonischen Key zur selben nativen Aktion mit unverändertem Argument", () => {
    const catalog = [command({ aliases: ["/m"] })];
    expect(resolveChatCommand(catalog, "/M", "provider:model --session")).toEqual(resolveChatCommand(catalog, "/model", "provider:model --session"));
  });
  it("deaktiviert mehrdeutige oder fehlende Katalogzuordnung", () => {
    expect(resolveChatCommand([command(), command({ key: "/other", aliases: ["model"] })], "/model").kind).toBe("unsupported");
    expect(resolveChatCommand([], "/model").kind).toBe("unsupported");
  });
  it("bereitet dynamischen Skill ausschließlich als erkennbare Agentanweisung vor", () => {
    const intent = resolveChatCommand([command({ key: "/research-test", kind: "skill", action: "skill" })], "/research-test", "Meine Aufgabe");
    expect(intent).toEqual({ kind: "draft", skill: "research-test", text: 'Verwende den Hermes-Skill "research-test" für diese Aufgabe:\nMeine Aufgabe' });
  });
  it.each(["queue", "steer"] as const)("öffnet %s ab Phase 7 ausschließlich als konkreten nativen Intent", (action) => {
    expect(resolveChatCommand([command({ key: action, action })], action, "Folgetext")).toEqual({ kind: "native", action, argument: "Folgetext" });
  });
  it("deaktiviert überschattete Skills und fremde Commands auch bei action-Metadaten", () => {
    expect(resolveChatCommand([command({ kind: "unsupported", disabledReason: "Pluginüberschattung" })], "model")).toEqual({ kind: "unsupported", reason: "Pluginüberschattung" });
    expect(resolveChatCommand([command({ kind: "skill", action: "model" })], "model").kind).toBe("unsupported");
  });
});

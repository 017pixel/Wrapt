import { describe, expect, it } from "vitest";
import { CommandRegistry } from "./commandRegistry";
import { legacyCommandOwners, registerLegacyCommands } from "./legacyCommands";

describe("legacyCommands", () => {
  it("registriert die globalen Legacy Commands über die gemeinsame Registry-Grenze", () => {
    const registry = new CommandRegistry();
    registerLegacyCommands(registry);

    const snapshot = registry.getSnapshot();
    expect(snapshot.commands.map((item) => item.contributionId)).toEqual([
      "wrapt.shell.command.fullscreen-toggle",
      "wrapt.shell.command.reload",
    ]);
  });


  it("hält alle Legacy Commands in der globalen Surface ausführbar", async () => {
    const registry = new CommandRegistry();
    registerLegacyCommands(registry);

    for (const item of legacyCommandOwners.flatMap((owner) => owner.registrations)) {
      expect(item.runtime.surface ?? "global").toBe("global");
      expect(item.contribution.category).toBeDefined();
    }
  });
});

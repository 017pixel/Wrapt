import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: agent-tools", () => {
  it("akzeptiert Command- und Provider-basierte Agent Tools", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "agents.tools.register" }],
          contributes: {
            commands: validManifest.contributes.commands,
            agentTools: [
              {
                id: "workbench.agent-tasks.agent-tool.create",
                kind: "command",
                title: "Aufgabe erstellen",
                description: "Erstellt eine Aufgabe im aktuellen Projekt.",
                inputSchema: "./schemas/create-task-input.json",
                outputSchema: "./schemas/task-output.json",
                projectContext: true,
                approval: "host-policy",
                commandId: "workbench.agent-tasks.command.create",
              },
              {
                id: "workbench.agent-tasks.agent-tool.list",
                kind: "provider",
                title: "Aufgaben auflisten",
                description: "Liest Aufgaben aus dem aktuellen Projekt.",
                inputSchema: "./schemas/list-tasks-input.json",
                projectContext: true,
                approval: "always",
                provider: "workbench.agent-tasks.agent-tool-provider.list",
              },
            ],
          },
        }).success,
      ).toBe(true);
    });

  it("weist fehlende Agent Tool Commands und fremde Provider ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "agents.tools.register" }],
          contributes: {
            commands: validManifest.contributes.commands,
            agentTools: [
              {
                id: "workbench.agent-tasks.agent-tool.create",
                kind: "command",
                title: "Aufgabe erstellen",
                description: "Erstellt eine Aufgabe im aktuellen Projekt.",
                inputSchema: "./schemas/create-task-input.json",
                projectContext: true,
                approval: "host-policy",
                commandId: "workbench.agent-tasks.command.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "agents.tools.register" }],
          contributes: {
            agentTools: [
              {
                id: "workbench.agent-tasks.agent-tool.list",
                kind: "provider",
                title: "Aufgaben auflisten",
                description: "Liest Aufgaben aus dem aktuellen Projekt.",
                inputSchema: "./schemas/list-tasks-input.json",
                projectContext: true,
                approval: "host-policy",
                provider: "workbench.other.agent-tool-provider.list",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt für Agent Tools Permission und Server-Entrypoint", () => {
      const agentTool = {
        id: "workbench.agent-tasks.agent-tool.list",
        kind: "provider",
        title: "Aufgaben auflisten",
        description: "Liest Aufgaben aus dem aktuellen Projekt.",
        inputSchema: "./schemas/list-tasks-input.json",
        projectContext: true,
        approval: "host-policy",
        provider: "workbench.agent-tasks.agent-tool-provider.list",
      } as const;
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [],
          contributes: { agentTools: [agentTool] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: { ui: "./dist/ui.js" },
          permissions: [{ permission: "agents.tools.register" }],
          contributes: { agentTools: [agentTool] },
        }).success,
      ).toBe(false);
    });

  it("weist manifestweit doppelte Agent Tool IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "agents.tools.register" }],
          contributes: {
            commands: validManifest.contributes.commands,
            agentTools: [
              {
                id: "workbench.agent-tasks.command.create",
                kind: "command",
                title: "Aufgabe erstellen",
                description: "Erstellt eine Aufgabe im aktuellen Projekt.",
                inputSchema: "./schemas/create-task-input.json",
                projectContext: true,
                approval: "host-policy",
                commandId: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});

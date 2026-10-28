import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: agent-skills", () => {
  it("akzeptiert permission-gebundene Agent Skills ohne Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: {},
          permissions: [{ permission: "agents.skills.register" }],
          contributes: {
            agentSkills: [
              {
                id: "workbench.agent-tasks.agent-skill.task-management",
                name: "workbench-agent-tasks-task-management",
                description: "Verwaltet Agent Tasks in Wrapt.",
                path: "./skills/workbench-agent-tasks-task-management/SKILL.md",
                targets: ["codex", "claude-code", "opencode"],
                enabledByDefault: false,
              },
            ],
          },
        }).success,
      ).toBe(true);
    });

  it("verlangt für Agent Skills Permission und eigenen Namensraum", () => {
      const agentSkill = {
        id: "workbench.agent-tasks.agent-skill.task-management",
        name: "workbench-agent-tasks-task-management",
        description: "Verwaltet Agent Tasks in Wrapt.",
        path: "./skills/workbench-agent-tasks-task-management/SKILL.md",
        targets: ["codex", "claude-code", "opencode"],
        enabledByDefault: false,
      } as const;
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [],
          contributes: { agentSkills: [agentSkill] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "agents.skills.register" }],
          contributes: {
            agentSkills: [
              {
                ...agentSkill,
                name: "workbench-other-task-management",
                path: "./skills/workbench-other-task-management/SKILL.md",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("weist manifestweit doppelte Agent Skill IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "agents.skills.register" }],
          contributes: {
            commands: validManifest.contributes.commands,
            agentSkills: [
              {
                id: "workbench.agent-tasks.command.create",
                name: "workbench-agent-tasks-task-management",
                description: "Verwaltet Agent Tasks in Wrapt.",
                path: "./skills/workbench-agent-tasks-task-management/SKILL.md",
                targets: ["codex"],
                enabledByDefault: false,
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});

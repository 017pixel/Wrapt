import { describe, expect, it } from "vitest";
import { resolveAgentHomeSettings } from "./agent-home-settings.js";

const paths = {
  codex: "/home/tester/.codex",
  claude: "/home/tester/.claude",
  opencode: "/home/tester/.local/share/opencode",
};

describe("KI-Home-Einstellungen", () => {
  it("leitet Homes und Plugin-Creator-Skill aus dem System-Home ab", () => {
    expect(resolveAgentHomeSettings(paths, {})).toMatchObject({
      pluginCreatorSkillPath: "/home/tester/.codex/skills/.system/plugin-creator/SKILL.md",
      sharedHomes: {
        codex: { sharedHome: "/home/tester/.codex", authFileName: "auth.json" },
        claude: { sharedHome: "/home/tester/.claude", authFileName: ".credentials.json" },
        opencode: { sharedHome: "/home/tester/.local/share/opencode", authFileName: "auth.json" },
      },
    });
  });

  it("respektiert zentrale Home- und Skill-Overrides", () => {
    expect(resolveAgentHomeSettings({ ...paths, codex: "/srv/codex" }, { creatorSkillPath: "/srv/skills/plugin.md" })).toMatchObject({
      pluginCreatorSkillPath: "/srv/skills/plugin.md",
      sharedHomes: { codex: { sharedHome: "/srv/codex" } },
    });
  });
});

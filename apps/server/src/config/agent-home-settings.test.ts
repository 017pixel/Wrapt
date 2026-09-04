import { describe, expect, it } from "vitest";
import { resolveAgentHomeSettings } from "./agent-home-settings.js";

const paths = {
  codex: "/home/tester/.codex",
  claude: "/home/tester/.claude",
  opencode: "/home/tester/.local/share/opencode",
};

describe("KI-Home-Einstellungen", () => {
  it("leitet Homes ab und verwendet den ausgelieferten Wrapt-Skill", () => {
    expect(resolveAgentHomeSettings(paths, {}, "/srv/wrapt")).toMatchObject({
      pluginCreatorSkillPath: "/srv/wrapt/.agents/plugins/plugins/wrapt-extension-creator/skills/wrapt-plugins/SKILL.md",
      sharedHomes: {
        codex: { sharedHome: "/home/tester/.codex", authFileName: "auth.json" },
        claude: { sharedHome: "/home/tester/.claude", authFileName: ".credentials.json" },
        opencode: { sharedHome: "/home/tester/.local/share/opencode", authFileName: "auth.json" },
      },
    });
  });

  it("respektiert zentrale Home- und Skill-Overrides", () => {
    expect(resolveAgentHomeSettings({ ...paths, codex: "/srv/codex" }, { creatorSkillPath: "/srv/skills/plugin.md" }, "/srv/wrapt")).toMatchObject({
      pluginCreatorSkillPath: "/srv/skills/plugin.md",
      sharedHomes: { codex: { sharedHome: "/srv/codex" } },
    });
  });

  it("bevorzugt den benannten Wrapt-Plugins-Pfad und liest den alten Schlüssel weiter", () => {
    expect(resolveAgentHomeSettings(paths, { wraptPluginsSkillPath: "/srv/skills/wrapt-plugins.md", creatorSkillPath: "/srv/skills/alt.md" }, "/srv/wrapt")).toMatchObject({
      pluginCreatorSkillPath: "/srv/skills/wrapt-plugins.md",
    });
  });
});

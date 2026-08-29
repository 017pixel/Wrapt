import { join, resolve } from "node:path";
import type { WraptConfig } from "./wrapt-config.js";

interface SharedHomePaths {
  codex: string;
  claude: string;
  opencode: string;
}

export function resolveAgentHomeSettings(
  paths: SharedHomePaths,
  plugins: WraptConfig["plugins"],
  projectRoot: string,
) {
  const codexSharedHome = resolve(paths.codex);
  const claudeSharedHome = resolve(paths.claude);
  const opencodeSharedHome = resolve(paths.opencode);

  return {
    pluginCreatorSkillPath: resolve(
      plugins.creatorSkillPath
        ?? join(projectRoot, ".agents/plugins/plugins/wrapt-extension-creator/skills/plugin-creator/SKILL.md"),
    ),
    sharedHomes: {
      codex: { sharedHome: codexSharedHome, authFileName: "auth.json" },
      claude: { sharedHome: claudeSharedHome, authFileName: ".credentials.json" },
      opencode: { sharedHome: opencodeSharedHome, authFileName: "auth.json" },
    },
  };
}

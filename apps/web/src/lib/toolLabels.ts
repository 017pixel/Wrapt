import type { Panel } from "@wrapt/contracts";

export const panelTitles: Record<Panel["type"], string> = {
  "t3-code": "T3 Code",
  "code-server": "Editor",
  preview: "Preview",
  browser: "Browser (Legacy)",
  terminal: "Terminal",
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode",
  files: "Files",
  notion: "Notion (Legacy)",
  hermes: "Hermes Agent",
};

export const orbitToolLabels: Record<NonNullable<Panel["type"]>, string> = {
  "t3-code": "T3 Code",
  "code-server": "Code-Server",
  preview: "Preview",
  browser: "Browser (Legacy)",
  terminal: "Terminal",
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode",
  files: "Files",
  notion: "Notion (Legacy)",
  hermes: "Hermes Agent",
};

import type { TerminalKind } from "@wrapt/contracts";
import type { TerminalStatus } from "./terminal-types";

export const kindLabels: Record<TerminalKind, string> = {
  shell: "Terminal",
  codex: "Codex",
  opencode: "OpenCode",
  claude: "Claude Code",
};

export const statusLabel: Record<TerminalStatus, string> = {
  connecting: "Verbindung wird hergestellt",
  connected: "Verbunden",
  disconnected: "Verbindung getrennt",
  interrupted: "Server wurde neu gestartet",
  exited: "Prozess beendet",
  error: "Fehler",
};

/** Reihenfolge der Sondertasten in der mobilen Bedienleiste. */
export const specialKeyRow = ["Esc", "Tab", "↑", "↓", "←", "→", "Pos1", "Ende"] as const;

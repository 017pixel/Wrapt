import { useCallback } from "react";
import { useNavigate } from "react-router";
import type { Panel, TerminalSession } from "@wrapt/contracts";
import { requestOrbitNode, type OrbitPalettePayload } from "../../lib/orbitPalette";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";
import { kindLabels } from "./terminal-labels";

export function terminalOrbitPayload(session: TerminalSession, name?: string) {
  if (session.kind === "opencode") return null;
  return {
    type: "tool",
    toolType: session.kind === "codex" ? "codex" : session.kind === "claude" ? "claude" : "terminal",
    title: name?.trim() || kindLabels[session.kind],
    runtimeId: session.runtimeId,
    ...(session.projectId ? { projectId: session.projectId } : {}),
  } satisfies OrbitPalettePayload;
}

export function terminalStandalonePath(runtimeId: string, kind: TerminalSession["kind"]): string | null {
  if (kind === "opencode") return null;
  const route = kind === "codex" ? "/codex" : kind === "claude" ? "/claude" : "/terminal";
  return `${route}?session=${encodeURIComponent(runtimeId)}`;
}

export function terminalStandalonePathForTool(runtimeId: string | null, toolType: Panel["type"]): string | null {
  if (toolType === "opencode") return "/opencode";
  if (!runtimeId) return null;
  if (toolType === "terminal") return terminalStandalonePath(runtimeId, "shell");
  if (toolType === "codex" || toolType === "claude") return terminalStandalonePath(runtimeId, toolType);
  return null;
}

/** Übernimmt dieselbe Laufzeit-ID in Orbit und zeigt die fokussierte Ansicht. */
export function useTerminalOrbitHandoff() {
  const navigate = useNavigate();
  return useCallback((session: TerminalSession) => {
    const entry = useTerminalWorkspaceStore.getState().document?.entries.find((candidate) => candidate.runtimeId === session.runtimeId);
    const payload = terminalOrbitPayload(session, entry?.name);
    if (!payload) return;
    requestOrbitNode(payload);
    navigate("/orbit");
  }, [navigate]);
}

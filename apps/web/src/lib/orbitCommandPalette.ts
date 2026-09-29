import type { Project } from "@wrapt/contracts";
import type { OrbitPalettePayload } from "./orbitPalette";

export function commandPayloads(projects: Project[]): Array<{ keywords: string; payload: OrbitPalettePayload }> {
  const base: Array<{ keywords: string; payload: OrbitPalettePayload }> = [
    { keywords: "terminal shell konsole", payload: { type: "tool", title: "Terminal", toolType: "terminal" } },
    { keywords: "t3 code agent", payload: { type: "tool", title: "T3 Code", toolType: "t3-code" } },
    { keywords: "hermes agent chat assistent", payload: { type: "tool", title: "Hermes Agent", toolType: "hermes" } },
    { keywords: "hermes status health dienst gateway", payload: { type: "hermesStatus", title: "Hermes Status" } },
    { keywords: "hermes aufgaben tasks laufend", payload: { type: "hermesTasks", title: "Hermes Aufgaben" } },
    { keywords: "hermes cron automatisierungen jobs", payload: { type: "hermesCron", title: "Hermes Automatisierungen" } },
    { keywords: "hermes ergebnisse results telegram cron", payload: { type: "hermesResults", title: "Hermes Ergebnisse" } },
    { keywords: "preview browser web", payload: { type: "tool", title: "Preview", toolType: "preview" } },
    { keywords: "preview gruppe einzeln 1er split", payload: { type: "previewGroup", title: "Einzel-Preview", layout: "1" } },
    { keywords: "preview gruppe 2er split", payload: { type: "previewGroup", title: "2er-Preview-Gruppe", layout: "2" } },
    { keywords: "preview gruppe 3er split", payload: { type: "previewGroup", title: "3er-Preview-Gruppe", layout: "3" } },
    { keywords: "preview gruppe 6er 2x3 split", payload: { type: "previewGroup", title: "6er-Preview-Gruppe", layout: "6" } },
    { keywords: "editor code server vscode", payload: { type: "tool", title: "Code-Server", toolType: "code-server" } },
    { keywords: "codex agent", payload: { type: "tool", title: "Codex", toolType: "codex" } },
    { keywords: "claude code agent", payload: { type: "tool", title: "Claude Code", toolType: "claude" } },
    { keywords: "opencode agent", payload: { type: "tool", title: "OpenCode", toolType: "opencode" } },
    { keywords: "note notiz text markdown", payload: { type: "note", title: "Neue Notiz" } },
    { keywords: "snippet code block", payload: { type: "snippet", title: "Code-Snippet" } },
    { keywords: "frame bereich gruppe umrandung", payload: { type: "frame", title: "Neuer Bereich" } },
    { keywords: "dateien files dateimanager finder explorer ordner server upload download", payload: { type: "tool", title: "Dateimanager", toolType: "files" } },
    { keywords: "usage codex limits nutzung", payload: { type: "usage", title: "Codex Nutzung", provider: "codex" } },
    { keywords: "usage opencode limits nutzung", payload: { type: "usage", title: "OpenCode Nutzung", provider: "opencode" } },
    { keywords: "usage claude code limits nutzung", payload: { type: "usage", title: "Claude Code Nutzung", provider: "claude" } },
  ];
  return [...base, ...projects.map((project) => ({ keywords: `projekt project ${project.name}`, payload: { type: "project" as const, title: project.name, projectId: project.id } }))];
}

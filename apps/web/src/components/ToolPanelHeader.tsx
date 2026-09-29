import type { MouseEventHandler } from "react";
import type { Panel, Project } from "@wrapt/contracts";
import { panelTitles } from "../lib/toolLabels";
import { StateDot } from "./primitives";
import type { ResolvedPanel } from "./toolPanelResolution";

interface ToolPanelHeaderProps {
  panel: Panel;
  project: Project | undefined;
  isFocused: boolean;
  resolved: ResolvedPanel | null;
  onContextMenu: MouseEventHandler<HTMLElement>;
}

export function ToolPanelHeader({ panel, project, isFocused, resolved, onContextMenu }: ToolPanelHeaderProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-ink-900 px-3" onContextMenu={onContextMenu}>
      <span className={`flex h-6 w-6 items-center justify-center rounded ${isFocused ? "bg-ink-800 text-text" : "text-muted"}`} aria-hidden>
        <StateDot state={["terminal", "codex", "opencode", "files", "hermes"].includes(panel.type) || resolved?.url ? "active" : "inactive"} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-medium text-text">
          {panelTitles[panel.type]}
          {project ? <span className="text-muted"> · {project.name}</span> : null}
        </div>
      </div>
    </header>
  );
}

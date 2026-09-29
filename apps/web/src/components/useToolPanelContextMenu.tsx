import type { MouseEvent, MouseEventHandler, RefObject } from "react";
import type { Panel, Project } from "@wrapt/contracts";
import { CloseIcon, ExternalLinkIcon, FullscreenIcon, RefreshIcon, RestoreIcon } from "./icons";
import { openGlobalContextMenu } from "./context-menu/contextMenuEvents";
import { hostContextMenuId } from "../extensions/hostContextMenus";
import { panelTitles } from "../lib/toolLabels";

interface ToolPanelContextMenuOptions {
  panel: Panel;
  project: Project | undefined;
  externalToolUrl: string | null;
  isMaximized: boolean;
  standalone: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  onReload: () => void;
  onClose: () => void;
  onToggleFullscreen: () => void;
}

export function useToolPanelContextMenu({
  panel,
  project,
  externalToolUrl,
  isMaximized,
  standalone,
  surfaceRef,
  onReload,
  onClose,
  onToggleFullscreen,
}: ToolPanelContextMenuOptions): MouseEventHandler<HTMLDivElement> {
  return (event: MouseEvent<HTMLDivElement>) => {
    openGlobalContextMenu(event, {
      surface: "host.context-menu.tool",
      title: `${panelTitles[panel.type]}${project ? ` · ${project.name}` : ""}`,
      actions: [
        { id: hostContextMenuId("tool.reload"), icon: <RefreshIcon className="h-4 w-4" />, onSelect: onReload },
        { id: hostContextMenuId("tool.new-tab"), icon: <ExternalLinkIcon className="h-4 w-4" />, disabled: !externalToolUrl, onSelect: () => { if (externalToolUrl) window.open(externalToolUrl, "_blank", "noopener,noreferrer"); } },
        { id: hostContextMenuId("tool.fullscreen"), icon: <FullscreenIcon className="h-4 w-4" />, onSelect: () => void surfaceRef.current?.requestFullscreen?.() },
        { id: hostContextMenuId("tool.maximize"), label: isMaximized ? "Wiederherstellen" : "Maximieren", icon: isMaximized ? <RestoreIcon className="h-4 w-4" /> : <FullscreenIcon className="h-4 w-4" />, checked: isMaximized, onSelect: onToggleFullscreen },
        { id: hostContextMenuId("tool.settings"), onSelect: () => window.location.assign("/settings#einstellungen:rechtsklick") },
        ...(!standalone ? [{ id: hostContextMenuId("tool.close"), icon: <CloseIcon className="h-4 w-4" />, danger: true, onSelect: onClose }] : []),
      ],
    });
  };
}

import type { ReactNode } from "react";
import type { ContextMenuSurface } from "@wrapt/extension-contracts";
import type { ShortcutContextValues } from "../../extensions/contextExpression";

export const GLOBAL_CONTEXT_MENU_EVENT = "wrapt:context-menu";

export interface GlobalContextMenuAction {
  id: string;
  label?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  onSelect: () => void | Promise<void>;
}

export interface GlobalContextMenuRequest {
  surface: ContextMenuSurface;
  x: number;
  y: number;
  title?: string;
  actions?: readonly GlobalContextMenuAction[];
  contextValues?: ShortcutContextValues;
  quickActionToolId?: string;
}

export function showGlobalContextMenu(request: GlobalContextMenuRequest): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent<GlobalContextMenuRequest>(GLOBAL_CONTEXT_MENU_EVENT, {
    detail: request,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function openGlobalContextMenu(
  event: {
    clientX: number;
    clientY: number;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  },
  request: Omit<GlobalContextMenuRequest, "x" | "y">,
): boolean {
  const accepted = showGlobalContextMenu({ ...request, x: event.clientX, y: event.clientY });
  if (accepted) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }
  return accepted;
}

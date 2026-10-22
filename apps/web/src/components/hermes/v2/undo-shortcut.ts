import type { KeyboardEvent } from "react";
import type { HermesV2Sidebar } from "./sidebar-types";

/** Texte behalten ihr eigenes Undo; Organisationsaktionen gelten nur in Hermes. */
export function undoOrganization(
  event: KeyboardEvent<HTMLElement>,
  sidebar: Pick<HermesV2Sidebar, "undoView" | "undo" | "busySessionIds">,
): void {
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.repeat
    || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey
    || event.key.toLowerCase() !== "z") return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable
    || target.closest("input, textarea, [contenteditable]:not([contenteditable='false']), [role='textbox']"))) return;
  if (!sidebar.undoView || sidebar.undoView.remainingMs <= 0 || sidebar.busySessionIds.length > 0) return;
  event.preventDefault();
  event.stopPropagation();
  void sidebar.undo();
}

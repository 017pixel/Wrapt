import type { MouseEvent } from "react";
import { LocateIcon } from "../icons";
import { requestOrbitNodeFocus } from "../../lib/orbitFocusRequest";
import "./orbit-focus-touch-targets.css";

export function FocusNodeAction({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="nodrag orbit-node-focus"
      title="Fenster zentrieren"
      aria-label="Fenster zentrieren"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); requestOrbitNodeFocus(id); }}
    ><LocateIcon className="h-3.5 w-3.5" /></button>
  );
}

export function focusFromHeader(event: MouseEvent<HTMLElement>, id: string): void {
  event.stopPropagation();
  if ((event.target as HTMLElement).closest(
    "button, a[href], input, textarea, select, [role=menu], [role=menuitem], [contenteditable]:not([contenteditable='false'])",
  )) return;
  requestOrbitNodeFocus(id);
}

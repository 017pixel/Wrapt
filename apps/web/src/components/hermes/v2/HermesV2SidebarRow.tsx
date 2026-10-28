import { animateThreadSettlement } from "./thread-settlement-motion";
import { memo, useId, useRef } from "react";
import { CheckIcon, PinIcon } from "../../icons";
import type {
  SidebarDropPlan,
  SidebarRowView,
  SidebarDropTarget,
} from "./sidebar-types";
import { HermesV2ThreadMenu } from "./HermesV2ThreadMenu";
import {
  buildRowMenuItems,
  settleCommand,
  type RowCommand,
} from "./sidebar-row-commands";
import { statusLabel } from "./sidebar-format";
import { HermesV2RowPreview } from "./HermesV2RowPreview";
import { useHermesV2RowPreview } from "./useHermesV2RowPreview";

export interface SidebarRowNeighbors {
  previousId: string | null;
  nextId: string | null;
  planDrop: (
    sessionId: string,
    target: SidebarDropTarget,
    beforeSessionId?: string,
  ) => SidebarDropPlan;
}

export interface HermesV2SidebarRowProps {
  row: SidebarRowView;
  active: boolean;
  busy: boolean;
  neighbors: SidebarRowNeighbors;
  onCommand: (command: RowCommand) => void;
  onSelect: (sessionId: string) => void;
  draggable: boolean;
  dragging: boolean;
  setDraggingId: (id: string | null) => void;
  /** Natives Sessiondelete wird über die eigene Fläche bestätigt. */
  deleteEnabled?: boolean;
  /** Umbenennen der aktiven Sitzung; nur dort gibt es einen Composer. */
  onRenameSession?: ((sessionId: string) => void) | undefined;
}

/**
 * Titel und nötiger Status bleiben in der Liste. Weitere Angaben stehen in
 * einer Vorschau; Rechtsklick öffnet die Organisationsaktionen.
 */
function SidebarRowBase({
  row,
  active,
  busy,
  neighbors,
  onCommand,
  onSelect,
  draggable,
  dragging,
  setDraggingId,
  deleteEnabled,
  onRenameSession,
}: HermesV2SidebarRowProps) {
  const title = row.title || row.id;
  const status = statusLabel(row);
  const anchorRef = useRef<HTMLLIElement>(null);
  const previewId = useId();
  const pointerAction = useRef(false);
  const execute = (command: RowCommand) => {
    if (pointerAction.current && command.type === "organize" && command.intent.action === "settle" && anchorRef.current) {
      animateThreadSettlement(anchorRef.current);
    }
    preview.close();
    onCommand(command);
  };
  const preview = useHermesV2RowPreview();
  const items = buildRowMenuItems(row, neighbors, {
    deleteEnabled: deleteEnabled === true,
  });
  // Der Haken nutzt denselben Befehl wie das Menü: keine eigene Serveraktion.
  const settle = settleCommand(items);
  return (
    <li
      ref={anchorRef}
      onPointerDownCapture={() => { pointerAction.current = true; }}
      onKeyDownCapture={() => { pointerAction.current = false; }}
      className="hermesv2-rowitem"
      onPointerEnter={() => { if (!anchorRef.current?.querySelector("[aria-expanded='true']")) preview.start(); }}
      onPointerLeave={preview.end}
      data-session-id={row.id}
      data-shelf={row.group}
      data-pinned={row.pinned ? "true" : "false"}
      data-dragging={dragging ? "true" : "false"}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/hermes-v2-session", row.id);
        event.dataTransfer.effectAllowed = "move";
        setDraggingId(row.id);
      }}
      onDragEnd={() => setDraggingId(null)}
    >
      <HermesV2ThreadMenu
        label={`Aktionen für ${title}`} items={items} disabled={busy} onCommand={execute}
        onOpen={preview.close} onDetails={preview.show}
        onRename={active && onRenameSession ? () => onRenameSession(row.id) : undefined}
      >
        <button
          type="button"
          className="hermesv2-rowselect"
          aria-label={title}
          aria-haspopup="menu"
          aria-describedby={preview.open ? previewId : undefined}
          onFocus={() => { if (!pointerAction.current) preview.focus(); }}
          onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) preview.close(); }}
          aria-current={active ? "true" : undefined}
          data-active={active ? "true" : "false"}
          onClick={() => onSelect(row.id)}
        >
          <span className="hermesv2-rowtitle">{title}</span>
          {status || row.pinned ? <span className="hermesv2-rowmeta" data-shelf={row.group}>
            {row.pinned ? (
              <PinIcon
                className="hermesv2-pinmark"
                aria-label="Angeheftet"
                style={{ color: "currentColor" }}
              />
            ) : null}
            {status ? (
              <span className="hermesv2-rowstatus" data-attention-kind={row.attentionKind}>{status}</span>
            ) : null}
          </span> : null}
        </button>
        {settle ? (
          <button
            type="button"
            className="icon-button hermesv2-rowaction hermesv2-rowsettle"
            aria-label="Sitzung erledigen"
            disabled={busy}
            onClick={(event) => { pointerAction.current = event.detail > 0; execute(settle); }}
          >
            <CheckIcon
              className="h-4 w-4"
              aria-hidden
              style={{ color: "currentColor" }}
            />
          </button>
        ) : null}
      </HermesV2ThreadMenu>
      {preview.open ? <HermesV2RowPreview row={row} anchorRef={anchorRef} id={previewId}
        visible={preview.visible} animated={preview.animated} onEnter={preview.show} onLeave={preview.end} /> : null}
    </li>
  );
}

export const HermesV2SidebarRow = memo(SidebarRowBase);

import { useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { SidebarRowView } from "./sidebar-types";
import { formatDateTime, sourceLabel, statusWord } from "./sidebar-format";
import { formatWorkDuration } from "./tool-group";
import { useSidebarPopoverPosition } from "./useSidebarPopoverPosition";

/** Ausschließlich vorhandene Metadaten; Hover lädt keine Sitzung nach. */
export function HermesV2RowPreview({ row, anchorRef, id, visible = true, animated = true, onEnter, onLeave }: {
  row: SidebarRowView;
  anchorRef: RefObject<HTMLElement | null>;
  id: string;
  visible?: boolean;
  animated?: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const popupRef = useRef<HTMLElement>(null);
  const style = useSidebarPopoverPosition(true, anchorRef, popupRef);
  const completedAt = row.metadata.attention.latest?.completedAt ?? null;
  const fields = [
    ["Projekt", sourceLabel(row)],
    ["Modell", [row.provider, row.model].filter(Boolean).join(" · ") || null],
    ["Status", statusWord(row)],
    ["Turn beendet", completedAt === null ? null : formatDateTime(completedAt)],
    ["Zuletzt aktiv", completedAt === null && row.updatedAt !== null ? formatDateTime(row.updatedAt) : null],
    ["Arbeitszeit", row.durationMs === null ? null : formatWorkDuration(row.durationMs)],
    ["Gestartet", row.turnStartedAt === null ? null : formatDateTime(row.turnStartedAt)],
    ["Subagents", row.subagentCount ? String(row.subagentCount) : null],
    ["Hintergrund", row.backgroundCount ? String(row.backgroundCount) : null],
  ].filter(([, value]) => value !== null);
  const portalRoot = anchorRef.current?.closest<HTMLElement>(".hermesv2-drawer-layer[role='dialog']") ?? document.body;
  return createPortal(
    <aside ref={popupRef} id={id} role="tooltip" aria-label={`Details zu ${row.title}`}
      className="hermesv2-row-preview" data-visible={visible} data-animated={animated} aria-hidden={!visible} style={style} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <strong>{row.title || row.id}</strong>
      <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </aside>, portalRoot,
  );
}

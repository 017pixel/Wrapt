import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MoreIcon } from "../icons";
import { isLoopbackWorkspace, type WorkspaceEntry } from "./workspaceModel";
import { workspaceStatusLabels, type WorkspaceStatus } from "./workspaceStatus";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

interface WorkspaceEntryMenuProps {
  entry: WorkspaceEntry;
  status: WorkspaceStatus;
  isSelf: boolean;
  checking: boolean;
  onCheck(): void;
  onEdit(): void;
  onRemove(): void;
}

export function WorkspaceEntryMenu({ entry, status, isSelf, checking, onCheck, onEdit, onRemove }: WorkspaceEntryMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `workspace-actions-${entry.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuPosition(null);
  }, []);

  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = trigger.closest<HTMLElement>(".workspace-switcher-popover")?.getBoundingClientRect();
    const viewportPadding = 8;
    const width = Math.min((popoverRect?.width ?? 360) - viewportPadding * 2, window.innerWidth - viewportPadding * 2);
    const left = Math.max(viewportPadding, Math.min((popoverRect?.left ?? triggerRect.left) + 8, window.innerWidth - width - viewportPadding));
    const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 220;
    const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
    const availableAbove = triggerRect.top - viewportPadding;
    const openBelow = availableBelow >= menuHeight || availableBelow >= availableAbove;
    const maxHeight = Math.max(0, Math.min(480, openBelow ? availableBelow : availableAbove));
    const top = openBelow
      ? Math.min(window.innerHeight - viewportPadding, triggerRect.bottom + 4)
      : Math.max(viewportPadding, triggerRect.top - Math.min(menuHeight, maxHeight) - 4);
    setMenuPosition({ top, left, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) closeMenu();
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeMenu();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape, true);
    };
  }, [closeMenu, open]);

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open, placeMenu]);

  const closeAndRun = (action: () => void) => {
    closeMenu();
    action();
  };

  return (
    <div className="workspace-entry-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="workspace-entry-more"
        aria-label={`Weitere Aktionen für ${entry.name}. Status: ${workspaceStatusLabels[status]}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (open) closeMenu();
          else {
            setMenuPosition(null);
            setOpen(true);
          }
        }}
      >
        <MoreIcon className="h-4 w-4" style={{ color: "var(--color-muted)" }} />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          className="workspace-entry-menu-panel"
          id={menuId}
          role="group"
          aria-label={`Weitere Aktionen für ${entry.name}`}
          style={menuPosition ?? { top: 8, left: 8, width: "min(360px, calc(100vw - 16px))", visibility: "hidden" }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="workspace-entry-menu-details">
            <div className="workspace-entry-menu-status">
              <span>Status</span>
              <WorkspaceStatusBadge status={status} />
              <strong>{workspaceStatusLabels[status]}</strong>
            </div>
            <div className="workspace-entry-menu-url">
              <span>Adresse</span>
              <code>{entry.url}</code>
            </div>
            {isLoopbackWorkspace(entry.url) ? <p>Nur auf diesem Gerät</p> : null}
            {entry.lastUsedAt ? <p>Zuletzt geöffnet: {formatLastUsed(entry.lastUsedAt)}</p> : null}
          </div>
          <div className="workspace-entry-menu-actions">
            <button type="button" onClick={onCheck} disabled={checking}>
              {checking ? "Prüfe Verbindung …" : "Verbindung prüfen"}
            </button>
            <button type="button" onClick={() => closeAndRun(onEdit)}>Bearbeiten</button>
            {!isSelf ? <button type="button" className="is-danger" onClick={() => closeAndRun(onRemove)}>Entfernen</button> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function formatLastUsed(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date) : "—";
}

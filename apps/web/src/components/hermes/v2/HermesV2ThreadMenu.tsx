import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSidebarPopoverPosition, type SidebarMenuPoint } from "./useSidebarPopoverPosition";
import type { RowMenuItem } from "./sidebar-row-commands";

/** Rechtsklick, Menütaste und Umschalt+F10 öffnen dieselben Sitzungsaktionen. */
export function HermesV2ThreadMenu({ label, items, disabled, onCommand, onRename, onDetails, onOpen, children }: {
  label: string;
  items: readonly RowMenuItem[];
  disabled: boolean;
  onCommand: (command: Exclude<RowMenuItem["command"], null>) => void;
  onRename?: (() => void) | undefined;
  onDetails: () => void;
  onOpen: () => void;
  children: ReactNode;
}) {
  const [point, setPoint] = useState<SidebarMenuPoint | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const open = point !== null;
  const style = useSidebarPopoverPosition(open, rootRef, listRef, point);
  const close = (refocus: boolean) => {
    setPoint(null);
    if (refocus) rootRef.current?.querySelector<HTMLButtonElement>(".hermesv2-rowselect")?.focus({ preventScroll: true });
  };
  const show = (position?: SidebarMenuPoint) => {
    if (disabled) return;
    const root = rootRef.current;
    const bounds = root?.getBoundingClientRect();
    root?.querySelector<HTMLButtonElement>(".hermesv2-rowselect")?.focus({ preventScroll: true });
    onOpen();
    setPortalRoot(root?.closest<HTMLElement>(".hermesv2-drawer-layer[role='dialog']") ?? document.body);
    setPoint(position ?? { x: bounds?.right ?? 8, y: bounds?.top ?? 8 });
  };
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true }), 0);
    const outside = (event: PointerEvent) => {
      if (!listRef.current?.contains(event.target as Node)) setPoint(null);
    };
    const scroll = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) setPoint(null);
    };
    const resize = () => setPoint(null);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  const keydown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        event.stopPropagation();
        show();
      }
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      close(true);
      return;
    }
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? buttons[(index + 1) % buttons.length]
      : event.key === "ArrowUp" ? buttons[(index - 1 + buttons.length) % buttons.length]
      : event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) : null;
    if (next) {
      event.preventDefault();
      next.focus({ preventScroll: true });
    }
  };
  // Umbenennen steht vor den Organisationsbefehlen, weil es die Sitzung
  // selbst betrifft und nicht ihre Platzierung.
  const menuEntries: {
    id: string;
    label: string;
    disabled: boolean;
    reason: string | undefined;
    run: () => void;
  }[] = [
    { id: "details", label: "Sitzungsdetails", disabled: false, reason: undefined, run: onDetails },
    ...(onRename
      ? [
          {
            id: "rename",
            label: "Sitzung umbenennen",
            disabled: false,
            reason: undefined,
            run: onRename,
          },
        ]
      : []),
    ...items.map((item) => {
      const command = item.command;
      return {
        id: item.id,
        label: item.label,
        disabled: item.disabled === true,
        reason: item.reason,
        run: command ? () => onCommand(command) : () => undefined,
      };
    }),
  ];

  return (
    <div ref={rootRef} className="hermesv2-rowline" onKeyDown={keydown}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        show({ x: event.clientX, y: event.clientY });
      }}>
      {children}
      <button type="button" className="hermesv2-touch-actions" aria-label={label}
        aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => show()}>
        Aktionen
      </button>
      {open && portalRoot ? createPortal(
        <ul ref={listRef} className="hermesv2-rowmenu-list" role="menu" aria-label={label} style={style}>
          {menuEntries.map((entry) => <li key={entry.id} role="none">
            <button type="button" role="menuitem" data-destructive={entry.id === "delete" ? "true" : undefined}
              aria-label={entry.label} disabled={entry.disabled} title={entry.reason}
              aria-disabled={entry.disabled || undefined} onClick={() => {
                close(true);
                if (!entry.disabled) entry.run();
              }}>
              {entry.id === "delete" ? "Sitzung löschen" : entry.label}
            </button>
          </li>)}
        </ul>, portalRoot,
      ) : null}
    </div>
  );
}

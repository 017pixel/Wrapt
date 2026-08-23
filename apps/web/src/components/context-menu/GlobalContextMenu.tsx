import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { CheckIcon } from "../icons";
import { useMenuFocus } from "../../lib/useMenuFocus";
import type { GlobalContextMenuRequest } from "./contextMenuEvents";

export interface RenderedContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled: boolean;
  danger: boolean;
  checked?: boolean;
  group: string;
  run: () => void | Promise<void>;
}

export interface ContextMenuQuickAction {
  id: string;
  label: string;
  icon?: ReactNode;
  run: () => void;
}

export function GlobalContextMenu({
  request,
  items,
  quickActions,
  onClose,
}: {
  request: GlobalContextMenuRequest;
  items: readonly RenderedContextMenuItem[];
  quickActions: readonly ContextMenuQuickAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: request.x, y: request.y });
  useMenuFocus(menuRef, true, onClose);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 8;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(margin, Math.min(request.x, window.innerWidth - bounds.width - margin)),
      y: Math.max(margin, Math.min(request.y, window.innerHeight - bounds.height - margin)),
    });
  }, [request]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  const run = useCallback((action: () => void | Promise<void>) => {
    onClose();
    void action();
  }, [onClose]);

  let previousGroup = "";
  return createPortal(
    <div className="global-context-menu-backdrop">
      <div
        ref={menuRef}
        className="global-context-menu"
        data-surface={request.surface}
        role="menu"
        aria-label={request.title ?? "Kontextaktionen"}
        style={{ left: position.x, top: position.y }}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {request.title ? <header className="global-context-menu-title">{request.title}</header> : null}
        {quickActions.length > 0 ? <section className="global-context-menu-section" aria-label="Schnellaktionen">
          <span className="global-context-menu-section-label">Schnellaktionen</span>
          {quickActions.map((action) => <button key={action.id} type="button" role="menuitem" onClick={() => run(action.run)}>
            <span className="global-context-menu-icon">{action.icon}</span><span>{action.label}</span>
          </button>)}
        </section> : null}
        <section className="global-context-menu-section">
          {items.map((item) => {
            const separator = previousGroup !== "" && previousGroup !== item.group;
            previousGroup = item.group;
            return <div key={item.id} className="global-context-menu-item-wrap">
              {separator ? <span className="global-context-menu-separator" role="separator" /> : null}
              <button
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={item.checked}
                className={item.danger ? "is-danger" : ""}
                disabled={item.disabled}
                onClick={() => run(item.run)}
              >
                <span className="global-context-menu-icon">{item.checked ? <CheckIcon className="h-4 w-4" /> : item.icon}</span>
                <span>{item.label}</span>
              </button>
            </div>;
          })}
        </section>
      </div>
    </div>,
    document.body,
  );
}

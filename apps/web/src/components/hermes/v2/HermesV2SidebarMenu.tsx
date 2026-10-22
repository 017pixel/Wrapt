import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "../../icons";
import { useHermesV2Overlay } from "./useHermesV2Overlay";
import type { SidebarChoice } from "./sidebar-view";

export interface HermesV2SidebarMenuProps<T extends string> {
  /** Sichtbarer Name der Auswahl, auch als Titel des Knopfes. */
  label: string;
  options: readonly SidebarChoice<T>[];
  value: T;
  onSelect: (value: T) => void;
  /** Auslöserinhalt, meist ein einzelnes Icon. */
  icon: ReactNode;
  /** Optionales Feld neben dem Namen, etwa die aktuelle Auswahl. */
  hint?: string | undefined;
}

/**
 * Kleines Auswahlmenü der Seitenleiste. Der Knopf öffnet eine Liste am
 * Knopf, Escape schließt sie, Pfeiltasten wechseln zwischen den Punkten.
 * Die Liste liegt im Drawer, damit sie nicht an einem Transform hängt.
 *
 * Das Menü hat einen ruhigen Kopf mit dem Namen und der aktuellen Auswahl;
 * die Auswahl ist mit einem Haken markiert. Es bleibt ein Menü im eigenen
 * Haus, kein Systemdialog.
 */
export function HermesV2SidebarMenu<T extends string>({
  label,
  options,
  value,
  onSelect,
  icon,
  hint,
}: HermesV2SidebarMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const menuStyle = useHermesV2Overlay(open, buttonRef, { width: 200, gap: 4 });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !listRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) return;
    const entries = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    const index = entries.findIndex((entry) => entry === document.activeElement);
    if (event.key === "Escape") {
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        event.key === "ArrowDown"
          ? entries[(index + 1 + entries.length) % entries.length]
          : entries[(index - 1 + entries.length) % entries.length];
      next?.focus();
      return;
    }
    if (event.key === "Home" && entries[0]) {
      event.preventDefault();
      entries[0].focus();
    }
    if (event.key === "End" && entries.at(-1)) {
      event.preventDefault();
      entries.at(-1)!.focus();
    }
  };

  return (
    <div ref={rootRef} className="hermesv2-sidebar-menu" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button hermesv2-sidebar-menu-button"
        aria-label={label}
        title={hint ? `${label}: ${hint}` : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          setPortalRoot(
            event.currentTarget.closest<HTMLElement>(
              ".hermesv2-drawer-layer",
            ) ?? document.body,
          );
          setOpen((current) => !current);
        }}
      >
        {icon}
      </button>
      {open && portalRoot
        ? createPortal(
            <ul
              ref={listRef}
              className="hermesv2-sidebar-menu-list hermesv2-sidebar-menu-panel"
              role="menu"
              aria-label={label}
              style={menuStyle}
            >
              <li role="none" className="hermesv2-sidebar-menu-head">
                <span>{label}</span>
                {hint ? (
                  <span className="hermesv2-sidebar-menu-hint">{hint}</span>
                ) : null}
              </li>
              {options.map((option) => {
                const selected = option.id === value;
                return (
                  <li key={option.id} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      data-selected={selected ? "true" : "false"}
                      className="hermesv2-sidebar-menu-entry"
                      onClick={() => {
                        close(true);
                        onSelect(option.id);
                      }}
                    >
                      <span className="hermesv2-sidebar-menu-check" aria-hidden>
                        {selected ? (
                          <CheckIcon
                            className="h-4 w-4"
                            aria-hidden
                            style={{ color: "currentColor" }}
                          />
                        ) : null}
                      </span>
                      <span className="hermesv2-sidebar-menu-label">
                        {option.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            portalRoot,
          )
        : null}
    </div>
  );
}

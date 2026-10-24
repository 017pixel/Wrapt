import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router";
import { MoreIcon } from "../../icons";
import {
  hermesV2ClassicHref,
  hermesV2StandaloneHref,
} from "../../../lib/hermesV2Routes";

/**
 * Seltene Wege der Kopfleiste liegen gebündelt im Drei-Punkte-Menü: die
 * klassische Oberfläche und das eigene Fenster. Beides bleibt erreichbar,
 * drängt sich aber nicht in jede Chatzeile.
 */
export function HermesV2HeaderMenu({
  sessionId,
  standalone,
}: {
  sessionId: string | null;
  standalone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === " ") {
      const active = document.activeElement;
      if (active instanceof HTMLElement && items.includes(active)) {
        event.preventDefault();
        active.click();
      }
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown")
      next = items[(current + 1 + items.length) % items.length];
    else if (event.key === "ArrowUp")
      next = items[(current - 1 + items.length) % items.length];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items.at(-1);
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className="hermesv2-headermenu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        aria-label="Hermes-Optionen"
        title="Hermes-Optionen"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreIcon aria-hidden style={{ color: "currentColor" }} />
      </button>
      <div
        ref={panelRef}
        className="hermesv2-headermenu-panel"
        role="menu"
        aria-label="Hermes-Oberfläche"
        data-open={open ? "true" : "false"}
        aria-hidden={open ? undefined : true}
        inert={!open}
        onKeyDown={onMenuKeyDown}
      >
        <Link
          role="menuitem"
          className="hermesv2-headermenu-entry"
          to={hermesV2ClassicHref(sessionId)}
          onClick={() => close(false)}
        >
          Klassische Oberfläche
        </Link>
        {standalone ? null : (
          <a
            role="menuitem"
            className="hermesv2-headermenu-entry"
            href={hermesV2StandaloneHref(sessionId)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => close(false)}
          >
            In eigenem Fenster öffnen
          </a>
        )}
      </div>
    </div>
  );
}

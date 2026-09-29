import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, CloseIcon } from "../icons";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";
import { WorkspaceRegistryView } from "./WorkspaceRegistryView";

interface WorkspaceSwitcherProps {
  compact?: boolean;
  mobile?: boolean;
}

export function WorkspaceSwitcher({ compact = false, mobile = false }: WorkspaceSwitcherProps) {
  const entries = useWorkspaceRegistry((state) => state.entries);
  const selfUrl = useWorkspaceRegistry((state) => state.selfUrl);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ top: 12, left: 12 });
  const active = entries.find((entry) => entry.url === selfUrl);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(380, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = rect.bottom + 8;
      const top = below + Math.min(540, window.innerHeight * 0.74) <= window.innerHeight - 8
        ? below
        : Math.max(8, rect.top - Math.min(540, window.innerHeight * 0.74) - 8);
      setPosition({ top, left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    popoverRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus({ preventScroll: true });
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  if (entries.length < 2) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`workspace-switcher-trigger${compact ? " is-compact" : ""}${mobile ? " is-mobile" : ""}`}
        onClick={toggle}
        aria-label={`Aktueller Server: ${active?.name ?? "Dieses Gerät"}. Server wechseln`}
        aria-expanded={open}
        title={active?.name ?? "Server wechseln"}
      >
        {!compact ? <strong>{active?.name ?? "Dieses Gerät"}</strong> : null}
        <span className="workspace-switcher-chevron"><ChevronDownIcon className="h-4 w-4" /></span>
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <>
          {mobile ? <button type="button" className="workspace-switcher-backdrop" aria-label="Workspace-Auswahl schließen" onClick={() => setOpen(false)} /> : null}
          <div
            ref={popoverRef}
            className={`workspace-switcher-popover${mobile ? " is-mobile" : ""}`}
            role="dialog"
            aria-modal={mobile || undefined}
            aria-label="Server wechseln"
            style={mobile ? undefined : position}
          >
            <header>
              <strong>Server wechseln</strong>
              <button type="button" className="workspace-popover-close" onClick={() => setOpen(false)} aria-label="Workspace-Auswahl schließen">
                <CloseIcon className="h-4 w-4" style={{ color: "var(--color-muted)" }} />
              </button>
            </header>
            <WorkspaceRegistryView />
          </div>
        </>,
        document.body,
      ) : null}
    </>
  );
}

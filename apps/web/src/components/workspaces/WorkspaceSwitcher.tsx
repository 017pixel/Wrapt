import { shortcutEvents } from "../shortcuts/shortcutEvents";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import serverArtwork from "../../assets/dashboard-artwork/hero-arbeitsbereich-surface.webp";
import { preloadArtwork } from "../../lib/artworkPreload";
import { PopupArtwork } from "../PopupArtwork";
import { ChevronDownIcon, CloseIcon } from "../icons";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";
import { visibleWorkspaceEntries } from "./workspaceVisibility";
import { WorkspaceRegistryView } from "./WorkspaceRegistryView";

interface WorkspaceSwitcherProps {
  compact?: boolean;
  mobile?: boolean;
}

/** Kürzel für den Kompaktmodus: die ersten ein bis zwei Zeichen des Namens. */
function workspaceInitials(name: string): string {
  const characters = Array.from(name.trim());
  return characters.slice(0, 2).join("") || "?";
}

export function WorkspaceSwitcher({ compact = false, mobile = false }: WorkspaceSwitcherProps) {
  const entries = useWorkspaceRegistry((state) => state.entries);
  const selfUrl = useWorkspaceRegistry((state) => state.selfUrl);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dialogOpenRef = useRef(false);
  const onDialogOpenChange = useCallback((value: boolean) => { dialogOpenRef.current = value; }, []);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ top: 12, left: 12 });
  const active = entries.find((entry) => entry.url === selfUrl);
  const activeName = active?.name ?? "Dieses Gerät";
  // Nur tatsächlich wählbare Workspaces zählen: Loopback-Aliase und Origins
  // desselben Backends sollen den Switcher nicht erscheinen lassen.
  const visibleCount = useMemo(
    () => visibleWorkspaceEntries(entries, { selfUrl }).length,
    [entries, selfUrl],
  );

  useEffect(() => {
    if (visibleCount >= 2) preloadArtwork(serverArtwork);
  }, [visibleCount]);

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
      if (dialogOpenRef.current) return;
      const target = event.target;
      const menu = target instanceof Element ? target.closest(".workspace-entry-menu-panel") : null;
      if (menu?.id && popoverRef.current?.querySelector(`[aria-controls="${menu.id}"]`)) return;
      if (target instanceof Node && !popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || dialogOpenRef.current) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      if (event.defaultPrevented || visibleCount < 2 || !triggerRef.current?.getClientRects().length) return;
      event.preventDefault();
      triggerRef.current.click();
    };
    window.addEventListener(shortcutEvents.server, handleShortcut);
    return () => window.removeEventListener(shortcutEvents.server, handleShortcut);
  }, [visibleCount]);

  if (visibleCount < 2) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`workspace-switcher-trigger${compact ? " is-compact" : ""}${mobile ? " is-mobile" : ""}`}
        onPointerEnter={() => preloadArtwork(serverArtwork)}
        onFocus={() => preloadArtwork(serverArtwork)}
        onClick={toggle}
        aria-label={`Aktueller Server: ${activeName}. Workspace wechseln`}
        aria-expanded={open}
        title={`${activeName} · Workspace wechseln`}
      >
        {/* Der Name bleibt für den ausgeklappten Zustand eingehängt; im
            Kompaktmodus übernimmt das Kürzel-Badge die Orientierung. */}
        <span className="workspace-switcher-badge" aria-hidden="true">{workspaceInitials(activeName)}</span>
        <strong className="workspace-switcher-name">{activeName}</strong>
        <span className="workspace-switcher-chevron" aria-hidden="true"><ChevronDownIcon className="h-4 w-4" /></span>
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
              <PopupArtwork className="workspace-switcher-artwork" src={serverArtwork} />
              <strong>Server wechseln</strong>
              <button type="button" className="workspace-popover-close" onClick={() => setOpen(false)} aria-label="Workspace-Auswahl schließen">
                <CloseIcon className="h-4 w-4" style={{ color: "var(--color-muted)" }} />
              </button>
            </header>
            <WorkspaceRegistryView allowAdding={false} onDialogOpenChange={onDialogOpenChange} />
          </div>
        </>,
        document.body,
      ) : null}
    </>
  );
}

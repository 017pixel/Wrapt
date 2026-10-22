// Freigabe-Chip des Composers: der Modus ist ein Menü, keine Textzeile.
// Ohne belegte Optionen bleibt der Chip sichtbar, aber nur lesbar.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "../../icons";
import { useHermesV2Overlay } from "./useHermesV2Overlay";

export type ComposerApprovalMode = "manual" | "smart" | "off";

const MODE_LABEL: Record<ComposerApprovalMode, string> = {
  manual: "Nachfragen",
  smart: "Gezielt fragen",
  off: "Bypass",
};

/** Sichtbare Beschriftung des Freigabemodus; ohne Angabe bleibt der Chip neutral. */
function approvalModeLabel(mode: ComposerApprovalMode | null): string {
  return mode ? MODE_LABEL[mode] : "Freigabe";
}

export interface HermesV2ApprovalChipProps {
  mode: ComposerApprovalMode | null;
  /** Wirksamer Bypass der Projektion, auch wenn der Wunsch noch offen ist. */
  effectiveBypass: boolean;
  options: readonly { mode: ComposerApprovalMode; available: boolean }[];
  /** Nur ein global änderbarer Freigabemodus lässt sich umschalten. */
  editable: boolean;
  onSelect: (mode: ComposerApprovalMode) => void | Promise<void>;
}

export function HermesV2ApprovalChip(props: HermesV2ApprovalChipProps) {
  const { mode, effectiveBypass, options, editable, onSelect } = props;
  const [open, setOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const menuStyle = useHermesV2Overlay(open, buttonRef, { width: 200, gap: 6 });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
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
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
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

  // Bypass bleibt sichtbar: der Text benennt den Zustand und die Fläche
  // trägt die Akzentfarbe, damit der Modus nicht hinter einem Chip verschwindet.
  const bypass = effectiveBypass || mode === "off";
  const label = bypass ? MODE_LABEL.off : approvalModeLabel(mode);
  // Der wirksame Zustand zählt als gewählt, nicht nur der zuletzt gewählte.
  const current = bypass ? "off" : mode;
  const selectable =
    editable && options.some((option) => option.available);

  if (!selectable) {
    return (
      <span
        className="hermesv2-chip hermesv2-approval-chip"
        data-readonly="true"
        data-bypass={bypass || undefined}
        title={
          editable
            ? "Derzeit ist kein Freigabemodus verfügbar."
            : "Der Freigabemodus ist global festgelegt."
        }
      >
        <span className="hermesv2-chip-label">{label}</span>
      </span>
    );
  }

  return (
    <div ref={rootRef} className="hermesv2-approval" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="quiet-button hermesv2-chip hermesv2-approval-chip"
        aria-label="Freigabe wählen"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-bypass={bypass || undefined}
        title={`Freigabe wählen: ${label}`}
        onClick={(event) => {
          setPortalRoot(
            event.currentTarget.closest<HTMLElement>(
              ".hermesv2-drawer-layer",
            ) ?? document.body,
          );
          setOpen((value) => !value);
        }}
      >
        <span className="hermesv2-chip-label">{label}</span>
        <ChevronDownIcon aria-hidden style={{ color: "currentColor" }} />
      </button>
      {open && portalRoot
        ? createPortal(
            <div
              ref={listRef}
              id={menuId}
              className="hermesv2-approval-menu"
              style={menuStyle}
              role="menu"
              aria-label="Freigabe wählen"
            >
              {options.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current === option.mode}
                  className="quiet-button hermesv2-approval-option"
                  disabled={!option.available}
                  title={
                    option.available
                      ? undefined
                      : "Dieser Freigabemodus ist gerade nicht verfügbar."
                  }
                  onClick={() => {
                    close(true);
                    void Promise.resolve(onSelect(option.mode));
                  }}
                >
                  {MODE_LABEL[option.mode]}
                  {current === option.mode ? (
                    <span aria-hidden="true"> aktuell</span>
                  ) : null}
                </button>
              ))}
            </div>,
            // Innerhalb der Drawer-Fokusgrenze, außerhalb der Scrollfläche.
            portalRoot,
          )
        : null}
    </div>
  );
}

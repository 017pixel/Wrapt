import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon } from "../components/icons";
import "./preview-target-menu.css";

interface PreviewTargetMenuProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}

/** Zielauswahl im bestehenden Menü-Stil, außerhalb scrollender Karten. */
export function PreviewTargetMenu({ label, value, options, disabled, placeholder, onChange }: PreviewTargetMenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open || disabled) return;
    items()[activeIndex]?.focus();
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [activeIndex, disabled, open]);

  useLayoutEffect(() => {
    if (!open || disabled) return;
    const update = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const margin = 12;
      const gap = 6;
      const width = Math.min(bounds.width, window.innerWidth - margin * 2);
      const below = Math.max(0, window.innerHeight - bounds.bottom - margin - gap);
      const above = Math.max(0, bounds.top - margin - gap);
      const desired = Math.min(menuRef.current?.scrollHeight ?? 360, 360);
      const placeBelow = below >= desired || below >= above;
      const height = Math.min(desired, placeBelow ? below : above);
      setPosition({ position: "fixed", width, maxHeight: height,
        left: Math.max(margin, Math.min(bounds.left, window.innerWidth - width - margin)),
        top: placeBelow ? bounds.bottom + gap : bounds.top - gap - height, visibility: "visible" });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [disabled, open, options.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Tab") { close(true); return; }
    const available = items();
    const current = available.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (current + 1) % available.length
      : event.key === "ArrowUp" ? (current - 1 + available.length) % available.length
        : event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    available[next]?.focus();
  };

  return <div className="preview-target-picker">
    <button ref={triggerRef} type="button" className="preview-target-trigger" disabled={disabled || !options.length}
      aria-label={label} aria-haspopup="menu" aria-expanded={open && !disabled} aria-controls={open && !disabled ? id : undefined}
      onClick={() => setOpen(!open)} onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); }
      }}>
      <span>{options.find((option) => option.value === value)?.label ?? (options.length && placeholder ? placeholder : "Kein Browser-Ziel erkannt")}</span><ChevronDownIcon aria-hidden="true" />
    </button>
    {open && !disabled ? createPortal(<div id={id} ref={menuRef} role="menu" aria-label={label}
      className="orbit-board-picker-menu preview-target-menu" style={position} onKeyDown={onKeyDown}>
      {options.map((option) => <button key={option.value} type="button" role="menuitemradio" tabIndex={-1}
        aria-checked={option.value === value} className="preview-target-option"
        onClick={() => { close(true); onChange(option.value); }}>
        <span>{option.label}</span>{option.value === value ? <CheckIcon aria-hidden="true" /> : null}
      </button>)}
    </div>, document.body) : null}
  </div>;
}

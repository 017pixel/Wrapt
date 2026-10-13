import { useEffect, useRef, useState, type ReactNode } from "react";

/** Geschlossene Inhalte ruhen; beim Schließen bleibt die bestehende Animation erhalten. */
export function NotesCollapse({ collapsed, children, id, labelledBy, className }: {
  collapsed: boolean;
  children: ReactNode | (() => ReactNode);
  id?: string;
  labelledBy?: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(!collapsed);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!collapsed) { setMounted(true); return; }
    const element = container.current;
    if (!element) return;
    if (element.contains(document.activeElement)) {
      const parent = element.parentElement;
      parent?.querySelector<HTMLButtonElement>(".notes-tree-toggle, .notes-group-toggle")?.focus();
    }
    const style = getComputedStyle(element);
    const seconds = (value: string) => value.split(",").map((part) => part.trim().endsWith("ms") ? parseFloat(part) : parseFloat(part) * 1_000);
    const delays = seconds(style.transitionDelay);
    const duration = Math.max(0, ...seconds(style.transitionDuration).map((time, index) => (time || 0) + (delays[index % delays.length] || 0)));
    const timer = window.setTimeout(() => setMounted(false), duration);
    return () => window.clearTimeout(timer);
  }, [collapsed]);
  return <div ref={container} className="notes-group-content" data-collapsed={collapsed}
    inert={collapsed ? true : undefined} aria-hidden={collapsed || undefined}
    onTransitionEnd={(event) => { if (collapsed && event.target === event.currentTarget && event.propertyName === "grid-template-rows") setMounted(false); }}>
    <div id={id} aria-labelledby={labelledBy} className={className}>
      {(!collapsed || mounted) ? (typeof children === "function" ? children() : children) : null}
    </div>
  </div>;
}

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { scrollTabsByWheel } from "../lib/tabScroll";
import "./tab-bar.css";

export interface TabBarItem<T extends string> {
  readonly id: T;
  readonly label: string;
}

interface TabBarProps<T extends string> {
  readonly label: string;
  readonly items: readonly TabBarItem<T>[];
  readonly activeId: T;
  readonly onSelect: (id: T) => void;
}

const SCROLL_EDGE_TOLERANCE = 2;

/**
 * Horizontale Tab-Leiste: Das Mausrad scrollt seitwärts, eine Scrollbar gibt es
 * nicht. Solange die Tabs nicht vollständig sichtbar sind, blenden die Ränder
 * Pfeil-Buttons ein. Am jeweiligen Ende sind sie deaktiviert, damit die
 * Anordnung stabil bleibt.
 */
export function TabBar<T extends string>({ label, items, activeId, onSelect }: TabBarProps<T>) {
  const listRef = useRef<HTMLElement>(null);
  const [overflow, setOverflow] = useState({ scrollable: false, before: false, after: false });

  useEffect(() => {
    const element = listRef.current;
    if (element === null) return;

    const update = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      const scrollable = maxScroll > SCROLL_EDGE_TOLERANCE;
      const next = {
        scrollable,
        before: scrollable && element.scrollLeft > SCROLL_EDGE_TOLERANCE,
        after: scrollable && element.scrollLeft < maxScroll - SCROLL_EDGE_TOLERANCE,
      };
      setOverflow((previous) =>
        previous.scrollable === next.scrollable &&
        previous.before === next.before &&
        previous.after === next.after
          ? previous
          : next,
      );
    };

    const onWheel = (event: WheelEvent) => {
      if (scrollTabsByWheel(element, event.deltaX, event.deltaY, event.deltaMode)) {
        event.preventDefault();
      }
    };

    update();
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const step = (direction: -1 | 1) => {
    const element = listRef.current;
    if (element === null) return;
    element.scrollBy({
      left: direction * Math.max(160, element.clientWidth * 0.72),
      behavior: "smooth",
    });
  };

  return (
    <div className="tab-bar">
      {overflow.scrollable ? (
        <button
          type="button"
          className="tab-bar-step"
          onClick={() => step(-1)}
          disabled={!overflow.before}
          aria-label="Vorherige Tabs"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      ) : null}
      <nav ref={listRef} className="tab-bar-list" aria-label={label} tabIndex={0}>
        {items.map(({ id, label: itemLabel }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeId === id}
            className={`tab-bar-item ${activeId === id ? "is-active" : ""}`}
            onClick={() => onSelect(id)}
          >
            {itemLabel}
          </button>
        ))}
      </nav>
      {overflow.scrollable ? (
        <button
          type="button"
          className="tab-bar-step"
          onClick={() => step(1)}
          disabled={!overflow.after}
          aria-label="Weitere Tabs"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

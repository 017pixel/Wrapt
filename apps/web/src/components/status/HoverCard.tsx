import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { positionAnchoredCard, type AnchoredCardPosition } from "./anchoredCardPosition";

/**
 * Kartenrahmen der Statusleisten-Popups: Portal am `document.body`, Position
 * aus dem Anker, feste Kopf- und Fußzeile mit innerem Scrollbereich.
 *
 * Der Rahmen hängt bewusst am Portal, damit er nicht am `overflow` der Leiste
 * oder am Mascot-Schriftschnitt klebt. Kopf und Fuß bleiben stehen, nur der
 * Inhalt scrollt — deshalb liegt der Scroll-Container innen; `overflow` am
 * Kartenrahmen würde den nach außen ragenden Pfeil abschneiden.
 */
export function HoverCard({
  anchor,
  contentHeight,
  width = 384,
  maxHeight = 460,
  align = "end",
  className = "",
  label,
  testId,
  header,
  footer,
  children,
  onPointerEnter,
  onPointerLeave,
  onBlur,
}: {
  anchor: HTMLElement;
  /** Geschätzte Inhaltshöhe; begrenzt die Karte zusammen mit dem freien Platz. */
  contentHeight: number;
  width?: number;
  maxHeight?: number;
  align?: "start" | "end";
  className?: string;
  label: string;
  testId: string;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  onPointerEnter(): void;
  onPointerLeave(): void;
  onBlur(): void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<AnchoredCardPosition>(() =>
    positionAnchoredCard(
      { top: 0, bottom: 0, left: 0, right: 0, width: 0 },
      contentHeight,
      { width: window.innerWidth, height: window.innerHeight },
      { width, maxHeight, align },
    ),
  );

  useLayoutEffect(() => {
    const update = () => {
      const card = cardRef.current;
      const content = contentRef.current;
      const measuredHeight = card && content
        ? content.offsetHeight
          + (card.querySelector<HTMLElement>(".shc-head")?.offsetHeight ?? 0)
          + (card.querySelector<HTMLElement>(".shc-foot")?.offsetHeight ?? 0) + 2
        : contentHeight;
      const next = positionAnchoredCard(anchor.getBoundingClientRect(), measuredHeight, {
          width: window.innerWidth,
          height: window.innerHeight,
        }, { width, maxHeight, align });
      setPosition((previous) =>
        Object.keys(next).every((key) => previous[key as keyof AnchoredCardPosition] === next[key as keyof AnchoredCardPosition])
          ? previous : next);
    };
    update();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (cardRef.current) observer?.observe(cardRef.current);
    if (contentRef.current) observer?.observe(contentRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, contentHeight, width, maxHeight, align]);

  return createPortal(
    <aside
      ref={cardRef}
      className={`shc ${className}`}
      data-placement={position.placement}
      style={{
        left: position.left,
        bottom: position.bottom,
        maxHeight: position.height,
        width: position.width,
      }}
      role="dialog"
      aria-label={label}
      data-testid={testId}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
    >
      <header className="shc-head">{header}</header>
      <div className="shc-scroll"><div className="shc-content" ref={contentRef}>{children}</div></div>
      {footer ? <footer className="shc-foot">{footer}</footer> : null}
      <span className="shc-arrow" style={{ right: position.arrowOffset }} aria-hidden="true" />
    </aside>,
    document.body,
  );
}

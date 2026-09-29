import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { OrbitBoard } from "@wrapt/contracts";
import { ChevronDownIcon } from "../icons";

const MENU_VIEWPORT_MARGIN = 12;
const MENU_TRIGGER_GAP = 7;
const MENU_MAX_WIDTH = 270;
const MENU_MAX_HEIGHT = 360;

interface OrbitBoardSwitcherProps {
  boards: readonly OrbitBoard[];
  activeBoardId: string;
  onSelect: (boardId: string) => void;
}

export function OrbitBoardSwitcher({ boards, activeBoardId, onSelect }: OrbitBoardSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, boards.findIndex((board) => board.id === activeBoardId));
  const activeBoard = boards[activeIndex];

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [activeIndex, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const triggerBounds = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const horizontalMargin = Math.min(MENU_VIEWPORT_MARGIN, viewportWidth / 2);
      const width = Math.min(MENU_MAX_WIDTH, Math.max(0, viewportWidth - horizontalMargin * 2));
      const desiredHeight = Math.min(
        menu.scrollHeight || menu.getBoundingClientRect().height,
        MENU_MAX_HEIGHT,
        viewportHeight * 0.65,
      );
      const belowSpace = Math.max(0, viewportHeight - triggerBounds.bottom - MENU_TRIGGER_GAP - MENU_VIEWPORT_MARGIN);
      const aboveSpace = Math.max(0, triggerBounds.top - MENU_TRIGGER_GAP - MENU_VIEWPORT_MARGIN);
      const placeBelow = belowSpace >= desiredHeight || belowSpace >= aboveSpace;
      const availableHeight = placeBelow ? belowSpace : aboveSpace;
      const maxHeight = Math.max(0, Math.min(desiredHeight, availableHeight));
      const top = placeBelow
        ? triggerBounds.bottom + MENU_TRIGGER_GAP
        : triggerBounds.top - MENU_TRIGGER_GAP - maxHeight;
      const left = Math.max(
        horizontalMargin,
        Math.min(triggerBounds.left, viewportWidth - width - horizontalMargin),
      );

      setMenuPosition({ position: "fixed", top, left, width, maxHeight, visibility: "visible" });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [boards.length, open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const select = (board: OrbitBoard) => {
    onSelect(board.id);
    close(true);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    if (boards.length === 0) return;
    const next = event.key === "ArrowDown"
      ? (current + 1) % boards.length
      : event.key === "ArrowUp"
        ? (current - 1 + boards.length) % boards.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? boards.length - 1
            : null;
    if (next === null) return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  };

  return (
    <div className="orbit-board-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        className="orbit-board-picker-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Arbeitsfläche: ${activeBoard?.name ?? "Unbenannt"}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{activeBoard?.name ?? "Unbenannt"}</span>
        <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? createPortal(
        <div ref={menuRef} className="orbit-board-picker-menu" role="menu" aria-label="Arbeitsfläche auswählen" style={menuPosition} onKeyDown={onMenuKeyDown}>
          {boards.map((board, index) => (
            <button
              key={board.id}
              ref={(element) => { itemRefs.current[index] = element; }}
              type="button"
              role="menuitemradio"
              aria-checked={board.id === activeBoardId}
              tabIndex={-1}
              className="orbit-board-picker-item"
              onClick={() => select(board)}
            >
              <span className="orbit-board-picker-item-name">{board.name}</span>
              <small>{board.nodes.length} Knoten · {board.edges.length} Verbindungen</small>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

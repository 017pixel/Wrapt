import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useDismissible } from "../hooks/useDismissible.js";
import { useSlashMenuStore } from "./slashMenuStore.js";

/** Slash-Menü: öffnet an der Cursorposition und folgt der Eingabe. */
export function SlashMenu() {
  const open = useSlashMenuStore((state) => state.open);
  const query = useSlashMenuStore((state) => state.query);
  const items = useSlashMenuStore((state) => state.items);
  const index = useSlashMenuStore((state) => state.index);
  const rect = useSlashMenuStore((state) => state.rect);
  const execute = useSlashMenuStore((state) => state.execute);
  const set = useSlashMenuStore((state) => state.set);
  const close = useSlashMenuStore((state) => state.close);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Außenklick schließt das Menü, auch wenn der Fokus im Editor bleibt.
  useDismissible({ open, onClose: close, rootRef: menuRef });

  const grouped = useMemo(() => {
    const groups = new Map<string, { item: (typeof items)[number]; index: number }[]>();
    items.forEach((item, itemIndex) => {
      const list = groups.get(item.group) ?? [];
      list.push({ item, index: itemIndex });
      groups.set(item.group, list);
    });
    return [...groups.entries()];
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const element = listRef.current?.querySelector<HTMLElement>(".note-slash-item.is-active");
    element?.scrollIntoView({ block: "nearest" });
  }, [open, index]);

  if (!open || rect === null) return null;

  const placeAbove = rect.bottom + 320 > window.innerHeight;
  const style = {
    left: Math.min(rect.left, Math.max(8, window.innerWidth - 340)),
    ...(placeAbove
      ? { bottom: Math.max(8, window.innerHeight - rect.top + 6) }
      : { top: rect.bottom + 6 }),
  };

  return createPortal(
    <div
      ref={menuRef}
      className="note-slash-menu"
      style={style}
      role="listbox"
      aria-label="Befehle"
      onMouseDown={(event) => event.preventDefault()}
    >
      <p className="note-slash-query">
        {query === "" ? "Befehl wählen" : `Suche: ${query}`}
      </p>
      <div className="note-slash-list" ref={listRef}>
        {items.length === 0 ? (
          <p className="note-slash-empty">Kein Befehl gefunden.</p>
        ) : (
          grouped.map(([group, entries]) => (
            <section key={group}>
              <p className="note-slash-group">{group}</p>
              {entries.map(({ item, index: itemIndex }) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={itemIndex === index}
                  className={`note-slash-item ${itemIndex === index ? "is-active" : ""}`}
                  onMouseMove={() => set({ index: itemIndex })}
                  onClick={() => execute?.(item)}
                >
                  <span className="note-slash-hint">{item.hint ?? "•"}</span>
                  <span className="note-slash-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}

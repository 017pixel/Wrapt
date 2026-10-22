// Überlaufmenü des Composers: Steuern, Einreihen, Hintergrund, Zwischenauftrag.
// Die Aktionen stehen hinter einem Knopf; Sperrgründe hängen am Menüpunkt.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreIcon } from "../../icons";
import { useHermesV2Overlay } from "./useHermesV2Overlay";
import type { ChatSessionView, HermesV2Chat } from "./chat-types";

export interface HermesV2WorkSendActionsProps {
  chat: HermesV2Chat;
  value: string;
  snapshot: ChatSessionView | null;
  running: boolean;
}

/** Nutzbare native Textbasis: nicht leer, keine rohe Slashzeile. */
function usableText(chat: HermesV2Chat, value: string): string | null {
  const text = (chat.draft || value).trim();
  if (!text || text.startsWith("/")) return null;
  return text;
}

function blockedReason(
  chat: HermesV2Chat,
  snapshot: ChatSessionView | null,
  value: string,
): string | null {
  if (chat.connection.state !== "online") return "Keine Verbindung zu Hermes.";
  if (snapshot?.writable !== true)
    return "Diese Sitzung nimmt derzeit keine Aktion an.";
  if (usableText(chat, value) === null)
    return "Dafür ist normaler Text im Sendefeld nötig.";
  return null;
}

interface WorkMenuItem {
  id: string;
  label: string;
  title: string;
  run: () => Promise<void>;
}

/** Das Menü steht nur mit Sitzung und mit Text oder laufendem Turn. */
export function HermesV2WorkSendActions({
  chat,
  value,
  snapshot,
  running,
}: HermesV2WorkSendActionsProps) {
  const [open, setOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const menuStyle = useHermesV2Overlay(open, buttonRef, { width: 240, gap: 6 });

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
  };

  if (!snapshot) return null;
  const text = usableText(chat, value);
  // Ohne Text und ohne laufenden Turn gibt es nichts zu steuern oder einzureihen.
  if (text === null && !running) return null;
  const base = blockedReason(chat, snapshot, value);
  const send = (action: () => Promise<void>) => {
    if (text !== null) void action();
  };
  const items: WorkMenuItem[] = [];
  if (running) {
    items.push({
      id: "steer",
      label: "Steuern",
      title: "Diese Nachricht als Steuerung senden",
      run: () => chat.steer(chat.draft || value),
    });
    items.push({
      id: "queue",
      label: "Einreihen",
      title: "Diese Nachricht einreihen",
      run: () => chat.submit(chat.draft || value, "queue"),
    });
  }
  items.push({
    id: "background",
    label: "Hintergrund",
    title: "Diese Nachricht als Hintergrundaufgabe starten",
    run: () => chat.startBackground(chat.draft || value),
  });
  items.push({
    id: "btw",
    label: "Zwischenauftrag",
    title: "Diese Nachricht als Zwischenauftrag starten",
    run: () => chat.startBtw(chat.draft || value),
  });
  return (
    <div ref={rootRef} className="hermesv2-work-more" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="quiet-button hermesv2-chip hermesv2-work-more-button"
        aria-label="Weitere Aktionen"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Weitere Aktionen"
        onClick={(event) => {
          setPortalRoot(
            event.currentTarget.closest<HTMLElement>(
              ".hermesv2-drawer-layer",
            ) ?? document.body,
          );
          setOpen((value) => !value);
        }}
      >
        <MoreIcon aria-hidden style={{ color: "currentColor" }} />
      </button>
      {open && portalRoot
        ? createPortal(
            <ul
              ref={listRef}
              id={menuId}
              className="hermesv2-work-menu"
              style={menuStyle}
              role="menu"
              aria-label="Weitere Aktionen"
            >
              {items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={base !== null}
                    aria-disabled={base !== null || undefined}
                    title={base ?? item.title}
                    onClick={() => {
                      close(true);
                      send(item.run);
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>,
            // Innerhalb der Drawer-Fokusgrenze, außerhalb der Scrollfläche.
            portalRoot,
          )
        : null}
    </div>
  );
}

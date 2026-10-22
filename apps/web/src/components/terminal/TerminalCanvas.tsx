import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TerminalPaneSlot } from "./TerminalPaneSlot";
import { Group, Panel, Separator, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import type { TerminalPaneLayout } from "@wrapt/contracts";

export interface TerminalCanvasPane {
  id: string;
  runtimeId: string;
}

export function layoutPanes(layout: TerminalPaneLayout | null): TerminalCanvasPane[] {
  if (!layout) return [];
  return layout.type === "pane" ? [{ id: layout.id, runtimeId: layout.runtimeId }] : layout.children;
}

interface TerminalCanvasProps {
  areaId: string;
  bento: boolean;
  isMobile: boolean;
  showSingleMobilePane: boolean;
  focusedRuntimeId: string | null;
  paneLayout: TerminalPaneLayout | null;
  panes: TerminalCanvasPane[];
  parkedPanes: TerminalCanvasPane[];
  emptyState: ReactNode;
  dropZone: ReactNode;
  renderPane(pane: TerminalCanvasPane, visible: boolean, position?: "left" | "right", index?: number): ReactNode;
  onLayoutChanged(layout: Layout, details: LayoutChangedMeta): void;
}

/** Stabile Portale halten die Renderer beim Wechsel zwischen Einzel-, Split-,
 * Mobil- und geparkter Ansicht am Leben. Nur ihre Plätze wechseln. */
export function TerminalCanvas({ areaId, bento, isMobile, showSingleMobilePane, focusedRuntimeId, paneLayout, panes, parkedPanes, emptyState, dropZone, renderPane, onLayoutChanged }: TerminalCanvasProps) {
  const hosts = useRef(new Map<string, HTMLElement>());
  const allPanes = [...panes, ...parkedPanes];
  const known = new Set(allPanes.map((pane) => pane.id));
  for (const id of hosts.current.keys()) if (!known.has(id)) hosts.current.delete(id);
  for (const pane of allPanes) {
    if (!hosts.current.has(pane.id)) {
      const host = document.createElement("div");
      host.className = "terminal-pane-host";
      hosts.current.set(pane.id, host);
    }
  }
  const single = showSingleMobilePane || (bento && isMobile);
  const mobilePane = panes.find((pane) => pane.runtimeId === focusedRuntimeId) ?? panes[0];
  const visible = (pane: TerminalCanvasPane) => panes.includes(pane) && (!single || pane.id === mobilePane?.id);
  const slot = (pane: TerminalCanvasPane) => <TerminalPaneSlot key={pane.id} host={hosts.current.get(pane.id)!} parked={!visible(pane)} />;
  const portals = allPanes.map((pane) => {
    const index = panes.indexOf(pane);
    return createPortal(renderPane(pane, visible(pane), index === 0 ? "left" : index === panes.length - 1 ? "right" : undefined, index >= 0 ? index : undefined), hosts.current.get(pane.id)!, pane.id);
  });
  const split = paneLayout?.type === "split" ? paneLayout : null;

  return <>
    <div className={`terminal-canvas${bento ? ` is-bento has-${Math.min(panes.length, 4)}` : ""}${single ? " is-mobile-single-pane" : ""}`}>
      {panes.length === 0 ? <div className="terminal-empty-state">{emptyState}</div> : bento || single ? panes.map(slot) : (
        <Group
          id={`terminal-split-${areaId}`}
          className="terminal-split-group"
          orientation="horizontal"
          defaultLayout={Object.fromEntries(panes.map((pane, index) => [pane.id, split?.sizes[index] ?? (100 / panes.length)])) as Layout}
          onLayoutChanged={onLayoutChanged}
          resizeTargetMinimumSize={{ coarse: 44, fine: 20 }}
        >
          {panes.flatMap((pane, index) => [
            <Panel key={pane.id} id={pane.id} minSize="20%" defaultSize={`${split?.sizes[index] ?? (100 / panes.length)}%`}>
              {slot(pane)}
            </Panel>,
            index < panes.length - 1
              ? <Separator key={`separator-${pane.id}`} className="terminal-split-handle" aria-label="Terminal-Aufteilung anpassen" />
              : null,
          ])}
        </Group>
      )}
      {parkedPanes.map(slot)}
      {dropZone}
    </div>
    {portals}
  </>;
}

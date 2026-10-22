import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ReactElement } from "react";
import {
  ClockIcon,
  DatabaseIcon,
  HermesIcon,
  NetworkIcon,
  SkillsIcon,
  ServerIcon,
  MoreIcon,
} from "../../../components/icons";
import { ModalFrame } from "../../ModalDialog";
import { AREA_META, type SelectableArea } from "./resource-areas";
import "./hermes-v2-resources.css";

/**
 * Alle Icons erben die Textfarbe ihres Ziels. Nur der aktive Bereich wechselt
 * auf den Akzent, die Reihe selbst bleibt rahmen- und flächenlos.
 */
const ICON_STYLE = { color: "currentColor" } as const;

const AREA_ICON: Record<SelectableArea, ReactElement> = {
  chat: <HermesIcon className="hermesv2-areanav-icon" aria-hidden />,
  cron: <ClockIcon className="hermesv2-areanav-icon" aria-hidden style={ICON_STYLE} />,
  skills: <SkillsIcon className="hermesv2-areanav-icon" aria-hidden />,
  memory: <DatabaseIcon className="hermesv2-areanav-icon" aria-hidden style={ICON_STYLE} />,
  configuration: <ServerIcon className="hermesv2-areanav-icon" aria-hidden style={ICON_STYLE} />,
  diagnostics: <NetworkIcon className="hermesv2-areanav-icon" aria-hidden style={ICON_STYLE} />,
};

/**
 * Bereichsauswahl der eigenen Fläche: eine schmale Iconreihe am unteren
 * Rand. Sie hängt nie allein an der Toolbar, damit sie auch in
 * `is-minimal` Panel- und Orbitflächen erreichbar bleibt. Jedes Ziel heißt
 * zugänglich `Bereich: <Name>`, sichtbar bleibt nur das Icon mit Tooltip,
 * und ist vollständig mit der Tastatur erreichbar (Roving Tabindex, Pfeile,
 * Home/End). Der aktive Bereich trägt keine Fläche und keinen Rahmen, nur
 * die Iconfarbe wechselt auf den Akzent; `aria-selected` hält den Zustand
 * für Screenreader fest.
 */
export function HermesV2AreaNav({
  area,
  onSelect,
  compact = false,
  onOverlayChange,
}: {
  area: SelectableArea;
  onSelect: (area: SelectableArea) => void;
  compact?: boolean;
  onOverlayChange?: (open: boolean) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    onOverlayChange?.(moreOpen);
    return () => onOverlayChange?.(false);
  }, [moreOpen, onOverlayChange]);
  const mainAreas = compact ? AREA_META.slice(0, 4) : AREA_META;
  const secondarySelected = area === "configuration" || area === "diagnostics";
  const listRef = useRef<HTMLDivElement | null>(null);

  const move = useCallback(
    (current: HTMLButtonElement, direction: 1 | -1 | "home" | "end") => {
      const targets = Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[role='tab']",
        ) ?? [],
      );
      if (targets.length === 0) return;
      const index = direction === "home" ? 0
        : direction === "end" ? targets.length - 1
        : (targets.indexOf(current) + direction + targets.length) % targets.length;
      const next = targets[index];
      if (!next) return;
      next.focus();
    },
    [],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const current = event.target as HTMLButtonElement;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(current, 1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(current, -1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      move(current, "home");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      move(current, "end");
    }
  };

  return (
    <nav className="hermesv2-areanav" aria-label="Hermes-V2-Bereich">
      <div
        ref={listRef}
        className="hermesv2-areanav-list"
        role="tablist"
        aria-label="Hermes-V2-Bereich"
        onKeyDown={onKeyDown}
      >
        {mainAreas.map((meta) => (
          <button
            key={meta.id}
            type="button"
            tabIndex={area === meta.id ? 0 : -1}
            className="hermesv2-areanav-target"
            role="tab"
            aria-selected={area === meta.id}
            aria-label={`Bereich: ${meta.label}`}
            data-area={meta.marker}
            title={meta.label}
            onClick={() => onSelect(meta.id)}
          >
            {AREA_ICON[meta.id]}
          </button>
        ))}
        {compact ? (
          <button
            type="button"
            role="tab"
            className="hermesv2-areanav-target"
            aria-label="Weitere Hermes-Bereiche"
            aria-selected={secondarySelected}
            aria-haspopup="dialog"
            title="Weitere Bereiche"
            tabIndex={secondarySelected ? 0 : -1}
            onClick={() => setMoreOpen(true)}
          >
            <MoreIcon className="hermesv2-areanav-icon" style={ICON_STYLE} />
          </button>
        ) : null}
      </div>
      <ModalFrame
        open={moreOpen}
        title="Weitere Bereiche"
        className="hermesv2-area-menu"
        onClose={() => setMoreOpen(false)}
      >
        {(close) => (
          <div className="hermesv2-area-menu-list">
            {AREA_META.slice(4).map((meta) => (
              <button
                type="button"
                className="quiet-button"
                key={meta.id}
                onClick={() => {
                  onSelect(meta.id);
                  close();
                }}
              >
                {AREA_ICON[meta.id]}
                {meta.label}
              </button>
            ))}
          </div>
        )}
      </ModalFrame>
    </nav>
  );
}

/** Marker der aktuell sichtbaren Fläche für E2E; Deletefläche erbt ihr Ziel. */
export function areaMarker(area: SelectableArea, deleteActive: boolean): string {
  return deleteActive ? "session-delete" : area;
}

// Reasoningauswahl: echte Hermes-Ladder, portal/anchored wie Zeilenmenü, kein Toolbarclip.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "../../icons";
import { useHermesV2Overlay } from "./useHermesV2Overlay";
import type { HermesV2Effort } from "@wrapt/contracts/hermes-v2";

const EFFORT_LABEL: Record<string, string> = {
  none: "Aus",
  minimal: "Minimal",
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  xhigh: "Sehr hoch",
  max: "Maximal",
  ultra: "Ultra",
};

export interface HermesV2ReasoningControlProps {
  selected: string | null;
  /** Beobachtete Auswahl; unconfirmed/pending/unknown zeigen nie einen Erfolgswert. */
  status: "idle" | "pending" | "observed" | "unconfirmed" | "unknown";
  observedEffort: string | null;
  /** Tatsächlich geklemmte Stufe, wenn sie von der gewünschten abweicht. */
  observedWire: string | null;
  /** Allgemeine Hermes-Ladder aus dem Katalog; none braucht die Modellbelegung. */
  ladder: readonly HermesV2Effort[];
  canDisableReasoning: boolean | null;
  locked: boolean;
  lockedReason: string | null;
  onSelect: (effort: HermesV2Effort) => void | Promise<void>;
}

export function reasoningLockedReason(props: {
  writable: boolean;
  running: boolean;
  selectPending: boolean;
  available: boolean;
}): string | null {
  if (!props.available)
    return "Die Composerprojektion ist in dieser Sitzung nicht verfügbar.";
  if (!props.writable)
    return "Diese Sitzung nimmt derzeit keine Einstellungsänderung an.";
  if (props.running)
    return "Während des laufenden Turns bleibt die Denktiefe unverändert.";
  if (props.selectPending) return "Eine Auswahl ist bereits in Klärung.";
  return null;
}

/** Nur bestätigte Stufen gelten als Wirkung; ein Wunsch bleibt ein Wunsch. */
function settledStatus(
  status: HermesV2ReasoningControlProps["status"],
): boolean {
  return status === "observed" || status === "idle";
}

/** Eine Zeile Beschreibung ersetzt die frühere sichtbare Hinweiszeile. */
function chipDescription(props: {
  status: HermesV2ReasoningControlProps["status"];
  selected: string | null;
  observedEffort: string | null;
  observedWire: string | null;
  lockedReason: string | null;
}): string | null {
  if (props.lockedReason) return props.lockedReason;
  const parts: string[] = [];
  if (props.status === "pending") parts.push("Wunsch in Klärung");
  if (props.status === "unconfirmed")
    parts.push(
      `Wunsch unbestätigt: ${props.selected ? (EFFORT_LABEL[props.selected] ?? props.selected) : "–"}`,
    );
  if (props.status === "unknown") parts.push("Aktueller Stand unbekannt");
  if (
    props.observedWire &&
    props.observedEffort &&
    props.observedWire !== props.observedEffort
  )
    parts.push(`Wirksame Klemmstufe: ${props.observedWire}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function HermesV2ReasoningControl(props: HermesV2ReasoningControlProps) {
  const {
    selected,
    status,
    observedEffort,
    observedWire,
    ladder,
    canDisableReasoning,
    locked,
    lockedReason,
    onSelect,
  } = props;
  const [open, setOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
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
    const index = entries.findIndex(
      (entry) => entry === document.activeElement,
    );
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

  const reason = locked
    ? (lockedReason ?? "Denktiefe ist derzeit nicht änderbar.")
    : null;
  const settled = settledStatus(status);
  // Bestätigte Stufen zeigen den Wert; ein offener Wunsch bleibt sichtbar,
  // aber blass und erklärend im Titel.
  const visibleEffect = settled ? observedEffort : selected;
  const unconfirmed =
    status === "unconfirmed" || status === "pending" || status === "unknown";
  const description = chipDescription({
    status,
    selected,
    observedEffort,
    observedWire,
    lockedReason: reason,
  });
  const options = ladder.filter((effort) => effort !== "none");
  const label = visibleEffect
    ? (EFFORT_LABEL[visibleEffect] ?? visibleEffect)
    : "Denktiefe";
  return (
    <div ref={rootRef} className="hermesv2-effort" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="quiet-button hermesv2-chip hermesv2-effort-button"
        aria-label="Denktiefe"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? popoverId : undefined}
        disabled={Boolean(reason)}
        data-pending={unconfirmed || undefined}
        title={description ?? undefined}
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
      {open && !locked && portalRoot
        ? createPortal(
            <div
              ref={listRef}
              className="hermesv2-effort-pop"
              id={popoverId}
              style={menuStyle}
              role="listbox"
              aria-label="Denktiefe wählen"
            >
              {options.map((effort) => (
                <button
                  key={effort}
                  type="button"
                  role="option"
                  aria-selected={visibleEffect === effort}
                  className="quiet-button hermesv2-effort-option"
                  onClick={() => {
                    close(true);
                    void Promise.resolve(onSelect(effort));
                  }}
                >
                  {EFFORT_LABEL[effort] ?? effort}
                  {visibleEffect === effort ? (
                    <span aria-hidden="true"> aktuell</span>
                  ) : null}
                </button>
              ))}
              {/* none nur einmal und nur mit ausdrücklich belegtem Modellwert. */}
              {canDisableReasoning === true ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={visibleEffect === "none"}
                  className="quiet-button hermesv2-effort-option"
                  onClick={() => {
                    close(true);
                    void Promise.resolve(onSelect("none"));
                  }}
                >
                  Aus
                </button>
              ) : (
                <p role="note">
                  Ausschalten ist für dieses Modell nicht belegt.
                </p>
              )}
              {observedWire &&
              observedEffort &&
              observedWire !== observedEffort ? (
                <p role="note">Wirksame Klemmstufe: {observedWire}</p>
              ) : null}
              {unconfirmed ? (
                <p role="note">
                  {status === "pending"
                    ? "Wunsch in Klärung"
                    : `Wunsch unbestätigt: ${selected ? (EFFORT_LABEL[selected] ?? selected) : "–"}`}
                </p>
              ) : null}
            </div>,
            // Außerhalb des Composer-Scrollcontainers, aber innerhalb des
            // Drawer-Fokusraums.
            portalRoot,
          )
        : null}
    </div>
  );
}

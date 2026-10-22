// Projektpicker für neue Hermes-Sitzungen: Kontext-Chip im Dialogkopf mit
// eigener Listbox. Kein natives select, keine erzwungene Fremdsortierung.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon, FolderIcon, SearchIcon } from "../../icons";
import "./hermes-v2-dialogs.css";

export interface HermesV2ProjectOption {
  id: string;
  name: string;
  /** Zeitpunkt der letzten Workbench-Nutzung (ISO) oder null. */
  lastUsedAt: string | null;
}

/** Leere Kennung bedeutet "Ohne Projekt" und bleibt der Default. */
export const NO_PROJECT_ID = "";

/** Ab dieser Menge bekommt das Menü ein Suchfeld. */
const SEARCH_THRESHOLD = 8;

/**
 * Zuletzt genutzte Projekte zuerst. Projekte ohne Zeitpunkt stehen dahinter,
 * alphabetisch nach Name. Unbekannte Zeitstempel gelten wie "kein Zeitpunkt".
 */
export function sortProjectsByUsage(
  projects: readonly HermesV2ProjectOption[],
): HermesV2ProjectOption[] {
  return [...projects].sort((left, right) => {
    const leftTime = left.lastUsedAt ? Date.parse(left.lastUsedAt) : Number.NaN;
    const rightTime = right.lastUsedAt
      ? Date.parse(right.lastUsedAt)
      : Number.NaN;
    const leftValid = Number.isFinite(leftTime);
    const rightValid = Number.isFinite(rightTime);
    if (leftValid && rightValid) return rightTime - leftTime;
    if (leftValid) return -1;
    if (rightValid) return 1;
    return left.name.localeCompare(right.name, "de");
  });
}

export interface HermesV2ProjectPickerProps {
  projects: readonly HermesV2ProjectOption[];
  /** Kennung des gewählten Projekts; leer bedeutet "Ohne Projekt". */
  value: string;
  onChange: (projectId: string) => void;
  label?: string;
}

/**
 * Auswahl als Chip im Dialogkopf; das Menü ist eine tastaturbedienbare
 * Listbox mit Pfeiltasten, Home/End, Enter und Escape. Ein Klick außerhalb
 * schließt das Menü, ohne den Dialog zu schließen.
 */
export function HermesV2ProjectPicker({
  projects,
  value,
  onChange,
  label = "Projekt",
}: HermesV2ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const sorted = useMemo(() => sortProjectsByUsage(projects), [projects]);
  const selectedName = useMemo(() => {
    if (value === NO_PROJECT_ID) return "Ohne Projekt";
    return sorted.find((project) => project.id === value)?.name ?? "Projekt wählen";
  }, [sorted, value]);
  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    const matching = needle
      ? sorted.filter((project) =>
          project.name.toLocaleLowerCase("de").includes(needle),
        )
      : sorted;
    return [
      { id: NO_PROJECT_ID, name: "Ohne Projekt", lastUsedAt: null },
      ...matching,
    ];
  }, [sorted, query]);

  // Klick außerhalb schließt nur das Menü; der Dialog bleibt offen.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Beim Öffnen springt der Fokus in die Suche oder auf die gewählte Option.
  useEffect(() => {
    if (!open) return;
    const frame = window.setTimeout(() => {
      if (searchRef.current) {
        searchRef.current.focus();
        return;
      }
      const options = listRef.current?.querySelectorAll<HTMLElement>(
        '[role="option"]',
      );
      const selected = listRef.current?.querySelector<HTMLElement>(
        '[role="option"][aria-selected="true"]',
      );
      (selected ?? options?.[0])?.focus();
    }, 0);
    return () => window.clearTimeout(frame);
  }, [open]);

  const moveFocus = (key: string) => {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (key === "Home") next = 0;
    else if (key === "End") next = items.length - 1;
    else if (key === "ArrowDown")
      next = current < 0 ? 0 : (current + 1) % items.length;
    else if (key === "ArrowUp")
      next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  };

  const choose = (projectId: string) => {
    onChange(projectId);
    close(true);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(false);
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Escape schließt nur das Menü; der Dialog bleibt stehen.
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      moveFocus(event.key);
    }
  };

  return (
    <div className="hermesv2-projectpicker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="hermesv2-projectpicker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label} wählen: ${selectedName}`}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
      >
        <FolderIcon
          className="hermesv2-projectpicker-icon"
          style={{ color: "inherit" }}
          aria-hidden
        />
        <span className="hermesv2-projectpicker-value">{selectedName}</span>
        <ChevronDownIcon
          className={`hermesv2-projectpicker-chevron ${open ? "is-open" : ""}`}
          style={{ color: "inherit" }}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="hermesv2-projectpicker-menu" onKeyDown={onMenuKeyDown}>
          {projects.length + 1 > SEARCH_THRESHOLD ? (
            <label className="hermesv2-projectpicker-search">
              <SearchIcon style={{ color: "inherit" }} aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Projekt suchen"
                aria-label="Projekt suchen"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          ) : null}
          <div
            id={listId}
            ref={listRef}
            className="hermesv2-projectpicker-list"
            role="listbox"
            aria-label="Projekt"
          >
            {options.map((option) => (
              <button
                key={option.id || "none"}
                type="button"
                role="option"
                aria-selected={option.id === value}
                className={`hermesv2-projectpicker-option${
                  option.id === value ? " is-selected" : ""
                }`}
                onClick={() => choose(option.id)}
              >
                <span className="hermesv2-projectpicker-option-name">
                  {option.name}
                </span>
                {option.id === value ? (
                  <CheckIcon style={{ color: "inherit" }} aria-hidden />
                ) : null}
              </button>
            ))}
            {options.length === 1 && projects.length > 0 ? (
              <p className="hermesv2-projectpicker-empty">
                Kein passendes Projekt gefunden.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

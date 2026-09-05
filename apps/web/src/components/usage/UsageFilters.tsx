import type { TimelineLane } from "../../lib/quotaTimeline";
import type { UsagePreferences } from "../../stores/usagePreferences";
import { useUsagePreferences } from "../../stores/usagePreferences";
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "../icons";

const providerName: Record<TimelineLane["providerId"], string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode Go",
};

export interface UsageFiltersProps {
  /** Alle bekannten Lanes (vor dem Filtern), für Account-Optionen. */
  lanes: TimelineLane[];
  prefs: UsagePreferences;
}

export function UsageFilters({ lanes, prefs }: UsageFiltersProps) {
  const store = useUsagePreferences();
  const [open, setOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hideRootRef = useRef<HTMLDivElement>(null);
  const hideTriggerRef = useRef<HTMLButtonElement>(null);
  const activeCount = Number(prefs.providerFilter !== "all") + Number(prefs.onlyActive) + Number(prefs.onlyProblematic) + Number(prefs.hideAccountsWithoutData) + Number(prefs.hiddenAccountIds.length > 0);
  const hiddenCount = prefs.hiddenAccountIds.length;
  const reset = () => {
    store.set({ providerFilter: "all", onlyActive: false, onlyProblematic: false, hideAccountsWithoutData: false, hiddenAccountIds: [] });
    setHideOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button,select")?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  useEffect(() => {
    if (!hideOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!hideRootRef.current?.contains(event.target as Node)) setHideOpen(false);
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHideOpen(false);
        hideTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
    };
  }, [hideOpen]);

  const toggleHidden = (accountId: string) => {
    const hidden = prefs.hiddenAccountIds.includes(accountId);
    store.set({
      hiddenAccountIds: hidden
        ? prefs.hiddenAccountIds.filter((id) => id !== accountId)
        : [...prefs.hiddenAccountIds, accountId],
    });
  };

  const sortedLanes = [...lanes].sort((a, b) => a.accountLabel.localeCompare(b.accountLabel, "de"));

  return (
    <div className="uf-shell"><div className="uf-mobile-bar" role="group" aria-label="Filter und Sortierung">
      <button ref={triggerRef} type="button" className="uf-mobile-button" aria-expanded={open} onClick={() => setOpen(true)}>Filter{activeCount ? ` ${activeCount}` : ""}</button>
      <label className="uf-mobile-sort"><span className="sr-only">Sortierung</span><select value={prefs.sortBy} onChange={(event) => store.set({ sortBy: event.target.value as UsagePreferences["sortBy"] })}><option value="default">Sortieren</option><option value="provider">Provider</option><option value="name">Accountname</option><option value="lowest">Niedrigstes Limit</option><option value="nextReset">Nächster Reset</option><option value="status">Status</option></select></label>
    </div><div className={`uf-backdrop ${open ? "is-open" : ""}`} onPointerDown={() => setOpen(false)} />
    <div ref={panelRef} className={`uf ${open ? "is-open" : ""}`} role={open ? "dialog" : "group"} aria-modal={open || undefined} aria-label="Filter und Sortierung">
      <header className="uf-sheet-head"><strong>Filter</strong>{activeCount ? <button type="button" onClick={reset}>Reset</button> : null}<button type="button" className="icon-button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="Filter schließen"><CloseIcon className="h-4 w-4" /></button></header>
      <label className="uf-select">
        <span className="uf-label">Provider</span>
        <select
          value={prefs.providerFilter}
          onChange={(event) => store.set({ providerFilter: event.target.value as UsagePreferences["providerFilter"] })}
        >
          <option value="all">Alle Provider</option>
          {(["codex", "claude", "opencode"] as const).map((provider) => (
            <option key={provider} value={provider}>{providerName[provider]}</option>
          ))}
        </select>
      </label>

      <label className="uf-select">
        <span className="uf-label">Sortierung</span>
        <select value={prefs.sortBy} onChange={(event) => store.set({ sortBy: event.target.value as UsagePreferences["sortBy"] })}>
          <option value="default">Aktiv zuerst, niedrigstes Limit</option>
          <option value="provider">Provider</option>
          <option value="name">Accountname</option>
          <option value="lowest">Niedrigstes Restlimit</option>
          <option value="nextReset">Nächster Reset</option>
          <option value="status">Status</option>
        </select>
      </label>

      {([["onlyActive", "Aktiv", "Nur aktiv"], ["onlyProblematic", "Problematisch", "Nur problematische"], ["hideAccountsWithoutData", "Ohne Daten", "Ohne Daten ausblenden"]] as const).map(([key, label, ariaLabel]) => <button key={key} type="button" className="uf-chip" aria-label={ariaLabel} aria-pressed={prefs[key]} onClick={() => store.set({ [key]: !prefs[key] })}>{label}</button>)}

      {lanes.length > 1 ? (
        <div className="uf-hide" ref={hideRootRef}>
          <button
            ref={hideTriggerRef}
            type="button"
            className="uf-hide-trigger"
            aria-expanded={hideOpen}
            aria-label={`Accounts ausblenden${hiddenCount ? `, ${hiddenCount} ausgeblendet` : ""}`}
            onClick={() => setHideOpen((value) => !value)}
          >
            <span>Ausblenden</span>
            {hiddenCount ? <span className="uf-hide-count">{hiddenCount}</span> : null}
          </button>
          {hideOpen ? (
            <div className="uf-hide-panel" role="dialog" aria-label="Accounts ausblenden">
              <header className="uf-hide-head">
                <strong>Accounts ausblenden</strong>
                {hiddenCount ? <button type="button" onClick={() => store.set({ hiddenAccountIds: [] })}>Alle einblenden</button> : null}
              </header>
              <ul className="uf-hide-list">
                {sortedLanes.map((lane) => {
                  const hidden = prefs.hiddenAccountIds.includes(lane.accountId);
                  return (
                    <li key={lane.accountId}>
                      <label>
                        <input type="checkbox" checked={!hidden} onChange={() => toggleHidden(lane.accountId)} />
                        <span className="uf-hide-label">{lane.accountLabel}</span>
                        <span className="uf-hide-provider">{providerName[lane.providerId]}</span>
                        <span className={hidden ? "uf-hide-state is-hidden" : "uf-hide-state"}>{hidden ? "ausgeblendet" : "sichtbar"}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <span className="uf-reset-wrap">{activeCount ? <button type="button" className="uf-reset" onClick={reset}>Alle Filter löschen</button> : null}</span>
    </div></div>
  );
}

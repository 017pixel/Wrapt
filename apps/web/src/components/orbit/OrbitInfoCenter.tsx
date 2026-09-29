import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OrbitBoard, ProviderUsage } from "@wrapt/contracts";
import { CloseIcon, InfoIcon } from "../icons";
import { wraptQueries } from "../../lib/queryOptions";
import { useOrbitPerformance } from "../../lib/useOrbitPerformance";
import { formatUsageReset, orbitUsageEmptyMessage } from "../../lib/orbitUsage";

interface OrbitInfoCenterProps {
  board: OrbitBoard;
  saving: boolean;
  dirty: boolean;
  syncError: string | null;
  syncNotice: string | null;
  updatedAt: string | null;
  revision: number;
  activeTools: number;
  activePreviews: number;
}

function saveStatus(saving: boolean, dirty: boolean, error: string | null): string {
  if (error) return "Speichern fehlgeschlagen";
  if (saving) return "Speichert";
  if (dirty) return "Änderungen warten auf den Server";
  return "Gespeichert";
}

function usageLines(providers: readonly ProviderUsage[] | undefined): string[] {
  if (!providers) return [];
  return providers.flatMap((provider) => provider.accounts.flatMap((account) => {
    const windows = account.windows.filter((window) => window.windowMinutes === 300 || window.windowMinutes === 10_080 || window.windowMinutes === 43_200);
    if (windows.length === 0) return [];
    const identity = account.email ?? account.label;
    const limits = windows.map((window) => `${window.label} ${window.remainingPercent}% frei · ${formatUsageReset(window.resetsAt)}`).join(" · ");
    return [`${provider.providerName} · ${identity}: ${limits}`];
  }));
}

function usageStatusLines(providers: readonly ProviderUsage[] | undefined): string[] {
  if (!providers?.length) return [orbitUsageEmptyMessage(undefined, { isLoading: false, isError: false })];
  return providers.flatMap((provider) => {
    if (provider.status === "partial" && provider.error) return [`${provider.providerName}: ${provider.error.message}`];
    if (usageLines([provider]).length > 0) return [];
    return [`${provider.providerName}: ${orbitUsageEmptyMessage(provider, { isLoading: false, isError: false })}`];
  });
}

export function OrbitInfoCenter({
  board,
  saving,
  dirty,
  syncError,
  syncNotice,
  updatedAt,
  revision,
  activeTools,
  activePreviews,
}: OrbitInfoCenterProps) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const touchClick = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const performance = useOrbitPerformance(detailsOpen);
  const usage = useQuery({ ...wraptQueries.usage(), enabled: detailsOpen });
  const limits = usageLines(usage.data?.providers);
  const usageStatus = usageStatusLines(usage.data?.providers);
  const saveLabel = saveStatus(saving, dirty, syncError);
  const syncLabel = syncError ? "Gestört" : syncNotice ? "Neuerer Serverstand übernommen" : dirty || saving ? "Läuft asynchron" : "Aktueller Serverstand bestätigt";

  useEffect(() => {
    if (!detailsOpen && !summaryOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setSummaryOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (detailsOpen) setDetailsOpen(false);
      setSummaryOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [detailsOpen, summaryOpen]);

  useEffect(() => {
    if (!detailsOpen) return;
    closeRef.current?.focus();
  }, [detailsOpen]);

  useEffect(() => {
    if (!detailsOpen) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = rootRef.current?.querySelector<HTMLElement>(".orbit-info-dialog");
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? [])
        .filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [detailsOpen]);

  const openDetails = () => {
    setSummaryOpen(false);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className="orbit-info-center" ref={rootRef}>
      <button
        ref={triggerRef}
        className="orbit-info-trigger"
        type="button"
        aria-label="Orbit-Information öffnen"
        aria-expanded={detailsOpen || summaryOpen}
        aria-describedby={!detailsOpen ? "orbit-info-summary" : undefined}
        onPointerDown={(event) => { touchClick.current = event.pointerType === "touch"; }}
        onClick={() => {
          if (touchClick.current) setSummaryOpen((open) => !open);
          else openDetails();
          touchClick.current = false;
        }}
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      {!detailsOpen ? (
        <div id="orbit-info-summary" className={`orbit-info-summary ${summaryOpen ? "is-open" : ""}`} aria-label="Orbit-Kurzinfo">
          <ul>
            <li>Arbeitsfläche: <strong>{board.name}</strong></li>
            <li>{board.nodes.length} Knoten · {board.edges.length} Verbindungen</li>
            <li>{syncError ? "Synchronisierung gestört" : syncNotice ? "Serveränderung übernommen" : saving || dirty ? "Asynchroner Serverabgleich läuft" : "Serverstand bestätigt"}</li>
          </ul>
          <button type="button" onClick={openDetails}>Details ansehen</button>
        </div>
      ) : null}
      {detailsOpen ? (
        <div className="orbit-info-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) closeDetails(); }}>
          <section className="orbit-info-dialog" role="dialog" aria-modal="true" aria-labelledby="orbit-info-title">
            <header className="orbit-info-dialog-header">
              <div><span>Orbit</span><h2 id="orbit-info-title">Arbeitsbereich-Info</h2></div>
              <button ref={closeRef} type="button" className="orbit-info-close" onClick={closeDetails} aria-label="Info schließen"><CloseIcon className="h-4 w-4" /></button>
            </header>
            <div className="orbit-info-dialog-content">
              <section className="orbit-info-section" aria-label="Arbeitsfläche und Synchronisierung">
                <h3>Arbeitsfläche</h3>
                <dl>
                  <div><dt>Name</dt><dd>{board.name}</dd></div>
                  <div><dt>Sync-Modus</dt><dd>Asynchroner Serverabgleich</dd></div>
                  <div><dt>Speicherstatus</dt><dd>{saveLabel}</dd></div>
                  <div><dt>Synchronisierung</dt><dd>{syncLabel}</dd></div>
                  <div><dt>Serverrevision</dt><dd>{revision > 0 ? revision : "Noch nicht bestätigt"}</dd></div>
                  <div><dt>Zuletzt aktualisiert</dt><dd>{updatedAt ? new Date(updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "Nicht verfügbar"}</dd></div>
                  {syncError || syncNotice ? <div className="orbit-info-notice"><dt>Hinweis</dt><dd>{syncError ?? syncNotice}</dd></div> : null}
                </dl>
              </section>
              <section className="orbit-info-section" aria-label="Orbit-Inhalt">
                <h3>Inhalt</h3>
                <dl>
                  <div><dt>Knoten</dt><dd>{board.nodes.length}</dd></div>
                  <div><dt>Verbindungen</dt><dd>{board.edges.length}</dd></div>
                  <div><dt>Zoom</dt><dd>{Math.round(board.viewport.zoom * 100)}%</dd></div>
                  <div><dt>Werkzeuge</dt><dd>{activeTools}</dd></div>
                  <div><dt>Aktive Previews</dt><dd>{activePreviews}</dd></div>
                </dl>
              </section>
              <section className="orbit-info-section" aria-label="Nutzung und Leistung">
                <h3>Nutzung und Leistung</h3>
                {usage.isLoading || usage.isError ? <p className="orbit-info-muted">{orbitUsageEmptyMessage(undefined, usage)}</p> : null}
                {limits.map((line) => <p className="orbit-info-metric" key={line}>{line}</p>)}
                {!usage.isLoading && !usage.isError ? usageStatus.map((line) => <p className="orbit-info-muted" key={line}>{line}</p>) : null}
                <dl>
                  <div><dt>FPS</dt><dd>{performance.fps === null ? "nicht verfügbar" : performance.fps}</dd></div>
                  <div><dt>Lange Aufgaben (letzte Sekunde)</dt><dd>{performance.longTaskMilliseconds === null ? "nicht verfügbar" : `${performance.longTaskMilliseconds} ms`}</dd></div>
                </dl>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

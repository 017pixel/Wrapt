import { useEffect, useState, type ReactNode } from "react";
import "./dashboard-mobile.css";

export interface DashboardSummaryState {
  tone: "ok" | "warn" | "bad";
  label: string;
  detail: string;
}

interface DashboardMobileSummaryProps {
  state: DashboardSummaryState;
  liveLabel: string;
  readinessLabel: string;
}

export function DashboardMobileSummary({ state, liveLabel, readinessLabel }: DashboardMobileSummaryProps) {
  return (
    <section className={`dash-mobile-summary is-${state.tone}`} aria-label="Kompakter Systemstatus">
      <div className="dash-mobile-summary-main">
        <span className="dash-mobile-summary-dot" aria-hidden />
        <div>
          <p>Systemstatus</p>
          <h2>{state.label}</h2>
          <span>{state.detail}</span>
        </div>
      </div>
      <div className="dash-mobile-summary-meta">
        <span>{readinessLabel}</span>
        <span>{liveLabel}</span>
      </div>
    </section>
  );
}

interface DashboardMobileDetailsProps {
  children: ReactNode;
  hasProblem: boolean;
}

function compactViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches;
}

export function DashboardMobileDetails({ children, hasProblem }: DashboardMobileDetailsProps) {
  const [open, setOpen] = useState(() => !compactViewport() || hasProblem);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const sync = () => setOpen(media.matches ? hasProblem : true);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, [hasProblem]);

  return (
    <details className="dash-mobile-details" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span><strong>Statusdetails</strong><small>{hasProblem ? "Warnungen und Fehler prüfen" : "Gesunde Details anzeigen"}</small></span>
      </summary>
      {children}
    </details>
  );
}

import "./dashboard-mobile.css";

export interface DashboardSummaryState {
  tone: "ok" | "warn" | "bad";
  label: string;
  detail: string;
}

interface DashboardMobileSummaryProps {
  state: DashboardSummaryState;
  serverName: string;
  liveLabel: string;
}

export function DashboardMobileSummary({ state, serverName, liveLabel }: DashboardMobileSummaryProps) {
  return (
    <section className={`dash-mobile-summary is-${state.tone}`} aria-label="Dashboard">
      <div className="dash-mobile-summary-main">
        {state.tone !== "ok" ? <span className="dash-mobile-summary-dot" aria-hidden /> : null}
        <div>
          <p>Dashboard</p>
          <h2>{serverName}</h2>
          {state.tone !== "ok" ? <span>{state.label}{state.detail ? ` · ${state.detail}` : ""}</span> : null}
        </div>
      </div>
      <div className="dash-mobile-summary-meta">
        <span>{liveLabel}</span>
      </div>
    </section>
  );
}

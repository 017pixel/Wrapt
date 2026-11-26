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
        <div>
          <h1>Dashboard</h1>
          <p className="dash-mobile-summary-server">{serverName}</p>
          <span aria-live="polite">{state.label}{state.detail ? ` · ${state.detail}` : ""}</span>
        </div>
      </div>
      <div className="dash-mobile-summary-meta">
        <span>{liveLabel}</span>
      </div>
    </section>
  );
}

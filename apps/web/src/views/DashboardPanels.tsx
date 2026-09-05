import type { CSSProperties, ReactNode } from "react";
import { WarningIcon } from "../components/icons";

export function Panel({
  name,
  title,
  subtitle,
  icon,
  meta,
  children,
  className = "",
}: {
  /** Eindeutiger Name für die Übergangsanimation im Bento-Raster. */
  name: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`dash-panel ${className}`}
      style={{ viewTransitionName: `dash-panel-${name}` } as CSSProperties}
    >
      <header className="dash-panel-head">
        <div className="dash-panel-title">
          {icon ? <span className="dash-panel-icon">{icon}</span> : null}
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        {meta ? <div className="dash-panel-meta">{meta}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function PanelError({ message }: { message: string }) {
  return (
    <div className="dash-notice is-bad" role="alert">
      <WarningIcon className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function PanelSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="dash-skeleton" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="dash-skeleton-line" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function queryMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function statusTone(state: string): "default" | "ok" | "warn" | "bad" {
  if (state === "active" || state === "running" || state === "ready") return "ok";
  if (state === "checking" || state === "starting" || state === "degraded" || state === "interrupted") return "warn";
  if (state === "error" || state === "exited" || state === "closed" || state === "failed") return "bad";
  return "default";
}

export function formatDashboardPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : path;
}

import type { CSSProperties, ReactNode } from "react";
import { RefreshIcon, WarningIcon } from "../components/icons";
import { formatRequestId, queryErrorGuide } from "../lib/queryErrorGuide";

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

export function PanelError({ message, error, onRetry }: { message: string; error?: unknown; onRetry?: () => void }) {
  const guide = error === undefined ? null : queryErrorGuide(error, message);
  const requestZeile = guide ? formatRequestId(guide.requestId) : null;
  return (
    <div className="dash-notice is-bad" role="alert">
      <WarningIcon className="h-4 w-4 shrink-0" />
      <span>
        {guide ? <><strong>{guide.titel}: </strong>{guide.ursache} {guide.aktion} {guide.docsHinweis ? `${guide.docsHinweis} ` : ""}{requestZeile ?? ""}</> : message}
      </span>
      {onRetry ? <button type="button" className="quiet-button min-h-11 px-4" onClick={onRetry}><RefreshIcon className="h-4 w-4" /> Erneut versuchen</button> : null}
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
  return queryErrorGuide(error, fallback).ursache;
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

import type { ReactNode } from "react";
import { RefreshIcon } from "./icons";
import { formatRequestId, queryErrorGuide } from "../lib/queryErrorGuide";

interface QueryBoundaryProps<T> {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  data?: T;
  loadingLabel?: string;
  refetch?: () => unknown;
  children: (data: Exclude<T, undefined>) => ReactNode;
}

export function QueryBoundary<T>({
  isLoading,
  isError,
  error,
  data,
  loadingLabel = "Lädt…",
  refetch,
  children,
}: QueryBoundaryProps<T>) {
  if (isLoading && data === undefined) {
    return (
      <div className="query-skeleton" role="status" aria-live="polite" aria-label={loadingLabel}>
        <span className="query-skeleton-title" />
        <span />
        <span />
        <span className="query-skeleton-short" />
        <span className="sr-only">{loadingLabel}</span>
      </div>
    );
  }
  if (isError) {
    const guide = queryErrorGuide(error, "Daten konnten nicht geladen werden.");
    const requestZeile = formatRequestId(guide.requestId);
    return (
      <div className="query-error" role="alert">
        <div>
          <strong>{guide.titel}</strong>
          <span>{guide.ursache}</span>
          <span>{guide.aktion}</span>
          {guide.docsHinweis ? <span>{guide.docsHinweis}</span> : null}
          {requestZeile ? <span>{requestZeile}</span> : null}
        </div>
        {refetch ? <button type="button" className="quiet-button min-h-11 px-4" onClick={() => void refetch()}><RefreshIcon className="h-4 w-4" /> Erneut versuchen</button> : null}
      </div>
    );
  }
  if (data === undefined) {
    return (
      <div className="flex flex-wrap items-center gap-3 px-1 py-6 text-sm text-faint" role="status">
        <span>Keine Daten verfügbar.</span>
        {refetch ? <button type="button" className="quiet-button min-h-11 px-4" onClick={() => void refetch()}><RefreshIcon className="h-4 w-4" /> Erneut versuchen</button> : null}
      </div>
    );
  }
  return <>{children(data as Exclude<T, undefined>)}</>;
}

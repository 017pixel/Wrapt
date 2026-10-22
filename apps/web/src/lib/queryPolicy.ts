import { ApiClientError } from "./apiClient/transport";

export function retryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export const queryRetryDelay = (attempt: number) => Math.min(1_000 * 2 ** attempt, 30_000);

/** Autorisierungsfehler brauchen eine bewusste Aktion; Ausfälle werden seltener geprüft. */
export function queryPollingInterval(milliseconds: number) {
  return (query: { state: { error: Error | null; fetchFailureCount: number } }): number | false => {
    const { error, fetchFailureCount } = query.state;
    if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) return false;
    return error ? Math.min(milliseconds * 2 ** Math.min(fetchFailureCount, 5), 300_000) : milliseconds;
  };
}

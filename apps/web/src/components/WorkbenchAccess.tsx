import { useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { wraptQueries } from "../lib/queryOptions";
import { workbenchAccess } from "../lib/workbenchAccess";
import { QueryBoundary } from "./QueryBoundary";

/** Vor dem Start der Hintergrunddienste einmal den geschützten Zugriff prüfen. */
export function WorkbenchAccess({ children }: { children: ReactNode }) {
  const denied = useSyncExternalStore(workbenchAccess.subscribe, workbenchAccess.getSnapshot);
  const client = useQueryClient();
  const access = useQuery({ ...wraptQueries.projects(), enabled: denied === null, staleTime: Infinity });

  if (denied) {
    return <main className="page-scroll"><div className="page-frame max-w-xl space-y-4 py-8" role="alert">
      <h1 className="section-title">Zugriff auf Wrapt erforderlich</h1>
      <p className="text-muted">Öffne Wrapt über die freigegebene Tailscale-Adresse. Dein Tailscale-Konto muss für diese Workbench freigeschaltet sein.</p>
      <button type="button" className="quiet-button-primary min-h-11" onClick={() => {
        workbenchAccess.reset();
        void client.invalidateQueries();
      }}>Zugriff erneut prüfen</button>
    </div></main>;
  }
  return <QueryBoundary isLoading={access.isPending} isError={access.isError} error={access.error} data={access.data} refetch={access.refetch} loadingLabel="Zugriff wird geprüft…">
    {() => children}
  </QueryBoundary>;
}

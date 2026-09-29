import { useQuery } from "@tanstack/react-query";
import { WarningIcon } from "./icons";
import { wraptQueries } from "../lib/queryOptions";

interface ToolPanelProjectAssociationProps {
  panelId: string;
  projectId: string | null;
  active: boolean;
  standalone: boolean;
}

export function ToolPanelProjectAssociation({ panelId, projectId, active, standalone }: ToolPanelProjectAssociationProps) {
  const projectLookup = useQuery({ ...wraptQueries.projects(), enabled: active });

  if (projectLookup.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="status">
        <WarningIcon className="h-6 w-6 text-warn" />
        <p className="text-sm text-muted">Die Projektliste konnte nicht geladen werden.</p>
        <button type="button" className="quiet-button-primary" onClick={() => void projectLookup.refetch()}>Erneut versuchen</button>
      </div>
    );
  }
  if (!projectLookup.isSuccess) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-faint">Projektdaten werden geladen…</div>;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <WarningIcon className="h-6 w-6 text-warn" />
      <div className="space-y-1">
        <strong className="text-sm text-text">Projektzuordnung fehlt</strong>
        <p className="text-sm text-muted">
          {projectId ? "Das gespeicherte Projekt ist nicht mehr verfügbar." : "Dieses Werkzeug braucht ein zugeordnetes Projekt."}
          {standalone ? "" : " Wähle ein Projekt in den Knoteneigenschaften."}
        </p>
      </div>
      {!standalone ? <button
        type="button"
        className="quiet-button-primary"
        onClick={() => window.dispatchEvent(new CustomEvent("orbit:open-tool-project-settings", { detail: { runtimeId: panelId } }))}
      >Projekt im Orbit auswählen</button> : null}
    </div>
  );
}

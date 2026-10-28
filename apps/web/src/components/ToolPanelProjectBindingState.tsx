import { Link } from "react-router";
import { WarningIcon } from "./icons";

interface ToolPanelProjectBindingStateProps {
  projectLookupFailed: boolean;
  projectAssociationMissing: boolean;
  projectId: string | null;
  onRetry: () => void;
}

export function ToolPanelProjectBindingState({
  projectLookupFailed,
  projectAssociationMissing,
  projectId,
  onRetry,
}: ToolPanelProjectBindingStateProps) {
  if (projectLookupFailed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="status">
        <WarningIcon className="h-6 w-6 text-warn" />
        <p className="text-sm text-muted">Die Projektliste konnte nicht geladen werden.</p>
        <button type="button" className="quiet-button-primary" onClick={onRetry}>Erneut versuchen</button>
      </div>
    );
  }
  if (!projectAssociationMissing) return null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <WarningIcon className="h-6 w-6 text-warn" />
      <div className="space-y-1">
        <strong className="text-sm text-text">Projektzuordnung fehlt</strong>
        <p className="text-sm text-muted">
          {projectId ? "Das gespeicherte Projekt ist nicht mehr verfügbar." : "Dieses Werkzeug braucht ein zugeordnetes Projekt."}
        </p>
      </div>
      <Link className="quiet-button-primary" to="/projects">Projekt auswählen</Link>
    </div>
  );
}

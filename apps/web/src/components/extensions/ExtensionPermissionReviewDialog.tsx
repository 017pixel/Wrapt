import type {
  ExtensionPermissionId,
  ExtensionPermissionRequest,
  ExtensionRegistrySummary,
} from "@wrapt/extension-contracts";
import { CheckIcon, CloseIcon } from "../icons";
import { Badge } from "../primitives";

const permissionLabels: Record<ExtensionPermissionId, string> = {
  "projects.read": "Projekte lesen",
  "projects.write": "Projekte ändern",
  "files.read": "Dateien lesen",
  "files.write": "Dateien ändern",
  "git.read": "Git lesen",
  "git.write": "Git ändern",
  "terminal.create": "Terminals öffnen",
  "terminal.input": "Terminal-Eingaben senden",
  "process.execute": "Prozesse ausführen",
  "network.fetch": "Netzwerkzugriff",
  "notifications.create": "Benachrichtigungen senden",
  "browser.control": "Browser steuern",
  "preview.read": "Previews lesen",
  "preview.manage": "Previews verwalten",
  "agents.invoke": "Agenten aufrufen",
  "agents.tools.register": "Agenten-Werkzeuge registrieren",
  "agents.skills.register": "Agenten-Skills registrieren",
  "storage.read": "Speicher lesen",
  "storage.write": "Speicher ändern",
  "secrets.request": "Secrets anfordern",
  "system.metrics.read": "System-Metriken lesen",
  "system.services.read": "Dienste lesen",
  "system.services.control": "Dienste steuern",
};

function permissionRequestLabel(request: ExtensionPermissionRequest): string {
  const base = permissionLabels[request.permission] ?? request.permission;
  const details = Object.entries(request)
    .filter(([key, value]) => key !== "permission" && value !== undefined && value !== null)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key, value]) => `${key}: ${value}`);
  return details.length > 0 ? `${base} (${details.join(", ")})` : base;
}

export function ExtensionPermissionReviewDialog({
  extension,
  onClose,
  onResolve,
}: {
  extension: ExtensionRegistrySummary;
  onClose: () => void;
  onResolve: (resolution: { decision: "approve"; grants: ExtensionPermissionRequest[] } | { decision: "deny" }) => void;
}) {
  const review = extension.permissionReview;
  if (review === undefined) return null;
  const reasonLabel = review.reason === "install" ? "Installation" : "Update";
  return (
    <div className="extension-review-overlay" role="dialog" aria-modal="true" aria-label={`Berechtigungen für ${extension.name}`}>
      <div className="extension-review-panel">
        <header className="extension-review-header">
          <div>
            <h3>Berechtigungen für „{extension.name}"</h3>
            <p>Die {reasonLabel} fordert neue Zugriffe an. Ohne Freigabe bleibt die Extension inaktiv.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Schließen" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>
        <ul className="extension-review-permissions">
          {review.addedPermissions.map((request) => (
            <li key={JSON.stringify(request)}>
              <span>{permissionRequestLabel(request)}</span>
              <Badge tone={request.permission === "process.execute" || request.permission === "browser.control" || request.permission === "secrets.request" || request.permission === "system.services.control" ? "bad" : "warn"}>
                {request.permission}
              </Badge>
            </li>
          ))}
        </ul>
        <footer className="extension-review-actions">
          <button type="button" className="quiet-button" onClick={() => onResolve({ decision: "deny" })}>
            <CloseIcon className="h-3.5 w-3.5" /> Ablehnen
          </button>
          <button type="button" className="quiet-button-primary" onClick={() => onResolve({ decision: "approve", grants: review.addedPermissions })}>
            <CheckIcon className="h-3.5 w-3.5" /> Alle freigeben
          </button>
        </footer>
      </div>
    </div>
  );
}

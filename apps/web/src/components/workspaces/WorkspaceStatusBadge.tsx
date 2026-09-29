import { workspaceStatusLabels, type WorkspaceStatus } from "./workspaceStatus";

export function WorkspaceStatusBadge({ status }: { status: WorkspaceStatus }) {
  return (
    <span
      className={`workspace-status-indicator is-${status}`}
      role="img"
      aria-label={workspaceStatusLabels[status]}
      title={workspaceStatusLabels[status]}
    >
      <span className="workspace-status-dot" aria-hidden="true" />
    </span>
  );
}

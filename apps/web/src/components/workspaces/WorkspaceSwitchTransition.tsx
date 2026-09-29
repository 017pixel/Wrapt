import { createPortal } from "react-dom";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

export function WorkspaceSwitchTransition() {
  const switching = useWorkspaceRegistry((state) => state.switchingWorkspace);

  if (!switching || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="workspace-switch-overlay"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "workspace-switch-fade") {
          window.location.assign(switching.href);
        }
      }}
      role="status"
      aria-live="polite"
    >
      <div><WorkspaceStatusBadge status="live" /><strong>Öffne {switching.name}</strong></div>
    </div>,
    document.body,
  );
}

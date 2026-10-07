import { ChevronRightIcon } from "../icons";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";

/** Zeigt den aktiven Server als erstes Breadcrumb-Element — nur bei mehr als einem Workspace. */
export function WorkspaceBreadcrumb() {
  const entries = useWorkspaceRegistry((state) => state.entries);
  const selfUrl = useWorkspaceRegistry((state) => state.selfUrl);

  if (entries.length < 2) return null;
  const active = entries.find((entry) => entry.url === selfUrl) ?? null;
  const name = active?.name.trim() ? active.name.trim() : null;
  if (!name) return null;

  return (
    <>
      <span
        className="page-crumb-server shell-desktop-only"
        title={`Aktueller Server: ${name}`}
        aria-label={`Aktueller Server: ${name}`}
      >
        {name}
      </span>
      <ChevronRightIcon className="page-crumb-separator shell-desktop-only" aria-hidden />
    </>
  );
}

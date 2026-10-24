import { EditIcon, FolderIcon } from "../../icons";
import { HermesV2SidebarMenu } from "./HermesV2SidebarMenu";
import type { SidebarProjectChoice } from "./sidebar-types";

export interface HermesV2SidebarToolsProps {
  /** Projektzuordnungen aller geladenen Zeilen, auch wenn ein Filter steht. */
  projects: readonly SidebarProjectChoice[];
  projectId: string | null;
  onProjectChange: (projectId: string | null) => void;
  onCreate: () => void;
}

const ALL_PROJECTS = { id: "", label: "Alle Projekte" };

/**
 * Werkzeugreihe der Suchzeile: Projekt wählen und neuen Chat starten. Der
 * neue Chat bleibt der einzige Weg für eine neue Sitzung.
 */
export function HermesV2SidebarTools({
  projects,
  projectId,
  onProjectChange,
  onCreate,
}: HermesV2SidebarToolsProps) {
  const projectLabel =
    projectId === null
      ? ALL_PROJECTS.label
      : (projects.find((entry) => entry.id === projectId)?.label ??
        ALL_PROJECTS.label);
  return (
    <div className="hermesv2-sidebar-tools">
      <HermesV2SidebarMenu
        label="Projekt"
        options={[ALL_PROJECTS, ...projects]}
        value={projectId ?? ""}
        onSelect={(value) => onProjectChange(value === "" ? null : value)}
        hint={projectLabel}
        icon={
          <FolderIcon className="h-4 w-4" aria-hidden style={{ color: "currentColor" }} />
        }
      />
      <button
        type="button"
        className="icon-button hermesv2-new-session"
        aria-label="Neuer Chat"
        title="Neuer Chat"
        onClick={onCreate}
      >
        <EditIcon className="h-4 w-4" aria-hidden style={{ color: "currentColor" }} />
      </button>
    </div>
  );
}

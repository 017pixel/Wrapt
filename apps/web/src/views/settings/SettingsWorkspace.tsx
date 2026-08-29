import { useState } from "react";
import { WRAPT_LIMITS } from "@wrapt/contracts";
import { TrashIcon } from "../../components/icons";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ModalDialog";
import { useWorkspaceStore, WORKSPACE_STORAGE_KEY } from "../../stores/workspace";

export function SettingsWorkspace() {
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace);
  const panelCount = useWorkspaceStore((state) => state.panels.length);
  const workspaceCount = useWorkspaceStore((state) => state.workspaces.length);
  const [resetOpen, setResetOpen] = useState(false);
  return (
    <div id="settings-workspace">
      <Card title="Workspace" subtitle="Lokaler, persistenter Zustand">
        <div className="space-y-3 text-[13px]">
          <div className="data-row px-0">
            <span className="text-muted">Geöffnete Panels</span>
            <span className="font-mono text-text">{panelCount} / {WRAPT_LIMITS.maxResidentTools}</span>
          </div>
          <div className="data-row px-0">
            <span className="text-muted">Arbeitsflächen</span>
            <span className="font-mono text-text">{workspaceCount} / {WRAPT_LIMITS.maxWorkspaces}</span>
          </div>
          <div className="data-row px-0">
            <span className="text-muted">Speicherort</span>
            <span className="font-mono text-[12px] text-faint">{WORKSPACE_STORAGE_KEY}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="quiet-button border-bad/30 bg-bad-soft/40 text-bad hover:bg-bad-soft"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Workspace zurücksetzen
          </button>
        </div>
      </Card>
      <ConfirmDialog
        open={resetOpen}
        title="Workspace zurücksetzen?"
        description="Alle geöffneten Panels, Arbeitsflächen und Auswahlen werden lokal gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Workspace zurücksetzen"
        danger
        onConfirm={() => {
          resetWorkspace();
          setResetOpen(false);
        }}
        onClose={() => setResetOpen(false)}
      />
    </div>
  );
}

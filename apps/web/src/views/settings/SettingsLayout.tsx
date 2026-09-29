import { useState } from "react";
import { WRAPT_LIMITS } from "@wrapt/contracts";
import { TrashIcon } from "../../components/icons";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ModalDialog";
import { useLayoutStore, LAYOUT_STORAGE_KEY } from "../../stores/layout";

export function SettingsLayout() {
  const resetLayout = useLayoutStore((state) => state.resetLayout);
  const panelCount = useLayoutStore((state) => state.panels.length);
  const pageCount = useLayoutStore((state) => state.pages.length);
  const [resetOpen, setResetOpen] = useState(false);
  return (
    <div id="settings-layout">
      <Card title="Layout" subtitle="Lokaler, persistenter Zustand">
        <div className="space-y-3 text-[13px]">
          <div className="data-row px-0">
            <span className="text-muted">Geöffnete Panels</span>
            <span className="font-mono text-text">{panelCount} / {WRAPT_LIMITS.maxResidentTools}</span>
          </div>
          <div className="data-row px-0">
            <span className="text-muted">Arbeitsflächen</span>
            <span className="font-mono text-text">{pageCount} / {WRAPT_LIMITS.maxLayoutPages}</span>
          </div>
          <div className="data-row px-0">
            <span className="text-muted">Speicherort</span>
            <span className="font-mono text-[12px] text-faint">{LAYOUT_STORAGE_KEY}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="quiet-button border-bad/30 bg-bad-soft/40 text-bad hover:bg-bad-soft"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Layout zurücksetzen
          </button>
        </div>
      </Card>
      <ConfirmDialog
        open={resetOpen}
        title="Layout zurücksetzen?"
        description="Alle geöffneten Panels, Arbeitsflächen und Auswahlen dieses Browsers werden zurückgesetzt. Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Layout zurücksetzen"
        danger
        onConfirm={() => {
          resetLayout();
          setResetOpen(false);
        }}
        onClose={() => setResetOpen(false)}
      />
    </div>
  );
}

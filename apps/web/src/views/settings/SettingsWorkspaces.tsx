import { Card } from "../../components/Card";
import { WorkspaceRegistryView } from "../../components/workspaces/WorkspaceRegistryView";

export function SettingsWorkspaces() {
  return (
    <div id="settings-workspaces">
      <Card title="Workspaces" subtitle="Verbundene Wrapt-Instanzen">
        <p className="settings-section-note">
          Layout und Darstellung liegen jeweils in der verbundenen Instanz und werden nicht übertragen. Die Verbindungsliste bleibt browserlokal und wird beim Wechsel per URL-Fragment mitgenommen.
        </p>
        <WorkspaceRegistryView />
      </Card>
    </div>
  );
}

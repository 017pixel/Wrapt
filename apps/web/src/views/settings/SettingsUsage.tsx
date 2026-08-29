import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UsageMonitoring, UsageProviderId } from "@wrapt/contracts";
import { Card } from "../../components/Card";
import { NutzungIcon } from "../../components/icons";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";

const usageMonitoringLabels: Record<UsageProviderId, string> = {
  codex: "Codex",
  opencode: "OpenCode Go",
  claude: "Claude Code",
};
const usageMonitoringOrder: UsageProviderId[] = ["opencode", "codex", "claude"];

export function SettingsUsage() {
  return (
    <div id="settings-usage">
      <Card
        title="Limitüberwachung"
        subtitle="Limits je Werkzeug erfassen oder pauschal deaktivieren"
        action={<NutzungIcon className="h-4 w-4 text-faint" />}
      >
        <UsageControls />
      </Card>
    </div>
  );
}

function UsageControls() {
  const queryClient = useQueryClient();
  const monitoring = useQuery(wraptQueries.usageMonitoring());
  const resetHistory = useQuery(wraptQueries.codexResetHistorySettings());
  const [saving, setSaving] = useState(false);
  const [resetHistorySaving, setResetHistorySaving] = useState(false);
  const [message, setMessage] = useState("");
  const current = monitoring.data?.monitoring;
  const resetHistoryEnabled = resetHistory.data?.settings.enabled ?? false;

  const save = async (next: UsageMonitoring) => {
    setSaving(true);
    setMessage("");
    try {
      const response = await apiClient.saveUsageMonitoring(next);
      if (response) queryClient.setQueryData(wraptQueries.usageMonitoring().queryKey, response);
      setMessage("Die Limitüberwachung wurde gespeichert.");
      void queryClient.invalidateQueries({ queryKey: ["usage"] });
    } catch {
      setMessage("Die Limitüberwachung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const saveResetHistory = async (enabled: boolean) => {
    setResetHistorySaving(true);
    setMessage("");
    try {
      const response = await apiClient.saveCodexResetHistorySettings({ enabled });
      if (response) queryClient.setQueryData(wraptQueries.codexResetHistorySettings().queryKey, response);
      void queryClient.invalidateQueries({ queryKey: ["system", "codex-reset-history"] });
      setMessage("Die Codex-Reset-Historie wurde gespeichert.");
    } catch {
      setMessage("Die Codex-Reset-Historie konnte nicht gespeichert werden.");
    } finally {
      setResetHistorySaving(false);
    }
  };

  if (!current || !resetHistory.data) return <div className="settings-notification-skeleton"><span /><span /><span /></div>;
  return (
    <div className="notification-settings">
      <p className="settings-section-note">
        Ausgeschaltete Werkzeuge werden nicht mehr auf ihre Limits abgefragt. Die Nutzungshistorie bleibt davon unberührt.
      </p>
      {usageMonitoringOrder.map((provider) => (
        <button
          key={provider}
          type="button"
          className="settings-toggle-row"
          disabled={saving}
          onClick={() => void save({ ...current, [provider]: !current[provider] })}
        >
          <span>
            <strong>{usageMonitoringLabels[provider]}</strong>
            <small>Limitfenster, Prognosen und Warnungen für {usageMonitoringLabels[provider]}</small>
          </span>
          <span
            className={`settings-toggle-switch ${current[provider] ? "is-on" : ""}`}
            role="switch"
            aria-checked={current[provider]}
            aria-label={`Limitüberwachung ${usageMonitoringLabels[provider]}`}
          >
            <span className="settings-toggle-thumb" />
          </span>
        </button>
      ))}
      <div className="settings-subsection">
        <p className="settings-section-note">
          Optionale globale Reset-Ankündigungen von codex-resets.com. Es werden keine Codex-Zugangsdaten übertragen.
        </p>
        <button
          type="button"
          className="settings-toggle-row"
          disabled={saving || resetHistorySaving}
          onClick={() => void saveResetHistory(!resetHistoryEnabled)}
        >
          <span>
            <strong>Tibo-Reset-Historie</strong>
            <small>Letzte globale Codex-Resets in der Nutzungsübersicht anzeigen</small>
          </span>
          <span
            className={`settings-toggle-switch ${resetHistoryEnabled ? "is-on" : ""}`}
            role="switch"
            aria-checked={resetHistoryEnabled}
            aria-label="Tibo-Reset-Historie"
          >
            <span className="settings-toggle-thumb" />
          </span>
        </button>
      </div>
      {message ? <p className="text-[12px] text-muted" role="status">{message}</p> : null}
    </div>
  );
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SharedConfigSettingKey } from "@wrapt/contracts";
import { createSettingsSync } from "../lib/settingsSync/engine";
import { useSettingsSyncStatus } from "../lib/settingsSync/status";

const queryKeysByConfig: Record<SharedConfigSettingKey, readonly unknown[][]> = {
  appearance: [["system", "appearance"]],
  contextMenu: [["system", "context-menu"]],
  mascot: [["system", "mascot"]],
  notificationPreferences: [["notifications", "settings"]],
  t3Channel: [["system", "t3-channel"]],
  usageMonitoring: [["system", "usage-monitoring"]],
  codexResetHistory: [["system", "codex-reset-history"], ["system", "codex-reset-history", "settings"]],
};

/**
 * Startet den Einstellungsabgleich und hält serverweite Config-Werte aktuell,
 * sobald ein anderer Client sie ändert.
 */
export function SettingsSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = createSettingsSync({
      onSharedConfigChanged(keys) {
        for (const key of keys) {
          for (const queryKey of queryKeysByConfig[key]) {
            void queryClient.invalidateQueries({ queryKey });
          }
        }
      },
      onSyncError: (message) => useSettingsSyncStatus.getState().setError(message),
    });
    useSettingsSyncStatus.getState().setRetry(() => sync.retry());
    sync.start();
    return () => {
      sync.stop();
      useSettingsSyncStatus.getState().setRetry(null);
      useSettingsSyncStatus.getState().setError(null);
    };
  }, [queryClient]);

  return null;
}

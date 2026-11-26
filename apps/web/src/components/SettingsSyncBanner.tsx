import { useSettingsSyncStatus } from "../lib/settingsSync/status";
import { WarningIcon } from "./icons";

/** Zeigt abgelehnte Einstellungen und erlaubt einen bewussten neuen Versuch. */
export function SettingsSyncBanner() {
  const error = useSettingsSyncStatus((state) => state.error);
  const requestRetry = useSettingsSyncStatus((state) => state.requestRetry);
  if (!error) return null;
  return <div className="file-manager-alert is-sync has-actions" role="alert">
    <WarningIcon className="h-3.5 w-3.5" />
    <span>{error}</span>
    <button type="button" onClick={requestRetry}>Erneut versuchen</button>
  </div>;
}

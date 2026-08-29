import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPreferences, NotificationSource } from "@wrapt/contracts";
import { Badge } from "../../components/primitives";
import { Card } from "../../components/Card";
import { InboxIcon } from "../../components/icons";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { useWebPushDevice } from "../../lib/useWebPushDevice";
import type { WebPushDeviceStatus } from "../../lib/webPushDevice";

const notificationSourceLabels: Record<NotificationSource, string> = {
  hermes: "Hermes",
  t3: "T3 Code",
  opencode: "OpenCode",
  codex: "Codex",
  claude: "Claude Code",
  terminal: "Terminal",
  wrapt: "Wrapt",
  workbench: "Legacy Workbench",
  update: "Updates",
};

const pushDeviceStatus: Record<WebPushDeviceStatus, { label: string; tone: "default" | "ok" | "warn" | "bad" | "accent" }> = {
  checking: { label: "Wird geprüft", tone: "default" },
  unsupported: { label: "Nicht unterstützt", tone: "default" },
  "ipad-install-required": { label: "Erst installieren", tone: "warn" },
  "service-worker-error": { label: "Nicht bereit", tone: "warn" },
  "permission-default": { label: "Nicht aktiviert", tone: "default" },
  "permission-denied": { label: "Blockiert", tone: "bad" },
  inactive: { label: "Nicht aktiviert", tone: "default" },
  "inactive-server-error": { label: "Lokal deaktiviert", tone: "warn" },
  "active-synced": { label: "Aktiv", tone: "ok" },
  "active-unsynced": { label: "Nicht synchronisiert", tone: "warn" },
};

export function SettingsNotifications() {
  return (
    <div id="settings-notifications">
      <Card
        title="Benachrichtigungen"
        subtitle="Toasts und System-Benachrichtigungen pro Quelle"
        action={<InboxIcon className="h-4 w-4 text-faint" />}
      >
        <NotificationControls />
      </Card>
    </div>
  );
}

function NotificationControls() {
  const queryClient = useQueryClient();
  const settings = useQuery(wraptQueries.notificationSettings());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const preferences = settings.data?.preferences;
  const pushDevice = useWebPushDevice(settings.data);

  const save = async (next: NotificationPreferences) => {
    setSaving(true);
    setMessage("");
    try {
      const response = await apiClient.saveNotificationSettings(next);
      if (response) queryClient.setQueryData(wraptQueries.notificationSettings().queryKey, response);
    } catch {
      setMessage("Die Benachrichtigungseinstellungen konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  if (!preferences) return <div className="settings-notification-skeleton"><span /><span /><span /></div>;
  const deviceMeta = pushDeviceStatus[pushDevice.device.status];
  const deviceActive = pushDevice.device.endpoint !== null;
  const canActivate = !["checking", "unsupported", "ipad-install-required", "permission-denied", "service-worker-error", "active-synced"].includes(pushDevice.device.status);

  return (
    <div className="notification-settings">
      <button
        type="button"
        className="settings-toggle-row"
        disabled={saving}
        onClick={() => void save({ ...preferences, toastsEnabled: !preferences.toastsEnabled })}
      >
        <span>
          <strong>Toasts</strong>
          <small>Wichtige Ereignisse kurz oben rechts anzeigen</small>
        </span>
        <span
          className={`settings-toggle-switch ${preferences.toastsEnabled ? "is-on" : ""}`}
          role="switch"
          aria-checked={preferences.toastsEnabled}
        >
          <span className="settings-toggle-thumb" />
        </span>
      </button>
      <section className="push-device-settings" aria-labelledby="push-device-title">
        <header>
          <div>
            <strong id="push-device-title">System-Benachrichtigungen auf diesem Gerät</strong>
            <small>Lokales Abo, unabhängig von deinen anderen Geräten</small>
          </div>
          <Badge tone={deviceMeta.tone}>{deviceMeta.label}</Badge>
        </header>
        <p>{pushDevice.device.message}</p>
        <div className="push-device-actions">
          {canActivate ? (
            <button
              type="button"
              className="quiet-button-primary"
              disabled={pushDevice.working}
              onClick={() => void pushDevice.activate().then(() => settings.refetch())}
            >
              Auf diesem Gerät aktivieren
            </button>
          ) : null}
          {deviceActive ? (
            <button
              type="button"
              className="quiet-button"
              disabled={pushDevice.working}
              onClick={() => void pushDevice.deactivate().then(() => settings.refetch())}
            >
              Auf diesem Gerät deaktivieren
            </button>
          ) : null}
          <button
            type="button"
            className="quiet-button"
            disabled={pushDevice.working || pushDevice.device.status !== "active-synced"}
            onClick={() => void pushDevice.test()}
          >
            Testbenachrichtigung an dieses Gerät senden
          </button>
        </div>
        <small className="push-device-count">
          Für deine Wrapt-Identität registriert: {settings.data?.subscriptionCount ?? 0}{" "}
          {settings.data?.subscriptionCount === 1 ? "Gerät" : "Geräte"}
        </small>
        {pushDevice.actionMessage ? <p className="push-device-feedback" role="status">{pushDevice.actionMessage}</p> : null}
      </section>
      <button
        type="button"
        className="settings-toggle-row"
        disabled={saving}
        onClick={() => void save({ ...preferences, pushEnabled: !preferences.pushEnabled })}
      >
        <span>
          <strong>Server-Push für wichtige Ereignisse</strong>
          <small>Globaler Master-Schalter, verändert keine Geräte-Abos</small>
        </span>
        <span
          className={`settings-toggle-switch ${preferences.pushEnabled ? "is-on" : ""}`}
          role="switch"
          aria-checked={preferences.pushEnabled}
        >
          <span className="settings-toggle-thumb" />
        </span>
      </button>
      <div className="notification-source-settings">
        <header>
          <span>Quelle</span>
          <span>Toast</span>
          <span>Push</span>
        </header>
        {(Object.keys(preferences.sources) as NotificationSource[]).map((source) => (
          <div key={source}>
            <strong>{notificationSourceLabels[source]}</strong>
            {(["toast", "push"] as const).map((channel) => (
              <button
                key={channel}
                type="button"
                disabled={saving || (channel === "push" && !preferences.pushEnabled)}
                onClick={() => void save({
                  ...preferences,
                  sources: {
                    ...preferences.sources,
                    [source]: {
                      ...preferences.sources[source],
                      [channel]: !preferences.sources[source][channel],
                    },
                  },
                })}
                aria-label={`${notificationSourceLabels[source]} ${channel}`}
              >
                <span
                  className={`settings-toggle-switch is-compact ${preferences.sources[source][channel] ? "is-on" : ""}`}
                  role="switch"
                  aria-checked={preferences.sources[source][channel]}
                >
                  <span className="settings-toggle-thumb" />
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {message ? <p className="text-[12px] text-muted" role="status">{message}</p> : null}
    </div>
  );
}

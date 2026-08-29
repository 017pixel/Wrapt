import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { T3Channel } from "@wrapt/contracts";
import { Badge } from "../../components/primitives";
import { Card } from "../../components/Card";
import {
  InfoIcon,
  LoaderIcon,
  RefreshIcon,
  RocketIcon,
  ShieldIcon,
  UploadIcon,
  WarningIcon,
} from "../../components/icons";
import { ConfirmDialog } from "../../components/ModalDialog";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { SystemRestartControls } from "../../components/SystemRestartControls";

const t3ChannelLabels: Record<T3Channel, string> = {
  stable: "Stable",
  nightly: "Nightly",
};
const t3ChannelHints: Record<T3Channel, string> = {
  stable: "Geprüfte Veröffentlichung (t3@latest)",
  nightly: "Täglicher Vorabbau (t3@nightly)",
};
const t3Channels: T3Channel[] = ["stable", "nightly"];

export function SettingsSystem({ onJumpToRestart }: { onJumpToRestart: () => void }) {
  return (
    <div id="settings-system">
      <div id="restart-controls">
        <span id="settings-system-restart" className="settings-anchor-alias" aria-hidden="true" />
        <Card
          title="Dienst neu starten"
          subtitle="Nach Code-Änderungen neu bauen und laden, ohne Datenverlust"
          action={<RefreshIcon className="h-4 w-4 text-faint" />}
        >
          <SystemRestartControls />
        </Card>
      </div>
      <div id="settings-system-t3">
        <Card
          title="T3 Code Kanal"
          subtitle="Stable oder Nightly für alle T3-Flächen"
          action={<RocketIcon className="h-4 w-4 text-faint" />}
        >
          <T3ChannelControls onJumpToRestart={onJumpToRestart} />
        </Card>
      </div>
      <Card
        title="Sicherheit"
        subtitle="Keine eigene Anmeldung"
        action={<ShieldIcon className="h-4 w-4 text-faint" />}
      >
        <ul className="space-y-2 text-[13px] text-muted">
          <li className="flex items-start gap-2">
            <InfoIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
            Der Zugriff wird über Tailscale und ACLs begrenzt. T3 Code und Code-Server behalten ihre eigene Authentifizierung.
          </li>
          <li className="flex items-start gap-2">
            <InfoIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
            Es werden keine Tokens, Cookies oder Zugangsdaten im Browserzustand gespeichert.
          </li>
          <li className="flex items-start gap-2">
            <InfoIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
            Terminals starten ausschließlich serverseitig freigegebene Shell-, Agent- und Anmeldeprozesse.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function T3ChannelControls({ onJumpToRestart }: { onJumpToRestart: () => void }) {
  const queryClient = useQueryClient();
  const channel = useQuery(wraptQueries.t3Channel());
  const [saving, setSaving] = useState<T3Channel | null>(null);
  const [error, setError] = useState("");
  const [pendingDowngrade, setPendingDowngrade] = useState(false);
  const status = channel.data;

  async function selectChannel(next: T3Channel) {
    if (saving !== null || status?.configuredChannel === next) return;
    if (
      next === "stable"
      && (status?.activeChannel === "nightly" || status?.configuredChannel === "nightly")
    ) {
      setPendingDowngrade(true);
      return;
    }
    await saveChannel(next);
  }

  async function saveChannel(next: T3Channel) {
    if (saving !== null) return;
    setSaving(next);
    setError("");
    try {
      const updated = await apiClient.setT3Channel(next);
      if (updated) queryClient.setQueryData(wraptQueries.t3Channel().queryKey, updated);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Der Kanal konnte nicht gespeichert werden.");
      void channel.refetch();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="settings-segment" role="group" aria-label="T3 Code Kanal">
        {t3Channels.map((option) => {
          const selected = status?.configuredChannel === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              disabled={saving !== null || status === undefined}
              onClick={() => void selectChannel(option)}
              className={`settings-segment-option ${selected ? "is-selected" : ""}`}
            >
              <span className="flex items-center gap-2 font-medium text-text">
                {saving === option ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : null}
                {t3ChannelLabels[option]}
              </span>
              <span className="text-[11px] text-faint">{t3ChannelHints[option]}</span>
            </button>
          );
        })}
      </div>
      <div className="space-y-3 text-[13px]">
        <div className="data-row px-0">
          <span className="text-muted">Aktiv installiert</span>
          <span className="font-mono text-text">
            {status === undefined
              ? "—"
              : status.activeChannel === null
                ? "nicht installiert"
                : `${t3ChannelLabels[status.activeChannel]} · v${status.activeVersion ?? "?"}`}
          </span>
        </div>
        <div className="data-row px-0">
          <span className="text-muted">Eingestellt</span>
          <span className="font-mono text-text">
            {status ? t3ChannelLabels[status.configuredChannel] : "—"}
          </span>
        </div>
        <div className="data-row px-0">
          <span className="text-muted">Instanz auf Port {status?.port ?? 3773}</span>
          <Badge tone={status?.reachable ? "ok" : "warn"}>
            {status?.reachable ? "erreichbar" : "nicht erreichbar"}
          </Badge>
        </div>
      </div>
      {error ? (
        <p className="flex items-start gap-2 text-[12px] text-bad" role="alert">
          <WarningIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {status?.restartRequired ? (
        <div className="settings-update-row" role="status">
          <div>
            <strong>Neustart erforderlich</strong>
            <span>
              {t3ChannelLabels[status.configuredChannel]} ist gespeichert, läuft aber noch nicht. Der Kanal wird beim nächsten Neustart installiert und gestartet.
            </span>
          </div>
          <button type="button" className="quiet-button-primary" onClick={onJumpToRestart}>
            <UploadIcon className="h-3.5 w-3.5" /> Zu den Neustart-Buttons
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-faint">
          Alle T3-Flächen nutzen dieselbe Instanz. Threads und Daten bleiben beim Kanalwechsel erhalten.
        </p>
      )}
      <ConfirmDialog
        open={pendingDowngrade}
        title="Auf Stable wechseln?"
        description="Nightly kann die gemeinsame T3-Datenbank auf ein neueres Schema heben, das Stable nicht mehr lesen kann. Nach dem Wechsel können ältere Threads unter Umständen nicht mehr geöffnet werden."
        confirmLabel="Trotzdem wechseln"
        danger
        onConfirm={() => {
          setPendingDowngrade(false);
          void saveChannel("stable");
        }}
        onClose={() => setPendingDowngrade(false)}
      />
    </div>
  );
}

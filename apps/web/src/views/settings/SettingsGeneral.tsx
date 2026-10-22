import { usePwaInstall } from "../../lib/usePwaInstall";
import { Card } from "../../components/Card";
import { DownloadIcon, GitBranchIcon, RefreshIcon } from "../../components/icons";

interface SettingsGeneralProps {
  readonly version: string | undefined;
  readonly healthStatus: string | undefined;
}

export function SettingsGeneral({ version, healthStatus }: SettingsGeneralProps) {
  const pwa = usePwaInstall();
  const showInstall = pwa.canInstall && !pwa.isInstalled;
  return (
    <>
      <div id="settings-general-restart">
        <Card
          title="Wartung"
          action={<RefreshIcon className="h-4 w-4 text-faint" />}
        >
          <a className="quiet-button min-h-11" href="#einstellungen:system">Updates und Neustart öffnen</a>
        </Card>
      </div>

      <div id="settings-general-version">
        <Card
          title="Version"
          action={<GitBranchIcon className="h-4 w-4 text-faint" />}
        >
          <div className="flex items-center gap-3"><span className="text-xl font-medium tracking-tight text-text">{version ?? "—"}</span></div>
          {healthStatus ? <p className="mt-2 text-[12px] text-faint">Backend-Status: {healthStatus}</p> : null}
          {pwa.updateAvailable ? (
            <div className="settings-update-row" role="status">
              <div>
                <strong>Update verfügbar</strong>
                <span>Eine neue Wrapt-Version ist bereit.</span>
              </div>
              <button type="button" className="quiet-button-primary" onClick={() => void pwa.applyUpdate()}>
                <DownloadIcon className="h-3.5 w-3.5" /> Aktualisieren
              </button>
            </div>
          ) : null}
          {showInstall ? (
            <div className="mt-3">
              <button type="button" onClick={() => void pwa.install()} className="quiet-button-primary"><DownloadIcon className="h-3.5 w-3.5" /> App installieren</button>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}

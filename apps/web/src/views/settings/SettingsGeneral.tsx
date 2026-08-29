import type { ReactNode } from "react";
import { usePwaInstall } from "../../lib/usePwaInstall";
import { Card } from "../../components/Card";
import { DownloadIcon, GitBranchIcon, RefreshIcon } from "../../components/icons";
import { SystemRestartControls } from "../../components/SystemRestartControls";
import type { SettingsNavigationTarget } from "./settingsTabs";

interface SettingsGeneralProps {
  readonly version: string | undefined;
  readonly healthStatus: string | undefined;
  readonly onNavigate: (target: SettingsNavigationTarget) => void;
}

const quickLinks: readonly {
  readonly title: string;
  readonly description: string;
  readonly target: SettingsNavigationTarget;
  readonly icon: ReactNode;
}[] = [
  {
    title: "Design",
    description: "Themes und eigene Farben",
    target: { tab: "design", anchor: "settings-design" },
    icon: <span aria-hidden="true">01</span>,
  },
  {
    title: "Navigation",
    description: "Sidebar und sichtbare Seiten",
    target: { tab: "navigation", anchor: "settings-navigation" },
    icon: <span aria-hidden="true">02</span>,
  },
  {
    title: "Benachrichtigungen",
    description: "Toasts und Push",
    target: { tab: "benachrichtigungen", anchor: "settings-notifications" },
    icon: <span aria-hidden="true">03</span>,
  },
  {
    title: "Start-App",
    description: "Seite beim Öffnen",
    target: { tab: "start-app", anchor: "settings-start-app" },
    icon: <span aria-hidden="true">04</span>,
  },
];

export function SettingsGeneral({ version, healthStatus, onNavigate }: SettingsGeneralProps) {
  const pwa = usePwaInstall();
  return (
    <>
      <div id="settings-general">
        <Card title="Allgemein" subtitle="Die wichtigsten Bereiche und Systemaktionen an einem Ort">
          <p className="settings-general-intro">Wrapt speichert persönliche Einstellungen lokal in diesem Browser. Über die Schnellzugriffe gelangst du direkt zu den Bereichen, die du häufig verwaltest.</p>
          <div className="settings-general-facts" aria-label="Allgemeine Informationen">
            <div><span>Speicherung</span><strong>lokal im Browser</strong></div>
            <div><span>Theme</span><strong>sofort sichtbar</strong></div>
            <div><span>Status</span><strong>{healthStatus ?? "wird geprüft"}</strong></div>
          </div>
          <div className="settings-quick-links" aria-label="Schnellzugriff auf Einstellungsbereiche">
            {quickLinks.map((link) => (
              <button key={link.title} type="button" className="settings-quick-link" onClick={() => onNavigate(link.target)}>
                <span className="settings-quick-link-index">{link.icon}</span>
                <span><strong>{link.title}</strong><small>{link.description}</small></span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div id="settings-general-restart">
        <Card
          title="Systemfunktionen"
          subtitle="Frontend, Backend oder beide Dienste aktualisieren"
          action={<RefreshIcon className="h-4 w-4 text-faint" />}
        >
          <SystemRestartControls />
        </Card>
      </div>

      <div id="settings-general-install">
        <Card
          title="App installieren"
          subtitle="Für einen schnellen Zugriff vom Homescreen oder Desktop"
          action={<DownloadIcon className="h-4 w-4 text-faint" />}
        >
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
          {pwa.isInstalled ? (
            <p className="text-[13px] text-muted">Wrapt ist bereits als App installiert.</p>
          ) : pwa.canInstall ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void pwa.install()} className="quiet-button-primary"><DownloadIcon className="h-3.5 w-3.5" /> App installieren</button>
              <span className="text-[12px] text-faint">Öffnet den Installationsdialog des Browsers.</span>
            </div>
          ) : pwa.isAppleMobile ? (
            <p className="text-[13px] text-muted">In Safari auf <span className="text-text">Teilen</span> tippen und <span className="text-text">Zum Home-Bildschirm</span> wählen.</p>
          ) : (
            <p className="text-[13px] text-muted">Öffne Wrapt in Chrome oder Edge und wähle im Browsermenü <span className="text-text">App installieren</span>.</p>
          )}
        </Card>
      </div>

      <div id="settings-general-version">
        <Card
          title="Version"
          subtitle="Aktueller Release- und Backend-Status"
          action={<GitBranchIcon className="h-4 w-4 text-faint" />}
        >
          <div className="flex items-center gap-3"><span className="text-xl font-medium tracking-tight text-text">{version ?? "—"}</span><span className="settings-version-badge">Wrapt</span></div>
          {healthStatus ? <p className="mt-2 text-[12px] text-faint">Backend-Status: {healthStatus}</p> : null}
        </Card>
      </div>
    </>
  );
}

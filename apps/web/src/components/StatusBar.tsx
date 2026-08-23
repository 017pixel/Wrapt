import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { defaultContextMenuConfig, type ContextMenuConfigResponse, type ProviderUsage, type UsageMonitoring, type UsageProviderId } from "@wrapt/contracts";
import type { CSSProperties } from "react";
import { wraptQueries } from "../lib/queryOptions";
import { apiClient } from "../lib/apiClient";
import { Spinner, StateDot } from "./primitives";
import { useOrbitStore } from "../stores/orbit";
import { statusBarRegistry } from "../extensions/statusBarRegistry";
import { openGlobalContextMenu } from "./context-menu/contextMenuEvents";
import { hostContextMenuId } from "../extensions/hostContextMenus";

export type StatusBarProviderState = Pick<ProviderUsage, "providerId" | "status">;

export interface StatusBarUsageProvider {
  readonly providerId: ProviderUsage["providerId"];
  readonly label: string;
  readonly title: string;
}

/**
 * Die drei Usage Provider der Statusleiste kommen aus der Status-Bar-Registry
 * (Legacy Built-ins mit `usageProviderId`). Deaktivierte Provider gehören
 * nicht in die kompakte Limitanzeige; ohne Serverdaten bleiben alle sichtbar.
 */
export function visibleStatusBarProviders(providers: readonly StatusBarProviderState[] | undefined): StatusBarUsageProvider[] {
  const items = statusBarRegistry
    .getSnapshot()
    .right.filter(
      (item) => item.value.runtime.usageProviderId !== undefined,
    )
    .map((item) => ({
      providerId: item.value.runtime.usageProviderId as ProviderUsage["providerId"],
      label: item.value.contribution.title,
      title: item.value.runtime.usageProviderTitle ?? item.value.contribution.title,
    }));
  if (!providers) return items;
  return items.filter((definition) => providers.find((provider) => provider.providerId === definition.providerId)?.status !== "disabled");
}

export function compactAccountIdentity(value: string): string {
  const separator = value.lastIndexOf("@");
  if (separator <= 0) return value.length > 22 ? `${value.slice(0, 9)}…${value.slice(-9)}` : value;
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (local.length <= 12) return value;
  return `${local.slice(0, 4)}…${local.slice(-4)}@${domain}`;
}

function providerLimit(provider: ProviderUsage | undefined, compactAccounts = false, compactLabels = compactAccounts): string {
  if (!provider || provider.accounts.length === 0) return "nicht verfügbar";
  return provider.accounts.map((account) => {
    const windows = account.windows.filter((window) => window.windowMinutes === 300 || window.windowMinutes === 10_080 || window.windowMinutes === 43_200);
    const limits = windows.map((window) => {
      const label = window.windowMinutes === 300 ? "5h" : window.windowMinutes === 10_080 ? (compactLabels ? "W" : "Woche") : (compactLabels ? "M" : "Monat");
      return `${label} ${window.remainingPercent}%`;
    }).join(" · ") || (account.windows[0] ? `${account.windows[0].remainingPercent}% frei` : "keine Daten");
    const identity = account.email ?? account.label;
    return provider.accounts.length > 1 ? `${compactAccounts ? compactAccountIdentity(identity) : identity}${compactLabels ? " " : ": "}${limits}` : limits;
  }).join(" | ");
}

export function StatusBar() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const orbitDocument = useOrbitStore((state) => state.document);
  const orbitDirty = useOrbitStore((state) => state.dirty);
  const orbitSaving = useOrbitStore((state) => state.saving);
  const health = useQuery(wraptQueries.health());
  const usage = useQuery(wraptQueries.usage());
  const contextMenu = useQuery(wraptQueries.contextMenu());
  const usageMonitoring = useQuery(wraptQueries.usageMonitoring());
  const activeOrbitBoard = orbitDocument.boards.find((board) => board.id === orbitDocument.activeBoardId);
  const isOrbit = location.pathname === "/workbench";
  const codex = usage.data?.providers.find((provider) => provider.providerId === "codex");
  const opencode = usage.data?.providers.find((provider) => provider.providerId === "opencode");
  const claude = usage.data?.providers.find((provider) => provider.providerId === "claude");
  const providerById = { codex, opencode, claude } satisfies Record<ProviderUsage["providerId"], ProviderUsage | undefined>;
  const visibleProviders = visibleStatusBarProviders(usage.data?.providers);
  const menuConfig = contextMenu.data?.contextMenu ?? defaultContextMenuConfig;
  const monitoring = usageMonitoring.data?.monitoring ?? { codex: true, opencode: true, claude: true };
  const saveMenuConfig = async (next: typeof menuConfig) => {
    const response = await apiClient.saveContextMenu(next);
    if (response) queryClient.setQueryData<ContextMenuConfigResponse>(wraptQueries.contextMenu().queryKey, response);
  };
  const toggleProvider = async (providerId: UsageProviderId) => {
    const next: UsageMonitoring = { ...monitoring, [providerId]: !monitoring[providerId] };
    const response = await apiClient.saveUsageMonitoring(next);
    if (response) queryClient.setQueryData(wraptQueries.usageMonitoring().queryKey, response);
    void queryClient.invalidateQueries({ queryKey: ["usage"] });
  };
  const resetLimitDisplay = async () => {
    const nextMenuConfig = { ...menuConfig, statusBar: defaultContextMenuConfig.statusBar };
    const nextMonitoring: UsageMonitoring = { codex: true, opencode: true, claude: true };
    const [menuResponse, monitoringResponse] = await Promise.all([
      apiClient.saveContextMenu(nextMenuConfig),
      apiClient.saveUsageMonitoring(nextMonitoring),
    ]);
    if (menuResponse) queryClient.setQueryData<ContextMenuConfigResponse>(wraptQueries.contextMenu().queryKey, menuResponse);
    if (monitoringResponse) queryClient.setQueryData(wraptQueries.usageMonitoring().queryKey, monitoringResponse);
    void queryClient.invalidateQueries({ queryKey: ["usage"] });
  };
  const statusBarStyle = { "--status-limit-font-size": `${menuConfig.statusBar.fontSizePx}px` } as CSSProperties;

  return (
    <footer className="status-bar hidden md:flex">
      <span className="status-bar-item">
        {health.isLoading ? <Spinner /> : <StateDot state={health.isError ? "error" : "active"} />}
        <span className="status-bar-value font-mono">v{health.data?.version ?? "—"}</span>
      </span>
      {isOrbit ? (
        <>
          <span className="status-bar-divider" />
          <span className="status-bar-context">
            <span className="status-bar-item min-w-0"><span>Orbit</span><span className="status-bar-value truncate">{activeOrbitBoard?.name ?? "Arbeitsfläche"}</span></span>
            <span className="status-bar-divider" />
            <span className="status-bar-item"><span>{activeOrbitBoard?.nodes.length ?? 0} Knoten</span><span>{activeOrbitBoard?.edges.length ?? 0} Verbindungen</span><span className="status-bar-value">{orbitSaving ? "speichert…" : orbitDirty ? "ungespeichert" : "synchron"}</span></span>
          </span>
        </>
      ) : null}
      {visibleProviders.length > 0 ? (
        <Link
          to="/usage"
          className={`status-limits ${menuConfig.statusBar.alwaysShowLimits ? "is-always-visible" : ""}`}
          style={statusBarStyle}
          aria-label="Nutzung und Limits öffnen"
          title={menuConfig.statusBar.alwaysShowLimits ? undefined : visibleProviders.map((provider) => `${provider.title}: ${providerLimit(providerById[provider.providerId])}`).join("\n")}
          onContextMenu={(event) => openGlobalContextMenu(event, {
            surface: "host.context-menu.statusbar",
            title: "Nutzung und Limits",
            actions: [
              { id: hostContextMenuId("statusbar.usage"), onSelect: () => window.location.assign("/usage") },
              { id: hostContextMenuId("statusbar.font-increase"), disabled: menuConfig.statusBar.fontSizePx >= 20, onSelect: () => saveMenuConfig({ ...menuConfig, statusBar: { ...menuConfig.statusBar, fontSizePx: Math.min(20, Math.round(menuConfig.statusBar.fontSizePx * 1.05 * 10) / 10) } }) },
              { id: hostContextMenuId("statusbar.font-decrease"), disabled: menuConfig.statusBar.fontSizePx <= 10, onSelect: () => saveMenuConfig({ ...menuConfig, statusBar: { ...menuConfig.statusBar, fontSizePx: Math.max(10, Math.round(menuConfig.statusBar.fontSizePx * .95 * 10) / 10) } }) },
              { id: hostContextMenuId("statusbar.always-show"), checked: menuConfig.statusBar.alwaysShowLimits, onSelect: () => saveMenuConfig({ ...menuConfig, statusBar: { ...menuConfig.statusBar, alwaysShowLimits: !menuConfig.statusBar.alwaysShowLimits } }) },
              { id: hostContextMenuId("statusbar.codex"), checked: monitoring.codex, onSelect: () => toggleProvider("codex") },
              { id: hostContextMenuId("statusbar.opencode"), checked: monitoring.opencode, onSelect: () => toggleProvider("opencode") },
              { id: hostContextMenuId("statusbar.claude"), checked: monitoring.claude, onSelect: () => toggleProvider("claude") },
              { id: hostContextMenuId("statusbar.reset"), onSelect: resetLimitDisplay },
            ],
          })}
        >
          {visibleProviders.flatMap((provider, index) => [
            ...(index > 0 ? [<span key={`${provider.providerId}-divider`} className="status-bar-divider" aria-hidden="true" />] : []),
            <span key={provider.providerId}><strong>{menuConfig.statusBar.alwaysShowLimits ? provider.title : provider.label}</strong>{menuConfig.statusBar.alwaysShowLimits ? ":" : ""} {usage.isLoading ? "lädt…" : providerLimit(providerById[provider.providerId], true, !menuConfig.statusBar.alwaysShowLimits)}</span>,
          ])}
        </Link>
      ) : null}
    </footer>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { defaultContextMenuConfig, type ContextMenuConfigResponse, type ProviderUsage, type UsageMonitoring, type UsageProviderId } from "@wrapt/contracts";
import { useEffect, type CSSProperties } from "react";
import { preloadStatusArtwork } from "../lib/statusArtworkPreload";
import { wraptQueries } from "../lib/queryOptions";
import { apiClient } from "../lib/apiClient";
import { Spinner, StateDot } from "./primitives";
import { statusBarRegistry } from "../extensions/statusBarRegistry";
import { openGlobalContextMenu } from "./context-menu/contextMenuEvents";
import { hostContextMenuId } from "../extensions/hostContextMenus";
import { StatusMascot } from "./mascot/StatusMascot";
import { shortcutEvents } from "./shortcuts/shortcutEvents";
import { useStatusHoverCard } from "./status/useStatusHoverCard";
import { ChangelogHoverCard } from "./status/ChangelogHoverCard";
import { limitsCardProviders } from "./usage/usageLimitsCard";
import { UsageLimitsHoverCard } from "./usage/UsageLimitsHoverCard";

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

/**
 * Kompakter Systemstatus für kleine Viewports ohne Seitenleiste: Die
 * Desktop-Statusleiste ist dort ausgeblendet, Bedienung und Version bleiben
 * aber über eine einzeilige, umbrechende Region erreichbar — auch bei
 * 200 Prozent Textgröße.
 */
export function CompactSystemStatus() {
  const health = useQuery(wraptQueries.health());
  return (
    <div
      className="flex min-w-0 items-center gap-2 overflow-hidden px-3 py-1 text-xs text-muted"
      role="region"
      aria-label="Kompakter Systemstatus"
    >
      {health.isLoading ? <Spinner /> : <StateDot state={health.isError ? "error" : "active"} />}
      <span className="truncate font-mono">v{health.data?.version ?? "—"} · {health.isError ? "nicht erreichbar" : "bereit"}</span>
    </div>
  );
}

export function StatusBar() {
  const queryClient = useQueryClient();
  const health = useQuery(wraptQueries.health());
  const usage = useQuery(wraptQueries.usage());
  const contextMenu = useQuery(wraptQueries.contextMenu());
  const usageMonitoring = useQuery(wraptQueries.usageMonitoring());
  const mascot = useQuery(wraptQueries.mascot());
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
  const limitsHover = useStatusHoverCard();
  const versionHover = useStatusHoverCard();
  useEffect(() => {
    const handleShortcut = (event: Event) => {
      if (event.defaultPrevented || !limitsHover.anchor?.getClientRects().length) return;
      event.preventDefault();
      limitsHover.anchor.click();
    };
    window.addEventListener(shortcutEvents.limits, handleShortcut);
    return () => window.removeEventListener(shortcutEvents.limits, handleShortcut);
  }, [limitsHover.anchor]);
  // Zwei kleine Kopf-Motive früh dekodieren, damit auch direktes Öffnen aus
  // dem Cache zeichnet. Datensparmodus und Fehler behandelt der Preloader.
  useEffect(() => {
    preloadStatusArtwork("changelog");
    preloadStatusArtwork("usage");
  }, []);
  // Einmal pro Render-Takt: die Zeitbasis wird an einem Ort bestimmt, damit
  // alle Provider in der Karte dieselbe „jetzt"-Referenz benutzen.
  const cardProviders = limitsCardProviders(
    usage.data?.providers ?? [],
    visibleProviders.map((provider) => ({ providerId: provider.providerId, title: provider.title })),
    Date.now(),
  );

  return (
    <footer className={`status-bar hidden md:flex${mascot.data?.mascot.enabled === true ? " has-mascot" : ""}`}>
      <button
        type="button"
        ref={versionHover.triggerRef}
        className={`status-bar-item status-version${versionHover.open ? " is-open" : ""}`}
        aria-label="Changelog öffnen"
        aria-expanded={versionHover.open}
        onPointerEnter={() => { preloadStatusArtwork("changelog"); versionHover.onPointerEnter(); }}
        onFocus={() => preloadStatusArtwork("changelog")}
        onPointerDown={() => preloadStatusArtwork("changelog")}
        onPointerLeave={versionHover.onPointerLeave}
        onClick={() => { preloadStatusArtwork("changelog"); versionHover.toggle(); }}
      >
        {health.isLoading ? <Spinner /> : <StateDot state={health.isError ? "error" : "active"} />}
        <span className="status-bar-value font-mono">v{health.data?.version ?? "—"}</span>
        <span className="status-version-caret" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <StatusMascot />
      {(
        <Link
          to="/usage"
          ref={limitsHover.triggerRef}
          className={`status-limits ${limitsHover.open ? "is-open" : ""}`}
          style={statusBarStyle}
          aria-label="Nutzung und Limits öffnen"
          aria-expanded={limitsHover.open}
          // Kein `title`-Attribut: Der native Browser-Tooltip würde neben der
          // Card erscheinen und deren Inhalt doppelt, aber schlechter, zeigen.
          onPointerEnter={() => { preloadStatusArtwork("usage"); limitsHover.onPointerEnter(); }}
          onFocus={() => preloadStatusArtwork("usage")}
          onPointerDown={() => preloadStatusArtwork("usage")}
          onPointerLeave={limitsHover.onPointerLeave}
          onClick={(event) => {
            preloadStatusArtwork("usage");
            // Ein Klick öffnet oder schließt die Karte immer — er navigiert nie
            // direkt. Das `preventDefault()` muss in BEIDEN Zweigen stehen: Ohne
            // es führt der Router den Klick aus, die Karte wäre auf Touch
            // unerreichbar, weil die Navigation sofort gewinnt. Die
            // vollständige Auswertung bleibt der Fußlink in der Karte.
            if (limitsHover.open) {
              event.preventDefault();
              limitsHover.close();
              return;
            }
            event.preventDefault();
            limitsHover.toggle();
          }}
          onContextMenu={(event) => openGlobalContextMenu(event, {
            surface: "host.context-menu.statusbar",
            title: "Nutzung und Limits",
            actions: [
              { id: hostContextMenuId("statusbar.usage"), onSelect: () => window.location.assign("/usage") },
              { id: hostContextMenuId("statusbar.font-increase"), disabled: menuConfig.statusBar.fontSizePx >= 20, onSelect: () => saveMenuConfig({ ...menuConfig, statusBar: { ...menuConfig.statusBar, fontSizePx: Math.min(20, Math.round(menuConfig.statusBar.fontSizePx * 1.05 * 10) / 10) } }) },
              { id: hostContextMenuId("statusbar.font-decrease"), disabled: menuConfig.statusBar.fontSizePx <= 10, onSelect: () => saveMenuConfig({ ...menuConfig, statusBar: { ...menuConfig.statusBar, fontSizePx: Math.max(10, Math.round(menuConfig.statusBar.fontSizePx * .95 * 10) / 10) } }) },
              { id: hostContextMenuId("statusbar.codex"), checked: monitoring.codex, onSelect: () => toggleProvider("codex") },
              { id: hostContextMenuId("statusbar.opencode"), checked: monitoring.opencode, onSelect: () => toggleProvider("opencode") },
              { id: hostContextMenuId("statusbar.claude"), checked: monitoring.claude, onSelect: () => toggleProvider("claude") },
              { id: hostContextMenuId("statusbar.reset"), onSelect: resetLimitDisplay },
            ],
          })}
        >
          {visibleProviders.length === 0 ? <span>Limits</span> : null}
          {visibleProviders.flatMap((provider, index) => [
            ...(index > 0 ? [<span key={`${provider.providerId}-divider`} className="status-bar-divider" aria-hidden="true" />] : []),
            <span key={provider.providerId}><strong>{provider.label}</strong> {usage.isLoading ? "lädt…" : providerLimit(providerById[provider.providerId], true, true)}</span>,
          ])}
          <span className="status-limits-caret" aria-hidden="true">
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </Link>
      )}
      {limitsHover.open && limitsHover.anchor ? (
        <UsageLimitsHoverCard
          anchor={limitsHover.anchor}
          providers={cardProviders}
          updatedAt={usage.data?.lastSuccessfulFetchAt ?? null}
          onPointerEnter={limitsHover.onCardPointerEnter}
          onPointerLeave={limitsHover.onCardPointerLeave}
          onBlur={limitsHover.onCardBlur}
        />
      ) : null}
      {versionHover.open && versionHover.anchor ? (
        <ChangelogHoverCard
          anchor={versionHover.anchor}
          version={health.data?.version ?? null}
          onPointerEnter={versionHover.onCardPointerEnter}
          onPointerLeave={versionHover.onCardPointerLeave}
          onBlur={versionHover.onCardBlur}
        />
      ) : null}
    </footer>
  );
}

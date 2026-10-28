import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BrowserRouter, Navigate, Routes, useLocation } from "react-router";
import { PwaInstallProvider } from "./lib/usePwaInstall";
import { pageRouteRegistry } from "./extensions/pageRouteRegistry";
import { routeHostElements, RouteFallback } from "./extensions/routeHost";
import { subscribeAppPreferencesStorage } from "./stores/appPreferences";
import { EditorOpenBridge } from "./components/EditorOpenBridge";
import { ThemeRuntimeSync } from "./components/ThemeRuntimeSync";
import { PluginRuntimeSync } from "./extensions/pluginRuntimeSync";
import { CodePluginSync } from "./extensions/CodePluginSync";
import { CodePluginNotifications } from "./extensions/CodePluginNotifications";
import { useCodeUiRevision } from "./extensions/code-surface";
import { resolveCodePageRoutes } from "./extensions/code-routes";
import { WorkbenchShortcuts } from "./components/shortcuts/WorkbenchShortcuts";
import { SettingsSync } from "./components/SettingsSync";
import { ContextMenuProvider } from "./components/context-menu/ContextMenuProvider";
import { DashboardMetricsRuntime } from "./views/DashboardMetricsRuntime";
import { RoutePrefetchHost } from "./components/RoutePrefetchHost";
import { WorkspaceSwitchLanding } from "./components/workspaces/WorkspaceSwitchLanding";

/**
 * Der statische Router ist durch den Route Host ersetzt: Pages und Routes
 * kommen aus der Page-/Route-Registry (Legacy Built-ins), Standalone-,
 * Shell- und 404-Flächen bleiben hostgeschützt. Eine neu registrierte
 * Extension-Route erscheint ohne Änderung an dieser Datei.
 */
export function App() {
  useEffect(subscribeAppPreferencesStorage, []);
  const [pluginRoutesReady, setPluginRoutesReady] = useState(false);
  const [codeRoutesReady, setCodeRoutesReady] = useState(false);
  const markCodeRoutesReady = useCallback(() => setCodeRoutesReady(true), []);
  const uiRevision = useCodeUiRevision();
  const markPluginRoutesReady = useCallback(() => setPluginRoutesReady(true), []);
  const snapshot = useSyncExternalStore(
    pageRouteRegistry.subscribe,
    pageRouteRegistry.getSnapshot,
  );
  const routes = useMemo(() => routeHostElements(resolveCodePageRoutes(snapshot, uiRevision)), [snapshot, uiRevision]);
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
  return (
    <PwaInstallProvider>
      <BrowserRouter basename={basename}>
        {/* Global, außerhalb der Routen: gilt auch auf Standalone-Werkzeugseiten. */}
        <ContextMenuProvider>
          <WorkbenchShortcuts />
          <EditorOpenBridge />
          <ThemeRuntimeSync />
          <SettingsSync />
          <PluginRuntimeSync onReady={markPluginRoutesReady} />
          <CodePluginSync onReady={markCodeRoutesReady} />
          <CodePluginNotifications />
          <DashboardMetricsRuntime />
          <RoutePrefetchHost />
          <WorkspaceSwitchLanding pluginRoutesReady={pluginRoutesReady && codeRoutesReady}>
            <HomeRedirect />
            {pluginRoutesReady && codeRoutesReady ? <Routes>{routes}</Routes> : <RouteFallback />}
          </WorkspaceSwitchLanding>
        </ContextMenuProvider>
      </BrowserRouter>
    </PwaInstallProvider>
  );
}

/** Alte Inbox-Links führen weiterhin zum Dashboard. */
export function HomeRedirect() {
  const location = useLocation();
  return location.pathname === "/inbox" ? <Navigate to="/" replace /> : null;
}

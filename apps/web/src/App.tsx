import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BrowserRouter, Navigate, Routes, useLocation } from "react-router";
import { PwaInstallProvider } from "./lib/usePwaInstall";
import { pageRouteRegistry } from "./extensions/pageRouteRegistry";
import { routeHostElements } from "./extensions/routeHost";
import { pagePreferenceAliases } from "./extensions/pagePreferenceAliases";
import { notesPagePreferenceAliases } from "./extensions/notesBuiltins";
import { useAppPreferences } from "./stores/appPreferences";
import { isPageVisibleIn, useSidebarPreferences } from "./stores/sidebarPreferences";
import { EditorOpenBridge } from "./components/EditorOpenBridge";
import { ThemeRuntimeSync } from "./components/ThemeRuntimeSync";
import { PluginRuntimeSync } from "./extensions/pluginRuntimeSync";
import { ContextMenuProvider } from "./components/context-menu/ContextMenuProvider";
import { DashboardMetricsRuntime } from "./views/DashboardMetricsRuntime";
import { RoutePrefetchHost } from "./components/RoutePrefetchHost";
import { hasWorkspaceSwitchFragment, WorkspaceSwitchLanding } from "./components/workspaces/WorkspaceSwitchLanding";

/**
 * Der statische Router ist durch den Route Host ersetzt: Pages und Routes
 * kommen aus der Page-/Route-Registry (Legacy Built-ins), Standalone-,
 * Shell- und 404-Flächen bleiben hostgeschützt. Eine neu registrierte
 * Extension-Route erscheint ohne Änderung an dieser Datei.
 */
export function App() {
  const [pluginRoutesReady, setPluginRoutesReady] = useState(false);
  const markPluginRoutesReady = useCallback(() => setPluginRoutesReady(true), []);
  const snapshot = useSyncExternalStore(
    pageRouteRegistry.subscribe,
    pageRouteRegistry.getSnapshot,
  );
  const routes = useMemo(() => routeHostElements(snapshot), [snapshot]);
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
  return (
    <PwaInstallProvider>
      <BrowserRouter basename={basename}>
        {/* Global, außerhalb der Routen: gilt auch auf Standalone-Werkzeugseiten. */}
        <ContextMenuProvider>
          <EditorOpenBridge />
          <ThemeRuntimeSync />
          <PluginRuntimeSync onReady={markPluginRoutesReady} />
          <DashboardMetricsRuntime />
          <RoutePrefetchHost />
          <WorkspaceSwitchLanding pluginRoutesReady={pluginRoutesReady}>
            <HomeRedirect />
            <Routes>{routes}</Routes>
          </WorkspaceSwitchLanding>
        </ContextMenuProvider>
      </BrowserRouter>
    </PwaInstallProvider>
  );
}

/**
 * Persistierte Preference-Keys bleiben stabil. Die Built-in-Aliase sind
 * eingefroren; neue Seiten bringen ihren Alias in einem eigenen Modul mit.
 */
const allPagePreferenceAliases = {
  ...pagePreferenceAliases,
  ...notesPagePreferenceAliases,
};

/**
 * Leitet den Root-Pfad auf die eingestellte Standard-Seite weiter, sobald eine
 * andere als das Dashboard gewählt wurde. Der Redirect greift nur auf "/" —
 * direkte Links und die Navigation bleiben unberührt.
 */
export function HomeRedirect() {
  const location = useLocation();
  const arrival = useRef({ key: location.key, switching: hasWorkspaceSwitchFragment(location.hash) });
  const snapshot = useSyncExternalStore(
    pageRouteRegistry.subscribe,
    pageRouteRegistry.getSnapshot,
  );
  const defaultPage = useAppPreferences((state) => state.defaultPage);
  const hiddenPages = useSidebarPreferences((state) => state.hiddenPages);
  const routes = snapshot.routes;
  const target = useMemo(() => {
    if (defaultPage === "dashboard" || !isPageVisibleIn(hiddenPages, defaultPage)) {
      return null;
    }
    const pageId = allPagePreferenceAliases[defaultPage];
    if (pageId === undefined) return null;
    const route = routes.find(
      (entry) => entry.value.contribution.pageId === pageId,
    );
    return route === undefined ? null : route.value.contribution.path;
  }, [defaultPage, hiddenPages, routes]);

  if (location.pathname === "/inbox") return <Navigate to="/" replace />;
  if (location.state?.workspaceSwitch || (arrival.current.switching && arrival.current.key === location.key)) return null;
  if (location.pathname !== "/" || target === null || target === "/") {
    return null;
  }
  return <Navigate to={target} replace />;
}

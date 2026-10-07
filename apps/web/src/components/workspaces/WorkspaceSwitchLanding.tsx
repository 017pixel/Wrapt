import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { matchPath, matchRoutes, Navigate, useLocation } from "react-router";
import { navigationRegistry } from "../../extensions/navigationRegistry";
import { pageRouteRegistry } from "../../extensions/pageRouteRegistry";
import { RouteFallback } from "../../extensions/routeHost";
import { isPageVisibleIn, useSidebarPreferences, type PageRouteId } from "../../stores/sidebarPreferences";
import { WORKSPACES_FRAGMENT_KEY } from "./workspaceModel";

export function hasWorkspaceSwitchFragment(hash: string): boolean {
  return new URLSearchParams(hash.replace(/^#/, "")).has(WORKSPACES_FRAGMENT_KEY);
}

/** Prüft die Zielinstanz, bevor eine ausgeblendete oder fehlende Seite lädt. */
export function WorkspaceSwitchLanding({ children, pluginRoutesReady = true }: { children: ReactNode; pluginRoutesReady?: boolean }) {
  const location = useLocation();
  const arrival = useRef({ key: location.key, switching: hasWorkspaceSwitchFragment(location.hash) });
  const pages = useSyncExternalStore(pageRouteRegistry.subscribe, pageRouteRegistry.getSnapshot);
  const navigation = useSyncExternalStore(navigationRegistry.subscribe, navigationRegistry.getSnapshot);
  const hiddenPages = useSidebarPreferences((state) => state.hiddenPages);

  if (!arrival.current.switching || arrival.current.key !== location.key || location.pathname === "/") return children;
  const pluginTool = location.pathname.startsWith("/plugins/tool/");
  if (pluginTool && !pluginRoutesReady) return <RouteFallback />;

  const routeId = matchRoutes(pages.routes.flatMap((route) =>
    [route.value.contribution.path, ...(route.value.contribution.aliases ?? [])]
      .map((path) => ({ path, id: route.contributionId })),
  ), location.pathname)?.at(-1)?.route.id;
  const route = pages.routes.find((entry) => entry.contributionId === routeId);
  const items = navigation.items.filter((item) => item.ownerId === route?.ownerId);
  const item = items.find((entry) => entry.value.contribution.routeId === routeId)
    ?? items.filter((entry) => matchPath({ path: entry.value.route.path, end: false }, location.pathname))
      .sort((left, right) => right.value.route.path.length - left.value.route.path.length)[0]
    ?? (items.length === 1 ? items[0] : undefined);
  const visibilityKey = item?.value.runtime.legacyVisibilityKey;
  const visible = visibilityKey === undefined
    ? item?.value.contribution.visibleByDefault !== false
    : isPageVisibleIn(hiddenPages, visibilityKey as PageRouteId);
  const available = route && (!pluginTool || route.ownerId.startsWith("wrapt.plugin."))
    && pages.pages.some((page) => page.contributionId === route.value.contribution.pageId);

  if (available && visible) return children;
  // Das Fragment bleibt bis zur Registry-Synchronisation im Dashboard erhalten.
  return <Navigate to={{ pathname: "/", hash: location.hash }} state={{ workspaceSwitch: true }} replace />;
}

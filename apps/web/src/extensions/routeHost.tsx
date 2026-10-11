import {
  lazy,
  Suspense,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { Link, Navigate, Route, useLocation } from "react-router";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { AppShell } from "../components/AppShell";
import type {
  OwnedPageRegistration,
  OwnedRouteRegistration,
  PageRouteRegistrySnapshot,
  PageRuntimeBinding,
} from "./pageRouteRegistry";

export function RouteFallback() {
  return <div className="route-skeleton" aria-label="Ansicht wird geladen"><span /><span /><span /></div>;
}

export function NotFound() {
  return (
    <main className="route-not-found">
      <span>404</span>
      <h1>Diese Seite gibt es nicht</h1>
      <p>Der Link ist ungültig oder die Ansicht wurde verschoben.</p>
      <Link to="/">Zum Dashboard</Link>
    </main>
  );
}

// Eigene Boundary je Route: stürzt eine Ansicht ab, bleiben Sidebar und Navigation bedienbar.
//
// Der key ist bewusst der Pfad beim *Einhängen* und nicht die laufende Adresse.
// Mit `location.pathname` wechselte er bei jeder Navigation für jede geparkte
// Route mit — React warf damit sämtliche zwischengespeicherten Ansichten weg und
// baute sie neu auf. Genau deshalb luden T3 Code, Terminal und Code-Server bei
// jedem Wechsel neu, obwohl der PersistentOutlet sie hielt. Nach einem Absturz
// setzt die Boundary sich über ihren eigenen Knopf „Erneut versuchen" zurück.
export function DeferredRoute({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  const location = useLocation();
  const mountedPath = useRef(location.pathname);
  return (
    <ErrorBoundary key={mountedPath.current} label="Diese Ansicht" onRetry={onRetry}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * Routen-Variante von DeferredRoute: Die Lazy-Seite wird bei jedem Render über
 * den Cache aufgelöst. Schlägt der Import fehl und der Nutzer drückt „Erneut
 * versuchen", leert die Boundary zuerst den Lazy-Cache und hängt die Route
 * danach mit neuem Schlüssel ein — der Import startet damit wirklich neu,
 * statt die abgelehnte Promise erneut zu werfen.
 */
export function DeferredPageRoute({ page }: { page: OwnedPageRegistration }) {
  const [salt, setSalt] = useState(0);
  const Page = pageComponent(page);
  return (
    <DeferredRoute
      key={salt}
      onRetry={() => {
        invalidateLazyPageCache();
        setSalt((current) => current + 1);
      }}
    >
      <Page />
    </DeferredRoute>
  );
}

type RouteModule = Record<string, ComponentType>;

interface CachedLazyPage {
  load: PageRuntimeBinding["load"];
  component: LazyExoticComponent<ComponentType>;
}

const lazyPageCache = new Map<string, CachedLazyPage>();

/**
 * Verwirft alle zwischengespeicherten Lazy-Seiten. Die Boundary ruft das beim
 * manuellen Retry auf (siehe DeferredPageRoute): Ohne das würde dieselbe
 * abgelehnte lazy()-Komponente sofort erneut werfen und „Erneut versuchen"
 * wirkungslos blinken.
 */
export function invalidateLazyPageCache(): void {
  lazyPageCache.clear();
}

/**
 * Löst die Page-Komponente einer Registrierung auf. Eager-Pages kommen aus
 * dem bereits importierten Modul (kein Suspense-Zwischenrahmen), Lazy-Pages
 * über eine pro Contribution-ID stabile lazy()-Komponente, damit die
 * Persistent-Route-Semantik beim Snapshot-Wechsel unangetastet bleibt.
 * Ändert sich der Loader (Re-Registrierung nach Dispose), entsteht eine
 * neue lazy()-Komponente statt einer veralteten Bindung.
 */
export function pageComponent(page: OwnedPageRegistration): ComponentType {
  const runtime = page.value.runtime;
  if (runtime.loading === "eager" && runtime.eagerModule !== undefined) {
    const module = runtime.eagerModule as RouteModule;
    return module[runtime.exportName] as ComponentType;
  }
  const cached = lazyPageCache.get(page.contributionId);
  if (cached !== undefined && cached.load === runtime.load) {
    return cached.component;
  }
  const component = lazy(() =>
    runtime.load().then((module) => ({
      default: (module as RouteModule)[runtime.exportName] as ComponentType,
    })),
  );
  lazyPageCache.set(page.contributionId, { load: runtime.load, component });
  return component;
}

function routeElement(
  _route: OwnedRouteRegistration,
  page: OwnedPageRegistration,
): ReactNode {
  return <DeferredPageRoute page={page} />;
}

export function CanonicalAliasRedirect({ target }: { target: string }) {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: target, search: location.search, hash: location.hash }}
      replace
    />
  );
}

function aliasElements(
  route: OwnedRouteRegistration,
  page: OwnedPageRegistration,
): ReactNode[] {
  const aliases = route.value.contribution.aliases ?? [];
  if (route.value.runtime.aliasBehavior === "redirect-to-canonical") {
    return aliases.map((alias) => (
      <Route
        key={`alias:${alias}`}
        path={alias.replace(/^\//, "")}
        element={<CanonicalAliasRedirect target={route.value.contribution.path} />}
      />
    ));
  }
  return aliases.map((alias) => (
    <Route
      key={`alias:${alias}`}
      path={alias.replace(/^\//, "")}
      element={routeElement(route, page)}
    />
  ));
}

/**
 * Erzeugt die React-Router-Struktur aus dem PageRouteRegistry-Snapshot.
 * Standalone-Routen liegen außerhalb, alle übrigen Routen in der
 * App-Shell-Layout-Route; der 404-Fallback bleibt hostgeschützt.
 */
export function routeHostElements(snapshot: PageRouteRegistrySnapshot): ReactNode {
  const pagesById = new Map(
    snapshot.pages.map((page) => [page.contributionId, page]),
  );

  const standalone = snapshot.routes.filter(
    (route) => route.value.contribution.shell === "standalone",
  );
  const shellRoutes = snapshot.routes.filter(
    (route) => route.value.contribution.shell !== "standalone",
  );

  const standaloneElements = standalone.flatMap((route) => {
    const page = pagesById.get(route.value.contribution.pageId);
    if (page === undefined) return [];
    return [
      <Route
        key={route.contributionId}
        path={route.value.contribution.path.replace(/^\//, "")}
        element={routeElement(route, page)}
      />,
    ];
  });

  const shellElements = shellRoutes.flatMap((route) => {
    const page = pagesById.get(route.value.contribution.pageId);
    if (page === undefined) return [];
    const path = route.value.contribution.path.replace(/^\//, "");
    const isIndex = path === "";
    return [
      <Route
        key={route.contributionId}
        {...(isIndex
          ? { index: true as const }
          : { path })}
        element={routeElement(route, page)}
      />,
      ...aliasElements(route, page),
    ];
  });

  return (
    <>
      {standaloneElements}
      <Route element={<AppShell />}>
        {shellElements}
        <Route path="*" element={<DeferredRoute><NotFound /></DeferredRoute>} />
      </Route>
    </>
  );
}

export type { PageRouteRegistrySnapshot };

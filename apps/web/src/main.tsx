import "./lib/zodConfig";
import "./lib/startupErrors";
import "./lib/startupArtwork";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { bootstrapBuiltinContributions } from "./extensions/builtinContributions";
import { addBreadcrumb, formatQueryErrorBreadcrumb, subscribeToCrash } from "./lib/crashReport";
import { apiClient } from "./lib/apiClient";
import { loadHostCapabilities } from "./lib/hostCapabilities";
import { initializeOverlayTransparency } from "./lib/overlayTransparency";
import { synchronizeExistingPushDevice } from "./lib/webPushDevice";
import { retryQuery, queryRetryDelay } from "./lib/queryPolicy";
import { WorkbenchAccess } from "./components/WorkbenchAccess";
import "./index.css";
import "./views/dashboard-layout.css";
import "./visual-system.css";
import "./components/usage/usage-mobile.css";
import "./components/usage/usage-filters.css";
import "./components/usage/usage-limits-card.css";
import "./components/status/status-hover-card.css";
import "./components/status/changelog-card.css";
import "./components/usage/account-list.css";
import "./components/mobile/mobile-experience.css";
import "./components/overlay-glass.css";

initializeOverlayTransparency();

// Der alte Browser-Verlauf des Dashboards wird nicht mehr gelesen. Alte
// Messpunkte aus vorherigen Versionen können entfernt werden.
try {
  window.localStorage.removeItem("wrapt.dashboard.metrics-history.v1");
} catch {
  // Privater Modus oder blockierter Speicher dürfen den Start nicht stoppen.
}

// App, Crash-Dialog und ErrorBoundary bleiben dynamisch. Ein statischer Import
// zieht die von ihnen importierten CSS-Dateien vor `index.css` in den Graph.
// Dann registriert sich `@layer components` vor `theme` und `base`, und der
// Browser-Reset (padding, margin, border) überschreibt das komplette Design.
// Der zusätzliche Roundtrip wird über den modulepreload-Link aus
// `wraptAppPreloadPlugin` in index.html abgefangen.
const [{ App }, { CrashReportDialog, CrashToastRegion }, { ErrorBoundary }] = await Promise.all([
  import("./App"),
  import("./components/CrashReportDialog"),
  import("./components/ErrorBoundary"),
]);
// Vor dem Registrieren der Built-ins klären, welche optionalen Werkzeuge der
// Server überhaupt anbietet. Ohne Antwort bleibt OpenCode Web aus.
await loadHostCapabilities();
bootstrapBuiltinContributions();

const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Der Frontend-Mount-Punkt #root fehlt.");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: retryQuery, retryDelay: queryRetryDelay, refetchOnWindowFocus: false },
  },
});

subscribeToCrash((report) => {
  if (!report) return;
  void apiClient.createCrashNotification({
    title: "Frontend-Absturz", body: report.message.slice(0, 1_000), link: report.route.startsWith("/wrapt/") ? report.route : "/wrapt/",
    remoteId: `crash:${report.id}`,
    report: {
      message: report.message, stack: [report.stack, report.componentStack].filter(Boolean).join("\n\n") || null,
      context: { Route: report.route, Art: report.kind, Zeitpunkt: report.occurredAt }, logs: report.breadcrumbs,
      environment: { UserAgent: navigator.userAgent, Viewport: `${window.innerWidth}x${window.innerHeight}` },
    },
  }).catch(() => undefined);
});

// Fehlgeschlagene Abfragen als Breadcrumb — im Crash-Report sieht man dann,
// ob dem Absturz ein Backend-Problem vorausging. Der Schlüssel ist gekürzt und
// geschwärzt, damit keine E-Mails oder Pfade im Verlauf landen.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== "updated" || event.query.state.status !== "error") return;
  addBreadcrumb(formatQueryErrorBreadcrumb(event.query.queryKey, event.query.state.error));
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Der Dialog steht außerhalb der Boundary — er muss auch dann noch rendern,
          wenn die gesamte App beim Rendern abgestürzt ist. */}
      <CrashReportDialog />
      <CrashToastRegion />
      <ErrorBoundary label="Wrapt">
        <WorkbenchAccess><App /></WorkbenchAccess>
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const base = import.meta.env.BASE_URL;
  const removeLegacyProductWorkers = async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async (registration) => {
      try {
        const scope = new URL(registration.scope);
        if (scope.origin === window.location.origin && scope.pathname === "/workbench/") await registration.unregister();
      } catch {
        // Eine einzelne beschädigte Registrierung darf den neuen Worker nicht blockieren.
      }
    }));
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => /^(?:workbench-|remote-workplace-)/i.test(name)).map((name) => caches.delete(name)));
    }
  };
  const registerProductWorker = () => {
    void removeLegacyProductWorkers().catch(() => undefined).then(() => navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: "none" })).then(async (registration) => {
      // Ein bereits fertig installiertes Update übernehmen. register() prüft
      // sw.js ungecached; ein noch installierender Worker wird beim nächsten
      // App-Start als waiting erkannt, ohne einen Reload zu blockieren.
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      await synchronizeExistingPushDevice();
    }).catch(() => undefined);
  };
  // Top-Level-Imports können den Modulstart bis hinter das load-Event
  // verschieben. In diesem Fall würde ein ausschließliches load-Listener-
  // Setup die PWA-Registrierung dauerhaft verpassen.
  if (document.readyState === "complete") registerProductWorker();
  else window.addEventListener("load", registerProductWorker, { once: true });
}

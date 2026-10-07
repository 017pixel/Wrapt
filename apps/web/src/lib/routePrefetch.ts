import type { QueryClient } from "@tanstack/react-query";
import { wraptQueries } from "./queryOptions";
import { prefetchRoute } from "./routeModules";
import { pageRouteRegistry } from "../extensions/pageRouteRegistry";

/**
 * Zu einer Route gehört nicht nur ihr JavaScript-Bündel, sondern auch ihr
 * erster Datenabruf. Ohne Vorladen passiert beides nacheinander: erst lädt der
 * Chunk, dann wird die Ansicht eingehängt, und erst dann startet die Anfrage.
 * Auf dem Handy summiert sich das zu einer spürbaren Wartezeit.
 *
 * `prefetchQuery` beachtet die `staleTime` der jeweiligen Abfrage — ein
 * frischer Cache löst also keine zusätzliche Anfrage aus.
 */
type WarmRoute = (client: QueryClient, path: string) => Promise<unknown>;

function quiet(promise: Promise<unknown> | undefined): void {
  if (promise) void promise.catch(() => undefined);
}

function projectIdFromPath(path: string): string | null {
  const match = /^\/projects\/([^/?#]+)/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function noteIdFromHref(href: string): string | null {
  const queryIndex = href.indexOf("?");
  if (queryIndex < 0) return null;
  const params = new URLSearchParams(href.slice(queryIndex + 1));
  return params.get("note");
}

const dataLoaders: Array<[prefix: string, warm: WarmRoute]> = [
  ["/usage", (client) => client.prefetchQuery(wraptQueries.usageDashboard("30d"))],
  ["/usage", (client) => client.prefetchQuery(wraptQueries.accounts())],
  ["/projects", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/projects", (client) => client.prefetchQuery(wraptQueries.services())],
  ["/orbit", (client) => client.prefetchQuery(wraptQueries.orbit())],
  ["/orbit", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/workbench", (client) => client.prefetchQuery(wraptQueries.orbit())],
  ["/files", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/gallery", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/terminal", (client) => client.prefetchQuery(wraptQueries.terminalSessions())],
  ["/terminal", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/codex", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/claude", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/opencode", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/t3-code", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/code-editor", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/previews", (client) => client.prefetchQuery(wraptQueries.projects())],
  ["/previews", (client) => client.prefetchQuery(wraptQueries.previewDevServers())],
  ["/settings", (client) => client.prefetchQuery(wraptQueries.dashboardConfig())],
  ["/plugins", (client) => client.prefetchQuery(wraptQueries.extensionCatalog())],
  ["/plugins", (client) => client.prefetchQuery(wraptQueries.pluginDrafts())],
  ["/hermes-agent", (client) => client.prefetchQuery(wraptQueries.hermesStatus())],
  ["/notizen", (client) => client.prefetchQuery(wraptQueries.notesList())],
  ["/orbit/notizen", (client) => client.prefetchQuery(wraptQueries.notesList())],
  ["/", (client) => client.prefetchQuery(wraptQueries.dashboardConfig())],
];

/** Entfernt den Router Basename, damit Hover Pfade in Dev und Prod gleich matchen. */
function stripBasename(pathname: string): string {
  if (pathname === "/wrapt") return "/";
  if (pathname.startsWith("/wrapt/")) return pathname.slice("/wrapt".length) || "/";
  return pathname;
}

function prefetchRegistryPage(pathname: string): void {
  const match = pageRouteRegistry.matchRoute(pathname);
  if (!match) return;
  const page = pageRouteRegistry
    .getSnapshot()
    .pages.find((entry) => entry.contributionId === match.route.value.contribution.pageId);
  if (!page) return;
  try {
    const result = page.value.runtime.load();
    if (result instanceof Promise) void result.catch(() => undefined);
  } catch {
    // Absichtlich still: Hover darf nie Fehler werfen.
  }
}

/** Lädt Bündel und Startdaten der Zielroute vor. Fehler bleiben absichtlich still. */
export function prefetchRouteTarget(client: QueryClient, href: string): void {
  const rawPath = href.startsWith("/") ? href.split(/[?#]/)[0]! : `/${href.split(/[?#]/)[0]}`;
  const pathname = stripBasename(rawPath);
  prefetchRoute(pathname);
  prefetchRegistryPage(pathname);
  for (const [prefix, warm] of dataLoaders) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`) || (prefix === "/projects" && pathname === "/projects")) {
      quiet(warm(client, pathname));
    }
  }
  const projectId = projectIdFromPath(pathname);
  if (projectId) {
    quiet(client.prefetchQuery(wraptQueries.project(projectId)));
    quiet(client.prefetchQuery(wraptQueries.previewDevServer(projectId)));
  }
  const noteId = noteIdFromHref(href);
  if (noteId) quiet(client.prefetchQuery(wraptQueries.note(noteId)));
}

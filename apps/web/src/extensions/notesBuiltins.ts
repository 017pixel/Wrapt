import {
  extensionIdSchema,
  navigationContributionSchema,
  pageContributionSchema,
  routeContributionSchema,
  type ExtensionId,
  type RouteContribution,
} from "@wrapt/extension-contracts";
import { NoteIcon } from "../components/icons";
import { loadNotes, loadRouteWithRecovery } from "../lib/routeModules";
import {
  navigationRegistry,
  type NavigationRegistration,
} from "./navigationRegistry";
import {
  pageRouteRegistry,
  type PageRouteOwnerBatch,
  type PageRuntimeBinding,
  type RouteRuntimeBinding,
} from "./pageRouteRegistry";

/**
 * Eigene Registrierung des Notizen-Features (Page, Routen, Navigation).
 * Bewusst als getrenntes Modul: Die historischen Legacy-Built-ins sind
 * eingefroren und dürfen nicht weiter wachsen. Der Compatibility-Boundary
 * ruft `bootstrapNotesBuiltins()` direkt auf.
 */

const NOTES_OWNER_ID = extensionIdSchema.parse("wrapt.notes");

function notesPageRuntime(exportName: string): PageRuntimeBinding {
  return Object.freeze({
    chunkId: "notes",
    exportName,
    loading: "lazy",
    recovery: "stale-chunk",
    load: () => loadRouteWithRecovery(loadNotes),
  });
}

function notesRouteRuntime(prefetchPathPrefix?: string): RouteRuntimeBinding {
  return Object.freeze({
    boundary: "deferred-route",
    aliasBehavior: "render",
    ...(prefetchPathPrefix === undefined ? {} : { prefetchPathPrefix }),
  });
}

const notesMainRoute: RouteContribution = routeContributionSchema.parse({
  id: "wrapt.notes.route.main",
  pageId: "wrapt.notes.page.main",
  path: "/notizen",
  aliases: ["/orbit/notizen"],
  shell: "full-bleed",
  persistent: true,
  prefetch: "idle",
  projectContext: false,
  topbar: true,
  breadcrumbs: false,
  standaloneActions: false,
  mobileNavigation: true,
});

const notesWindowRoute: RouteContribution = routeContributionSchema.parse({
  id: "wrapt.notes.route.window",
  pageId: "wrapt.notes.page.window",
  path: "/notizen/fenster/:noteId",
  shell: "standalone",
  persistent: false,
  prefetch: "idle",
  projectContext: false,
  topbar: false,
  breadcrumbs: false,
  standaloneActions: false,
  mobileNavigation: false,
});

const notesBatch: PageRouteOwnerBatch = Object.freeze({
  pages: Object.freeze([
    Object.freeze({
      contribution: pageContributionSchema.parse({
        id: "wrapt.notes.page.main",
        title: "Notes",
        description: "Notion-artige Notizen mit Markdown",
      }),
      runtime: notesPageRuntime("Notes"),
    }),
    Object.freeze({
      contribution: pageContributionSchema.parse({
        id: "wrapt.notes.page.window",
        title: "Notizfenster",
      }),
      runtime: notesPageRuntime("NotesWindowRoute"),
    }),
  ]),
  routes: Object.freeze([
    Object.freeze({ contribution: notesMainRoute, runtime: notesRouteRuntime("/notizen") }),
    Object.freeze({ contribution: notesWindowRoute, runtime: notesRouteRuntime("/notizen/fenster/") }),
  ]),
});

const notesNavigation: readonly NavigationRegistration[] = Object.freeze([
  Object.freeze({
    contribution: navigationContributionSchema.parse({
      id: "wrapt.notes.navigation.main",
      routeId: "wrapt.notes.route.main",
      label: "Notes",
      description: "Notion-artige Notizen mit Markdown",
      icon: "extension",
      group: "workspace",
      order: 40,
      visibleByDefault: true,
    }),
    runtime: Object.freeze({
      icon: NoteIcon,
      preferenceKey: "notizen" as const,
    }),
  }),
]);

/** Preference-Alias, damit „Notes“ als Standardseite funktioniert. */
export const notesPagePreferenceAliases = Object.freeze({
  notizen: "wrapt.notes.page.main",
});

export function registerNotesBuiltins(ownerId: ExtensionId = NOTES_OWNER_ID): void {
  pageRouteRegistry.replaceOwner(ownerId, notesBatch);
  navigationRegistry.replaceOwner(ownerId, notesNavigation);
}

let bootstrapped = false;

export function bootstrapNotesBuiltins(): void {
  if (bootstrapped) return;
  registerNotesBuiltins();
  bootstrapped = true;
}
